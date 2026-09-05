import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import fs from 'node:fs';
import { buildPrompt, ObjectModelSchema, SYSTEM_PROMPT, type VisionObjectModel } from './schema.js';

export const DEFAULT_MODEL = 'claude-opus-5';
type Effort = 'low' | 'medium' | 'high';
export type Provider = 'anthropic' | 'vertex';

export class AnalyzeError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface AnalyzeInput { image: string; mediaType: 'image/jpeg' | 'image/png'; width: number; height: number }

/**
 * Which Claude endpoint to call. Explicit CLAUDE_PROVIDER wins; otherwise Vertex when only Google
 * credentials are present, else the first-party API.
 */
export function detectProvider(): Provider {
  const p = (process.env.CLAUDE_PROVIDER ?? '').toLowerCase();
  if (p === 'vertex' || p === 'anthropic') return p;
  if (!process.env.ANTHROPIC_API_KEY && (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.VERTEX_PROJECT_ID)) return 'vertex';
  return 'anthropic';
}

function vertexProject(): string {
  const explicit = process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.ANTHROPIC_VERTEX_PROJECT_ID;
  if (explicit) return explicit;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const j = JSON.parse(fs.readFileSync(credPath, 'utf8')) as { project_id?: string };
      if (j.project_id) return j.project_id;
    } catch { /* fall through */ }
  }
  return '';
}

export function isConfigured(): boolean {
  return detectProvider() === 'vertex'
    ? !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT)
    : !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function describeProvider(): string {
  return detectProvider() === 'vertex'
    ? `Claude on Vertex AI · project ${vertexProject() || '?'} · region ${process.env.VERTEX_REGION || 'global'}`
    : 'Claude API';
}

type Client = Anthropic | AnthropicVertex;
let client: Client | null = null;
function getClient(): Client {
  if (client) return client;
  try {
    if (detectProvider() === 'vertex') {
      const projectId = vertexProject();
      if (!projectId) throw new Error('set VERTEX_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS');
      client = new AnthropicVertex({ projectId, region: process.env.VERTEX_REGION || 'global' });
    } else {
      client = new Anthropic();
    }
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
    if (e instanceof Anthropic.AuthenticationError) throw new AnalyzeError(503, 'vision service rejected the server credentials');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AnalyzeError(503, `vision service credentials lack access to ${model}: ${e.message}`);
    if (e instanceof Anthropic.NotFoundError) throw new AnalyzeError(503, `vision model ${model} is not available on this endpoint: ${e.message}`);
    if (e instanceof Anthropic.RateLimitError) throw new AnalyzeError(429, 'vision model rate limit reached');
    if (e instanceof Anthropic.APIConnectionError) throw new AnalyzeError(502, 'could not reach the vision model');
    if (e instanceof Anthropic.APIError) throw new AnalyzeError(502, `vision model error (${e.status}): ${e.message}`);
    if (e instanceof Error && /authentication method|api ?key|default credentials|GOOGLE_APPLICATION_CREDENTIALS/i.test(e.message)) {
      throw new AnalyzeError(503, `vision service is not configured on the server (${detectProvider() === 'vertex' ? 'Google credentials' : 'ANTHROPIC_API_KEY'} missing or invalid)`);
    }
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new AnalyzeError(422, 'the vision model declined to analyze this image');
  if (response.stop_reason === 'max_tokens') throw new AnalyzeError(502, 'vision model output was truncated');
  if (!response.parsed_output) throw new AnalyzeError(502, 'vision model returned no parseable object model');
  return response.parsed_output;
}
