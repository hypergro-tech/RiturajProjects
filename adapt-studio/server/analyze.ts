import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { buildPrompt, ObjectModelSchema, SYSTEM_PROMPT, type VisionObjectModel } from './schema.js';

export const DEFAULT_MODEL = 'claude-opus-5';
type Effort = 'low' | 'medium' | 'high';

export class AnalyzeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface AnalyzeInput { image: string; mediaType: 'image/jpeg' | 'image/png'; width: number; height: number }

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  try {
    client = new Anthropic();
  } catch (e) {
    throw new AnalyzeError(503, `vision service is not configured: ${e instanceof Error ? e.message : String(e)}`);
  }
  return client;
}

function effortFromEnv(): Effort {
  const v = (process.env.ANALYSIS_EFFORT ?? 'medium').toLowerCase();
  return v === 'low' || v === 'high' ? v : 'medium';
}

/** Stage 1 — one vision call, structured output validated against ObjectModelSchema. */
export async function analyzeKeyVisual(input: AnalyzeInput): Promise<VisionObjectModel> {
  const anthropic = getClient();
  const model = process.env.ANALYSIS_MODEL || DEFAULT_MODEL;
  let response;
  try {
    response = await anthropic.messages.parse({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.image } },
            { type: 'text', text: buildPrompt(input.width, input.height) },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ObjectModelSchema), effort: effortFromEnv() },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AnalyzeError(503, 'vision service rejected the server API key');
    if (e instanceof Anthropic.RateLimitError) throw new AnalyzeError(429, 'vision model rate limit reached');
    if (e instanceof Anthropic.APIConnectionError) throw new AnalyzeError(502, 'could not reach the vision model');
    if (e instanceof Anthropic.APIError) throw new AnalyzeError(502, `vision model error (${e.status}): ${e.message}`);
    if (e instanceof Error && /authentication method|api ?key/i.test(e.message)) {
      throw new AnalyzeError(503, 'vision service is not configured on the server (set ANTHROPIC_API_KEY)');
    }
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new AnalyzeError(422, 'the vision model declined to analyze this image');
  if (response.stop_reason === 'max_tokens') throw new AnalyzeError(502, 'vision model output was truncated');
  if (!response.parsed_output) throw new AnalyzeError(502, 'vision model returned no parseable object model');
  return response.parsed_output;
}
