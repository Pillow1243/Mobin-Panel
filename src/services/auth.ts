/**
 * Mobin Panel — authentication service
 * Created by Mobin.A
 *
 * - Passwords are stored as SHA-256 hashes in KV (the panel is single-user;
 *   this matches the reference design and keeps KV free of secrets-in-plain).
 * - Sessions are signed with an HMAC-SHA256 secret (also stored in KV) and
 *   delivered via an HttpOnly cookie:  mobin_session=<expiryMs>.<hmacHex>
 */
import type { Env } from '../types';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../utils/constants';
import { hmacSha256Hex, randomKey, sha256Hex, timingSafeEqual } from '../utils/crypto';
import {
  getSessionSecret,
  getPasswordHash,
  setPasswordHash,
  setSessionSecret,
} from './kv';

export interface AuthContext {
  initialized: boolean;
  authenticated: boolean;
}

/** Check whether a password hash exists (i.e. the panel was initialized). */
export async function isInitialized(env: Env): Promise<boolean> {
  const hash = await getPasswordHash(env.MOBIN_KV);
  return !!hash;
}

/** Initialize the panel on first run: store the password hash + session secret. */
export async function initialize(env: Env, password: string): Promise<void> {
  const hash = await sha256Hex(password);
  await setPasswordHash(env.MOBIN_KV, hash);
  const existing = await getSessionSecret(env.MOBIN_KV);
  if (!existing) await setSessionSecret(env.MOBIN_KV, randomKey(32));
}

/** Verify a plaintext password against the stored hash. */
export async function verifyPassword(env: Env, password: string): Promise<boolean> {
  const stored = await getPasswordHash(env.MOBIN_KV);
  if (!stored) return false;
  const candidate = await sha256Hex(password);
  return timingSafeEqual(candidate, stored);
}

/** Rotate the password (authenticated "Reset password" action). */
export async function resetPassword(env: Env, newPassword: string): Promise<void> {
  await setPasswordHash(env.MOBIN_KV, await sha256Hex(newPassword));
}

/** Build the signed session cookie value for the given expiry. */
export async function signSession(env: Env, expiresMs: number): Promise<string> {
  const secret = await ensureSecret(env);
  const sig = await hmacSha256Hex(secret, String(expiresMs));
  return `${expiresMs}.${sig}`;
}

/** Verify a raw cookie value; returns true when valid and unexpired. */
export async function verifySession(env: Env, raw: string): Promise<boolean> {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return false;
  const expires = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const secret = await ensureSecret(env);
  const expected = await hmacSha256Hex(secret, String(expires));
  return timingSafeEqual(expected, sig);
}

async function ensureSecret(env: Env): Promise<string> {
  const secret = await getSessionSecret(env.MOBIN_KV);
  if (secret) return secret;
  const fresh = randomKey(32);
  await setSessionSecret(env.MOBIN_KV, fresh);
  return fresh;
}

/** Compose the Set-Cookie header for a new session. */
export function sessionCookieValue(expiresMs: number, raw: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${raw}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor((expiresMs - Date.now()) / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Header clearing the session cookie. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Extract the session cookie from a request (null when absent). */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) return part.slice(idx + 1).trim() || null;
  }
  return null;
}

/** Full auth state for a request (used by the auth middleware). */
export async function getAuthContext(env: Env, request: Request): Promise<AuthContext> {
  const initialized = await isInitialized(env);
  if (!initialized) return { initialized, authenticated: false };
  const raw = readSessionCookie(request);
  const authenticated = raw ? await verifySession(env, raw) : false;
  return { initialized, authenticated };
}
