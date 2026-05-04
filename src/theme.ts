import { useColorScheme } from 'react-native';

type Colors = {
  background: string;
  surface: string;
  primary: string;
  error: string;
  text: string;
  textSecondary: string;
  border: string;
};

const lightColors: Colors = {
  background: '#f5f5f5',
  surface: '#ffffff',
  primary: '#007AFF',
  error: '#FF3B30',
  text: '#000000',
  textSecondary: '#8E8E93',
  border: '#C6C6C8',
};

const darkColors: Colors = {
  background: '#000000',
  surface: '#1C1C1E',
  primary: '#0A84FF',
  error: '#FF453A',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#38383A',
};

export function useTheme() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  return {
    colors,
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    radius: {
      sm: 4,
      md: 8,
      lg: 12,
      full: 9999,
    },
    typography: {
      h1: 28,
      h2: 24,
      h3: 20,
      body: 16,
      caption: 14,
      small: 12,
    },
  };
}
