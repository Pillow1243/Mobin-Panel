/**
 * Mobin Panel — Telegram bot integration
 * Created by Mobin.A
 */
import type { Env, TelegramSettings } from '../types';
import { asString } from '../utils/validate';
import { loadTelegram, saveTelegram } from './kv';

const API = 'https://api.telegram.org';
const BOT_TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,64}$/;

export interface TelegramResult {
  ok: boolean;
  message: string;
}

/** Validate + persist bot token & user id (verifies the token via getMe). */
export async function setupTelegram(
  env: Env,
  botToken: string,
  userId: string,
): Promise<TelegramResult> {
  const token = asString(botToken, 128);
  const uid = asString(userId, 32).replace(/[^0-9]/g, '');
  if (!BOT_TOKEN_RE.test(token)) return { ok: false, message: 'Invalid bot token format.' };
  if (!uid) return { ok: false, message: 'Invalid Telegram user id.' };

  // Verify the token against the Telegram API before storing it.
  try {
    const res = await fetch(`${API}/bot${token}/getMe`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return { ok: false, message: `Telegram API rejected the token: ${data.description || 'unknown error'}` };
    }
  } catch {
    return { ok: false, message: 'Could not reach the Telegram API. Check your network and try again.' };
  }

  const settings: TelegramSettings = { enabled: true, botToken: token, userId: uid };
  await saveTelegram(env.MOBIN_KV, settings);
  return { ok: true, message: 'Telegram bot configured successfully.' };
}

/** Remove the stored bot. */
export async function removeTelegram(env: Env): Promise<TelegramResult> {
  await saveTelegram(env.MOBIN_KV, { enabled: false, botToken: '', userId: '' });
  return { ok: true, message: 'Telegram bot removed.' };
}

/** Send a test message to the configured user. */
export async function testTelegram(env: Env, text?: string): Promise<TelegramResult> {
  const t = await loadTelegram(env.MOBIN_KV);
  if (!t.enabled || !t.botToken || !t.userId) {
    return { ok: false, message: 'Telegram bot is not configured yet.' };
  }
  const body = JSON.stringify({
    chat_id: t.userId,
    text:
      text ??
      '✅ Mobin Panel test message\n\nYour Telegram integration is working.',
    disable_web_page_preview: true,
  });
  try {
    const res = await fetch(`${API}/bot${t.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok
      ? { ok: true, message: 'Test message sent.' }
      : { ok: false, message: `Telegram API error: ${data.description || 'unknown'}` };
  } catch {
    return { ok: false, message: 'Could not reach the Telegram API.' };
  }
}

/** Send a notification (used for panel events). Never throws. */
export async function notify(env: Env, text: string): Promise<boolean> {
  const t = await loadTelegram(env.MOBIN_KV);
  if (!t.enabled || !t.botToken || !t.userId) return false;
  try {
    const res = await fetch(`${API}/bot${t.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: t.userId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok: boolean };
    return !!data.ok;
  } catch {
    return false;
  }
}
