import { Hono } from 'hono';
import { identifyDevice } from '../llm/gemini';
import { IdentifyRequestSchema } from '../lib/zod-schemas';

type Env = {
  GEMINI_API_KEY: string;
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
    const result = await identifyDevice(request, c.env.GEMINI_API_KEY);

    return c.json(result);
  } catch (error) {
    console.error('Identification error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
