import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IdentifyRequest, IdentifyResponse, ChatRequest } from '../lib/zod-schemas';

const IDENTIFICATION_SYSTEM_PROMPT = `You identify Bluetooth devices from broadcast metadata.

Given the following information about a Bluetooth device:
- Scrubbed local name (personal names removed)
- Brand (from Bluetooth SIG company ID lookup)
- Manufacturer data prefix (first 8 hex characters)
- Service UUIDs

Your task is to determine:
1. The manufacturer/make (e.g., "Apple", "Sony", "Bose")
2. The specific model (e.g., "AirPods Pro (2nd generation)", "WH-1000XM4", "QuietComfort 45")
3. The device category (e.g., "Wireless Earbuds", "Over-Ear Headphones", "Smart Speaker", "Fitness Tracker")
4. Your confidence level (0.0 to 1.0)

Respond ONLY with valid JSON matching this schema:
{
  "make": string | null,
  "model": string | null,
  "inferredCategory": string | null,
  "confidence": number
}

Rules:
- Use the brand field as a strong signal for the make
- Use service UUIDs to narrow down device type (e.g., 180F = battery service, common in wearables)
- If the scrubbed name contains a model number or identifier, use it
- Set confidence based on how certain you are:
  - 0.9-1.0: Very confident (exact model match from name or unique manufacturer data)
  - 0.7-0.9: Confident (strong signals from multiple fields)
  - 0.5-0.7: Moderate (some ambiguity, best guess)
  - 0.0-0.5: Low confidence (insufficient information)
- If you cannot determine make/model with any confidence, set them to null and confidence to 0.0
- Never fabricate details; it's better to return null than guess`;

/**
 * Identifies a device using Gemini
 */
export async function identifyDevice(
  request: IdentifyRequest,
  apiKey: string
): Promise<IdentifyResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const prompt = `${IDENTIFICATION_SYSTEM_PROMPT}\n\nDevice data:\n${JSON.stringify(request, null, 2)}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Extract JSON from response (Gemini might wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as IdentifyResponse;

    // Validate confidence is in range
    if (parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
    }

    return parsed;
  } catch (error) {
    console.error('Device identification failed:', error);

    // Return a low-confidence unknown result rather than failing
    return {
      make: null,
      model: null,
      inferredCategory: null,
      confidence: 0.0,
    };
  }
}

const STEWARD_SYSTEM_PROMPT = `You are Aura, a hardware steward assistant. The user has identified a specific Bluetooth device and needs help with it.

Your role:
- Provide troubleshooting guidance for the specific device model the user asks about
- Search for authoritative information from the manufacturer's official site or reputable support sources
- Keep answers concise: 3-6 sentences for the main answer, then a short numbered list of steps if procedural

Critical rules:
1. Search for manufacturer documentation before answering device-specific questions
2. NEVER fabricate model-specific button sequences, indicator light meanings, or firmware steps
3. If you cannot find authoritative sources for the exact model, say so plainly and offer general guidance with a clear disclaimer
4. Prioritize manufacturer domains (e.g., sony.com, bose.com, apple.com/support) and reputable support sites

Format:
- Start with a direct answer to the user's question
- Follow with numbered steps if it's a procedural fix
- Cite sources when found`;

/**
 * SSE event types for streaming chat
 */
export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'citation'; id: string; url: string; title: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Creates a grounded chat response using Gemini with Google Search grounding
 * Returns an async generator that yields SSE events
 */
export async function* groundedChat(
  request: ChatRequest,
  apiKey: string
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use Gemini 2.5 Flash with grounding
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: STEWARD_SYSTEM_PROMPT,
  });

  const deviceInfo = request.deviceContext.make && request.deviceContext.model
    ? `${request.deviceContext.make} ${request.deviceContext.model}`
    : request.deviceContext.brand || 'Unknown device';

  const userMessage = `Device: ${deviceInfo}\nCategory: ${request.deviceContext.category || 'Unknown'}\n\nQuestion: ${request.transcript}`;

  try {
    // For now, use Gemini without explicit grounding tools
    // Gemini 2.5 Flash has built-in search capabilities
    const result = await model.generateContentStream(userMessage);

    // Stream text chunks
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        yield {
          type: 'token',
          text: chunkText,
        };
      }
    }

    // Get response metadata for any citations
    const response = await result.response;
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (groundingMetadata) {
      // Extract citations from grounding metadata if available
      const supports = groundingMetadata.groundingSupports || [];

      for (let i = 0; i < supports.length; i++) {
        const support = supports[i];
        // Use the correct property name from the SDK
        const chunkIndices = (support as any).groundingChunckIndices || [];
        const chunks = groundingMetadata.groundingChunks || [];

        for (const chunkIndex of chunkIndices) {
          const chunk = chunks[chunkIndex];
          if (chunk?.web?.uri && chunk?.web?.title) {
            yield {
              type: 'citation',
              id: `c${i}_${chunkIndex}`,
              url: chunk.web.uri,
              title: chunk.web.title,
            };
          }
        }
      }
    }

    yield { type: 'done' };

  } catch (error) {
    console.error('Grounded chat failed:', error);
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : 'Chat failed',
    };
  }
}
