/**
 * PropPolish — central configuration.
 *
 * Everything a re-brander or cost-tuner would want to change lives here.
 */

// ---------------------------------------------------------------------------
// Branding — change this one constant to rebrand the whole app.
// ---------------------------------------------------------------------------
export const APP_NAME = "PropPolish";
export const APP_TAGLINE = "Declutter and finish your listing photos with AI.";

// ---------------------------------------------------------------------------
// Model.
//
// Base model: `fal-ai/nano-banana-pro/edit`
//   - $0.15 per image at the "2K" resolution tier (MAX_EDGE 2048, default)
//   - $0.30 per image at the "4K" resolution tier (MAX_EDGE 4096)
// A cheaper / weaker swap is `fal-ai/nano-banana-2/edit` (~$0.08 per image).
// Change FAL_MODEL to swap models. Retries cost the same as a first generation.
// ---------------------------------------------------------------------------
export const FAL_MODEL = "fal-ai/nano-banana-pro/edit";

// The FAL sync endpoint. The model id is appended at request time.
export const FAL_BASE_URL = "https://fal.run";

// ---------------------------------------------------------------------------
// Resolution / cost.
//
// Client-side downscaling resizes every upload so its LONGEST edge is <= MAX_EDGE
// BEFORE it ever leaves the browser. This dodges Vercel's ~4.5MB serverless body
// limit and keeps us inside the model's input cap.
//
//   MAX_EDGE = 2048  -> request the "2K" tier  -> $0.15 / image  (default)
//   MAX_EDGE = 4096  -> request the "4K" tier  -> $0.30 / image
// ---------------------------------------------------------------------------
export const MAX_EDGE = 4096;

// JPEG quality used when re-encoding the downscaled image (0-1).
export const JPEG_QUALITY = 0.9;

/** Map MAX_EDGE to the FAL resolution enum. */
export function resolutionTier(): "2K" | "4K" {
  return MAX_EDGE > 2048 ? "4K" : "2K";
}

/** Estimated USD cost of a single generation (or retry) at the current tier. */
export function costPerImage(): number {
  return resolutionTier() === "4K" ? 0.3 : 0.15;
}

/** Human-readable per-image cost hint, e.g. "~$0.15/generation". */
export const COST_HINT = `~$${costPerImage().toFixed(2)}/generation`;

// Accepted upload types. HEIC is intentionally unsupported in v1 (browsers can't
// decode it to a canvas reliably) — surfaced to the user on the upload page.
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
