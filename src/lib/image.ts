/**
 * Client-side image helpers. Runs in the browser only (uses canvas / Image).
 */
import { JPEG_QUALITY, MAX_EDGE } from "./config";

export interface DownscaledImage {
  /** JPEG data URI, longest edge <= MAX_EDGE (may be smaller if we had to back off to fit the upload budget). */
  dataUri: string;
  width: number;
  height: number;
}

// Vercel's Node.js serverless functions cap the request body at ~4.5MB. We
// budget comfortably under that for the RAW (pre-base64) JPEG bytes, since
// base64 inflates size by ~33% and the JSON body also carries a few small
// fields (mode, tab, provider, width, height, note). This matters most at
// the 4K tier (MAX_EDGE 4096), where a detailed photo at JPEG_QUALITY alone
// can otherwise exceed the limit and the upload fails with HTTP 413.
const MAX_UPLOAD_BYTES = 3_400_000;

/**
 * Load a File into an HTMLImageElement via an object URL, resize it on a canvas
 * so the longest edge is <= MAX_EDGE, and re-encode as JPEG. If the encoded
 * image is still too large to safely fit Vercel's request body limit, quality
 * and then physical dimensions are backed off further until it fits.
 *
 * This happens BEFORE upload so we never exceed Vercel's ~4.5MB serverless body
 * limit and we stay within the model's input cap.
 */
export async function downscaleImage(file: File): Promise<DownscaledImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_EDGE);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context in this browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    return encodeUnderBudget(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not decode this image. HEIC is not supported in v1."));
    img.src = src;
  });
}

/** Scale (w,h) down so the longest edge is <= maxEdge. Never upscales. */
export function fitWithin(
  w: number,
  h: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Re-encode canvas as JPEG, backing off quality first and then physical
 * dimensions, until the resulting data URI's raw byte size clears
 * MAX_UPLOAD_BYTES. Returns the data URI actually used, plus its real
 * width/height (which may be smaller than the input canvas if a further
 * shrink was needed).
 */
function encodeUnderBudget(canvas: HTMLCanvasElement): DownscaledImage {
  let quality = JPEG_QUALITY;
  let dataUri = canvas.toDataURL("image/jpeg", quality);

  while (estimateBytes(dataUri) > MAX_UPLOAD_BYTES && quality > 0.4) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    dataUri = canvas.toDataURL("image/jpeg", quality);
  }

  let width = canvas.width;
  let height = canvas.height;
  let source: HTMLCanvasElement = canvas;
  let scale = 1;

  while (estimateBytes(dataUri) > MAX_UPLOAD_BYTES && scale > 0.35) {
    scale -= 0.15;
    width = Math.max(1, Math.round(canvas.width * scale));
    height = Math.max(1, Math.round(canvas.height * scale));

    const smaller = document.createElement("canvas");
    smaller.width = width;
    smaller.height = height;
    const sctx = smaller.getContext("2d");
    if (!sctx) break;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(canvas, 0, 0, width, height);

    source = smaller;
    dataUri = source.toDataURL("image/jpeg", Math.max(quality, 0.6));
  }

  return { dataUri, width, height };
}

/** Estimate the raw (pre-base64) byte size of a data URI's payload. */
function estimateBytes(dataUri: string): number {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** Fetch a (possibly remote) image URL and return it as a Blob. */
export async function urlToBlob(url: string): Promise<Blob> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not download image (HTTP ${resp.status}).`);
  return resp.blob();
}

/** Trigger a browser download for a Blob or object URL. */
export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
