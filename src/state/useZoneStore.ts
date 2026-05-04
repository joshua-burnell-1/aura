/**
 * Zone management store
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Zone = {
  id: string;
  name: string;
  rssiThreshold: number | null;
  createdAt: number;
};

type ZoneStore = {
  zones: Record<string, Zone>;
  createZone: (name: string) => void;
  updateZone: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  deleteZone: (id: string) => void;
};

export const useZoneStore = create<ZoneStore>()(
  persist(
    (set) => ({
      zones: {},

      createZone: (name) =>
        set((state) => {
          const id = Date.now().toString();
          return {
            zones: {
              ...state.zones,
              [id]: {
                id,
                name,
                rssiThreshold: null,
                createdAt: Date.now(),
              },
            },
          };
        }),

      updateZone: (id, updates) =>
        set((state) => {
          const existing = state.zones[id];
          if (!existing) return state;

          return {
            zones: {
              ...state.zones,
              [id]: {
                ...existing,
                ...updates,
              },
            },
          };
        }),

      deleteZone: (id) =>
        set((state) => {
          const { [id]: removed, ...rest } = state.zones;
          return { zones: rest };
        }),
    }),
    {
      name: 'aura-zones',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
