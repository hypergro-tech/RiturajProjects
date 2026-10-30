# BRIEF — 90s explainer (silent)

A 90-second, no-audio motion piece introducing **BRIEF** (the new name for AURA), built from the
Hypergro 2026 deck. The focus is the four moats (deck pp. 30–33), with the four verticals as the setup.

**Output:** `out/BRIEF-explainer-90s.mp4` — 1920×1080, 30 fps, H.264, no audio track.

| Time | Beat |
|---|---|
| 0–7s | Hook — "Every campaign starts with a brief. Then it waits on research / agencies / media buyers / telecallers." |
| 6–11s | Reveal — **BRIEF.** The agentic execution layer for brand growth. |
| 10–24s | One system, four verticals — Research · Creative · Media · Voice, closed by the feedback loop |
| 24–28s | Bridge — "Four verticals do the work. Four moats make it compound." |
| 28–40s | Moat 01 · Brand memory (p.30) |
| 40–52s | Moat 02 · Creative intelligence (p.31) |
| 52–65s | Moat 03 · Self-improving engine (p.32) |
| 65–79s | Moat 04 · Accumulated intelligence / switching cost (p.33) |
| 79–90s | Proof (10M+ creatives, ₹500Cr+ revenue impact) → end card "BRIEF — That’s all you need." |

## How it's made

Every frame is a pure function of time: `src/engine.js` is a tiny animation engine and `src/scenes.js` holds the
timeline and choreography. `render.cjs` serves `src/`, drives Chromium (Playwright) frame by frame, and pipes PNGs to
ffmpeg. Fonts (Inter Tight, Source Serif 4, JetBrains Mono — all OFL) are bundled in `src/fonts/` so renders are
deterministic. Colours are sampled from the deck (navy `#0A1F44`, gold `#B89241`).

```bash
node render.cjs                      # full video → out/BRIEF-explainer-90s.mp4 (~2–3 min on 4 cores)
node render.cjs --fps 60             # smoother 60 fps master
node render.cjs --still 12,34.5,61   # review frames → out/stills/
```

Preview in a browser by serving `src/` (e.g. `npx serve src`) and opening `index.html`:
space pauses, ←/→ seek 2s. Copy edits live in `src/scenes.js` (`PILLARS`, and each `moat(...)` block).
