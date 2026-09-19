/**
 * Mobin Panel — WireGuard keypair generation
 * Created by Mobin.A
 *
 * WireGuard keys are X25519 curve keys encoded as unpadded base64. We use
 * @noble/curves (pure JS, audited) so the Worker stays dependency-light and
 * works in the Workers runtime without native modules.
 */
import { x25519 } from '@noble/curves/ed25519.js';

/** Encode 32 raw key bytes as WireGuard (unpadded) base64. */
function wgEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '');
}

export interface WireGuardKeypair {
  /** 32-byte private key, WireGuard base64 encoding. */
  privateKey: string;
  /** Public key derived from the private key. */
  publicKey: string;
}

/**
 * Generate a fresh WireGuard keypair.
 * The private key is a random 32-byte scalar; the public key is
 * x25519(basepoint, priv).
 */
export function generateWireGuardKeypair(): WireGuardKeypair {
  const priv = crypto.getRandomValues(new Uint8Array(32));
  const pub = x25519.getPublicKey(priv);
  return {
    privateKey: wgEncode(priv),
    publicKey: wgEncode(pub),
  };
}
