const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const USERS = 'xq_users';
const USER_IDS = 'xq_user_ids';
const SESSIONS = 'xq_sessions';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
const DUMMY_HASH = bcrypt.hashSync('not-a-user', 10);

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccess(user, secret) {
  const body = Buffer.from(JSON.stringify({
    sub: user.id,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readAccess(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload.username || payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function profileOf(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    gamesPlayed: user.gamesPlayed || 0,
    wins: user.wins || 0,
    losses: user.losses || 0,
    draws: user.draws || 0,
    ratings: { casual: user.casual || 1200, ranked: user.ranked || 1200 },
  };
}

function createAccountService({ db, secret, rounds = 10 }) {
  const users = () => db.collection(USERS);
  const ids = () => db.collection(USER_IDS);
  const sessions = () => db.collection(SESSIONS);

  async function issue(user) {
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    await sessions().doc(tokenHash(refreshToken)).set({
      userId: user.id,
      username: user.username,
      expiresAt: Date.now() + REFRESH_TTL_MS,
    });
    return {
      accessToken: signAccess(user, secret),
      refreshToken,
      user: { id: user.id, username: user.username },
    };
  }

  return {
    async register(username, password) {
      const name = String(username || '').trim().toLowerCase();
      if (!USERNAME.test(name) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return { error: [400, 'VALIDATION_FAILED', 'Username or password is not valid'] };
      }
      const id = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, rounds);
      const record = {
        id,
        username: name,
        passwordHash,
        displayName: name,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        casual: 1200,
        ranked: 1200,
        createdAt: Date.now(),
      };
      try {
        await db.runTransaction(async (tx) => {
          const existing = await tx.get(users().doc(name));
          if (existing.exists) {
            const taken = new Error('taken');
            taken.code = 'USERNAME_TAKEN';
            throw taken;
          }
          tx.create(users().doc(name), record);
          tx.create(ids().doc(id), { username: name });
        });
      } catch (error) {
        if (error.code === 'USERNAME_TAKEN' || error.message === 'Already exists') {
          return { error: [409, 'USERNAME_TAKEN', 'Username is already taken'] };
        }
        throw error;
      }
      return { status: 201, body: await issue(record) };
    },

    async login(username, password) {
      const name = String(username || '').trim().toLowerCase();
      if (!name || name.length > 20 || typeof password !== 'string' || password.length < 1 || password.length > 128) {
        return { error: [400, 'VALIDATION_FAILED', 'Username or password is not valid'] };
      }
      const snap = await users().doc(name).get();
      const user = snap.exists ? snap.data() : null;
      const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
      if (!user || !ok) return { error: [401, 'INVALID_CREDENTIALS', 'Wrong username or password'] };
      if (user.disabled) return { error: [403, 'ACCOUNT_DISABLED', 'This account has been suspended'] };
      return { status: 200, body: await issue(user) };
    },

    async refresh(refreshToken) {
      if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 200) {
        return { error: [401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired'] };
      }
      const ref = sessions().doc(tokenHash(refreshToken));
      const snap = await ref.get();
      const session = snap.exists ? snap.data() : null;
      if (!session || session.expiresAt <= Date.now()) {
        return { error: [401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired'] };
      }
      await ref.delete();
      const userSnap = await users().doc(session.username).get();
      if (!userSnap.exists || userSnap.data().disabled) return { error: [401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired'] };
      return { status: 200, body: await issue(userSnap.data()) };
    },

    async logout(refreshToken) {
      if (typeof refreshToken === 'string' && refreshToken) await sessions().doc(tokenHash(refreshToken)).delete();
    },

    async playerFromAccess(header) {
      const token = String(header || '').replace(/^Bearer\s+/i, '');
      const claims = readAccess(token, secret);
      if (!claims) return null;
      const idSnap = await ids().doc(claims.sub).get();
      const username = idSnap.exists ? idSnap.data().username : claims.username;
      const userSnap = await users().doc(username).get();
      if (!userSnap.exists || userSnap.data().id !== claims.sub || userSnap.data().disabled) return null;
      return profileOf(userSnap.data());
    },

    /** Newest accounts first, without password hashes, for the admin page. */
    async list(limit = 200) {
      const snap = await users().orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((doc) => {
        const user = doc.data();
        return {
          username: user.username,
          createdAt: user.createdAt || 0,
          gamesPlayed: user.gamesPlayed || 0,
          wins: user.wins || 0,
          losses: user.losses || 0,
          draws: user.draws || 0,
          disabled: Boolean(user.disabled),
        };
      });
    },

    async count() {
      const aggregate = users().count?.();
      if (aggregate) return (await aggregate.get()).data().count;
      return (await users().get()).docs.length;
    },

    /** Suspend or restore an account. A suspended player cannot sign in, refresh, or use an old token. */
    async setDisabled(username, disabled) {
      const name = String(username || '').trim().toLowerCase();
      if (!USERNAME.test(name)) return false;
      const ref = users().doc(name);
      if (!(await ref.get()).exists) return false;
      await ref.set({ disabled: Boolean(disabled) }, { merge: true });
      return true;
    },

    /** Delete an account for good. Its tokens stop working because the account no longer exists. */
    async remove(username) {
      const name = String(username || '').trim().toLowerCase();
      if (!USERNAME.test(name)) return false;
      const snap = await users().doc(name).get();
      if (!snap.exists) return false;
      await ids().doc(snap.data().id).delete();
      await users().doc(name).delete();
      return true;
    },

    async playerByName(username) {
      const name = String(username || '').trim().toLowerCase();
      if (!USERNAME.test(name)) return { error: [400, 'VALIDATION_FAILED', 'Username is not valid'] };
      const snap = await users().doc(name).get();
      if (!snap.exists) return { error: [404, 'NOT_FOUND', 'Player not found'] };
      return { status: 200, body: profileOf(snap.data()) };
    },
  };
}

function mountAccounts(router, { db, secret } = {}) {
  const json = require('express').json({ limit: '4kb' });
  const ready = Boolean(db && secret);
  const accounts = ready ? createAccountService({ db, secret }) : null;
  const unavailable = (req, res) => fail(res, 503, 'INTERNAL', 'Accounts are not configured');
  const send = (res, result) => {
    if (result.error) return fail(res, result.error[0], result.error[1], result.error[2]);
    return res.status(result.status).json(result.body);
  };

  router.post('/api/auth/register', json, async (req, res) => {
    if (!accounts) return unavailable(req, res);
    try {
      send(res, await accounts.register(req.body?.username, req.body?.password));
    } catch (error) {
      console.error('Xiangqi register failed:', error.message);
      fail(res, 503, 'INTERNAL', 'Accounts are not available');
    }
  });
  router.post('/api/auth/login', json, async (req, res) => {
    if (!accounts) return unavailable(req, res);
    try {
      send(res, await accounts.login(req.body?.username, req.body?.password));
    } catch (error) {
      console.error('Xiangqi login failed:', error.message);
      fail(res, 503, 'INTERNAL', 'Accounts are not available');
    }
  });
  router.post('/api/auth/refresh', json, async (req, res) => {
    if (!accounts) return unavailable(req, res);
    try {
      send(res, await accounts.refresh(req.body?.refreshToken));
    } catch (error) {
      console.error('Xiangqi refresh failed:', error.message);
      fail(res, 503, 'INTERNAL', 'Accounts are not available');
    }
  });
  router.post('/api/auth/logout', json, async (req, res) => {
    if (accounts) await accounts.logout(req.body?.refreshToken).catch(() => undefined);
    res.status(204).end();
  });
  router.get('/api/me', async (req, res) => {
    if (!accounts) return unavailable(req, res);
    const player = await accounts.playerFromAccess(req.get('authorization'));
    if (!player) return fail(res, 401, 'UNAUTHORIZED', 'You need to sign in');
    res.json(player);
  });
  router.get('/api/matches', async (req, res) => {
    if (!accounts) return unavailable(req, res);
    const player = await accounts.playerFromAccess(req.get('authorization'));
    if (!player) return fail(res, 401, 'UNAUTHORIZED', 'You need to sign in');
    res.json({ items: [], nextCursor: null });
  });
  router.get('/api/players/:username', async (req, res) => {
    if (!accounts) return unavailable(req, res);
    const viewer = await accounts.playerFromAccess(req.get('authorization'));
    if (!viewer) return fail(res, 401, 'UNAUTHORIZED', 'You need to sign in');
    const result = await accounts.playerByName(req.params.username);
    send(res, result);
  });
  return accounts;
}

module.exports = { createAccountService, mountAccounts };
