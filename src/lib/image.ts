/**
 * Client-side image helpers. Runs in the browser only (uses canvas / Image).
 */
import { JPEG_QUALITY, MAX_EDGE } from "./config";

export interface DownscaledImage {
  /** JPEG data URI, longest edge <= MAX_EDGE (may be smaller if we had to back off to fit the upload budget). */
  dataUri: string;
  /** Dimensions of the DOWNSCALED image actually sent to the model. */
  width: number;
  height: number;
  /**
   * The photo's true original pixel dimensions (before any downscaling).
   * Results are always conformed back to exactly this size — see
   * conformToSize().
   */
  originalWidth?: number;
  originalHeight?: number;
}

// Vercel's Node.js serverless functions cap the request body at ~4.5MB. We
// budget comfortably under that for the RAW (pre-base64) JPEG bytes, since
// base64 inflates size by ~33% and the JSON body also carries a few small
// fields (mode, tab, provider, width, height, note). This matters most at
// the 4K tier (MAX_EDGE 4096), where a detailed photo at JPEG_QUALITY alone
// can otherwise exceed the limit and the upload fails with HTTP 413.
const MAX_UPLOAD_BYTES = 3_400_000;

// Prompt-tab reference images ride in the SAME request body as the main
// photo, so they get a much smaller budget each — they only need to convey
// style/content to the model, not full resolution. Two of these plus the
// main photo (with its own slightly reduced budget when references are
// attached, see downscaleImage's maxBytes override) stays safely under the
// same overall ceiling the app already relies on for a single 4K photo.
const REFERENCE_MAX_EDGE = 1024;
const REFERENCE_MAX_UPLOAD_BYTES = 250_000;
/** Main photo's budget when one or more reference images are also being sent. */
export const MAIN_IMAGE_BYTES_WITH_REFERENCES = 2_900_000;

/**
 * Load a File into an HTMLImageElement via an object URL, resize it on a canvas
 * so the longest edge is <= MAX_EDGE, and re-encode as JPEG. If the encoded
 * image is still too large to safely fit Vercel's request body limit, quality
 * and then physical dimensions are backed off further until it fits.
 *
 * This happens BEFORE upload so we never exceed Vercel's ~4.5MB serverless body
 * limit and we stay within the model's input cap.
 *
 * @param maxUploadBytesOverride Use a smaller budget than the default — the
 * Prompt tab passes this when reference images are also being sent in the
 * same request, to leave them room.
 */
export async function downscaleImage(
  file: File,
  maxUploadBytesOverride?: number
): Promise<DownscaledImage> {
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

    return {
      ...encodeUnderBudget(canvas, maxUploadBytesOverride ?? MAX_UPLOAD_BYTES),
      originalWidth: img.naturalWidth,
      originalHeight: img.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Same idea as downscaleImage, but for Prompt-tab reference images: a much
 * smaller target size (REFERENCE_MAX_EDGE / REFERENCE_MAX_UPLOAD_BYTES),
 * since these just need to convey style/content to the model, not full
 * resolution, and have to share request-body budget with the main photo.
 */
export async function downscaleReferenceImage(file: File): Promise<DownscaledImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, REFERENCE_MAX_EDGE);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context in this browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    return encodeUnderBudget(canvas, REFERENCE_MAX_UPLOAD_BYTES);
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
function encodeUnderBudget(canvas: HTMLCanvasElement, maxUploadBytes: number): DownscaledImage {
  let quality = JPEG_QUALITY;
  let dataUri = canvas.toDataURL("image/jpeg", quality);

  while (estimateBytes(dataUri) > maxUploadBytes && quality > 0.4) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    dataUri = canvas.toDataURL("image/jpeg", quality);
  }

  let width = canvas.width;
  let height = canvas.height;
  let source: HTMLCanvasElement = canvas;
  let scale = 1;

  while (estimateBytes(dataUri) > maxUploadBytes && scale > 0.35) {
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

/**
 * ABSOLUTE RULE: every result must have exactly the same pixel dimensions
 * (and therefore aspect ratio) as the photo that was put in.
 *
 * The models can't guarantee that on their own — FAL only offers a fixed
 * list of aspect ratios, OpenAI rounds to multiples of 16, and both cap the
 * output size below what a full-size camera original is (e.g. 7008x4672 ->
 * ~3248x2160) — so after the model returns, this resamples the result to the
 * exact original width x height. It never crops: the model's output
 * ratio is always within a fraction of a percent of the source, so scaling to
 * fit is invisible, whereas cropping would lose edge content.
 *
 * Returns the original URL untouched if it already matches exactly, otherwise
 * an object URL of a high-quality JPEG at the exact size.
 */
export async function conformToSize(url: string, width: number, height: number): Promise<string> {
  const blob = await urlToBlob(url);
  const bmp = await createImageBitmap(blob);
  try {
    if (bmp.width === width && bmp.height === height) return url;
    if (width > 16384 || height > 16384 || width * height > 200_000_000) {
      throw new Error(`Original size ${width}x${height} is too large to resize in the browser.`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context in this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.97)
    );
    if (!out) throw new Error("Could not encode the resized image.");
    return URL.createObjectURL(out);
  } finally {
    bmp.close();
  }
}

/**
 * conformToSize(), but never throws: if the resize can't be done for any
 * reason (cross-origin fetch blocked, huge image, odd browser) the model's
 * own result is returned unchanged so the job still completes.
 */
export async function conformOrKeep(
  url: string,
  width?: number,
  height?: number
): Promise<string> {
  if (!width || !height) return url;
  try {
    return await conformToSize(url, width, height);
  } catch (err) {
    console.warn("Could not conform result to original size (using model output as-is):", err);
    return url;
  }
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

/**
 * Full-resolution detail restoration (see detailRestore.ts). Runs in a Web
 * Worker so the UI stays responsive. The reference is the ORIGINAL full-size
 * upload: the model only ever sees a ≤4K copy, so its result is soft once
 * stretched back to the original size; this puts the original's real fine
 * detail back wherever the picture is unchanged. NEVER throws: on any problem the AI
 * result is returned untouched.
 */
/** Pixel size of an image URL, or null if it cannot be read. */
export async function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(await urlToBlob(url));
    const s = { width: bmp.width, height: bmp.height };
    bmp.close();
    return s;
  } catch {
    return null;
  }
}

export async function restoreDetailOrKeep(resultUrl: string, referenceUrl: string): Promise<string> {
  try {
    const refMeta = await imageSize(referenceUrl);
    if (!refMeta || refMeta.width * refMeta.height > 60_000_000) return resultUrl;
    const [outBlob, refBlob] = await Promise.all([urlToBlob(resultUrl), urlToBlob(referenceUrl)]);
    const [outBmp, refBmp] = await Promise.all([createImageBitmap(outBlob), createImageBitmap(refBlob)]);
    const toRaster = (bmp: ImageBitmap) => {
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
      return { data: d.data, width: bmp.width, height: bmp.height };
    };
    const out = toRaster(outBmp);
    const ref = toRaster(refBmp);
    outBmp.close();
    refBmp.close();
    // Only sane when the two are the same photo framing.
    if (Math.abs(out.width / out.height - ref.width / ref.height) > 0.02) return resultUrl;

    const worker = new Worker(new URL("./detailRestore.worker.ts", import.meta.url));
    const res = await new Promise<{ data: Uint8ClampedArray; coverage: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("detail restore timed out"));
      }, 120_000);
      worker.onmessage = (ev) => {
        clearTimeout(timer);
        worker.terminate();
        ev.data.ok ? resolve(ev.data) : reject(new Error(ev.data.error));
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(ev.message));
      };
      worker.postMessage({ ref, out }, [ref.data.buffer, out.data.buffer]);
    });
    if (res.coverage < 0.002) return resultUrl;
    const c = document.createElement("canvas");
    c.width = out.width;
    c.height = out.height;
    const ctx = c.getContext("2d");
    if (!ctx) return resultUrl;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(res.data), out.width, out.height), 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.97));
    return blob ? URL.createObjectURL(blob) : resultUrl;
  } catch (err) {
    console.warn("restoreDetailOrKeep failed; keeping AI result", err);
    return resultUrl;
  }
}
