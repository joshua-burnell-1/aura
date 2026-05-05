/**
 * Stable device ID generation.
 *
 * The stableId is intentionally derived from RF identity ONLY — manufacturer
 * data prefix and the sorted service UUID list — so the same physical device
 * collapses into one entry across packets that rotate or strip the local name
 * (e.g., a Samsung TV that advertises "Samsung Frame 65" on one packet and
 * "OLED 65" on the next). Different devices with the same manufacturer
 * subtype byte and identical service UUIDs WILL collide; that's the
 * intentional trade-off — we'd rather over-merge than show duplicates.
 */

import * as Crypto from 'expo-crypto';

export async function deriveStableId(
  manufacturerDataHex: string | null,
  // localName intentionally accepted for signature stability with callers, but
  // unused — names rotate within a single device's broadcast cycle.
  _localName: string | null,
  serviceUUIDs: string[]
): Promise<string> {
  const manufacturerPrefix = manufacturerDataHex?.slice(0, 8) || '';
  const services = [...serviceUUIDs].sort().join(',');

  const composite = `${manufacturerPrefix}|${services}` || 'anonymous';

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    composite
  );
  return hash.slice(0, 16);
}
