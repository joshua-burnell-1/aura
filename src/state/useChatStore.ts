/**
 * Per-device chat thread store
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  citations?: Array<{
    id: string;
    url: string;
    title: string;
  }>;
};

export type ChatThread = {
  deviceId: string;
  messages: ChatMessage[];
  lastUpdated: number;
};

type ChatStore = {
  threads: Record<string, ChatThread>;
  addMessage: (deviceId: string, message: ChatMessage) => void;
  appendToLastMessage: (deviceId: string, text: string) => void;
  addCitationToLastMessage: (
    deviceId: string,
    citation: { id: string; url: string; title: string }
  ) => void;
  clearThread: (deviceId: string) => void;
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      threads: {},

      addMessage: (deviceId, message) =>
        set((state) => {
          const existing = state.threads[deviceId];
          const messages = existing ? [...existing.messages, message] : [message];

          return {
            threads: {
              ...state.threads,
              [deviceId]: {
                deviceId,
                messages,
                lastUpdated: Date.now(),
              },
            },
          };
        }),

      appendToLastMessage: (deviceId, text) =>
        set((state) => {
          const thread = state.threads[deviceId];
          if (!thread || thread.messages.length === 0) return state;

          const messages = [...thread.messages];
          const lastMessage = messages[messages.length - 1];

          if (lastMessage.role !== 'assistant') return state;

          messages[messages.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + text,
          };

          return {
            threads: {
              ...state.threads,
              [deviceId]: {
                ...thread,
                messages,
                lastUpdated: Date.now(),
              },
            },
          };
        }),

      addCitationToLastMessage: (deviceId, citation) =>
        set((state) => {
          const thread = state.threads[deviceId];
          if (!thread || thread.messages.length === 0) return state;

          const messages = [...thread.messages];
          const lastMessage = messages[messages.length - 1];

          if (lastMessage.role !== 'assistant') return state;

          const citations = lastMessage.citations || [];
          messages[messages.length - 1] = {
            ...lastMessage,
            citations: [...citations, citation],
          };

          return {
            threads: {
              ...state.threads,
              [deviceId]: {
                ...thread,
                messages,
                lastUpdated: Date.now(),
              },
            },
          };
        }),

      clearThread: (deviceId) =>
        set((state) => {
          const { [deviceId]: removed, ...rest } = state.threads;
          return { threads: rest };
        }),
    }),
    {
      name: 'aura-chat',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
