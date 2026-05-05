import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useTheme } from '../../src/theme';
import { useDeviceStore } from '../../src/state/useDeviceStore';
import type { Device } from '../../src/state/useDeviceStore';
import { DeviceCard } from '../../src/components/DeviceCard';
import { DeviceDetailsModal } from '../../src/components/DeviceDetailsModal';
import { startBLEScan, stopBLEScan } from '../../src/lib/ble';
import { identifyDevice } from '../../src/lib/proxyClient';
import { sanitizeDeviceForCloud } from '../../src/lib/privacy';

const SIGHTING_THROTTLE_MS = 500;
const SCAN_AUTO_STOP_MS = 60000; // 60s — longer than PRD's 30s for dev/testing
const MAX_SCAN_DEVICES = 100;

type Phase = 'idle' | 'scanning' | 'identifying' | 'done';

/**
 * Group a flat device list by best-available category. Falls back through
 * Anthropic-supplied category > local SIG inference > "Unidentified".
 * "Unidentified" group is sorted last; everything else is alphabetical.
 */
function groupDevicesByCategory(
  devices: Device[]
): { category: string; devices: Device[] }[] {
  const groups = new Map<string, Device[]>();
  for (const d of devices) {
    const category =
      d.category || d.inferredCategory || d.inferredHint || 'Unidentified';
    const arr = groups.get(category) ?? [];
    arr.push(d);
    groups.set(category, arr);
  }
  return Array.from(groups.entries())
    .map(([category, devices]) => ({ category, devices }))
    .sort((a, b) => {
      if (a.category === 'Unidentified') return 1;
      if (b.category === 'Unidentified') return -1;
      return a.category.localeCompare(b.category);
    });
}

export default function RadarScreen() {
  const theme = useTheme();
  const [isScanning, setIsScanning] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [detailsDeviceId, setDetailsDeviceId] = useState<string | null>(null);
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSightingByIdRef = useRef<Map<string, number>>(new Map());
  // Synchronous flag that mirrors `isScanning`. Used inside the BLE callback
  // so late/queued sightings after stopBLEScan() become no-ops immediately,
  // without waiting for the React state update + re-render cycle.
  const isScanningRef = useRef(false);

  const devicesById = useDeviceStore((state) => state.devices);
  const devices = Object.values(devicesById);
  const upsertSighting = useDeviceStore((state) => state.upsertSighting);
  const updateDevice = useDeviceStore((state) => state.updateDevice);
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
    // Transition into the identification phase. If we're already past
    // scanning (idle / done), don't go backwards.
    setPhase((p) => (p === 'scanning' ? 'identifying' : p));
  }, []);

  const handleStartScan = useCallback(async () => {
    setIsScanning(true);
    isScanningRef.current = true;
    setPhase('scanning');
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

        // Cap: once we've collected MAX_SCAN_DEVICES distinct devices, ignore
        // further new ones AND auto-stop the scan to transition to phase 2.
        // RSSI updates on already-discovered devices still flow through.
        const state = useDeviceStore.getState().devices;
        const isNew = !state[device.stableId];
        if (isNew && Object.keys(state).length >= MAX_SCAN_DEVICES) {
          handleStopScan();
          return;
        }

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

  // Per-device cooldown so a transient failure (rate limit, network blip) doesn't
  // get retried in a tight loop on every BLE sighting. Stored in a ref so it
  // doesn't trigger renders.
  const cooldownUntilRef = useRef<Map<string, number>>(new Map());
  const COOLDOWN_MS = 30_000;

  const handleIdentify = useCallback(
    async (stableId: string, opts: { silent?: boolean } = {}) => {
      const device = useDeviceStore.getState().devices[stableId];
      if (!device) return;

      setIdentifyingId(stableId);

      try {
        const sanitized = sanitizeDeviceForCloud(device);
        const result = await identifyDevice({
          scrubbedName: sanitized.scrubbedName,
          brand: sanitized.brand,
          manufacturerPrefix: sanitized.manufacturerPrefix,
          serviceUUIDs: sanitized.serviceUUIDs,
        });

        // Successful response (even if Anthropic returned an empty match) —
        // mark attempted so we don't auto-retry. User can manually retry from
        // the details modal.
        updateDevice(stableId, {
          make: result.make,
          model: result.model,
          category: result.inferredCategory,
          identificationConfidence: result.confidence,
          identifyAttempted: true,
        });
        cooldownUntilRef.current.delete(stableId);

        if (!opts.silent && !result.make && !result.model) {
          Alert.alert(
            'Could not identify',
            `Anthropic returned no match (confidence ${result.confidence.toFixed(2)}). The device's broadcast metadata may be too sparse.`
          );
        }
      } catch (error) {
        // Transient — don't mark identifyAttempted; auto-retry after cooldown.
        cooldownUntilRef.current.set(stableId, Date.now() + COOLDOWN_MS);
        if (!opts.silent) {
          Alert.alert(
            'Identify failed',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        console.error('Failed to identify device:', error);
      } finally {
        setIdentifyingId(null);
      }
    },
    [updateDevice]
  );

  // Auto-identify runs during the 'identifying' phase. Implemented as an
  // async while-loop instead of an effect-per-iteration because the
  // effect-driven approach was racing with React's state-update batching —
  // sometimes the effect didn't re-fire after `updateDevice`, leaving the
  // queue stuck on the first device. The loop reads from the Zustand store
  // imperatively each iteration and is cancellable via the cleanup flag.
  useEffect(() => {
    if (phase !== 'identifying') return;

    let cancelled = false;

    (async () => {
      while (!cancelled) {
        const state = useDeviceStore.getState().devices;
        const now = Date.now();

        const candidate = Object.values(state).find((d) => {
          if (d.identifyAttempted) return false;
          const cooldownUntil = cooldownUntilRef.current.get(d.stableId) ?? 0;
          if (now < cooldownUntil) return false;
          return true;
        });

        if (!candidate) {
          const remaining = Object.values(state).filter(
            (d) => !d.identifyAttempted
          ).length;
          if (remaining === 0) {
            setPhase('done');
            return;
          }
          // Some devices are still pending but in cooldown — wait, then re-check.
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        await handleIdentify(candidate.stableId, { silent: true });
        // Tiny gap between calls — gives React a tick to flush state updates
        // and avoids hammering the worker / Anthropic in case the loop is
        // resolving very fast (e.g. all cached).
        await new Promise((r) => setTimeout(r, 100));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, handleIdentify]);

  const handleExport = useCallback(async () => {
    const dump = devices.map((d) => ({
      label:
        (d.make && d.model && `${d.make} ${d.model}`) ||
        d.localName ||
        d.inferredHint ||
        d.inferredCategory ||
        (d.brand ? `${d.brand} device` : null) ||
        `Unknown · ${d.stableId.slice(0, 6)}`,
      stableId: d.stableId,
      brand: d.brand,
      localName: d.localName,
      manufacturerData: d.manufacturerData,
      serviceUUIDs: d.serviceUUIDs,
      inferredCategory: d.inferredCategory,
      inferredHint: d.inferredHint,
      make: d.make,
      model: d.model,
      category: d.category,
      identificationConfidence: d.identificationConfidence,
      lastRssi: d.lastRssi,
      lastSeen: d.lastSeen,
    }));
    const json = JSON.stringify(dump, null, 2);
    try {
      await Share.share({
        message: json,
        title: `Aura device export (${dump.length} devices)`,
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [devices]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Nearby Devices</Text>
        <View style={styles.headerActions}>
          {!isScanning && devices.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.clearButton, { borderColor: theme.colors.border }]}
                onPress={handleExport}
              >
                <Text style={[styles.clearButtonText, { color: theme.colors.primary }]}>
                  Export
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.clearButton, { borderColor: theme.colors.border }]}
                onPress={() => {
                  Alert.alert(
                    'Clear all devices?',
                    'Removes every device from the list. They will reappear if rescanned.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: () => {
                          clearAllDevices();
                          cooldownUntilRef.current.clear();
                          setPhase('idle');
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.clearButtonText, { color: theme.colors.textSecondary }]}>
                  Clear
                </Text>
              </TouchableOpacity>
            </>
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

      {phase !== 'idle' && devices.length > 0 && (() => {
        let pct = 0;
        let label = '';
        if (phase === 'scanning') {
          pct = Math.min(100, Math.round((devices.length / MAX_SCAN_DEVICES) * 100));
          label = `Phase 1 · Scanning  ${devices.length} / ${MAX_SCAN_DEVICES} devices`;
        } else {
          const identified = devices.filter((d) => d.identifyAttempted).length;
          pct = devices.length === 0 ? 0 : Math.round((identified / devices.length) * 100);
          label =
            phase === 'done'
              ? `${identified} / ${devices.length} identified`
              : `Phase 2 · Identifying  ${identified} / ${devices.length}`;
        }
        return (
          <View style={[styles.progressContainer, { borderBottomColor: theme.colors.border }]}>
            <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${pct}%`, backgroundColor: theme.colors.primary },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>
              {label}
            </Text>
          </View>
        );
      })()}

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
          groupDevicesByCategory(devices).map(({ category, devices: groupDevices }) => (
            <View key={category} style={styles.group}>
              <Text style={[styles.groupHeader, { color: theme.colors.textSecondary }]}>
                {category.toUpperCase()} · {groupDevices.length}
              </Text>
              {groupDevices.map((device) => (
                <DeviceCard
                  key={device.stableId}
                  device={device}
                  onPress={() => setDetailsDeviceId(device.stableId)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <DeviceDetailsModal
        device={detailsDevice}
        isIdentifying={!!detailsDeviceId && identifyingId === detailsDeviceId}
        onClose={() => setDetailsDeviceId(null)}
        onIdentify={
          detailsDeviceId
            ? () => handleIdentify(detailsDeviceId)
            : undefined
        }
      />
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
  group: {
    marginBottom: 16,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
});
