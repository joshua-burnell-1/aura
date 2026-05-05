import { Hono } from 'hono';
import { identifyDevice } from '../llm/anthropic';
import { IdentifyRequestSchema } from '../lib/zod-schemas';

type Env = {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  RATE_LIMITER: any;
};

export const identifyRoute = new Hono<{ Bindings: Env }>();

identifyRoute.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate request
    const parseResult = IdentifyRequestSchema.safeParse(body);
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

    // Identify device
    const result = await identifyDevice(request, c.env.ANTHROPIC_API_KEY);

    return c.json(result);
  } catch (error) {
    // 503 (vs 500) signals "transient" to the client so auto-identify will
    // retry instead of giving up. Anthropic rate-limit and timeout errors
    // both land here.
    console.error('Identification error:', error);
    return c.json(
      {
        error: 'Identification temporarily unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});
