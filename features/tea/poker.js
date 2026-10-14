const crypto = require('node:crypto');

const TURN_MS = 30_000;
const ACTION_HOLD_MS = 1_100;
const HISTORY_LIMIT = 48;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const STARTING_STACK = 1_000;
const CATEGORIES = ['high_card', 'pair', 'two_pair', 'three_of_a_kind', 'straight', 'flush', 'full_house', 'four_of_a_kind', 'straight_flush'];
const LABELS = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code, classicCardError: true }); };
const clone = value => JSON.parse(JSON.stringify(value));

function validCards(cards, min, max) {
  return Array.isArray(cards) && cards.length >= min && cards.length <= max
    && cards.every(card => card && Number.isInteger(card.rank) && card.rank >= 2 && card.rank <= 14 && Number.isInteger(card.suit) && card.suit >= 0 && card.suit <= 3)
    && new Set(cards.map(card => `${card.rank}:${card.suit}`)).size === cards.length;
}
function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
}
function evaluateFive(cards) {
  if (!validCards(cards, 5, 5)) return null;
  const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
  const counts = new Map();
  ranks.forEach(rank => counts.set(rank, (counts.get(rank) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(card => card.suit === cards[0].suit);
  const unique = [...counts.keys()].sort((a, b) => b - a);
  const straightHigh = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] : unique.join(',') === '14,5,4,3,2' ? 5 : 0;
  let score;
  if (flush && straightHigh) score = [8, straightHigh];
  else if (groups[0][1] === 4) score = [7, groups[0][0], groups[1][0]];
  else if (groups[0][1] === 3 && groups[1][1] === 2) score = [6, groups[0][0], groups[1][0]];
  else if (flush) score = [5, ...ranks];
  else if (straightHigh) score = [4, straightHigh];
  else if (groups[0][1] === 3) score = [3, groups[0][0], ...groups.slice(1).map(group => group[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) score = [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  else if (groups[0][1] === 2) score = [1, groups[0][0], ...groups.slice(1).map(group => group[0])];
  else score = [0, ...ranks];
  return { category: CATEGORIES[score[0]], rankLabel: LABELS[score[0]], value: score[0], score, hand: clone(cards) };
}
function evaluateSeven(cards) {
  if (!validCards(cards, 5, 7)) return null;
  let best = null;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
    const result = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compareScore(result.score, best.score) > 0) best = result;
  }
  return best;
}
function makeDeck() {
  const cards = [];
  for (let rank = 2; rank <= 14; rank++) for (let suit = 0; suit < 4; suit++) cards.push({ id: `pk-${rank}-${suit}`, rank, suit });
  for (let i = cards.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
function contenders(game) { return game.players.filter(id => !game.playerState[id].folded); }
function livePlayers(game) { return contenders(game).filter(id => game.playerState[id].stack > 0); }
function pot(game) { return game.players.reduce((sum, id) => sum + game.playerState[id].totalBet, 0); }
function needsAction(game, id) {
  const p = game.playerState[id];
  return !p.folded && p.stack > 0 && (p.actedAtBet === null || p.bet < game.currentBet);
}
function mayRaise(game, id) {
  const p = game.playerState[id];
  return p.actedAtBet === null || game.currentBet - p.actedAtBet >= game.minRaise;
}
function minRaiseTo(game) { return game.currentBet + game.minRaise; }
function contribute(game, id, amount) {
  const p = game.playerState[id], paid = Math.min(amount, p.stack);
  p.stack -= paid; p.bet += paid; p.totalBet += paid; p.allIn = p.stack === 0;
  return paid;
}
function record(game, playerId, type, amount, at) {
  game.version++;
  game.lastAction = { version: game.version, playerId, type, amount, at };
}
function readyAt(game) {
  return Number.isFinite(game.nextActionAt) ? game.nextActionAt : game.turnEndsAt - TURN_MS;
}
function setTurn(game, index, at, hold = ACTION_HOLD_MS) {
  game.turnIndex = index; game.nextActionAt = at + hold; game.turnEndsAt = game.nextActionAt + TURN_MS;
}
// Keep enough public snapshots to display every action missed by a poll. Never copy
// the private hands, deck or a whole game document into this feed.
function publicAction(game, action) {
  return {
    version: action.version, playerId: action.playerId, type: action.type, amount: action.amount || 0, at: action.at,
    stage: game.stage, board: clone(game.board), pot: game.status === 'finished' ? game.finalPot ?? pot(game) : pot(game),
    turn: game.status === 'active' ? game.players[game.turnIndex] : null,
    nextActionAt: game.status === 'active' ? readyAt(game) : null,
    players: game.players.map(id => {
      const player = game.playerState[id];
      return { id, stack: player.stack, bet: player.bet, totalBet: player.totalBet, folded: player.folded, allIn: player.allIn };
    }),
  };
}
function rememberAction(game) {
  if (!game.lastAction) return;
  const history = Array.isArray(game.actionHistory) ? game.actionHistory : [];
  game.actionHistory = [...history, publicAction(game, game.lastAction)].slice(-HISTORY_LIMIT);
}
function safeHistory(game) {
  return (Array.isArray(game.actionHistory) ? game.actionHistory : []).slice(-HISTORY_LIMIT).map(entry => ({
    version: entry.version, playerId: entry.playerId, type: entry.type, amount: entry.amount, at: entry.at,
    stage: entry.stage, board: clone(entry.board || []), pot: entry.pot, turn: entry.turn, nextActionAt: entry.nextActionAt,
    players: (entry.players || []).map(player => ({ id: player.id, stack: player.stack, bet: player.bet, totalBet: player.totalBet, folded: player.folded, allIn: player.allIn })),
  }));
}
function nextNeeding(game, from) {
  for (let step = 1; step <= game.players.length; step++) {
    const index = (from + step) % game.players.length;
    if (needsAction(game, game.players[index])) return index;
  }
  return -1;
}
function refundUncalled(game) {
  const bets = game.players.map(id => ({ id, bet: game.playerState[id].bet })).sort((a, b) => b.bet - a.bet);
  if (bets[0].bet <= bets[1].bet) return;
  const excess = bets[0].bet - bets[1].bet, p = game.playerState[bets[0].id];
  p.bet -= excess; p.totalBet -= excess; p.stack += excess; p.allIn = false;
  game.currentBet = bets[1].bet;
  game.refunds.push({ playerId: bets[0].id, amount: excess });
}
function dealStreet(game) {
  game.burned.push(game.deck.pop());
  if (game.stage === 'preflop') { game.board.push(game.deck.pop(), game.deck.pop(), game.deck.pop()); game.stage = 'flop'; }
  else if (game.stage === 'flop') { game.board.push(game.deck.pop()); game.stage = 'turn'; }
  else if (game.stage === 'turn') { game.board.push(game.deck.pop()); game.stage = 'river'; }
}
function finish(game, at, uncontested = false) {
  refundUncalled(game);
  const active = contenders(game), totalPot = pot(game), awards = new Map(game.players.map(id => [id, 0]));
  game.finalPot = totalPot;
  if (uncontested || active.length < 2) {
    if (active.length) awards.set(active[0], totalPot);
    // A wrapper may cancel all participants at once. Restore their virtual contributions.
    else game.players.forEach(id => awards.set(id, game.playerState[id].totalBet));
    game.showdown = false;
  } else {
    while (game.board.length < 5) dealStreet(game);
    const evaluations = Object.fromEntries(active.map(id => [id, evaluateSeven([...game.hands[id], ...game.board])]));
    const levels = [...new Set(game.players.map(id => game.playerState[id].totalBet).filter(Boolean))].sort((a, b) => a - b);
    const clockwise = Array.from({ length: game.players.length }, (_, step) => game.players[(game.dealerIndex + step + 1) % game.players.length]);
    let previous = 0;
    for (const level of levels) {
      const contributors = game.players.filter(id => game.playerState[id].totalBet >= level);
      const amount = (level - previous) * contributors.length; previous = level;
      let eligible = active.filter(id => game.playerState[id].totalBet >= level);
      // Only external departures can leave a side pot without a contender.
      if (!eligible.length) eligible = active;
      let winners = [];
      for (const id of eligible) {
        if (!winners.length || compareScore(evaluations[id].score, evaluations[winners[0]].score) > 0) winners = [id];
        else if (compareScore(evaluations[id].score, evaluations[winners[0]].score) === 0) winners.push(id);
      }
      const ordered = clockwise.filter(id => winners.includes(id));
      const share = Math.floor(amount / ordered.length), extra = amount % ordered.length;
      ordered.forEach((id, index) => awards.set(id, awards.get(id) + share + (index < extra ? 1 : 0)));
    }
    game.showdown = true;
    game.results = active.map(id => ({ playerId: id, category: evaluations[id].category, rankLabel: evaluations[id].rankLabel, hand: evaluations[id].hand, won: awards.get(id) }));
  }
  game.payouts = game.players.filter(id => awards.get(id) > 0).map(id => ({ playerId: id, amount: awards.get(id) }));
  game.winnerIds = game.payouts.map(payout => payout.playerId);
  game.payouts.forEach(({ playerId, amount }) => { game.playerState[playerId].stack += amount; });
  game.players.forEach(id => { game.playerState[id].allIn = game.playerState[id].stack === 0 && !game.playerState[id].folded; });
  game.status = 'finished'; game.stage = game.showdown ? 'showdown' : game.stage;
  game.finishedAt = new Date(at).toISOString(); game.turnEndsAt = null; game.nextActionAt = null;
}
function reconcile(game, at, from = game.turnIndex) {
  if (game.status !== 'active') return;
  const active = contenders(game), live = livePlayers(game);
  if (active.length <= 1) { finish(game, at, true); return; }
  if (live.length <= 1 && live.every(id => game.playerState[id].bet >= game.currentBet)) { finish(game, at); return; }
  const next = nextNeeding(game, from);
  if (next !== -1) { setTurn(game, next, at); return; }
  refundUncalled(game);
  if (game.stage === 'river') { finish(game, at); return; }
  dealStreet(game);
  game.currentBet = 0; game.minRaise = BIG_BLIND;
  game.players.forEach(id => { const p = game.playerState[id]; p.bet = 0; p.actedAtBet = null; });
  if (livePlayers(game).length <= 1) { finish(game, at); return; }
  setTurn(game, nextNeeding(game, game.dealerIndex), at);
}
function createGame({ id, tableId, players, names = {}, now, dealerIndex = 0 }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 8 || new Set(players).size !== players.length || players.some(player => typeof player !== 'string')) fail(400, 'Poker needs 2–8 players.', 'bad_player_count');
  if (!Number.isFinite(now)) fail(400, 'A server timestamp is required.', 'bad_clock');
  dealerIndex = Number.isInteger(dealerIndex) ? ((dealerIndex % players.length) + players.length) % players.length : 0;
  const game = { id, tableId, key: 'poker', status: 'active', version: 1, players: [...players], names: Object.fromEntries(players.map(player => [player, names[player] || player])), hands: {}, playerState: {}, deck: makeDeck(), board: [], burned: [], stage: 'preflop', currentBet: BIG_BLIND, minRaise: BIG_BLIND, dealerIndex, turnIndex: 0, turnEndsAt: now + TURN_MS, createdAt: new Date(now).toISOString(), lastAction: null, actionHistory: [], payouts: [], winnerIds: [], refunds: [], showdown: false, botSeed: crypto.randomBytes(4).readUInt32LE(0) || 1 };
  players.forEach(player => { game.hands[player] = []; game.playerState[player] = { stack: STARTING_STACK, bet: 0, totalBet: 0, folded: false, allIn: false, actedAtBet: null }; });
  // Deal one card at a time, beginning left of the dealer.
  for (let round = 0; round < 2; round++) for (let step = 1; step <= players.length; step++) game.hands[players[(dealerIndex + step) % players.length]].push(game.deck.pop());
  game.smallBlindIndex = players.length === 2 ? dealerIndex : (dealerIndex + 1) % players.length;
  game.bigBlindIndex = (game.smallBlindIndex + 1) % players.length;
  contribute(game, players[game.smallBlindIndex], SMALL_BLIND); contribute(game, players[game.bigBlindIndex], BIG_BLIND);
  const openingIndex = (game.bigBlindIndex + 1) % players.length;
  setTurn(game, openingIndex, now, players[openingIndex].startsWith('bot:') ? ACTION_HOLD_MS : 0);
  return game;
}
function applyAction(game, playerId, input, now, timeout = false) {
  if (game.status !== 'active') fail(409, 'This poker hand has ended.', 'game_finished');
  if (!game.players.includes(playerId)) fail(403, 'You are not playing this hand.', 'not_player');
  if (game.players[game.turnIndex] !== playerId || !needsAction(game, playerId)) fail(409, 'Wait for your turn.', 'not_turn');
  if (!Number.isFinite(now) || (!timeout && now >= game.turnEndsAt)) fail(409, 'This turn has expired. Refresh the table.', 'turn_expired');
  if (!timeout && now < readyAt(game)) fail(409, 'Let the previous action finish before playing.', 'turn_not_ready');
  const p = game.playerState[playerId], action = input?.action, owed = Math.max(0, game.currentBet - p.bet), maximum = p.bet + p.stack;
  let amount = 0, type = action;
  if (action === 'fold') p.folded = true;
  else if (action === 'check') { if (owed) fail(400, 'Call or fold when facing a bet.', 'cannot_check'); }
  else if (action === 'call') { if (!owed) fail(400, 'There is no bet to call. Check instead.', 'cannot_call'); amount = contribute(game, playerId, owed); }
  else if (action === 'raise' || action === 'allin') {
    const noOpponent = livePlayers(game).length < 2;
    const target = action === 'allin' ? noOpponent ? Math.min(maximum, game.currentBet) : maximum : input.raiseTo;
    if (!Number.isSafeInteger(target) || target <= p.bet || target > maximum) fail(400, 'Choose a whole-chip amount within your stack.', 'bad_raise');
    if (target <= game.currentBet) {
      if (action !== 'allin') fail(400, 'A raise must exceed the current bet.', 'bad_raise');
      amount = contribute(game, playerId, p.stack);
    } else {
      if (noOpponent) fail(409, 'There is no opponent left who can call a raise.', 'no_raise_opponent');
      if (!mayRaise(game, playerId)) fail(409, 'A short all-in has not reopened your right to raise.', 'raise_not_reopened');
      const minimum = minRaiseTo(game);
      if (target < minimum && target !== maximum) fail(400, 'Raise by at least the last full raise, or go all-in.', 'raise_too_small');
      const full = target >= minimum, oldBet = game.currentBet;
      amount = contribute(game, playerId, target - p.bet); game.currentBet = target;
      if (full) game.minRaise = target - oldBet;
    }
  } else fail(400, 'Choose check, call, fold, raise or all-in.', 'bad_action');
  p.actedAtBet = game.currentBet;
  record(game, playerId, timeout ? `timeout_${type}` : type, amount, now);
  reconcile(game, now, game.turnIndex);
  rememberAction(game);
  return game;
}
function act(game, playerId, input, now) { return applyAction(game, playerId, input, now); }
function botRandom(game) {
  let value = game.botSeed >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  game.botSeed = value >>> 0 || 1;
  return game.botSeed / 0x1_0000_0000;
}
// This function intentionally accepts only a public view plus the bot's own two cards.
function chooseBotAction(state, roll = 0.5) {
  const cards = [...state.hand, ...state.board];
  const ownPair = state.hand.length === 2 && state.hand[0].rank === state.hand[1].rank;
  const rank = cards.length >= 5 ? evaluateSeven(cards)?.value || 0 : ownPair ? 1 : 0;
  const high = state.hand.some(card => card.rank >= 12), me = state.players.find(player => player.id === state.turn);
  const strong = ownPair || rank >= 2;
  if (state.canRaise && strong && roll < 0.10 && state.toCall <= BIG_BLIND * 2) return { action: 'raise', raiseTo: Math.min(state.maxRaiseTo, state.minRaiseTo) };
  if (state.canCheck) return { action: 'check' };
  const affordable = state.toCall <= Math.max(BIG_BLIND, Math.floor((me?.stack || 0) * (strong ? 0.5 : high ? 0.2 : 0.08)));
  return affordable ? { action: 'call' } : { action: 'fold' };
}
function progress(game, now) {
  if (game.status !== 'active') return game;
  // Resolve an externally folded player before checking whose deadline it is.
  const live = livePlayers(game);
  if (contenders(game).length <= 1 || (live.length <= 1 && live.every(id => game.playerState[id].bet >= game.currentBet)) || !needsAction(game, game.players[game.turnIndex])) reconcile(game, Math.min(now, game.turnEndsAt), game.turnIndex);
  for (let guard = 0; guard < 2_048 && game.status === 'active'; guard++) {
    const playerId = game.players[game.turnIndex];
    if (playerId.startsWith('bot:')) {
      const at = readyAt(game);
      if (now < at) break;
      act(game, playerId, chooseBotAction(view(game, playerId, at), botRandom(game)), at);
    } else if (now >= game.turnEndsAt) {
      const at = game.turnEndsAt, p = game.playerState[playerId], action = p.bet < game.currentBet ? 'fold' : 'check';
      applyAction(game, playerId, { action }, at, true);
    } else break;
  }
  return game;
}
function cancel(game, now, reason = 'player_left') {
  if (game.status !== 'active') return game;
  game.players.forEach(id => {
    const player = game.playerState[id];
    player.stack += player.totalBet; player.bet = 0; player.totalBet = 0; player.allIn = false;
  });
  game.version++; game.status = 'finished'; game.reason = reason; game.finishedAt = new Date(now).toISOString();
  game.turnEndsAt = null; game.nextActionAt = null; game.showdown = false; game.finalPot = 0;
  game.winnerIds = []; game.payouts = []; delete game.results;
  return game;
}
function depart(game, playerIds, now, abandon = false) {
  if (game.status !== 'active') return game;
  for (const id of playerIds) if (game.playerState[id] && !game.playerState[id].folded) {
    game.playerState[id].folded = true; record(game, id, 'leave', 0, now); rememberAction(game);
  }
  if (abandon) cancel(game, now);
  else progress(game, now);
  return game;
}
function view(game, walletId, now) {
  const own = game.playerState[walletId], turnId = game.status === 'active' ? game.players[game.turnIndex] : null;
  const actor = Boolean(own && turnId === walletId && !own.folded && own.stack > 0), owed = own ? Math.max(0, game.currentBet - own.bet) : 0;
  const maximum = own ? own.bet + own.stack : 0, raiseAllowed = actor && livePlayers(game).length > 1 && maximum > game.currentBet && mayRaise(game, walletId);
  const result = {
    id: game.id, tableId: game.tableId, key: 'poker', status: game.status, version: game.version,
    players: game.players.map(id => { const p = game.playerState[id]; return { id, name: game.names[id], bot: id.startsWith('bot:'), stack: p.stack, bet: p.bet, totalBet: p.totalBet, folded: p.folded, allIn: p.allIn, ...(game.status === 'finished' && game.showdown && !p.folded ? { hand: clone(game.hands[id]) } : {}) }; }),
    hand: clone(game.hands[walletId] || []), board: clone(game.board), pot: game.status === 'finished' ? game.finalPot ?? pot(game) : pot(game),
    stage: game.stage, turn: turnId, turnEndsAt: game.turnEndsAt, nextActionAt: game.status === 'active' ? readyAt(game) : null, serverNow: now,
    canAct: Boolean(actor && now >= readyAt(game) && now < game.turnEndsAt),
    dealerId: game.players[game.dealerIndex], smallBlindId: game.players[game.smallBlindIndex], bigBlindId: game.players[game.bigBlindIndex],
    currentBet: game.currentBet, toCall: owed, minRaiseTo: minRaiseTo(game), maxRaiseTo: maximum,
    canCheck: actor && owed === 0, canRaise: Boolean(raiseAllowed && maximum >= minRaiseTo(game)), canAllIn: Boolean(actor && (maximum <= game.currentBet || raiseAllowed || (livePlayers(game).length < 2 && owed > 0))),
    winnerIds: [...game.winnerIds], payouts: clone(game.payouts), lastAction: game.lastAction ? clone(game.lastAction) : null, actionHistory: safeHistory(game), reason: game.reason || null,
    ...(game.status === 'finished' && game.showdown ? { results: clone(game.results) } : {}),
  };
  return result;
}

module.exports = { createGame, act, progress, depart, cancel, view, evaluateFive, evaluateSeven, chooseBotAction, makeDeck, compareScore, TURN_MS, ACTION_HOLD_MS, SMALL_BLIND, BIG_BLIND, STARTING_STACK };
