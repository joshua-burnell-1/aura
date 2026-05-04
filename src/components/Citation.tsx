import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../theme';

interface CitationProps {
  citation: {
    id: string;
    url: string;
    title: string;
  };
}

export function Citation({ citation }: CitationProps) {
  const theme = useTheme();

  const handlePress = async () => {
    await WebBrowser.openBrowserAsync(citation.url);
  };

  return (
    <TouchableOpacity
      style={[styles.chip, { backgroundColor: theme.colors.primary + '20' }]}
      onPress={handlePress}
    >
      <Text style={[styles.text, { color: theme.colors.primary }]} numberOfLines={1}>
        {citation.title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});
