import { z } from 'zod';

/** Structured-output schema for the Stage 1 vision pass. Calibration happens client-side in normalizeModel(). */
export const ObjectModelSchema = z.object({
  elements: z.array(
    z.object({
      type: z.enum(['logo', 'headline', 'subhead', 'body', 'cta', 'product', 'person', 'legal', 'decorative']),
      desc: z.string().describe('Short description of the element'),
      box: z.object({
        x: z.number(), y: z.number(), w: z.number(), h: z.number(),
      }).describe('Tight bounding box as fractions (0..1) of image width / height'),
      mustKeep: z.boolean(),
      droppable: z.boolean(),
      minLegiblePx: z.number().describe('Minimum legible font size at output: headline 24, cta 16, legal 18, body/subhead 14; 0 for non-text'),
      lines: z.number().describe('Exact number of text lines inside the box; 0 for non-text'),
    }),
  ).describe('At most 10 elements'),
  background: z.object({
    desc: z.string(),
    extendable: z.boolean().describe('True only if the background near the edges is a flat colour, simple gradient or blur'),
    extendDirections: z.array(z.enum(['left', 'right', 'top', 'bottom'])),
    complexity: z.enum(['simple', 'moderate', 'complex']),
    color: z.string().describe('Dominant background colour as #rrggbb'),
  }),
  regulated: z.boolean().describe('True if any legal, disclaimer or financial-product text appears'),
  notes: z.string().describe('The single most important thing to protect when resizing'),
});

export type VisionObjectModel = z.infer<typeof ObjectModelSchema>;

export const SYSTEM_PROMPT =
  'You are the element-analysis stage of an automated ad-adaptation pipeline for a bank\'s marketing team. ' +
  'You inspect one advertisement key visual and return a tagged object model that downstream code uses to crop, extend or rebuild the layout at other sizes.';

export function buildPrompt(width: number, height: number): string {
  return [
    `Analyze this advertisement key visual for an automated resizing pipeline. The image is ${width}×${height}px at working resolution.`,
    'Tag every meaningful element (maximum 10) with a tight bounding box expressed as fractions of the image width and height.',
    'Rules:',
    '- lines: the exact number of text lines inside the box (0 for non-text). Font size is derived from box height ÷ lines, so be precise.',
    '- minLegiblePx: headline 24, cta 16, legal 18, body/subhead 14; 0 for non-text.',
    '- logo, headline and cta are mustKeep. legal is mustKeep when regulated. decorative elements are droppable.',
    '- regulated = true if any legal, disclaimer, T&C or financial-product text appears.',
    '- background.extendable only if the background near the edges is a flat colour, simple gradient or blur; list exactly which edges can be extended.',
    '- notes: the single most important thing to protect when resizing.',
  ].join('\n');
}
