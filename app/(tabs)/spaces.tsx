import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../../src/theme';
import { useZoneStore } from '../../src/state/useZoneStore';
import { useDeviceStore } from '../../src/state/useDeviceStore';
import { ZoneCard } from '../../src/components/ZoneCard';
import { DeviceCard } from '../../src/components/DeviceCard';
import { startBLEScan, stopBLEScan } from '../../src/lib/ble';
import { assignZoneFromSamples } from '../../src/lib/zones';

export default function SpacesScreen() {
  const theme = useTheme();
  const [newZoneName, setNewZoneName] = useState('');
  const [calibratingZoneId, setCalibratingZoneId] = useState<string | null>(null);
  const [calibrationCountdown, setCalibrationCountdown] = useState(0);

  const zonesById = useZoneStore((state) => state.zones);
  const zones = Object.values(zonesById);
  const createZone = useZoneStore((state) => state.createZone);
  const updateZone = useZoneStore((state) => state.updateZone);
  const deleteZone = useZoneStore((state) => state.deleteZone);

  const devicesById = useDeviceStore((state) => state.devices);
  const devices = Object.values(devicesById);
  const upsertSighting = useDeviceStore((state) => state.upsertSighting);
  const assignDeviceToZone = useDeviceStore((state) => state.assignDeviceToZone);

  const unassignedDevices = devices.filter((d) => !d.zoneId);

  const handleCreateZone = () => {
    if (!newZoneName.trim()) {
      Alert.alert('Error', 'Please enter a zone name');
      return;
    }
    createZone(newZoneName.trim());
    setNewZoneName('');
  };

  const handleCalibrate = async (zoneId: string) => {
    setCalibratingZoneId(zoneId);
    setCalibrationCountdown(15);

    // Countdown timer
    const interval = setInterval(() => {
      setCalibrationCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Start BLE scan for 15 seconds
    await startBLEScan((device) => {
      upsertSighting({
        stableId: device.stableId,
        localName: device.localName,
        manufacturerData: device.manufacturerData,
        serviceUUIDs: device.serviceUUIDs,
        rssi: device.rssi,
        brand: device.brand,
      });
    });

    // Stop after 15 seconds
    setTimeout(async () => {
      await stopBLEScan();
      setCalibratingZoneId(null);

      // Assign devices based on RSSI threshold
      const currentDevices = useDeviceStore.getState().devices;
      Object.values(currentDevices).forEach((device) => {
        const assignment = assignZoneFromSamples(device.rssiSamples);
        if (assignment) {
          const zone = useZoneStore.getState().zones[zoneId];
          if (zone && assignment.medianRssi >= (zone.rssiThreshold || -65)) {
            assignDeviceToZone(device.stableId, zoneId);
          }
        }
      });

      // Update zone threshold
      const deviceList = Object.values(useDeviceStore.getState().devices).filter(
        (d) => d.zoneId === zoneId
      );
      if (deviceList.length > 0) {
        const avgRssi =
          deviceList.reduce((sum, d) => sum + (d.lastRssi || -100), 0) / deviceList.length;
        updateZone(zoneId, { rssiThreshold: avgRssi });
      }
    }, 15000);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Spaces</Text>
      </View>

      <View style={styles.createZone}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              borderColor: theme.colors.border,
            },
          ]}
          placeholder="New zone name..."
          placeholderTextColor={theme.colors.textSecondary}
          value={newZoneName}
          onChangeText={setNewZoneName}
        />
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleCreateZone}
        >
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {zones.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              Create a zone to organize your devices
            </Text>
          </View>
        ) : (
          zones.map((zone) => (
            <View key={zone.id} style={styles.zoneSection}>
              <ZoneCard
                zone={zone}
                deviceCount={devices.filter((d) => d.zoneId === zone.id).length}
                onCalibrate={() => handleCalibrate(zone.id)}
                onDelete={() => deleteZone(zone.id)}
                isCalibrating={calibratingZoneId === zone.id}
                calibrationCountdown={calibrationCountdown}
              />
              {devices
                .filter((d) => d.zoneId === zone.id)
                .map((device) => (
                  <View key={device.stableId} style={styles.deviceInZone}>
                    <DeviceCard device={device} onPress={() => {}} />
                  </View>
                ))}
            </View>
          ))
        )}

        {unassignedDevices.length > 0 && (
          <View style={styles.unassignedSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Unassigned Devices
            </Text>
            {unassignedDevices.map((device) => (
              <DeviceCard key={device.stableId} device={device} onPress={() => {}} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  createZone: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
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
  zoneSection: {
    marginBottom: 24,
  },
  deviceInZone: {
    marginLeft: 16,
    marginTop: 8,
  },
  unassignedSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
});
