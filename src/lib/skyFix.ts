/**
 * Sky Fix — deliberate, user-directed sky recolouring for a window/glass region.
 *
 * This is a SEPARATE, explicit tool from Declutter/Enhance on purpose. Those two
 * prompts carry a hard "never replace the sky or change weather/time of day" rule
 * (see prompts.ts) — a real-estate advertising compliance guardrail, not an
 * oversight. Recolouring an overcast sky to look clear and blue is a genuine
 * departure from "photographed conditions," so it must be something the user
 * explicitly asks for on a specific photo, in a specific region they draw
 * themselves — never an automatic side-effect of a general finishing pass.
 *
 * Algorithm (entirely client-side, no server round trip, no ML model download):
 *  1. The user drags a rough rectangle over the window/glass area (the ROI).
 *     This is required input, not a guess — auto-detecting "the window" across
 *     arbitrary listing photos is not reliable enough to do unsupervised.
 *  2. Within that ROI, build a "trimap": pixels that are almost certainly sky
 *     (bright, desaturated) get weight 1, pixels that are almost certainly NOT
 *     sky (strongly saturated green foliage) get weight 0, everything else
 *     (fine branch/leaf edges, haze) is left as an unknown 0.5.
 *  3. Refine that rough trimap into a proper per-pixel alpha matte using a
 *     guided image filter (He/Sun/Tang, 2010) with the photo's own luminance as
 *     the "guide" — this is the same class of algorithm real matting tools use
 *     to clean up hair/foliage edges, and it is what makes the difference
 *     between a blunt rectangle of blue and a matte that actually follows tree
 *     branches. No neural network, no model weights: just box filters and
 *     linear algebra, which is why it can run instantly on-device.
 *  4. Recolour: blend a blue-sky gradient into the image using that alpha
 *     matte, modulated by the original luminance so cloud/haze texture and the
 *     silhouettes of branches are preserved rather than flattening to one color.
 *  5. Hard-clamp alpha to zero outside the user's ROI rectangle. The guided
 *     filter's own feathering is only trusted a few pixels past a real edge —
 *     it must never bleed onto a wall or ceiling the user didn't select.
 */

export interface SkyFixRect {
  /** Normalized (0-1) coordinates so the ROI survives any resize. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SkyFixOptions {
  /** BGR-in-spirit but we work in RGB throughout; deep sky blue near the top of the ROI. */
  topColor?: [number, number, number];
  /** Paler, hazier blue near the bottom of the ROI (the "horizon"). */
  horizonColor?: [number, number, number];
  guidedFilterRadius?: number;
  guidedFilterEps?: number;
}

const DEFAULTS: Required<SkyFixOptions> = {
  topColor: [105, 175, 225],
  horizonColor: [175, 215, 235],
  guidedFilterRadius: 5,
  guidedFilterEps: 1e-4,
};

/** Convert normalized ROI to integer pixel bounds, clamped to image size. */
function rectToPixels(rect: SkyFixRect, width: number, height: number) {
  const x0 = Math.max(0, Math.min(width - 1, Math.round(rect.x0 * width)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.round(rect.x1 * width)));
  const y0 = Math.max(0, Math.min(height - 1, Math.round(rect.y0 * height)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.round(rect.y1 * height)));
  return { x0, x1, y0, y1 };
}

function rgbToHsvPixel(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const v = max;
  const delta = max - min;
  const s = max === 0 ? 0 : delta / max;
  let h = 0;
  if (delta !== 0) {
    if (max === rf) h = ((gf - bf) / delta) % 6;
    else if (max === gf) h = (bf - rf) / delta + 2;
    else h = (rf - gf) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v * 255];
}

/** Box filter via a summed-area table — O(1) per pixel regardless of radius. */
function boxFilter(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += src[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[(y0) * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + (x0)] +
        integral[(y0) * (width + 1) + (x0)];
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

/**
 * Guided image filter (He, Sun, Tang 2010), single-channel guide.
 * Refines a rough per-pixel signal `p` (here: the trimap) so it snaps to real
 * edges in the guide image `guide` (here: the photo's own luminance).
 */
function guidedFilter(
  guide: Float32Array,
  p: Float32Array,
  width: number,
  height: number,
  radius: number,
  eps: number
): Float32Array {
  const size = width * height;
  const II = new Float32Array(size);
  const Ip = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    II[i] = guide[i] * guide[i];
    Ip[i] = guide[i] * p[i];
  }
  const meanI = boxFilter(guide, width, height, radius);
  const meanP = boxFilter(p, width, height, radius);
  const corrI = boxFilter(II, width, height, radius);
  const corrIp = boxFilter(Ip, width, height, radius);

  const a = new Float32Array(size);
  const b = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const covIp = corrIp[i] - meanI[i] * meanP[i];
    a[i] = covIp / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  const meanA = boxFilter(a, width, height, radius);
  const meanB = boxFilter(b, width, height, radius);

  const q = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    q[i] = meanA[i] * guide[i] + meanB[i];
  }
  return q;
}

/**
 * Build the rough trimap: 1 = definite sky, 0 = definite non-sky, 0.5 = unknown
 * (left for the guided filter to resolve using real edge structure).
 */
function buildTrimap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  roi: { x0: number; x1: number; y0: number; y1: number }
): Float32Array {
  const size = width * height;
  const trimap = new Float32Array(size).fill(0); // outside ROI is always definite non-sky
  for (let y = roi.y0; y < roi.y1; y++) {
    for (let x = roi.x0; x < roi.x1; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      const [h, s, v] = rgbToHsvPixel(rgba[p], rgba[p + 1], rgba[p + 2]);
      const definiteSky = v > 150 && s < 0.14;
      const definiteFoliage = h > 35 && h < 95 && s > 0.24;
      trimap[idx] = definiteSky ? 1 : definiteFoliage ? 0 : 0.5;
    }
  }
  return trimap;
}

/**
 * Apply the sky fix to an ImageData in place-equivalent fashion (returns a new
 * ImageData; does not mutate the input).
 */
export function applySkyFix(
  imageData: ImageData,
  roiRect: SkyFixRect,
  options: SkyFixOptions = {}
): ImageData {
  const opts = { ...DEFAULTS, ...options };
  const { width, height } = imageData;
  const src = imageData.data;
  const roi = rectToPixels(roiRect, width, height);
  const size = width * height;

  // Guide = luminance, normalized to [0,1].
  const guide = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const p = i * 4;
    guide[i] = (0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]) / 255;
  }

  const trimap = buildTrimap(src, width, height, roi);
  let alpha = guidedFilter(guide, trimap, width, height, opts.guidedFilterRadius, opts.guidedFilterEps);

  // Hard-clamp: never let the filter's own feathering bleed past the user's
  // rectangle onto a wall/ceiling they didn't select.
  const clamped = new Float32Array(size);
  for (let y = roi.y0; y < roi.y1; y++) {
    for (let x = roi.x0; x < roi.x1; x++) {
      const idx = y * width + x;
      clamped[idx] = Math.max(0, Math.min(1, alpha[idx]));
    }
  }
  alpha = clamped;

  const out = new ImageData(width, height);
  out.data.set(src);
  const dst = out.data;

  const roiHeight = roi.y1 - roi.y0;
  for (let y = roi.y0; y < roi.y1; y++) {
    // t=0 at the top of the ROI (deep blue), t=1 toward the bottom (hazy/pale),
    // clamped so the gradient doesn't fully wash out before the ROI ends.
    const t = Math.max(0, Math.min(1, (y - roi.y0) / Math.max(1, roiHeight - roiHeight * 0.2)));
    const skyR = opts.topColor[0] * (1 - t) + opts.horizonColor[0] * t;
    const skyG = opts.topColor[1] * (1 - t) + opts.horizonColor[1] * t;
    const skyB = opts.topColor[2] * (1 - t) + opts.horizonColor[2] * t;
    for (let x = roi.x0; x < roi.x1; x++) {
      const idx = y * width + x;
      const a = alpha[idx];
      if (a <= 0.001) continue;
      const p = idx * 4;
      // Modulate by the original pixel's own brightness so haze/cloud texture
      // and branch silhouettes read through rather than flattening to one flat color.
      const lum = Math.max(0.5, Math.min(1.2, src[p] / 210));
      const nr = skyR * lum;
      const ng = skyG * lum;
      const nb = skyB * lum;
      dst[p] = src[p] * (1 - a) + nr * a;
      dst[p + 1] = src[p + 1] * (1 - a) + ng * a;
      dst[p + 2] = src[p + 2] * (1 - a) + nb * a;
    }
  }
  return out;
}
