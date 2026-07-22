/**
 * PropPolish — central configuration.
 *
 * Everything a re-brander or cost-tuner would want to change lives here.
 */
import type { TwilightSky } from "./prompts";

// ---------------------------------------------------------------------------
// Branding — change this one constant to rebrand the whole app.
// ---------------------------------------------------------------------------
export const APP_NAME = "PropPolish";
export const APP_TAGLINE = "Declutter and finish your listing photos with AI.";

// ---------------------------------------------------------------------------
// Providers — the "Enhance" tab lets the user pick which model edits the photo.
// ---------------------------------------------------------------------------
export type Provider = "fal" | "openai";

// ---------------------------------------------------------------------------
// Model. (FAL / Nano Banana Pro — the "Nano Banana" option on both tabs)
//
// Base model: `fal-ai/nano-banana-pro/edit`
// - $0.15 per image at the "2K" resolution tier (MAX_EDGE 2048, default)
// - $0.30 per image at the "4K" resolution tier (MAX_EDGE 4096)
// A cheaper / weaker swap is `fal-ai/nano-banana-2/edit` (~$0.08 per image).
// Change FAL_MODEL to swap models. Retries cost the same as a first generation.
// ---------------------------------------------------------------------------
export const FAL_MODEL = "fal-ai/nano-banana-pro/edit";

// The FAL sync endpoint. The model id is appended at request time.
export const FAL_BASE_URL = "https://fal.run";

// ---------------------------------------------------------------------------
// OpenAI (ChatGPT) — the Enhance tab's other model option.
//
// gpt-image-2 is OpenAI's current image model (mid-2026), supporting native
// output up to 3840x2160 ("4K"). Its predecessor gpt-image-1 caps out at
// 1536px on the long edge and is being retired by OpenAI on 23 Oct 2026, so
// this app targets gpt-image-2 directly. Cost is metered per-token by OpenAI
// (varies with resolution/quality) rather than a flat per-image rate.
// ---------------------------------------------------------------------------
export const OPENAI_MODEL = "gpt-image-2";
export const OPENAI_QUALITY: "low" | "medium" | "high" = "high";

// ---------------------------------------------------------------------------
// OpenAI vision (chat completions) — powers "Import from scan" on the Floor
// Plan tool. This is a text+vision model, NOT an image generator: it reads a
// CubiCasa export (and optionally a drone photo) and transcribes room labels
// and printed dimensions, plus a rough starting layout. gpt-5.6-terra is a
// mid-tier model (cheaper than the flagship Sol) — plenty for reading crisp,
// computer-generated floor-plan text; bump to "gpt-5.6-sol" if it ever
// struggles with a messier scan. Priced per-token by OpenAI, a few cents per
// scan at most.
// ---------------------------------------------------------------------------
export const OPENAI_VISION_MODEL = "gpt-5.6-terra";

// ---------------------------------------------------------------------------
// Resolution / cost.
//
// Client-side downscaling resizes every upload so its LONGEST edge is <= MAX_EDGE
// BEFORE it ever leaves the browser. This dodges Vercel's ~4.5MB serverless body
// limit and keeps us inside the model's input cap.
//
// MAX_EDGE = 2048 -> request the "2K" tier -> $0.15 / image (default)
// MAX_EDGE = 4096 -> request the "4K" tier -> $0.30 / image
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

/**
 * Human-readable cost hint for the OpenAI (ChatGPT) provider. OpenAI bills
 * gpt-image-2 per-token rather than a flat per-image rate, so this is an
 * approximate range rather than an exact figure.
 */
export const OPENAI_COST_HINT = "~$0.10–$0.30/generation (OpenAI, varies by image)";

// ---------------------------------------------------------------------------
// Twilight tab — sky reference images.
//
// These live as static files in /public/skies/ so the server can turn them
// into an absolute URL (FAL fetches images by URL, not by relative path).
// The default is "orange"; the UI's "Change sky to purple" toggle switches it.
// ---------------------------------------------------------------------------
export const TWILIGHT_SKIES: Record<TwilightSky, string> = {
  orange: "/skies/sunset-orange.jpg",
  purple: "/skies/twilight-purple.jpg",
};

// Accepted upload types. HEIC is intentionally unsupported in v1 (browsers can't
// decode it to a canvas reliably) — surfaced to the user on the upload page.
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
