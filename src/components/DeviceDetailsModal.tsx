import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';
import type { Device } from '../state/useDeviceStore';

interface Props {
  device: Device | null;
  isIdentifying?: boolean;
  onClose: () => void;
  onIdentify?: () => void;
}

function fmtTimestamp(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString();
}

function rssiStats(samples: { rssi: number; timestamp: number }[]) {
  if (samples.length === 0) return null;
  const values = samples.map((s) => s.rssi);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, mean: Math.round(mean), count: samples.length };
}

export function DeviceDetailsModal({ device, isIdentifying = false, onClose, onIdentify }: Props) {
  const theme = useTheme();

  if (!device) {
    return (
      <Modal visible={false} animationType="slide" presentationStyle="formSheet">
        <View />
      </Modal>
    );
  }

  const stats = rssiStats(device.rssiSamples);
  const displayName =
    (device.make && device.model && `${device.make} ${device.model}`) ||
    device.localName ||
    device.inferredHint ||
    device.inferredCategory ||
    device.category ||
    (device.brand ? `${device.brand} device` : null) ||
    `Unknown device · ${device.stableId.slice(0, 6)}`;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
              {displayName}
            </Text>
            {device.brand && device.brand !== displayName && (
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                {device.brand}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={[styles.close, { color: theme.colors.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {onIdentify && (
            <TouchableOpacity
              style={[
                styles.identifyButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: isIdentifying ? 0.7 : 1,
                },
              ]}
              onPress={onIdentify}
              disabled={isIdentifying}
            >
              {isIdentifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.identifyButtonText}>
                  {device.make && device.model
                    ? 'Re-identify with Anthropic'
                    : 'Identify with Anthropic'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <Section title="Identification" theme={theme}>
            <Row label="Make" value={device.make} theme={theme} />
            <Row label="Model" value={device.model} theme={theme} />
            <Row label="Category (LLM)" value={device.category} theme={theme} />
            <Row
              label="Confidence (LLM)"
              value={
                device.identificationConfidence === null
                  ? null
                  : device.identificationConfidence.toFixed(2)
              }
              theme={theme}
            />
            <Row label="Brand (SIG)" value={device.brand} theme={theme} />
            <Row label="Local category" value={device.inferredCategory} theme={theme} />
            <Row label="Local hint" value={device.inferredHint} theme={theme} />
          </Section>

          <Section title="Broadcast" theme={theme}>
            <Row label="Local name" value={device.localName} theme={theme} />
            <Row
              label="Manufacturer data"
              value={device.manufacturerData}
              monospace
              theme={theme}
            />
            <Row
              label="Service UUIDs"
              value={
                device.serviceUUIDs.length === 0
                  ? null
                  : device.serviceUUIDs.join('\n')
              }
              monospace
              theme={theme}
            />
          </Section>

          <Section title="Signal" theme={theme}>
            <Row label="Latest RSSI" value={`${device.lastRssi ?? 'N/A'} dBm`} theme={theme} />
            {stats && (
              <>
                <Row label="RSSI samples" value={String(stats.count)} theme={theme} />
                <Row label="Mean RSSI" value={`${stats.mean} dBm`} theme={theme} />
                <Row
                  label="Range"
                  value={`${stats.min} dBm  →  ${stats.max} dBm`}
                  theme={theme}
                />
              </>
            )}
          </Section>

          <Section title="Identity" theme={theme}>
            <Row label="Stable ID" value={device.stableId} monospace theme={theme} />
            <Row label="Zone" value={device.zoneId} theme={theme} />
            <Row label="Last seen" value={fmtTimestamp(device.lastSeen)} theme={theme} />
            <Row
              label="Identify attempted"
              value={device.identifyAttempted ? 'yes' : 'no'}
              theme={theme}
            />
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.sectionBody, { backgroundColor: theme.colors.surface }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  monospace,
  theme,
}: {
  label: string;
  value: string | null | undefined;
  monospace?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: value ? theme.colors.text : theme.colors.textSecondary },
          monospace && styles.mono,
        ]}
        selectable
      >
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  close: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  body: {
    padding: 16,
    paddingBottom: 48,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionBody: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(127,127,127,0.2)',
  },
  rowLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  mono: {
    fontFamily: 'Menlo',
  },
  identifyButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    minHeight: 48,
  },
  identifyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
