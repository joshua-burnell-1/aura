import Anthropic from '@anthropic-ai/sdk';
import type { IdentifyRequest, IdentifyResponse, ChatRequest } from '../lib/zod-schemas';

const IDENTIFY_MODEL = 'claude-opus-4-7';
const CHAT_MODEL = 'claude-opus-4-7';

const IDENTIFICATION_SYSTEM_PROMPT = `You identify Bluetooth devices from broadcast metadata.

Given the following information about a Bluetooth device:
- Scrubbed local name (personal names removed)
- Brand (from Bluetooth SIG company ID lookup)
- Manufacturer data prefix (first 8 hex characters)
- Service UUIDs

Your task is to determine:
1. The manufacturer/make as a short canonical brand name (e.g., "Apple", "Sony", "Bose", "Samsung", "Garmin"). Strip suffixes like "Inc.", "Corp.", "Ltd.". One or two words max.
2. The specific model (e.g., "AirPods Pro (2nd generation)", "WH-1000XM4", "QuietComfort 45")
3. A standardized device category, picked from this exact controlled list — never invent new values:
   - "Wireless Earbuds"
   - "Over-Ear Headphones"
   - "Smart Speaker"
   - "Soundbar"
   - "TV"
   - "Streaming Device"
   - "Game Controller"
   - "Smartphone"
   - "Tablet"
   - "Laptop"
   - "Smart Watch"
   - "Fitness Tracker"
   - "Smart Ring"
   - "Heart Rate Monitor"
   - "Cycling Sensor"
   - "Smart Scale"
   - "Smart Lock"
   - "Smart Bulb"
   - "Smart Plug"
   - "Smart Thermostat"
   - "Smart Sensor"
   - "Tracker / Tag"
   - "Keyboard"
   - "Mouse"
   - "Stylus"
   - "Printer"
   - "Vehicle"
   - "Beacon"
   - "Other"
4. Your confidence level (0.0 to 1.0)

Respond ONLY with valid JSON matching this schema:
{
  "make": string | null,
  "model": string | null,
  "inferredCategory": string | null,
  "confidence": number
}

Rules:
- inferredCategory MUST be one of the values listed above, or null. Never invent a new category string.
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

const STEWARD_SYSTEM_PROMPT = `You are Aura, a hardware steward assistant. The user has identified a specific Bluetooth device and needs help with it.

Your role:
- Provide troubleshooting guidance for the specific device the user asks about
- Use the web_search tool to find authoritative information from the manufacturer's official site or reputable support sources before answering device-specific questions
- Keep answers concise: 3-6 sentences for the main answer, then a short numbered list of steps if procedural

Critical rules:
1. Search for manufacturer documentation before answering anything model-specific (button sequences, indicator-light meanings, firmware steps)
2. NEVER fabricate model-specific details. If you cannot find authoritative sources for the exact model, say so plainly and offer general guidance with a clear disclaimer
3. Prioritize manufacturer domains (e.g., sony.com, bose.com, apple.com/support) and reputable support sites
4. If the device is unknown or sparsely identified, ask one clarifying question rather than guess

Format:
- Start with a direct answer
- Follow with numbered steps if it's a procedural fix
- Mention the source domain inline when you cite something specific`;

/**
 * Identifies a device using Claude.
 *
 * Errors are propagated to the route handler so they can return 5xx — the
 * mobile client treats those as transient and retries. We only return an
 * empty (low-confidence) result when Anthropic responded successfully but
 * couldn't produce a parseable identification (legitimate "no match").
 */
export async function identifyDevice(
  request: IdentifyRequest,
  apiKey: string
): Promise<IdentifyResponse> {
  const client = new Anthropic({ apiKey });

  // Network / rate-limit / auth errors bubble to the caller (route handler
  // turns them into 5xx). Don't swallow.
  const response = await client.messages.create({
    model: IDENTIFY_MODEL,
    max_tokens: 1024,
    system: IDENTIFICATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Device data:\n${JSON.stringify(request, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return { make: null, model: null, inferredCategory: null, confidence: 0.0 };
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { make: null, model: null, inferredCategory: null, confidence: 0.0 };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as IdentifyResponse;
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0));
    return parsed;
  } catch {
    return { make: null, model: null, inferredCategory: null, confidence: 0.0 };
  }
}

/**
 * SSE event types emitted on the chat stream.
 */
export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'citation'; id: string; url: string; title: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Grounded chat — Claude answers a user question about a specific device, using
 * the web_search tool to ground answers in live manufacturer documentation.
 *
 * Yields events suitable for serialization to the SSE event stream the mobile
 * client consumes. Internally we make a single non-streaming Anthropic call,
 * walk the resulting content blocks, and re-emit text + citations as discrete
 * events. This trades token-by-token latency for end-to-end reliability —
 * React Native's iOS fetch polyfill struggles with streamed bodies, and the
 * mobile client already reads the SSE blob via response.text() (see
 * src/lib/proxyClient.ts → chatWithDevice).
 */
export async function* groundedChat(
  request: ChatRequest,
  apiKey: string
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const client = new Anthropic({ apiKey });

  const ctx = request.deviceContext;
  const deviceLabel =
    (ctx.make && ctx.model && `${ctx.make} ${ctx.model}`) ||
    ctx.brand ||
    'unknown Bluetooth device';
  const category = ctx.category || 'unknown category';

  const userMessage = `Device: ${deviceLabel}
Category: ${category}

Question: ${request.transcript}`;

  try {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: STEWARD_SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: userMessage }],
    });

    let citationCounter = 0;
    for (const block of response.content) {
      if (block.type === 'text') {
        if (block.text) {
          yield { type: 'token', text: block.text };
        }
      } else if (block.type === 'web_search_tool_result') {
        // web_search_tool_result.content is a list of search hits with url/title.
        // Anthropic's exact field shape varies across tool versions, so be
        // defensive — extract whatever url/title pairs are present.
        const inner = (block as any).content;
        if (Array.isArray(inner)) {
          for (const hit of inner) {
            const url = (hit && (hit.url as string | undefined)) ?? null;
            const title = (hit && (hit.title as string | undefined)) ?? null;
            if (url && title) {
              yield {
                type: 'citation',
                id: `c${citationCounter++}`,
                url,
                title,
              };
            }
          }
        }
      }
      // Other block types (thinking, tool_use, server_tool_use) are
      // intentionally ignored — they're not user-facing in this app.
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
