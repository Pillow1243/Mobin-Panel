/**
 * Mobin Panel — WARP account renewal
 * Created by Mobin.A
 *
 * Best-effort renewal of the Cloudflare WARP account that backs the panel's
 * WARP configs. It calls Cloudflare's public WARP license API with the
 * panel's stable device identity (derived from the WireGuard keypair) and
 * reports the outcome. When the API is unreachable or rate-limited the
 * renewal is skipped gracefully — existing WARP configs keep working.
 */
import { sha256Hex } from '../utils/crypto';
import type { StoredWg } from './kv';

const WARP_API = 'https://warpapi.cloudflareclient.com';

export interface RenewalResult {
  ok: boolean;
  message: string;
}

/**
 * Attempt to (re)register the WARP account.
 * The device name is stable per panel instance so repeated renewals refresh
 * the same account instead of creating new ones.
 */
export async function notifyWarpRenewal(
  wg: StoredWg,
  panelName: string,
): Promise<RenewalResult> {
  // Stable device identity derived from the keypair (no KV write needed).
  const deviceUuid = await sha256Hex(wg.privateKey + ':warp-device');
  const name = (panelName || 'Mobin Panel').slice(0, 64);

  // 1) create/refresh the device record
  try {
    const devRes = await fetch(`${WARP_API}/v0/user/device`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_name: name,
        device_fingerprint: deviceUuid,
        client_version: '2.5.0.0',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (devRes.ok) {
      // 2) refresh the license
      const licRes = await fetch(`${WARP_API}/v0/user/license/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_uuid: deviceUuid }),
        signal: AbortSignal.timeout(15_000),
      });
      if (licRes.ok) {
        return { ok: true, message: 'WARP account renewed.' };
      }
      return {
        ok: false,
        message: `license refresh returned ${licRes.status}`,
      };
    }
    return {
      ok: false,
      message: `device registration returned ${devRes.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: `WARP API unreachable (${(e as Error).name || 'network error'})`,
    };
  }
}
