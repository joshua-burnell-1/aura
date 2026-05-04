import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import type { Device } from '../state/useDeviceStore';

interface DeviceCardProps {
  device: Device;
  onPress: () => void;
}

function DeviceCardImpl({ device, onPress }: DeviceCardProps) {
  const theme = useTheme();

  // Display name fallback chain (most-specific first):
  //   Gemini make+model > advertised localName > Apple Continuity hint
  //   > local SIG service category > Gemini's inferredCategory
  //   > "<brand> device" > short stable-id stub
  const displayName =
    (device.make && device.model && `${device.make} ${device.model}`) ||
    device.localName ||
    device.inferredHint ||
    device.inferredCategory ||
    device.category ||
    (device.brand ? `${device.brand} device` : null) ||
    `Unknown device · ${device.stableId.slice(0, 6)}`;

  // Subtitle: pick the most-informative label that isn't already in displayName
  // and isn't just the brand (the brand has its own chip below).
  const subtitleCandidates = [device.category, device.inferredHint, device.inferredCategory].filter(
    (s): s is string => !!s && s !== displayName && s !== device.brand
  );
  const subtitle = subtitleCandidates[0] ?? null;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{displayName}</Text>
        {device.brand && device.brand !== displayName && (
          <Text style={[styles.brand, { color: theme.colors.textSecondary }]}>
            {device.brand}
          </Text>
        )}
        {subtitle && (
          <Text style={[styles.category, { color: theme.colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
        <Text style={[styles.rssi, { color: theme.colors.textSecondary }]}>
          RSSI: {device.lastRssi ?? 'N/A'} dBm
        </Text>
      </View>
      <Text style={[styles.chevron, { color: theme.colors.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );
}

// Memoize so cards don't re-render when sibling devices update.
export const DeviceCard = memo(DeviceCardImpl);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  brand: {
    fontSize: 14,
    marginBottom: 2,
  },
  category: {
    fontSize: 14,
    marginBottom: 2,
  },
  rssi: {
    fontSize: 12,
    marginTop: 4,
  },
  chevron: {
    fontSize: 24,
    marginLeft: 8,
    fontWeight: '300',
  },
});
