/**
 * Stable device ID generation
 */

import * as Crypto from 'expo-crypto';

/**
 * Derives a stable device ID from BLE metadata
 * Survives iOS UUID rotation by hashing content-based attributes
 */
export async function deriveStableId(
  manufacturerDataHex: string | null,
  localName: string | null,
  serviceUUIDs: string[]
): Promise<string> {
  // Build composite key from stable attributes
  const manufacturerPrefix = manufacturerDataHex?.slice(0, 8) || '';
  const name = localName || '';
  const services = [...serviceUUIDs].sort().join(',');

  const composite = `${manufacturerPrefix}|${name}|${services}`;

  // Hash to create stable ID
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    composite
  );
  return hash.slice(0, 16);
}
