import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { analyzeKeyVisual, AnalyzeError, DEFAULT_MODEL, describeProvider, detectProvider, isConfigured } from './analyze.js';
import { RateLimiter } from './rateLimit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.PORT ?? 8787);
const RATE = Number(process.env.VISION_RATE_LIMIT_PER_MIN ?? 15);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.use(express.json({ limit: '20mb' }));

const limiter = new RateLimiter(RATE, 60_000);

const AnalyzeBody = z.object({
  image: z.string().min(100).max(12_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png']).default('image/jpeg'),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    model: process.env.ANALYSIS_MODEL || DEFAULT_MODEL,
    provider: describeProvider(),
    providerKind: detectProvider(),
    configured: isConfigured(),
    rateLimitPerMin: RATE,
  });
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  const wait = limiter.check(req.ip ?? 'unknown');
  if (wait > 0) {
    res.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
    res.status(429).json({ error: `rate limit is ${RATE} vision calls per minute — retry in ${Math.ceil(wait / 1000)}s` });
    return;
  }
  const parsed = AnalyzeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid analyze request: ' + parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') });
    return;
  }
  try {
    const model = await analyzeKeyVisual(parsed.data);
    res.json({ model });
  } catch (e) {
    if (e instanceof AnalyzeError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error('[analyze]', e);
    res.status(500).json({ error: 'vision pass failed unexpectedly' });
  }
});

// Production: serve the built SPA from dist/.
const dist = path.join(root, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) { res.status(404).json({ error: 'not found' }); return; }
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.use('/api', (_req: Request, res: Response) => { res.status(404).json({ error: 'not found' }); });
}

app.listen(PORT, () => {
  console.log(`[adapt-studio] api listening on http://localhost:${PORT} · ${describeProvider()} · model ${process.env.ANALYSIS_MODEL || DEFAULT_MODEL} · credentials ${isConfigured() ? 'present' : 'MISSING'}`);
});
