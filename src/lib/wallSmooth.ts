/**
 * Deterministic post-processing safeguard against gpt-image-2's fabricated
 * wall/ceiling grain.
 *
 * Two rounds of prompt engineering (generic "keep walls clean" wording, then
 * an explicit OPENAI_SMOOTH_SURFACE_INSTRUCTION) both failed to reliably
 * stop OpenAI's image-edit model from inventing a mottled/blotchy texture on
 * surfaces that were perfectly flat in the source photo — a real render
 * artifact of the diffusion sampling process on low-frequency regions, not
 * something the model can be reasoned out of via wording alone. Rather than
 * depend on the model "behaving," this runs on every OpenAI-provider output
 * and fixes it directly at the pixel level:
 *
 *   1. Finds large, low-gradient (structurally flat) regions of the image —
 *      the kind a real wall or ceiling actually is — using a Sobel gradient
 *      magnitude computed on a heavily Gaussian-blurred grayscale copy, so
 *      real texture (floor grain, joinery, appliances, foliage) survives
 *      untouched. The blur is wide enough to look straight past the
 *      fabricated grain itself when deciding what counts as "flat."
 *   2. Restricts the flat-region mask to bright pixels only (walls and
 *      ceilings are white/off-white in nearly every real-estate photo),
 *      guarding against smoothing dark flat surfaces like a benchtop or TV
 *      screen that should keep whatever texture they legitimately have.
 *   3. Feathers that mask with a wide Gaussian blur so the smoothing blends
 *      in seamlessly, with no visible edge where it starts/stops.
 *   4. Applies a median filter (kills speckle/grain, preserves real edges)
 *      to the whole image, then composites the smoothed version back in
 *      ONLY where the feathered mask says "flat," via a soft alpha blend —
 *      everywhere else is left pixel-identical to the model's own output.
 *
 * This is intentionally independent of prompt wording — it works regardless
 * of what the model does on a given generation, and is safe to run
 * unconditionally on every OpenAI-provider result. Any failure here falls
 * back to returning the original, unmodified output rather than breaking a
 * real client job.
 */
import sharp from "sharp";

const CONFIG = {
  // Sigma for the coarse blur the Sobel gradient is computed on. Higher =
  // more tolerant of small speckle when *detecting* flat regions (the grain
  // we're removing IS the speckle, so we deliberately blur past it).
  gradientBlurSigma: 8,
  // Percentile of gradient magnitude below which a pixel counts as "flat".
  flatPercentile: 60,
  // Minimum grayscale brightness (0-255) to be eligible — restricts this to
  // white/off-white walls & ceilings, not dark flat surfaces.
  minBrightness: 150,
  // Feather radius for the mask so smoothing blends with no visible seam.
  maskFeatherSigma: 18,
  // Median filter window (must be odd) applied to the whole image before
  // compositing back through the mask.
  medianSize: 11,
  // Subsample stride used when estimating the flatness percentile threshold
  // — a full-resolution sort isn't necessary for a stable estimate and this
  // keeps the pass fast on 4K output images.
  percentileSampleStride: 4,
} as const;

/**
 * Runs the flat-surface smoothing pass on a raw image buffer (any format
 * sharp can decode) and returns a PNG buffer. Never throws — on any
 * unexpected failure it logs and returns the original buffer untouched.
 */
export async function smoothFabricatedSurfaceGrain(input: Buffer): Promise<Buffer> {
  try {
    const { data: rgb, info } = await sharp(input)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    if (!width || !height) return input;
    const n = width * height;

    // Per-pixel full-resolution grayscale (used for the brightness guard).
    const gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      gray[i] = Math.round((rgb[o] + rgb[o + 1] + rgb[o + 2]) / 3);
    }

    // Coarse blurred grayscale (used only for gradient/flatness detection).
    const coarse = await sharp(Buffer.from(gray), {
      raw: { width, height, channels: 1 },
    })
      .blur(CONFIG.gradientBlurSigma)
      .raw()
      .toBuffer();

    // Manual 3x3 Sobel over the coarse grayscale.
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

    // Estimate the flatness threshold from a subsample (fast, stable).
    const sample: number[] = [];
    for (let i = 0; i < n; i += CONFIG.percentileSampleStride) sample.push(gradMag[i]);
    sample.sort((a, b) => a - b);
    const threshold = sample[Math.floor(sample.length * (CONFIG.flatPercentile / 100))] ?? 0;

    // Binary flat+bright mask.
    const maskBuf = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      maskBuf[i] = gradMag[i] < threshold && gray[i] > CONFIG.minBrightness ? 255 : 0;
    }

    // Feather the mask so the blend has no visible seam.
    const featheredMask = await sharp(maskBuf, {
      raw: { width, height, channels: 1 },
    })
      .blur(CONFIG.maskFeatherSigma)
      .raw()
      .toBuffer();

    // Median-filtered version of the whole image (kills speckle, keeps
    // real edges) — this is what gets blended in through the mask.
    const smoothed = await sharp(input)
      .removeAlpha()
      .median(CONFIG.medianSize)
      .raw()
      .toBuffer();

    // Composite: final = smoothed * mask + original * (1 - mask), per pixel.
    const out = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      const m = featheredMask[i] / 255;
      const o = i * 3;
      out[o] = Math.round(smoothed[o] * m + rgb[o] * (1 - m));
      out[o + 1] = Math.round(smoothed[o + 1] * m + rgb[o + 1] * (1 - m));
      out[o + 2] = Math.round(smoothed[o + 2] * m + rgb[o + 2] * (1 - m));
    }

    return await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  } catch (err) {
    console.error("smoothFabricatedSurfaceGrain failed, returning original output unmodified:", err);
    return input;
  }
}

/** Convenience wrapper for the route handler: takes/returns a data URI. */
export async function smoothFabricatedSurfaceGrainDataUri(dataUri: string): Promise<string> {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUri);
  if (!match) return dataUri;
  const buf = Buffer.from(match[2], "base64");
  const processed = await smoothFabricatedSurfaceGrain(buf);
  return `data:image/png;base64,${processed.toString("base64")}`;
}
