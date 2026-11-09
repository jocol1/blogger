const crypto = require('node:crypto');
const X = require('../../public/tea/xiangqi-rules');
const ratings = require('./xiangqi-ratings');

const MOVE_MS = 60_000;          // two-player clock per move
const BOT_GAME_MS = 600_000;     // idle guard when playing the bot, so abandoned tables free up
const BOT_DELAY = 700;
const QUIET_LIMIT = 120;         // half-moves without a capture before a draw
const LEVELS = ['easy', 'medium', 'hard'];
const EMOTES = ['laugh', 'angry', 'clap', 'tea', 'shock', 'think', 'nice', 'scared', 'check', 'wait', 'luck', 'again'];
const hash = (board, side) => crypto.createHash('sha1').update(board + side).digest('hex').slice(0, 12);
const sideOf = game => (game.turnIndex === 0 ? X.RED : X.BLACK);
const colorOf = (game, id) => (game.players[0] === id ? X.RED : X.BLACK);
const isBot = id => id.startsWith('bot:');

function init(game, at, { opponent, level, ratingSnapshot }) {
  game.turnIndex = 0;
  game.xq = { board: X.START, history: [], hashes: [hash(X.START, X.RED)], quiet: 0, opponent, level, rated: true, undoUsed: {}, hintsUsed: 0, drawOffer: null, undoOffer: null, emotes: [], emoteAt: {}, ratings: ratingSnapshot, ratingChange: null, hint: null };
  game.botReadyAt = at + BOT_DELAY;
  setClock(game, at);
}

function setClock(game, at) {
  game.deadline = at + (game.xq.opponent === 'friend' ? MOVE_MS : BOT_GAME_MS);
}

function conclude(game, winnerId, reason, at) {
  game.status = 'finished'; game.finishedAt = at;
  game.winnerIds = winnerId ? [winnerId] : [];
  if (winnerId) game.scores[winnerId] = (game.scores[winnerId] || 0) + 1;
  game.last = { reason, winnerId: winnerId || null, ply: game.xq.history.length };
  game.xq.drawOffer = null; game.xq.undoOffer = null; game.xq.hint = null;
}
const opponentOf = (game, id) => game.players.find(p => p !== id);

function record(game, from, to, at) {
  const xq = game.xq, piece = xq.board[from], captured = xq.board[to];
  const mover = sideOf(game);
  xq.board = X.applyMove(xq.board, from, to);
  xq.history.push({ f: from, t: to, p: piece, c: captured === '.' ? '' : captured });
  xq.quiet = captured === '.' ? xq.quiet + 1 : 0;
  game.turnIndex = 1 - game.turnIndex;
  xq.hashes.push(hash(xq.board, sideOf(game)));
  xq.drawOffer = null; xq.undoOffer = null; xq.hint = null;
  setClock(game, at);
  const state = X.status(xq.board, sideOf(game));
  const mover_id = game.players[mover === X.RED ? 0 : 1];
  if (state === 'checkmate') return conclude(game, mover_id, 'checkmate', at);
  if (state === 'stalemate') return conclude(game, mover_id, 'stalemate', at);
  const current = xq.hashes[xq.hashes.length - 1];
  if (xq.hashes.filter(h => h === current).length >= 3) return conclude(game, null, 'repetition', at);
  if (xq.quiet >= QUIET_LIMIT) return conclude(game, null, 'moveLimit', at);
}

// Rebuild board, hashes and the quiet counter after taking moves back.
function rewind(game, plies, at) {
  const xq = game.xq;
  xq.history.splice(xq.history.length - plies, plies);
  let board = X.START, quiet = 0; const hashes = [hash(board, X.RED)];
  xq.history.forEach((move, index) => { board = X.applyMove(board, move.f, move.t); quiet = move.c ? 0 : quiet + 1; hashes.push(hash(board, index % 2 === 0 ? X.BLACK : X.RED)); });
  xq.board = board; xq.quiet = quiet; xq.hashes = hashes;
  game.turnIndex = xq.history.length % 2;
  xq.drawOffer = null; xq.undoOffer = null; xq.hint = null;
  setClock(game, at);
}

function progress(game, at) {
  const xq = game.xq;
  for (let guard = 0; guard < 4 && game.status === 'active'; guard++) {
    const id = game.players[game.turnIndex];
    if (isBot(id)) {
      if (at < (game.botReadyAt || 0)) break;
      const move = X.bestMove(xq.board, sideOf(game), { level: xq.level, seed: game.id + ':' + xq.history.length });
      if (!move) { conclude(game, opponentOf(game, id), 'checkmate', at); break; }
      record(game, move.from, move.to, at);
      continue;
    }
    if (at >= game.deadline) { conclude(game, opponentOf(game, id), 'timeout', game.deadline); }
    break;
  }
}

// A seated player stood up. After a few moves that is a forfeit instead of a cancelled game.
function forfeit(game, goneIds, at) {
  const loser = goneIds[0], winner = opponentOf(game, loser);
  conclude(game, goneIds.includes(winner) ? null : winner, 'left', at);
}

function view(game, id) {
  const xq = game.xq, mine = game.players.includes(id) ? colorOf(game, id) : null, last = xq.history[xq.history.length - 1] || null;
  const captured = { red: [], black: [] };
  for (const move of xq.history) if (move.c) captured[X.sideOf(move.c)].push(move.c);
  const side = sideOf(game), friend = xq.opponent === 'friend', hint = xq.hint && xq.hint.for === id && xq.hint.ply === xq.history.length ? { from: xq.hint.from, to: xq.hint.to } : null;
  return {
    phase: 'play', board: xq.board, side, myColor: mine, opponent: xq.opponent, level: xq.level, timed: friend, moves: xq.history.length,
    lastMove: last ? { from: last.f, to: last.t } : null, check: game.status === 'active' && X.inCheck(xq.board, side), captured,
    drawOffer: xq.drawOffer ? (xq.drawOffer === id ? 'mine' : 'theirs') : null,
    undoOffer: xq.undoOffer ? (xq.undoOffer === id ? 'mine' : 'theirs') : null,
    undosLeft: Math.max(0, (friend ? 2 : 3) - (xq.undoUsed[id] || 0)), hintsLeft: friend ? 0 : Math.max(0, 3 - xq.hintsUsed), hint,
    rated: xq.rated, ratings: xq.ratings, ratingChange: xq.ratingChange, reason: game.last?.reason || null,
    emotes: xq.emotes.map(e => ({ id: e.id, name: e.name, code: e.code, at: e.at, mine: e.id === id })),
    colors: { red: game.players[0], black: game.players[1] },
  };
}

function play(game, id, input, at, fail) {
  const xq = game.xq, friend = xq.opponent === 'friend', myTurn = game.players[game.turnIndex] === id;
  if (input.type === 'move') {
    if (!myTurn) fail(409, 'Wait for your turn.', 'xiangqi_not_turn');
    if (input.ply !== xq.history.length) fail(409, 'The board has changed.', 'xiangqi_stale');
    if (!X.isLegal(xq.board, sideOf(game), input.from, input.to)) fail(400, 'That move is not allowed.', 'xiangqi_bad_move');
    record(game, input.from, input.to, at);
    if (game.status === 'active' && !friend) game.botReadyAt = at + BOT_DELAY;
    return;
  }
  if (input.type === 'resign') return conclude(game, opponentOf(game, id), 'resign', at);
  if (input.type === 'draw') {
    if (!friend) fail(400, 'The bot does not offer draws.', 'xiangqi_no_draw');
    if (xq.drawOffer && xq.drawOffer !== id) return conclude(game, null, 'agreed', at);
    if (xq.drawOffer === id) fail(409, 'You already offered a draw.', 'xiangqi_offer_pending');
    xq.drawOffer = id; return;
  }
  if (input.type === 'decline') { if (xq.drawOffer && xq.drawOffer !== id) xq.drawOffer = null; if (xq.undoOffer && xq.undoOffer !== id) xq.undoOffer = null; return; }
  if (input.type === 'undo') {
    if (!friend) {
      if (!myTurn || xq.history.length < 2) fail(409, 'You can take back a move on your turn.', 'xiangqi_cannot_undo');
      if ((xq.undoUsed[id] || 0) >= 3) fail(409, 'No take-backs left.', 'xiangqi_no_undo');
      xq.undoUsed[id] = (xq.undoUsed[id] || 0) + 1; xq.rated = false; rewind(game, 2, at); game.botReadyAt = at + BOT_DELAY; return;
    }
    if (xq.undoOffer && xq.undoOffer !== id) { const asker = xq.undoOffer; xq.undoUsed[asker] = (xq.undoUsed[asker] || 0) + 1; rewind(game, 1, at); return; }
    if (xq.undoOffer === id) fail(409, 'You already asked.', 'xiangqi_offer_pending');
    if (myTurn || !xq.history.length) fail(409, 'You can ask to take back your last move.', 'xiangqi_cannot_undo');
    if ((xq.undoUsed[id] || 0) >= 2) fail(409, 'No take-backs left.', 'xiangqi_no_undo');
    xq.undoOffer = id; return;
  }
  if (input.type === 'hint') {
    if (friend) fail(400, 'Hints are only for games against the bot.', 'xiangqi_no_hint');
    if (!myTurn) fail(409, 'Wait for your turn.', 'xiangqi_not_turn');
    if (xq.hintsUsed >= 3) fail(409, 'No hints left.', 'xiangqi_no_hint');
    const move = X.bestMove(xq.board, sideOf(game), { level: 'hard', seed: game.id + ':hint:' + xq.history.length });
    if (!move) fail(409, 'No moves left.', 'xiangqi_bad_move');
    xq.hintsUsed++; xq.rated = false; xq.hint = { for: id, from: move.from, to: move.to, ply: xq.history.length }; return;
  }
  fail(400, 'Unknown action.', 'xiangqi_bad_action');
}

// Emotes are allowed for everyone seated at the table, even spectators and after the game ends.
function emote(game, id, name, code, at, fail) {
  const xq = game.xq;
  if (!EMOTES.includes(code)) fail(400, 'Pick one of the reactions.', 'xiangqi_bad_emote');
  if (at - (xq.emoteAt[id] || 0) < 2000) fail(429, 'Wait a moment before the next reaction.', 'xiangqi_emote_rate');
  xq.emoteAt[id] = at;
  xq.emotes.push({ id, name: String(name || 'Guest').slice(0, 24), code, at });
  xq.emotes = xq.emotes.slice(-6);
}

module.exports = { init, progress, view, play, emote, forfeit, LEVELS, EMOTES, MOVE_MS, ratings };
