/**
 * Zone assignment logic based on RSSI sampling
 */

export type RSSISample = {
  rssi: number;
  timestamp: number;
};

/**
 * Filters RSSI samples to only those within a time window
 * @param samples - Array of RSSI samples
 * @param windowMs - Time window in milliseconds (default 15 seconds)
 */
export function filterSamplesByTimeWindow(
  samples: RSSISample[],
  windowMs: number = 15000
): RSSISample[] {
  const now = Date.now();
  return samples.filter((sample) => now - sample.timestamp <= windowMs);
}

/**
 * Calculates median RSSI from samples
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return -100;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

/**
 * Assigns a zone to a device based on RSSI samples
 * Uses median RSSI above a threshold
 */
export function assignZoneFromSamples(
  samples: RSSISample[],
  thresholdRssi: number = -65
): { medianRssi: number; shouldAssign: boolean } | null {
  // Filter to recent samples (15-second window)
  const recentSamples = filterSamplesByTimeWindow(samples);

  if (recentSamples.length === 0) {
    return null;
  }

  // Calculate median RSSI
  const rssiValues = recentSamples.map((s) => s.rssi);
  const medianRssi = calculateMedian(rssiValues);

  // Assign if median is above threshold
  const shouldAssign = medianRssi >= thresholdRssi;

  return {
    medianRssi,
    shouldAssign,
  };
}
