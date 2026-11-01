/**
 * Pattern / fine-detail restoration for interior results.
 *
 * Generative models redraw every pixel, so repeating fine structure (security
 * screens, window bars, carpet weave, tiles) comes back redesigned or warped.
 * This pass lines the original photo up with the AI result and, only where the
 * original has fine detail AND the two images agree structurally, puts the
 * original's fine detail back on top of the AI result's tone and colour.
 * Areas the AI deliberately changed (removed clutter, new furniture) disagree
 * with the original, so the mask switches off there and the AI result stays.
 *
 * Pure typed-array code (no DOM) so it runs in a Web Worker and in Node tests.
 */

export interface Raster {
  /** RGBA, 8-bit. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RestoreResult {
  data: Uint8ClampedArray;
  /** Mean mask strength 0..1 (how much of the picture was touched). */
  coverage: number;
}

/** Long edge of the working resolution used for alignment and masking. */
const WORK_EDGE = 1600;
/** Parameters were tuned at this image width; sigmas scale with width. */
const REF_WIDTH = 3248;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[o + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc * inv;
      acc += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)];
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1);
  const acc = new Float32Array(w);
  for (let k = -r; k <= r; k++) {
    const o = clamp(k, 0, h - 1) * w;
    for (let x = 0; x < w; x++) acc[x] += src[o + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) dst[o + x] = acc[x] * inv;
    const add = Math.min(y + r + 1, h - 1) * w;
    const sub = Math.max(y - r, 0) * w;
    for (let x = 0; x < w; x++) acc[x] += src[add + x] - src[sub + x];
  }
}

/** Approximate Gaussian (3 box passes per axis). Returns a new plane. */
function gauss(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src.slice();
  const b = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1)));
  const r = Math.max(1, Math.floor(b / 2));
  const a: Float32Array = src.slice();
  const t: Float32Array = new Float32Array(src.length);
  for (let i = 0; i < 3; i++) {
    boxH(a, t, w, h, r);
    boxV(t, a, w, h, r);
  }
  return a;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const t = new Float32Array(src.length);
  const o = new Float32Array(src.length);
  boxH(src, t, w, h, r);
  boxV(t, o, w, h, r);
  return o;
}

/** Area-average resample of an RGBA raster to (dw,dh); returns RGB planes. */
function resizeToPlanes(src: Raster, dw: number, dh: number): Float32Array[] {
  const R = new Float32Array(dw * dh);
  const G = new Float32Array(dw * dh);
  const B = new Float32Array(dw * dh);
  const sx = src.width / dw;
  const sy = src.height / dh;
  const d = src.data;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((x + 1) * sx)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * src.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) {
          r += d[p]; g += d[p + 1]; b += d[p + 2]; n++;
        }
      }
      const i = y * dw + x;
      R[i] = r / n; G[i] = g / n; B[i] = b / n;
    }
  }
  return [R, G, B];
}

function luma(p: Float32Array[]): Float32Array {
  const n = p[0].length;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * p[0][i] + 0.587 * p[1][i] + 0.114 * p[2][i];
  return L;
}

/** Local contrast normalisation so relighting doesn't fool the aligner. */
function normalise(g: Float32Array, w: number, h: number): Float32Array {
  const m = gauss(g, w, h, 15);
  const sq = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) {
    const d = g[i] - m[i];
    sq[i] = d * d;
  }
  const v = gauss(sq, w, h, 15);
  const o = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) o[i] = ((g[i] - m[i]) / (Math.sqrt(v[i]) + 4)) * 40 + 128;
  return o;
}

function downsample2(src: Float32Array, w: number, h: number) {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const d = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const x0 = Math.min(w - 1, x * 2);
      const y0 = Math.min(h - 1, y * 2);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      d[y * nw + x] = (src[y0 * w + x0] + src[y0 * w + x1] + src[y1 * w + x0] + src[y1 * w + x1]) / 4;
    }
  return { d, w: nw, h: nh };
}

function bilinear(p: Float32Array, w: number, h: number, x: number, y: number): number {
  x = clamp(x, 0, w - 1);
  y = clamp(y, 0, h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = p[y0 * w + x0] * (1 - fx) + p[y0 * w + x1] * fx;
  const b = p[y1 * w + x0] * (1 - fx) + p[y1 * w + x1] * fx;
  return a * (1 - fy) + b * fy;
}

interface Flow { u: Float32Array; v: Float32Array; w: number; h: number }

/**
 * Dense coarse-to-fine Lucas-Kanade. For every pixel of T (the AI result)
 * returns the displacement into I (the original) so that I(p + f) ~ T(p).
 */
function denseFlow(T: Float32Array, I: Float32Array, w: number, h: number): Flow {
  const lt: { d: Float32Array; w: number; h: number }[] = [{ d: T, w, h }];
  const li: { d: Float32Array; w: number; h: number }[] = [{ d: I, w, h }];
  while (lt.length < 6) {
    const a = lt[lt.length - 1];
    if (Math.min(a.w, a.h) < 48) break;
    const b = li[li.length - 1];
    lt.push(downsample2(gauss(a.d, a.w, a.h, 0.8), a.w, a.h));
    li.push(downsample2(gauss(b.d, b.w, b.h, 0.8), b.w, b.h));
  }
  let u: Float32Array | null = null;
  let v: Float32Array | null = null;
  let pw = 0, ph = 0;
  for (let L = lt.length - 1; L >= 0; L--) {
    const lw = lt[L].w, lh = lt[L].h;
    const t = lt[L].d, img = li[L].d;
    const n = lw * lh;
    let cu = new Float32Array(n);
    let cv = new Float32Array(n);
    if (u && v) {
      for (let y = 0; y < lh; y++)
        for (let x = 0; x < lw; x++) {
          cu[y * lw + x] = bilinear(u, pw, ph, x / 2, y / 2) * 2;
          cv[y * lw + x] = bilinear(v, pw, ph, x / 2, y / 2) * 2;
        }
    }
    const R = Math.max(3, Math.round(6 - L * 0.5));
    const iters = L === 0 ? 2 : 4;
    for (let it = 0; it < iters; it++) {
      const warped = new Float32Array(n);
      for (let y = 0; y < lh; y++)
        for (let x = 0; x < lw; x++)
          warped[y * lw + x] = bilinear(img, lw, lh, x + cu[y * lw + x], y + cv[y * lw + x]);
      const ixx = new Float32Array(n), ixy = new Float32Array(n), iyy = new Float32Array(n);
      const ixt = new Float32Array(n), iyt = new Float32Array(n);
      for (let y = 0; y < lh; y++) {
        const ym = Math.max(0, y - 1), yp = Math.min(lh - 1, y + 1);
        for (let x = 0; x < lw; x++) {
          const xm = Math.max(0, x - 1), xp = Math.min(lw - 1, x + 1);
          const i = y * lw + x;
          const gx = 0.25 * (warped[y * lw + xp] - warped[y * lw + xm] + t[y * lw + xp] - t[y * lw + xm]);
          const gy = 0.25 * (warped[yp * lw + x] - warped[ym * lw + x] + t[yp * lw + x] - t[ym * lw + x]);
          const dt = warped[i] - t[i];
          ixx[i] = gx * gx; ixy[i] = gx * gy; iyy[i] = gy * gy;
          ixt[i] = gx * dt; iyt[i] = gy * dt;
        }
      }
      const sxx = boxBlur(ixx, lw, lh, R), sxy = boxBlur(ixy, lw, lh, R), syy = boxBlur(iyy, lw, lh, R);
      const sxt = boxBlur(ixt, lw, lh, R), syt = boxBlur(iyt, lw, lh, R);
      for (let i = 0; i < n; i++) {
        const a = sxx[i] + 25, d = syy[i] + 25, b = sxy[i];
        const det = a * d - b * b;
        cu[i] += clamp(-(d * sxt[i] - b * syt[i]) / det, -3, 3);
        cv[i] += clamp(-(a * syt[i] - b * sxt[i]) / det, -3, 3);
      }
      cu = boxBlur(cu, lw, lh, 2);
      cv = boxBlur(cv, lw, lh, 2);
    }
    u = cu; v = cv; pw = lw; ph = lh;
  }
  return { u: u!, v: v!, w: pw, h: ph };
}

export function restoreDetail(ref: Raster, out: Raster): RestoreResult {
  const W = out.width, H = out.height;
  const scale = Math.min(1, WORK_EDGE / Math.max(W, H));
  const mw = Math.max(32, Math.round(W * scale));
  const mh = Math.max(32, Math.round(H * scale));
  const kM = mw / REF_WIDTH;
  const kF = W / REF_WIDTH;

  const outM = resizeToPlanes(out, mw, mh);
  const refM = resizeToPlanes(ref, mw, mh);
  const gOut = luma(outM);
  const gRef = luma(refM);

  const flow = denseFlow(normalise(gOut, mw, mh), normalise(gRef, mw, mh), mw, mh);

  const warpedM: Float32Array[] = [0, 1, 2].map(() => new Float32Array(mw * mh));
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      const sx = x + flow.u[i], sy = y + flow.v[i];
      for (let c = 0; c < 3; c++) warpedM[c][i] = bilinear(refM[c], mw, mh, sx, sy);
    }
  const lWarp = luma(warpedM);
  const loO = gauss(lWarp, mw, mh, Math.max(0.6, 3 * kM));
  const loU = gauss(gOut, mw, mh, Math.max(0.6, 3 * kM));
  const hiSq = new Float32Array(mw * mh);
  for (let i = 0; i < hiSq.length; i++) {
    const d = lWarp[i] - loO[i];
    hiSq[i] = d * d;
  }
  const energy = gauss(hiSq, mw, mh, 6 * kM);
  const hpS = 12 * kM;
  const hpO = gauss(loO, mw, mh, hpS);
  const hpU = gauss(loU, mw, mh, hpS);
  const diffRaw = new Float32Array(mw * mh);
  for (let i = 0; i < diffRaw.length; i++) diffRaw[i] = Math.abs(loO[i] - hpO[i] - (loU[i] - hpU[i]));
  const diff = gauss(diffRaw, mw, mh, 8 * kM);
  let mask = new Float32Array(mw * mh);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = clamp((Math.sqrt(Math.max(0, energy[i])) - 3) / 6, 0, 1) * clamp(1 - (diff[i] - 6) / 12, 0, 1);
  }
  // Fine-scale structure gate. The coarse "diff" above is averaged over a wide
  // window, so a SMALL edit (fridge magnets, a scooter, a plant, a rug) barely
  // moves it and the original's edges for the removed thing leak back in as
  // ghost outlines. Here we require the AI's own fine detail to correlate with
  // the original's: where the original has detail but the AI has none/different
  // detail, the AI changed the content, so restoration is switched off (and the
  // zone is grown so no ring of ghosting survives at its borders).
  {
    const hO = new Float32Array(mw * mh);
    const hU = new Float32Array(mw * mh);
    for (let i = 0; i < hO.length; i++) {
      hO[i] = lWarp[i] - loO[i];
      hU[i] = gOut[i] - loU[i];
    }
    const sq = (a: Float32Array, b: Float32Array) => {
      const o = new Float32Array(a.length);
      for (let i = 0; i < o.length; i++) o[i] = a[i] * b[i];
      return gauss(o, mw, mh, Math.max(1.5, 4 * kM));
    };
    const cOO = sq(hO, hO), cUU = sq(hU, hU), cOU = sq(hO, hU);
    const bad = new Float32Array(mw * mh);
    for (let i = 0; i < bad.length; i++) {
      // Only judge where the original actually has fine detail.
      const present = clamp((Math.sqrt(Math.max(0, cOO[i])) - 1.5) / 2.5, 0, 1);
      const corr = cOU[i] / Math.sqrt(cOO[i] * cUU[i] + 9 * 9 + 1e-6);
      const agree = clamp((corr - 0.3) / 0.35, 0, 1);
      bad[i] = present * (1 - agree);
    }
    const grown = boxBlur(bad, mw, mh, Math.max(2, Math.round(8 * kM)));
    for (let i = 0; i < mask.length; i++) mask[i] *= clamp(1 - grown[i] * 4, 0, 1);
  }
  mask = gauss(mask, mw, mh, 4 * kM);

  let cov = 0;
  for (let i = 0; i < mask.length; i++) cov += mask[i];
  cov /= mask.length;

  const result = new Uint8ClampedArray(out.data);
  if (cov < 0.002) return { data: result, coverage: cov };

  const sigmaF = Math.max(0.8, 3 * kF);
  const margin = Math.ceil(sigmaF * 3) + 2;
  const BAND = 192;
  const fs = W / mw;
  const rx = ref.width / W, ry = ref.height / H;
  const rd = ref.data, od = out.data;

  for (let by = 0; by < H; by += BAND) {
    const y0 = Math.max(0, by - margin);
    const y1 = Math.min(H, by + BAND + margin);
    const bh = y1 - y0;
    let any = false;
    const my0 = Math.max(0, Math.floor(((by - 1) / H) * mh));
    const my1 = Math.min(mh - 1, Math.ceil(((by + BAND + 1) / H) * mh));
    for (let y = my0; y <= my1 && !any; y++)
      for (let x = 0; x < mw; x++)
        if (mask[y * mw + x] > 0.02) { any = true; break; }
    if (!any) continue;

    const n = W * bh;
    const warped = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    const orig = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let yy = 0; yy < bh; yy++) {
      const y = y0 + yy;
      const my = (y + 0.5) / fs - 0.5;
      for (let x = 0; x < W; x++) {
        const mx = (x + 0.5) / fs - 0.5;
        const fu = bilinear(flow.u, mw, mh, mx, my) * fs;
        const fv = bilinear(flow.v, mw, mh, mx, my) * fs;
        const sx = clamp((x + fu + 0.5) * rx - 0.5, 0, ref.width - 1);
        const sy = clamp((y + fv + 0.5) * ry - 0.5, 0, ref.height - 1);
        const xa = Math.floor(sx), ya = Math.floor(sy);
        const xb = Math.min(ref.width - 1, xa + 1), yb = Math.min(ref.height - 1, ya + 1);
        const ax = sx - xa, ay = sy - ya;
        const p00 = (ya * ref.width + xa) * 4, p10 = (ya * ref.width + xb) * 4;
        const p01 = (yb * ref.width + xa) * 4, p11 = (yb * ref.width + xb) * 4;
        const i = yy * W + x;
        const po = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const top = rd[p00 + c] * (1 - ax) + rd[p10 + c] * ax;
          const bot = rd[p01 + c] * (1 - ax) + rd[p11 + c] * ax;
          warped[c][i] = top * (1 - ay) + bot * ay;
          orig[c][i] = od[po + c];
        }
      }
    }
    const loW = warped.map((p) => gauss(p, W, bh, sigmaF));
    const loA = orig.map((p) => gauss(p, W, bh, sigmaF));
    for (let y = by; y < Math.min(H, by + BAND); y++) {
      const yy = y - y0;
      const my = (y + 0.5) / fs - 0.5;
      for (let x = 0; x < W; x++) {
        const m = bilinear(mask, mw, mh, (x + 0.5) / fs - 0.5, my);
        if (m < 0.01) continue;
        const i = yy * W + x;
        const po = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const hi = warped[c][i] - loW[c][i];
          const gain = clamp((loA[c][i] + 8) / (loW[c][i] + 8), 0.6, 1.6);
          result[po + c] = orig[c][i] * (1 - m) + (loA[c][i] + hi * gain) * m;
        }
      }
    }
  }
  return { data: result, coverage: cov };
}
