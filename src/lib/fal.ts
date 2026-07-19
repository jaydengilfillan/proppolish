/**
 * Server-side FAL client. The FAL_KEY is read from the environment here and is
 * NEVER sent to the browser. This module must only be imported from server code
 * (the /api/process route).
 */
import { FAL_BASE_URL, FAL_MODEL } from "./config";

export class FalError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FalError";
    this.status = status;
  }
}

export interface FalEditParams {
  prompt: string;
  /** Downscaled source image as a data URI (data:image/jpeg;base64,...). */
  imageDataUri: string;
  /** FAL resolution tier — "2K" or "4K". */
  resolution: "2K" | "4K";
  /** Optional override of the model id. Defaults to config FAL_MODEL. */
  model?: string;
}

/**
 * Call the FAL Nano Banana Pro edit endpoint and return the output image URL.
 *
 * Request shape (verified against the model schema + reference client):
 *   POST https://fal.run/{model}
 *   Authorization: Key ${FAL_KEY}
 *   { prompt, image_urls: [<data uri>], resolution, num_images: 1 }
 * The output image URL lives at response.images[0].url.
 */
export async function falEdit(params: FalEditParams): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new FalError(
      500,
      "FAL_KEY is not set on the server. Add it to .env.local (local) or your Vercel project env vars."
    );
  }

  const model = params.model ?? FAL_MODEL;
  const url = `${FAL_BASE_URL}/${model}`;

  const body = {
    prompt: params.prompt,
    image_urls: [params.imageDataUri],
    resolution: params.resolution,
    num_images: 1,
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new FalError(502, `Could not reach FAL: ${detail}`);
  }

  const text = await resp.text();

  if (!resp.ok) {
    // Try to surface FAL's own error message; fall back to raw text.
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message =
        parsed?.detail?.[0]?.msg ||
        parsed?.detail ||
        parsed?.message ||
        parsed?.error ||
        text;
      if (typeof message !== "string") message = JSON.stringify(message);
    } catch {
      /* keep raw text */
    }
    throw new FalError(resp.status, message || `FAL returned HTTP ${resp.status}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FalError(502, "FAL returned a non-JSON response.");
  }

  const outUrl = extractImageUrl(json);
  if (!outUrl) {
    throw new FalError(502, "FAL response did not contain an output image URL.");
  }
  return outUrl;
}

function extractImageUrl(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const images = (json as { images?: unknown }).images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (first && typeof first === "object") {
      const u = (first as { url?: unknown }).url;
      if (typeof u === "string" && u.length > 0) return u;
    }
  }
  return null;
}
