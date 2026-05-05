import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { identifyRoute } from './routes/identify';
import { transcribeRoute } from './routes/transcribe';
import { chatRoute } from './routes/chat';

type Env = {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  RATE_LIMITER: any;
};

const app = new Hono<{ Bindings: Env }>();

// CORS middleware - allow localhost for dev and EAS dev-client origins
app.use('*', cors({
  origin: [
    'http://localhost:8081',
    'http://localhost:19000',
    'http://localhost:19006',
    // EAS dev-client origins will be added dynamically in production
  ],
  credentials: true,
}));

// Rate limiting middleware
app.use('*', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') || 'unknown';

  try {
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
  } catch (error) {
    // If rate limiter binding is not available (local dev), continue
    console.warn('Rate limiter not available:', error);
  }

  await next();
});

// Mount routes
app.route('/api/identify', identifyRoute);
app.route('/api/transcribe', transcribeRoute);
app.route('/api/chat', chatRoute);

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'aura-proxy' });
});

export default app;
