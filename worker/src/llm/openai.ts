import OpenAI from 'openai';

/**
 * Transcribes audio using OpenAI Whisper
 *
 * @param audioBlob - Audio file blob (max 4MB for Cloudflare Workers)
 * @param apiKey - OpenAI API key
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string
): Promise<string> {
  const client = new OpenAI({ apiKey });

  try {
    // Create a File object from the Blob
    const audioFile = new File([audioBlob], 'recording.m4a', {
      type: 'audio/m4a',
    });

    // Call Whisper API
    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en', // Specify English for faster processing
    });

    return response.text;
  } catch (error) {
    console.error('Transcription failed:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Transcription failed'
    );
  }
}
