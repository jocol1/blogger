const crypto = require('node:crypto');
const sharp = require('sharp');

const DRAWING_WIDTH = 800;
const DRAWING_HEIGHT = 600;
const MAX_DRAWING_INPUT_BYTES = 1024 * 1024;
const MAX_DRAWING_STORED_BYTES = 128 * 1024;
const DRAWING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const pickIndex = (seed, length) => Number.parseInt(digest(seed).slice(0, 8), 16) % length;

function kindForTurn(turn) {
  if (turn === 0) return 'prompt';
  return turn % 2 ? 'drawing' : 'guess';
}

function durationForTurn(turn) {
  return kindForTurn(turn) === 'drawing' ? 60_000 : 30_000;
}

function maximumDuration(playerCount) {
  let total = 0;
  for (let turn = 0; turn < playerCount; turn++) total += durationForTurn(turn);
  return total;
}

function shuffledIds(seed, ids) {
  const values = [...ids];
  for (let index = values.length - 1; index > 0; index--) {
    const swap = pickIndex(`${seed}:${index}`, index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

function beginDrawingGame(room, at, prompts) {
  const gameNumber = (room.gameNumber || 0) + 1;
  const gameId = digest(`${room.code}:drawing:${gameNumber}:${at}`).slice(0, 32);
  const playerOrder = shuffledIds(gameId, room.players.map(player => player.id));
  const promptIndexes = Object.fromEntries(playerOrder.map((id, index) => [id, pickIndex(`${gameId}:prompt:${index}`, prompts.length)]));
  return {
    key: 'drawing',
    label: 'Vẽ chuyền tay',
    status: 'active',
    phase: 'contribute',
    round: 1,
    maxRounds: playerOrder.length,
    turn: 0,
    gameNumber,
    gameId,
    playerOrder,
    promptIndexes,
    submittedIds: [],
    phaseStartedAt: at,
    phaseEndsAt: at + durationForTurn(0),
    startedAt: at,
    purgeAt: at + maximumDuration(playerOrder.length) + DRAWING_RETENTION_MS,
    scores: {},
  };
}

function assignmentFor(game, playerId, turn = game.turn) {
  const playerIndex = game.playerOrder.indexOf(playerId);
  if (playerIndex < 0) return null;
  const count = game.playerOrder.length;
  const chainId = game.playerOrder[(playerIndex - turn + count) % count];
  return { chainId, turn, kind: kindForTurn(turn) };
}

function contributionId(gameId, chainId, turn) {
  return `${gameId}-${String(turn).padStart(2, '0')}-${chainId}`;
}

function suggestionFor(game, chainId, prompts) {
  return prompts[game.promptIndexes[chainId] % prompts.length];
}

function advanceDrawing(room, startedAt) {
  const game = room.game;
  const nextTurn = game.turn + 1;
  if (nextTurn >= game.playerOrder.length) {
    room.game = { ...game, status: 'finished', phase: 'finished', phaseEndsAt: null, finishedAt: startedAt, submittedIds: [] };
    room.status = 'lobby';
    room.players = room.players.map(player => ({ ...player, ready: false }));
    if (room.packageStatus === 'active' && startedAt >= room.activeUntil) room.packageStatus = 'expired';
    return;
  }
  room.game = {
    ...game,
    turn: nextTurn,
    round: nextTurn + 1,
    submittedIds: [],
    phaseStartedAt: startedAt,
    phaseEndsAt: startedAt + durationForTurn(nextTurn),
  };
}

function validateDrawingInput(game, playerId, input, expectedKind) {
  if (!game || game.key !== 'drawing' || game.status !== 'active') throw Object.assign(new Error('Trận Vẽ chuyền tay chưa bắt đầu.'), { status: 409 });
  if (input.gameId !== game.gameId || Number(input.turn) !== game.turn) throw Object.assign(new Error('Lượt này đã thay đổi. Bài nháp vẫn được giữ trên thiết bị.'), { status: 409 });
  const assignment = assignmentFor(game, playerId);
  if (!assignment || assignment.kind !== expectedKind) throw Object.assign(new Error('Loại bài gửi không đúng lượt.'), { status: 400 });
  if (game.submittedIds.includes(playerId)) throw Object.assign(new Error('Bạn đã gửi bài ở lượt này.'), { status: 409 });
  return assignment;
}

async function processDrawing(file) {
  if (!file?.buffer || !['image/png', 'image/webp'].includes(file.mimetype)) throw Object.assign(new Error('Chỉ nhận ảnh vẽ PNG hoặc WebP.'), { status: 400 });
  if (file.buffer.length > MAX_DRAWING_INPUT_BYTES) throw Object.assign(new Error('Ảnh vẽ tối đa 1 MB.'), { status: 400 });
  let metadata;
  try {
    metadata = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 4_000_000 }).metadata();
  } catch {
    throw Object.assign(new Error('Tệp gửi lên không phải ảnh hợp lệ.'), { status: 400 });
  }
  if (!['png', 'webp'].includes(metadata.format)) throw Object.assign(new Error('Định dạng ảnh vẽ không hợp lệ.'), { status: 400 });
  let output;
  for (const quality of [82, 72, 62, 52, 42]) {
    output = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 4_000_000 })
      .rotate()
      .resize(DRAWING_WIDTH, DRAWING_HEIGHT, { fit: 'contain', background: '#ffffff', withoutEnlargement: false })
      .flatten({ background: '#ffffff' })
      .webp({ quality, smartSubsample: true })
      .toBuffer();
    if (output.length <= MAX_DRAWING_STORED_BYTES) break;
  }
  if (!output || output.length > MAX_DRAWING_STORED_BYTES) throw Object.assign(new Error('Bức vẽ quá phức tạp để lưu. Hãy bớt nét rồi thử lại.'), { status: 400 });
  return output;
}

module.exports = {
  DRAWING_WIDTH,
  DRAWING_HEIGHT,
  MAX_DRAWING_INPUT_BYTES,
  MAX_DRAWING_STORED_BYTES,
  DRAWING_RETENTION_MS,
  kindForTurn,
  durationForTurn,
  beginDrawingGame,
  assignmentFor,
  contributionId,
  suggestionFor,
  advanceDrawing,
  validateDrawingInput,
  processDrawing,
};
