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

  // Brand header — falls through every signal we have. The earlier "Unknown"
  // result was hiding cases where the pill had brand-flavored text (e.g.,
  // "Apple Device" from the local heuristic) but the header didn't pick it up.
  const brand =
    device.make ||
    device.brand ||
    device.inferredHint ||
    device.inferredCategory ||
    device.category ||
    'Unknown';

  // Type pill — same source list, but skipped if it duplicates the header.
  const pillRaw =
    device.category || device.inferredCategory || device.inferredHint || null;
  const category = pillRaw && pillRaw !== brand ? pillRaw : null;

  // Model line — Anthropic's model output. If absent, advertised name as
  // a "best we know" subtitle.
  const modelLine = device.model || null;

  // Meta line — RSSI plus, if we haven't already shown localName as the
  // model line, the raw advertised name.
  const metaParts: string[] = [];
  if (device.localName && device.localName !== modelLine) {
    metaParts.push(device.localName);
  }
  metaParts.push(`${device.lastRssi ?? '—'} dBm`);
  const metaLine = metaParts.join('  ·  ');

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text
            style={[styles.brand, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {brand}
          </Text>
          {category && (
            <View style={[styles.pill, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.pillText} numberOfLines={1}>
                {category}
              </Text>
            </View>
          )}
        </View>

        {modelLine && (
          <Text
            style={[styles.model, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {modelLine}
          </Text>
        )}

        <Text
          style={[styles.meta, { color: theme.colors.textSecondary }]}
          numberOfLines={1}
        >
          {metaLine}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: theme.colors.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );
}

export const DeviceCard = memo(DeviceCardImpl);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brand: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: '60%',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
  model: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },
  meta: {
    fontSize: 12,
    marginTop: 4,
  },
  chevron: {
    fontSize: 22,
    marginLeft: 8,
    fontWeight: '300',
  },
});
