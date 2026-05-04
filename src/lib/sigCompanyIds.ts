/**
 * Bluetooth SIG Company Identifier lookup.
 *
 * The previous CSV-derived mapping was removed because Josh flagged it as
 * unreliable. The function below is kept so callers compile, but it returns
 * null for every input until we wire in a verified source (e.g., the live
 * Bluetooth SIG Assigned Numbers JSON).
 *
 * Categorization paths that DON'T depend on this map still work:
 *  - Apple Continuity decoder (matches manufacturerData starting with 4c00...)
 *  - SIG-allocated 16-bit service UUID dictionary
 *  - Vendor-allocated 16-bit short UUID dictionary
 */

const COMPANY_IDS: Record<string, string> = {};

/**
 * Looks up brand name from manufacturer data hex string.
 * @param companyIdHex - First 4 hex chars of manufacturer data (2 bytes, little-endian)
 * @returns Brand name or null if not found
 */
export function lookupBrand(companyIdHex: string): string | null {
  if (!companyIdHex || companyIdHex.length < 4) return null;
  const normalized = companyIdHex.toLowerCase().slice(0, 4);
  return COMPANY_IDS[normalized] || null;
}
