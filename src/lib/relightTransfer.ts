/**
 * "Original pixels + AI lighting" relight transfer.
 *
 * Generative models redraw every pixel, so foliage, grass and fine texture come
 * back with a painted/waxy look. This keeps the ORIGINAL photo's pixels and only
 * borrows the AI result's low-frequency light and colour: a smooth per-channel
 * gain field (blurred AI / blurred original, edge-aware via a guided filter) is
 * multiplied onto the full-resolution original. Sky pixels (identified from the
 * AI result) are taken from the AI directly, since a sky has no texture to lose.
 *
 * Pure typed-array code (no DOM) so it runs in a Web Worker and in Node tests.
 */
import type { Raster } from "./detailRestore";

const WORK_EDGE = 1600;
const SIGMA = 14;
const GF_R = 18;
const GF_EPS = 0.004;

type Planes = [Float32Array, Float32Array, Float32Array];

/** Area-average downscale to w*h, planar float 0..1. */
function toWork(src: Raster, w: number, h: number): Planes {
  const P: Planes = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * src.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++;
        }
      }
      const o = y * w + x;
      P[0][o] = r / n / 255; P[1][o] = g / n / 255; P[2][o] = b / n / 255;
    }
  }
  return P;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  const cl = (v: number, m: number) => (v < 0 ? 0 : v > m ? m : v);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[o + cl(k, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc * inv;
      acc += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)];
    }
  }
  const acc = new Float32Array(w);
  for (let k = -r; k <= r; k++) {
    const o = cl(k, h - 1) * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[o + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = acc[x] * inv;
    const add = Math.min(y + r + 1, h - 1) * w;
    const sub = Math.max(y - r, 0) * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[add + x] - tmp[sub + x];
  }
  return out;
}

/** Gaussian approximation: three box passes. */
function gauss(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / 3 + 1) - 1) / 2));
  let a = boxBlur(src, w, h, r);
  a = boxBlur(a, w, h, r);
  return boxBlur(a, w, h, r);
}

function guided(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const mI = boxBlur(I, w, h, r);
  const II = new Float32Array(n), Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mII = boxBlur(II, w, h, r);
  const mp = boxBlur(p, w, h, r);
  const mIp = boxBlur(Ip, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = mII[i] - mI[i] * mI[i];
    a[i] = (mIp[i] - mI[i] * mp[i]) / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxBlur(a, w, h, r);
  const mb = boxBlur(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ma[i] * I[i] + mb[i];
  return out;
}

function smooth(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Soft mask (0..1) of clear blue sky in the top of the AI result. */
function skyMask(A: Planes, w: number, h: number): Float32Array {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    if (y / h >= 0.7) continue;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = A[0][i], g = A[1][i], b = A[2][i];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (mx <= 0 || d <= 0) continue;
      const s = d / mx;
      let hue: number;
      if (mx === r) hue = 60 * (((g - b) / d + 6) % 6);
      else if (mx === g) hue = 60 * ((b - r) / d + 2);
      else hue = 60 * ((r - g) / d + 4);
      const v = smooth(s, 0.12, 0.3) * smooth(1 - Math.abs(hue - 215) / 55, 0, 0.6);
      m[i] = v > 0.5 ? 1 : 0;
    }
  }
  // erode 7x7 (separable min), then feather
  const er = (src: Float32Array, horiz: boolean) => {
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 1;
        for (let k = -3; k <= 3; k++) {
          const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
          const s = src[yy * w + xx];
          if (s < v) v = s;
        }
        o[y * w + x] = v;
      }
    return o;
  };
  return gauss(er(er(m, true), false), w, h, 4);
}

/**
 * Mask (0..1) of lawn the AI genuinely repaired: it is healthy green in the AI
 * result but was brown / dry / bare / patchy in the original. There the AI's
 * grass is wanted (patch repair or full re-lay); everywhere else the original's
 * own pixels stay.
 */
function lawnRepairMask(O: Planes, A: Planes, w: number, h: number): { mask: Float32Array; share: number } {
  const m = new Float32Array(w * h);
  const hsv = (P: Planes, i: number) => {
    const r = P[0][i], g = P[1][i], b = P[2][i];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hue = 0;
    if (d > 0) {
      if (mx === r) hue = 60 * (((g - b) / d + 6) % 6);
      else if (mx === g) hue = 60 * ((b - r) / d + 2);
      else hue = 60 * ((r - g) / d + 4);
    }
    return { hue, sat: mx > 0 ? d / mx : 0, gd: (g - Math.max(r, b)) / (g + 0.02) };
  };
  for (let y = 0; y < h; y++) {
    if (y / h < 0.3) continue;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = hsv(A, i);
      if (a.hue < 70 || a.hue > 150 || a.sat < 0.3) continue;
      const o = hsv(O, i);
      m[i] = smooth(a.gd - o.gd, 0.1, 0.25);
    }
  }
  // clean speckle (erode 5x5), then grow slightly and feather
  const er = (src: Float32Array, horiz: boolean) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 1;
        for (let k = -2; k <= 2; k++) {
          const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
          const sv = src[yy * w + xx];
          if (sv < v) v = sv;
        }
        out[y * w + x] = v;
      }
    return out;
  };
  const f = gauss(er(er(m, true), false), w, h, 5);
  let sum = 0;
  for (let i = 0; i < f.length; i++) { f[i] = Math.min(1, f[i] * 1.6); sum += f[i]; }
  return { mask: f, share: sum / f.length };
}

export interface RelightResult {
  data: Uint8ClampedArray;
  /** Mean sky weight 0..1 (informational). */
  skyShare: number;
}

/**
 * @param orig the original photo (ground truth for every pixel outside the sky)
 * @param ai   the AI result (same framing; any size)
 * Output has the original's dimensions.
 */
export function relightTransfer(orig: Raster, ai: Raster): RelightResult {
  const W = orig.width, H = orig.height;
  const sc = Math.min(1, WORK_EDGE / Math.max(W, H));
  const w = Math.max(8, Math.round(W * sc)), h = Math.max(8, Math.round(H * sc));
  const O = toWork(orig, w, h);
  const A = toWork(ai, w, h);

  const guide = new Float32Array(w * h);
  for (let i = 0; i < guide.length; i++) guide[i] = 0.299 * O[0][i] + 0.587 * O[1][i] + 0.114 * O[2][i];

  const ratio: Planes = [new Float32Array(0), new Float32Array(0), new Float32Array(0)];
  for (let c = 0; c < 3; c++) {
    const la = gauss(A[c], w, h, SIGMA), lo = gauss(O[c], w, h, SIGMA);
    const r = new Float32Array(w * h);
    for (let i = 0; i < r.length; i++) r[i] = (la[i] + 0.02) / (lo[i] + 0.02);
    const g = guided(guide, r, w, h, GF_R, GF_EPS);
    for (let i = 0; i < g.length; i++) g[i] = Math.min(3, Math.max(0.3, g[i]));
    ratio[c] = g;
  }
  const sky = skyMask(A, w, h);
  const lawn = lawnRepairMask(O, A, w, h);

  const out = new Uint8ClampedArray(W * H * 4);
  const bil = (P: Float32Array, fx: number, fy: number) => {
    const x0 = Math.min(w - 1, Math.max(0, Math.floor(fx))), y0 = Math.min(h - 1, Math.max(0, Math.floor(fy)));
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const a = P[y0 * w + x0] * (1 - tx) + P[y0 * w + x1] * tx;
    const b = P[y1 * w + x0] * (1 - tx) + P[y1 * w + x1] * tx;
    return a * (1 - ty) + b * ty;
  };
  let skySum = 0;
  const aw = ai.width, ah = ai.height;
  for (let y = 0; y < H; y++) {
    const fy = ((y + 0.5) * h) / H - 0.5;
    const ay = Math.min(ah - 1, Math.floor(((y + 0.5) * ah) / H));
    for (let x = 0; x < W; x++) {
      const fx = ((x + 0.5) * w) / W - 0.5;
      const i = (y * W + x) * 4;
      const sk = bil(sky, fx, fy);
      const lw = bil(lawn.mask, fx, fy);
      const s = Math.min(1, sk + lw * (1 - sk));
      skySum += sk;
      const ax = Math.min(aw - 1, Math.floor(((x + 0.5) * aw) / W));
      const ai4 = (ay * aw + ax) * 4;
      for (let c = 0; c < 3; c++) {
        const rel = Math.min(255, orig.data[i + c] * bil(ratio[c], fx, fy));
        out[i + c] = rel * (1 - s) + ai.data[ai4 + c] * s;
      }
      out[i + 3] = 255;
    }
  }
  return { data: out, skyShare: skySum / (W * H) };
}
