const crypto = require('node:crypto');
const { createFarm } = require('./farm');
const { createTableGames } = require('./table-games');
const { createTienLen } = require('./tienlen');
const { createClassicCards } = require('./classic-cards');
const { readCardGames, activeCardGame } = require('./card-coordination');
const brawl = require('./brawl');

const ROOM_ID = 'main';
const MAX_GUESTS = 32;
const CHAT_LIMIT = 500;
const MAX_BALANCE = 9_999_999;
const MENU = require('../../public/tea/menu');
const MENU_DEFAULTS = Object.fromEntries(Object.entries(MENU).map(([kind,item])=>[kind,item.price]));
const COLORS = ['red', 'yellow', 'green', 'blue'];
const CARD_HOLD_MS = 2000;
const CARD_HISTORY_LIMIT = 48;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const iso = value => new Date(value).toISOString();
const cleanRequestId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{12,80}$/.test(value) ? value : null;

class TeaError extends Error {
  constructor(status, message, code = 'tea_error') { super(message); this.status = status; this.code = code; }
}

const { TABLES, blocked } = require('../../public/tea/world');

function emptyRoom() {
  return {
    id: ROOM_ID,
    layoutVersion: 2,
    tables: TABLES.map(table => ({ ...table, ownerId: null, seats: table.seats.map(seat => ({ ...seat, walletId: null, seatedAt: null })) })),
    updatedAt: iso(Date.now()),
  };
}

function cleanProfile(input) {
  const nickname = String(input?.nickname || '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (nickname.length < 2 || nickname.length > 24) throw new TeaError(400, 'Nickname must be 2–24 characters.', 'bad_nickname');
  const valid = (value, max) => Number.isInteger(value) && value >= 0 && value < max ? value : 0;
  return { nickname, hair: valid(input?.hair, 8), clothes: valid(input?.clothes, 8), shoes: valid(input?.shoes, 6), language: input?.language === 'vi' ? 'vi' : 'en' };
}

function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (let n = 0; n <= 9; n++) deck.push({ id: crypto.randomUUID(), color, kind: 'number', value: n });
    for (let i = 0; i < 2; i++) deck.push({ id: crypto.randomUUID(), color, kind: 'skip' }, { id: crypto.randomUUID(), color, kind: 'draw2' });
  }
  for (let i = 0; i < 4; i++) deck.push({ id: crypto.randomUUID(), color: 'wild', kind: 'wild' });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function cardMatches(card, top, activeColor) {
  return card.kind === 'wild' || card.color === activeColor || (card.kind === 'number' && top.kind === 'number' && card.value === top.value) || (card.kind !== 'number' && card.kind === top.kind);
}

function createTeaService({ db, config, now = () => Date.now() }) {
  const farm = db ? createFarm({ db, now }) : null;
  const tableGames=db?createTableGames({db,now}):null;
  const tienLen = db ? createTienLen({ db, now, tableIds: TABLES.map(table => table.id) }) : null;
  const classicCards = db ? createClassicCards({ db, now, tableIds: TABLES.map(table => table.id) }) : null;
  const col = name => db?.collection(name);
  const rooms = () => col('tea_rooms');
  const profiles = () => col('tea_profiles');
  const wallets = () => col('game_wallets');
  const walletTokens = () => col('game_wallet_tokens');
  const orders = () => col('tea_orders');
  const orderAttempts = () => col('tea_order_attempts');
  const items = () => col('tea_items');
  const consumeAttempts = () => col('tea_consume_attempts');
  const messages = () => col('tea_messages');
  const settings = () => col('tea_settings').doc('menu');
  const games = () => col('tea_card_games');
  const cardAttempts = () => col('tea_card_attempts');
  const cardStartAttempts = () => col('tea_card_start_attempts');
  const presence = new Map();
  const sockets = new Map();
  const chatRate = new Map();
  const socialRate = new Map();
  const seatRequests = new Map();
  const fights = new Map();
  const fightInputRates = new Map();
  let io = null;
  let fightTimer = null;

  const paymentReady = () => Boolean(db && config?.bank && config?.account && config?.accountName && config?.webhookKey);
  const requireDb = () => { if (!db) throw new TeaError(503, 'The café is temporarily unavailable.', 'storage_unavailable'); };
  async function walletIdFor(token) {
    requireDb();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new TeaError(401, 'Invalid wallet backup code.', 'bad_wallet');
    const mapping = await walletTokens().doc(hash(token)).get();
    if (!mapping.exists) throw new TeaError(401, 'Wallet not found.', 'wallet_not_found');
    return mapping.data().walletId;
  }
  async function ensureRoom(tx) {
    const ref = rooms().doc(ROOM_ID);
    const snapshot = await tx.get(ref);
    const stored = snapshot.exists ? snapshot.data() : null;
    return { ref, row: stored?.layoutVersion === 2 ? stored : emptyRoom(), exists: snapshot.exists };
  }
  function tableBySeat(room, seatId) {
    for (const table of room.tables || []) { const seat = table.seats.find(value => value.id === seatId); if (seat) return { table, seat }; }
    return null;
  }
  function tableForWallet(room, walletId) {
    for (const table of room.tables || []) { const seat = table.seats.find(value => value.walletId === walletId); if (seat) return { table, seat }; }
    return null;
  }
  function publicRoom(room) {
    return { ...room, tables: room.tables.map(({ inviteHash, invited, locked, ...table }) => table) };
  }
  const requestView = row => ({ id: row.id, requesterId: row.requesterId, requesterName: row.requesterName, tableId: row.tableId, seatId: row.seatId, status: row.status, expiresAt: row.expiresAt });
  function socialLimit(walletId) { const recent=(socialRate.get(walletId)||[]).filter(at=>now()-at<30_000); if(recent.length>=4)throw new TeaError(429,'Give people a moment before asking again.','social_rate'); recent.push(now());socialRate.set(walletId,recent); }
  function fightFor(walletId) { return [...fights.values()].find(row => row.players.includes(walletId) && ['pending', 'active'].includes(resolveFight(row).status)) || null; }
  function recentFightFor(walletId) { return fightFor(walletId) || [...fights.values()].reverse().find(row => row.players.includes(walletId) && row.finishedAt && now() - row.finishedAt <= 60_000) || null; }
  function fightView(row) { return brawl.view(row, now()); }
  function emitFight(row, attackerId = null) {
    const payload = { fight: fightView(row), attackerId };
    for (const id of row.players) io?.to(`wallet:${id}`).emit('tea:fight-state', payload);
  }
  function finishFight(row, reason, winnerId = null) {
    if (brawl.finish(row, reason, winnerId, now())) emitFight(row);
    return row;
  }
  function resolveFight(row) {
    if (brawl.step(row, now())) emitFight(row);
    return row;
  }
  async function menu() {
    requireDb();
    const snapshot = await settings().get();
    return { ...MENU_DEFAULTS, updatedAt: iso(now()), ...(snapshot.exists ? snapshot.data() : {}) };
  }
  async function profileFor(walletId) {
    const snapshot = await profiles().doc(walletId).get();
    return snapshot.exists ? snapshot.data() : null;
  }
  async function activeItem(walletId) {
    const profile = await profileFor(walletId);
    const ids = profile?.activeItemIds?.length ? profile.activeItemIds : profile?.activeItemId ? [profile.activeItemId] : [];
    for (const id of ids) { const snapshot = await items().doc(id).get(); if (snapshot.exists && snapshot.data().status !== 'finished') return snapshot.data(); }
    return null;
  }
  async function prepareDelivery(walletId) {
    const at = now();
    const result = await db.runTransaction(async tx => {
      const profileRef = profiles().doc(walletId);
      const profileSnapshot = await tx.get(profileRef);
      if (!profileSnapshot.exists) return null;
      const activeIds = profileSnapshot.data().activeItemIds?.length ? profileSnapshot.data().activeItemIds : profileSnapshot.data().activeItemId ? [profileSnapshot.data().activeItemId] : [];
      if (!activeIds.length) return null;
      const roomSnapshot = await tx.get(rooms().doc(ROOM_ID));
      const itemRef = items().doc(activeIds[0]);
      const itemSnapshot = await tx.get(itemRef);
      if (!roomSnapshot.exists || !itemSnapshot.exists) return null;
      const seat = tableForWallet(roomSnapshot.data(), walletId);
      const item = itemSnapshot.data();
      if (!seat || !['waiting', 'delivering'].includes(item.status)) return item;
      if (item.status === 'delivering' && item.deliverAt > at) return item;
      if (item.status === 'delivering' && item.deliverAt <= at) {
        const served = { ...item, status: 'served', tableId: seat.table.id, servedAt: iso(at), updatedAt: iso(at) };
        tx.update(itemRef, served);
        return served;
      }
      const delivering = { ...item, status: 'delivering', tableId: seat.table.id, deliverAt: at + 2200, updatedAt: iso(at) };
      tx.update(itemRef, delivering);
      return delivering;
    });
    if (result) io?.to(`wallet:${walletId}`).emit('tea:item', result);
    return result;
  }
  function cardMetadata(table, game, walletId, otherGame = null) {
    const seatedPlayers = table?.seats.filter(seat => seat.walletId).map(seat => seat.walletId) || [];
    return { hostId: table?.ownerId || null, seatedPlayers, member: Boolean(game?.players.includes(walletId)), tienLenActive: otherGame === 'tienlen', activeCardGame: game?.status === 'active' ? 'color' : otherGame || null, canStart: Boolean(table?.ownerId === walletId && seatedPlayers.length <= 4 && game?.status !== 'active' && !otherGame) };
  }
  function cardPublic(game, walletId, table, otherGame = null) {
    if (!game) return null;
    const hand = game.hands?.[walletId] || [];
    return {
      id: game.id, tableId: game.tableId, status: game.status, players: game.players.map(id => ({ id, bot: id.startsWith('bot:'), name: game.names[id], cards: game.hands[id]?.length || 0 })),
      turn: game.players[game.turnIndex], top: game.discard.at(-1), activeColor: game.activeColor, turnEndsAt: game.turnEndsAt, nextActionAt: game.nextActionAt || 0, winnerId: game.winnerId || null,
      actionHistory: (game.actionHistory || []).slice(-CARD_HISTORY_LIMIT).map(({ version, playerId, type, card, color, at }) => ({ version, playerId, type, card: type === 'play' ? card : null, cards: type === 'play' && card ? [card] : [], color, at })),
      reason: game.reason || null, hand, serverNow: now(), version: game.version || 1, lastAction: game.lastAction || null, ...cardMetadata(table, game, walletId, otherGame),
    };
  }
  function recordCardAction(game, playerId, type, card = null, at = now()) {
    game.version = (game.version || 1) + 1;
    game.lastAction = { version: game.version, playerId, type, card, cards: card ? [card] : [], color: game.activeColor, at };
    game.actionHistory = [...(game.actionHistory || []), game.lastAction].slice(-CARD_HISTORY_LIMIT);
    game.nextActionAt = at + CARD_HOLD_MS;
  }
  function drawCards(game, playerId, count) {
    for (let i = 0; i < count; i++) {
      if (!game.deck.length && game.discard.length > 1) {
        const top = game.discard.pop(); game.deck = game.discard.splice(0);
        for (let n = game.deck.length - 1; n > 0; n--) { const j = crypto.randomInt(n + 1); [game.deck[n], game.deck[j]] = [game.deck[j], game.deck[n]]; }
        game.discard = [top];
      }
      const card = game.deck.pop(); if (card) game.hands[playerId].push(card);
    }
  }
  function advance(game, amount = 1, startsAt = now()) { game.turnIndex = (game.turnIndex + amount) % game.players.length; game.nextActionAt = startsAt + CARD_HOLD_MS; game.turnEndsAt = game.nextActionAt + 30_000; }
  function playBot(game, startsAt) {
    const playerId = game.players[game.turnIndex];
    const top = game.discard.at(-1); const hand = game.hands[playerId]; const card = hand.find(value => cardMatches(value, top, game.activeColor));
    if (!card) { drawCards(game, playerId, 1); recordCardAction(game, playerId, 'draw', null, startsAt); advance(game, 1, startsAt); return; }
    hand.splice(hand.indexOf(card), 1); game.discard.push(card); game.activeColor = card.kind === 'wild' ? COLORS[crypto.randomInt(COLORS.length)] : card.color;
    recordCardAction(game, playerId, 'play', card, startsAt);
    if (!hand.length) { game.status = 'finished'; game.winnerId = playerId; game.finishedAt = iso(startsAt); return; }
    if (card.kind === 'draw2') { const next = game.players[(game.turnIndex + 1) % game.players.length]; drawCards(game, next, 2); advance(game, 2, startsAt); }
    else if (card.kind === 'skip') advance(game, 2, startsAt); else advance(game, 1, startsAt);
  }
  function applyTimeout(game) {
    for (let guard = 0; guard < 128 && game.status === 'active'; guard++) {
      const playerId = game.players[game.turnIndex];
      if (playerId.startsWith('bot:')) {
        const readyAt = game.nextActionAt ?? game.turnEndsAt - 30_000;
        if (now() < readyAt) break;
        playBot(game, readyAt); continue;
      }
      if (now() < game.turnEndsAt) break;
      const expiredAt = game.turnEndsAt;
      drawCards(game, playerId, 1); recordCardAction(game, playerId, 'timeout', null, expiredAt); advance(game, 1, expiredAt);
    }
  }
  function orderView(row) {
    return { id: row.id, code: row.code, kind: row.kind, price: row.price, paidAmount: row.paidAmount, remaining: Math.max(0, row.price - row.paidAmount), status: row.status, qrUrl: row.qrUrl, createdAt: row.createdAt };
  }

  const service = {
    config, TABLES, paymentReady,
    menu,
    attachIO(value) {
      io = value; tienLen?.attachIO(value); classicCards?.attachIO(value);
      if (!fightTimer) { fightTimer = setInterval(() => service.tickFights(), 50); fightTimer.unref?.(); }
    },
    stopFightLoop() { if (fightTimer) clearInterval(fightTimer); fightTimer = null; },
    tickFights() {
      for (const [id, row] of fights) { resolveFight(row); if (row.finishedAt && now() - row.finishedAt > 60_000) fights.delete(id); }
    },
    walletIdFor,
    async farmState(token) { const walletId = await walletIdFor(token); return farm.read(walletId); },
    async farmAction(token, input) { const walletId = await walletIdFor(token); return farm.action(walletId, input); },
    async enterFarm(token) {
      const walletId = await walletIdFor(token);
      if (!await profileFor(walletId)) throw new TeaError(409, 'Create your character first.', 'profile_required');
      const state = await farm.read(walletId);
      await service.leaveByWallet(walletId, 'map_changed');
      const socket = sockets.get(walletId);
      if (socket) { socket.emit('tea:map-changed'); socket.disconnect(true); }
      sockets.delete(walletId); presence.delete(walletId);
      io?.emit('tea:state', await service.publicState());
      return state;
    },
    async profile(token) { const walletId = await walletIdFor(token); return { walletId, profile: await profileFor(walletId) }; },
    async saveProfile(token, input) {
      const walletId = await walletIdFor(token); const clean = cleanProfile(input); const at = iso(now());
      await db.runTransaction(async tx => {
        const ref = profiles().doc(walletId); const snapshot = await tx.get(ref);
        tx.set(ref, { ...(snapshot.exists ? snapshot.data() : {}), ...clean, walletId, createdAt: snapshot.exists ? snapshot.data().createdAt : at, updatedAt: at, activeItemId: snapshot.exists ? snapshot.data().activeItemId || null : null, activeItemIds: snapshot.exists ? snapshot.data().activeItemIds || (snapshot.data().activeItemId ? [snapshot.data().activeItemId] : []) : [], pendingOrderCode: snapshot.exists ? snapshot.data().pendingOrderCode || null : null });
      });
      const live = presence.get(walletId); if (live) Object.assign(live, clean);
      io?.emit('tea:state', await service.publicState());
      return { walletId, profile: await profileFor(walletId) };
    },
    async publicState() {
      requireDb(); const roomSnapshot = await rooms().doc(ROOM_ID).get(); const stored = roomSnapshot.exists ? roomSnapshot.data() : null; const room = stored?.layoutVersion === 2 ? stored : emptyRoom();
      return { room: publicRoom(room), guests: [...presence.values()].map(({ walletId, nickname, hair, clothes, shoes, x, y, connected, tableId, seatId }) => ({ walletId, nickname, hair, clothes, shoes, x, y, connected, tableId, seatId })), maxGuests: MAX_GUESTS, serverNow: now() };
    },
    async connect(token, socket) {
      const walletId = await walletIdFor(token); const profile = await profileFor(walletId);
      if (!profile) throw new TeaError(409, 'Create your character first.', 'profile_required');
      if (!presence.has(walletId) && presence.size >= MAX_GUESTS) throw new TeaError(409, 'The café is full. Please try again soon.', 'cafe_full');
      const old = sockets.get(walletId); if (old && old.id !== socket.id) old.emit('tea:replaced'); old?.disconnect(true); if (old) fightInputRates.delete(old.id);
      const current = presence.get(walletId) || { walletId, x: 90 + Math.random() * 100, y: 560, tableId: null, seatId: null };
      Object.assign(current, profile, { connected: true, socketId: socket.id, disconnectedAt: null }); presence.set(walletId, current); sockets.set(walletId, socket);
      socket.join(`wallet:${walletId}`); socket.data.walletId = walletId;
      const roomSnapshot = await rooms().doc(ROOM_ID).get(); const room = roomSnapshot.exists && roomSnapshot.data()?.layoutVersion === 2 ? roomSnapshot.data() : emptyRoom(); const seated = tableForWallet(room, walletId);
      if (seated) { Object.assign(current, { tableId: seated.table.id, seatId: seated.seat.id, x: seated.seat.x, y: seated.seat.y }); socket.join(`table:${seated.table.id}`); }
      const fight = recentFightFor(walletId); if (fight && brawl.clearInput(fight, walletId)) emitFight(fight);
      return { walletId, state: await service.publicState(), fight: fightView(fight) };
    },
    move(walletId, input) {
      const player = presence.get(walletId); if (!player || player.seatId) return;
      const dx = Number(input?.dx) || 0; const dy = Number(input?.dy) || 0; if(!Number.isFinite(dx)||!Number.isFinite(dy))return; const length = Math.hypot(dx, dy) || 1;
      const elapsed = Math.min(140, now() - (player.movedAt ?? now() - 50)); if(elapsed<16)return; const maximum=145*elapsed/1000; const distance=Number(input?.distance); const step=Number.isFinite(distance)&&distance>=0?Math.min(maximum,distance):maximum;
      const vectors = [[dx / length, dy / length], [dx ? Math.sign(dx) : 0, 0], [0, dy ? Math.sign(dy) : 0], [-dy / length, dx / length], [dy / length, -dx / length]];
      for (const [vx, vy] of vectors) { if (!vx && !vy) continue; const nx = player.x + vx * step, ny = player.y + vy * step; if (!blocked(nx, ny)) { player.x = nx; player.y = ny; break; } }
      player.movedAt = now(); io?.emit('tea:move', { walletId, x: player.x, y: player.y });
    },
    disconnect(walletId, socketId) { const player = presence.get(walletId); if (!player || player.socketId !== socketId) return; player.connected = false; player.disconnectedAt = now(); sockets.delete(walletId); fightInputRates.delete(socketId); const fight = fightFor(walletId); if (brawl.clearInput(fight, walletId)) emitFight(fight); setTimeout(() => service.releaseDisconnected(walletId).catch(() => {}), 45_100).unref?.(); },
    async releaseDisconnected(walletId) { const player = presence.get(walletId); if (!player || player.connected || now() - player.disconnectedAt < 45_000) return; await service.leaveByWallet(walletId, 'disconnect'); presence.delete(walletId); io?.emit('tea:state', await service.publicState()); },
    async seat(token, seatId) {
      const walletId = await walletIdFor(token); const player = presence.get(walletId); const definition = TABLES.flatMap(t => t.seats).find(s => s.id === seatId);
      if (!player || !definition || Math.hypot(player.x - definition.x, player.y - definition.y) > 96) throw new TeaError(409, 'Walk closer to this chair first.', 'too_far');
      const result = await db.runTransaction(async tx => {
        const { ref, row: room, exists } = await ensureRoom(tx); if (tableForWallet(room, walletId)) throw new TeaError(409, 'You are already seated.', 'already_seated');
        const found = tableBySeat(room, seatId); if (!found || found.seat.walletId) throw new TeaError(409, 'That chair was just taken.', 'seat_taken');
        found.seat.walletId = walletId; found.seat.seatedAt = now(); if (!found.table.ownerId) found.table.ownerId = walletId;
        room.updatedAt = iso(now()); exists ? tx.update(ref, room) : tx.create(ref, room); return { tableId: found.table.id, seatId };
      });
      Object.assign(player, result, { x: definition.x, y: definition.y }); sockets.get(walletId)?.join(`table:${result.tableId}`); await prepareDelivery(walletId); io?.emit('tea:state', await service.publicState()); return result;
    },
    async askToSit(token, seatId) {
      const walletId = await walletIdFor(token); const player = presence.get(walletId); const definition = TABLES.flatMap(table => table.seats).find(seat => seat.id === seatId);
      if (!player || !definition || player.seatId || Math.hypot(player.x - definition.x, player.y - definition.y) > 96) throw new TeaError(409, 'Walk closer to this chair first.', 'too_far');
      const snapshot = await rooms().doc(ROOM_ID).get(); const room = snapshot.exists && snapshot.data()?.layoutVersion === 2 ? snapshot.data() : emptyRoom(); const found = tableBySeat(room, seatId);
      if (!found || found.seat.walletId) throw new TeaError(409, 'That chair was just taken.', 'seat_taken');
      if (!found.table.seats.some(seat => seat.walletId)) throw new TeaError(409, 'This table is empty. You can sit right down.', 'table_empty');
      socialLimit(walletId);
      for (const request of seatRequests.values()) if (request.requesterId === walletId && request.status === 'pending') request.status = 'replaced';
      const row = { id: crypto.randomUUID(), requesterId: walletId, requesterName: player.nickname, tableId: found.table.id, seatId, status: 'pending', expiresAt: now() + 20_000 };
      seatRequests.set(row.id, row); io?.to(`table:${row.tableId}`).emit('tea:seat-request', requestView(row)); return requestView(row);
    },
    async seatRequestsFor(token) {
      const walletId = await walletIdFor(token); const snapshot = await rooms().doc(ROOM_ID).get(); const current = snapshot.exists && tableForWallet(snapshot.data(), walletId); if (!current) return { requests: [] };
      const rows = [...seatRequests.values()].filter(row => row.tableId === current.table.id && row.status === 'pending' && row.expiresAt > now()); return { requests: rows.map(requestView) };
    },
    async respondSeatRequest(token, requestId, accepted) {
      const walletId = await walletIdFor(token); const row = seatRequests.get(requestId); if (!row || row.status !== 'pending' || row.expiresAt <= now()) throw new TeaError(404, 'This request has expired.', 'request_expired');
      const snapshot = await rooms().doc(ROOM_ID).get(); const current = snapshot.exists && tableForWallet(snapshot.data(), walletId); if (!current || current.table.id !== row.tableId) throw new TeaError(403, 'Only someone at this table can answer.', 'wrong_table');
      if(row.status!=='pending'||row.expiresAt<=now())throw new TeaError(409,'Someone already answered this request.','request_expired');
      row.status = accepted ? 'accepted' : 'declined'; row.respondedBy = walletId; row.respondedAt = now(); io?.to(`wallet:${row.requesterId}`).emit('tea:seat-response', requestView(row)); return requestView(row);
    },
    async fightState(token) { const walletId = await walletIdFor(token); return { fight: fightView(recentFightFor(walletId)) }; },
    async challengeFight(token, opponentId) {
      const walletId = await walletIdFor(token); if (walletId === opponentId) throw new TeaError(400, 'Choose someone else.', 'bad_opponent');
      const snapshot = await rooms().doc(ROOM_ID).get(); const room = snapshot.exists ? snapshot.data() : emptyRoom(); const mine = tableForWallet(room, walletId), theirs = tableForWallet(room, opponentId);
      if (!mine || !theirs || mine.table.id !== theirs.table.id || !presence.get(walletId)?.connected || !presence.get(opponentId)?.connected) throw new TeaError(409, 'Choose someone sitting at your table.', 'opponent_unavailable');
      if (fightFor(walletId) || fightFor(opponentId)) throw new TeaError(409, 'One of you is already in a brawl.', 'fight_busy');
      socialLimit(walletId);
      const names = { [walletId]: presence.get(walletId)?.nickname || 'Guest', [opponentId]: presence.get(opponentId)?.nickname || 'Guest' };
      const row = brawl.createChallenge({ tableId: mine.table.id, challengerId: walletId, targetId: opponentId, names, at: now() });
      row.cosmetics = Object.fromEntries(row.players.map(id => { const profile = presence.get(id); return [id, { hair: profile.hair, clothes: profile.clothes, shoes: profile.shoes }]; }));
      fights.set(row.id, row); emitFight(row); io?.to(`wallet:${opponentId}`).emit('tea:fight-challenge', fightView(row)); return fightView(row);
    },
    async respondFight(token, fightId, accepted) {
      const walletId = await walletIdFor(token); const row = resolveFight(fights.get(fightId)); if (!row) throw new TeaError(404, 'This challenge has expired.', 'fight_expired'); if (row.targetId !== walletId && !(row.challengerId===walletId&&!accepted)) throw new TeaError(403, 'Only the challenged player can accept.', 'not_target'); if(row.status!=='pending')return fightView(row);
      if (!accepted) return fightView(finishFight(row, 'declined'));
      const snapshot = await rooms().doc(ROOM_ID).get(); const room = snapshot.exists ? snapshot.data() : emptyRoom(); const one = tableForWallet(room, row.players[0]), two = tableForWallet(room, row.players[1]); if (!one || !two || one.table.id !== two.table.id || row.players.some(id => !presence.get(id)?.connected)) throw new TeaError(409, 'Both players must still be at the same table.', 'fight_moved');
      if(resolveFight(row).status!=='pending')return fightView(row);
      brawl.accept(row, now()); emitFight(row); return fightView(row);
    },
    async hitFight(token, fightId, input, socketId) {
      const walletId = await walletIdFor(token); const row = fights.get(fightId);
      if (!socketId || !presence.get(walletId)?.connected || presence.get(walletId)?.socketId !== socketId || sockets.get(walletId)?.id !== socketId) throw new TeaError(403, 'Only the current tab can control this fighter.', 'not_controller');
      const version = row?.version;
      try { brawl.punch(row, walletId, input, now()); }
      finally { if (row && row.version !== version) emitFight(row, walletId); }
      return fightView(row);
    },
    fightInput(walletId, socketId, input) {
      const player = presence.get(walletId);
      if (!player?.connected || player.socketId !== socketId || sockets.get(walletId)?.id !== socketId) throw new TeaError(403, 'Only the current tab can control this fighter.', 'not_controller');
      const at = now();
      let rate = fightInputRates.get(socketId);
      if (!rate || at - rate.startsAt >= 1000) { rate = { startsAt: at, count: 0, warnedAt: -Infinity }; fightInputRates.set(socketId, rate); }
      if (++rate.count > 60) {
        const error = new TeaError(429, 'Controls are arriving too quickly.', 'fight_input_rate');
        error.report = at - rate.warnedAt >= 1000;
        if (error.report) rate.warnedAt = at;
        throw error;
      }
      const row = fights.get(input?.fightId), version = row?.version;
      try { brawl.input(row, walletId, input, at); }
      finally { if (row && row.version !== version) emitFight(row, input?.action ? walletId : null); }
      return fightView(row);
    },
    async forfeitFight(token, fightId) {
      const walletId = await walletIdFor(token), row = resolveFight(fights.get(fightId));
      if (!row || !row.players.includes(walletId)) throw new TeaError(403, 'This is not your brawl.', 'not_fighter');
      if (row.status !== 'finished') finishFight(row, 'forfeit', row.players.find(id => id !== walletId));
      return fightView(row);
    },
    async leave(token) { const walletId = await walletIdFor(token); return service.leaveByWallet(walletId, 'stood_up'); },
    async leaveByWallet(walletId, reason) {
      const result = await db.runTransaction(async tx => {
        const { ref, row: room, exists } = await ensureRoom(tx); const current = tableForWallet(room, walletId); if (!current) return null;
        const activity = await readCardGames(tx, db, current.table.id);
        const gameRef = activity.color.ref, gameSnapshot = activity.color.snapshot;
        const tienLenRef = activity.tienlen.ref, tienLenSnapshot = activity.tienlen.snapshot;
        current.seat.walletId = null; current.seat.seatedAt = null;
        if (current.table.ownerId === walletId) { const occupied = current.table.seats.filter(s => s.walletId).sort((a, b) => a.seatedAt - b.seatedAt); current.table.ownerId = occupied[0]?.walletId || null; }
        classicCards.departInTransaction(tx, current.table, activity);
        room.updatedAt = iso(now()); exists ? tx.update(ref, room) : tx.create(ref, room);
        if (gameSnapshot.exists && gameSnapshot.data().status === 'active' && gameSnapshot.data().players.includes(walletId)) tx.update(gameRef, { ...gameSnapshot.data(), version: (gameSnapshot.data().version || 1) + 1, status: 'finished', reason: reason === 'disconnect' ? 'player_disconnected' : 'player_left', winnerId: null, finishedAt: iso(now()) });
        if (tienLenSnapshot.exists && tienLenSnapshot.data().status === 'active' && tienLenSnapshot.data().players.includes(walletId)) tx.update(tienLenRef, { status: 'finished', version: (tienLenSnapshot.data().version || 1) + 1, reason: 'player_left', winnerId: null, finishedAt: iso(now()) });
        return { tableId: current.table.id };
      });
      const fight = fightFor(walletId); if (fight) finishFight(fight, reason === 'disconnect' ? 'player_disconnected' : 'player_left', fight.players.find(id => id !== walletId));
      const player = presence.get(walletId); if (player) Object.assign(player, { tableId: null, seatId: null }); if (result) { io?.to(`table:${result.tableId}`).emit('tea:tienlen', { tableId: result.tableId }); io?.to(`table:${result.tableId}`).emit('tea:classic-card', { tableId: result.tableId }); sockets.get(walletId)?.leave(`table:${result.tableId}`); } io?.emit('tea:state', await service.publicState()); return result;
    },
    async chat(token, input) {
      const walletId = await walletIdFor(token); const text = String(input?.text || '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
      if (!text || text.length > CHAT_LIMIT) throw new TeaError(400, 'Messages must be 1–500 characters.', 'bad_message');
      const recent = (chatRate.get(walletId) || []).filter(value => now() - value < 60_000); if (recent.length >= 10) throw new TeaError(429, 'Please slow down.', 'chat_rate'); recent.push(now()); chatRate.set(walletId, recent);
      const roomSnapshot = await rooms().doc(ROOM_ID).get(); const current = roomSnapshot.exists && tableForWallet(roomSnapshot.data(), walletId); if (!current) throw new TeaError(409, 'Sit at a table to chat.', 'not_seated');
      const profile = await profileFor(walletId); const createdMs = now(); const id = `${createdMs}-${crypto.randomBytes(6).toString('hex')}`; const row = { id, tableId: current.table.id, walletId, nickname: profile.nickname, text, createdMs, createdAt: iso(createdMs), purgeAt: createdMs + 86_400_000 };
      await messages().doc(id).set(row); io?.to(`table:${current.table.id}`).emit('tea:chat', row); return row;
    },
    async chats(token, after = 0) {
      const walletId = await walletIdFor(token); const roomSnapshot = await rooms().doc(ROOM_ID).get(); const current = roomSnapshot.exists && tableForWallet(roomSnapshot.data(), walletId); if (!current) throw new TeaError(409, 'Sit at a table to read chat.', 'not_seated');
      const snapshot = await messages().where('createdMs', '>', Number(after) || 0).orderBy('createdMs').limit(100).get(); const rows = snapshot.docs.map(doc => doc.data()).filter(row => row.tableId === current.table.id);
      return { messages: rows, cursor: rows.at(-1)?.createdMs || Number(after) || 0 };
    },
    async order(token, input) {
      if (!paymentReady()) throw new TeaError(503, 'Bank transfer ordering is unavailable.', 'payment_unavailable');
      const walletId = await walletIdFor(token); const kind = Object.hasOwn(MENU, input?.kind) ? input.kind : null; const requestId = cleanRequestId(input?.requestId); if (!kind || !requestId) throw new TeaError(400, 'Invalid order.', 'bad_order');
      const prices = await menu();
      if (!Number.isSafeInteger(prices[kind]) || prices[kind]<1000 || prices[kind]>1_000_000) throw new TeaError(503, 'This menu item is unavailable.', 'bad_price');
      for (let tries = 0; tries < 6; tries++) {
        const code = `DH${crypto.randomInt(10_000_000).toString().padStart(7, '0')}`; const orderId = hash(`${walletId}:${requestId}`).slice(0, 36);
        const result = await db.runTransaction(async tx => {
          const attemptRef = orderAttempts().doc(orderId); const prior = await tx.get(attemptRef); if (prior.exists) { const old = await tx.get(orders().doc(prior.data().code)); return old.exists ? old.data() : null; }
          const roomSnapshot = await tx.get(rooms().doc(ROOM_ID)); const profileRef = profiles().doc(walletId); const profileSnapshot = await tx.get(profileRef); const codeRef = orders().doc(code); const collision = await tx.get(codeRef); const donationCollision = await tx.get(col('donation_requests').doc(code));
          if (!roomSnapshot.exists || !tableForWallet(roomSnapshot.data(), walletId)) throw new TeaError(409, 'Sit down before ordering.', 'not_seated');
          if (!profileSnapshot.exists) throw new TeaError(409, 'Create your character first.', 'profile_required');
          const profile = profileSnapshot.data(); if (profile.pendingOrderCode) throw new TeaError(409, 'You already have an unpaid order.', 'pending_order'); if (collision.exists || donationCollision.exists) return null;
          const createdMs = now(); const price = Number(prices[kind]); const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(config.bank)}-${encodeURIComponent(config.account)}-compact2.png?${new URLSearchParams({ amount: String(price), addInfo: code, accountName: config.accountName })}`;
          const row = { id: orderId, code, walletId, kind, price, paidAmount: 0, paymentCount: 0, status: 'pending', qrUrl, createdMs, createdAt: iso(createdMs), account: config.account };
          tx.create(codeRef, row); tx.create(attemptRef, { code, walletId, createdAt: row.createdAt }); tx.update(profileRef, { pendingOrderCode: code, updatedAt: row.createdAt }); return row;
        }); if (result) return orderView(result);
      }
      throw new TeaError(503, 'Could not create a payment code.', 'code_collision');
    },
    async currentOrder(token) {
      const walletId = await walletIdFor(token); await prepareDelivery(walletId); const profile = await profileFor(walletId); if (!profile?.pendingOrderCode) return { order: null, item: await activeItem(walletId) };
      const snapshot = await orders().doc(profile.pendingOrderCode).get(); return { order: snapshot.exists ? orderView(snapshot.data()) : null, item: await activeItem(walletId) };
    },
    async cancelOrder(token) {
      const walletId = await walletIdFor(token); return db.runTransaction(async tx => { const profileRef = profiles().doc(walletId); const p = await tx.get(profileRef); if (!p.exists || !p.data().pendingOrderCode) return { canceled: false }; const ref = orders().doc(p.data().pendingOrderCode); const snap = await tx.get(ref); const walletRef = wallets().doc(walletId); const walletSnapshot = await tx.get(walletRef); if (!snap.exists || snap.data().status !== 'pending') return { canceled: false }; const order = snap.data(), at = iso(now()); tx.update(ref, { status: 'canceled', canceledAt: at, updatedAt: at }); tx.update(profileRef, { pendingOrderCode: null, updatedAt: at }); let credited = 0; if (order.paidAmount > 0 && walletSnapshot.exists) { const wallet = walletSnapshot.data(), milli = (wallet.remainder || 0) + order.paidAmount; credited = Math.floor(milli / 1000); const balance = wallet.balance + credited; if (balance > MAX_BALANCE) throw new TeaError(409, 'Wallet limit reached.', 'wallet_limit'); const history = [...(wallet.history || []), { id: `tea-cancel-${order.id}`, type: 'tea_cancel_refund', amount: credited, money: order.paidAmount, balance, createdAt: at }].slice(-100); tx.update(walletRef, { balance, remainder: milli % 1000, totalDeposited: (wallet.totalDeposited || 0) + order.paidAmount, history, updatedAt: at }); } return { canceled: true, credited }; });
    },
    async consume(token, input) {
      const walletId = await walletIdFor(token); const requestId = cleanRequestId(input?.requestId); if (!requestId) throw new TeaError(400, 'Invalid request.', 'bad_request'); const attemptId = hash(`${walletId}:${requestId}`);
      const result = await db.runTransaction(async tx => {
        const attemptRef = consumeAttempts().doc(attemptId); const previous = await tx.get(attemptRef); if (previous.exists) return previous.data().result;
        const profileRef = profiles().doc(walletId); const profileSnapshot = await tx.get(profileRef); if (!profileSnapshot.exists) throw new TeaError(409, 'You have nothing to eat or drink.', 'no_item'); const roomSnapshot = await tx.get(rooms().doc(ROOM_ID)); if (!roomSnapshot.exists || !tableForWallet(roomSnapshot.data(), walletId)) throw new TeaError(409, 'Sit down to eat or drink.', 'not_seated'); const profile = profileSnapshot.data(), activeIds = profile.activeItemIds?.length ? profile.activeItemIds : profile.activeItemId ? [profile.activeItemId] : []; if (!activeIds.length) throw new TeaError(409, 'You have nothing to eat or drink.', 'no_item');
        const itemRef = items().doc(activeIds[0]); const itemSnapshot = await tx.get(itemRef); if (!itemSnapshot.exists || itemSnapshot.data().status !== 'served') throw new TeaError(409, 'Your order has not reached the table yet.', 'not_served');
        const item = itemSnapshot.data(); const remaining = item.remaining - 1; const value = { id: item.id, eventId: attemptId, kind: item.kind, remaining, status: remaining ? 'served' : 'finished' }; tx.update(itemRef, { ...value, updatedAt: iso(now()), finishedAt: remaining ? null : iso(now()) }); if (!remaining) { const next = activeIds.slice(1); tx.update(profileRef, { activeItemId: next[0] || null, activeItemIds: next, updatedAt: iso(now()) }); } tx.create(attemptRef, { walletId, result: value, createdAt: iso(now()) }); return value;
      }); io?.emit('tea:consume', { walletId, ...result }); return result;
    },
    async receiveInTransaction({ tx, code, payload, createdAt }) {
      const orderRef = orders().doc(code); const orderSnapshot = await tx.get(orderRef); if (!orderSnapshot.exists) return { matched: false };
      const order = orderSnapshot.data(); if (order.account !== config.account) return { matched: false };
      const walletRef = wallets().doc(order.walletId); const profileRef = profiles().doc(order.walletId); const walletSnapshot = await tx.get(walletRef); const profileSnapshot = await tx.get(profileRef); if (!walletSnapshot.exists || !profileSnapshot.exists) throw new TeaError(503, 'Order wallet is missing.', 'wallet_missing');
      const wallet = walletSnapshot.data(); const amount = payload.transferAmount; let result = 'tea_partial'; let overflow = 0; let itemId = null; const paidAmount = order.paidAmount + amount;
      if (order.status === 'canceled' || order.status === 'paid') { overflow = amount; result = order.status === 'canceled' ? 'tea_canceled_credit' : 'tea_excess'; }
      else if (paidAmount >= order.price) { overflow = paidAmount - order.price; result = 'tea_paid'; itemId = `tea-${order.id}`; const profile = profileSnapshot.data(), activeIds = profile.activeItemIds?.length ? profile.activeItemIds : profile.activeItemId ? [profile.activeItemId] : []; tx.create(items().doc(itemId), { id: itemId, orderId: order.id, walletId: order.walletId, kind: order.kind, remaining: 3, status: 'waiting', createdAt, updatedAt: createdAt }); tx.update(profileRef, { pendingOrderCode: null, activeItemId: activeIds[0] || itemId, activeItemIds: [...activeIds, itemId], updatedAt: createdAt }); }
      tx.update(orderRef, { paidAmount, paymentCount: (order.paymentCount || 0) + 1, status: result === 'tea_paid' ? 'paid' : order.status, paidAt: result === 'tea_paid' ? createdAt : order.paidAt || null, updatedAt: createdAt });
      if (overflow > 0) { const milli = (wallet.remainder || 0) + overflow; const credited = Math.floor(milli / 1000); const balance = wallet.balance + credited; if (balance > MAX_BALANCE) throw new TeaError(503, 'Wallet limit reached.', 'wallet_limit'); const history = [...(wallet.history || []), { id: `tea-excess-${payload.id}`, type: 'tea_excess', amount: credited, money: overflow, balance, createdAt }].slice(-100); tx.update(walletRef, { balance, remainder: milli % 1000, totalDeposited: (wallet.totalDeposited || 0) + overflow, history, updatedAt: createdAt }); }
      return { matched: true, result, walletId: order.walletId, itemId, orderId: order.id };
    },
    async codeExistsInTransaction(tx, code) { return (await tx.get(orders().doc(code))).exists; },
    async afterPayment(info) { if (!info?.matched) return; io?.to(`wallet:${info.walletId}`).emit('tea:payment', info); if (info.itemId) await prepareDelivery(info.walletId); },
    async startCard(token, input) {
      const walletId = await walletIdFor(token); const requestId = cleanRequestId(input?.requestId); const botCount = input?.botCount ?? 0;
      if (!requestId) throw new TeaError(400, 'Invalid request.', 'bad_request');
      if (!Number.isInteger(botCount) || botCount < 0 || botCount > 2) throw new TeaError(400, 'Choose 0, 1 or 2 bots.', 'bad_bot_count');
      const result = await db.runTransaction(async tx => {
        const roomSnapshot = await tx.get(rooms().doc(ROOM_ID)); const current = roomSnapshot.exists && tableForWallet(roomSnapshot.data(), walletId); if (!current) throw new TeaError(409, 'Sit at a table first.', 'not_seated'); if (current.table.ownerId !== walletId) throw new TeaError(403, 'Only the table host can start.', 'not_host');
        const activity = await readCardGames(tx, db, current.table.id), ref = activity.color.ref, old = activity.color.snapshot;
        const attemptRef = cardStartAttempts().doc(hash(`${walletId}:${requestId}`)); const prior = await tx.get(attemptRef);
        if (prior.exists && (!old.exists || prior.data().gameId !== old.data().id || prior.data().tableId !== current.table.id)) throw new TeaError(409, 'That earlier game has already ended. Start with a new request.', 'stale_start');
        if (old.exists && (old.data().status === 'active' || old.data().requestId === requestId || prior.exists)) {
          const game = old.data(), before = JSON.stringify(game); applyTimeout(game); if (before !== JSON.stringify(game)) tx.update(ref, game);
          if (!prior.exists) tx.create(attemptRef, { gameId: game.id, tableId: game.tableId, walletId, createdAt: iso(now()) });
          return cardPublic(game, walletId, current.table);
        }
        if (activeCardGame(activity, 'color')) throw new TeaError(409, 'A card game is already running at this table.', 'game_active');
        const humans = current.table.seats.filter(s => s.walletId).map(s => s.walletId); if (humans.length + botCount < 2 || humans.length + botCount > 4) throw new TeaError(400, 'A game needs 2–4 players.', 'bad_player_count');
        const profileRows = {}; for (const id of humans) { const snap = await tx.get(profiles().doc(id)); profileRows[id] = snap.exists ? snap.data().nickname : 'Guest'; }
        const players = [...humans, ...Array.from({ length: botCount }, (_, i) => `bot:${i + 1}`)]; const names = { ...profileRows }; players.filter(id => id.startsWith('bot:')).forEach((id, i) => { names[id] = `BOT ${i + 1}`; }); const deck = makeDeck(); const hands = Object.fromEntries(players.map(id => [id, []])); for (let n = 0; n < 7; n++) for (const id of players) hands[id].push(deck.pop()); let top = deck.pop(); while (top.kind !== 'number') { deck.unshift(top); top = deck.pop(); }
        const at = now(); const game = { id: crypto.randomUUID(), version: 1, tableId: current.table.id, status: 'active', players, names, hands, deck, discard: [top], activeColor: top.color, turnIndex: 0, nextActionAt: at, turnEndsAt: at + 30_000, actionHistory: [], createdAt: iso(at), requestId }; tx.set(ref, game); tx.create(attemptRef, { gameId: game.id, tableId: game.tableId, walletId, createdAt: game.createdAt }); return cardPublic(game, walletId, current.table);
      });
      io?.to(`table:${result.tableId}`).emit('tea:card', { tableId: result.tableId }); return result;
    },
    async cardState(token) {
      const walletId = await walletIdFor(token); return db.runTransaction(async tx => {
        const roomSnapshot = await tx.get(rooms().doc(ROOM_ID)); const current = roomSnapshot.exists && tableForWallet(roomSnapshot.data(), walletId);
        if (!current) return { game: null, ...cardMetadata(null, null, walletId) };
        const activity = await readCardGames(tx, db, current.table.id), ref = activity.color.ref, snapshot = activity.color.snapshot;
        const otherGame = activeCardGame(activity, 'color');
        if (!snapshot.exists) return { game: null, ...cardMetadata(current.table, null, walletId, otherGame) };
        const game = snapshot.data(), before = JSON.stringify(game); applyTimeout(game);
        if (before !== JSON.stringify(game)) tx.update(ref, game);
        return { game: cardPublic(game, walletId, current.table, otherGame), ...cardMetadata(current.table, game, walletId, otherGame) };
      });
    },
    async cardAction(token, input) {
      const walletId = await walletIdFor(token); const requestId = cleanRequestId(input?.requestId);
      if (!requestId || typeof input?.gameId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.gameId)) throw new TeaError(400, 'A game ID and request ID are required.', 'bad_request');
      if (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)) throw new TeaError(400, 'Invalid game version.', 'bad_version');
      const result = await db.runTransaction(async tx => {
        const roomSnapshot = await tx.get(rooms().doc(ROOM_ID)); const current = roomSnapshot.exists && tableForWallet(roomSnapshot.data(), walletId); if (!current) throw new TeaError(409, 'Sit at a table first.', 'not_seated'); const ref = games().doc(current.table.id); const snapshot = await tx.get(ref); if (!snapshot.exists) throw new TeaError(404, 'Game not found.', 'game_not_found'); const game = snapshot.data();
        if (input.gameId !== game.id) throw new TeaError(409, 'This game has changed. Refresh the table.', 'stale_game');
        if (!game.players.includes(walletId)) throw new TeaError(403, 'You are watching this game. Join the next one.', 'not_player');
        const attemptRef = cardAttempts().doc(hash(`${walletId}:${game.id}:${requestId}`)); const prior = await tx.get(attemptRef);
        const before = JSON.stringify(game); applyTimeout(game); const timeoutChanged = before !== JSON.stringify(game);
        if (prior.exists) { if (timeoutChanged) tx.update(ref, game); return cardPublic(game, walletId, current.table); }
        const reject = (status, message, code) => { if (timeoutChanged) tx.update(ref, game); return { error: { status, message, code }, tableId: game.tableId }; };
        if (input.expectedVersion !== undefined && input.expectedVersion !== (game.version || 1)) return reject(409, 'The turn has changed. Refresh the table.', 'stale_game_version');
        if (game.status !== 'active') return reject(409, 'This game has ended.', 'game_finished');
        if (game.players[game.turnIndex] !== walletId) return reject(409, 'Wait for your turn.', 'not_turn');
        if (now() < (game.nextActionAt || 0)) return reject(409, 'Give everyone a moment to see the played cards.', 'turn_not_ready');
        if (input.action === 'draw') { drawCards(game, walletId, 1); recordCardAction(game, walletId, 'draw'); advance(game); }
        else if (input.action === 'play') {
          const hand = game.hands[walletId]; const card = hand.find(value => value.id === input.cardId); const top = game.discard.at(-1);
          if (!card || !cardMatches(card, top, game.activeColor)) return reject(400, 'That card cannot be played.', 'invalid_card');
          if (card.kind === 'wild' && !COLORS.includes(input.color)) return reject(400, 'Choose a color.', 'color_required');
          hand.splice(hand.indexOf(card), 1); game.discard.push(card); game.activeColor = card.kind === 'wild' ? input.color : card.color; recordCardAction(game, walletId, 'play', card);
          if (!hand.length) { game.status = 'finished'; game.winnerId = walletId; game.finishedAt = iso(now()); }
          else if (card.kind === 'draw2') { const next = game.players[(game.turnIndex + 1) % game.players.length]; drawCards(game, next, 2); advance(game, 2); }
          else if (card.kind === 'skip') advance(game, 2); else advance(game);
        }
        else return reject(400, 'Unknown action.', 'bad_action');
        applyTimeout(game); const view = cardPublic(game, walletId, current.table); tx.update(ref, game); tx.create(attemptRef, { walletId, gameId: game.id, createdAt: iso(now()) }); return view;
      });
      io?.to(`table:${result.tableId}`).emit('tea:card', { tableId: result.tableId });
      if (result.error) throw new TeaError(result.error.status, result.error.message, result.error.code); return result;
    },
    async startTableGame(token,input){const result=await tableGames.start(await walletIdFor(token),input);io?.to(`table:${result.tableId}`).emit('tea:table-game',{key:result.key});return result},
    async startTienLen(token, input) { return tienLen.start(await walletIdFor(token), input); },
    async tienLenState(token) { return tienLen.state(await walletIdFor(token)); },
    async tienLenAction(token, input) { return tienLen.action(await walletIdFor(token), input); },
    async startClassicCard(token, input) { return classicCards.start(await walletIdFor(token), input); },
    async classicCardState(token, key) { return classicCards.state(await walletIdFor(token), key); },
    async classicCardAction(token, input) { return classicCards.action(await walletIdFor(token), input); },
    async tableGameState(token,key){return tableGames.state(await walletIdFor(token),key)},
    async tableGameAction(token,input){const result=await tableGames.action(await walletIdFor(token),input);io?.to(`table:${result.tableId}`).emit('tea:table-game',{key:result.key});return result},
    async adminOrders() { requireDb(); const snapshot = await orders().where('createdMs', '>', 0).orderBy('createdMs').limit(200).get(); return snapshot.docs.map(doc => doc.data()).sort((a, b) => b.createdMs - a.createdMs); },
    async updatePrices(input) { const value=await menu(); for(const kind of Object.keys(MENU)){if(input[kind]===undefined)continue;const price=Number(input[kind]);if(!Number.isSafeInteger(price)||price<1000||price>1_000_000)throw new TeaError(400,'Prices must be whole VND amounts.','bad_price');value[kind]=price}value.updatedAt=iso(now());await settings().set(value);return value; },
    async redeliver(orderId) { const snapshot = await items().doc(`tea-${orderId}`).get(); if (!snapshot.exists) throw new TeaError(404, 'Item not found.', 'item_not_found'); await items().doc(`tea-${orderId}`).set({ ...snapshot.data(), status: 'waiting', deliverAt: null, updatedAt: iso(now()) }); await prepareDelivery(snapshot.data().walletId); },
    async maintenance() {
      if (!db) return; const expired = await messages().where('purgeAt', '<', now()).limit(200).get(); for (const doc of expired.docs) await messages().doc(doc.data().id).delete();
      for (const [walletId, player] of presence) if (!player.connected && now() - player.disconnectedAt >= 45_000) await service.releaseDisconnected(walletId);
      for (const [id, row] of seatRequests) if (row.expiresAt <= now() || (row.respondedAt && now() - row.respondedAt > 30_000)) seatRequests.delete(id);
      for (const [id, row] of fights) { resolveFight(row); if (row.finishedAt && now() - row.finishedAt > 60_000) fights.delete(id); }
      for(const [id,times] of socialRate)if(times.every(at=>now()-at>30_000))socialRate.delete(id);
    },
    async recoverAfterRestart() {
      for (const row of fights.values()) finishFight(row, 'server_restart');
      if (!db) return;
      await db.runTransaction(async tx => {
        const roomRef = rooms().doc(ROOM_ID); const roomSnapshot = await tx.get(roomRef); const gameRows = [];
        for (const table of TABLES) gameRows.push([games().doc(table.id), await tx.get(games().doc(table.id))]);
        if (roomSnapshot.exists) tx.set(roomRef, emptyRoom());
        for (const [ref, snapshot] of gameRows) if (snapshot.exists && snapshot.data().status === 'active') tx.update(ref, { ...snapshot.data(), version: (snapshot.data().version || 1) + 1, status: 'finished', reason: 'server_restart', winnerId: null, finishedAt: iso(now()) });
      });
      await tableGames.cancelAfterRestart();
      await tienLen.cancelAfterRestart();
      await classicCards.cancelAfterRestart();
    },
  };
  return service;
}

module.exports = { createTeaService, TeaError, TABLES, MENU_DEFAULTS, emptyRoom, makeDeck, cardMatches };
