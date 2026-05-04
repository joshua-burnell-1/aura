import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { useTheme } from '../../src/theme';
import { useDeviceStore } from '../../src/state/useDeviceStore';
import { useChatStore } from '../../src/state/useChatStore';
import { MicButton } from '../../src/components/MicButton';
import { Citation } from '../../src/components/Citation';
import * as AudioLib from '../../src/lib/audio';
import { transcribeAudio, chatWithDevice } from '../../src/lib/proxyClient';
import type { Device } from '../../src/state/useDeviceStore';

function isDeviceIdentified(d: Device): boolean {
  return !!(
    (d.make && d.model) ||
    d.localName ||
    d.inferredHint ||
    d.inferredCategory ||
    d.brand
  );
}

export default function StewardScreen() {
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const devicesById = useDeviceStore((state) => state.devices);
  // A device is "identified enough for Steward" if we have any meaningful
  // label — Gemini make/model OR a broadcast name OR a local Continuity hint
  // OR a SIG-derived category. Anonymous devices (no signal) are still hidden.
  const devices = Object.values(devicesById).filter((d) =>
    isDeviceIdentified(d)
  );
  const selectedDevice = selectedDeviceId ? devicesById[selectedDeviceId] : null;

  const buildDeviceContext = (d: typeof devicesById[string]) => ({
    stableId: d.stableId,
    // Fall back from Gemini's make/model down to whatever we have locally.
    make: d.make ?? d.brand,
    model: d.model ?? d.localName ?? d.inferredHint,
    brand: d.brand,
    category: d.category ?? d.inferredCategory ?? d.inferredHint,
  });

  const deviceLabel = (d: typeof devicesById[string]) =>
    (d.make && d.model && `${d.make} ${d.model}`) ||
    d.localName ||
    d.inferredHint ||
    d.inferredCategory ||
    (d.brand ? `${d.brand} device` : null) ||
    `Unknown · ${d.stableId.slice(0, 6)}`;

  const threads = useChatStore((state) => state.threads);
  const messages = selectedDeviceId ? threads[selectedDeviceId]?.messages || [] : [];
  const addMessage = useChatStore((state) => state.addMessage);
  const appendToLastMessage = useChatStore((state) => state.appendToLastMessage);
  const addCitationToLastMessage = useChatStore((state) => state.addCitationToLastMessage);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    if (scrollViewRef.current && messages.length > 0) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleStartRecording = async () => {
    const success = await AudioLib.startRecording();
    if (success) {
      setIsRecording(true);
    } else {
      Alert.alert(
        'Cannot record',
        'Microphone permission was denied or the recorder failed to start. Check Settings → Privacy → Microphone → Aura.'
      );
    }
  };

  const handleStopRecording = async () => {
    if (!selectedDeviceId || !selectedDevice) return;

    setIsRecording(false);

    const recording = await AudioLib.stopRecording();
    if (!recording) {
      Alert.alert('No recording', 'Recording stopped but no audio was captured.');
      return;
    }

    let transcription = '';
    try {
      const audioBlob = await AudioLib.audioFileToBlob(recording.uri);
      transcription = await transcribeAudio(audioBlob);
    } catch (error) {
      Alert.alert(
        'Transcription failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return;
    }

    if (!transcription.trim()) {
      Alert.alert('No speech detected', 'The recording was empty or unintelligible.');
      return;
    }

    addMessage(selectedDeviceId, {
      id: Date.now().toString(),
      role: 'user',
      content: transcription,
      timestamp: Date.now(),
    });

    addMessage(selectedDeviceId, {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      citations: [],
    });

    setIsStreaming(true);

    try {
      let accumulatedText = '';

      for await (const event of chatWithDevice({
        deviceContext: buildDeviceContext(selectedDevice),
        transcript: transcription,
      })) {
        if (event.type === 'token') {
          accumulatedText += event.text;
          appendToLastMessage(selectedDeviceId, event.text);
        } else if (event.type === 'citation') {
          addCitationToLastMessage(selectedDeviceId, {
            id: event.id,
            url: event.url,
            title: event.title,
          });
        } else if (event.type === 'error') {
          Alert.alert('Steward error', event.message);
        }
      }

      if (accumulatedText.trim().length > 0) {
        await AudioLib.speak(accumulatedText);
      } else {
        Alert.alert(
          'Empty response',
          'Gemini returned no text. Check the worker logs (wrangler tail) for details.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Voice chat failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      console.error('Voice chat error:', error);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSendText = async () => {
    if (!selectedDeviceId || !selectedDevice || !textInput.trim()) return;

    const userText = textInput.trim();
    setTextInput('');

    addMessage(selectedDeviceId, {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    });

    addMessage(selectedDeviceId, {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      citations: [],
    });

    setIsStreaming(true);

    try {
      let accumulatedText = '';

      for await (const event of chatWithDevice({
        deviceContext: {
          stableId: selectedDevice.stableId,
          make: selectedDevice.make,
          model: selectedDevice.model,
          brand: selectedDevice.brand,
          category: selectedDevice.category,
        },
        transcript: userText,
      })) {
        if (event.type === 'token') {
          accumulatedText += event.text;
          appendToLastMessage(selectedDeviceId, event.text);
        } else if (event.type === 'citation') {
          addCitationToLastMessage(selectedDeviceId, {
            id: event.id,
            url: event.url,
            title: event.title,
          });
        } else if (event.type === 'error') {
          Alert.alert('Steward error', event.message);
        }
      }

      if (accumulatedText.trim().length === 0) {
        Alert.alert(
          'Empty response',
          'Gemini returned no text. Check the worker logs (wrangler tail) for details.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Text chat failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      console.error('Text chat error:', error);
    } finally {
      setIsStreaming(false);
    }
  };

  if (!selectedDeviceId || !selectedDevice) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Steward</Text>
        </View>
        <View style={styles.deviceSelector}>
          {devices.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              No identified devices yet. Go to Radar tab and identify a device first.
            </Text>
          ) : (
            <>
              <Text style={[styles.selectorTitle, { color: theme.colors.text }]}>
                Select a device:
              </Text>
              {devices.map((device) => {
                const subtitle =
                  device.category ||
                  device.inferredCategory ||
                  device.brand ||
                  null;
                return (
                  <TouchableOpacity
                    key={device.stableId}
                    style={[styles.deviceButton, { backgroundColor: theme.colors.surface }]}
                    onPress={() => setSelectedDeviceId(device.stableId)}
                  >
                    <Text style={[styles.deviceName, { color: theme.colors.text }]}>
                      {deviceLabel(device)}
                    </Text>
                    {subtitle && subtitle !== deviceLabel(device) && (
                      <Text style={[styles.deviceCategory, { color: theme.colors.textSecondary }]}>
                        {subtitle}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSelectedDeviceId(null)}>
          <Text style={[styles.backButton, { color: theme.colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, { color: theme.colors.text }]}>
            {deviceLabel(selectedDevice)}
          </Text>
          {(selectedDevice.category || selectedDevice.inferredCategory || selectedDevice.brand) && (
            <Text style={[styles.deviceCategory, { color: theme.colors.textSecondary }]}>
              {selectedDevice.category || selectedDevice.inferredCategory || selectedDevice.brand}
            </Text>
          )}
        </View>
      </View>

      <ScrollView ref={scrollViewRef} style={styles.chatContainer}>
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              Press and hold the mic button to ask a question about this device.
            </Text>
          </View>
        ) : (
          messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.message,
                msg.role === 'user' ? styles.userMessage : styles.assistantMessage,
                { backgroundColor: msg.role === 'user' ? theme.colors.primary : theme.colors.surface },
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  { color: msg.role === 'user' ? '#fff' : theme.colors.text },
                ]}
              >
                {msg.content}
              </Text>
              {msg.citations && msg.citations.length > 0 && (
                <View style={styles.citations}>
                  {msg.citations.map((citation) => (
                    <Citation key={citation.id} citation={citation} />
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.inputContainer, { backgroundColor: theme.colors.surface }]}>
        <TextInput
          style={[styles.textInput, { color: theme.colors.text }]}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.textSecondary}
          value={textInput}
          onChangeText={setTextInput}
          onSubmitEditing={handleSendText}
          editable={!isStreaming}
        />
        <MicButton
          onPressIn={handleStartRecording}
          onPressOut={handleStopRecording}
          isRecording={isRecording}
          disabled={isStreaming}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  backButton: {
    fontSize: 16,
    marginBottom: 8,
  },
  deviceInfo: {
    marginTop: 4,
  },
  deviceSelector: {
    flex: 1,
    padding: 16,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  deviceButton: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  deviceCategory: {
    fontSize: 14,
    marginTop: 4,
  },
  chatContainer: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  message: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  citations: {
    marginTop: 8,
    gap: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
  },
});
