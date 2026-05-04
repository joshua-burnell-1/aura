/**
 * Server-Sent Events (SSE) parser for streaming responses
 */

export type SSEEvent = {
  event: string;
  data: string;
  id?: string;
};

/**
 * Parses SSE stream from ReadableStream
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split by double newline (end of SSE message)
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete message in buffer

      for (const message of lines) {
        if (!message.trim()) continue;

        const event: Partial<SSEEvent> = {
          event: 'message',
          data: '',
        };

        // Parse SSE fields
        const messageLines = message.split('\n');
        for (const line of messageLines) {
          if (line.startsWith('event:')) {
            event.event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            event.data += line.slice(5).trim();
          } else if (line.startsWith('id:')) {
            event.id = line.slice(3).trim();
          }
        }

        if (event.data) {
          yield event as SSEEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Chat stream event types
 */
export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'citation'; id: string; url: string; title: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Parses chat SSE stream into typed events
 */
export async function* parseChatStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ChatStreamEvent> {
  for await (const event of parseSSEStream(stream)) {
    try {
      const data = JSON.parse(event.data);

      switch (event.event) {
        case 'token':
          yield { type: 'token', text: data.text || data };
          break;
        case 'citation':
          yield {
            type: 'citation',
            id: data.id,
            url: data.url,
            title: data.title,
          };
          break;
        case 'done':
          yield { type: 'done' };
          break;
        case 'error':
          yield { type: 'error', message: data.message || 'Unknown error' };
          break;
      }
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
    }
  }
}
