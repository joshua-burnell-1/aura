import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import type { Zone } from '../state/useZoneStore';

interface ZoneCardProps {
  zone: Zone;
  deviceCount: number;
  onCalibrate: () => void;
  onDelete: () => void;
  isCalibrating: boolean;
  calibrationCountdown: number;
}

export function ZoneCard({
  zone,
  deviceCount,
  onCalibrate,
  onDelete,
  isCalibrating,
  calibrationCountdown,
}: ZoneCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{zone.name}</Text>
        <Text style={[styles.deviceCount, { color: theme.colors.textSecondary }]}>
          {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
        </Text>
        {zone.rssiThreshold && (
          <Text style={[styles.threshold, { color: theme.colors.textSecondary }]}>
            Threshold: {zone.rssiThreshold.toFixed(0)} dBm
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: isCalibrating ? theme.colors.error : theme.colors.primary },
          ]}
          onPress={onCalibrate}
          disabled={isCalibrating}
        >
          <Text style={styles.buttonText}>
            {isCalibrating ? `${calibrationCountdown}s` : 'Calibrate'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: theme.colors.error }]}
          onPress={onDelete}
          disabled={isCalibrating}
        >
          <Text style={[styles.deleteButtonText, { color: theme.colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  info: {
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceCount: {
    fontSize: 14,
    marginBottom: 2,
  },
  threshold: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
