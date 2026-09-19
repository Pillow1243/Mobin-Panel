/**
 * Mobin Panel — DNS service
 * Created by Mobin.A
 *
 * Implements:
 *  - DNS over HTTPS (dns-json) resolution against a configurable upstream
 *  - "best IP" selection by measuring latency to the top candidates
 *  - NAT64 IPv6 address synthesis from resolved IPv4 addresses
 *  - Clean-IP / Proxy-IP preference lists
 */
import type { Settings } from '../types';

export interface ResolvedIp {
  ip: string;
  family: 4 | 6;
}

export interface DoHRecord {
  name?: string;
  type?: number;
  data?: string;
}

const IP_V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Parse a dns-json response into resolved IPs (A + AAAA). */
export function parseDoHResponse(json: {
  Status?: number;
  Answer?: DoHRecord[];
}): ResolvedIp[] {
  if (!json || json.Status !== 0) return [];
  const out: ResolvedIp[] = [];
  for (const rec of json.Answer || []) {
    if (rec.type === 1 && rec.data && IP_V4_RE.test(rec.data)) {
      out.push({ ip: rec.data, family: 4 });
    } else if (rec.type === 28 && rec.data) {
      out.push({ ip: rec.data.toLowerCase(), family: 6 });
    }
  }
  // Stable order: A records first, then AAAA.
  out.sort((a, b) => a.family - b.family);
  return out;
}

/**
 * Build the dns-json query URL for the given DoH server.
 * Supports the common shapes:
 *   https://1.1.1.1/dns-query  → /dns-query?name=…
 *   https://dns.google/resolve → /resolve?name=…
 *   https://dns.example.com    → /?name=…
 */
export function buildDoHUrl(server: string, name: string): string {
  try {
    const u = new URL(server);
    // Keep the provider's exact endpoint path (e.g. /dns-query, /resolve).
    // A trailing slash after the endpoint would 404 on many providers.
    const path = u.pathname === '' ? '/' : u.pathname;
    return `${u.origin}${path}?name=${encodeURIComponent(name)}&type=A`;
  } catch {
    return '';
  }
}

/**
 * Resolve a hostname via the configured upstream DoH.
 * Returns [] on any failure (the caller decides how to degrade).
 */
export async function resolveDoH(
  server: string,
  name: string,
  signal?: AbortSignal,
): Promise<ResolvedIp[]> {
  const url = buildDoHUrl(server, name);
  if (!url) return [];
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: signal ?? AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return parseDoHResponse((await res.json()) as { Status?: number; Answer?: DoHRecord[] });
  } catch {
    return [];
  }
}

/**
 * fetch() with a forced-IP resolution override (`cf.resolveOverride`).
 * The object form is supported by the Workers runtime; the installed type
 * package only documents the string form, hence the cast.
 */
export interface ResolveOverride {
  hostname: string;
  ip: string;
  port?: number;
}

export function overrideFetch(
  url: string,
  override: ResolveOverride | undefined,
  init: RequestInit = {},
): Promise<Response> {
  const merged = override ? { ...init, cf: { resolveOverride: override } } : init;
  return fetch(url, merged as RequestInit);
}

/**
 * Pick the lowest-latency IP among candidates by issuing a cheap HEAD-like
 * request (we connect to `https://<ip>/` with resolveOverride, which forces
 * the desired IP, and measure time-to-first-bytes).
 */
export async function pickBestIp(
  ips: ResolvedIp[],
  hostname: string,
  intervalMs: number,
): Promise<ResolvedIp | null> {
  if (ips.length === 0) return null;
  if (ips.length === 1 || intervalMs <= 0) return ips[0];
  const sample = ips.slice(0, 4);
  const t0 = performance.now();
  const results = await Promise.allSettled(
    sample.map(async (r) => {
      const start = performance.now();
      try {
        await overrideFetch(
          `https://${r.ip}/`,
          { hostname, ip: r.ip },
          { method: 'GET', signal: AbortSignal.timeout(intervalMs) },
        );
      } catch {
        /* connection errors are fine — we only measure latency */
      }
      return { r, ms: performance.now() - start };
    }),
  );
  let best: ResolvedIp | null = null;
  let bestMs = Infinity;
  for (const x of results) {
    if (x.status === 'fulfilled' && x.value.ms < bestMs) {
      bestMs = x.value.ms;
      best = x.value.r;
    }
  }
  // If the whole ping window blew past budget, fall back to the first record
  // (DNS order is usually good enough).
  if (performance.now() - t0 > intervalMs * 2) return ips[0];
  return best ?? ips[0];
}

/**
 * Convert an IPv4 address to its IPv6 form under a NAT64 prefix.
 * The prefix supplies the first 80 bits (5 hextets); the 4 IPv4 octets
 * become the last 2 hextets.  Example:
 *   nat64('8.8.8.8', '64:ff9b::') → '64:ff9b:0:0:0:808:808'
 */
export function nat64(ipv4: string, prefix: string): string | null {
  const m = IP_V4_RE.exec(ipv4);
  if (!m) return null;
  const b = m.slice(1).map((x) => Number(x));
  if (b.some((x) => x > 255)) return null;
  const base = prefix.replace(/\/\d+$/, '').trim().toLowerCase();
  if (!base.includes(':')) return null;
  const parts = base.split(':').filter((g) => g !== '');
  if (parts.length < 2 || parts.length > 5) return null;
  const hextets = [...parts, '0', '0', '0', '0', '0'].slice(0, 5);
  const g6 = ((b[0] << 8) | b[1]).toString(16).padStart(4, '0');
  const g7 = ((b[2] << 8) | b[3]).toString(16).padStart(4, '0');
  return `${hextets[0]}:${hextets[1]}:${hextets[2]}:${hextets[3]}:${hextets[4]}:${g6}:${g7}`;
}

/** Find a preferred IP list for a domain from clean-IP / proxy-IP settings. */
export function preferredIps(
  s: Settings,
  domain: string,
): { domain: string; ips: string[] } | null {
  const entries = [...s.cleanIps, ...s.proxyIps];
  for (const e of entries) {
    if (!e.domain) continue;
    if (domain === e.domain || domain.endsWith(`.${e.domain}`)) {
      const ips = e.ips
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (ips.length > 0) return { domain: e.domain, ips };
    }
  }
  return null;
}

/**
 * Full resolution pipeline for the proxy data path:
 *   1. prefer configured clean/proxy IPs for the domain,
 *   2. otherwise DoH-resolve with the remote DNS,
 *   3. apply NAT64 when the mode is nat64,
 *   4. pick the best IP by latency.
 *
 * Returns null when nothing resolvable was found.
 */
export async function resolveForProxy(
  s: Settings,
  domain: string,
  signal?: AbortSignal,
): Promise<ResolvedIp | null> {
  const preferred = preferredIps(s, domain);
  const candidates: ResolvedIp[] = [];

  if (preferred) {
    for (const ip of preferred.ips) {
      if (IP_V4_RE.test(ip)) candidates.push({ ip, family: 4 });
      else if (ip.includes(':')) candidates.push({ ip: ip.toLowerCase(), family: 6 });
    }
  } else {
    const resolved = await resolveDoH(s.remoteDns, domain, signal);
    if (resolved.length === 0) return null;
    if (s.ipv6) candidates.push(...resolved);
    else candidates.push(...resolved.filter((r) => r.family === 4));
    if (candidates.length === 0) candidates.push(...resolved);
  }

  // NAT64: map IPv4 → IPv6 under the configured prefix.
  if (s.proxyIpMode === 'nat64' && s.nat64Prefixes.length > 0) {
    const prefix = s.nat64Prefixes[0];
    const mapped: ResolvedIp[] = [];
    for (const c of candidates) {
      if (c.family === 4) {
        const v6 = nat64(c.ip, prefix);
        if (v6) mapped.push({ ip: v6, family: 6 });
      } else {
        mapped.push(c);
      }
    }
    if (mapped.length > 0) {
      candidates.length = 0;
      candidates.push(...mapped);
    }
  }

  const best = await pickBestIp(candidates, domain, s.bestPingInterval);
  return best;
}
