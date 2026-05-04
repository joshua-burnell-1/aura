/**
 * API client for Cloudflare Worker proxy
 */

import { parseChatStream, ChatStreamEvent } from './sse';

const PROXY_BASE_URL = process.env.EXPO_PUBLIC_PROXY_BASE_URL || 'http://localhost:8787';

/**
 * Fetch with automatic retry and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;
    }

    if (attempt < maxRetries - 1) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)));
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * Identify a device using LLM
 */
export async function identifyDevice(request: {
  scrubbedName: string | null;
  brand: string | null;
  manufacturerPrefix: string | null;
  serviceUUIDs: string[];
}): Promise<{
  make: string | null;
  model: string | null;
  inferredCategory: string | null;
  confidence: number;
}> {
  const response = await fetchWithRetry(`${PROXY_BASE_URL}/api/identify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Identification failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Transcribe audio using Whisper
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.m4a');

  const response = await fetchWithRetry(`${PROXY_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.text;
}

/**
 * Chat with device — yields the same SSE event types as a streaming reader,
 * but reads the full response body as text first. React Native's fetch
 * polyfill does not reliably support `response.body` streaming on iOS, so
 * we trade real-time streaming for end-to-end reliability. Once RN's fetch
 * stream support is solid we can revert to `parseChatStream(response.body)`.
 */
export async function* chatWithDevice(request: {
  deviceContext: {
    stableId: string;
    make: string | null;
    model: string | null;
    brand: string | null;
    category: string | null;
  };
  transcript: string;
}): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`${PROXY_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(
      `Chat HTTP ${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`
    );
  }

  const sseText = await response.text();

  // Parse SSE blob: each event is a `\n\n`-separated block of `field: value` lines.
  for (const block of sseText.split('\n\n')) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let eventType = 'message';
    let dataStr = '';
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
    }
    if (!dataStr) continue;

    let data: any;
    try {
      data = JSON.parse(dataStr);
    } catch {
      continue;
    }

    switch (eventType) {
      case 'token':
        yield { type: 'token', text: data.text ?? '' };
        break;
      case 'citation':
        yield { type: 'citation', id: data.id, url: data.url, title: data.title };
        break;
      case 'done':
        yield { type: 'done' };
        break;
      case 'error':
        yield { type: 'error', message: data.message ?? 'Unknown error' };
        break;
    }
  }
}
