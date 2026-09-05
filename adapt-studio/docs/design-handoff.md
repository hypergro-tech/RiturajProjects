# Handoff: Adapt Studio — Federal Bank creative resize tool

## Overview
Adapt Studio takes one master key visual (.ai/.pdf) and produces on-brand adapts at many target sizes. Each size is routed through one of four strategies (Scale / Smart Crop / Expand / Recompose) chosen by ratio math, executed against a tagged object model produced by an AI vision pass, and scored by automated QA gates with a BFSI compliance layer (human review on every adapt). The disclaimer is kept wherever it fits legibly and dropped otherwise; it does not block a size (client instruction, Sep 2026 — supersedes Stage 5 items 1–2 of the spec).

Primary users: Federal Bank marketing team and ops/production. Desktop web app.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate this in the target codebase's environment** (or choose an appropriate stack if none exists: a React front end + a job-based backend is the natural shape). That said, `Adapt Studio.dc.html` contains a genuinely working client-side implementation of the full pipeline logic — router, crop solver, expand placement, recompose templates, QA gates — which should be ported, not reinvented.

**`adapt-studio-logic-spec.md` is the authoritative specification.** Read it first; it defines every stage (ingest → analysis → router → execution → safe zones → compliance → QA → output). The prototype implements it with the deviations listed below.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interaction states in the prototype are final intent. Recreate the UI pixel-perfectly.

## Prototype implementation decisions (port these)
Decisions made where the spec left room, all validated in the prototype:

1. **Font-size estimation**: never trust the vision model's absolute px estimates — they drift with preview scale. Ask the model for `lines` (line count per text element) and derive `fontPx = (box.h × rasterH / lines) × 0.78`, clamped to `[boxH × 0.12, boxH × 1.05]`.
2. **Background color for recompose/expand fill**: always corner-sample the actual raster (4 corners, 4×4 px average), never the vision model's hex — patches must sit on an invisible background.
3. **Patch cropping**: pad the vision element boxes 4% per side before cutting patches (vision boxes are glyph-tight and slice letterforms otherwise). Contrast sampling pads 30% so both fg and bg luminances are present (percentiles p04/p96 of relative luminance).
4. **Display-banner safe zone**: interpreted as content ≥8px from every edge (per the spec's "logo ≥8px from any edge") + layout whitespace via padding; the % margin table applies to social formats.
5. **SCALE has no safe-zone feasibility test** (spec: "uniform resize, no changes") — only the min-font post-check. A cover-fit crop that would cut a mustKeep element escalates to SMART_CROP.
6. **Recompose layouts and QA gates share the same inset constants** — the layout is built against exactly the margins the gate checks, so a rebuilt output can't fail its own geometry.
7. **Stage 6 enforced literally**: any failed automated gate withholds the download ("Export blocked — failed QA gates"). No output ever shows red gates next to a download button.
8. **Client vertical = BFSI** → `regulated` is always true (spec Stage 5 trigger), shown as "disclaimer detected" vs "BFSI vertical default".
9. **Escalation chain**: SCALE→SMART_CROP→EXPAND→RECOMPOSE→BLOCK, each escalation recorded and shown to the user on the result card ("↳ Expand: legal renders at 15px, below its 18px floor").
10. **Rebuilds are a layout-system problem, not an image-resize problem** (client direction). The engine derives the master's system — alignment, type-scale ratios, gap after each block, message-block position, text-column width, CTA pill proportions, logo-to-headline ratio — and solves one headline size so the stack fills the target canvas; every other size follows the ratios, gaps compress or expand, the logo anchors top and the legal line bottom. Candidates are ranked so the full message at a smaller size beats a bigger headline that says less; copy is cut (short form, body dropped) only under real pressure. Lines are balanced (no lone last word, sentence ends at line ends).
11. **Text-only masters never crop or expand.** When every element is re-settable text or a logo on a flat field, SMART_CROP and EXPAND would only push copy to the edge or leave an island in new canvas, so those sizes rebuild on the layout system instead (marked "· layout" on the Sizes screen). Photo masters keep the ratio bands, and their crop window keeps droppable copy inside the safe zone too.

## What the prototype cannot do (production backlog)
These are browser limitations, not design intent — production must add:

- **Server-side chunked upload** for >100 MB files (spec Stage 0). Prototype parses in-browser via PDF.js.
- **True generative outpainting** for EXPAND (image model call, ≤1024px per pass, stored pixel mask). Prototype does edge-sampled extension, valid only for flat/gradient backgrounds — the masks and review routing are already correct.
- **Text re-setting in RECOMPOSE**: prototype re-lays out raster patches, so text cannot rewrap and short-form headline/CTA variants are impossible. Production should extract/re-set text with brand fonts. This is the single biggest quality gap.
- **Native .ai parsing** (non-PDF-compatible saves) and multi-artboard selection (prototype uses page 1).
- **Persistence & review**: jobs, human review queue with approve/reject, audit trail, and Stage 7 instrumentation (% auto-shipped, per-strategy edit rate, weekly brand-violation audit).
- **Tests** around router thresholds and QA gates so the delta thresholds (0.14 / 0.45 / 0.90) can be tuned against real edit-rate data.

## Screens / Views

App shell (all screens): 60px brand-blue (#004BBE) header bar, 28px horizontal padding — white Federal Bank wordmark image (30px tall), 1px divider (white 30%), "Adapt Studio" (Figtree 600, 16px, white), right-aligned stepper of 5 pills (Master · Analysis · Sizes · Generate · Adapts; active = white pill w/ blue text, inactive = white 12% bg, white 65% text, 12.5px/600). Page background #EEF2F9, ink #10233F, secondary #5A6B85, borders #DCE4F0. Cards: white, 1px border, 14px radius.

### 1. Upload
Centered column: blue F-monogram (58px), "One master. Every format." (34px/800, −0.02em), explainer (16px, #5A6B85, max 540px). Dropzone: 580px white card, 2px dashed #B9C8E4, 16px radius — drag-and-drop + "Browse files" primary button (blue bg, white text, 8px radius). Accepts .ai/.pdf only; rejection and parse errors render as red (#B4231F) 13.5px/600 text inside the dropzone. "or" divider, then outlined secondary button "Use demo master — FedOne Personal Loan (1080×1080)".

### 2. Analyzing (transient)
Centered spinner (42px ring, blue top arc, 0.9s), filename (16px/600), 4-step checklist (Parsing artboard → Rasterizing working preview (2000px long edge) → Vision pass — Claude tagging elements & background → Object model ready); done = green ✓, active = blue ●, pending = grey ○.

### 3. Analysis
Two columns (max 1240px). Left card: "MASTER · {W×H pt} · ratio {R}" label (13px/600 #5A6B85), master preview image ≤430px, 6px radius. Right column: **Tagged object model** card — one row per element: priority circle (22px; colors: 1 #004BBE, 2 #1A5FD0, 3 #FF9C00/dark text, 4 #B4231F, 5 #7A8AA6, 6 #C3CEE0), type (13.5px/700, capitalized), description (13px #5A6B85), "min {n}px" tag, "must keep"/"droppable" pill (blue tint / grey tint). Hovering a row draws a dashed #FF9C00 outline + 12% orange fill over that element's box on the master preview. Below: **Background** card (description, complexity, extendability + directions) and **Regulated** card (navy #0A2E6E bg, orange #FF9C00 heading "REGULATED · …BFSI (RBI — lending)", white body: disclaimer kept where it fits legibly, dropped where it cannot, all adapts to human review). "Choose sizes →" primary button bottom-right.

### 4. Sizes
"Target sizes" (22px/800) + subhead showing the router formula with the real master ratio. Grid of tiles (auto-fill, min 205px): aspect-shape thumbnail on #EDF2FA, name (14px/700), dims in monospace (12.5px #5A6B85), checkbox (20px, blue when selected; selected tile gets 2px blue border), strategy badge pill (SCALE green #E3F4E8/#167A3D · SMART CROP blue #E3ECFB/#004BBE · EXPAND amber #FFF0DB/#8A5A00 · REBUILD orange #FDEBD7/#B4530A) + "Δ 0.58" / "skinny" in monospace 11.5px. Badges are computed live from Stage 2 math **before** generation. Footer row: custom W×H inputs + Add, "{n} selected", "Generate adapts →".

Default sizes: 300×250, 728×90, 320×50, 160×600, 300×600, 1080×1080, 1080×1350, 1080×1920, 1200×628 (last four flagged social).

### 5. Generating (transient)
One row per size: name+dims, 5px progress bar (blue; red if blocked), right-aligned phase text (Queued → Routing — Δ n.nn → strategy verb → QA gates → final status). Rows process sequentially; phases reflect real pipeline work.

### 6. Results
Toolbar: "Adapts" (22px/800), summary "{n} sizes · {a} QA-clean · {b} need review · {c} blocked", right group (never wraps): "Safe zones + masks" toggle switch (34×20px), "Download all" primary, "Start over" text link. Grid of cards (min 300px):
- Preview area 232px tall on a diagonal-stripe grey field; adapt shown at fit scale with drop shadow; click opens a zoom modal. Overlay toggle draws: green 30% rects over extended/generated pixels (the review mask) + orange 30% borders for the safe-zone margins.
- Meta: name, dims (mono), strategy badge; optional amber escalation note ("↳ …"); QA gate chips (Safe zone / Min font / Contrast n.n:1 / Logo / Legal legible / weight "{size} ≤ 150KB") — green ✓ tint or red ✕ tint; one-line change summary (12.5px #5A6B85); status pill + "Download PNG · 34KB" outlined button.
- Status pills: "QA passed · compliance review (BFSI)" (blue tint) · "Review required — extended pixels" / "Rebuilt — review required" (amber) · "Export blocked — cannot fit" / "Export blocked — failed QA gates" (red, no download).
- Blocked cards show the reason in a red tinted box instead of a preview: "This size cannot carry the logo and headline legibly. Requires manual layout or size exclusion." (A size is never blocked for the disclaimer: it is dropped instead and the card's change summary says so.)

### 7. Zoom modal
Dimmed backdrop (rgba(6,18,44,0.62)), white 16px-radius card: name + dims header, adapt at up to 880×540 (≤1.5× upscale), same overlay behavior. Click anywhere closes.

## Interactions & Behavior
- Upload: drag-over prevented default; drop or file-pick → extension check (.ai/.pdf) → ingest; all failures are inline red text with a specific reason (e.g. ".ai must be re-saved with 'Create PDF Compatible File'").
- Vision failure on a real file: honest error + retry hint (rate limit 15 calls/min). Demo master falls back to a precomputed object model with an amber note saying so.
- Size tiles toggle on click; custom sizes validate 50–4000px.
- Overlay toggle is global (grid + modal).
- Download: real rendered file (PNG; falls back to JPEG q0.85 when PNG exceeds the weight limit — button shows format + size). "Download all" staggers downloads 350ms apart.
- Start over revokes object URLs and resets all state.
- The tool never fakes success: every escalation, fallback, and block states exactly what happened.

## State Management
Single state machine: `upload → analyzing → analysis → sizes → generating → results` (+ modal index, overlay flag). Key state: master {canvas, rw, rh, ratio, dimsLabel}, model {elements[], background, regulated, notes}, selected size set, custom sizes, results[]. Pipeline is pure functions over (master, model, targetSize) — keep it that way; it's what makes the router/gates testable.

## Design Tokens
- Federal Blue #004BBE · Accent Orange #FF9C00 (CTA-exclusive in creatives) · Navy #003A8F / #0A2E6E
- Ink #10233F · Secondary #5A6B85 · Muted #8A97AC · Borders #DCE4F0 / #E3EAF5 · Page bg #EEF2F9 · Card #FFFFFF
- Status tints: green #E3F4E8/#167A3D · blue #E3ECFB/#004BBE · amber #FFF0DB/#8A5A00 · orange #FDEBD7/#B4530A · red #FDECEC/#B4231F
- Type: Figtree (Google Fonts) 400/500/600/700/800 + italics; dims/deltas in ui-monospace. Radii: cards 14px, buttons 7–8px, pills 999px.

## Assets
`assets/` (cropped from Federal Bank brand uploads; sourced from the client's brand book):
- wordmark-on-blue.png (white wordmark + orange underline), wordmark-on-white.png (blue on white)
- monogram-on-blue.png (white Fortuna wave F), monogram-on-white.png (blue). The orange-on-blue wave shipped with the
  handoff was removed from the demo master on the client's instruction (the brand book also keeps the wave away from the
  wordmark in general ads).

The full brand book PDF stays with the client project (`uploads/Federal Brand Book final.pdf` in the design project); consult it for clearspace and typography rules before production.

## Files
- `adapt-studio-logic-spec.md` — the authoritative pipeline specification (read first)
- `Adapt Studio.dc.html` — working hi-fi prototype; the logic class inside contains the portable implementations: `route()`, `safeMargins()`, `keepUnion()`, `computeAdapt()` (SCALE/SMART_CROP/EXPAND branches), `recompose()`, `runGates()`, `visionPass()` prompt + `normalizeModel()` calibration, `measureContrast()`, `sampleBgColor()`
- `assets/` — brand images the UI and demo master use
