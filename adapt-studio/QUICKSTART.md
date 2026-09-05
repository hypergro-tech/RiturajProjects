# Quick start — run Adapt Studio on your machine

## 1. Prerequisites

- Node.js 20 or newer (`node -v`). Get it at https://nodejs.org.
- A vision provider for analysing real files (the demo master runs without one):
  - **Claude API**: an `ANTHROPIC_API_KEY`, or
  - **Claude on Vertex AI**: a Google service-account JSON key with the *Vertex AI User* role in a project
    where Claude models are enabled.

## 2. Configure

```bash
cd adapt-studio
cp .env.example .env
```

Then edit `.env`. One of:

```env
# Claude API
ANTHROPIC_API_KEY=sk-ant-...
```

```env
# Claude on Vertex AI
CLAUDE_PROVIDER=vertex
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
VERTEX_REGION=global
```

Optional: `ANALYSIS_MODEL` (default `claude-opus-5`), `ANALYSIS_EFFORT` (`low|medium|high`), `PORT` (8787).

## 3. Start

### Option A — one command

```bash
./start.sh            # builds, then serves http://localhost:8787
```

Other modes: `./start.sh dev` (hot reload on http://localhost:5173), `./start.sh check` (one live vision
call, prints the object model), `./start.sh test` (unit tests + headless end-to-end run).

### Option B — npm directly (also works on Windows)

```bash
npm install
npm run build
npm start             # http://localhost:8787
```

### Option C — Docker

```bash
docker compose up --build      # http://localhost:8787
```

For Vertex AI in Docker, copy the key to `adapt-studio/secrets/sa.json` (the folder is gitignored) and
uncomment the two Vertex lines in `docker-compose.yml`.

## 4. Verify

- Open http://localhost:8787 — the upload screen shows an amber banner if no vision provider is configured.
- http://localhost:8787/api/health reports `{ provider, model, configured }`.
- `./start.sh check` (or `node scripts/smoke-vision.mjs`) runs one real vision call and prints the tagged
  object model. A `503` naming the model means Claude is not enabled for that project or region.

## 5. Use it

1. Drop a `.ai` (saved with PDF compatibility) or `.pdf` key visual, or click **Use demo master**.
2. Multi-artboard files show a picker; choose the artboard to adapt.
3. Review the tagged object model (every text element shows where its text and font came from).
4. Pick target sizes (strategy badges are computed before generation) or add custom ones.
5. Generate. Each card shows the strategy, escalations, QA gates and status; blocked sizes say why.
6. Download individual PNGs or **Download all (ZIP)**. Review-required outputs are for a human to approve.

## Troubleshooting

- **"Vision pass failed: vision service is not configured"** — `.env` has neither `ANTHROPIC_API_KEY` nor a
  Vertex key path, or the server was started before `.env` existed. Restart after editing `.env`.
- **"vision model rate limit reached"** — the server allows 15 vision calls per minute per client
  (`VISION_RATE_LIMIT_PER_MIN`).
- **A `.ai` file is rejected** — re-save it in Illustrator with *Create PDF Compatible File* checked.
- **Rebuilt text looks different from the master** — the analysis screen names the face used per element.
  Embedded PDF fonts are reused as-is; otherwise the same family is used if it is a shipped web font
  (Figtree, Merriweather, Lato), else the brand face for that element type.
