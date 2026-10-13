const crypto = require('node:crypto');

const PLAY_BOUNDS = Object.freeze({ xMin: 44, xMax: 756, yMin: 120, yMax: 460 });
const ARENA = Object.freeze({ width: 800, height: 520, playBounds: PLAY_BOUNDS });
const MAX_HEALTH = 20;
const RADIUS = 22;
const SPEED = 175;
const INPUT_TTL = 250;
const HISTORY_LIMIT = 20;
const requestId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{12,80}$/.test(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class BrawlError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; this.brawlError = true; }
}

function createChallenge({ tableId, challengerId, targetId, names, at }) {
  return { id: crypto.randomUUID(), tableId, challengerId, targetId, players: [challengerId, targetId], names,
    status: 'pending', expiresAt: at + 20_000, version: 1, actionIds: new Set(), actionHistory: [], fighters: {}, lastTick: at };
}

function finish(row, reason, winnerId = null, at) {
  if (!row || row.status === 'finished') return false;
  Object.assign(row, { status: 'finished', reason, winnerId, finishedAt: at });
  for (const fighter of Object.values(row.fighters)) { fighter.dx = 0; fighter.dy = 0; fighter.inputUntil = 0; }
  row.version++;
  return true;
}

function accept(row, at) {
  row.status = 'active'; row.startsAt = at + 3000; row.endsAt = row.startsAt + 45_000; row.lastTick = at;
  row.fighters = Object.fromEntries(row.players.map((id, index) => [id, {
    id, health: MAX_HEALTH, x: index ? 580 : 220, y: 260, facingX: index ? -1 : 1, facingY: 0,
    dx: 0, dy: 0, inputUntil: 0, inputSeq: -1, attackReadyAt: row.startsAt, dashReadyAt: row.startsAt,
    dashUntil: 0, dodgeUntil: 0, hitUntil: 0, dashX: 0, dashY: 0,
  }]));
  row.version++;
}

function moveFighter(row, fighter, from, until) {
  until = Math.min(until, Math.max(fighter.inputUntil, fighter.dashUntil));
  if (until <= from) return false;
  const opponent = row.fighters[row.players.find(id => id !== fighter.id)];
  let changed = false;
  // Small fixed steps prevent tunnelling through the other fighter after a late tick.
  for (let at = from; at < until; at += 25) {
    const next = Math.min(until, at + 25);
    const dashing = at < fighter.dashUntil;
    const moving = at < fighter.inputUntil;
    const dx = dashing ? fighter.dashX : moving ? fighter.dx : 0;
    const dy = dashing ? fighter.dashY : moving ? fighter.dy : 0;
    const duration = Math.max(0, Math.min(next, dashing ? fighter.dashUntil : fighter.inputUntil) - at);
    if (!duration || (!dx && !dy)) continue;
    const distance = (dashing ? 420 : SPEED) * duration / 1000;
    const x = clamp(fighter.x + dx * distance, PLAY_BOUNDS.xMin, PLAY_BOUNDS.xMax);
    const y = clamp(fighter.y + dy * distance, PLAY_BOUNDS.yMin, PLAY_BOUNDS.yMax);
    if (Math.hypot(x - opponent.x, y - opponent.y) >= RADIUS * 2) {
      changed ||= fighter.x !== x || fighter.y !== y; fighter.x = x; fighter.y = y;
    } else {
      // Slide alongside an opponent, while retaining the collision radius.
      if (Math.hypot(x - opponent.x, fighter.y - opponent.y) >= RADIUS * 2) { changed ||= fighter.x !== x; fighter.x = x; }
      if (Math.hypot(fighter.x - opponent.x, y - opponent.y) >= RADIUS * 2) { changed ||= fighter.y !== y; fighter.y = y; }
    }
  }
  return changed;
}

function step(row, at) {
  if (!row) return false;
  if (row.status === 'pending') return at >= row.expiresAt ? finish(row, 'expired', null, at) : false;
  if (row.status !== 'active') return false;
  const end = Math.min(at, row.endsAt);
  const from = Math.max(row.lastTick, row.startsAt);
  let changed = false;
  if (end > from) {
    // Only inputs within 250 ms remain live. No network message extends movement retrospectively.
    for (const id of row.players) changed = moveFighter(row, row.fighters[id], from, end) || changed;
  }
  row.lastTick = Math.max(row.lastTick, end);
  if (changed) row.version++;
  if (at >= row.endsAt) {
    const [one, two] = row.players.map(id => row.fighters[id]);
    const winner = one.health === two.health ? null : one.health > two.health ? one.id : two.id;
    return finish(row, winner ? 'time' : 'draw', winner, at) || changed;
  }
  return changed;
}

function applyAction(row, walletId, action, id, at) {
  const actionId = `${walletId}:${id}`;
  if (row.actionIds.has(actionId)) return false;
  if (row.status !== 'active') throw new BrawlError(409, 'This brawl is over.', 'fight_over');
  if (at < row.startsAt) throw new BrawlError(409, 'Wait for the countdown.', 'fight_countdown');
  const fighter = row.fighters[walletId];
  if (!fighter) throw new BrawlError(403, 'This is not your brawl.', 'not_fighter');
  const targetId = row.players.find(value => value !== walletId), target = row.fighters[targetId];
  if (action === 'dash') {
    if (at < fighter.dashReadyAt) throw new BrawlError(429, 'Dash is recharging.', 'dash_rate');
    fighter.dashX = fighter.dx || fighter.dy ? fighter.dx : fighter.facingX;
    fighter.dashY = fighter.dx || fighter.dy ? fighter.dy : fighter.facingY;
    fighter.dashUntil = at + 180; fighter.dodgeUntil = at + 120; fighter.dashReadyAt = at + 1800;
  } else {
    if (at < fighter.attackReadyAt) throw new BrawlError(429, 'Your attack is recharging.', 'hit_rate');
    fighter.attackReadyAt = at + (action === 'kick' ? 850 : 450);
  }
  const deltaX = target.x - fighter.x, deltaY = target.y - fighter.y, distance = Math.hypot(deltaX, deltaY);
  const facing = distance ? (deltaX * fighter.facingX + deltaY * fighter.facingY) / distance : 1;
  const hit = action !== 'dash' && distance <= (action === 'kick' ? 92 : 68) && facing >= .25 && at >= target.dodgeUntil;
  if (hit) { target.health = Math.max(0, target.health - (action === 'kick' ? 3 : 2)); target.hitUntil = at + 220; }
  row.actionIds.add(actionId);
  // At most 100 attacks can succeed during a round. Bound even an intentionally busy input source.
  if (row.actionIds.size > 256) row.actionIds.delete(row.actionIds.values().next().value);
  row.actionHistory.push({ id: actionId, playerId: walletId, type: action, hit, targetId: hit ? targetId : null, at });
  if (row.actionHistory.length > HISTORY_LIMIT) row.actionHistory.splice(0, row.actionHistory.length - HISTORY_LIMIT);
  row.version++;
  if (target.health === 0) finish(row, 'knockout', walletId, at);
  return true;
}

function input(row, walletId, value, at) {
  if (!row || !row.players.includes(walletId)) throw new BrawlError(403, 'This is not your brawl.', 'not_fighter');
  if (!Number.isSafeInteger(value?.seq) || value.seq < 0 || typeof value.dx !== 'number' || typeof value.dy !== 'number' ||
      !Number.isFinite(value.dx) || !Number.isFinite(value.dy) || Math.abs(value.dx) > 1_000_000 || Math.abs(value.dy) > 1_000_000 ||
      (value.action !== undefined && !['punch', 'kick', 'dash'].includes(value.action)) || (value.action && !requestId(value.requestId))) {
    throw new BrawlError(400, 'Invalid controls.', 'bad_fight_input');
  }
  step(row, at);
  const fighter = row.fighters[walletId];
  if (!fighter) throw new BrawlError(409, 'Accept the challenge first.', 'fight_pending');
  if (value.seq <= fighter.inputSeq) return false;
  const duplicatedAction = value.action && row.actionIds.has(`${walletId}:${value.requestId}`);
  if (row.status !== 'active') {
    if (duplicatedAction) return false;
    throw new BrawlError(409, 'This brawl is over.', 'fight_over');
  }
  const length = Math.hypot(value.dx, value.dy);
  fighter.dx = length ? value.dx / length : 0; fighter.dy = length ? value.dy / length : 0;
  fighter.inputUntil = at + INPUT_TTL; fighter.inputSeq = value.seq;
  if (length) { fighter.facingX = fighter.dx; fighter.facingY = fighter.dy; }
  row.version++;
  if (value.action && !duplicatedAction) applyAction(row, walletId, value.action, value.requestId, at);
  return true;
}

function punch(row, walletId, value, at) {
  if (!requestId(value?.requestId)) throw new BrawlError(400, 'Invalid hit.', 'bad_request');
  if (!row || !row.players.includes(walletId)) throw new BrawlError(403, 'This is not your brawl.', 'not_fighter');
  step(row, at);
  return applyAction(row, walletId, 'punch', value.requestId, at);
}

function clearInput(row, walletId) {
  const fighter = row?.fighters[walletId];
  if (!fighter) return false;
  const changed = Boolean(fighter.dx || fighter.dy || fighter.inputUntil || fighter.dashUntil);
  fighter.dx = 0; fighter.dy = 0; fighter.inputUntil = 0; fighter.dashUntil = 0;
  if (changed) row.version++;
  return changed;
}

function view(row, at) {
  if (!row) return null;
  return { id: row.id, version: row.version, tableId: row.tableId, status: row.status, challengerId: row.challengerId,
    targetId: row.targetId, arena: { ...ARENA, playBounds: { ...PLAY_BOUNDS } }, maxHealth: MAX_HEALTH,
    players: row.players.map(id => { const fighter = row.fighters[id]; return {
      id, name: row.names[id], health: fighter?.health ?? MAX_HEALTH,
      ...row.cosmetics?.[id],
      x: fighter?.x ?? (row.players[0] === id ? 220 : 580), y: fighter?.y ?? 260,
      facingX: fighter?.facingX ?? (row.players[0] === id ? 1 : -1), facingY: fighter?.facingY ?? 0,
      attackReadyAt: fighter?.attackReadyAt || 0, dashReadyAt: fighter?.dashReadyAt || 0, dashUntil: fighter?.dashUntil || 0,
      hitUntil: fighter?.hitUntil || 0, inputSeq: fighter?.inputSeq ?? -1,
    }; }), startsAt: row.startsAt || null, endsAt: row.endsAt || row.expiresAt, winnerId: row.winnerId || null,
    reason: row.reason || null, finishedAt: row.finishedAt || null, actionHistory: row.actionHistory.map(value => ({ ...value })), serverNow: at };
}

module.exports = { BrawlError, createChallenge, accept, step, input, punch, clearInput, finish, view, ARENA, PLAY_BOUNDS, MAX_HEALTH, RADIUS };
