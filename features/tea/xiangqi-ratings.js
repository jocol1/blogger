// Elo ratings, win streaks and the shared leaderboard for café Xiangqi.
// load() runs before any write in a transaction; settle() is pure and returns the documents to write.
const RATINGS = 'tea_xiangqi_ratings';
const META = 'tea_xiangqi_meta';
const START = 1000;
const BOT_RATING = { easy: 800, medium: 1200, hard: 1600 };
const TIERS = [0, 900, 1150, 1400, 1650, 1900]; // tier index -> minimum rating, titles live in the client
const tierOf = rating => TIERS.reduce((tier, min, index) => rating >= min ? index : tier, 0);
const humans = game => game.players.filter(id => !id.startsWith('bot:'));
const blank = name => ({ rating: START, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, name });
const expected = (mine, theirs) => 1 / (1 + 10 ** ((theirs - mine) / 400));

async function load(tx, db, game) {
  const docs = {};
  for (const id of humans(game)) { const snap = await tx.get(db.collection(RATINGS).doc(id)); docs[id] = snap.exists ? snap.data() : null; }
  const board = await tx.get(db.collection(META).doc('leaderboard'));
  return { docs, board: board.exists ? board.data() : { players: [] } };
}

function isRated(game) {
  const xq = game.xq;
  return xq.rated && !game.last?.canceled && xq.history.length >= 4;
}

// Returns the list of {collection,id,data} writes and records the outcome on the game. Safe to call repeatedly.
function settle(game, pre, now) {
  if (game.key !== 'xiangqi' || game.status !== 'finished' || game.ratedAt) return [];
  game.ratedAt = now;
  if (!isRated(game) || !pre) return [];
  const xq = game.xq, ids = humans(game), writes = [], change = {};
  const result = id => game.winnerIds.length === 0 ? 0.5 : game.winnerIds.includes(id) ? 1 : 0;
  const before = {};
  for (const id of ids) before[id] = pre.docs[id] || blank(game.names[id] || 'Guest');
  for (const id of ids) {
    const mine = before[id], other = game.players.find(p => p !== id);
    const theirs = other.startsWith('bot:') ? BOT_RATING[xq.level] || BOT_RATING.medium : before[other].rating;
    const score = result(id), games = mine.wins + mine.losses + mine.draws, k = games < 10 ? 40 : 24;
    let delta = Math.round(k * (score - expected(mine.rating, theirs)));
    if (score === 1) delta = Math.max(1, delta);
    const rating = Math.max(100, mine.rating + delta);
    const streak = score === 1 ? mine.streak + 1 : 0;
    const data = { rating, wins: mine.wins + (score === 1 ? 1 : 0), losses: mine.losses + (score === 0 ? 1 : 0), draws: mine.draws + (score === 0.5 ? 1 : 0), streak, bestStreak: Math.max(mine.bestStreak, streak), name: game.names[id] || mine.name, updatedAt: now };
    writes.push({ collection: RATINGS, id, data });
    change[id] = { before: mine.rating, after: rating, delta: rating - mine.rating, streak, bestStreak: data.bestStreak, tier: tierOf(rating), tierUp: tierOf(rating) > tierOf(mine.rating) };
  }
  xq.ratingChange = change;
  // Keep a small pool: the top 20 by rating plus the top 10 best streaks. Enough for both boards, one document.
  const pool = new Map((pre.board.players || []).map(player => [player.id, player]));
  for (const write of writes) pool.set(write.id, { id: write.id, name: write.data.name, rating: write.data.rating, streak: write.data.streak, bestStreak: write.data.bestStreak });
  const all = [...pool.values()], keep = new Set([...all].sort((a, b) => b.rating - a.rating).slice(0, 20).concat([...all].sort((a, b) => b.bestStreak - a.bestStreak).slice(0, 10)).map(player => player.id));
  writes.push({ collection: META, id: 'leaderboard', data: { players: all.filter(player => keep.has(player.id)), updatedAt: now } });
  return writes;
}

async function leaderboard(db, walletId) {
  const board = await db.collection(META).doc('leaderboard').get(), mine = await db.collection(RATINGS).doc(walletId).get();
  const players = board.exists ? board.data().players || [] : [];
  const shape = player => ({ name: player.name, rating: player.rating, tier: tierOf(player.rating), streak: player.streak, bestStreak: player.bestStreak, me: player.id === walletId });
  const record = mine.exists ? mine.data() : null;
  return {
    top: [...players].sort((a, b) => b.rating - a.rating).slice(0, 20).map(shape),
    streaks: [...players].filter(player => player.bestStreak > 0).sort((a, b) => b.bestStreak - a.bestStreak || b.rating - a.rating).slice(0, 10).map(shape),
    me: record ? { rating: record.rating, tier: tierOf(record.rating), wins: record.wins, losses: record.losses, draws: record.draws, streak: record.streak, bestStreak: record.bestStreak } : { rating: START, tier: tierOf(START), wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 },
  };
}

function snapshot(game, pre) {
  const out = {};
  for (const id of humans(game)) { const doc = pre?.docs[id]; out[id] = { rating: doc?.rating ?? START, streak: doc?.streak ?? 0, tier: tierOf(doc?.rating ?? START) }; }
  return out;
}

module.exports = { load, settle, leaderboard, snapshot, tierOf, BOT_RATING, START, TIERS };
