import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../src/theme';
import { useDeviceStore } from '../../src/state/useDeviceStore';
import type { Device } from '../../src/state/useDeviceStore';
import { DeviceCard } from '../../src/components/DeviceCard';
import { DeviceDetailsModal } from '../../src/components/DeviceDetailsModal';
import { startBLEScan, stopBLEScan } from '../../src/lib/ble';

const SIGHTING_THROTTLE_MS = 500;
const SCAN_AUTO_STOP_MS = 60000; // 60s — longer than PRD's 30s for dev/testing

export default function RadarScreen() {
  const theme = useTheme();
  const [isScanning, setIsScanning] = useState(false);
  const [detailsDeviceId, setDetailsDeviceId] = useState<string | null>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSightingByIdRef = useRef<Map<string, number>>(new Map());
  // Synchronous flag that mirrors `isScanning`. Used inside the BLE callback
  // so late/queued sightings after stopBLEScan() become no-ops immediately,
  // without waiting for the React state update + re-render cycle.
  const isScanningRef = useRef(false);

  const devicesById = useDeviceStore((state) => state.devices);
  const devices = Object.values(devicesById);
  const upsertSighting = useDeviceStore((state) => state.upsertSighting);
  const clearAllDevices = useDeviceStore((state) => state.clearAllDevices);
  const detailsDevice: Device | null = detailsDeviceId
    ? devicesById[detailsDeviceId] ?? null
    : null;

  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
      }
      stopBLEScan();
    };
  }, []);

  const handleStopScan = useCallback(() => {
    // Flip the ref FIRST so any in-flight or queued BLE callbacks become
    // no-ops immediately, then clear the auto-stop timer, then ask BLE PLX
    // to stop, then update React state. Wrapped in try/catch so a native
    // hiccup doesn't leave the UI stuck on "Stop Scan".
    isScanningRef.current = false;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    try {
      stopBLEScan();
    } catch (error) {
      console.warn('stopBLEScan threw:', error);
    }
    setIsScanning(false);
  }, []);

  const handleStartScan = useCallback(async () => {
    setIsScanning(true);
    isScanningRef.current = true;
    lastSightingByIdRef.current.clear();

    autoStopTimerRef.current = setTimeout(() => {
      handleStopScan();
    }, SCAN_AUTO_STOP_MS);

    try {
      await startBLEScan((device) => {
        if (!isScanningRef.current) return;

        const now = Date.now();
        const last = lastSightingByIdRef.current.get(device.stableId) || 0;
        if (now - last < SIGHTING_THROTTLE_MS) return;
        lastSightingByIdRef.current.set(device.stableId, now);

        upsertSighting({
          stableId: device.stableId,
          localName: device.localName,
          manufacturerData: device.manufacturerData,
          serviceUUIDs: device.serviceUUIDs,
          rssi: device.rssi,
          brand: device.brand,
        });
      });
    } catch (error) {
      Alert.alert(
        'Cannot start scan',
        error instanceof Error ? error.message : 'Unknown error'
      );
      handleStopScan();
    }
  }, [handleStopScan, upsertSighting]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Nearby Devices</Text>
        <View style={styles.headerActions}>
          {!isScanning && devices.length > 0 && (
            <TouchableOpacity
              style={[styles.clearButton, { borderColor: theme.colors.border }]}
              onPress={() => {
                Alert.alert(
                  'Clear all devices?',
                  'Removes every device from the list. They will reappear if rescanned.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: clearAllDevices },
                  ]
                );
              }}
            >
              <Text style={[styles.clearButtonText, { color: theme.colors.textSecondary }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.scanButton,
              {
                backgroundColor: isScanning ? theme.colors.error : theme.colors.primary,
              },
            ]}
            onPress={isScanning ? handleStopScan : handleStartScan}
          >
            {isScanning && (
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.scanButtonText}>
              {isScanning ? 'Stop Scan' : devices.length > 0 ? 'Rescan' : 'Start Scan'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.list}>
        {devices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {isScanning
                ? 'Scanning for devices...'
                : 'Tap "Start Scan" to discover Bluetooth devices'}
            </Text>
          </View>
        ) : (
          devices.map((device) => (
            <DeviceCard
              key={device.stableId}
              device={device}
              onPress={() => setDetailsDeviceId(device.stableId)}
            />
          ))
        )}
      </ScrollView>

      <DeviceDetailsModal device={detailsDevice} onClose={() => setDetailsDeviceId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearButtonText: {
    fontWeight: '500',
    fontSize: 14,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
