"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { triggerDownload, urlToBlob } from "@/lib/image";

const MODELS = [
  { id: "Standard V2", label: "Standard V2", blurb: "Best for most photos" },
  { id: "High Fidelity V2", label: "High Fidelity V2", blurb: "Keeps fine detail in already-sharp photos" },
  { id: "Low Resolution V2", label: "Low Resolution V2", blurb: "Small or heavily compressed photos" },
  { id: "CGI", label: "CGI", blurb: "Renders and graphics" },
  { id: "Standard MAX", label: "Standard MAX", blurb: "Maximum quality (generative)" },
];

interface Item {
  id: string;
  name: string;
  origBytes: number;
  w: number;
  h: number;
  factor: number;
  format: "jpeg" | "png";
  auto: boolean;
  target: number;
  origUrl: string;
  finalUrl?: string;
  finalBytes?: number;
  finishing?: boolean;
  status: "uploading" | "queued" | "done" | "failed";
  statusUrl?: string;
  responseUrl?: string;
  imageUrl?: string;
  outBytes?: number | null;
  error?: string;
}

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 2 : 1)} MB`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const t = await r.text();
  let j: unknown = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* ignore */
  }
  if (!r.ok) throw new Error((j as { error?: string } | null)?.error || `Request failed (${r.status})`);
  return j as T;
}

function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const u = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      res({ w: i.naturalWidth, h: i.naturalHeight });
      URL.revokeObjectURL(u);
    };
    i.onerror = () => {
      res({ w: 2000, h: 1500 });
      URL.revokeObjectURL(u);
    };
    i.src = u;
  });
}

/** Pick an upscale factor so the finished JPEG lands near the target size (about 0.3 bytes per output pixel for an upscaled photo). */
function autoFactor(w: number, h: number, targetMb: number, plain = false): number {
  const px = (targetMb * 1048576) / (plain ? 0.2 : 0.3);
  const f = Math.sqrt(px / Math.max(1, w * h));
  return Math.min(plain ? 8 : 6, Math.max(2, Math.round(f * 2) / 2));
}

/** Encode a canvas as JPEG so it lands close to the target size (adjusts quality only). */
async function fitCanvas(c: HTMLCanvasElement, targetBytes: number): Promise<Blob> {
  const enc = (q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), "image/jpeg", q));
  let lo = 0.5;
  let hi = 1;
  let best: Blob | null = null;
  for (let i = 0; i < 6; i++) {
    const q = i === 0 ? 0.92 : (lo + hi) / 2;
    const b = await enc(q);
    if (b.size <= targetBytes * 1.1 && (!best || b.size > best.size)) best = b;
    if (b.size > targetBytes * 1.05) hi = q;
    else if (b.size < targetBytes * 0.95) lo = q;
    else {
      best = b;
      break;
    }
  }
  return best ?? (await enc(0.5));
}

/** Re-encode a JPEG so it lands close to the target size (the pixels stay the same). */
async function fitJpeg(blob: Blob, targetBytes: number): Promise<Blob> {
  if (blob.size >= targetBytes * 0.9 && blob.size <= targetBytes * 1.1) return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return fitCanvas(c, targetBytes);
}

/** Plain resize with no AI: smooth high-quality scaling, so textures and colours are not reinterpreted. */
async function plainUpscale(file: File, factor: number, targetBytes: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(factor, 16000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return fitCanvas(c, targetBytes);
}

export default function UpscalePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [style, setStyle] = useState<"faithful" | "enhance" | "plain">("faithful");
  const [model, setModel] = useState("Standard V2");
  const [factor, setFactor] = useState(4);
  const [auto, setAuto] = useState(true);
  const [target, setTarget] = useState(10);
  const [drag, setDrag] = useState(false);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [face, setFace] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const patch = (id: string, p: Partial<Item>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image.`);
        continue;
      }
      void start(file);
    }
  }

  async function start(file: File) {
    const id = `u${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
    const { w, h } = await imageSize(file);
    const plain = style === "plain";
    const f = auto ? autoFactor(w, h, target, plain) : factor;
    const fmt: "jpeg" | "png" = auto || plain ? "jpeg" : format;
    setItems((l) => [{ id, name: file.name, origBytes: file.size, w, h, factor: f, format: fmt, auto, target, origUrl: URL.createObjectURL(file), status: "uploading" }, ...l]);
    if (plain) {
      try {
        const out = await plainUpscale(file, f, target * 1048576);
        const u = URL.createObjectURL(out);
        patch(id, { status: "done", imageUrl: u, finalUrl: u, finalBytes: out.size });
      } catch (e) {
        patch(id, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
      }
      return;
    }
    try {
      const { uploadUrl, fileUrl } = await post<{ uploadUrl: string; fileUrl: string }>("/api/video/upload-init", { contentType: file.type, fileName: file.name });
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      const r = await post<{ statusUrl: string; responseUrl: string }>("/api/upscale", { imageUrl: fileUrl, model: style === "faithful" ? "High Fidelity V2" : model, faithful: style === "faithful", factor: f, format: fmt, face, w, h });
      patch(id, { status: "queued", statusUrl: r.statusUrl, responseUrl: r.responseUrl });
    } catch (e) {
      patch(id, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
    }
  }

  // poll running items
  useEffect(() => {
    const t = setInterval(async () => {
      for (const it of items) {
        if (it.status !== "queued" || !it.statusUrl) continue;
        try {
          const r = await fetch(`/api/upscale/status?statusUrl=${encodeURIComponent(it.statusUrl)}&responseUrl=${encodeURIComponent(it.responseUrl!)}`);
          const j = (await r.json()) as { status?: string; imageUrl?: string; fileSize?: number | null; error?: string };
          if (j.status === "DONE") {
            patch(it.id, { status: "done", imageUrl: j.imageUrl, outBytes: j.fileSize ?? null, finishing: it.auto });
            if (it.auto && j.imageUrl) void finish(it, j.imageUrl);
          }
          else if (j.status === "FAILED" || j.error) patch(it.id, { status: "failed", error: j.error ?? "Failed" });
        } catch {
          /* try again next tick */
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [items]);

  async function finish(it: Item, url: string) {
    try {
      const out = await fitJpeg(await urlToBlob(url), it.target * 1048576);
      patch(it.id, { finishing: false, finalUrl: URL.createObjectURL(out), finalBytes: out.size });
    } catch {
      patch(it.id, { finishing: false });
    }
  }

  async function download(it: Item) {
    if (!it.imageUrl) return;
    const base = it.name.replace(/\.[^.]+$/, "");
    if (it.finalUrl) {
      triggerDownload(it.finalUrl, `${base}-upscaled.jpg`);
      return;
    }
    try {
      const o = URL.createObjectURL(await urlToBlob(it.imageUrl));
      triggerDownload(o, `${base}-upscaled.${it.format === "png" ? "png" : "jpg"}`);
      setTimeout(() => URL.revokeObjectURL(o), 5000);
    } catch {
      window.open(it.imageUrl, "_blank");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME} · Upscale</h1>
          <p className="text-sm text-neutral-500">Turn small photos into large, detailed files. Drop in as many as you like. Auto mode aims each one at about 10 MB.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">← Photo tools</Link>
      </header>

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex overflow-hidden rounded border border-neutral-300 text-sm sm:w-fit">
          <button onClick={() => setAuto(true)} className={`px-4 py-1.5 ${auto ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>Auto: about {target} MB</button>
          <button onClick={() => setAuto(false)} className={`px-4 py-1.5 ${!auto ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>Custom</button>
        </div>
        {auto ? (
          <div className="mb-3 text-sm">
            <label className="flex items-center gap-2">Target size
              <input type="number" min={2} max={40} value={target} onChange={(e) => setTarget(Math.max(2, Math.min(40, Number(e.target.value) || 10)))} className="w-16 rounded border border-neutral-300 px-2 py-1" /> MB
            </label>
            <p className="mt-1 text-xs text-neutral-400">The size is picked for you from each photo's dimensions, then the JPEG is fine-tuned to land close to the target. Best for most photos.</p>
          </div>
        ) : (
          <div className="mb-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Size</p>
              <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
                {[2, 3, 4, 6].map((n) => (
                  <button key={n} onClick={() => setFactor(n)} className={`flex-1 px-3 py-1.5 ${factor === n ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>{n}x</button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">File type</p>
              <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
                <button onClick={() => setFormat("jpeg")} className={`flex-1 px-3 py-1.5 ${format === "jpeg" ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>JPEG</button>
                <button onClick={() => setFormat("png")} className={`flex-1 px-3 py-1.5 ${format === "png" ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>PNG (largest)</button>
              </div>
            </div>
          </div>
        )}
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Style</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["faithful", "Faithful (recommended)", "AI upscale with sharpening and clean-up turned off, so textures stay as shot"],
              ["plain", "Plain resize (no AI)", "Free and instant. Nothing is reinterpreted, just bigger and smooth"],
              ["enhance", "Enhance", "AI sharpening and clean-up. Can change textures"],
            ] as const).map(([id, label, blurb]) => (
              <button key={id} onClick={() => setStyle(id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${style === id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"}`}>
                <span className="block font-medium">{label}</span>
                <span className={`block max-w-[16rem] text-xs ${style === id ? "text-neutral-300" : "text-neutral-500"}`}>{blurb}</span>
              </button>
            ))}
          </div>
          {style === "enhance" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)} className={`rounded-full border px-3 py-1 text-xs ${model === m.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"}`} title={m.blurb}>{m.label}</button>
              ))}
            </div>
          )}
        </div>
        {style !== "plain" && <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={face} onChange={(e) => setFace(e.target.checked)} />Enhance faces (off by default, it can change how people look)</label>}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center ${drag ? "border-neutral-900 bg-neutral-50" : "border-neutral-300 hover:border-neutral-500"}`}
        >
          <p className="text-sm font-medium">Drop photos here, or click to choose</p>
          <p className="mt-1 text-xs text-neutral-500">Add as many as you like. Each starts straight away. About $0.10 to $0.40 each.</p>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium">{it.name}</span>
              <button onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} className="text-neutral-400 hover:text-red-600">×</button>
            </div>
            <p className="text-xs text-neutral-500">{it.w}×{it.h} · {mb(it.origBytes)} → {it.factor}x {it.format.toUpperCase()}{it.auto ? ` (aiming for ~${it.target} MB)` : ""}</p>
            {(it.status === "uploading" || it.status === "queued") && <p className="py-8 text-center text-xs text-neutral-500">{it.status === "uploading" ? "Uploading…" : "Upscaling… (usually under a minute or two)"}</p>}
            {it.status === "failed" && <p className="mt-2 text-xs text-red-600">{it.error}</p>}
            {it.status === "done" && it.imageUrl && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-0.5 text-[11px] text-neutral-400">Original</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.origUrl} alt="Original" className="max-h-60 w-full rounded object-contain" />
                  </div>
                  <div>
                    <p className="mb-0.5 text-[11px] text-neutral-400">Upscaled</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.imageUrl} alt="Upscaled" className="max-h-60 w-full rounded object-contain" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-neutral-600">
                  {it.finishing ? "Finishing to the target size…" : `Result: ${it.finalBytes ? mb(it.finalBytes) : it.outBytes ? mb(it.outBytes) : "size shown on download"}`} ({it.w * it.factor}×{it.h * it.factor} px)
                </p>
                <button onClick={() => void download(it)} disabled={it.finishing} className="mt-2 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Download</button>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
