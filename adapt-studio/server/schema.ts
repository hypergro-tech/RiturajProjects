import { z } from 'zod';
import { VISION_SYSTEM, visionPrompt } from './visionPrompt.js';

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
      text: z.string().describe('Verbatim text content for text elements, reading order, single spaces between words; empty string for non-text'),
      shortForm: z.string().describe('For headline and cta only: a 2–4 word variant that keeps the meaning, for very small formats; empty string otherwise'),
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

export const SYSTEM_PROMPT = VISION_SYSTEM;

/** The server enforces the shape with structured output, so the prompt carries only the rules. */
export function buildPrompt(width: number, height: number): string {
  return visionPrompt(width, height, { jsonOnly: false });
}
