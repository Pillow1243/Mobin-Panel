/**
 * Mobin Panel — API routes
 * Created by Mobin.A
 *
 * All JSON API endpoints live under /api. Authentication:
 *  - /api/auth/status, /api/auth/init, /api/auth/login  → public
 *  - everything else                                    → session cookie
 * Subscription endpoints live under the configurable
 * settings.subscriptionPath and are protected by the subscription key.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { DAILY_QUOTA, MAX_BODY_BYTES, PANEL_VERSION, SESSION_TTL_MS } from '../utils/constants';
import { timingSafeEqual } from '../utils/crypto';
import { makeLogger } from '../utils/logger';
import { validatePassword } from '../utils/validate';
import * as auth from '../services/auth';
import {
  deletePanel,
  loadSettings,
  loadStats,
  loadTelegram,
  loadWg,
  saveSettings,
  saveWg,
  bumpRequest,
} from '../services/kv';
import { generateWireGuardKeypair } from '../utils/wgKeys';
import { sanitizeSettings } from '../utils/constants';
import {
  allow,
  clientIp,
} from '../services/rateLimit';
import { notifyWarpRenewal } from '../services/warp';
import {
  notify,
  removeTelegram,
  setupTelegram,
  testTelegram,
} from '../services/telegram';
import { answerDoH } from '../services/proxy';
import { renderForClient, renderLinks, type Ctx } from '../services/configGenerator';

type AppEnv = { Bindings: Env };

/** Resolve the Ctx for config rendering (worker host from the request). */
async function buildCtx(c: Context): Promise<Ctx> {
  const s = await loadSettings(c.env.MOBIN_KV);
  const host = new URL(c.req.url).hostname;
  let wg = await loadWg(c.env.MOBIN_KV);
  if (!wg) {
    wg = generateWireGuardKeypair();
    await saveWg(c.env.MOBIN_KV, wg);
  }
  return { s, host, dohUrl: `https://${host}/doh`, wg };
}

/** Require authentication; replies 401 when missing. */
async function requireAuth(c: Context): Promise<boolean> {
  const { initialized, authenticated } = await auth.getAuthContext(c.env, c.req.raw);
  return initialized && authenticated;
}

type BodyResult = { data: Record<string, unknown> } | { err: Response };

/** Read a JSON body with a size guard. */
async function readJsonBody(c: Context): Promise<BodyResult> {
  const len = Number(c.req.raw.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return { err: c.json({ error: 'payload too large' }, 413) };
  try {
    return { data: (await c.req.json()) as Record<string, unknown> };
  } catch {
    return { err: c.json({ error: 'invalid JSON body' }, 400) };
  }
}

export function createApiRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /* ------------------------------- auth ---------------------------------- */

  app.get('/api/auth/status', async (c) => {
    const { initialized, authenticated } = await auth.getAuthContext(c.env, c.req.raw);
    return c.json({ initialized, authenticated, version: PANEL_VERSION });
  });

  app.post('/api/auth/init', async (c) => {
    const { initialized } = await auth.getAuthContext(c.env, c.req.raw);
    if (initialized) {
      c.status(409);
      return c.json({ error: 'panel already initialized' });
    }
    if (!allow('init', clientIp(c.req.raw), 10, 60_000)) {
      c.status(429);
      return c.json({ error: 'too many attempts, slow down' });
    }
    const bodyRes = await readJsonBody(c);
    if ('err' in bodyRes) return bodyRes.err;
    const body = bodyRes.data;
    const pw = typeof body.password === 'string' ? body.password : '';
    const err = validatePassword(pw);
    if (err) {
      c.status(400);
      return c.json({ error: err });
    }
    await auth.initialize(c.env, pw);
    const expires = Date.now() + SESSION_TTL_MS;
    const value = await auth.signSession(c.env, expires);
    c.header('set-cookie', auth.sessionCookieValue(expires, value, c.req.url.startsWith('https')));
    await notify(c.env, '🔐 Mobin Panel initialized — a new admin password was set.');
    return c.json({ ok: true });
  });

  app.post('/api/auth/login', async (c) => {
    if (!allow('login', clientIp(c.req.raw), 8, 60_000)) {
      c.status(429);
      return c.json({ error: 'too many attempts, try again in a minute' });
    }
    const bodyRes = await readJsonBody(c);
    if ('err' in bodyRes) return bodyRes.err;
    const body = bodyRes.data;
    const pw = typeof body.password === 'string' ? body.password : '';
    const ok = await auth.verifyPassword(c.env, pw);
    if (!ok) {
      c.status(401);
      return c.json({ error: 'wrong password' });
    }
    const expires = Date.now() + SESSION_TTL_MS;
    const value = await auth.signSession(c.env, expires);
    c.header('set-cookie', auth.sessionCookieValue(expires, value, c.req.url.startsWith('https')));
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', async (c) => {
    c.header('set-cookie', auth.clearSessionCookie());
    return c.json({ ok: true });
  });

  app.post('/api/auth/reset', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    const bodyRes = await readJsonBody(c);
    if ('err' in bodyRes) return bodyRes.err;
    const body = bodyRes.data;
    const pw = typeof body.newPassword === 'string' ? body.newPassword : '';
    const err = validatePassword(pw);
    if (err) {
      c.status(400);
      return c.json({ error: err });
    }
    await auth.resetPassword(c.env, pw);
    return c.json({ ok: true });
  });

  /* ------------------------------ settings -------------------------------- */

  app.get('/api/settings', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    const s = await loadSettings(c.env.MOBIN_KV);
    return c.json(s);
  });

  app.post('/api/settings', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    if (!allow('api', clientIp(c.req.raw), 60, 60_000)) {
      c.status(429);
      return c.json({ error: 'rate limited' });
    }
    const bodyRes = await readJsonBody(c);
    if ('err' in bodyRes) return bodyRes.err;
    const body = bodyRes.data;
    const prev = await loadSettings(c.env.MOBIN_KV);
    const next = sanitizeSettings(body, prev);
    await saveSettings(c.env.MOBIN_KV, next);
    return c.json(next);
  });

  /* ------------------------------- import --------------------------------- */

  /** Import remote settings (node sharing) or raw JSON. */
  app.post('/api/import', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    if (!allow('import', clientIp(c.req.raw), 10, 60_000)) {
      c.status(429);
      return c.json({ error: 'rate limited' });
    }
    const bodyRes = await readJsonBody(c);
    if ('err' in bodyRes) return bodyRes.err;
    const body = bodyRes.data;
    const prev = await loadSettings(c.env.MOBIN_KV);
    let data: unknown = null;
    if (typeof body.url === 'string' && /^https:\/\/[^\s]+$/i.test(body.url)) {
      try {
        const res = await fetch(body.url, {
          signal: AbortSignal.timeout(15_000),
          redirect: 'follow',
        });
        if (!res.ok) {
          c.status(422);
          return c.json({ error: `remote responded ${res.status}` });
        }
        const text = await res.text();
        if (text.length > MAX_BODY_BYTES) {
          c.status(413);
          return c.json({ error: 'remote payload too large' });
        }
        try {
          data = JSON.parse(text);
        } catch {
          // Maybe it's a raw link list (subscription import) — store as external.
          if (/^(vless|trojan|ss|wg|socks|http|amneziawg):/im.test(text)) {
            const next = sanitizeSettings(
              { ...prev, externalSubscriptions: text.slice(0, 20_000) },
              prev,
            );
            await saveSettings(c.env.MOBIN_KV, next);
            return c.json({ ok: true, importedAs: 'externalSubscriptions' });
          }
          c.status(422);
          return c.json({ error: 'remote payload is not JSON or links' });
        }
      } catch {
        c.status(422);
        return c.json({ error: 'could not fetch the remote URL' });
      }
    } else if (body.json && typeof body.json === 'object') {
      data = body.json;
    } else {
      c.status(400);
      return c.json({ error: 'provide { url } or { json }' });
    }
    const next = sanitizeSettings(data, prev);
    await saveSettings(c.env.MOBIN_KV, next);
    return c.json({ ok: true, imported: next });
  });

  /* ------------------------------ dashboard -------------------------------- */

  app.get('/api/dashboard', async (c) => {
    const { initialized, authenticated } = await auth.getAuthContext(c.env, c.req.raw);
    if (!initialized || !authenticated) {
      c.status(401);
      return c.json({ error: 'unauthorized' });
    }
    const s = await loadSettings(c.env.MOBIN_KV);
    const stats = await loadStats(c.env.MOBIN_KV);
    const tg = await loadTelegram(c.env.MOBIN_KV);
    const nowBucket = Math.floor(Date.now() / (10 * 60 * 1000));
    let last24h = 0;
    for (let i = 0; i < 144; i++) {
      last24h += stats.buckets[String(nowBucket - i)] || 0;
    }
    return c.json({
      totalRequests: stats.total,
      requestsLast24h: last24h,
      dailyQuota: DAILY_QUOTA,
      usagePct: Math.min(100, Math.round((last24h / DAILY_QUOTA) * 1000) / 10),
      version: PANEL_VERSION,
      panelUrl: c.req.url.replace(/\/api\/dashboard$/, ''),
      telegramConfigured: tg.enabled && !!tg.botToken,
      initialized: true,
      panelName: s.panelName,
    });
  });

  /* ------------------------------- configs --------------------------------- */

  /** Render one client config (raw). */
  app.get('/api/configs/:client', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    const client = c.req.param('client');
    const ctx = await buildCtx(c);
    const out = await renderForClient(client, ctx);
    if (!out) {
      c.status(404);
      return c.json({ error: 'unknown client' });
    }
    return c.body(out.body, 200, {
      'content-type': out.contentType,
      'content-disposition': `attachment; filename="${out.filename}"`,
    });
  });

  /* ------------------------------- telegram ------------------------------- */

  app.post('/api/telegram/setup', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    const bodyRes = await readJsonBody(c);
    if ('err' in bodyRes) return bodyRes.err;
    const body = bodyRes.data;
    const res = await setupTelegram(
      c.env,
      typeof body.botToken === 'string' ? body.botToken : '',
      typeof body.userId === 'string' ? body.userId : '',
    );
    return c.json(res);
  });

  app.post('/api/telegram/remove', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await removeTelegram(c.env));
  });

  app.post('/api/telegram/test', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await testTelegram(c.env));
  });

  /* -------------------------------- update --------------------------------- */

  app.post('/api/update', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    const log = makeLogger((await loadSettings(c.env.MOBIN_KV)).logLevel);
    let latest: string | null = null;
    try {
      const res = await fetch(
        'https://api.github.com/repos/Pillow1243/Mobin-Panel/releases/latest',
        { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { tag_name?: string };
        latest = data.tag_name || null;
      }
    } catch (e) {
      log('warning', `update check failed: ${(e as Error).message}`);
    }
    const current = PANEL_VERSION;
    const upToDate = !latest || latest.replace(/^v/, '') === current;
    return c.json({
      current,
      latest: latest || current,
      upToDate,
      message: upToDate
        ? `You are running the latest version (v${current}).`
        : `A newer version v${latest} is available — deploy it from the GitHub repo.`,
    });
  });

  /* ------------------------------- warp renew ------------------------------ */

  app.post('/api/warp/renew', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    if (!allow('warp', clientIp(c.req.raw), 5, 300_000)) {
      c.status(429);
      return c.json({ ok: false, message: 'rate limited — try again in 5 minutes' });
    }
    let wg = await loadWg(c.env.MOBIN_KV);
    if (!wg) {
      wg = generateWireGuardKeypair();
      await saveWg(c.env.MOBIN_KV, wg);
    }
    const s = await loadSettings(c.env.MOBIN_KV);
    const res = await notifyWarpRenewal(wg, s.panelName);
    return c.json(res);
  });

  /* ----------------------------- panel delete ------------------------------ */

  app.post('/api/panel/delete', async (c) => {
    if (!(await requireAuth(c))) return c.json({ error: 'unauthorized' }, 401);
    await deletePanel(c.env.MOBIN_KV);
    c.header('set-cookie', auth.clearSessionCookie());
    return c.json({ ok: true, message: 'panel data deleted' });
  });

  return app;
}

/* -------------------------------------------------------------------------- */
/*  Subscription endpoints (token-protected, no panel session required)        */
/* -------------------------------------------------------------------------- */

export function createSubscriptionRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /** Bare subscription base → plain share-link bundle (handy for QR sharing). */
  app.get('/', async (c) => {
    const s = await loadSettings(c.env.MOBIN_KV);
    const { authenticated } = await auth.getAuthContext(c.env, c.req.raw);
    const key = c.req.query('t') || c.req.query('key') || '';
    const allowed = authenticated || (key !== '' && s.subscriptionKey !== '' && timingSafeEqual(key, s.subscriptionKey));
    if (!allowed) {
      c.status(403);
      return c.text('forbidden — invalid subscription key');
    }
    const ctx = await buildCtx(c);
    const body = await renderLinks(ctx);
    await bumpRequest(c.env.MOBIN_KV);
    return c.body(body, 200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
  });

  app.get('/:client', async (c) => {
    const s = await loadSettings(c.env.MOBIN_KV);
    // Auth: session cookie OR subscription key.
    const { authenticated } = await auth.getAuthContext(c.env, c.req.raw);
    const key = c.req.query('t') || c.req.query('key') || '';
    let allowed = authenticated;
    if (!allowed && key && s.subscriptionKey) {
      allowed = timingSafeEqual(key, s.subscriptionKey);
    }
    if (!allowed) {
      c.status(403);
      return c.text('forbidden — invalid subscription key');
    }
    const client = c.req.param('client');
    const ctx = await buildCtx(c);
    const out = await renderForClient(client, ctx);
    if (!out) {
      c.status(404);
      return c.text('unknown client');
    }
    // Count subscription pulls.
    await bumpRequest(c.env.MOBIN_KV);
    return c.body(out.body, 200, {
      'content-type': out.contentType,
      'cache-control': 'no-store',
    });
  });

  return app;
}

/* -------------------------------------------------------------------------- */
/*  DoH server (public, rate-limited)                                          */
/* -------------------------------------------------------------------------- */

export function createDoHRoute(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const handle = async (c: Context<AppEnv>) => {
    if (!allow('doh', clientIp(c.req.raw), 30, 10_000)) {
      c.status(429);
      return c.json({ Status: 2, Error: 'rate limited', Answer: [] });
    }
    let name = c.req.query('name') || c.req.query('Name') || '';
    if (!name && c.req.method === 'POST') {
      try {
        const body = (await c.req.json()) as { name?: string; Name?: string };
        name = body.name || body.Name || '';
      } catch {
        c.status(400);
        return c.json({ Status: 3, Error: 'bad dns-json body', Answer: [] });
      }
    }
    if (!name) {
      c.status(400);
      return c.json({ Status: 3, Error: 'missing name', Answer: [] });
    }
    const s = await loadSettings(c.env.MOBIN_KV);
    const { status, body } = await answerDoH({ name }, s);
    await bumpRequest(c.env.MOBIN_KV);
    return c.json(body, status as 200 | 400 | 429 | 502, { 'access-control-allow-origin': '*' });
  };

  app.get('/', handle);
  app.post('/', handle);
  return app;
}
