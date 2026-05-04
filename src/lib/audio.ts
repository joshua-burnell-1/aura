/**
 * Audio utilities for recording and text-to-speech
 */

import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';

export type RecordingResult = {
  uri: string;
  durationMs: number;
};

let currentRecording: Audio.Recording | null = null;

/**
 * Requests microphone permissions
 */
export async function requestMicrophonePermissions(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Failed to request microphone permissions:', error);
    return false;
  }
}

/**
 * Starts audio recording
 * Call this on press-in of the mic button
 */
export async function startRecording(): Promise<boolean> {
  try {
    // Request permissions
    const hasPermission = await requestMicrophonePermissions();
    if (!hasPermission) {
      console.error('Microphone permission denied');
      return false;
    }

    // Set audio mode for recording
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    // Create and start recording
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    currentRecording = recording;
    return true;
  } catch (error) {
    console.error('Failed to start recording:', error);
    currentRecording = null;
    return false;
  }
}

/**
 * Stops audio recording and returns the file URI
 * Call this on press-out of the mic button
 */
export async function stopRecording(): Promise<RecordingResult | null> {
  try {
    if (!currentRecording) {
      return null;
    }

    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    const status = await currentRecording.getStatusAsync();

    currentRecording = null;

    // Reset audio mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    if (!uri) {
      console.error('No URI from recording');
      return null;
    }

    return {
      uri,
      durationMs: status.durationMillis || 0,
    };
  } catch (error) {
    console.error('Failed to stop recording:', error);
    currentRecording = null;
    return null;
  }
}

/**
 * Cancels current recording without saving
 */
export async function cancelRecording(): Promise<void> {
  try {
    if (currentRecording) {
      await currentRecording.stopAndUnloadAsync();
      currentRecording = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    }
  } catch (error) {
    console.error('Failed to cancel recording:', error);
  }
}

/**
 * Reads audio file and returns as Blob for upload
 */
export async function audioFileToBlob(uri: string): Promise<Blob> {
  try {
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    // Convert to blob
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    return new Blob([byteArray], { type: 'audio/m4a' });
  } catch (error) {
    console.error('Failed to convert audio to blob:', error);
    throw error;
  }
}

/**
 * Speaks text using Text-to-Speech
 */
export async function speak(text: string): Promise<void> {
  try {
    // Stop any ongoing speech
    await Speech.stop();

    // Speak the text
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.95, // Slightly slower than normal for clarity
    });
  } catch (error) {
    console.error('Failed to speak:', error);
  }
}

/**
 * Stops current speech
 */
export async function stopSpeaking(): Promise<void> {
  try {
    await Speech.stop();
  } catch (error) {
    console.error('Failed to stop speaking:', error);
  }
}

/**
 * Checks if speech is currently playing
 */
export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch (error) {
    console.error('Failed to check if speaking:', error);
    return false;
  }
}
