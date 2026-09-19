/**
 * Mobin Panel — cryptographic helpers
 * Created by Mobin.A
 *
 * All hashing uses the WebCrypto API (available natively in Cloudflare
 * Workers). No external crypto dependencies are required here.
 */

const te = new TextEncoder();
const td = new TextDecoder();

/** Encode a string to bytes. */
export function toBytes(s: string): Uint8Array {
  return te.encode(s);
}

/** Decode bytes to a UTF-8 string. */
export function fromBytes(b: Uint8Array): string {
  return td.decode(b);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 hex digest of a string. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toBytes(input) as BufferSource);
  return bufToHex(digest);
}

/** HMAC-SHA256 of `data` with `key`, returned as hex. */
export async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBytes(key) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, toBytes(data) as BufferSource);
  return bufToHex(sig);
}

/** Constant-time string comparison (avoids timing leaks on tokens). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = toBytes(a);
  const bb = toBytes(b);
  if (ab.length !== bb.length) {
    // Still run the comparison loop to keep timing uniform-ish.
    let diff = ab.length ^ bb.length;
    for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
      const x = i < ab.length ? ab[i] : 0;
      const y = i < bb.length ? bb[i] : 0;
      diff |= x ^ y;
    }
    return diff === 0;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Generate a random UUID v4. */
export function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Random alphanumeric password of `len` characters. */
export function randomPassword(len = 20): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const out = new Uint8Array(len);
  crypto.getRandomValues(out);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[out[i] % alphabet.length];
  return s;
}

/** Random key (base64url) of `n` bytes — used for session secrets. */
export function randomKey(n = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
