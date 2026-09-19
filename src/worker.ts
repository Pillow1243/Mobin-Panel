/**
 * ============================================================================
 *  Mobin Panel — Cloudflare Worker entry point
 *  Created by Mobin.A
 * ============================================================================
 *  A next-generation, open-source configuration panel for VLESS, Trojan and
 *  WARP (Cloudflare Warp / WireGuard) protocols.
 *
 *  Endpoints:
 *    /                        → neon-glass SPA (panel UI)
 *    /assets/*                → UI assets (inlined at build time)
 *    /api/*                   → panel JSON API (session-protected)
 *    <subscriptionPath>/*     → client subscriptions (key-protected)
 *    /vless, /trojan          → the actual proxy (WebSocket tunnel)
 *    /doh                     → private DNS-over-HTTPS (dns-json)
 *
 *  Inspired by the BPB-Worker-Panel feature set; this is a completely
 *  original implementation with a clean TypeScript architecture.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './types';
import { ASSETS, INDEX_HTML, contentType } from './static';
import {
  createApiRoutes,
  createDoHRoute,
  createSubscriptionRoutes,
} from './routes/api';
import {
  credentialsFromRequest,
  handleProxySession,
  type WsConn,
} from './services/proxy';
import { bumpRequest, loadSettings, saveWg, loadWg } from './services/kv';
import { generateWireGuardKeypair } from './utils/wgKeys';
import { makeLogger } from './utils/logger';
import { notify } from './services/telegram';
import { notifyWarpRenewal } from './services/warp';

type AppEnv = { Bindings: Env };

const apiRoutes = createApiRoutes();
const subRoutes = createSubscriptionRoutes();
const dohRoutes = createDoHRoute();

/* ------------------------------ proxy upgrades ---------------------------- */

/**
 * Handle a WebSocket upgrade for the proxy, directly on the raw request.
 * This must run BEFORE Hono (Hono/Response cannot carry a 101 response in
 * every runtime); auth is verified here so unauthorized sockets are never
 * opened.
 */
async function handleProxyUpgrade(
  raw: Request,
  env: Env,
  kind: 'vless' | 'trojan',
): Promise<Response> {
  const s = await loadSettings(env.MOBIN_KV);
  const log = makeLogger(s.logLevel);
  const cred = credentialsFromRequest(kind, new URL(raw.url), raw.headers);
  if (!cred) {
    return new Response('authentication required', { status: 407 });
  }
  // Classic Workers upgrade: pass one end of a WebSocketPair to
  // request.upgrade(server) and use the other end for the session.
  // (The installed type package omits Request.upgrade — hence the cast.)
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  const response = (raw as unknown as { upgrade: (socket: WebSocket) => Response }).upgrade(server);
  if (s.protocol !== 'both' && s.protocol !== kind) {
    client.close(1008, 'protocol disabled');
    return response;
  }
  const ws = client as unknown as WsConn;
  try {
    ws.binaryType = 'arraybuffer';
  } catch {
    /* older runtimes */
  }
  void bumpRequest(env.MOBIN_KV);
  void handleProxySession(ws, raw, s, cred, log);
  return response;
}

/* --------------------------------- app ------------------------------------ */

const app = new Hono<AppEnv>();

// Panel API (routes are defined with absolute /api/… paths).
app.route('/', apiRoutes);

// Private DoH (dns-json) — used by generated configs as the panel resolver.
app.route('/doh', dohRoutes);

// (Proxy WebSocket paths are handled before Hono — see the fetch export.)

// UI.
app.get('/', (c) =>
  c.body(INDEX_HTML, 200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache',
  }),
);
app.get('/assets/*', (c) => {
  const path = c.req.path;
  const body = ASSETS[path];
  if (!body) return c.text('404', 404);
  const headers: Record<string, string> = { 'content-type': contentType(path) };
  // UI code changes on every deploy — always revalidate.
  headers['cache-control'] = 'no-cache';
  return c.body(body, 200, headers);
});

// 404: try the subscription path (its prefix is configurable at runtime),
// otherwise a plain not-found.
// Accepted shapes:
//   {base}/{client}?t=KEY     (panel-generated URL)
//   {base}/{KEY}/{client}     (key embedded in the path — common in tools)
//   {base}                    (client list)
app.notFound(async (c) => {
  const path = c.req.path;
  try {
    const s = await loadSettings(c.env.MOBIN_KV);
    const base = s.subscriptionPath || '/sub';
    if (path === base || path.startsWith(`${base}/`)) {
      const segs = path === base ? [] : path.slice(base.length + 1).split('/').filter(Boolean);
      const url = new URL(c.req.url);
      if (segs.length === 0) {
        url.pathname = '/';
      } else if (segs.length === 1) {
        url.pathname = `/${segs[0]}`;
      } else {
        url.pathname = `/${segs[1]}`;
        url.searchParams.set('t', segs[0]);
      }
      const req = new Request(url, c.req.raw);
      return subRoutes.fetch(req, c.env, c.executionCtx);
    }
  } catch {
    /* fall through */
  }
  return c.text('404 — not found', 404);
});

// Last-resort error handler: never leak internals.
app.onError((err, c) => {
  console.error('[mobin] unhandled error:', err);
  const isApi = c.req.path.startsWith('/api') || c.req.path.startsWith('/doh');
  if (isApi) {
    return c.json({ error: 'internal server error' }, 500);
  }
  return c.text('500 — internal server error', 500);
});

/* ------------------------------ worker export ----------------------------- */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Proxy WebSocket upgrades are intercepted before Hono: a 101 response
    // cannot round-trip through Hono in every runtime, and auth must happen
    // before the socket is accepted.
    const isWs = (request.headers.get('upgrade') || '').toLowerCase() === 'websocket';
    if (isWs) {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/vless' || path.startsWith('/vless/')) {
          return await handleProxyUpgrade(request, env, 'vless');
        }
        if (path === '/trojan' || path.startsWith('/trojan/')) {
          return await handleProxyUpgrade(request, env, 'trojan');
        }
      } catch (err) {
        console.error('[mobin] proxy upgrade error:', err);
      }
      return new Response('upgrade failed', { status: 502 });
    }
    return app.fetch(request, env, ctx);
  },

  /**
   * Cron trigger (see wrangler.toml) — automatic WARP account renewal when
   * the user enabled "Warp → Auto renew" in the panel.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const s = await loadSettings(env.MOBIN_KV);
      if (!s.warpAutoRenew) return;
      let wg = await loadWg(env.MOBIN_KV);
      if (!wg) {
        wg = generateWireGuardKeypair();
        await saveWg(env.MOBIN_KV, wg);
      }
      const res = await notifyWarpRenewal(wg, s.panelName);
      await notify(
        env,
        res.ok
          ? '🔄 Mobin Panel: WARP account renewed successfully.'
          : `⚠️ Mobin Panel: WARP renewal attempt finished — ${res.message}`,
      );
    } catch (e) {
      console.error('[mobin] scheduled task failed:', e);
    }
  },
};
