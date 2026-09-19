/**
 * Mobin Panel — test helpers
 * Created by Mobin.A
 */
import type { Env, Settings } from '../src/types';
import type { StoredWg } from '../src/services/kv';
import { defaultSettings } from '../src/utils/constants';

/** Factory-default settings, optionally overridden. */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...overrides };
}

/** A fixed WireGuard keypair (valid base64, 32-byte keys). */
export function makeWg(): StoredWg {
  return {
    privateKey: 'dGVzdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    publicKey: 'cHVibGljS2V5S2V5S2V5S2V5S2V5S2V5S2V5S2V5S2V5S2U=',
  };
}

export function makeCtx(
  settings: Partial<Settings> = {},
  host = 'panel.example.com',
): { s: Settings; ctx: import('../src/services/configGenerator').Ctx } {
  const s = makeSettings(settings);
  return {
    s,
    ctx: {
      s,
      host,
      dohUrl: `https://${host}/doh/testkey`,
      wg: makeWg(),
    },
  };
}

/** In-memory KVNamespace stub for service tests. */
export class KvStub {
  private store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.has(key) ? (this.store.get(key) as string) : null);
  }

  put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
    const prefix = opts?.prefix ?? '';
    const keys = [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }));
    return Promise.resolve({ keys, list_complete: true });
  }

  asEnv(): Env {
    return { MOBIN_KV: this as unknown as Env['MOBIN_KV'] };
  }
}
