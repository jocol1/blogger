const crypto = require('node:crypto');
const { COURT_QUESTIONS, WRITER_QUESTIONS, WORD_PAIRS, CHALLENGES, DRAWING_PROMPTS } = require('./content');
const {
  DRAWING_RETENTION_MS,
  beginDrawingGame,
  assignmentFor,
  contributionId,
  suggestionFor,
  advanceDrawing,
  validateDrawingInput,
  processDrawing,
} = require('./drawing');

const ROOM_COST = 19;
const PAID_DURATION_MS = 2 * 60 * 60 * 1000;
const PURCHASE_HOLD_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const GAME_LABELS = { court: 'Tòa án bạn thân', writer: 'Ai viết câu này?', undercover: 'Kẻ nằm vùng', drawing: 'Vẽ chuyền tay' };
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const iso = value => new Date(value).toISOString();
const cleanToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
const cleanRequestId = value => typeof value === 'string' && /^[a-f0-9-]{16,80}$/i.test(value) ? value : null;
const cleanCode = value => typeof value === 'string' && /^[A-Z2-9]{6}$/.test(value.toUpperCase()) ? value.toUpperCase() : null;
const clone = value => structuredClone(value);
const appendHistory = (wallet, entry) => [...(Array.isArray(wallet.history) ? wallet.history : []), entry].slice(-100);

class PartyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function cleanName(value) {
  if (typeof value !== 'string') throw new PartyError(400, 'Biệt danh không hợp lệ.');
  const name = value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 30) throw new PartyError(400, 'Biệt danh phải từ 1 đến 30 ký tự.');
  return name;
}
function cleanText(value, max) {
  if (typeof value !== 'string') throw new PartyError(400, 'Nội dung không hợp lệ.');
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (!text || text.length > max) throw new PartyError(400, `Nội dung phải từ 1 đến ${max} ký tự.`);
  return text;
}
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
}
function pickIndex(seed, length) { return Number.parseInt(hash(seed).slice(0, 8), 16) % length; }
function deterministicToken(secret, value) { return crypto.createHmac('sha256', secret).update(value).digest('hex'); }
function scoresFor(players) { return Object.fromEntries(players.map(player => [player.id, 0])); }
function playerName(room, id) { return room.players.find(player => player.id === id)?.name || 'Người chơi'; }
function alivePlayers(room) { return room.players.filter(player => !room.game?.eliminated?.includes(player.id)); }
function shuffledIds(seed, ids) {
  const values = [...ids];
  for (let index = values.length - 1; index > 0; index--) {
    const swap = pickIndex(`${seed}:${index}`, index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}
function winnerIds(votes, eligibleIds) {
  const counts = {};
  for (const target of Object.values(votes || {})) if (eligibleIds.includes(target)) counts[target] = (counts[target] || 0) + 1;
  const best = Math.max(0, ...Object.values(counts));
  return best ? eligibleIds.filter(id => counts[id] === best) : [];
}

function beginGame(room, key, at) {
  if (key === 'drawing') return beginDrawingGame(room, at, DRAWING_PROMPTS);
  const gameNumber = (room.gameNumber || 0) + 1;
  const seed = `${room.code}:${gameNumber}:${at}`;
  const base = { key, label: GAME_LABELS[key], status: 'active', round: 1, gameNumber, scores: scoresFor(room.players), startedAt: at };
  if (key === 'court') {
    return { ...base, maxRounds: 5, phase: 'vote', phaseEndsAt: at + 20_000, questionIndex: pickIndex(seed, COURT_QUESTIONS.length), question: COURT_QUESTIONS[pickIndex(seed, COURT_QUESTIONS.length)], votes: {}, verdicts: {}, defense: '', accusedId: null, challenge: null, outcome: null };
  }
  if (key === 'writer') {
    return { ...base, maxRounds: 5, phase: 'answer', phaseEndsAt: at + 30_000, questionIndex: pickIndex(seed, WRITER_QUESTIONS.length), question: WRITER_QUESTIONS[pickIndex(seed, WRITER_QUESTIONS.length)], responses: {}, selectedWriterId: null, selectedResponse: '', guesses: {}, result: null };
  }
  const pairIndex = pickIndex(seed, WORD_PAIRS.length);
  const order = shuffledIds(seed, room.players.map(player => player.id));
  return { ...base, maxRounds: 3, phase: 'clue', phaseEndsAt: at + 20_000, pairIndex, normalWord: WORD_PAIRS[pairIndex][0], undercoverWord: WORD_PAIRS[pairIndex][1], undercoverId: order[0], clueOrder: order, clueIndex: 0, clues: [], votes: {}, eliminated: [], tieIds: [], revote: false, winner: null };
}

function finishGame(room, at, extra = {}) {
  room.game = { ...room.game, ...extra, status: 'finished', phase: 'finished', phaseEndsAt: null, finishedAt: at };
  room.status = 'lobby';
  room.players = room.players.map(player => ({ ...player, ready: false }));
  if (room.packageStatus === 'active' && at >= room.activeUntil) room.packageStatus = 'expired';
}
function nextCourtRound(room, at) {
  if (room.game.round >= room.game.maxRounds) return finishGame(room, at);
  const round = room.game.round + 1;
  const index = pickIndex(`${room.code}:court:${room.game.gameNumber}:${round}`, COURT_QUESTIONS.length);
  room.game = { ...room.game, round, phase: 'vote', phaseEndsAt: at + 20_000, questionIndex: index, question: COURT_QUESTIONS[index], votes: {}, verdicts: {}, defense: '', accusedId: null, challenge: null, outcome: null };
}
function nextWriterRound(room, at) {
  if (room.game.round >= room.game.maxRounds) return finishGame(room, at);
  const round = room.game.round + 1;
  const index = pickIndex(`${room.code}:writer:${room.game.gameNumber}:${round}`, WRITER_QUESTIONS.length);
  room.game = { ...room.game, round, phase: 'answer', phaseEndsAt: at + 30_000, questionIndex: index, question: WRITER_QUESTIONS[index], responses: {}, selectedWriterId: null, selectedResponse: '', guesses: {}, result: null };
}
function resolveCourtVote(room, at) {
  const ids = room.players.map(player => player.id);
  const tied = winnerIds(room.game.votes, ids);
  if (!tied.length) {
    room.game = { ...room.game, phase: 'result', phaseEndsAt: at + 10_000, outcome: 'Không ai bị réo ở vòng này.', accusedId: null };
    return;
  }
  const accusedId = tied[pickIndex(`${room.code}:court-tie:${room.game.round}`, tied.length)];
  room.game = { ...room.game, phase: 'defense', phaseEndsAt: at + 30_000, accusedId, defense: '' };
}
function resolveCourtVerdict(room, at) {
  const values = Object.values(room.game.verdicts || {});
  const punish = values.filter(value => value === 'punish').length;
  const forgive = values.filter(value => value === 'forgive').length;
  const isPunished = punish > forgive;
  const challenge = isPunished ? CHALLENGES[pickIndex(`${room.code}:challenge:${room.game.gameNumber}:${room.game.round}`, CHALLENGES.length)] : null;
  const accused = room.game.accusedId;
  const scores = { ...room.game.scores };
  if (accused) scores[accused] = (scores[accused] || 0) + 1;
  room.game = { ...room.game, scores, phase: 'result', phaseEndsAt: at + 10_000, challenge, outcome: isPunished ? 'punish' : 'forgive' };
}
function resolveWriterAnswers(room, at) {
  const ids = Object.keys(room.game.responses || {});
  if (!ids.length) {
    room.game = { ...room.game, phase: 'result', phaseEndsAt: at + 10_000, result: { skipped: true } };
    return;
  }
  const selectedWriterId = ids[pickIndex(`${room.code}:writer-answer:${room.game.gameNumber}:${room.game.round}`, ids.length)];
  room.game = { ...room.game, phase: 'guess', phaseEndsAt: at + 20_000, selectedWriterId, selectedResponse: room.game.responses[selectedWriterId], guesses: {} };
}
function resolveWriterGuesses(room, at) {
  const writerId = room.game.selectedWriterId;
  const scores = { ...room.game.scores };
  let wrong = 0;
  for (const [playerId, targetId] of Object.entries(room.game.guesses || {})) {
    if (targetId === writerId) scores[playerId] = (scores[playerId] || 0) + 1;
    else wrong++;
  }
  if (writerId && wrong) scores[writerId] = (scores[writerId] || 0) + 1;
  room.game = { ...room.game, scores, phase: 'result', phaseEndsAt: at + 10_000, result: { writerId, wrong } };
}
function advanceUndercoverClue(room, at) {
  const game = room.game;
  if (game.clueIndex + 1 < game.clueOrder.length) {
    room.game = { ...game, clueIndex: game.clueIndex + 1, phaseEndsAt: at + 20_000 };
  } else {
    room.game = { ...game, phase: 'discussion', phaseEndsAt: at + 60_000 };
  }
}
function resolveUndercoverVotes(room, at) {
  const aliveIds = alivePlayers(room).map(player => player.id);
  const tied = winnerIds(room.game.votes, aliveIds);
  if (tied.length > 1 && !room.game.revote) {
    room.game = { ...room.game, phase: 'vote', phaseEndsAt: at + 20_000, votes: {}, tieIds: tied, revote: true };
    return;
  }
  const selected = tied.length ? tied[pickIndex(`${room.code}:undercover-tie:${room.game.round}`, tied.length)] : aliveIds[pickIndex(`${room.code}:undercover-empty:${room.game.round}`, aliveIds.length)];
  const eliminated = [...room.game.eliminated, selected];
  if (selected === room.game.undercoverId) return finishGame(room, at, { eliminated, winner: 'citizens' });
  const remaining = room.players.filter(player => !eliminated.includes(player.id));
  if (remaining.length <= 3 || room.game.round >= room.game.maxRounds) return finishGame(room, at, { eliminated, winner: 'undercover' });
  const round = room.game.round + 1;
  const order = shuffledIds(`${room.code}:undercover:${room.game.gameNumber}:${round}`, remaining.map(player => player.id));
  room.game = { ...room.game, round, phase: 'clue', phaseEndsAt: at + 20_000, eliminated, clueOrder: order, clueIndex: 0, votes: {}, tieIds: [], revote: false };
}
function advancePhase(room, at) {
  if (!room.game || room.game.status !== 'active' || room.game.phaseEndsAt == null || at < room.game.phaseEndsAt) return false;
  const phase = room.game.phase;
  if (room.game.key === 'court') {
    if (phase === 'vote') resolveCourtVote(room, at);
    else if (phase === 'defense') room.game = { ...room.game, phase: 'verdict', phaseEndsAt: at + 15_000, verdicts: {} };
    else if (phase === 'verdict') resolveCourtVerdict(room, at);
    else if (phase === 'result') nextCourtRound(room, at);
  } else if (room.game.key === 'writer') {
    if (phase === 'answer') resolveWriterAnswers(room, at);
    else if (phase === 'guess') resolveWriterGuesses(room, at);
    else if (phase === 'result') nextWriterRound(room, at);
  } else if (room.game.key === 'undercover') {
    if (phase === 'clue') advanceUndercoverClue(room, at);
    else if (phase === 'discussion') room.game = { ...room.game, phase: 'vote', phaseEndsAt: at + 30_000, votes: {}, tieIds: [], revote: false };
    else if (phase === 'vote') resolveUndercoverVotes(room, at);
  } else if (room.game.key === 'drawing') advanceDrawing(room, room.game.phaseEndsAt);
  return true;
}
function progressRoom(room, at) {
  let changed = false;
  for (let count = 0; count < 20 && advancePhase(room, at); count++) changed = true;
  if (changed) { room.version++; room.updatedAt = at; }
  return changed;
}

function publicRoom(room, playerId, at) {
  const self = room.players.find(player => player.id === playerId);
  if (!self) throw new PartyError(401, 'Bạn không còn ở trong phòng.');
  const players = room.players.map(player => ({
    id: player.id,
    name: player.name,
    ready: player.ready,
    isHost: player.id === room.hostPlayerId,
    isBillingOwner: player.id === room.billingPlayerId,
    eliminated: Boolean(room.game?.eliminated?.includes(player.id)),
    score: room.game?.scores?.[player.id] || 0,
  }));
  let game = null;
  if (room.game) {
    const source = room.game;
    game = { key: source.key, label: source.label, status: source.status, phase: source.phase, round: source.round, maxRounds: source.maxRounds, phaseEndsAt: source.phaseEndsAt, startedAt: source.startedAt, finishedAt: source.finishedAt || null, scores: source.scores || {} };
    if (source.key === 'court') {
      game.question = source.question;
      game.accusedId = source.accusedId;
      if (['verdict', 'result', 'finished'].includes(source.phase)) game.defense = source.defense;
      if (['result', 'finished'].includes(source.phase)) { game.outcome = source.outcome; game.challenge = source.challenge; }
      game.hasActed = Boolean(source.phase === 'vote' ? source.votes?.[playerId] : source.phase === 'verdict' ? source.verdicts?.[playerId] : source.phase === 'defense' ? source.defense : false);
    } else if (source.key === 'writer') {
      game.question = source.question;
      game.hasActed = Boolean(source.phase === 'answer' ? source.responses?.[playerId] : source.phase === 'guess' ? source.guesses?.[playerId] : false);
      if (['guess', 'result', 'finished'].includes(source.phase)) game.selectedResponse = source.selectedResponse;
      if (source.phase === 'guess') game.isSelectedWriter = source.selectedWriterId === playerId;
      if (['result', 'finished'].includes(source.phase)) game.result = source.result;
    } else if (source.key === 'drawing') {
      game.gameId = source.gameId;
      game.turn = source.turn;
      game.submittedCount = source.submittedIds?.length || 0;
      game.hasActed = Boolean(source.submittedIds?.includes(playerId));
    } else {
      game.currentPlayerId = source.clueOrder?.[source.clueIndex] || null;
      game.clues = (source.clues || []).map(item => ({ playerId: item.playerId, name: playerName(room, item.playerId), text: item.text }));
      game.eliminated = source.eliminated || [];
      game.tieIds = source.tieIds || [];
      game.hasActed = Boolean(source.phase === 'vote' ? source.votes?.[playerId] : source.phase === 'clue' ? source.clues?.some(item => item.playerId === playerId && item.round === source.round) : false);
      if (source.status === 'active' && !(source.eliminated || []).includes(playerId)) {
        game.secretWord = playerId === source.undercoverId ? source.undercoverWord : source.normalWord;
        game.secretRole = playerId === source.undercoverId ? 'undercover' : 'citizen';
      }
      if (source.status === 'finished') {
        game.winner = source.winner;
        game.undercoverId = source.undercoverId;
        game.normalWord = source.normalWord;
        game.undercoverWord = source.undercoverWord;
      }
    }
  }
  return {
    code: room.code,
    status: room.status,
    version: room.version,
    locked: room.locked,
    selectedGame: room.selectedGame,
    selectedGameLabel: GAME_LABELS[room.selectedGame],
    players,
    self: { id: self.id, name: self.name, isHost: self.id === room.hostPlayerId, isBillingOwner: self.id === room.billingPlayerId },
    game,
    entitlement: {
      trialAvailable: !room.trialUsed,
      trialUsed: room.trialUsed,
      packageStatus: room.packageStatus,
      purchaseDeadline: room.purchaseDeadline,
      activeUntil: room.activeUntil,
      cost: ROOM_COST,
    },
    serverNow: at,
  };
}

function createPartyService({ db, secret = process.env.SESSION_SECRET || 'dev-party-secret', now = () => Date.now() }) {
  let maintenanceTimer = null;
  const col = name => db.collection(name);
  const rooms = () => col('party_rooms');
  const tokens = () => col('party_tokens');
  const actions = () => col('party_actions');
  const drawingContributions = () => col('party_drawing_contributions');
  const wallets = () => col('game_wallets');
  const walletTokens = () => col('game_wallet_tokens');
  const ready = () => Boolean(db);
  const requireReady = () => { if (!ready()) throw new PartyError(503, 'Locly Party chưa sẵn sàng.'); };

  function requireDrawingInput(game, playerId, input, expectedKind) {
    try { return validateDrawingInput(game, playerId, input, expectedKind); }
    catch (error) { throw new PartyError(error.status || 400, error.message); }
  }

  function fallbackContribution(room, game, chainId, turn) {
    const authorId = game.playerOrder[(game.playerOrder.indexOf(chainId) + turn) % game.playerOrder.length];
    if (turn === 0) return { kind: 'prompt', text: suggestionFor(game, chainId, DRAWING_PROMPTS), skipped: false, authorId, authorName: playerName(room, authorId), automatic: true };
    return { kind: turn % 2 ? 'drawing' : 'guess', skipped: true, authorId, authorName: playerName(room, authorId) };
  }

  async function contributionView(room, game, chainId, turn, revealAuthor) {
    const id = contributionId(game.gameId, chainId, turn);
    const snapshot = await drawingContributions().doc(id).get();
    const row = snapshot.exists ? snapshot.data() : null;
    const base = row ? { kind: row.kind, skipped: false, ...(row.kind === 'drawing' ? { imageId: id } : { text: row.text }) } : fallbackContribution(room, game, chainId, turn);
    if (!revealAuthor) {
      delete base.authorId; delete base.authorName;
      return base;
    }
    if (row) { base.authorId = row.playerId; base.authorName = playerName(room, row.playerId); }
    return base;
  }

  async function publicState(room, playerId, at) {
    const output = publicRoom(room, playerId, at);
    if (room.game?.key !== 'drawing') return output;
    const game = room.game;
    if (game.status === 'active') {
      const assignment = assignmentFor(game, playerId);
      output.game.assignment = { kind: assignment.kind, chainId: assignment.chainId };
      output.game.suggestion = assignment.kind === 'prompt' ? suggestionFor(game, assignment.chainId, DRAWING_PROMPTS) : null;
      output.game.previous = game.turn > 0 ? await contributionView(room, game, assignment.chainId, game.turn - 1, false) : null;
    } else if (game.status === 'finished') {
      if (at >= game.finishedAt + DRAWING_RETENTION_MS) {
        output.game.expired = true;
        output.game.chains = [];
      } else {
        output.game.chains = await Promise.all(game.playerOrder.map(async chainId => ({
          id: chainId,
          ownerName: playerName(room, chainId),
          contributions: await Promise.all(Array.from({ length: game.playerOrder.length }, (_, turn) => contributionView(room, game, chainId, turn, true))),
        })));
      }
    }
    return output;
  }

  async function walletIdFor(token) {
    const valid = cleanToken(token);
    if (!valid) throw new PartyError(401, 'Mã ví không hợp lệ.');
    const snapshot = await walletTokens().doc(hash(valid)).get();
    if (!snapshot.exists) throw new PartyError(401, 'Không tìm thấy ví.');
    return snapshot.data().walletId;
  }
  async function playerFor(code, token) {
    const valid = cleanToken(token);
    if (!valid) throw new PartyError(401, 'Mã người chơi không hợp lệ.');
    const snapshot = await tokens().doc(hash(valid)).get();
    if (!snapshot.exists || snapshot.data().code !== code) throw new PartyError(401, 'Không tìm thấy người chơi trong phòng.');
    return snapshot.data();
  }
  async function refundExpiredPurchase(code, at) {
    return db.runTransaction(async tx => {
      const roomRef = rooms().doc(code);
      const snapshot = await tx.get(roomRef);
      if (!snapshot.exists) return null;
      const room = snapshot.data();
      if (room.packageStatus !== 'paid' || !room.purchaseDeadline || at < room.purchaseDeadline) return room;
      const walletRef = wallets().doc(room.ownerWalletId);
      const walletSnapshot = await tx.get(walletRef);
      if (!walletSnapshot.exists) throw new PartyError(503, 'Không thể hoàn xu cho phòng.');
      const wallet = walletSnapshot.data();
      const balance = wallet.balance + ROOM_COST;
      const updatedAt = iso(at);
      tx.update(walletRef, { balance, updatedAt, history: appendHistory(wallet, { id: `party-refund-${code}-${room.purchaseId}`, type: 'party_refund', amount: ROOM_COST, balance, createdAt: updatedAt }) });
      const next = { ...room, packageStatus: 'refunded', purchaseDeadline: null, version: room.version + 1, updatedAt: at };
      tx.update(roomRef, { packageStatus: next.packageStatus, purchaseDeadline: null, version: next.version, updatedAt: at });
      return next;
    });
  }

  async function state(codeValue, partyToken) {
    requireReady();
    const code = cleanCode(codeValue);
    if (!code) throw new PartyError(400, 'Mã phòng không hợp lệ.');
    const player = await playerFor(code, partyToken);
    let room = await refundExpiredPurchase(code, now());
    if (!room) throw new PartyError(404, 'Không tìm thấy phòng.');
    const at = now();
    if (room.game?.status === 'active' && room.game.phaseEndsAt != null && at >= room.game.phaseEndsAt) {
      room = await db.runTransaction(async tx => {
        const ref = rooms().doc(code);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
        const next = clone(snapshot.data());
        if (progressRoom(next, at)) tx.update(ref, next);
        return next;
      });
    }
    return publicState(room, player.playerId, at);
  }

  function requireHost(room, playerId) {
    if (room.hostPlayerId !== playerId) throw new PartyError(403, 'Chỉ chủ phòng điều khiển thao tác này.');
  }
  function validateTarget(room, targetId) {
    if (!room.players.some(player => player.id === targetId)) throw new PartyError(400, 'Người chơi không hợp lệ.');
  }
  function applyGameAction(room, playerId, input, at) {
    const game = room.game;
    if (!game || game.status !== 'active') throw new PartyError(409, 'Trận chưa bắt đầu.');
    if (game.phaseEndsAt != null && at >= game.phaseEndsAt) { progressRoom(room, at); throw new PartyError(409, 'Lượt này đã hết giờ.'); }
    if (game.key === 'court') {
      if (game.phase === 'vote') {
        validateTarget(room, input.targetId);
        if (input.targetId === playerId) throw new PartyError(400, 'Bạn không thể tự bỏ phiếu cho mình.');
        if (game.votes[playerId]) throw new PartyError(409, 'Bạn đã bỏ phiếu.');
        game.votes[playerId] = input.targetId;
        if (Object.keys(game.votes).length >= room.players.length) resolveCourtVote(room, at);
      } else if (game.phase === 'defense') {
        if (playerId !== game.accusedId) throw new PartyError(403, 'Chỉ bị cáo được biện hộ.');
        if (game.defense) throw new PartyError(409, 'Bạn đã gửi lời biện hộ.');
        game.defense = cleanText(input.text, 300);
        game.phase = 'verdict'; game.phaseEndsAt = at + 15_000; game.verdicts = {};
      } else if (game.phase === 'verdict') {
        if (playerId === game.accusedId) throw new PartyError(403, 'Bị cáo không được tự phán quyết.');
        if (!['forgive', 'punish'].includes(input.choice)) throw new PartyError(400, 'Phán quyết không hợp lệ.');
        if (game.verdicts[playerId]) throw new PartyError(409, 'Bạn đã phán quyết.');
        game.verdicts[playerId] = input.choice;
        if (Object.keys(game.verdicts).length >= room.players.length - 1) resolveCourtVerdict(room, at);
      } else throw new PartyError(409, 'Hãy chờ vòng tiếp theo.');
    } else if (game.key === 'writer') {
      if (game.phase === 'answer') {
        if (game.responses[playerId]) throw new PartyError(409, 'Bạn đã gửi câu trả lời.');
        game.responses[playerId] = cleanText(input.text, 200);
        if (Object.keys(game.responses).length >= room.players.length) resolveWriterAnswers(room, at);
      } else if (game.phase === 'guess') {
        if (playerId === game.selectedWriterId) throw new PartyError(403, 'Tác giả không cần đoán câu của mình.');
        validateTarget(room, input.targetId);
        if (game.guesses[playerId]) throw new PartyError(409, 'Bạn đã đoán.');
        game.guesses[playerId] = input.targetId;
        if (Object.keys(game.guesses).length >= room.players.length - 1) resolveWriterGuesses(room, at);
      } else throw new PartyError(409, 'Hãy chờ vòng tiếp theo.');
    } else if (game.key === 'drawing') {
      throw new PartyError(400, 'Hãy gửi bài Vẽ chuyền tay bằng đúng biểu mẫu của lượt này.');
    } else {
      if ((game.eliminated || []).includes(playerId)) throw new PartyError(403, 'Bạn đã bị loại khỏi ván.');
      if (game.phase === 'clue') {
        if (game.clueOrder[game.clueIndex] !== playerId) throw new PartyError(403, 'Chưa tới lượt bạn.');
        game.clues.push({ playerId, text: cleanText(input.text, 100), round: game.round });
        advanceUndercoverClue(room, at);
      } else if (game.phase === 'vote') {
        const allowed = game.revote ? game.tieIds : alivePlayers(room).map(player => player.id);
        if (!allowed.includes(input.targetId)) throw new PartyError(400, 'Lá phiếu không hợp lệ.');
        if (input.targetId === playerId) throw new PartyError(400, 'Bạn không thể tự bỏ phiếu cho mình.');
        if (game.votes[playerId]) throw new PartyError(409, 'Bạn đã bỏ phiếu.');
        game.votes[playerId] = input.targetId;
        const voters = alivePlayers(room).length;
        if (Object.keys(game.votes).length >= voters) resolveUndercoverVotes(room, at);
      } else throw new PartyError(409, 'Hãy chờ giai đoạn bỏ phiếu.');
    }
  }

  return {
    publicConfig() { return { ready: ready(), cost: ROOM_COST, durationMs: PAID_DURATION_MS, holdMs: PURCHASE_HOLD_MS, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, games: Object.entries(GAME_LABELS).map(([key, label]) => ({ key, label })) }; },
    async createRoom(walletToken, input) {
      requireReady();
      const walletId = await walletIdFor(walletToken);
      const requestId = cleanRequestId(input?.requestId);
      const name = cleanName(input?.name);
      if (!requestId) throw new PartyError(400, 'Yêu cầu tạo phòng không hợp lệ.');
      const playerId = hash(`owner:${walletId}:${requestId}`).slice(0, 24);
      const partyToken = deterministicToken(secret, `party-owner:${walletId}:${requestId}`);
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const created = await db.runTransaction(async tx => {
          const walletRef = wallets().doc(walletId);
          const walletSnapshot = await tx.get(walletRef);
          const tokenRef = tokens().doc(hash(partyToken));
          const existingToken = await tx.get(tokenRef);
          if (existingToken.exists) {
            const oldRoom = await tx.get(rooms().doc(existingToken.data().code));
            return oldRoom.exists ? oldRoom.data() : null;
          }
          if (!walletSnapshot.exists) throw new PartyError(404, 'Không tìm thấy ví.');
          const wallet = walletSnapshot.data();
          if (wallet.activePartyCode) {
            const active = await tx.get(rooms().doc(wallet.activePartyCode));
            if (active.exists && active.data().status !== 'closed') throw new PartyError(409, `Bạn đang sở hữu phòng ${wallet.activePartyCode}.`);
          }
          const roomRef = rooms().doc(code);
          if ((await tx.get(roomRef)).exists) return null;
          const at = now();
          const row = { code, ownerWalletId: walletId, billingPlayerId: playerId, hostPlayerId: playerId, status: 'lobby', locked: false, selectedGame: 'court', players: [{ id: playerId, name, ready: false, joinedAt: at }], trialUsed: Boolean(wallet.partyTrialUsed), packageStatus: 'none', purchaseDeadline: null, activeUntil: null, purchaseId: null, game: null, gameNumber: 0, version: 1, createdAt: at, updatedAt: at, deleteAt: null };
          tx.create(roomRef, row);
          tx.create(tokenRef, { code, playerId, createdAt: at });
          tx.update(walletRef, { activePartyCode: code, updatedAt: iso(at) });
          return row;
        });
        if (created) return { token: partyToken, room: await publicState(created, playerId, now()) };
      }
      throw new PartyError(503, 'Chưa tạo được mã phòng. Vui lòng thử lại.');
    },
    async join(codeValue, input) {
      requireReady();
      const code = cleanCode(codeValue);
      const requestId = cleanRequestId(input?.requestId);
      const name = cleanName(input?.name);
      if (!code || !requestId) throw new PartyError(400, 'Yêu cầu vào phòng không hợp lệ.');
      const partyToken = deterministicToken(secret, `party-join:${code}:${requestId}`);
      const playerId = hash(`player:${code}:${requestId}`).slice(0, 24);
      const room = await db.runTransaction(async tx => {
        const roomRef = rooms().doc(code);
        const tokenRef = tokens().doc(hash(partyToken));
        const snapshot = await tx.get(roomRef);
        const existingToken = await tx.get(tokenRef);
        if (!snapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
        const current = snapshot.data();
        if (existingToken.exists) return current;
        if (current.status === 'closed') throw new PartyError(409, 'Phòng đã đóng.');
        if (current.locked) throw new PartyError(409, 'Phòng đang khóa.');
        if (current.status !== 'lobby' || current.game?.status === 'active') throw new PartyError(409, 'Trận đang diễn ra. Hãy vào sau khi trận kết thúc.');
        if (current.players.length >= MAX_PLAYERS) throw new PartyError(409, 'Phòng đã đủ 10 người.');
        if (current.players.some(player => player.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) throw new PartyError(409, 'Biệt danh này đã có trong phòng.');
        const at = now();
        const next = { ...current, players: [...current.players, { id: playerId, name, ready: false, joinedAt: at }], version: current.version + 1, updatedAt: at };
        tx.update(roomRef, next);
        tx.create(tokenRef, { code, playerId, createdAt: at });
        return next;
      });
      return { token: partyToken, room: await publicState(room, playerId, now()) };
    },
    state,
    async purchase(codeValue, partyToken, walletToken, input) {
      requireReady();
      const code = cleanCode(codeValue);
      const requestId = cleanRequestId(input?.requestId);
      if (!code || !requestId) throw new PartyError(400, 'Yêu cầu mua gói không hợp lệ.');
      const player = await playerFor(code, partyToken);
      const walletId = await walletIdFor(walletToken);
      const at = now();
      const room = await db.runTransaction(async tx => {
        const roomRef = rooms().doc(code);
        const walletRef = wallets().doc(walletId);
        const attemptRef = col('party_purchases').doc(hash(`${walletId}:${requestId}`));
        const roomSnapshot = await tx.get(roomRef);
        const walletSnapshot = await tx.get(walletRef);
        const previous = await tx.get(attemptRef);
        if (!roomSnapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
        const current = roomSnapshot.data();
        if (current.billingPlayerId !== player.playerId || current.ownerWalletId !== walletId) throw new PartyError(403, 'Chỉ chủ ví tạo phòng được mua gói.');
        if (previous.exists || ['paid', 'active'].includes(current.packageStatus)) return current;
        if (!current.trialUsed) throw new PartyError(409, 'Hãy chơi trận miễn phí trước khi mua gói.');
        if (!walletSnapshot.exists || walletSnapshot.data().balance < ROOM_COST) throw new PartyError(409, 'Ví cần đủ 19 xu để mở phòng.');
        const wallet = walletSnapshot.data();
        const balance = wallet.balance - ROOM_COST;
        const purchaseId = hash(`${walletId}:${requestId}`).slice(0, 32);
        const next = { ...current, packageStatus: 'paid', purchaseDeadline: at + PURCHASE_HOLD_MS, purchaseId, version: current.version + 1, updatedAt: at };
        tx.update(walletRef, { balance, updatedAt: iso(at), history: appendHistory(wallet, { id: `party-purchase-${purchaseId}`, type: 'party_cost', amount: -ROOM_COST, balance, createdAt: iso(at) }) });
        tx.update(roomRef, next);
        tx.create(attemptRef, { walletId, code, purchaseId, createdAt: at });
        return next;
      });
      return publicState(room, player.playerId, at);
    },
    async action(codeValue, partyToken, input) {
      requireReady();
      const code = cleanCode(codeValue);
      const requestId = cleanRequestId(input?.requestId);
      const type = String(input?.type || '');
      if (!code || !requestId || !type) throw new PartyError(400, 'Thao tác phòng không hợp lệ.');
      const player = await playerFor(code, partyToken);
      const at = now();
      const room = await db.runTransaction(async tx => {
        const roomRef = rooms().doc(code);
        const actionRef = actions().doc(hash(`${code}:${player.playerId}:${requestId}`));
        const snapshot = await tx.get(roomRef);
        const previous = await tx.get(actionRef);
        if (!snapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
        if (previous.exists) return snapshot.data();
        const current = clone(snapshot.data());
        progressRoom(current, at);
        if (!current.players.some(item => item.id === player.playerId)) throw new PartyError(403, 'Bạn không còn ở trong phòng.');
        if (current.status === 'closed') throw new PartyError(409, 'Phòng đã đóng.');
        let walletRef = null; let wallet = null;
        if (type === 'start_game' || type === 'close_room') {
          walletRef = wallets().doc(current.ownerWalletId);
          const walletSnapshot = await tx.get(walletRef);
          if (!walletSnapshot.exists) throw new PartyError(503, 'Không tìm thấy ví chủ phòng.');
          wallet = walletSnapshot.data();
        }
        if (type === 'ready') {
          if (current.status !== 'lobby') throw new PartyError(409, 'Không thể đổi trạng thái khi đang chơi.');
          current.players = current.players.map(item => item.id === player.playerId ? { ...item, ready: input.ready === true } : item);
        } else if (type === 'select_game') {
          requireHost(current, player.playerId);
          if (!GAME_LABELS[input.game] || current.status !== 'lobby') throw new PartyError(400, 'Trò chơi không hợp lệ.');
          current.selectedGame = input.game;
        } else if (type === 'lock') {
          requireHost(current, player.playerId); current.locked = input.locked === true;
        } else if (type === 'kick') {
          requireHost(current, player.playerId);
          if (input.targetId === current.billingPlayerId) throw new PartyError(400, 'Không thể loại chủ ví.');
          validateTarget(current, input.targetId);
          if (current.status !== 'lobby') throw new PartyError(409, 'Chỉ loại người chơi ở phòng chờ.');
          current.players = current.players.filter(item => item.id !== input.targetId);
        } else if (type === 'transfer') {
          requireHost(current, player.playerId); validateTarget(current, input.targetId); current.hostPlayerId = input.targetId;
        } else if (type === 'start_game') {
          requireHost(current, player.playerId);
          if (current.game?.status === 'active') throw new PartyError(409, 'Một trận đang diễn ra.');
          if (current.players.length < MIN_PLAYERS) throw new PartyError(409, 'Cần ít nhất 3 người để bắt đầu.');
          if (current.players.some(item => !item.ready)) throw new PartyError(409, 'Mọi người cần bấm sẵn sàng.');
          if (!current.trialUsed) {
            current.trialUsed = true;
            tx.update(walletRef, { partyTrialUsed: true, updatedAt: iso(at) });
          } else if (current.packageStatus === 'paid' && current.purchaseDeadline > at) {
            current.packageStatus = 'active'; current.activeUntil = at + PAID_DURATION_MS; current.purchaseDeadline = null;
          } else if (!(current.packageStatus === 'active' && current.activeUntil > at)) {
            throw new PartyError(409, 'Bạn cần mua gói 19 xu để chơi tiếp.');
          }
          current.game = beginGame(current, current.selectedGame, at);
          current.gameNumber = current.game.gameNumber;
          current.status = 'playing';
        } else if (type === 'game_action') {
          if (current.game?.key === 'drawing') {
            const assignment = assignmentFor(current.game, player.playerId);
            if (!assignment) throw new PartyError(400, 'Không tìm thấy lượt của bạn.');
            requireDrawingInput(current.game, player.playerId, input, assignment.kind);
            if (assignment.kind === 'drawing') throw new PartyError(400, 'Lượt này cần gửi một bức vẽ.');
            const text = cleanText(input.text, 120);
            const id = contributionId(current.game.gameId, assignment.chainId, current.game.turn);
            tx.create(drawingContributions().doc(id), {
              id, code, gameId: current.game.gameId, chainId: assignment.chainId, turn: current.game.turn,
              kind: assignment.kind, playerId: player.playerId, text, createdAt: at, purgeAt: current.game.purgeAt,
            });
            current.game.submittedIds.push(player.playerId);
            if (current.game.submittedIds.length >= current.players.length) advanceDrawing(current, at);
          } else applyGameAction(current, player.playerId, input, at);
        } else if (type === 'close_room') {
          if (current.billingPlayerId !== player.playerId) throw new PartyError(403, 'Chỉ chủ ví được đóng phòng.');
          if (current.game?.status === 'active') throw new PartyError(409, 'Hãy kết thúc trận trước khi đóng phòng.');
          current.status = 'closed'; current.deleteAt = at + RETENTION_MS;
          tx.update(walletRef, { activePartyCode: null, updatedAt: iso(at) });
        } else throw new PartyError(400, 'Loại thao tác không hợp lệ.');
        current.version++;
        current.updatedAt = at;
        tx.update(roomRef, current);
        tx.create(actionRef, { code, playerId: player.playerId, type, createdAt: at });
        return current;
      });
      return publicState(room, player.playerId, at);
    },
    async submitDrawing(codeValue, partyToken, input, file) {
      requireReady();
      const code = cleanCode(codeValue);
      const requestId = cleanRequestId(input?.requestId);
      if (!code || !requestId) throw new PartyError(400, 'Yêu cầu gửi hình không hợp lệ.');
      const player = await playerFor(code, partyToken);
      let data;
      try { data = await processDrawing(file); }
      catch (error) { throw new PartyError(error.status || 400, error.message); }
      const at = now();
      const room = await db.runTransaction(async tx => {
        const roomRef = rooms().doc(code);
        const actionRef = actions().doc(hash(`${code}:${player.playerId}:${requestId}`));
        const snapshot = await tx.get(roomRef);
        const previous = await tx.get(actionRef);
        if (!snapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
        if (previous.exists) return snapshot.data();
        const current = clone(snapshot.data());
        progressRoom(current, at);
        const assignment = requireDrawingInput(current.game, player.playerId, input, 'drawing');
        const id = contributionId(current.game.gameId, assignment.chainId, current.game.turn);
        tx.create(drawingContributions().doc(id), {
          id, code, gameId: current.game.gameId, chainId: assignment.chainId, turn: current.game.turn,
          kind: 'drawing', playerId: player.playerId, data, mime: 'image/webp', size: data.length,
          createdAt: at, purgeAt: current.game.purgeAt,
        });
        current.game.submittedIds.push(player.playerId);
        if (current.game.submittedIds.length >= current.players.length) advanceDrawing(current, at);
        current.version++;
        current.updatedAt = at;
        tx.update(roomRef, current);
        tx.create(actionRef, { code, playerId: player.playerId, type: 'drawing_upload', createdAt: at });
        return current;
      });
      return publicState(room, player.playerId, at);
    },
    async drawingImage(codeValue, partyToken, imageIdValue) {
      requireReady();
      const code = cleanCode(codeValue);
      const imageId = typeof imageIdValue === 'string' && /^[a-f0-9]{32}-\d{2}-[a-f0-9]{24}$/.test(imageIdValue) ? imageIdValue : null;
      if (!code || !imageId) throw new PartyError(400, 'Ảnh vẽ không hợp lệ.');
      const player = await playerFor(code, partyToken);
      const roomSnapshot = await rooms().doc(code).get();
      if (!roomSnapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
      const room = roomSnapshot.data();
      const game = room.game;
      if (!game || game.key !== 'drawing' || !imageId.startsWith(`${game.gameId}-`)) throw new PartyError(404, 'Không tìm thấy ảnh vẽ.');
      if (game.status === 'active') {
        const assignment = assignmentFor(game, player.playerId);
        const allowedId = game.turn > 0 ? contributionId(game.gameId, assignment.chainId, game.turn - 1) : null;
        if (imageId !== allowedId) throw new PartyError(403, 'Bạn chưa được xem bức vẽ này.');
      } else if (game.status !== 'finished' || now() >= game.finishedAt + DRAWING_RETENTION_MS) throw new PartyError(410, 'Kết quả trận đã hết thời hạn lưu trữ.');
      const image = await drawingContributions().doc(imageId).get();
      if (!image.exists || image.data().code !== code || image.data().kind !== 'drawing') throw new PartyError(404, 'Không tìm thấy ảnh vẽ.');
      return { buffer: Buffer.from(image.data().data), mime: 'image/webp' };
    },
    async adminRooms() {
      requireReady();
      const snapshot = await rooms().where('updatedAt', '>', 0).orderBy('updatedAt').limit(100).get();
      return snapshot.docs.map(doc => {
        const room = doc.data();
        return { code: room.code, status: room.status, players: room.players.length, selectedGame: room.selectedGame, packageStatus: room.packageStatus, activeUntil: room.activeUntil, updatedAt: room.updatedAt };
      }).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async adminCancel(codeValue, reason) {
      requireReady();
      const code = cleanCode(codeValue);
      const note = cleanText(reason, 300);
      if (!code) throw new PartyError(400, 'Mã phòng không hợp lệ.');
      return db.runTransaction(async tx => {
        const roomRef = rooms().doc(code);
        const snapshot = await tx.get(roomRef);
        if (!snapshot.exists) throw new PartyError(404, 'Không tìm thấy phòng.');
        const room = snapshot.data();
        if (room.status === 'closed') return { success: true, refunded: room.adminRefunded === true };
        const walletRef = wallets().doc(room.ownerWalletId);
        const walletSnapshot = await tx.get(walletRef);
        if (!walletSnapshot.exists) throw new PartyError(503, 'Không tìm thấy ví chủ phòng.');
        const wallet = walletSnapshot.data();
        const shouldRefund = ['paid', 'active'].includes(room.packageStatus) && !room.adminRefunded;
        const balance = wallet.balance + (shouldRefund ? ROOM_COST : 0);
        const at = now();
        const history = shouldRefund ? appendHistory(wallet, { id: `party-admin-refund-${code}`, type: 'party_refund', amount: ROOM_COST, balance, reason: note, createdAt: iso(at) }) : wallet.history;
        tx.update(walletRef, { balance, activePartyCode: null, history, updatedAt: iso(at) });
        tx.update(roomRef, { status: 'closed', packageStatus: shouldRefund ? 'refunded' : room.packageStatus, adminRefunded: shouldRefund, adminReason: note, deleteAt: at + RETENTION_MS, version: room.version + 1, updatedAt: at });
        return { success: true, refunded: shouldRefund };
      });
    },
    async runMaintenance() {
      if (!ready()) return;
      const at = now();
      const expired = await rooms().where('purchaseDeadline', '<', at).limit(50).get();
      for (const doc of expired.docs) await refundExpiredPurchase(doc.data().code, at);
      const staleDrawings = await drawingContributions().where('purgeAt', '<', at).limit(100).get();
      for (const doc of staleDrawings.docs) await drawingContributions().doc(doc.data().id).delete();
      const deletions = await rooms().where('deleteAt', '<', at).limit(50).get();
      for (const doc of deletions.docs) await doc.ref?.delete?.();
    },
    async startMaintenance() {
      if (!ready() || maintenanceTimer) return;
      await this.runMaintenance();
      maintenanceTimer = setInterval(() => this.runMaintenance().catch(error => console.error('Party maintenance failed:', error.code || error.name)), 60_000);
      maintenanceTimer.unref?.();
    },
    stopMaintenance() { if (maintenanceTimer) clearInterval(maintenanceTimer); maintenanceTimer = null; },
  };
}

module.exports = { createPartyService, PartyError, ROOM_COST, PAID_DURATION_MS, PURCHASE_HOLD_MS, MIN_PLAYERS, MAX_PLAYERS };
