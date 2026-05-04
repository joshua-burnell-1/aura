/**
 * Device catalog store with RSSI history
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RSSISample } from '../lib/zones';
import { inferCategory } from '../lib/bleCategorize';

export type Device = {
  stableId: string;
  localName: string | null;
  manufacturerData: string | null;
  serviceUUIDs: string[];
  brand: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  identificationConfidence: number | null;
  // Local heuristic categorization (always populated; cheap; privacy-safe)
  inferredCategory: string | null;
  inferredHint: string | null;
  // True once we've attempted a Gemini identify call, regardless of outcome.
  // Used by the auto-identify effect to avoid re-trying every render.
  identifyAttempted: boolean;
  lastRssi: number | null;
  rssiSamples: RSSISample[];
  lastSeen: number;
  zoneId: string | null;
};

// Prefer the more descriptive of two name candidates. A new packet only wins
// if it's substantially longer than what we already have — guards against
// devices that flip between truncated and full names across advertising packets.
function pickBetterName(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return incoming.length > existing.length * 1.2 ? incoming : existing;
}

function mergeServiceUUIDs(existing: string[] | undefined, incoming: string[]): string[] {
  if (!existing || existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;
  const set = new Set([...existing, ...incoming]);
  return Array.from(set);
}

type DeviceStore = {
  devices: Record<string, Device>;
  upsertSighting: (sighting: {
    stableId: string;
    localName: string | null;
    manufacturerData: string | null;
    serviceUUIDs: string[];
    rssi: number;
    brand: string | null;
  }) => void;
  updateDevice: (
    stableId: string,
    updates: Partial<Omit<Device, 'stableId' | 'rssiSamples'>>
  ) => void;
  assignDeviceToZone: (stableId: string, zoneId: string | null) => void;
  clearAllDevices: () => void;
};

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      devices: {},

      upsertSighting: (sighting) =>
        set((state) => {
          const existing = state.devices[sighting.stableId];
          const now = Date.now();

          const newSample: RSSISample = {
            rssi: sighting.rssi,
            timestamp: now,
          };

          // Keep last 20 RSSI samples
          const rssiSamples = existing
            ? [...existing.rssiSamples, newSample].slice(-20)
            : [newSample];

          // Smart-merge cumulative metadata. BLE devices often broadcast
          // different bytes across advertising packets (e.g., a TV that
          // sometimes advertises "Samsung Frame 65" and sometimes "OLED 65").
          // Once we've seen useful data, lock it in and only allow upgrades.
          const mergedLocalName = pickBetterName(existing?.localName ?? null, sighting.localName);
          const mergedManufacturerData =
            existing?.manufacturerData || sighting.manufacturerData;
          const mergedBrand = existing?.brand || sighting.brand;
          const mergedServiceUUIDs = mergeServiceUUIDs(
            existing?.serviceUUIDs,
            sighting.serviceUUIDs
          );

          // Re-derive inferred labels from the union of all observed metadata.
          const inference = inferCategory({
            manufacturerData: mergedManufacturerData,
            serviceUUIDs: mergedServiceUUIDs,
            brand: mergedBrand,
          });

          return {
            devices: {
              ...state.devices,
              [sighting.stableId]: {
                stableId: sighting.stableId,
                localName: mergedLocalName,
                manufacturerData: mergedManufacturerData,
                serviceUUIDs: mergedServiceUUIDs,
                brand: mergedBrand,
                make: existing?.make ?? null,
                model: existing?.model ?? null,
                category: existing?.category ?? null,
                identificationConfidence: existing?.identificationConfidence ?? null,
                // Lock inferred labels once set; never downgrade to null.
                inferredCategory: existing?.inferredCategory ?? inference.category,
                inferredHint: existing?.inferredHint ?? inference.hint,
                identifyAttempted: existing?.identifyAttempted ?? false,
                lastRssi: sighting.rssi,
                rssiSamples,
                lastSeen: now,
                zoneId: existing?.zoneId ?? null,
              },
            },
          };
        }),

      updateDevice: (stableId, updates) =>
        set((state) => {
          const existing = state.devices[stableId];
          if (!existing) return state;

          return {
            devices: {
              ...state.devices,
              [stableId]: {
                ...existing,
                ...updates,
              },
            },
          };
        }),

      assignDeviceToZone: (stableId, zoneId) =>
        set((state) => {
          const existing = state.devices[stableId];
          if (!existing) return state;

          return {
            devices: {
              ...state.devices,
              [stableId]: {
                ...existing,
                zoneId,
              },
            },
          };
        }),

      clearAllDevices: () => set({ devices: {} }),
    }),
    {
      name: 'aura-devices',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
