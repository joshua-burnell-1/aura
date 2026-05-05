import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { groundedChat } from '../llm/anthropic';
import { ChatRequestSchema } from '../lib/zod-schemas';

type Env = {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  RATE_LIMITER: any;
};

export const chatRoute = new Hono<{ Bindings: Env }>();

chatRoute.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate request
    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json(
        {
          error: 'Invalid request',
          details: parseResult.error.issues,
        },
        400
      );
    }

    const request = parseResult.data;

    // Stream response as SSE
    return stream(c, async (stream) => {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      for await (const event of groundedChat(request, c.env.ANTHROPIC_API_KEY)) {
        await stream.write(`event: ${event.type}\n`);
        await stream.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
