/**
 * The Stage 1 vision prompt, shared by the server (structured output enforces the shape) and the
 * artifact build (the viewer's Claude returns JSON text, so the shape is spelled out in the prompt).
 * Keep this file dependency-free: it is compiled into both bundles.
 */

export const VISION_SYSTEM =
  'You are the element-analysis stage of an automated ad-adaptation pipeline for a bank\'s marketing team. ' +
  'You inspect one advertisement key visual and return a tagged object model that downstream code uses to crop, extend or rebuild the layout at other sizes.';

export const VISION_JSON_SHAPE =
  '{"elements":[{"type":"logo|headline|subhead|body|cta|product|person|legal|decorative","desc":"short description",' +
  '"box":{"x":0.0,"y":0.0,"w":0.0,"h":0.0},"mustKeep":true,"droppable":false,"minLegiblePx":14,"lines":1,' +
  '"text":"verbatim text or empty","shortForm":"2-4 word variant or empty"}],' +
  '"background":{"desc":"...","extendable":true,"extendDirections":["left","right","top","bottom"],"complexity":"simple|moderate|complex","color":"#rrggbb"},' +
  '"regulated":false,"notes":"single most important thing to protect"}';

export const VISION_RULES = [
  'Tag every meaningful element (maximum 10) with a tight bounding box expressed as fractions (0..1) of the image width and height.',
  '- lines: the exact number of text lines inside the box (0 for non-text). Font size is derived from box height ÷ lines, so be precise.',
  '- minLegiblePx: headline 24, cta 16, legal 18, body/subhead 14; 0 for non-text.',
  '- logo, headline and cta are mustKeep. legal is mustKeep when regulated. decorative elements are droppable.',
  '- regulated = true if any legal, disclaimer, T&C or financial-product text appears.',
  '- background.extendable only if the background near the edges is a flat colour, simple gradient or blur; list exactly which edges can be extended.',
  '- text: transcribe text elements verbatim (this is re-set at other sizes, so accuracy matters); shortForm: a 2–4 word variant for headline and cta.',
  '- notes: the single most important thing to protect when resizing.',
];

export function visionPrompt(width: number, height: number, opts: { jsonOnly: boolean }): string {
  const lines = [
    `Analyze this advertisement key visual for an automated resizing pipeline. The image is ${width}×${height}px at working resolution.`,
    ...VISION_RULES,
  ];
  if (opts.jsonOnly) {
    lines.unshift(VISION_SYSTEM);
    lines.push('Reply with only one JSON object, no prose and no code fence, matching exactly this shape:', VISION_JSON_SHAPE);
  }
  return lines.join('\n');
}
