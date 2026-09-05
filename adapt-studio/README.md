# Adapt Studio — Federal Bank creative resize tool

One master key visual (`.ai` saved with PDF compatibility, or `.pdf`) in, on-brand adapts at every target size out.
Each size is routed through one of four strategies (Scale / Smart Crop / Expand / Recompose) chosen by ratio math,
executed against a tagged object model produced by a vision pass, and scored by automated QA gates with a BFSI
compliance layer that can block export entirely. Rebuilt sizes re-set the real text (wrapped, sized to fit,
short-form under pressure) in the master's own fonts. The tool never fakes success: every escalation, fallback and
block states exactly what happened.

`docs/adapt-studio-logic-spec.md` is the authoritative pipeline specification. `BRAND.md` lists the brand-book rules
the gates enforce and the faces used when a master's font cannot be reproduced.

## Stack

- **Frontend** — Vite + React 19 + TypeScript. The whole pipeline runs in the browser on a rasterized working preview
  (pdf.js, ≤ 2000 px long edge). pdf.js also yields the PDF's text runs and registers its embedded fonts, so rebuilt
  sizes are set in the master's actual typefaces. Nothing leaves the browser except one ≤ 1024 px JPEG frame sent to
  the vision pass.
- **Backend** — a small Express server. `POST /api/analyze` calls Claude with structured output validated by zod,
  through either the first-party API (`@anthropic-ai/sdk`) or Claude on Vertex AI (`@anthropic-ai/vertex-sdk`,
  Google service-account credentials). Credentials stay server-side; 15 vision calls per minute per client; serves the
  built app in production.
- **Tests** — 67 Vitest cases over the pure pipeline (router thresholds, safe zones, calibration, text grouping, font
  resolution, wrap/fit, gates, escalation chain) and the server (schema, rate limiter, a mocked-SDK test of the vision
  call for both providers). Playwright drives the built app through the demo master and a generated two-artboard PDF.

## Run it

```bash
cd adapt-studio
npm install
cp .env.example .env          # ANTHROPIC_API_KEY, or the Vertex block (GOOGLE_APPLICATION_CREDENTIALS + CLAUDE_PROVIDER=vertex)
npm run dev                   # web on http://localhost:5173, API on :8787 (proxied under /api)
```

```bash
node scripts/smoke-vision.mjs [image]   # after build: one real vision call, prints the object model (ops check)
npm test                                # unit tests
npm run build                           # tsc + vite build + server build
npm start                               # production: one process serving dist/ and /api on $PORT (default 8787)
npm run e2e                             # after build: headless demo + real-PDF flows, screenshots in e2e/screenshots/
E2E_OFFLINE=1 npm run e2e               # same, with credentials stripped (exercises the fallback paths)
```

Without a vision provider the app still runs: the upload screen says so, real files stop at analysis with an honest
error, and the demo master falls back to its precomputed object model (an amber note says so).

Environment (`.env.example`): `ANTHROPIC_API_KEY` **or** `CLAUDE_PROVIDER=vertex` + `GOOGLE_APPLICATION_CREDENTIALS`
(+ optional `VERTEX_PROJECT_ID`, `VERTEX_REGION`, default `global`); `ANALYSIS_MODEL` (default `claude-opus-5`),
`ANALYSIS_EFFORT` (`low | medium | high`, default `medium`), `VISION_RATE_LIMIT_PER_MIN` (15), `TRUST_PROXY`, `PORT`.
`GET /api/health` reports the provider and whether credentials are present.

A `Dockerfile` builds a single production image
(`docker build -t adapt-studio . && docker run -p 8787:8787 --env-file .env -v /secure/sa.json:/secrets/sa.json adapt-studio`).

## How the code is laid out

```
src/pipeline/          pure functions over (master, model, target) — DOM only in render / ingest / fonts
  router.ts            Stage 2: Δ = |ln(Rt/Rm)|, SKINNY override, 0.14 / 0.45 / 0.90 thresholds
  safeZones.ts         Stage 4: margin table, legalMin(), weight limits
  model.ts             Stage 1 calibration: normalizeModel(), deriveFontPx(), measureContrast(), sampleBgColor(), keepUnion()
  text.ts              text specs: PDF runs → elements, colour sampling, font resolution (embedded → web → brand)
  plan.ts              Stage 3 planner: SCALE → SMART_CROP → EXPAND → RECOMPOSE → BLOCK escalation, geometry only
  recompose.ts         Stage 3 RECOMPOSE: wrap / fit / short-form text engine + strip / vertical / compact templates
  gates.ts             Stage 6 automated gates (+ brand-book 20 px logo floor)
  render.ts            draws a plan (patches, pills, text) onto a canvas — the only pixel-touching module
  adapt.ts             per-size orchestrator: plan → render → encode (PNG, JPEG fallback) → gates → status
  ingest.ts            Stage 0: open PDF, artboard thumbnails, rasterize + text runs + embedded fonts
  fonts.ts vision.ts   canvas text measurer, font loading; Stage 1 call to /api/analyze
  demo.ts demoData.ts  the FedOne Personal Loan demo master + its object model and text specs
src/state/useStudio.ts single state machine: upload → analyzing → (artboards) → analysis → sizes → generating → results
src/components/        one file per screen, plus ui.tsx (badges, gate chips, preview overlay)
server/                Express app, provider-aware Claude call, zod schema + prompt, rate limiter
scripts/               copy-pdf-fonts (pdf.js standard fonts), smoke-vision (live provider check)
e2e/                   Playwright walkthrough + a hand-built two-artboard test PDF
```

Every strategy is planned as pure geometry first (`planAdapt`, with an injected text measurer) and only then
rendered, so the router, escalation chain, text fitting and gates are unit-testable without a canvas. `runGates()` reads
the same `keepRects` the planner produced, and the recompose templates are laid out against exactly the insets the
safe-zone gate checks.

## How rebuilt sizes get their text

1. **Content** — pdf.js `getTextContent()` runs are grouped into the vision model's element boxes (exact text and size).
   Outlined artwork has no text layer, so the vision pass also transcribes every text element (`text`) and proposes a
   2–4 word `shortForm` for the headline and CTA.
2. **Font** — the PDF's embedded face when pdf.js loaded it (the document is kept open for the session), else the same
   family as a shipped web font (Figtree, Merriweather, Lato), else the brand face for that element type. The analysis
   screen shows which one was used for every element.
3. **Colour** — text and background colours are sampled from the raster (median luminance = background, the contrasting
   extreme = text). A CTA whose box differs from the page colour is rebuilt as a pill.
4. **Layout** — each template reserves the legal line at its floor first (14 px display, 18 px-equivalent social; if it
   cannot fit, the size is blocked for compliance), then the CTA, then fits the headline as large as its area allows
   (short-form when the full line will not fit), then body copy if room remains, then keeps the product / decorative
   visual only in leftover space. Anything dropped is named on the card.

## Decisions carried over from the prototype

1. Font size is derived from box height ÷ line count (`× 0.78`, clamped), never from the model's px estimate, and is
   replaced by the exact PDF size when a text layer exists.
2. Background colour for expand / recompose fill is corner-sampled from the raster, never the model's hex.
3. Patches are cut with 4 % padding. Contrast is measured on the same 4 %-padded box: median luminance = background,
   p03 / p97 = text (the prototype's 30 % padding and p04 / p96 pulled the page colour into CTA pills and failed the
   demo at 3.6:1).
4. Display banners use an 8 px edge inset; the % margin table applies to social formats.
5. SCALE has no safe-zone feasibility test — only the min-font post-check; a cover-fit crop that would cut a
   protected element escalates to SMART_CROP.
6. Recompose layouts and QA gates share inset constants.
7. Any failed automated gate withholds the download.
8. The client vertical is BFSI, so `regulated` is always true; the UI shows whether a disclaimer was actually detected.
9. Escalations are recorded and shown on the result card.

Fixes on top of the prototype logic: recompose fit maths use the padded patch size; the legal floor follows the output
format (14 px display, 18 px-equivalent social) instead of a fixed 18 px; and elements with no readable text still fall
back to raster patches, which reproduces the prototype's behaviour exactly (covered by tests).

## What the demo shows

Eight of nine sizes export. The social sizes come out clean or review-ready (1:1 scale, 4:5 smart crop, 9:16 expand,
1.91:1 rebuild); the display sizes rebuild with wrapped legal, a pill CTA and a short-form headline where a strip is too
narrow. The 320×50 mobile banner blocks: a 48-character disclaimer cannot sit on one 14 px line in 296 px, which is
exactly the case the spec's "manual layout or size exclusion" message exists for.

## Backlog

1. **Generative outpainting for EXPAND** — replace the edge-sampled extension in `render.ts` with an image-model call
   (≤ 1024 px per pass, one edge at a time); the masks and review routing are already in place. Edge sampling is
   correct for flat and gradient fields, which is what the bank's key visuals use.
2. **Persistence and review** — jobs, a human review queue with approve / reject, audit trail, and the Stage 7
   instrumentation (% auto-shipped, per-strategy edit rate, weekly brand-violation audit) that lets the router
   thresholds be tuned.
3. **Server-side chunked upload** for files > 100 MB and native (non-PDF-compatible) `.ai` parsing.
4. **CTA colour exclusivity gate** — now feasible: the CTA pill colour is known, so a colour-mask pass over the output
   can assert it appears nowhere else.
