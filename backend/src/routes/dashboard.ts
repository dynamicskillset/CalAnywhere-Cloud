import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth';
import { encrypt, decrypt } from '../utils/encryption';
import { isSafeToFetch } from '../auth/url-validation';
import { validateMultipleCalendarUrls } from '../services/calendar';

// Free tier limits
const FREE_MAX_PAGES = 1;
const FREE_MAX_EXPIRY_DAYS = 30;
const FREE_MAX_CALENDAR_URLS = 2; // TODO: higher limit for paid tier

function isAdminTier(tier: string): boolean {
  return tier === 'admin';
}

function generateSlug(): string {
  return uuidv4().replace(/-/g, '').slice(0, 22);
}

// Basic email format check
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate HH:MM wall-clock time string
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Calendar URL validation (same pattern as pages router)
function isValidCalendarUrl(rawUrl: string): boolean {
  if (!rawUrl || rawUrl.length > 4096) return false;
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (!h.includes('.')) return false;
  return true;
}

// Dashboard write operations: auth-gated but still throttled to prevent abuse
const dashboardWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 write ops per 15 min per IP (generous; auth is the real gate)
  standardHeaders: true,
  legacyHeaders: false,
});

export function createDashboardRouter(pool: Pool): Router {
  const router = Router();

  // All dashboard routes require authentication
  router.use(requireAuth(pool));

  /**
   * GET /api/dashboard/pages
   * List the authenticated user's pages (active + expired).
   */
  router.get('/pages', async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const tier = req.session!.tier ?? 'free';

    const { rows } = await pool.query(
      `SELECT
         sp.id,
         sp.slug,
         sp.title,
         sp.owner_name,
         sp.bio,
         sp.default_duration_minutes,
         sp.buffer_minutes,
         sp.date_range_days,
         sp.min_notice_hours,
         sp.include_weekends,
         sp.availability_start,
         sp.availability_end,
         sp.owner_timezone,
         sp.notification_email_enc,
         sp.notification_email_iv,
         sp.notification_email_tag,
         sp.created_at,
         sp.expires_at,
         (sp.expires_at IS NULL OR sp.expires_at > NOW()) AS is_active,
         COALESCE(
           array_agg(pc.raw_calendar_url)
             FILTER (WHERE pc.raw_calendar_url IS NOT NULL),
           ARRAY[]::text[]
         ) AS calendar_urls
       FROM scheduling_pages sp
       LEFT JOIN page_calendars pc ON pc.page_id = sp.id
       WHERE sp.user_id = $1
       GROUP BY sp.id
       ORDER BY sp.created_at DESC`,
      [userId]
    );

    const pages = rows.map(row => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      ownerName: row.owner_name,
      bio: row.bio,
      calendarUrls: row.calendar_urls,
      defaultDurationMinutes: row.default_duration_minutes,
      bufferMinutes: row.buffer_minutes,
      dateRangeDays: row.date_range_days,
      minNoticeHours: row.min_notice_hours,
      includeWeekends: row.include_weekends,
      availabilityStart: row.availability_start ?? '09:00',
      availabilityEnd: row.availability_end ?? '17:00',
      ownerTimezone: row.owner_timezone ?? 'UTC',
      hasNotificationEmail: !!row.notification_email_enc,
      isActive: row.is_active,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));

    // Count active pages for tier display
    const activeCount = pages.filter(p => p.isActive).length;

    res.json({
      pages,
      activeCount,
      tier,
      maxPages: isAdminTier(tier) ? null : FREE_MAX_PAGES,
    });
  });

  /**
   * POST /api/dashboard/pages
   * Create a new scheduling page.
   */
  router.post('/pages', dashboardWriteLimiter, async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const tier = req.session!.tier ?? 'free';
    const adminUser = isAdminTier(tier);
    const {
      title,
      ownerName,
      bio,
      notificationEmail,
      calendarUrls: rawUrls,
      defaultDurationMinutes,
      bufferMinutes,
      dateRangeDays,
      minNoticeHours,
      includeWeekends,
      availabilityStart,
      availabilityEnd,
      ownerTimezone,
      expiryDays,
    } = req.body;

    // Validate required fields
    if (!ownerName || typeof ownerName !== 'string' || ownerName.trim().length < 2) {
      return res.status(400).json({ error: 'Display name is required (at least 2 characters).' });
    }
    if (ownerName.length > 100) {
      return res.status(400).json({ error: 'Display name must not exceed 100 characters.' });
    }

    if (title && title.length > 100) {
      return res.status(400).json({ error: 'Title must not exceed 100 characters.' });
    }

    if (bio && bio.length > 200) {
      return res.status(400).json({ error: 'Bio must not exceed 200 characters.' });
    }

    // Validate availability window
    const startTime: string = (typeof availabilityStart === 'string' && TIME_RE.test(availabilityStart))
      ? availabilityStart
      : '09:00';
    const endTime: string = (typeof availabilityEnd === 'string' && TIME_RE.test(availabilityEnd))
      ? availabilityEnd
      : '17:00';
    if (startTime >= endTime) {
      return res.status(400).json({ error: 'Availability end time must be after start time.' });
    }

    // Validate timezone
    const timezone: string = (typeof ownerTimezone === 'string' && ownerTimezone.length > 0 && isValidTimezone(ownerTimezone))
      ? ownerTimezone
      : 'UTC';

    // Validate notification email if provided
    if (notificationEmail) {
      if (typeof notificationEmail !== 'string' || !EMAIL_RE.test(notificationEmail.trim())) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }
    }

    // Validate calendar URLs
    const calendarUrls: string[] = Array.isArray(rawUrls)
      ? rawUrls.filter((u: unknown) => typeof u === 'string' && (u as string).trim().length > 0)
      : [];

    const maxCalendarUrls = adminUser ? 10 : FREE_MAX_CALENDAR_URLS;
    if (calendarUrls.length === 0 || calendarUrls.length > maxCalendarUrls) {
      return res.status(400).json({ error: `You can add up to ${maxCalendarUrls} iCal links per page.` });
    }

    for (const url of calendarUrls) {
      if (!isValidCalendarUrl(url)) {
        return res.status(400).json({
          error: 'One or more calendar URLs are not allowed. Please provide standard HTTPS iCalendar subscription links.',
        });
      }
      if (!(await isSafeToFetch(url))) {
        return res.status(400).json({ error: 'One or more calendar URLs are not allowed.' });
      }
    }

    // Validate and fetch calendars
    try {
      const validation = await validateMultipleCalendarUrls(calendarUrls);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Could not load or parse your calendar(s). Please check the ICS URL(s) and try again.',
        });
      }
    } catch {
      return res.status(400).json({
        error: 'Could not load or parse your calendar(s). Please check the ICS URL(s) and try again.',
      });
    }

    // Enforce page limit (skipped for admin tier)
    if (!adminUser) {
      const { rows: activeRows } = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM scheduling_pages
         WHERE user_id = $1
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
      );
      const activeCount = activeRows[0].count;

      if (activeCount >= FREE_MAX_PAGES) {
        return res.status(403).json({
          error: `You have reached the limit of ${FREE_MAX_PAGES} active page(s). Delete an existing page or wait for it to expire.`,
        });
      }
    }

    // Compute expiry — admin users may pass null for no expiry
    const now = Date.now();
    let expiresAt: Date | null;
    if (adminUser && (expiryDays === null || expiryDays === undefined)) {
      expiresAt = null;
    } else {
      const days = typeof expiryDays === 'number' && expiryDays > 0
        ? (adminUser ? expiryDays : Math.min(expiryDays, FREE_MAX_EXPIRY_DAYS))
        : FREE_MAX_EXPIRY_DAYS;
      expiresAt = new Date(now + days * 24 * 60 * 60 * 1000);
    }

    // Encrypt notification email if provided
    let emailEnc: string | null = null;
    let emailIv: string | null = null;
    let emailTag: string | null = null;

    if (notificationEmail) {
      const encrypted = encrypt(notificationEmail.trim());
      emailEnc = encrypted.ciphertext;
      emailIv = encrypted.iv;
      emailTag = encrypted.tag;
    }

    const slug = generateSlug();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO scheduling_pages
           (slug, user_id, owner_name, title, bio,
            notification_email_enc, notification_email_iv, notification_email_tag,
            default_duration_minutes, buffer_minutes, date_range_days,
            min_notice_hours, include_weekends,
            availability_start, availability_end, owner_timezone,
            is_anonymous, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,FALSE,$17,$18)
         RETURNING id`,
        [
          slug,
          userId,
          ownerName.trim(),
          title ? title.trim() : null,
          bio ? bio.trim() : null,
          emailEnc,
          emailIv,
          emailTag,
          defaultDurationMinutes ?? 30,
          bufferMinutes ?? 0,
          dateRangeDays ? Math.min(dateRangeDays, 180) : 60,
          minNoticeHours ?? 8,
          includeWeekends ?? false,
          startTime,
          endTime,
          timezone,
          new Date(now).toISOString(),
          expiresAt ? expiresAt.toISOString() : null,
        ]
      );

      const pageId = rows[0].id;

      for (const url of calendarUrls) {
        await client.query(
          'INSERT INTO page_calendars (page_id, raw_calendar_url) VALUES ($1,$2)',
          [pageId, url]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        id: pageId,
        slug,
        title: title ? title.trim() : null,
        ownerName: ownerName.trim(),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        isActive: true,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.error('Failed to create page:', err);
      return res.status(500).json({ error: 'Could not create the page. Please try again.' });
    } finally {
      client.release();
    }
  });

  /**
   * PATCH /api/dashboard/pages/:id
   * Update page settings. Only the owner can update.
   */
  router.patch('/pages/:id', dashboardWriteLimiter, async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const pageId = req.params.id;

    // Verify ownership
    const { rows: ownerCheck } = await pool.query(
      'SELECT id FROM scheduling_pages WHERE id = $1 AND user_id = $2',
      [pageId, userId]
    );
    if (ownerCheck.length === 0) {
      return res.status(404).json({ error: 'Page not found.' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const allowedFields: Record<string, { column: string; maxLen?: number; type?: string }> = {
      title:                  { column: 'title', maxLen: 100 },
      ownerName:              { column: 'owner_name', maxLen: 100 },
      bio:                    { column: 'bio', maxLen: 200 },
      defaultDurationMinutes: { column: 'default_duration_minutes', type: 'int' },
      bufferMinutes:          { column: 'buffer_minutes', type: 'int' },
      dateRangeDays:          { column: 'date_range_days', type: 'int' },
      minNoticeHours:         { column: 'min_notice_hours', type: 'int' },
      includeWeekends:        { column: 'include_weekends', type: 'bool' },
    };

    for (const [field, config] of Object.entries(allowedFields)) {
      if (req.body[field] !== undefined) {
        let val = req.body[field];

        if (config.maxLen && typeof val === 'string' && val.length > config.maxLen) {
          return res.status(400).json({ error: `${field} must not exceed ${config.maxLen} characters.` });
        }
        if (config.type === 'int' && typeof val === 'number') {
          val = Math.max(0, Math.floor(val));
          if (field === 'dateRangeDays') val = Math.min(val, 180);
        }
        if (typeof val === 'string') val = val.trim();

        updates.push(`${config.column} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    // Handle availability window: validate both fields together
    const patchStart = req.body.availabilityStart;
    const patchEnd = req.body.availabilityEnd;
    if (patchStart !== undefined || patchEnd !== undefined) {
      // Read the other value from the existing row if only one was provided
      const { rows: existing } = await pool.query(
        'SELECT availability_start, availability_end FROM scheduling_pages WHERE id = $1',
        [pageId]
      );
      const currentStart: string = existing[0]?.availability_start ?? '09:00';
      const currentEnd: string = existing[0]?.availability_end ?? '17:00';

      const newStart = (typeof patchStart === 'string' && TIME_RE.test(patchStart)) ? patchStart : currentStart;
      const newEnd   = (typeof patchEnd   === 'string' && TIME_RE.test(patchEnd))   ? patchEnd   : currentEnd;

      if (newStart >= newEnd) {
        return res.status(400).json({ error: 'Availability end time must be after start time.' });
      }

      if (typeof patchStart === 'string') {
        updates.push(`availability_start = $${paramIndex}`);
        values.push(newStart);
        paramIndex++;
      }
      if (typeof patchEnd === 'string') {
        updates.push(`availability_end = $${paramIndex}`);
        values.push(newEnd);
        paramIndex++;
      }
    }

    // Handle owner timezone
    if (req.body.ownerTimezone !== undefined) {
      const tz = req.body.ownerTimezone;
      if (typeof tz !== 'string' || !isValidTimezone(tz)) {
        return res.status(400).json({ error: 'Invalid timezone.' });
      }
      updates.push(`owner_timezone = $${paramIndex}`);
      values.push(tz);
      paramIndex++;
    }

    // Handle notification email separately (needs encryption)
    if (req.body.notificationEmail !== undefined) {
      const email = req.body.notificationEmail;
      if (email === null || email === '') {
        // Clear notification email
        updates.push(`notification_email_enc = $${paramIndex}`);
        values.push(null);
        paramIndex++;
        updates.push(`notification_email_iv = $${paramIndex}`);
        values.push(null);
        paramIndex++;
        updates.push(`notification_email_tag = $${paramIndex}`);
        values.push(null);
        paramIndex++;
      } else {
        if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
          return res.status(400).json({ error: 'Please provide a valid email address.' });
        }
        const encrypted = encrypt(email.trim());
        updates.push(`notification_email_enc = $${paramIndex}`);
        values.push(encrypted.ciphertext);
        paramIndex++;
        updates.push(`notification_email_iv = $${paramIndex}`);
        values.push(encrypted.iv);
        paramIndex++;
        updates.push(`notification_email_tag = $${paramIndex}`);
        values.push(encrypted.tag);
        paramIndex++;
      }
    }

    // Handle calendar URLs separately (need to replace in page_calendars)
    const newCalendarUrls: string[] | undefined = req.body.calendarUrls;

    if (updates.length === 0 && !newCalendarUrls) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (updates.length > 0) {
        values.push(pageId);
        await client.query(
          `UPDATE scheduling_pages SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
      }

      if (newCalendarUrls && Array.isArray(newCalendarUrls)) {
        const urls = newCalendarUrls.filter(u => typeof u === 'string' && u.trim().length > 0);
        if (urls.length === 0 || urls.length > FREE_MAX_CALENDAR_URLS) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Free tier allows up to ${FREE_MAX_CALENDAR_URLS} iCal links per page.` });
        }

        for (const url of urls) {
          if (!isValidCalendarUrl(url) || !(await isSafeToFetch(url))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'One or more calendar URLs are not allowed.' });
          }
        }

        // Replace all calendar URLs for this page
        await client.query('DELETE FROM page_calendars WHERE page_id = $1', [pageId]);
        for (const url of urls) {
          await client.query(
            'INSERT INTO page_calendars (page_id, raw_calendar_url) VALUES ($1,$2)',
            [pageId, url]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.error('Failed to update page:', err);
      return res.status(500).json({ error: 'Could not update the page. Please try again.' });
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/dashboard/pages/:id
   * Delete a page. Only the owner can delete.
   */
  router.delete('/pages/:id', dashboardWriteLimiter, async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const pageId = req.params.id;

    const { rowCount } = await pool.query(
      'DELETE FROM scheduling_pages WHERE id = $1 AND user_id = $2',
      [pageId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Page not found.' });
    }

    res.json({ ok: true });
  });

  /**
   * GET /api/dashboard/pages/:id/requests
   * List appointment requests (bookings) for a page. Only the owner can view.
   */
  router.get('/pages/:id/requests', async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const pageId = req.params.id;

    // Verify ownership
    const { rows: ownerCheck } = await pool.query(
      'SELECT id FROM scheduling_pages WHERE id = $1 AND user_id = $2',
      [pageId, userId]
    );
    if (ownerCheck.length === 0) {
      return res.status(404).json({ error: 'Page not found.' });
    }

    const { rows } = await pool.query(
      `SELECT
         id, requester_name, requester_email,
         reason, notes, start_time, end_time,
         timezone, created_at
       FROM bookings
       WHERE page_id = $1
       ORDER BY start_time DESC`,
      [pageId]
    );

    const requests = rows.map(row => ({
      id: row.id,
      requesterName: row.requester_name,
      requesterEmail: row.requester_email,
      reason: row.reason,
      notes: row.notes,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      createdAt: row.created_at,
    }));

    res.json({ requests });
  });

  return router;
}
