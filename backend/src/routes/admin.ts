import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const ADMIN_COOKIE = 'ca_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: SESSION_TTL_MS,
};

/**
 * Hash a password using PBKDF2 with a salt derived from the username and the
 * app secret (EMAIL_ENCRYPTION_KEY). Using timingSafeEqual on the output
 * prevents timing-based enumeration of the password.
 */
function hashAdminPassword(password: string, username: string): Buffer {
  const pepper = process.env.EMAIL_ENCRYPTION_KEY?.slice(0, 32) ?? 'calanywhere-admin-dev-salt';
  const salt = `${username}:${pepper}`;
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512');
}

async function isValidAdminSession(pool: Pool, token: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM admin_sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  return rows.length > 0;
}

function requireAdmin(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (!token) return res.status(401).json({ error: 'Not authenticated.' });
    try {
      if (!(await isValidAdminSession(pool, token))) {
        return res.status(401).json({ error: 'Session expired.' });
      }
    } catch {
      return res.status(503).json({ error: 'Service unavailable.' });
    }
    next();
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait before trying again.' },
});

export function createAdminRouter(pool: Pool): Router {
  const router = Router();
  const guard = requireAdmin(pool);

  /**
   * POST /api/admin/login
   * Validates ADMIN_USERNAME + ADMIN_PASSWORD env vars.
   */
  router.post('/login', loginLimiter, async (req: Request, res: Response) => {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      return res.status(503).json({ error: 'Admin access is not configured on this server.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Always compute both hashes to avoid timing differences revealing the username
    const expected = hashAdminPassword(adminPassword, adminUsername);
    const provided  = hashAdminPassword(
      typeof password === 'string' ? password : '',
      adminUsername
    );

    const usernameMatch = typeof username === 'string' && username === adminUsername;
    const passwordMatch = crypto.timingSafeEqual(expected, provided);

    if (!usernameMatch || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await pool.query(
      'INSERT INTO admin_sessions (token, expires_at) VALUES ($1, $2)',
      [token, expiresAt.toISOString()]
    );

    res.cookie(ADMIN_COOKIE, token, COOKIE_OPTIONS);
    res.json({ ok: true });
  });

  /**
   * POST /api/admin/logout
   */
  router.post('/logout', async (req: Request, res: Response) => {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (token) {
      await pool.query('DELETE FROM admin_sessions WHERE token = $1', [token]).catch(() => {});
    }
    res.clearCookie(ADMIN_COOKIE);
    res.json({ ok: true });
  });

  /**
   * GET /api/admin/me — used by frontend to check session validity
   */
  router.get('/me', guard, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  /**
   * GET /api/admin/stats — user and page counts
   */
  router.get('/stats', guard, async (_req: Request, res: Response) => {
    const [users, pages, active] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM users'),
      pool.query('SELECT COUNT(*)::int AS n FROM scheduling_pages WHERE user_id IS NOT NULL'),
      pool.query('SELECT COUNT(*)::int AS n FROM scheduling_pages WHERE user_id IS NOT NULL AND expires_at > NOW()'),
    ]);
    res.json({
      users: users.rows[0].n,
      pages: pages.rows[0].n,
      activePages: active.rows[0].n,
    });
  });

  /**
   * GET /api/admin/settings — all system_settings key/value pairs
   */
  router.get('/settings', guard, async (_req: Request, res: Response) => {
    const { rows } = await pool.query('SELECT key, value FROM system_settings ORDER BY key');
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ settings });
  });

  /**
   * PATCH /api/admin/settings — upsert one or more settings
   * Body: { key: value, ... }  — only string keys/values accepted.
   */
  router.patch('/settings', guard, async (req: Request, res: Response) => {
    const updates = req.body as Record<string, unknown>;
    const pairs = Object.entries(updates).filter(
      ([k, v]) => typeof k === 'string' && typeof v === 'string'
    ) as [string, string][];

    if (pairs.length === 0) {
      return res.status(400).json({ error: 'No valid settings provided.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of pairs) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.error('Failed to update system settings:', err);
      return res.status(500).json({ error: 'Could not update settings.' });
    } finally {
      client.release();
    }

    res.json({ ok: true });
  });

  /**
   * GET /api/admin/users?emojiId=:id — look up a user by emoji ID
   */
  router.get('/users', guard, async (req: Request, res: Response) => {
    const emojiId = typeof req.query.emojiId === 'string' ? req.query.emojiId.trim() : null;
    if (!emojiId) {
      return res.status(400).json({ error: 'emojiId query parameter is required.' });
    }

    const { rows } = await pool.query(
      `SELECT id, emoji_id, tier, created_at,
              (SELECT COUNT(*)::int FROM scheduling_pages WHERE user_id = users.id) AS page_count
       FROM users WHERE emoji_id = $1`,
      [emojiId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const u = rows[0];
    res.json({ user: { id: u.id, emojiId: u.emoji_id, tier: u.tier, createdAt: u.created_at, pageCount: u.page_count } });
  });

  /**
   * PATCH /api/admin/users/:id — update a user's tier
   * Body: { tier: 'free' | 'admin' }
   */
  router.patch('/users/:id', guard, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { tier } = req.body;

    if (tier !== 'free' && tier !== 'admin') {
      return res.status(400).json({ error: 'tier must be "free" or "admin".' });
    }

    const { rowCount } = await pool.query(
      'UPDATE users SET tier = $1 WHERE id = $2',
      [tier, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ ok: true });
  });

  return router;
}
