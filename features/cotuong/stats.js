const GAMES = 'xq_bot_games';
const STATS = 'xq_stats';
const TOTAL_DOC = 'bot';

const PIECES = ['r', 'c', 'n', 'p', 'a', 'b', 'k'];
const STANCES = ['attack', 'defense'];
const RESULTS = ['win', 'loss', 'draw'];
const GAME_ID = /^[a-zA-Z0-9-]{8,64}$/;

/** Counters are kept per player: `wins` are games the player won against the machine. */
const empty = () => ({ games: 0, wins: 0, losses: 0, draws: 0 });

function bump(counts, result) {
  const next = { ...empty(), ...counts };
  next.games += 1;
  if (result === 'win') next.wins += 1;
  else if (result === 'loss') next.losses += 1;
  else next.draws += 1;
  return next;
}

/** Calendar day in Vietnam, so "today" matches the owner's clock rather than UTC. */
function dayKey(at) {
  return new Date(at + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Checks a finished vs-machine game sent by the app; null when it is not one. */
function readGame(body) {
  if (!body || typeof body !== 'object') return null;
  const { gameId, piece, stance, result, plies, reason } = body;
  if (typeof gameId !== 'string' || !GAME_ID.test(gameId)) return null;
  if (!PIECES.includes(piece) || !STANCES.includes(stance) || !RESULTS.includes(result)) return null;
  const length = Number(plies);
  if (!Number.isInteger(length) || length < 0 || length > 1000) return null;
  const why = typeof reason === 'string' && /^[a-z_]{1,24}$/.test(reason) ? reason : 'unknown';
  return { gameId, piece, stance, result, plies: length, reason: why };
}

function createStatsService({ db, now = () => Date.now() }) {
  const games = () => db.collection(GAMES);
  const stats = () => db.collection(STATS).doc(TOTAL_DOC);

  return {
    /** Stores one finished game once (the game id makes a resend harmless) and updates the counters. */
    async record(game, username) {
      const at = now();
      return db.runTransaction(async (tx) => {
        const existing = await tx.get(games().doc(game.gameId));
        if (existing.exists) return false;
        const current = await tx.get(stats());
        const data = current.exists ? current.data() : {};
        const slot = `${game.piece}-${game.stance}`;
        const day = dayKey(at);
        tx.create(games().doc(game.gameId), {
          at,
          piece: game.piece,
          stance: game.stance,
          result: game.result,
          plies: game.plies,
          reason: game.reason,
          username: username || null,
        });
        tx.set(stats(), {
          total: bump(data.total, game.result),
          byOpponent: { ...data.byOpponent, [slot]: bump(data.byOpponent?.[slot], game.result) },
          byDay: { ...data.byDay, [day]: bump(data.byDay?.[day], game.result) },
        });
        return true;
      });
    },

    async summary() {
      const snap = await stats().get();
      const data = snap.exists ? snap.data() : {};
      return {
        total: { ...empty(), ...data.total },
        byOpponent: data.byOpponent || {},
        byDay: data.byDay || {},
      };
    },

    async recent(limit = 50) {
      const snap = await games().orderBy('at', 'desc').limit(limit).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
  };
}

module.exports = { createStatsService, readGame, dayKey, PIECES, STANCES, RESULTS };
