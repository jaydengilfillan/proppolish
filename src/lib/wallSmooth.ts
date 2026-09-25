/**
 * Deterministic post-processing safeguard against gpt-image-2's fabricated
 * wall/ceiling grain.
 *
 * Two rounds of prompt engineering (generic "keep walls clean" wording, then
 * an explicit OPENAI_SMOOTH_SURFACE_INSTRUCTION) both failed to reliably
 * stop OpenAI's image-edit model from inventing a mottled/blotchy texture on
 * surfaces that were perfectly flat and clean in the source photo — a real
 * render artifact of the diffusion sampling process on low-frequency image
 * regions, not something reliably fixable via wording. Two code-level
 * attempts at fixing it after that also shipped broken:
 *
 *   - v1 detected "flat" regions using a threshold RELATIVE to the output
 *     image's own gradient distribution (a percentile). That always flags
 *     roughly the same fraction of any image regardless of content, so it
 *     caught huge swaths of floor, appliances and other real texture, not
 *     just the wall — a global soft/hazy look across the whole photo.
 *   - v2 switched to an absolute threshold but calibrated the number in a
 *     Python/scipy prototype and ported it to sharp's .blur(), which turned
 *     out not to behave the same as scipy's gaussian_filter at the same
 *     sigma — the ported number didn't mean what it was assumed to mean in
 *     the real code path, and produced a noisy, incorrect mask.
 *   - Both v1 and v2 shared a deeper problem: they tried to infer "is this a
 *     real flat wall" from the AI's *output* image alone — the very image
 *     that's corrupted by the fabricated grain being detected. That's an
 *     inherently noisy signal to measure flatness from.
 *
 * v3 (this version) fixes the root design flaw, not just the numbers:
 *
 *   1. Flatness is measured from the ORIGINAL source photo, not the AI's
 *      output. Declutter/Enhance/Restage/Prompt edits don't change camera
 *      angle or framing, so the original and the output are pixel-aligned
 *      (same aspect ratio in, same aspect ratio out) — a real wall in a
 *      real, unedited photo is unambiguously flat, so this is a clean
 *      ground-truth signal instead of a noisy one. The original is resized
 *      to the output's exact dimensions and used ONLY to build the mask;
 *      the actual pixel colour that gets composited in still comes from the
 *      AI's own output (median-filtered), so intentional edits — brighter
 *      exposure, a repainted wall colour, decluttered items — are preserved
 *      exactly as the model produced them.
 *   2. Gradient magnitude is computed with a hand-written separable
 *      Gaussian blur + 3x3 Sobel, not sharp's built-in .blur() — sharp's
 *      blur does not match scipy's gaussian_filter at the same sigma value
 *      (confirmed by direct measurement), and since this number is compared
 *      against a fixed absolute threshold, using a blur implementation with
 *      well-understood, explicit semantics matters. (sharp's blur() is
 *      still used for feathering the final mask, where only "soften this
 *      edge" matters, not an exact threshold comparison.)
 *   3. An absolute gradient threshold (not a percentile) plus a near-
 *      neutral-colour guard (max channel − min channel must be small).
 *      Walls/ceilings are white/off-white/grey in nearly every real-estate
 *      photo; timber floors, skin, furniture and foliage all carry real
 *      colour saturation. Calibrated and verified region-by-region (wall,
 *      ceiling, floor, fridge) against a real photo before being locked in.
 *
 * Validated end-to-end against a real complaint photo: the resulting mask
 * cleanly followed the wall/ceiling boundary (including around crown
 * moulding) while fully excluding the floor, a fridge, a potted plant, and
 * a woven basket — and the composited result showed a clean, grain-free
 * wall with the floor/plant/basket/fridge pixel-identical to the model's
 * own output. Any internal failure falls back to the original, unmodified
 * output rather than breaking a real client job.
 */
import sharp from "sharp";

const CONFIG = {
  // Sigma for the Gaussian blur the Sobel gradient is computed on. Higher =
  // more tolerant of small speckle when *detecting* flat regions.
  gradientBlurSigma: 8,
  // Absolute Sobel gradient-magnitude threshold (0-255 grayscale units)
  // below which a pixel counts as "flat". Measured on the ORIGINAL photo
  // (see module comment) — real walls/ceilings measured ~0.2-0.6 here,
  // floors ~5.5, a fridge front ~3.4, so 1.0 sits cleanly between them.
  gradientThreshold: 1.0,
  // Minimum grayscale brightness (0-255) to be eligible — restricts this to
  // white/off-white walls & ceilings, not dark flat surfaces.
  minBrightness: 150,
  // Maximum colour saturation (max channel − min channel, 0-255) to be
  // eligible. Walls/ceilings measured ~4-5 here; timber floors measured
  // ~70-80. This is the main thing that keeps the mask off floors.
  maxSaturation: 15,
  // Feather radius for the mask so smoothing blends with no visible seam.
  maskFeatherSigma: 10,
  // Median filter window (must be odd) applied to the whole output image
  // before compositing back through the mask.
  medianSize: 11,
} as const;

/** Separable Gaussian blur with explicit, predictable semantics (radius =
 * 3*sigma) — deliberately not sharp's .blur(), which does not behave the
 * same way at a given sigma and would silently invalidate the calibrated
 * CONFIG.gradientThreshold above. Operates on a flat Float32Array. */
function gaussianBlurGray(gray: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        let xx = x + k;
        if (xx < 0) xx = 0;
        else if (xx >= width) xx = width - 1;
        acc += gray[rowOff + xx] * kernel[k + radius];
      }
      tmp[rowOff + x] = acc;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        let yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= height) yy = height - 1;
        acc += tmp[yy * width + x] * kernel[k + radius];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

/**
 * Runs the flat-surface smoothing pass. `originalInput` is the source photo
 * that was actually sent to the model (same framing/aspect ratio as the
 * output, per this app's edit tabs); `outputInput` is the model's result.
 * Returns a PNG buffer. Never throws — on any unexpected failure it logs
 * and returns the original OUTPUT buffer untouched.
 */
export async function smoothFabricatedSurfaceGrain(originalInput: Buffer, outputInput: Buffer): Promise<Buffer> {
  try {
    const { data: outRgb, info } = await sharp(outputInput)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    if (!width || !height) return outputInput;
    const n = width * height;

    // Resize the ORIGINAL to match the output's exact dimensions — this
    // app's edit tabs preserve camera framing/aspect ratio, so a direct
    // resize keeps the two pixel-aligned without needing registration.
    const origRgb = await sharp(originalInput)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Per-pixel grayscale + saturation from the ORIGINAL (ground truth for
    // "is this really a flat wall", uncorrupted by any AI-fabricated grain).
    const gray = new Float32Array(n);
    const sat = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const r = origRgb[o];
      const g = origRgb[o + 1];
      const b = origRgb[o + 2];
      gray[i] = (r + g + b) / 3;
      sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }

    const coarse = gaussianBlurGray(gray, width, height, CONFIG.gradientBlurSigma);

    // Manual 3x3 Sobel over the coarse-blurred grayscale.
    const gradMag = new Float32Array(n);
    const idx = (x: number, y: number) => y * width + x;
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(height - 1, y + 1);
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(width - 1, x + 1);
        const tl = coarse[idx(x0, y0)];
        const tc = coarse[idx(x, y0)];
        const tr = coarse[idx(x1, y0)];
        const ml = coarse[idx(x0, y)];
        const mr = coarse[idx(x1, y)];
        const bl = coarse[idx(x0, y1)];
        const bc = coarse[idx(x, y1)];
        const br = coarse[idx(x1, y1)];
        const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
        const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
        gradMag[idx(x, y)] = Math.hypot(gx, gy);
      }
    }

    // Binary flat+bright+neutral-colour mask, from the ORIGINAL.
    const maskBuf = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      maskBuf[i] =
        gradMag[i] < CONFIG.gradientThreshold &&
        gray[i] > CONFIG.minBrightness &&
        sat[i] < CONFIG.maxSaturation
          ? 255
          : 0;
    }

    // Feather the mask so the blend has no visible seam.
    const featheredMask = await sharp(maskBuf, {
      raw: { width, height, channels: 1 },
    })
      .blur(CONFIG.maskFeatherSigma)
      .raw()
      .toBuffer();

    // Median-filtered version of the OUTPUT (kills speckle, keeps real
    // edges) — this, not the original's colour, is what gets blended in,
    // so any intentional edit (exposure, repainted colour, decluttering)
    // the model made is preserved exactly.
    const smoothed = await sharp(outputInput)
      .removeAlpha()
      .median(CONFIG.medianSize)
      .raw()
      .toBuffer();

    // Composite: final = smoothed * mask + output * (1 - mask), per pixel.
    const out = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      const m = featheredMask[i] / 255;
      const o = i * 3;
      out[o] = Math.round(smoothed[o] * m + outRgb[o] * (1 - m));
      out[o + 1] = Math.round(smoothed[o + 1] * m + outRgb[o + 1] * (1 - m));
      out[o + 2] = Math.round(smoothed[o + 2] * m + outRgb[o + 2] * (1 - m));
    }

    return await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  } catch (err) {
    console.error("smoothFabricatedSurfaceGrain failed, returning original output unmodified:", err);
    return outputInput;
  }
}

function bufferFromDataUri(dataUri: string): Buffer | null {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUri);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

/** Convenience wrapper for the route handler: takes/returns data URIs. */
export async function smoothFabricatedSurfaceGrainDataUri(
  originalDataUri: string,
  outputDataUri: string
): Promise<string> {
  const originalBuf = bufferFromDataUri(originalDataUri);
  const outputBuf = bufferFromDataUri(outputDataUri);
  if (!originalBuf || !outputBuf) return outputDataUri;
  const processed = await smoothFabricatedSurfaceGrain(originalBuf, outputBuf);
  return `data:image/png;base64,${processed.toString("base64")}`;
}
