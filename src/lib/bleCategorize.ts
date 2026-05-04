/**
 * Local BLE metadata categorization.
 *
 * Decodes Apple Continuity manufacturer-data packets, well-known SIG
 * service UUIDs, and 16-bit member-allocated UUIDs to give a best-guess
 * category for a device before (or instead of) calling Gemini. The output
 * is privacy-safe: no raw bytes leave the device, only the human-readable
 * category and an optional hint string.
 */

// Apple Continuity packet subtypes (manufacturer data after company id 004c)
// Reference: https://github.com/furiousMAC/continuity
// Names kept short — surfaced as the primary device label in the UI.
const APPLE_CONTINUITY: Record<string, string> = {
  '01': 'iCloud Continuity',
  '02': 'iBeacon',
  '03': 'AirPrint',
  '05': 'AirDrop',
  '06': 'HomeKit Accessory',
  '07': 'AirPods',
  '08': 'Hey Siri',
  '09': 'AirPlay Target',
  '0a': 'AirPlay Source',
  '0b': 'Magic Switch',
  '0c': 'Handoff',
  '0d': 'Wi-Fi Settings',
  '0e': 'Instant Hotspot',
  '0f': 'Nearby Action',
  '10': 'iPhone / iPad / Mac',
  '11': 'Tethering Source',
  '12': 'Find My Beacon',
  '13': 'TV Audio Sharing',
  '14': 'Maps Sharing',
  '15': 'Maps Routing',
  '16': 'AirTag',
};

// SIG-defined 16-bit service UUIDs (always lowercase, no dashes)
const SERVICE_CATEGORIES: Record<string, { category: string; hint?: string }> = {
  '1800': { category: 'Generic Access' },
  '1801': { category: 'Generic Attribute' },
  '180a': { category: 'Device Info' },
  '180d': { category: 'Heart Rate Monitor' },
  '180f': { category: 'Battery Service' },
  '1810': { category: 'Blood Pressure Monitor' },
  '1811': { category: 'Alert Notification' },
  '1812': { category: 'Input Device', hint: 'Keyboard, mouse, or game controller' },
  '1813': { category: 'Scan Parameters' },
  '1814': { category: 'Running Speed and Cadence' },
  '1815': { category: 'Automation IO' },
  '1816': { category: 'Cycling Speed and Cadence' },
  '1818': { category: 'Cycling Power' },
  '1819': { category: 'Location and Navigation' },
  '181a': { category: 'Environmental Sensor', hint: 'Thermostat, humidity, or air-quality sensor' },
  '181b': { category: 'Body Composition' },
  '181c': { category: 'User Data' },
  '181d': { category: 'Weight Scale' },
  '181e': { category: 'Bond Management' },
  '181f': { category: 'Continuous Glucose Monitor' },
  '1820': { category: 'Internet Protocol Support' },
  '1821': { category: 'Indoor Positioning Beacon' },
  '1822': { category: 'Pulse Oximeter' },
  '1823': { category: 'HTTP Proxy' },
  '1824': { category: 'Transport Discovery' },
  '1825': { category: 'Object Transfer' },
  '1826': { category: 'Fitness Machine', hint: 'Treadmill / elliptical / bike' },
  '1827': { category: 'Mesh Provisioning' },
  '1828': { category: 'Mesh Proxy' },
  '1829': { category: 'Reconnection Configuration' },
  '183a': { category: 'Insulin Delivery' },
  '183b': { category: 'Binary Sensor' },
  '183c': { category: 'Emergency Configuration' },
  '183d': { category: 'Authorization Control' },
  '183e': { category: 'Physical Activity Monitor' },
  '183f': { category: 'Elapsed Time' },
  '1840': { category: 'Generic Health Sensor' },
  '1843': { category: 'Audio Input Control' },
  '1844': { category: 'Volume Control' },
  '1845': { category: 'Volume Offset Control' },
  '1846': { category: 'Coordinated Set Identification' },
  '1847': { category: 'Device Time' },
  '1848': { category: 'Media Control' },
  '1849': { category: 'Generic Media Control' },
  '184a': { category: 'Constant Tone Extension' },
  '184b': { category: 'Telephone Bearer' },
  '184c': { category: 'Generic Telephone Bearer' },
  '184d': { category: 'Microphone Control' },
  '184e': { category: 'Audio Stream Control' },
  '184f': { category: 'Broadcast Audio Scan' },
  '1850': { category: 'Published Audio Capabilities' },
  '1851': { category: 'Basic Audio Announcement' },
  '1852': { category: 'Broadcast Audio Announcement' },
  '1853': { category: 'LE Audio (Common)' },
  '1854': { category: 'Hearing Aid (Hearing Access Service)' },
  '1855': { category: 'LE Audio (Telephony / Media)' },
  '1856': { category: 'Public Broadcast' },
  '1857': { category: 'Electronic Shelf Label' },
  '1858': { category: 'Gaming Audio' },
};

// SIG member-allocated UUIDs (16-bit, lowercase). Heuristic — vendor mappings change.
const NAMED_SHORT_UUIDS: Record<string, { category: string; hint?: string }> = {
  // Apple
  'fd6f': { category: 'Apple', hint: 'Continuity / Find My' },
  'fd5a': { category: 'Apple Health' },
  'fdcd': { category: 'Apple TV' },
  'fdfa': { category: 'Apple Continuity' },
  'fd6e': { category: 'Apple Continuity' },
  'fe25': { category: 'Apple', hint: 'Continuity Notification' },
  'fd25': { category: 'Apple', hint: 'AirDrop / HomePod' },
  // Google
  'fe9f': { category: 'Google Fast Pair' },
  'fe2c': { category: 'Google Account Login' },
  'fe26': { category: 'Google' },
  'fe55': { category: 'Google Chromecast' },
  'fe19': { category: 'Google Cast' },
  'fea0': { category: 'Google Nearby' },
  // Audio brands
  'fdef': { category: 'Bose Audio' },
  'fd0f': { category: 'Bose' },
  'fd82': { category: 'Sony', hint: 'Headphones / soundbar' },
  'fd5d': { category: 'Sony' },
  'fda5': { category: 'Logitech Peripheral' },
  'fd34': { category: 'Sonos' },
  'fe07': { category: 'Sonos Speaker' },
  'fdda': { category: 'Beats Audio' },
  'feff': { category: 'GoPro' },
  // Trackers
  'fd5b': { category: 'Tile Tracker' },
  'fd44': { category: 'Tile Tracker' },
  'fd49': { category: 'Chipolo Tracker' },
  // Wearables / fitness
  'fee0': { category: 'Xiaomi / Mi Band' },
  'fee1': { category: 'Xiaomi / Mi Band' },
  'fda3': { category: 'Garmin Wearable' },
  'fefd': { category: 'Garmin' },
  'fe2f': { category: 'Garmin' },
  'fd3f': { category: 'Polar' },
  'fdcb': { category: 'Fitbit' },
  'fe1f': { category: 'Garmin Connect' },
  // Smart-home / appliances
  'fe73': { category: 'Smart Lock', hint: 'Stryker / medical / lock' },
  'fef8': { category: 'Samsung TV' },
  'fef3': { category: 'Samsung' },
  'fe85': { category: 'Roku' },
  'fdfd': { category: 'Smart Plug / Bulb' },
  'fda6': { category: 'Smart Lock' },
  // Beacons
  'feaa': { category: 'Eddystone Beacon' },
  'fe9a': { category: 'Estimote Beacon' },
  'feab': { category: 'Nordic Beacon' },
  // Vehicle / industrial
  'fd5e': { category: 'Vehicle / OBD' },
  'fdab': { category: 'Vehicle Telemetry' },
};

// Standard SIG base UUID suffix used to expand 16-bit UUIDs into 128-bit form:
// 0000XXXX-0000-1000-8000-00805F9B34FB
const SIG_BASE_SUFFIX = '00001000800000805f9b34fb';

/**
 * Extract a 16-bit short UUID from a possibly-128-bit BLE UUID string.
 * Returns null for vendor-specific 128-bit UUIDs that don't match the SIG base.
 */
function shortServiceUuid(uuid: string): string | null {
  const lower = uuid.toLowerCase().replace(/-/g, '');
  if (lower.length === 4) return lower;
  if (lower.length === 32 && lower.endsWith(SIG_BASE_SUFFIX)) {
    return lower.substring(4, 8);
  }
  return null;
}

export type InferenceResult = {
  category: string | null;
  hint: string | null;
  confidence: number; // 0..1 (local-only, not the Gemini confidence)
};

/**
 * Best-guess category from BLE advertising metadata, computed entirely on-device.
 * Privacy-safe by design: takes only data the user can already see and returns
 * human-readable strings.
 */
export function inferCategory(metadata: {
  manufacturerData: string | null;
  serviceUUIDs: string[];
  brand: string | null;
}): InferenceResult {
  const { manufacturerData, serviceUUIDs, brand } = metadata;

  // 1. Apple Continuity — most informative when present
  if (manufacturerData) {
    const lower = manufacturerData.toLowerCase();
    // Apple company id 004c is little-endian → first 4 hex chars are "4c00"
    if (lower.startsWith('4c00') && lower.length >= 6) {
      const subtype = lower.substring(4, 6);
      const subtypeName = APPLE_CONTINUITY[subtype];
      if (subtypeName) {
        return { category: 'Apple Device', hint: subtypeName, confidence: 0.75 };
      }
      return { category: 'Apple Device', hint: 'Unknown Continuity packet', confidence: 0.55 };
    }
  }

  // 2. Service UUID scan — pick the most specific match
  for (const uuid of serviceUUIDs) {
    const short = shortServiceUuid(uuid);
    if (!short) continue;
    const sig = SERVICE_CATEGORIES[short];
    if (sig) {
      return { category: sig.category, hint: sig.hint ?? null, confidence: 0.65 };
    }
    const named = NAMED_SHORT_UUIDS[short];
    if (named) {
      return { category: named.category, hint: named.hint ?? null, confidence: 0.7 };
    }
  }

  // 3. Brand-only: don't synthesize a category. The DeviceCard's brand
  //    chip already conveys this; returning "Brand Device" here just
  //    duplicated the label and made the subtitle redundant.
  return { category: null, hint: null, confidence: 0 };
}
