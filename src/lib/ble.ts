/**
 * Bluetooth Low Energy scanning utilities
 */

import { BleManager, Device as BLEDevice, State } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { deriveStableId } from './identity';
import { lookupBrand } from './sigCompanyIds';

export type ScannedDevice = {
  stableId: string;
  localName: string | null;
  manufacturerData: string | null;
  serviceUUIDs: string[];
  rssi: number;
  brand: string | null;
};

const bleManager = new BleManager();
let scanSubscription: any = null;

/**
 * Request Bluetooth permissions (Android only)
 */
async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    return Object.values(granted).every((status) => status === 'granted');
  } catch (error) {
    console.error('Failed to request Android permissions:', error);
    return false;
  }
}

/**
 * Check if Bluetooth is powered on
 */
async function ensureBluetoothEnabled(): Promise<boolean> {
  const state = await bleManager.state();
  return state === State.PoweredOn;
}

/**
 * Convert manufacturer data from base64 to hex string
 */
function manufacturerDataToHex(base64: string | null): string | null {
  if (!base64) return null;

  try {
    const binary = atob(base64);
    let hex = '';
    for (let i = 0; i < binary.length; i++) {
      const byte = binary.charCodeAt(i).toString(16).padStart(2, '0');
      hex += byte;
    }
    return hex;
  } catch (error) {
    console.error('Failed to convert manufacturer data:', error);
    return null;
  }
}

/**
 * Start BLE scanning
 * Calls onDeviceFound for each discovered device
 */
export async function startBLEScan(
  onDeviceFound: (device: ScannedDevice) => void
): Promise<void> {
  // Request permissions
  const hasPermissions = await requestAndroidPermissions();
  if (!hasPermissions) {
    throw new Error('Bluetooth permissions not granted');
  }

  // Check Bluetooth is enabled
  const isEnabled = await ensureBluetoothEnabled();
  if (!isEnabled) {
    throw new Error('Bluetooth is not enabled');
  }

  // Stop any existing scan
  await stopBLEScan();

  // Start scanning
  scanSubscription = bleManager.startDeviceScan(
    null, // scan for all devices
    { allowDuplicates: true }, // allow updates
    async (error, device) => {
      if (error) {
        console.error('BLE scan error:', error);
        return;
      }

      if (!device) return;

      // Extract manufacturer data
      const manufacturerDataHex = device.manufacturerData
        ? manufacturerDataToHex(device.manufacturerData)
        : null;

      // Extract service UUIDs
      const serviceUUIDs = device.serviceUUIDs || [];

      // Derive stable ID
      const stableId = await deriveStableId(
        manufacturerDataHex,
        device.localName,
        serviceUUIDs
      );

      // Lookup brand from manufacturer data
      const brand = manufacturerDataHex
        ? lookupBrand(manufacturerDataHex.slice(0, 4))
        : null;

      onDeviceFound({
        stableId,
        // localName from advertising data is preferred; fall back to GAP `name`.
        // Both can be null for devices that don't broadcast a friendly name.
        localName: device.localName ?? device.name ?? null,
        manufacturerData: manufacturerDataHex,
        serviceUUIDs,
        rssi: device.rssi || -100,
        brand,
      });
    }
  );
}

/**
 * Stop BLE scanning
 */
export async function stopBLEScan(): Promise<void> {
  // BLE PLX's startDeviceScan returns void in some versions and a non-
  // Subscription truthy value in others; only call .remove() when it's
  // actually a function. bleManager.stopDeviceScan() is the canonical
  // way to stop the scan regardless.
  if (scanSubscription && typeof scanSubscription.remove === 'function') {
    try {
      scanSubscription.remove();
    } catch (e) {
      console.warn('scanSubscription.remove threw:', e);
    }
  }
  scanSubscription = null;
  await bleManager.stopDeviceScan();
}
