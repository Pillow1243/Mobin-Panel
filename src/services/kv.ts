/**
 * Mobin Panel — KV persistence layer
 * Created by Mobin.A
 *
 * All panel state lives in a single KV namespace under `mp:*` keys:
 *   mp:settings    → Settings JSON document
 *   mp:password    → SHA-256 hex of the admin password
 *   mp:secret      → random secret used to sign session cookies
 *   mp:stats       → PanelStats JSON document
 *   mp:telegram    → TelegramSettings JSON document
 *   mp:wg          → WireGuard keypair JSON (persisted so WG configs stay stable)
 *   mp:version     → installed panel version
 */
import type { Env, PanelStats, Settings, TelegramSettings } from '../types';
import { defaultSettings, sanitizeSettings, PANEL_VERSION } from '../utils/constants';

const K = {
  settings: 'mp:settings',
  password: 'mp:password',
  secret: 'mp:secret',
  stats: 'mp:stats',
  telegram: 'mp:telegram',
  wg: 'mp:wg',
  version: 'mp:version',
} as const;

export const KV_KEYS = Object.values(K);

async function getJson<T>(kv: KVNamespace, key: string, fallback: T): Promise<T> {
  try {
    const raw = await kv.get(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function putJson(kv: KVNamespace, key: string, value: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(value));
}

/** Load settings, merging factory defaults over whatever is stored. */
export async function loadSettings(kv: KVNamespace): Promise<Settings> {
  const raw = await getJson<Partial<Settings> | null>(kv, K.settings, null);
  let base: Settings;
  if (raw === null) {
    // First access: persist factory defaults so the panel identity
    // (uuid, trojanPassword, subscriptionKey) is stable across requests.
    base = defaultSettings();
    await putJson(kv, K.settings, base);
  } else {
    // Shallow-merge + sanitize so new fields keep sane defaults on upgrades.
    base = defaultSettings();
  }
  return sanitizeSettings({ ...base, ...(raw ?? {}) }, base);
}

/** Persist settings (already sanitized by the caller). */
export async function saveSettings(kv: KVNamespace, s: Settings): Promise<void> {
  await putJson(kv, K.settings, s);
}

/* ------------------------------- auth-related ----------------------------- */

export async function getPasswordHash(kv: KVNamespace): Promise<string | null> {
  return kv.get(K.password);
}

export async function setPasswordHash(kv: KVNamespace, hash: string): Promise<void> {
  await kv.put(K.password, hash);
}

export async function getSessionSecret(kv: KVNamespace): Promise<string | null> {
  return kv.get(K.secret);
}

export async function setSessionSecret(kv: KVNamespace, secret: string): Promise<void> {
  await kv.put(K.secret, secret);
}

/* ---------------------------------- stats --------------------------------- */

export async function loadStats(kv: KVNamespace): Promise<PanelStats> {
  return getJson<PanelStats>(kv, K.stats, { total: 0, buckets: {} });
}

export async function saveStats(kv: KVNamespace, stats: PanelStats): Promise<void> {
  await putJson(kv, K.stats, stats);
}

/**
 * Atomically-ish bump the request counter. Workers has no read-modify-write
 * primitive; this single-instance approximation is standard for panel stats
 * (the panel is single-user by design).
 */
export async function bumpRequest(kv: KVNamespace): Promise<PanelStats> {
  const stats = await loadStats(kv);
  const now = Math.floor(Date.now() / (10 * 60 * 1000)); // 10-minute buckets
  stats.total += 1;
  stats.buckets[String(now)] = (stats.buckets[String(now)] ?? 0) + 1;
  // Prune buckets older than 48h.
  const cutoff = now - 288;
  for (const key of Object.keys(stats.buckets)) {
    if (parseInt(key, 10) < cutoff) delete stats.buckets[key];
  }
  await saveStats(kv, stats);
  return stats;
}

/* --------------------------------- telegram ------------------------------- */

export async function loadTelegram(kv: KVNamespace): Promise<TelegramSettings> {
  return getJson<TelegramSettings>(kv, K.telegram, { enabled: false, botToken: '', userId: '' });
}

export async function saveTelegram(kv: KVNamespace, t: TelegramSettings): Promise<void> {
  await putJson(kv, K.telegram, t);
}

/* ------------------------------- wireguard -------------------------------- */

export interface StoredWg {
  privateKey: string;
  publicKey: string;
}

export async function loadWg(kv: KVNamespace): Promise<StoredWg | null> {
  return getJson<StoredWg | null>(kv, K.wg, null);
}

export async function saveWg(kv: KVNamespace, wg: StoredWg): Promise<void> {
  await putJson(kv, K.wg, wg);
}

/* --------------------------------- version -------------------------------- */

export async function getVersion(kv: KVNamespace): Promise<string> {
  return (await kv.get(K.version)) || PANEL_VERSION;
}

/** Wipe every panel key (the "Delete panel" quick action). */
export async function deletePanel(kv: KVNamespace): Promise<void> {
  const keys = await kv.list({ prefix: 'mp:' });
  for (const k of keys.keys) await kv.delete(k.name);
}

export type { Env };
