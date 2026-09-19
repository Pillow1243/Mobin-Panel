/**
 * Mobin Panel — input validation & sanitization
 * Created by Mobin.A
 *
 * Every field coming from the client is coerced/clamped here so that the KV
 * document can never contain hostile or malformed data.
 */

export function asString(v: unknown, max = 512, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  // Strip control characters (keep nothing exotic).
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

export function asStringArray(v: unknown, maxLen = 64, maxItem = 255): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxLen).map((x) => asString(x, maxItem)).filter(Boolean);
}

export function asInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

const SAFE_HTTPS = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/\S*)?$/i;
const SAFE_DOH = /^https:\/\/[\w.-]+(:\d+)?(\/\S*)?$/i;

/** Accepts https:// URLs only (panel endpoints). */
export function asHttpUrl(v: unknown, fallback = ''): string {
  const s = asString(v, 512, fallback);
  return SAFE_HTTPS.test(s) ? s : fallback;
}

/** Accepts https:// DoH server URLs. */
export function asDohUrl(v: unknown, fallback = ''): string {
  const s = asString(v, 512, fallback);
  return SAFE_DOH.test(s) ? s : fallback;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

/** Validate a domain name (no wildcards, no IPs). */
export function asDomain(v: unknown, fallback = ''): string {
  const s = asString(v, 253, fallback).toLowerCase();
  if (!DOMAIN_RE.test(s)) return fallback;
  // Reject IP-in-domain-form ("1.2.3.4"): the last label must not be all digits.
  const tld = s.split('.').pop() || '';
  if (tld.length < 2 || /^\d+$/.test(tld)) return fallback;
  return s;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/\d{1,2})?$/;
const IPV6_RE = /^[0-9a-f:]+(:\/\d{1,3})?$/i;

/** Validate an IPv4 (optionally /cidr) or IPv6 (optionally /cidr) string. */
export function asIpOrCidr(v: unknown, fallback = ''): string {
  const s = asString(v, 64, fallback).toLowerCase().trim();
  if (!s) return fallback;
  if (IPV4_RE.test(s)) {
    const parts = s.split('/')[0].split('.');
    if (parts.every((p) => Number(p) <= 255)) return s;
    return fallback;
  }
  if (IPV6_RE.test(s) && s.includes(':')) return s;
  return fallback;
}

/** Comma separated IP list, each entry validated. */
export function asIpList(v: unknown, fallback = ''): string {
  const s = asString(v, 1024, fallback);
  return s
    .split(',')
    .map((x) => asIpOrCidr(x))
    .filter(Boolean)
    .join(',');
}

const PORT_RE = /^\d+$/;
/** Validate a TCP port (1-65535). */
export function asPort(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = parseInt(String(v), 10);
  if (!PORT_RE.test(String(v).trim()) || n < 1 || n > 65535) return null;
  return n;
}

/** Accepts a proxy URL: vless/trojan/ss/socks5/http(s) with credentials. */
const PROXY_URL_RE =
  /^(vless|trojan|ss|socks5|socks|http|https):\/\/([^\s@]+@)?[a-z0-9.-]+(:\d+)?([/?#]\S*)?$/i;

export function asProxyUrl(v: unknown, fallback = ''): string {
  const s = asString(v, 1024, fallback);
  return PROXY_URL_RE.test(s) ? s : fallback;
}

/** Accepts a NAT64 prefix like 64:ff9b:: or 2001:db8::. */
const NAT64_PREFIX_RE = /^[0-9a-f:]+::\/?[0-9a-f:]?$/i;
export function asNat64Prefix(v: unknown, fallback = ''): string {
  const s = asString(v, 64, fallback).toLowerCase().trim();
  return NAT64_PREFIX_RE.test(s) ? s : fallback;
}

export interface SanitizeResult<T> {
  ok: T;
  errors: string[];
}

/** Length check for the admin password. */
export function validatePassword(pw: string): string | null {
  if (typeof pw !== 'string') return 'Password is required.';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password must be at most 128 characters.';
  return null;
}
