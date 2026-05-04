import { useRef, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../theme';

interface MicButtonProps {
  onPressIn: () => void;
  onPressOut: () => void;
  isRecording: boolean;
  disabled?: boolean;
}

export function MicButton({ onPressIn, onPressOut, isRecording, disabled }: MicButtonProps) {
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      // Start pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Stop animation and reset
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  return (
    <TouchableOpacity
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: isRecording ? theme.colors.error : theme.colors.primary,
            opacity: disabled ? 0.5 : 1,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Microphone icon placeholder - you can replace with actual icon */}
        <Animated.View
          style={[
            styles.iconPlaceholder,
            {
              opacity: isRecording ? 1 : 0.8,
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
});
