/**
 * Mobin Panel — auth service tests
 * Created by Mobin.A
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSessionCookie,
  getAuthContext,
  initialize,
  isInitialized,
  readSessionCookie,
  resetPassword,
  sessionCookieValue,
  signSession,
  verifyPassword,
  verifySession,
} from '../src/services/auth';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../src/utils/constants';
import { KvStub } from './helpers';

const FUTURE = Date.now() + 1000 * 60 * 60; // +1h

describe('initialize & isInitialized', () => {
  let kv: KvStub;
  beforeEach(() => {
    kv = new KvStub();
  });

  it('starts uninitialized and becomes initialized after initialize()', async () => {
    const env = kv.asEnv();
    expect(await isInitialized(env)).toBe(false);
    await initialize(env, 'Str0ng!Passw0rd');
    expect(await isInitialized(env)).toBe(true);
  });

  it('initialize() does not overwrite an existing session secret', async () => {
    const env = kv.asEnv();
    await initialize(env, 'Str0ng!Passw0rd');
    const secret1 = await env.MOBIN_KV.get('mp:secret');
    await initialize(env, 'Another-Pass9');
    const secret2 = await env.MOBIN_KV.get('mp:secret');
    expect(secret1).toBeTruthy();
    expect(secret1).toBe(secret2);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password, rejects others', async () => {
    const kv = new KvStub();
    const env = kv.asEnv();
    expect(await verifyPassword(env, 'anything')).toBe(false);
    await initialize(env, 'Str0ng!Passw0rd');
    expect(await verifyPassword(env, 'Str0ng!Passw0rd')).toBe(true);
    expect(await verifyPassword(env, 'wrong-password1')).toBe(false);
  });

  it('resetPassword rotates the credential', async () => {
    const kv = new KvStub();
    const env = kv.asEnv();
    await initialize(env, 'First-Passw0rd!');
    await resetPassword(env, 'Second-Passw0rd!');
    expect(await verifyPassword(env, 'First-Passw0rd!')).toBe(false);
    expect(await verifyPassword(env, 'Second-Passw0rd!')).toBe(true);
  });
});

describe('session signing', () => {
  it('signs and verifies within the TTL', async () => {
    const kv = new KvStub();
    const env = kv.asEnv();
    await initialize(env, 'Str0ng!Passw0rd');
    const raw = await signSession(env, FUTURE);
    expect(raw).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await verifySession(env, raw)).toBe(true);
  });

  it('rejects tampered, malformed and expired sessions', async () => {
    const kv = new KvStub();
    const env = kv.asEnv();
    await initialize(env, 'Str0ng!Passw0rd');
    const raw = await signSession(env, FUTURE);
    const [expires, sig] = raw.split('.');
    expect(await verifySession(env, `${expires}.${'0'.repeat(64)}`)).toBe(false); // wrong sig
    expect(await verifySession(env, 'garbage')).toBe(false);
    const past = await signSession(env, Date.now() - 1000);
    expect(await verifySession(env, past)).toBe(false); // expired
  });

  it('sessionCookieValue / clearSessionCookie format', async () => {
    const kv = new KvStub();
    const env = kv.asEnv();
    await initialize(env, 'Str0ng!Passw0rd');
    const raw = await signSession(env, Date.now() + SESSION_TTL_MS);
    const header = sessionCookieValue(Date.now() + SESSION_TTL_MS, raw, true);
    expect(header).toContain(`${SESSION_COOKIE}=${raw}`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('getAuthContext', () => {
  it('reads the cookie from a real Request', async () => {
    const kv = new KvStub();
    const env = kv.asEnv();
    await initialize(env, 'Str0ng!Passw0rd');
    const raw = await signSession(env, FUTURE);

    const withCookie = new Request('https://panel.example.com/api/status', {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=${raw}; x=2` },
    });
    expect(await getAuthContext(env, withCookie)).toEqual({
      initialized: true,
      authenticated: true,
    });

    const withoutCookie = new Request('https://panel.example.com/api/status');
    expect(await getAuthContext(env, withoutCookie)).toEqual({
      initialized: true,
      authenticated: false,
    });
  });

  it('reports uninitialized before setup', async () => {
    const kv = new KvStub();
    const req = new Request('https://panel.example.com/');
    expect(await getAuthContext(kv.asEnv(), req)).toEqual({
      initialized: false,
      authenticated: false,
    });
  });

  it('readSessionCookie returns null when absent', () => {
    expect(readSessionCookie(new Request('https://x.example/'))).toBeNull();
    expect(
      readSessionCookie(
        new Request('https://x.example/', { headers: { cookie: 'a=b' } }),
      ),
    ).toBeNull();
  });
});
