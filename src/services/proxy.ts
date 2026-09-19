/**
 * Mobin Panel — proxy data path
 * Created by Mobin.A
 *
 * Implements the real proxy logic of the panel:
 *
 *  - VLESS over WebSocket: the client tunnels plain HTTP/1.1 requests over a
 *    WebSocket connection to the worker; we authenticate (UUID), resolve the
 *    target via DoH, pick the best IP, and stream the response back over the
 *    socket. WebSocket-to-WebSocket upgrades are supported for the inner
 *    request (WebSockets inside proxied pages).
 *  - Trojan over WebSocket: same transport, Basic-auth style credentials.
 *  - Private DoH server (GET/POST /doh, dns-json) with anti-sanction and
 *    fake-DNS behaviour.
 *  - Optional chain proxy (http proxy or a second VLESS/Trojan WS endpoint).
 *
 * The code follows the well-known worker-proxy design (HTTP-over-WS) but is
 * a completely original implementation.
 */
import type { Settings } from '../types';
import {
  BLOCK_PRESETS,
  REGION_PRESETS,
} from '../utils/constants';
import { parseDoHResponse, resolveForProxy, overrideFetch } from './dns';
import type { LogFn } from '../utils/logger';

const te = new TextEncoder();
const td = new TextDecoder();

/* -------------------------------------------------------------------------- */
/*  Blocking / fake DNS helpers                                                */
/* -------------------------------------------------------------------------- */

export function blockedDomains(s: Settings): string[] {
  const r = s.routing;
  const out: string[] = [];
  if (r.blockAds) out.push(...BLOCK_PRESETS.ads);
  if (r.blockPorn) out.push(...BLOCK_PRESETS.porn);
  if (r.blockMalware) out.push(...BLOCK_PRESETS.malware);
  if (r.blockPhishing) out.push(...BLOCK_PRESETS.phishing);
  if (r.blockCryptominers) out.push(...BLOCK_PRESETS.cryptominers);
  out.push(...r.customBlockDomains);
  return out;
}

export function bypassDomains(s: Settings): string[] {
  const r = s.routing;
  const out: string[] = [];
  if (r.bypassIran) out.push(...REGION_PRESETS.iran.suffixes, ...REGION_PRESETS.iran.domains);
  if (r.bypassChina) out.push(...REGION_PRESETS.china.suffixes, ...REGION_PRESETS.china.domains);
  if (r.bypassRussia) out.push(...REGION_PRESETS.russia.suffixes, ...REGION_PRESETS.russia.domains);
  if (r.sanctionsEnabled) out.push(...r.sanctions);
  out.push(...r.customBypassDomains);
  return out;
}

export function isBlockedDomain(host: string, s: Settings): boolean {
  return blockedDomains(s).some((d) => host === d || host.endsWith(`.${d}`));
}

/** Deterministic fake IP inside TEST-NET-2 (198.18.0.0/16). */
export function fakeIp(domain: string): string {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return `198.18.0.${(h % 250) + 2}`;
}

/* -------------------------------------------------------------------------- */
/*  Authentication                                                             */
/* -------------------------------------------------------------------------- */

export interface Credentials {
  kind: 'vless' | 'trojan';
  /** UUID for VLESS, password for Trojan. */
  secret: string;
}

/**
 * Extract credentials from the upgrade request. Accepted locations:
 *  - path:  /vless/<uuid>            /trojan/<password>
 *  - query: /vless?uuid=…            /trojan?pass=…
 *  - the first proxied request (proxy-authorization header) — handled later.
 */
export function credentialsFromRequest(
  kind: 'vless' | 'trojan',
  url: URL,
  headers: Headers,
): Credentials | null {
  const seg = url.pathname.split('/').filter(Boolean);
  let secret = '';
  if (kind === 'vless') {
    if (seg.length === 2 && seg[0] === 'vless') secret = decodeURIComponent(seg[1]);
    if (!secret) secret = url.searchParams.get('uuid') || '';
  } else {
    if (seg.length === 2 && seg[0] === 'trojan') secret = decodeURIComponent(seg[1]);
    if (!secret) secret = url.searchParams.get('pass') || '';
  }
  if (!secret) {
    const pa = headers.get('proxy-authorization') || '';
    if (/^Bearer\s+/i.test(pa)) secret = pa.replace(/^Bearer\s+/i, '').trim();
    else if (/^Basic\s+/i.test(pa)) {
      try {
        const decoded = atob(pa.replace(/^Basic\s+/i, '').trim());
        secret = decoded.startsWith(':') ? decoded.slice(1) : decoded;
      } catch {
        secret = '';
      }
    }
  }
  if (!secret) return null;
  return { kind, secret };
}

/* -------------------------------------------------------------------------- */
/*  Inner HTTP request parsing                                                 */
/* -------------------------------------------------------------------------- */

interface InnerRequest {
  method: string;
  /** Relative path+query or absolute URL. */
  path: string;
  headers: Record<string, string>;
  contentLength: number;
  upgrade: boolean;
}

/** Parse an HTTP/1.1 request head from a (possibly partial) buffer. */
export function parseRequestHead(buf: string): InnerRequest | null {
  const idx = buf.indexOf('\r\n\r\n');
  if (idx < 0) return null;
  const head = buf.slice(0, idx);
  const lines = head.split('\r\n');
  const [method, path] = (lines[0] || '').split(' ');
  if (!method || !path) return null;
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    headers[line.slice(0, ci).trim().toLowerCase()] = line.slice(ci + 1).trim();
  }
  const cl = headers['content-length'];
  return {
    method: method.toUpperCase(),
    path,
    headers,
    contentLength: cl ? parseInt(cl, 10) || 0 : 0,
    upgrade: !!(headers['upgrade'] || (headers['sec-websocket-key'] && headers['sec-websocket-version'])),
  };
}

/* -------------------------------------------------------------------------- */
/*  Response building (HTTP/1.1 head + chunked/raw body)                       */
/* -------------------------------------------------------------------------- */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

/** Build the response head text. */
export function buildResponseHead(status: number, reason: string, headers: Headers, chunked: boolean): string {
  const lines = [`HTTP/1.1 ${status} ${reason}`];
  headers.forEach((v, k) => {
    if (HOP_BY_HOP.has(k.toLowerCase())) return;
    lines.push(`${k}: ${v}`);
  });
  if (chunked && !headers.has('transfer-encoding')) lines.push('Transfer-Encoding: chunked');
  lines.push('', '');
  return lines.join('\r\n');
}

/* -------------------------------------------------------------------------- */
/*  WebSocket bridge helpers                                                   */
/* -------------------------------------------------------------------------- */

export type WsConn = {
  ready: Promise<void>;
  binaryType: string;
  close: (code?: number, reason?: string) => void;
  send: (data: string | ArrayBuffer | Uint8Array | Array<ArrayBuffer | Uint8Array>) => void;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: (() => void) | null;
  onerror: ((ev: Event) => void) | null;
};

/**
 * Handle one proxied WebSocket session for VLESS/Trojan.
 * `ws` is the client socket (Hono c.websocket). The first message(s) contain
 * the inner HTTP request; we stream the answer back over the same socket.
 */
export async function handleProxySession(
  ws: WsConn,
  request: Request,
  settings: Settings,
  cred: Credentials,
  log: LogFn,
): Promise<void> {
  const url = new URL(request.url);
  const kind = url.pathname.includes('/trojan') ? 'trojan' : 'vless';

  // Verify credentials (path/query first; header fallback happens below).
  let authorized =
    (kind === 'vless' && cred.secret === settings.uuid) ||
    (kind === 'trojan' && cred.secret === settings.trojanPassword);

  // ---- accumulate the inner request -------------------------------------
  let headBuf = '';
  let body: Uint8Array[] = [];
  let inner: InnerRequest | null = null;
  let done = false;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      ws.close(1000, 'bye');
    } catch {
      /* already closed */
    }
  };

  const send = (data: string | ArrayBuffer | Uint8Array) => {
    try {
      ws.send(data);
    } catch {
      close();
    }
  };

  const sendHead = (res: Response, hasBody: boolean) => {
    const chunked = hasBody && !res.headers.get('content-length');
    send(
      buildResponseHead(
        res.status,
        reasonPhrase(res.status),
        res.headers,
        chunked,
      ) as string,
    );
    return chunked;
  };

  const sendError = (status: number, msg: string) => {
    const body = `${msg}\r\n`;
    send(
      `HTTP/1.1 ${status} ${reasonPhrase(status)}\r\nContent-Type: text/plain\r\nContent-Length: ${te.encode(body).length}\r\nConnection: close\r\n\r\n${body}`,
    );
    close();
  };

  ws.onmessage = (ev: MessageEvent) => {
    if (done || closed) return;
    const data = ev.data as ArrayBuffer | string;

    // Header phase.
    if (!inner) {
      if (typeof data === 'string') {
        headBuf += data;
      } else {
        headBuf += td.decode(new Uint8Array(data));
      }
      const parsed = parseRequestHead(headBuf);
      if (!parsed) {
        if (headBuf.length > 1_048_576) {
          log('error', 'request head too large');
          sendError(400, 'bad request');
        }
        return;
      }
      inner = parsed;
      headBuf = '';

      // Fallback auth from the inner request headers.
      if (!authorized) {
        const pa = inner!.headers['proxy-authorization'] || '';
        let candidate = '';
        if (/^Bearer\s+/i.test(pa)) candidate = pa.replace(/^Bearer\s+/i, '').trim();
        else if (/^Basic\s+/i.test(pa)) {
          try {
            const decoded = atob(pa.replace(/^Basic\s+/i, '').trim());
            candidate = decoded.startsWith(':') ? decoded.slice(1) : decoded;
          } catch {
            candidate = '';
          }
        }
        authorized =
          (kind === 'vless' && candidate === settings.uuid) ||
          (kind === 'trojan' && candidate === settings.trojanPassword);
        if (!authorized) {
          log('warning', 'unauthorized access attempt');
          sendError(407, 'authentication required');
          return;
        }
      }

      // WebSocket upgrade inside the proxied stream?
      if (inner!.upgrade) {
        void handleInnerWebSocket(ws, inner!, settings, log, close);
        done = true;
        return;
      }

      // Bodyless request → go straight to the fetch.
      if (inner!.contentLength === 0) {
        done = true;
        void handleHttpRequest(ws, inner!, [], settings, send, sendHead, sendError, log, close);
        return;
      }
      return;
    }

    // Body phase.
    const bytes = typeof data === 'string' ? te.encode(data) : new Uint8Array(data as ArrayBuffer);
    if (bytes.length === 0) {
      // Empty frame = end-of-request marker (Xray convention) or keep-alive.
      if (inner!.contentLength > 0 && bodyBytes(body) < inner!.contentLength) {
        // Treat as terminator only when nothing more is coming.
        log('debug', 'empty frame while expecting body — finishing request');
      }
      done = true;
      void handleHttpRequest(ws, inner!, body, settings, send, sendHead, sendError, log, close);
      return;
    }
    body.push(bytes);
    const total = bodyBytes(body);
    if (inner!.contentLength > 0 && total >= inner!.contentLength) {
      // Trim to the exact content length.
      let excess = total - inner!.contentLength;
      const out: Uint8Array[] = [];
      for (const b of body) {
        if (excess <= 0) {
          out.push(b);
          break;
        }
        if (b.length <= excess) excess -= b.length;
        else out.push(b.slice(0, b.length - excess)), (excess = 0);
      }
      body = out;
      done = true;
      void handleHttpRequest(ws, inner!, body, settings, send, sendHead, sendError, log, close);
    } else if (total > 16 * 1024 * 1024) {
      log('error', 'request body too large');
      sendError(413, 'payload too large');
    }
  };

  ws.onclose = () => close();
  ws.onerror = () => close();

  // Fast-fail when the upgrade URL explicitly carried the *wrong* secret
  // (wrong secret in the header case still gets one try via the fallback
  // inside onmessage, since some clients only authenticate per-request).
  if (!authorized) {
    const seg = url.pathname.split('/').filter(Boolean);
    const explicit =
      (kind === 'vless' && (seg.length === 2 || url.searchParams.has('uuid'))) ||
      (kind === 'trojan' && (seg.length === 2 || url.searchParams.has('pass')));
    if (explicit) sendError(407, 'authentication required');
  }
}

function bodyBytes(parts: Uint8Array[]): number {
  let n = 0;
  for (const p of parts) n += p.length;
  return n;
}

/* -------------------------------------------------------------------------- */
/*  Outbound HTTP request                                                      */
/* -------------------------------------------------------------------------- */

async function handleHttpRequest(
  ws: WsConn,
  inner: InnerRequest,
  body: Uint8Array[],
  settings: Settings,
  send: (d: string | ArrayBuffer | Uint8Array) => void,
  sendHead: (res: Response, hasBody: boolean) => boolean,
  sendError: (status: number, msg: string) => void,
  log: LogFn,
  close: () => void,
): Promise<void> {
  try {
    // ---- resolve the target --------------------------------------------
    let host: string;
    let port: string | null;
    let pathAndQuery: string;
    const isAbsolute = /^https?:\/\//i.test(inner.path);
    if (isAbsolute) {
      const u = new URL(inner.path);
      host = u.hostname.toLowerCase();
      port = u.port || (u.protocol === 'http:' ? '80' : '443');
      pathAndQuery = u.pathname + u.search;
    } else {
      host = (inner.headers['host'] || '').toLowerCase().split(':')[0];
      const hp = (inner.headers['host'] || '').split(':');
      port = hp.length === 2 && /^\d+$/.test(hp[1]) ? hp[1] : null;
      pathAndQuery = inner.path;
    }
    if (!host) {
      sendError(400, 'missing host');
      return;
    }
    log('debug', `proxying ${inner.method} https://${host}${pathAndQuery}`);

    if (isBlockedDomain(host, settings)) {
      sendError(403, 'domain blocked by routing rules');
      return;
    }

    // ---- DNS + IP selection ----------------------------------------------
    let resolveOverride: { hostname: string; ip: string; port?: number } | undefined;
    const isIp = host.includes('.') && !host.includes(':')
      ? /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
      : host.includes(':');
    if (isIp) {
      resolveOverride = { hostname: host, ip: host, ...(port ? { port: Number(port) } : {}) };
    } else {
      const resolved = await resolveForProxy(settings, host);
      if (resolved) {
        resolveOverride = {
          hostname: host,
          ip: resolved.ip,
          ...(port && resolved.family === 4 ? { port: Number(port) } : {}),
        };
      } else {
        log('warning', `DNS resolution failed for ${host} — falling back to platform DNS`);
      }
    }

    // ---- build the upstream request --------------------------------------
    const target = `https://${host.includes(':') ? `[${host}]` : host}${port ? `:${port}` : ''}${pathAndQuery}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(inner.headers)) {
      if (HOP_BY_HOP.has(k) || k === 'host') continue;
      try {
        headers.set(k, v);
      } catch {
        /* skip invalid */
      }
    }
    if (port && !isAbsolute) headers.set('Host', port === '443' ? host : `${host}:${port}`);

    const hasBody = body.length > 0;

    let res: Response;

    // Chain proxy support.
    if (settings.chainProxy) {
      const chain = settings.chainProxy;
      if (/^https?:\/\//i.test(chain)) {
        // Plain HTTP proxy: issue the request through it.
        const proxyUrl = chain.replace(/\/$/, '') + '/' + target;
        res = await fetch(
          proxyUrl,
          {
            method: inner.method,
            headers,
            redirect: 'follow',
            ...(hasBody ? { body: concatBody(body), duplex: 'half' as const } : {}),
            signal: AbortSignal.timeout(60_000),
          } as RequestInit,
        );
      } else {
        // Chain through another VLESS/Trojan WS endpoint.
        res = await chainWsFetch(chain, target, inner, body, headers, log);
      }
    } else {
      res = await overrideFetch(
        target,
        resolveOverride,
        {
          method: inner.method,
          headers,
          redirect: 'follow',
          ...(hasBody ? { body: concatBody(body), duplex: 'half' as const } : {}),
          signal: AbortSignal.timeout(60_000),
        } as RequestInit,
      );
    }

    // ---- stream the response back -----------------------------------------
    const chunked = sendHead(res, !res.body);
    if (res.body) {
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;
          if (chunked) {
            // Encode chunk: size(hex)\r\n<data>\r\n
            const head = `${value.length.toString(16)}\r\n`;
            send(concat([te.encode(head), value, te.encode('\r\n')]));
          } else {
            send(value);
          }
        }
        if (chunked) send('0\r\n\r\n');
      } finally {
        reader.releaseLock();
      }
    }
    close();
  } catch (err) {
    log('error', `proxy error: ${(err as Error)?.message || String(err)}`);
    try {
      sendError(502, 'upstream error');
    } catch {
      close();
    }
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function concatBody(body: Uint8Array[]): Uint8Array {
  return concat(body);
}

interface ChainResponse {
  status: number;
  reason: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Decode a (complete) chunked transfer-encoding body. Null when incomplete. */
function dechunk(data: Uint8Array): Uint8Array | null {
  let pos = 0;
  const out: Uint8Array[] = [];
  for (;;) {
    // Parse the chunk-size line.
    let lineEnd = -1;
    for (let i = pos; i < data.length - 1; i++) {
      if (data[i] === 0x0d && data[i + 1] === 0x0a) {
        lineEnd = i;
        break;
      }
    }
    if (lineEnd < 0) return null;
    const sizeStr = td.decode(data.subarray(pos, lineEnd));
    const size = parseInt(sizeStr.split(';')[0], 16);
    if (!Number.isFinite(size)) return null;
    pos = lineEnd + 2;
    if (size === 0) {
      // Expect the terminating "\r\n" trailer end (tolerate its absence).
      return concat(out);
    }
    if (pos + size + 2 > data.length) return null;
    out.push(data.subarray(pos, pos + size));
    pos += size + 2;
  }
}

/**
 * Run the inner request through a chain VLESS/Trojan WebSocket endpoint.
 * Reuses the same HTTP-over-WS convention as our own proxy.
 */
async function chainWsFetch(
  chainUrl: string,
  target: string,
  inner: InnerRequest,
  body: Uint8Array[],
  headers: Headers,
  log: LogFn,
): Promise<Response> {
  const u = new URL(chainUrl);
  const wsUrl = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}${u.pathname}${u.search}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  const host = new URL(target).hostname;
  const reqHead: string[] = [`${inner.method} ${target} HTTP/1.1`, `Host: ${host}`];
  headers.forEach((v, k) => reqHead.push(`${k}: ${v}`));
  if (body.length > 0 && !headers.has('content-length')) {
    reqHead.push(`Content-Length: ${bodyBytes(body)}`);
  }
  reqHead.push('', '');
  const headText = reqHead.join('\r\n');

  const result = await new Promise<ChainResponse>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const state: ChainResponse = { status: 502, reason: '', headers: {}, body: new Uint8Array(0) };
    let headEnd = -1;
    let cl = -1;
    let chunked = false;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      if (err) reject(err);
      else resolve(state);
    };

    const timer = setTimeout(
      () => finish(new Error('chain response timeout')),
      30_000,
    );

    ws.onopen = () => {
      ws.send(headText);
      if (body.length > 0) ws.send(concat(body));
      ws.send('');
    };
    ws.onerror = () => finish(new Error('chain connection failed'));
    ws.onclose = () => {
      // If the chain closed early, try to decode what we have (chunked).
      if (!settled && headEnd >= 0 && chunked) {
        const all = concat(chunks);
        const decoded = dechunk(all.subarray(headEnd));
        if (decoded) {
          state.body = decoded;
          finish();
          return;
        }
      }
      finish(new Error('chain closed before full response'));
    };

    ws.onmessage = (ev) => {
      if (settled) return;
      const bytes =
        typeof ev.data === 'string' ? te.encode(ev.data) : new Uint8Array(ev.data as ArrayBuffer);
      if (bytes.length === 0) return;
      chunks.push(bytes);
      const all = concat(chunks);

      if (headEnd < 0) {
        const str = td.decode(all);
        const idx = str.indexOf('\r\n\r\n');
        if (idx < 0) {
          if (all.length > 65_536) finish(new Error('chain response head too large'));
          return;
        }
        headEnd = te.encode(str.slice(0, idx + 4)).length;
        const lines = str.slice(0, idx).split('\r\n');
        const statusParts = (lines[0] || ' ').split(' ');
        state.status = parseInt(statusParts[1] || '502', 10) || 502;
        state.reason = statusParts.slice(2).join(' ') || reasonPhrase(state.status);
        for (const line of lines.slice(1)) {
          const ci = line.indexOf(':');
          if (ci > 0) {
            const k = line.slice(0, ci).trim();
            state.headers[k] = line.slice(ci + 1).trim();
            if (k.toLowerCase() === 'content-length') cl = parseInt(line.slice(ci + 1).trim(), 10);
            if (k.toLowerCase() === 'transfer-encoding') chunked = true;
          }
        }
        return;
      }

      const bodyLen = all.length - headEnd;
      const complete = chunked
        ? dechunk(all.subarray(headEnd)) !== null
        : cl < 0
          ? bodyLen > 0
          : bodyLen >= cl;
      if (!complete) return;

      if (chunked) {
        state.body = dechunk(all.subarray(headEnd))!;
      } else {
        const end = cl >= 0 ? Math.min(bodyLen, cl) : bodyLen;
        state.body = all.subarray(headEnd, headEnd + end);
      }
      finish();
    };
  });

  const rh = new Headers();
  for (const [k, v] of Object.entries(result.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) rh.set(k, v);
  }
  log('debug', 'chain response received');
  return new Response(result.body.slice().buffer as ArrayBuffer, {
    status: result.status,
    statusText: result.reason,
    headers: rh,
  });
}

/* -------------------------------------------------------------------------- */
/*  Inner WebSocket upgrade (WebSocket traffic through the proxy)              */
/* -------------------------------------------------------------------------- */

async function handleInnerWebSocket(
  ws: WsConn,
  inner: InnerRequest,
  settings: Settings,
  log: LogFn,
  close: () => void,
): Promise<void> {
  try {
    const host = (inner.headers['host'] || '').toLowerCase();
    if (!host || isBlockedDomain(host, settings)) {
      const head = `HTTP/1.1 ${isBlockedDomain(host, settings) ? 403 : 400} ${''}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;
      try {
        ws.send(head);
      } catch {
        /* noop */
      }
      close();
      return;
    }
    const wsUrl = `wss://${host.includes(':') ? `[${host}]` : host}${inner.path}`;
    const target = new WebSocket(wsUrl, undefined);
    target.binaryType = 'arraybuffer';
    const secKey = inner.headers['sec-websocket-key'] || '';
    const proto = inner.headers['sec-websocket-protocol'];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('inner ws timeout')), 10_000);
      target.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      target.onerror = () => {
        clearTimeout(timer);
        reject(new Error('inner ws failed'));
      };
    });

    // Proper Sec-WebSocket-Accept for the inner handshake:
    // base64(sha1(key + GUID)) per RFC 6455.
    let accept = '';
    try {
      const digest = await crypto.subtle.digest(
        'SHA-1',
        te.encode(secKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11') as BufferSource,
      );
      let bin = '';
      for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
      accept = btoa(bin);
    } catch {
      accept = '';
    }
    const head: string[] = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
    ];
    if (accept) head.push(`Sec-WebSocket-Accept: ${accept}`);
    if (proto) head.push(`Sec-WebSocket-Protocol: ${proto.split(',')[0].trim()}`);
    head.push('', '');
    ws.send(head.join('\r\n'));

    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      try {
        target.close();
      } catch {
        /* noop */
      }
      close();
    };
    ws.onmessage = (ev) => {
      try {
        target.send(ev.data as ArrayBuffer);
      } catch {
        shutdown();
      }
    };
    target.onmessage = (ev) => {
      try {
        ws.send(ev.data as ArrayBuffer);
      } catch {
        shutdown();
      }
    };
    target.onclose = shutdown;
    target.onerror = shutdown;
    log('debug', `inner websocket bridge → ${host}`);
  } catch (err) {
    log('error', `inner websocket error: ${(err as Error)?.message || String(err)}`);
    try {
      ws.send('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    } catch {
      /* noop */
    }
    close();
  }
}

/* -------------------------------------------------------------------------- */
/*  Private DoH server                                                         */
/* -------------------------------------------------------------------------- */

export interface DoHQuery {
  name: string;
}

/**
 * Answer a dns-json DoH query with the panel's behaviour:
 *  - fake DNS for bypassed domains (when enabled),
 *  - anti-sanction resolution via a US DoH (when enabled),
 *  - otherwise the configured remote DNS.
 */
export async function answerDoH(
  q: DoHQuery,
  settings: Settings,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const name = (q.name || '').toLowerCase().replace(/\.$/, '');
  if (!name || name.length > 253) {
    return { status: 400, body: { Status: 3, Error: 'bad name', Answer: [] } };
  }
  if (name === 'localhost' || name.endsWith('.local') || name.endsWith('.internal')) {
    return {
      status: 200,
      body: { Status: 0, Answer: [{ name, type: 1, data: '127.0.0.1' }] },
    };
  }
  // Fake DNS: don't leak bypassed domains to external resolvers.
  if (settings.fakeDns && bypassDomains(settings).some((d) => name === d || name.endsWith(`.${d}`))) {
    return {
      status: 200,
      body: {
        Status: 0,
        Answer: [
          { name, type: 1, data: fakeIp(name) },
          { name, type: 28, data: '2001:db8::1' },
        ],
      },
    };
  }
  // Anti-sanction: sanctioned domains are resolved through a US DoH.
  const isSanctioned =
    settings.antiSanctionDns &&
    settings.routing.sanctionsEnabled &&
    settings.routing.sanctions.some((d) => name === d || name.endsWith(`.${d}`));
  const server = isSanctioned ? 'https://dns.google/resolve' : settings.remoteDns;
  try {
    const res = await fetch(`${server}?name=${encodeURIComponent(name)}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`doh ${res.status}`);
    const json = (await res.json()) as { Status?: number; Answer?: unknown[] };
    const ips = parseDoHResponse(json as Parameters<typeof parseDoHResponse>[0]);
    if (ips.length === 0) {
      return { status: 200, body: { Status: json.Status ?? 3, Answer: json.Answer || [] } };
    }
    return { status: 200, body: { Status: 0, Answer: json.Answer || [] } };
  } catch {
    // Fallback resolver.
    try {
      const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(name)}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        return { status: 200, body: json };
      }
    } catch {
      /* fall through */
    }
    return { status: 502, body: { Status: 2, Error: 'resolution failed', Answer: [] } };
  }
}

/** HTTP status reason phrases (short list). */
export function reasonPhrase(code: number): string {
  const map: Record<number, string> = {
    100: 'Continue',
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    403: 'Forbidden',
    404: 'Not Found',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    413: 'Payload Too Large',
    426: 'Upgrade Required',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return map[code] || 'OK';
}
