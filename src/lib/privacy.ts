/**
 * Privacy utilities for scrubbing PII before cloud transmission
 */

// Common given names to filter out
const COMMON_NAMES = new Set([
  'josh', 'joshua', 'john', 'jane', 'mike', 'michael', 'sarah', 'emily',
  'david', 'daniel', 'chris', 'christopher', 'matt', 'matthew', 'alex',
  'alexander', 'alexandra', 'james', 'robert', 'mary', 'jennifer', 'linda',
  'patricia', 'elizabeth', 'barbara', 'susan', 'jessica', 'karen', 'nancy',
  'lisa', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'donna',
  'emily', 'carol', 'michelle', 'amanda', 'melissa', 'deborah', 'stephanie',
  'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'angela',
  'shirley', 'anna', 'brenda', 'pamela', 'nicole', 'samantha', 'katherine',
  'christine', 'debra', 'rachel', 'catherine', 'carolyn', 'janet', 'ruth',
  'maria', 'heather', 'diane', 'virginia', 'julie', 'joyce', 'victoria',
]);

/**
 * Scrubs local names to remove possessive patterns and personal names
 * "Josh's AirPods" → "AirPods"
 * "My Speaker" → "Speaker"
 */
export function scrubLocalName(localName: string | null): string | null {
  if (!localName) return null;

  let scrubbed = localName;

  // Remove possessive patterns: "Name's Device" → "Device"
  scrubbed = scrubbed.replace(/^[\w\s]+['']s\s+/i, '');

  // Remove "My" prefix: "My Device" → "Device"
  scrubbed = scrubbed.replace(/^my\s+/i, '');

  // If what remains is just a common name, return null (too ambiguous)
  const lowerScrubbed = scrubbed.toLowerCase().trim();
  if (COMMON_NAMES.has(lowerScrubbed)) {
    return null;
  }

  // If scrubbed to empty or whitespace, return null
  if (!scrubbed.trim()) {
    return null;
  }

  return scrubbed.trim();
}

/**
 * Sanitizes device data for cloud transmission
 * Limits manufacturer data to first 8 chars (company ID + basic prefix)
 */
export function sanitizeDeviceForCloud(device: {
  localName: string | null;
  brand: string | null;
  manufacturerData: string | null;
  serviceUUIDs: string[];
}) {
  return {
    scrubbedName: scrubLocalName(device.localName),
    brand: device.brand,
    manufacturerPrefix: device.manufacturerData?.slice(0, 8) || null,
    serviceUUIDs: device.serviceUUIDs,
  };
}
