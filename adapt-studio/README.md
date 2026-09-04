# Adapt Studio — Federal Bank creative resize tool

One master key visual (`.ai` saved with PDF compatibility, or `.pdf`) in, on-brand adapts at every target size out.
Each size is routed through one of four strategies (Scale / Smart Crop / Expand / Recompose) chosen by ratio math,
executed against a tagged object model produced by a vision pass, and scored by automated QA gates with a BFSI
compliance layer that can block export entirely. The tool never fakes success: every escalation, fallback and block
states exactly what happened.

`docs/adapt-studio-logic-spec.md` is the authoritative pipeline specification. `BRAND.md` lists the brand-book rules the
gates enforce and the ones queued for the production text re-set.

## Stack

- **Frontend** — Vite + React 19 + TypeScript. The whole pipeline runs in the browser on a rasterized working preview
  (pdf.js, ≤ 2000 px long edge); nothing leaves the browser except one ≤ 1024 px JPEG frame sent to the vision pass.
- **Backend** — a small Express server. `POST /api/analyze` calls Claude (`@anthropic-ai/sdk`, structured output validated
  with zod) and keeps the API key server-side; it rate-limits to 15 vision calls per minute per client and serves the
  built app in production.
- **Tests** — Vitest over the pure pipeline (router thresholds, safe zones, calibration, gates, escalation chain) and the
  server helpers. Playwright drives the built app through the demo flow and screenshots every screen.

## Run it

```bash
cd adapt-studio
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY
npm run dev                   # web on http://localhost:5173, API on :8787 (proxied under /api)
```

Without an API key the app still runs end to end: real files fail the vision pass with an honest error, and the demo master
falls back to its precomputed object model (an amber note says so).

```bash
npm test                      # unit tests
npm run build                 # tsc + vite build + server build
npm start                     # production: one process serving dist/ and /api on $PORT (default 8787)
npm run e2e                   # after build: headless demo flow, screenshots + results.json in e2e/screenshots/
```

Environment (`.env.example`): `ANTHROPIC_API_KEY`, `ANALYSIS_MODEL` (default `claude-opus-5`), `ANALYSIS_EFFORT`
(`low | medium | high`, default `medium`), `VISION_RATE_LIMIT_PER_MIN` (15), `TRUST_PROXY`, `PORT`.

A `Dockerfile` builds a single production image (`docker build -t adapt-studio . && docker run -p 8787:8787 --env-file .env adapt-studio`).

## How the code is laid out

```
src/pipeline/          pure functions over (master, model, target) — no React, no DOM except render/ingest
  router.ts            Stage 2: Δ = |ln(Rt/Rm)|, SKINNY override, 0.14 / 0.45 / 0.90 thresholds
  safeZones.ts         Stage 4: margin table, legalMin(), weight limits
  model.ts             Stage 1 calibration: normalizeModel(), deriveFontPx(), measureContrast(), sampleBgColor(), keepUnion()
  plan.ts              Stage 3 planner: SCALE → SMART_CROP → EXPAND → RECOMPOSE → BLOCK escalation, returns geometry only
  recompose.ts         Stage 3 RECOMPOSE templates (horizontal strip / vertical strip / compact) from raster patches
  gates.ts             Stage 6 automated gates (+ brand-book 20 px logo floor)
  render.ts            draws a plan onto a canvas (the only pixel-touching module)
  adapt.ts             per-size orchestrator: plan → render → encode (PNG, JPEG fallback) → gates → status
  ingest.ts vision.ts  Stage 0 pdf.js rasterization; Stage 1 call to /api/analyze
  demo.ts demoData.ts  the FedOne Personal Loan demo master + its precomputed model
src/state/useStudio.ts single state machine: upload → analyzing → analysis → sizes → generating → results
src/components/        one file per screen, plus ui.tsx (badges, gate chips, preview overlay)
server/                Express app, Anthropic call, zod schema + prompt, rate limiter
e2e/demo-flow.mjs      Playwright walkthrough of the demo
```

Every strategy is planned as pure geometry first (`planAdapt`) and only then rendered, so the router, escalation chain
and gates are unit-testable without a canvas. `runGates()` reads the same `keepRects` the planner produced, and the
recompose templates are laid out against exactly the insets the safe-zone gate checks.

## Decisions carried over from the prototype

1. Font size is derived from box height ÷ line count (`× 0.78`, clamped), never from the model's px estimate.
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

Two fixes on top of the prototype logic: recompose fit maths now use the padded patch size (the prototype measured the
unpadded box and drew the padded patch, so rebuilt headlines could overflow the safe zone by 8 %), and the legal floor
follows the output format (14 px display, 18 px-equivalent social) instead of a fixed 18 px, which had failed the
min-font gate on every display rebuild.

## What the demo shows, and why display sizes block

With the demo master, the social sizes come out clean or review-ready (1:1 scale, 4:5 smart crop, 9:16 expand,
1.91:1 rebuild). The five display sizes block: the 48-character disclaimer cannot fit a 300 px-wide canvas at 14 px on
one line, and a two-line headline forced to its 24 px floor overflows a 90 px strip. That is the honest output of a
recompose that re-lays out raster patches — text cannot rewrap or take a short-form variant.

## Production backlog (from the handoff, in priority order)

1. **Text re-setting in RECOMPOSE** — extract text (pdf.js `getTextContent()` gives strings, positions and fonts for
   PDF-compatible `.ai` files) and re-set it in the brand faces (Merriweather headlines, Lato body — see `BRAND.md`) so
   headlines can rewrap, legal can wrap to two lines, and short-form variants become possible. This unblocks the
   display sizes above and is the single biggest quality gap.
2. **Generative outpainting for EXPAND** — replace the edge-sampled extension in `render.ts` with an image-model call
   (≤ 1024 px per pass, one edge at a time); the masks and review routing are already in place.
3. **Server-side chunked upload** for files > 100 MB, native `.ai` parsing and multi-artboard selection.
4. **Persistence and review** — jobs, a human review queue with approve / reject, audit trail, and the Stage 7
   instrumentation (% auto-shipped, per-strategy edit rate, weekly brand-violation audit) that lets the router
   thresholds be tuned.
5. **CTA colour exclusivity gate** — needs the text re-set (or a colour-mask pass) to know where the accent is used.
