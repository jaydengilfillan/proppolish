/**
 * Client-side HDR bracket blending.
 *
 * This is a real pixel-fusion algorithm (Mertens/Kautz/Van Reeth exposure
 * fusion, 2007) — NOT a generative AI model. It takes 2-9 bracketed
 * exposures of the same framing and blends them using per-pixel weight maps
 * (contrast, saturation, well-exposedness), combined through a Laplacian
 * pyramid so the blend doesn't show hard seams or halos around windows.
 *
 * Because it only ever recombines real pixel data from your own brackets —
 * it never hallucinates detail — it can't introduce the colour/tint shifts
 * that a generative "AI HDR" pass can. The tradeoff: it assumes the
 * brackets are already reasonably aligned (tripod-shot, same framing). It
 * does not do feature-based registration for handheld sequences.
 *
 * Everything runs in the browser via <canvas>, matching the rest of this
 * app's "resize/process before upload" pattern in `./image.ts` — no server
 * round trip, no per-image vendor cost.
 */

import { fitWithin } from "./image";

/** Cap the working resolution for the blend so it stays fast in-browser. */
const BLEND_MAX_EDGE = 2400;

export const MIN_BRACKETS = 2;
export const MAX_BRACKETS = 9;

export class HdrBlendError extends Error {}

/**
 * Blend a bracket set into one exposure-fused JPEG Blob.
 * `onProgress` is optional and lets the caller show a status string while
 * this runs (the heavy stages block the main thread, so we yield to the
 * event loop right after each progress update so the UI can repaint).
 */
export async function blendExposures(
  files: File[],
  onProgress?: (message: string) => void
): Promise<Blob> {
  if (files.length < MIN_BRACKETS) {
    throw new HdrBlendError(`Select at least ${MIN_BRACKETS} bracket photos.`);
  }
  if (files.length > MAX_BRACKETS) {
    throw new HdrBlendError(
      `Select at most ${MAX_BRACKETS} bracket photos — that looks like more than one room's worth.`
    );
  }

  await report(onProgress, "Reading photos…");
  const images = await Promise.all(files.map(loadImageEl));
  const { width, height } = fitWithin(
    images[0].naturalWidth,
    images[0].naturalHeight,
    BLEND_MAX_EDGE
  );

  const layers = images.map((img) => drawToFloatRGB(img, width, height));
  images.forEach((img) => URL.revokeObjectURL(img.src));

  await report(onProgress, "Computing exposure weights…");
  const weights = layers.map((l) => computeWeightMap(l, width, height));
  normalizeWeights(weights, width, height);

  await report(onProgress, "Blending exposures…");
  const blended = pyramidBlend(layers, weights, width, height);

  await report(onProgress, "Encoding result…");
  return floatRGBToBlob(blended, width, height);
}

async function report(fn: ((m: string) => void) | undefined, msg: string) {
  fn?.(msg);
  // Yield one tick so the browser can paint the progress text before the
  // next (synchronous, CPU-bound) stage blocks the main thread.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// --- Image IO ---------------------------------------------------------------

function loadImageEl(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new HdrBlendError(`Could not decode ${file.name}. HEIC is not supported.`));
    };
    img.src = objectUrl;
  });
}

/** Draw an image at a fixed size and return interleaved RGB floats in [0,1] (alpha dropped). */
function drawToFloatRGB(img: HTMLImageElement, width: number, height: number): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new HdrBlendError("Could not get a 2D canvas context in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const out = new Float32Array(width * height * 3);
  for (let p = 0, q = 0; p < width * height; p++, q += 4) {
    out[p * 3] = data[q] / 255;
    out[p * 3 + 1] = data[q + 1] / 255;
    out[p * 3 + 2] = data[q + 2] / 255;
  }
  return out;
}

function floatRGBToBlob(rgb: Float32Array, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new HdrBlendError("Could not get a 2D canvas context in this browser.");
  const imgData = ctx.createImageData(width, height);
  for (let p = 0, q = 0; p < width * height; p++, q += 4) {
    imgData.data[q] = clampByte(rgb[p * 3] * 255);
    imgData.data[q + 1] = clampByte(rgb[p * 3 + 1] * 255);
    imgData.data[q + 2] = clampByte(rgb[p * 3 + 2] * 255);
    imgData.data[q + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new HdrBlendError("Could not encode the blended image."));
      },
      "image/jpeg",
      0.95
    );
  });
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Mertens weight maps ------------------------------------------------------

/** Per-pixel weight = contrast * saturation * well-exposedness (classic Mertens weights). */
function computeWeightMap(rgb: Float32Array, width: number, height: number): Float32Array {
  const size = width * height;
  const gray = new Float32Array(size);
  const sat = new Float32Array(size);
  const expo = new Float32Array(size);
  const sigma2 = 2 * 0.2 * 0.2;

  for (let p = 0; p < size; p++) {
    const r = rgb[p * 3];
    const g = rgb[p * 3 + 1];
    const b = rgb[p * 3 + 2];
    gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;

    const mean = (r + g + b) / 3;
    const variance = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;
    sat[p] = Math.sqrt(variance);

    expo[p] =
      Math.exp(-((r - 0.5) ** 2) / sigma2) *
      Math.exp(-((g - 0.5) ** 2) / sigma2) *
      Math.exp(-((b - 0.5) ** 2) / sigma2);
  }

  const contrast = laplacianMagnitude(gray, width, height);
  const weight = new Float32Array(size);
  const EPS = 1e-6;
  for (let p = 0; p < size; p++) {
    weight[p] = Math.max(contrast[p], EPS) * Math.max(sat[p], EPS) * Math.max(expo[p], EPS);
  }
  return weight;
}

function laplacianMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const at = (x: number, y: number) => gray[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      const lap = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * c;
      out[y * w + x] = Math.abs(lap);
    }
  }
  return out;
}

/**
 * Normalize weight maps so they sum to 1 at every pixel across all N brackets.
 *
 * The floor here has to be far below any realistic per-pixel weight product
 * (computeWeightMap's own internal floors already keep every raw weight
 * >= 1e-18), or it silently dominates the sum in low-texture regions — a flat
 * wall or ceiling can legitimately produce raw weights as small as 1e-13 to
 * 1e-15, and an epsilon anywhere near that magnitude swamps the real signal
 * and collapses those pixels toward black. Only fall back to an equal blend
 * in the genuinely degenerate case where every weight is ~0.
 */
function normalizeWeights(weights: Float32Array[], width: number, height: number): void {
  const size = width * height;
  const n = weights.length;
  const equalShare = 1 / n;
  const DEGENERATE_SUM = 1e-30;
  for (let p = 0; p < size; p++) {
    let sum = 0;
    for (const w of weights) sum += w[p];
    if (sum < DEGENERATE_SUM) {
      for (const w of weights) w[p] = equalShare;
    } else {
      for (const w of weights) w[p] = w[p] / sum;
    }
  }
}

// --- Gaussian / Laplacian pyramids --------------------------------------------

interface PyrLevel {
  data: Float32Array;
  w: number;
  h: number;
}

const GAUSS_KERNEL = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

function blurHorizontal(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = clamp(x + k, 0, w - 1);
        acc += src[y * w + xx] * GAUSS_KERNEL[k + 2];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

function blurVertical(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = clamp(y + k, 0, h - 1);
        acc += src[yy * w + x] * GAUSS_KERNEL[k + 2];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

function pyrDown(src: Float32Array, w: number, h: number): PyrLevel {
  const blurred = blurVertical(blurHorizontal(src, w, h), w, h);
  const nw = Math.max(1, Math.ceil(w / 2));
  const nh = Math.max(1, Math.ceil(h / 2));
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      out[y * nw + x] = blurred[Math.min(y * 2, h - 1) * w + Math.min(x * 2, w - 1)];
    }
  }
  return { data: out, w: nw, h: nh };
}

/** Bilinear resize — used to bring a coarser pyramid level back up to a finer level's size. */
function bilinearResize(src: Float32Array, sw: number, sh: number, tw: number, th: number): Float32Array {
  if (sw === tw && sh === th) return src.slice();
  const out = new Float32Array(tw * th);
  const xRatio = sw > 1 ? (sw - 1) / Math.max(tw - 1, 1) : 0;
  const yRatio = sh > 1 ? (sh - 1) / Math.max(th - 1, 1) : 0;
  for (let y = 0; y < th; y++) {
    const sy = y * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, sh - 1);
    const fy = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = x * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, sw - 1);
      const fx = sx - x0;
      const v00 = src[y0 * sw + x0];
      const v01 = src[y0 * sw + x1];
      const v10 = src[y1 * sw + x0];
      const v11 = src[y1 * sw + x1];
      const top = v00 + (v01 - v00) * fx;
      const bottom = v10 + (v11 - v10) * fx;
      out[y * tw + x] = top + (bottom - top) * fy;
    }
  }
  return out;
}

function buildGaussianPyramid(src: Float32Array, w: number, h: number, levels: number): PyrLevel[] {
  const pyr: PyrLevel[] = [{ data: src, w, h }];
  let cur: PyrLevel = { data: src, w, h };
  for (let i = 1; i < levels; i++) {
    if (cur.w <= 4 || cur.h <= 4) break;
    cur = pyrDown(cur.data, cur.w, cur.h);
    pyr.push(cur);
  }
  return pyr;
}

function buildLaplacianPyramid(gPyr: PyrLevel[]): PyrLevel[] {
  const lPyr: PyrLevel[] = [];
  for (let i = 0; i < gPyr.length - 1; i++) {
    const cur = gPyr[i];
    const next = gPyr[i + 1];
    const upsampled = bilinearResize(next.data, next.w, next.h, cur.w, cur.h);
    const lap = new Float32Array(cur.w * cur.h);
    for (let p = 0; p < lap.length; p++) lap[p] = cur.data[p] - upsampled[p];
    lPyr.push({ data: lap, w: cur.w, h: cur.h });
  }
  lPyr.push(gPyr[gPyr.length - 1]); // coarsest level carries the base/DC term
  return lPyr;
}

function collapsePyramid(lPyr: PyrLevel[]): PyrLevel {
  let cur = lPyr[lPyr.length - 1];
  for (let i = lPyr.length - 2; i >= 0; i--) {
    const target = lPyr[i];
    const upsampled = bilinearResize(cur.data, cur.w, cur.h, target.w, target.h);
    const combined = new Float32Array(target.w * target.h);
    for (let p = 0; p < combined.length; p++) combined[p] = upsampled[p] + target.data[p];
    cur = { data: combined, w: target.w, h: target.h };
  }
  return cur;
}

/** Blend one channel (R, G, or B) across all N images' Laplacian pyramids, weighted per-level. */
function pyramidBlendChannel(
  channelLayers: Float32Array[],
  weightPyramids: PyrLevel[][],
  width: number,
  height: number,
  levels: number
): Float32Array {
  const n = channelLayers.length;
  const lapPyramids = channelLayers.map((layer) =>
    buildLaplacianPyramid(buildGaussianPyramid(layer, width, height, levels))
  );
  const numLevels = lapPyramids[0].length;
  const blendedPyr: PyrLevel[] = [];
  for (let lvl = 0; lvl < numLevels; lvl++) {
    const { w: lw, h: lh } = lapPyramids[0][lvl];
    const acc = new Float32Array(lw * lh);
    for (let i = 0; i < n; i++) {
      const lapData = lapPyramids[i][lvl].data;
      const wgtData = weightPyramids[i][lvl].data;
      for (let p = 0; p < acc.length; p++) acc[p] += lapData[p] * wgtData[p];
    }
    blendedPyr.push({ data: acc, w: lw, h: lh });
  }
  return collapsePyramid(blendedPyr).data;
}

/** Full multi-resolution exposure fusion across R, G, and B. */
function pyramidBlend(
  layers: Float32Array[],
  weights: Float32Array[],
  width: number,
  height: number
): Float32Array {
  const levels = Math.max(1, Math.floor(Math.log2(Math.min(width, height))) - 2);
  const weightPyramids = weights.map((w) => buildGaussianPyramid(w, width, height, levels));

  const size = width * height;
  const rPlanes: Float32Array[] = [];
  const gPlanes: Float32Array[] = [];
  const bPlanes: Float32Array[] = [];
  for (const layer of layers) {
    const r = new Float32Array(size);
    const g = new Float32Array(size);
    const b = new Float32Array(size);
    for (let p = 0; p < size; p++) {
      r[p] = layer[p * 3];
      g[p] = layer[p * 3 + 1];
      b[p] = layer[p * 3 + 2];
    }
    rPlanes.push(r);
    gPlanes.push(g);
    bPlanes.push(b);
  }

  const rOut = pyramidBlendChannel(rPlanes, weightPyramids, width, height, levels);
  const gOut = pyramidBlendChannel(gPlanes, weightPyramids, width, height, levels);
  const bOut = pyramidBlendChannel(bPlanes, weightPyramids, width, height, levels);

  const out = new Float32Array(size * 3);
  for (let p = 0; p < size; p++) {
    out[p * 3] = rOut[p];
    out[p * 3 + 1] = gOut[p];
    out[p * 3 + 2] = bOut[p];
  }
  return out;
}
