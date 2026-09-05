import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parse = vi.fn();
const vertexCtor = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { constructor(public status: number, message: string) { super(message); } }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends Error {}
  class Anthropic {
    messages = { parse };
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static RateLimitError = RateLimitError;
    static APIConnectionError = APIConnectionError;
  }
  return { default: Anthropic };
});
vi.mock('@anthropic-ai/vertex-sdk', () => ({
  AnthropicVertex: class { messages = { parse }; constructor(opts: unknown) { vertexCtor(opts); } },
}));
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: (schema: unknown) => ({ type: 'json_schema', schema }) }));

const GOOD = {
  elements: [{ type: 'logo', desc: 'wm', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 }, mustKeep: true, droppable: false, minLegiblePx: 0, lines: 0, text: '', shortForm: '' }],
  background: { desc: 'flat', extendable: true, extendDirections: ['left'], complexity: 'simple', color: '#004bbe' },
  regulated: true,
  notes: 'legal',
};
const input = { image: 'x'.repeat(200), mediaType: 'image/jpeg' as const, width: 2000, height: 2000 };

describe('analyzeKeyVisual()', () => {
  const env = { ...process.env };
  beforeEach(() => { vi.resetModules(); parse.mockReset(); vertexCtor.mockReset(); process.env = { ...env, ANTHROPIC_API_KEY: 'sk-test' }; delete process.env.CLAUDE_PROVIDER; delete process.env.GOOGLE_APPLICATION_CREDENTIALS; });
  afterEach(() => { process.env = env; });

  it('sends the image and the prompt with a structured-output format and returns the parsed model', async () => {
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: GOOD });
    const { analyzeKeyVisual } = await import('../analyze.js');
    const out = await analyzeKeyVisual(input);
    expect(out).toEqual(GOOD);
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe('claude-opus-5');
    expect(req.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(req.messages[0].content[1].text).toContain('2000×2000px');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.output_config.effort).toBe('medium');
  });

  it('honours ANALYSIS_MODEL and ANALYSIS_EFFORT', async () => {
    process.env.ANALYSIS_MODEL = 'claude-sonnet-5';
    process.env.ANALYSIS_EFFORT = 'high';
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: GOOD });
    const { analyzeKeyVisual } = await import('../analyze.js');
    await analyzeKeyVisual(input);
    expect(parse.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-5', output_config: { effort: 'high' } });
  });

  it('maps a refusal to 422 and an empty parse to 502', async () => {
    const { analyzeKeyVisual, AnalyzeError } = await import('../analyze.js');
    parse.mockResolvedValueOnce({ stop_reason: 'refusal', parsed_output: null });
    await expect(analyzeKeyVisual(input)).rejects.toMatchObject({ status: 422 });
    parse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: null });
    const err = await analyzeKeyVisual(input).catch((e) => e);
    expect(err).toBeInstanceOf(AnalyzeError);
    expect(err.status).toBe(502);
  });

  it('maps SDK errors to actionable statuses', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as Record<string, new (...a: never[]) => Error>;
    const { analyzeKeyVisual } = await import('../analyze.js');
    const cases: Array<[Error, number]> = [
      [new (Anthropic.AuthenticationError as new (s: number, m: string) => Error)(401, 'bad key'), 503],
      [new (Anthropic.RateLimitError as new (s: number, m: string) => Error)(429, 'slow down'), 429],
      [new (Anthropic.NotFoundError as new (s: number, m: string) => Error)(404, 'no model'), 503],
      [new (Anthropic.APIError as new (s: number, m: string) => Error)(500, 'boom'), 502],
      [new (Anthropic.APIConnectionError as new () => Error)(), 502],
      [new Error('Could not resolve authentication method. Expected one of apiKey ...'), 503],
      [new Error('Could not load the default credentials'), 503],
    ];
    for (const [thrown, status] of cases) {
      parse.mockRejectedValueOnce(thrown);
      await expect(analyzeKeyVisual(input), thrown.message).rejects.toMatchObject({ status });
    }
  });

  it('uses the Vertex client when only Google credentials are configured, reading the project from the key file', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'));
    const keyPath = path.join(dir, 'sa.json');
    fs.writeFileSync(keyPath, JSON.stringify({ type: 'service_account', project_id: 'demo-project' }));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    process.env.VERTEX_REGION = 'us-east5';
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: GOOD });
    const { analyzeKeyVisual, detectProvider, isConfigured } = await import('../analyze.js');
    expect(detectProvider()).toBe('vertex');
    expect(isConfigured()).toBe(true);
    await analyzeKeyVisual(input);
    expect(vertexCtor).toHaveBeenCalledWith({ projectId: 'demo-project', region: 'us-east5' });
  });
});
