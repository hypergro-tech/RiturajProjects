# Federal Bank brand rules that Adapt Studio enforces

Extracted from `Federal Brand Book final.pdf` (printed page numbers; the PDF index is one higher).
The brand book is fully outlined, so these were read visually. Consult the book itself before
changing any rule below.

## Rules wired into the pipeline today

| Rule | Source | Where it lives |
|---|---|---|
| Wordmark never below **20 px tall** on digital (8 mm print) | p.20 | `LOGO_MIN_HEIGHT_PX` in `src/pipeline/gates.ts` (Logo gate) |
| Logo uncropped, inside the canvas | Stage 6 spec | Logo gate |
| Text contrast ≥ 4.5:1 | Stage 4 spec | Contrast gate (measured on the master raster) |
| Legal ≥ 14 px display / 18 px @1080 social | Stage 4 spec | `legalMin()` — also the escalation floor for the legal element |
| CTA accent colour exclusive to the CTA | Stage 4 spec, p.34 | Not measurable from raster patches yet — see backlog |

## Rules for the production text re-set (backlog)

- **Clearspace** on all four sides of the wordmark = height of the lowercase **"e"** in "Federal" (p.20).
  The layout margin in brand templates is **X = wordmark height**, equal on all sides; gutter = X/2 (p.67–68).
- **Logo placement**: primary usage is **top-right or bottom-left** only; hero usage may be larger and centred (p.21).
- **Wordmark colour by background** (p.18–19): Federal Blue bg → white wordmark + Golden Glow line;
  white / Soft Sand bg → Federal Blue wordmark + Golden Glow line; Golden Glow bg → Federal Blue wordmark + white line;
  dark photos → white + yellow line; mid/light photos → blue + yellow line. Greyscale line is only ever white or black.
- **Fortuna Wave (F insignia)** is a sign-off or a ghosted expressive graphic, never paired with the wordmark in general ads
  (p.27–28, 30). Lockups are for sponsorship panels / façades only (p.30).
- **Don'ts** (p.22, 29): no outline, no altered line thickness, no stacking the words, no drop shadow, never inside a box or
  shape, no textures or busy imagery behind, never stretched, squeezed, tilted or recoloured.
- **Typography** (p.40–43): headlines **Merriweather** (Semi-Bold in the hierarchy example; never body copy);
  subheads and body **Lato** (subhead Bold at 50 % of headline size, body Regular). Never both faces at the same size,
  no text shadows, no uppercase Lato body, no distortion. The tool's UI uses Figtree per the handoff; creatives must not.
- **Photography** (p.49): candid and natural — no posed eye contact, heavy retouching, studio-lit objects or flat vibrant backgrounds.

## Palette

| Name | Hex | Pantone | Notes |
|---|---|---|---|
| Federal Blue | `#004CBE` | 2728 C | The handoff UI token is `#004BBE`; creatives should use the book value |
| Golden Glow | `#FF9C00` | 137 C | Underline, F on blue, small accents; the CTA colour in the demo master |
| Midnight Blue | `#00265F` | 288 C | |
| Soft Sand | `#C3BAAE` | 406 C | |
| Pure White | `#FFFFFF` | 000 C | |

Secondary tints (p.35): blues `#3875CD #719DDC #A9C6EA #E1EEF9`; oranges `#FFB033 #FFC466 #FFD799 #FFEBCC`;
sands `#D0C8BB #DCD5C9 #E9E3D6 #F5F1E3`. Tertiary accents (p.36, infographics only):
`#9FBD7F #D0E6B7 #BCA4D5 #E6D3F4 #F2D589 #FEF2B5 #EBAFAC #FDDDD7`.

Not stated in the book: CTA button style, disclaimer/legal typography, minimum type sizes, Fortuna Wave minimum size or clearspace.
