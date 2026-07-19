/**
 * Client-side image helpers. Runs in the browser only (uses canvas / Image).
 */
import { JPEG_QUALITY, MAX_EDGE } from "./config";

export interface DownscaledImage {
  /** JPEG data URI, longest edge <= MAX_EDGE. Sent to the server. */
  dataUri: string;
  width: number;
  height: number;
}

/**
 * Load a File into an HTMLImageElement via an object URL, resize it on a canvas
 * so the longest edge is <= MAX_EDGE, and re-encode as JPEG.
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

    const dataUri = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { dataUri, width, height };
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
