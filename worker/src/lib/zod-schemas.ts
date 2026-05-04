import { z } from 'zod';

/**
 * Request schema for /api/identify
 */
export const IdentifyRequestSchema = z.object({
  scrubbedName: z.string().nullable(),
  brand: z.string().nullable(),
  manufacturerPrefix: z.string().nullable(),
  serviceUUIDs: z.array(z.string()),
});

export type IdentifyRequest = z.infer<typeof IdentifyRequestSchema>;

/**
 * Response schema for /api/identify
 */
export const IdentifyResponseSchema = z.object({
  make: z.string().nullable(),
  model: z.string().nullable(),
  inferredCategory: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type IdentifyResponse = z.infer<typeof IdentifyResponseSchema>;

/**
 * Request schema for /api/chat
 */
export const ChatRequestSchema = z.object({
  deviceContext: z.object({
    stableId: z.string(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
  }),
  transcript: z.string(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * Response schema for /api/transcribe
 */
export const TranscribeResponseSchema = z.object({
  text: z.string(),
});

export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;
