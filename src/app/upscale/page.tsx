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

export default function UpscalePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [model, setModel] = useState("Standard V2");
  const [factor, setFactor] = useState(4);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [face, setFace] = useState(true);
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
    setItems((l) => [{ id, name: file.name, origBytes: file.size, w, h, factor, format, status: "uploading" }, ...l]);
    try {
      const { uploadUrl, fileUrl } = await post<{ uploadUrl: string; fileUrl: string }>("/api/video/upload-init", { contentType: file.type, fileName: file.name });
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      const r = await post<{ statusUrl: string; responseUrl: string }>("/api/upscale", { imageUrl: fileUrl, model, factor, format, face, w, h });
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
          if (j.status === "DONE") patch(it.id, { status: "done", imageUrl: j.imageUrl, outBytes: j.fileSize ?? null });
          else if (j.status === "FAILED" || j.error) patch(it.id, { status: "failed", error: j.error ?? "Failed" });
        } catch {
          /* try again next tick */
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [items]);

  async function download(it: Item) {
    if (!it.imageUrl) return;
    const base = it.name.replace(/\.[^.]+$/, "");
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
          <p className="text-sm text-neutral-500">Turn a small photo into a large, detailed, print-ready file. A 900 KB photo at 4x is typically around 10 MB or more.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">← Photo tools</Link>
      </header>

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Size</p>
            <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
              {[2, 3, 4, 6].map((n) => (
                <button key={n} onClick={() => setFactor(n)} className={`flex-1 px-3 py-1.5 ${factor === n ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>{n}x</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-neutral-400">Width and height are multiplied by this, so file size grows roughly with its square.</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">File type</p>
            <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
              <button onClick={() => setFormat("jpeg")} className={`flex-1 px-3 py-1.5 ${format === "jpeg" ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>JPEG (smaller)</button>
              <button onClick={() => setFormat("png")} className={`flex-1 px-3 py-1.5 ${format === "png" ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>PNG (largest, lossless)</button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">Use PNG if you want the biggest file.</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Mode</p>
          <div className="flex flex-wrap gap-2">
            {MODELS.map((m) => (
              <button key={m.id} onClick={() => setModel(m.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${model === m.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"}`}>
                <span className="block font-medium">{m.label}</span>
                <span className={`block text-xs ${model === m.id ? "text-neutral-300" : "text-neutral-500"}`}>{m.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={face} onChange={(e) => setFace(e.target.checked)} />Enhance faces (turn off for rooms and buildings)</label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white">+ Choose photos to upscale</button>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          <span className="text-xs text-neutral-500">Starts straight away. Add more while others run. About $0.10 to $0.40 each depending on the output size.</span>
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
            <p className="text-xs text-neutral-500">{it.w}×{it.h} · {mb(it.origBytes)} → {it.factor}x {it.format.toUpperCase()}</p>
            {(it.status === "uploading" || it.status === "queued") && <p className="py-8 text-center text-xs text-neutral-500">{it.status === "uploading" ? "Uploading…" : "Upscaling… (usually under a minute or two)"}</p>}
            {it.status === "failed" && <p className="mt-2 text-xs text-red-600">{it.error}</p>}
            {it.status === "done" && it.imageUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt="Upscaled" className="mt-2 max-h-72 w-full rounded object-contain" />
                <p className="mt-1 text-xs text-neutral-600">Result: {it.outBytes ? mb(it.outBytes) : "size shown on download"} ({it.w * it.factor}×{it.h * it.factor} px)</p>
                <button onClick={() => void download(it)} className="mt-2 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">Download</button>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
