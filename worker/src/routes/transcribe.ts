import { Hono } from 'hono';
import { transcribeAudio } from '../llm/openai';

type Env = {
  GEMINI_API_KEY: string;
  OPENAI_API_KEY: string;
  RATE_LIMITER: any;
};

export const transcribeRoute = new Hono<{ Bindings: Env }>();

transcribeRoute.post('/', async (c) => {
  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const audioFile = formData.get('audio');

    // formData.get returns FormDataEntryValue | null — string for plain fields,
    // File-like object for uploads. The Workers' `File` global isn't a class
    // TS can narrow on, so we treat the value as a Blob-shaped object once we
    // confirm it has arrayBuffer().
    if (
      !audioFile ||
      typeof audioFile === 'string' ||
      typeof (audioFile as any).arrayBuffer !== 'function'
    ) {
      return c.json(
        {
          error: 'Invalid request',
          message: 'Audio file is required',
        },
        400
      );
    }

    const audioBlobLike = audioFile as Blob;

    // 4MB limit for Workers form bodies
    if (audioBlobLike.size > 4 * 1024 * 1024) {
      return c.json(
        {
          error: 'File too large',
          message: 'Audio file must be less than 4MB',
        },
        413
      );
    }

    const audioBlob = new Blob([await audioBlobLike.arrayBuffer()], {
      type: audioBlobLike.type,
    });

    // Transcribe with OpenAI Whisper
    const text = await transcribeAudio(audioBlob, c.env.OPENAI_API_KEY);

    return c.json({ text });
  } catch (error) {
    console.error('Transcription error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
