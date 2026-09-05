# Adapt Studio — Resize Logic Specification
Input: one .ai key visual (PDF-compatible). Output: adapts at chosen dimensions.
This spec defines the full decision logic. Build the UI and pipeline around it exactly.

---

## STAGE 0 — Ingest

1. Accept `.ai` / `.pdf`, no file size cap. Reject other types with a clear
   message. Large files (>100 MB) upload via direct server-side/chunked upload,
   never base64-in-request; show upload progress. Analysis always runs on a
   rasterized preview, so source size never slows the AI passes.
2. Read artboard width `Wm`, height `Hm`. Compute master ratio `Rm = Wm / Hm`.
3. Rasterize a working preview (max 2000px long edge) for analysis.

---

## STAGE 1 — Element Analysis (runs once per file)

AI vision pass produces a **tagged object model**:

```json
{
  "aspectRatio": 1.0,
  "elements": [
    {
      "type": "logo|headline|subhead|body|cta|product|person|legal|decorative",
      "desc": "short description",
      "box": {"x": 0.04, "y": 0.05, "w": 0.18, "h": 0.08},   // % of canvas
      "priority": 1,          // see hierarchy below
      "mustKeep": true,
      "droppable": false,
      "minLegiblePx": 14      // for text elements
    }
  ],
  "background": {
    "desc": "…",
    "extendable": true,
    "extendDirections": ["left","right"],   // only simple regions: sky, gradient, blur
    "complexity": "simple|moderate|complex"
  },
  "regulated": false,          // true if legal/disclaimer text detected
  "notes": "single most important thing to protect"
}
```

**Priority hierarchy (fixed — drop from the bottom only):**
1. Logo (never dropped; may shrink to clearspace minimum)
2. Headline (may substitute short-form variant)
3. CTA (keep its accent color exclusive)
4. Legal/disclaimer (NON-droppable if `regulated: true` — see Stage 5)
5. Product/hero image (may crop to saliency box)
6. Decorative/background (first to drop)

---

## STAGE 2 — Strategy Router (runs per target size)

For target `Wt × Ht`, ratio `Rt = Wt / Ht`:

```
delta = abs(ln(Rt / Rm))

SKINNY override: if (Wt/Ht > 4) or (Ht/Wt > 4) or (Ht <= 120) or (Wt <= 180)
    → strategy = RECOMPOSE  (regardless of delta)

else if delta < 0.14        → SCALE      (~ratio match, e.g. 1:1 → 300×250 area)
else if delta < 0.45        → SMART_CROP (e.g. 1:1 ↔ 4:5 ↔ 1.91:1)
else if delta < 0.90        → EXPAND     (e.g. 1:1 → 16:9 or 9:16)
else                        → RECOMPOSE
```

Escalation rule: if SMART_CROP cannot fit all `mustKeep` elements inside the
target safe zone → escalate to EXPAND. If EXPAND can't (background not
extendable, or complexity = complex) → escalate to RECOMPOSE.

Ship thresholds conservatively; tune with real edit-rate data later.

---

## STAGE 3 — Strategy Execution

### SCALE
Uniform resize. No crop, no synthesis, no element changes.
Post-check: every text element ≥ its `minLegiblePx` at output size; if any
fails → escalate to RECOMPOSE (small sizes need bigger relative type).

### SMART_CROP
1. Compute the union box of all `mustKeep` elements = protected region.
2. Choose the crop window of ratio `Rt` that (a) fully contains the protected
   region inside the target's safe zone, (b) maximizes retained salient area.
3. If no valid window exists → escalate to EXPAND.
Never crop through a `mustKeep` box. Cropping pure background is fine.

### EXPAND (generative)
1. Keep original artwork pixels immutable; grow canvas to `Rt`.
2. Outpaint ONLY in `extendDirections`, one edge at a time, ≤1024px per pass.
3. Never synthesize over or adjacent-touching a `mustKeep` element.
4. Never invent product, UI, data, charts, faces, hands, or text.
5. Store a mask of generated pixels with the output (needed for review).
Route ALL expand outputs to human review.

### RECOMPOSE
1. Discard the flat layout. Work from the object model.
2. Pick the layout template by shape:
   - Horizontal strip (728×90, 970×250, 320×50): logo → headline → CTA,
     left to right. 320×50: logo + 2–4 word message + micro-CTA only.
   - Vertical strip (160×600, 300×600): headline top, visual middle, CTA bottom.
   - Compact rect (300×250): stacked hierarchy, generous margins.
3. Drop order under space pressure: decorative → product → (never below this
   line without human sign-off). Substitute short-form headline/CTA variants.
4. Simplify background to flat brand color or simple gradient if needed.
5. Flag output "REBUILT — review required" and list what changed.

---

## STAGE 4 — Safe Zone & Layout Constants

Margins as % of canvas (content must stay inside):

| Format | Top | Bottom | Left | Right |
|---|---|---|---|---|
| 9:16 universal (Reels/TikTok/Shorts) | 14% | 35% | 6% | 6% |
| 9:16 all-placement video (YouTube) | 15% | 35% | 4.4% | 17.8% |
| 1:1 (1080×1080) | 10% | 10% | 10% | 10% |
| 4:5 (1080×1350) | 10% | 10% | 9% | 9% |
| 1.91:1 (1200×628) | 9.5% | 9.5% | 10% | 10% |
| Display banners | 15–20% total whitespace; logo ≥8px from any edge |

Additional layout rules:
- Keep key content within the middle 80% horizontally on 9:16 (device crop).
- Logo: uncropped, clearspace respected, ≥100px from edges on social sizes.
- CTA accent color used nowhere else in the composition.
- Contrast ≥ 4.5:1 for all text (WCAG AA).

Minimum font sizes at output resolution:
- Display banners: body/legal ≥14px, subtext 14–16px, CTA 16–18px, headline ≥24px.
- Social: legal ≥18px equivalent at 1080-wide.

---

## STAGE 5 — Compliance Layer (BFSI / regulated)

> **Implementation note (client instruction, Sep 2026):** items 1–2 below are no longer enforced. The disclaimer is
> kept wherever it renders ≥ its floor and dropped where it cannot; no size is blocked for it. Only a size that
> cannot carry the logo and headline legibly is blocked.

Triggers when `regulated: true` OR client vertical = BFSI.

1. Legal element is NON-droppable at every size.
2. If legal text cannot render ≥ its `minLegiblePx` at the target size →
   **BLOCK export** for that size and show: "This size cannot carry the
   mandatory disclaimer legibly. Requires manual layout or size exclusion."
3. Never let generative expand synthesize anything resembling product, money,
   cards, charts, rates, or documents.
4. Jurisdiction rules table (maintain with legal; examples):
   - SEBI (IN, mutual funds): exact standard risk warning, verbatim; AV ads:
     ≥5 seconds on screen, ≥80% screen coverage.
   - IRDAI (IN, insurance): product identified as insurance + reference number;
     no illegible text.
   - RBI (IN, lending): KFS / APR disclosure upfront.
5. Every regulated adapt → human review, no exceptions.

---

## STAGE 6 — QA Gates

**Automated (BLOCK on fail):**
- [ ] All elements inside target safe zone
- [ ] All text ≥ minimum font size
- [ ] Contrast ≥ 4.5:1
- [ ] Logo present, uncropped, clearspace OK
- [ ] Legal present + legible (if regulated)
- [ ] File weight: ≤150KB static display / ≤200KB HTML5 / ≤5MB social image
- [ ] Text <20% of image area (Google image assets)

**Route to HUMAN REVIEW:**
- Any EXPAND output (check seams + invented content via pixel mask)
- Any RECOMPOSE output
- Any regulated asset
- Low-confidence analysis (multiple competing subjects, text baked into imagery)

**Auto-ship allowed:** SCALE, and SMART_CROP that passed all automated gates.

---

## STAGE 7 — Output & Defaults

- Default pre-selected sizes on upload: the "core 5" display
  (300×250, 728×90, 320×50, 160×600, 300×600) + 1:1, 4:5, 9:16, 1.91:1.
- Each result row shows: dimensions, strategy badge (Scale / Crop / Expand /
  Rebuilt), pass/fail on QA gates, one-line change summary, download link.
- Recompose + Expand rows carry an orange "review required" state; they are
  not marked "done" until a human approves.
- Instrument: % auto-shipped without edit, per-strategy edit rate,
  brand-violation escape rate (weekly 20-asset audit). Loosen router
  thresholds only when escape rate stays <5%.

---

## UI implications for Claude Design

- Show the element map as chips after upload (protected = highlighted).
- Show the strategy badge on each size tile BEFORE generation (from Stage 2 math).
- Safe-zone overlay toggle on every output preview.
- Blocked sizes render with the compliance message, not as errors.
- The tool never fakes success: failed steps state exactly what failed.
