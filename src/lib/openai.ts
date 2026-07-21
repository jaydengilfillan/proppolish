/**
 * Server-side OpenAI client for the "Enhance" tab's ChatGPT (gpt-image-2)
 * option. OPENAI_API_KEY is read from the environment here and is NEVER sent
 * to the browser. This module must only be imported from server code (the
 * /api/process route).
 */
import { OPENAI_MODEL, OPENAI_QUALITY } from "./config";

export class OpenAIImageError extends Error {
    status: number;
    constructor(status: number, message: string) {
          super(message);
          this.name = "OpenAIImageError";
          this.status = status;
    }
}

export interface OpenAIEditParams {
    prompt: string;
    /** Downscaled source image as a data URI (data:image/jpeg;base64,...). */
  imageDataUri: string;
    /** Original (pre-downscale) width/height, used to pick a matching output aspect ratio. */
  width?: number;
    height?: number;
}

/**
 * Call OpenAI's image edit endpoint (gpt-image-2) and return the output image
 * as a data URI. OpenAI returns base64 image bytes directly (b64_json), not a
 * hosted URL, so the caller gets back a `data:image/png;base64,...` string —
 * this is a valid value anywhere the app expects an image URL (fetch(), <img
 * src>, etc. all support data: URIs).
 *
 * POST https://api.openai.com/v1/images/edits (multipart/form-data)
 *   model, prompt, image[], size, quality
 * Response: { data: [{ b64_json }] }
 */
export async function openaiEdit(params: OpenAIEditParams): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
          throw new OpenAIImageError(
                  500,
                  "OPENAI_API_KEY is not set on the server. Add it to .env.local (local) or your Vercel project env vars."
                );
    }

  const imageBlob = dataUriToBlob(params.imageDataUri);
    const size = computeOpenAiSize(params.width, params.height);

  const form = new FormData();
    form.append("model", OPENAI_MODEL);
    form.append("prompt", params.prompt);
    form.append("quality", OPENAI_QUALITY);
    form.append("size", size);
    form.append("image", imageBlob, "input.jpg");

  let resp: Response;
    try {
          resp = await fetch("https://api.openai.com/v1/images/edits", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${key}` },
                  body: form,
          });
    } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          throw new OpenAIImageError(502, `Could not reach OpenAI: ${detail}`);
    }

  const text = await resp.text();

  if (!resp.ok) {
        let message = text;
        try {
                const parsed = JSON.parse(text);
                message = parsed?.error?.message || text;
        } catch {
                /* keep raw text */
        }
        throw new OpenAIImageError(resp.status, message || `OpenAI returned HTTP ${resp.status}`);
  }

  let json: unknown;
    try {
          json = JSON.parse(text);
    } catch {
          throw new OpenAIImageError(502, "OpenAI returned a non-JSON response.");
    }

  const b64 = extractB64(json);
    if (!b64) {
          throw new OpenAIImageError(502, "OpenAI response did not contain image data.");
    }
    return `data:image/png;base64,${b64}`;
}

function dataUriToBlob(dataUri: string): Blob {
    const match = /^data:(.+?);base64,(.*)$/.exec(dataUri);
    if (!match) throw new OpenAIImageError(400, "Invalid image data URI.");
    const mime = match[1];
    const buf = Buffer.from(match[2], "base64");
    return new Blob([buf], { type: mime });
}

/**
 * gpt-image-2 accepts a custom "WIDTHxHEIGHT" size string: both dimensions
 * must be multiples of 16, and the aspect ratio must be between 1:3 and 3:1.
 * The maximum supported resolution is 3840x2160. We fit the source photo's
 * aspect ratio into that box so the output is as high-resolution as the
 * model supports, regardless of how small the (downscaled) input was.
 */
function computeOpenAiSize(width?: number, height?: number): string {
    const BOX_W = 3840;
    const BOX_H = 2160;
    const aspect = width && height && height > 0 ? width / height : BOX_W / BOX_H;

  let w: number;
    let h: number;
    if (aspect >= BOX_W / BOX_H) {
          w = BOX_W;
          h = Math.round(BOX_W / aspect);
    } else {
          h = BOX_H;
          w = Math.round(BOX_H * aspect);
    }

  const roundTo16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
    w = roundTo16(w);
    h = roundTo16(h);

  // Clamp to the API's supported aspect-ratio range (1:3 – 3:1).
  if (w / h > 3) w = roundTo16(h * 3);
    if (h / w > 3) h = roundTo16(w * 3);

  return `${w}x${h}`;
}

function extractB64(json: unknown): string | null {
    if (!json || typeof json !== "object") return null;
    const data = (json as { data?: unknown }).data;
    if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          if (first && typeof first === "object") {
                  const b64 = (first as { b64_json?: unknown }).b64_json;
                  if (typeof b64 === "string" && b64.length > 0) return b64;
          }
    }
    return null;
}
