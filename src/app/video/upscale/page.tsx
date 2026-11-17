"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { Job, api, useVideoStore } from "@/lib/videoStore";
import VideoNav from "../VideoNav";

const MODELS = [
  { id: "Proteus", label: "Proteus", blurb: "Best all-round. Cleans and sharpens, keeps the look." },
  { id: "Artemis HQ", label: "Artemis HQ", blurb: "Soft, noisy or compressed footage." },
  { id: "Gaia HQ", label: "Gaia HQ", blurb: "Already high quality footage, adds fine detail." },
  { id: "Nyx", label: "Nyx", blurb: "Noise reduction only." },
];

const money = (n: number) => `$${n.toFixed(2)}`;

interface Meta { name: string; w: number; h: number; secs: number; bytes: number }

function readMeta(file: File): Promise<Meta> {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      res({ name: file.name, w: v.videoWidth, h: v.videoHeight, secs: v.duration, bytes: file.size });
      URL.revokeObjectURL(u);
    };
    v.onerror = () => {
      rej(new Error("Could not read this video."));
      URL.revokeObjectURL(u);
    };
    v.src = u;
  });
}

export default function UpscalePage() {
  const { jobs, addJobs, patchJob, track, removeJob } = useVideoStore();
  const mine = useMemo(() => jobs.filter((j) => j.engine.startsWith("upscale")), [jobs]);
  const [queue, setQueue] = useState<{ file: File; meta: Meta }[]>([]);
  const [drag, setDrag] = useState(false);
  const [model, setModel] = useState("Proteus");
  const [factor, setFactor] = useState(2);
  const [h264, setH264] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement | null>(null);

  async function pick(files: FileList | File[] | null) {
    if (!files) return;
    setError("");
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("video/")) {
        setError(`${f.name} is not a video.`);
        continue;
      }
      try {
        const meta = await readMeta(f);
        setQueue((q) => [...q, { file: f, meta }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read this video.");
      }
    }
  }

  const costOf = (m: Meta) => m.secs * (Math.min(m.w, m.h) * factor <= 720 ? 0.01 : Math.min(m.w, m.h) * factor <= 1080 ? 0.02 : 0.08);
  const cost = queue.reduce((t, q) => t + costOf(q.meta), 0);

  async function runOne(f: File, m: Meta) {
    const id = `${Date.now()}-upscale-${Math.random().toString(36).slice(2, 6)}`;
    const title = `${m.name} · ${factor}x ${model}`;
    addJobs([{ id, kind: "edit", engine: "upscale-topaz", title, status: "waiting", note: "Uploading the original clip… (large files take a while)", createdAt: Date.now() } as Job]);
    try {
      const { uploadUrl, fileUrl } = await api<{ uploadUrl: string; fileUrl: string }>("/api/video/upload-init", { contentType: f.type || "video/mp4", fileName: f.name });
      const put = await fetch(uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type || "video/mp4" } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      patchJob(id, { note: "Starting the upscale…" });
      const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/upscale", { videoUrl: fileUrl, model, factor, h264, secs: m.secs, w: m.w, h: m.h });
      track(id, r.statusUrl, r.responseUrl);
    } catch (e) {
      patchJob(id, { status: "failed", error: e instanceof Error ? e.message : "Failed", note: undefined });
    }
  }

  function run() {
    const q = queue;
    setQueue([]);
    q.forEach(({ file, meta }) => void runOne(file, meta));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME} · Video</h1>
          <p className="text-sm text-neutral-500">Upscale and clean up a finished video, like Topaz. Same colours, same frame rate, just sharper and less fuzzy.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">← Photo tools</Link>
      </header>
      <VideoNav active="upscale" />

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">1. Your videos</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files); }}
          onClick={() => ref.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${drag ? "border-neutral-900 bg-neutral-50" : "border-neutral-300 hover:border-neutral-500"}`}
        >
          <p className="text-sm font-medium">Drop videos here, or click to choose</p>
          <p className="mt-1 text-xs text-neutral-500">Add several at once. Your original files are used, not reduced copies. Works well for 20 to 60 second clips.</p>
        </div>
        <input ref={ref} type="file" multiple accept="video/*" className="hidden" onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        {queue.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {queue.map((q, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-3 py-1.5">
                <span className="min-w-0 truncate">{q.meta.name} <span className="text-xs text-neutral-500">{q.meta.w}×{q.meta.h} · {q.meta.secs.toFixed(0)}s · about {money(costOf(q.meta))}</span></span>
                <button onClick={() => setQueue((l) => l.filter((_, k) => k !== i))} className="text-neutral-400 hover:text-red-600">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">2. Settings</h2>
        <div className="flex flex-wrap gap-2">
          {MODELS.map((m) => (
            <button key={m.id} onClick={() => setModel(m.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${model === m.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"}`}>
              <span className="block font-medium">{m.label}</span>
              <span className={`block text-xs ${model === m.id ? "text-neutral-300" : "text-neutral-500"}`}>{m.blurb}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2">Size
            <span className="flex overflow-hidden rounded border border-neutral-300">
              {[1.5, 2, 3, 4].map((n) => (<button key={n} onClick={() => setFactor(n)} className={`px-3 py-1 ${factor === n ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>{n}x</button>))}
            </span>
          </span>
          <label className="flex items-center gap-2"><input type="checkbox" checked={h264} onChange={(e) => setH264(e.target.checked)} />H.264 output (plays everywhere, best for uploading)</label>
        </div>
        <p className="mt-2 text-xs text-neutral-400">Frame rate is never changed. 2x is the sweet spot for a polished upload-ready version.</p>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={queue.length === 0} className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{queue.length > 1 ? `Upscale ${queue.length} videos` : "Upscale video"}</button>
        <span className="text-xs text-neutral-500">{queue.length ? `About ${money(cost)} in total (from fal's per-second list price).` : "Add videos first."} It runs in the background, so you can start another straight after.</span>
      </div>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {mine.map((j) => (
          <div key={j.id} className="rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium">{j.title}</span>
              <button onClick={() => removeJob(j.id)} className="text-neutral-400 hover:text-red-600">×</button>
            </div>
            {j.status === "done" && j.videoUrl ? (
              <>
                <video src={j.videoUrl} controls muted loop className="mt-2 w-full rounded bg-black" />
                <a href={j.videoUrl} download target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">Download</a>
                <p className="mt-1 text-xs text-neutral-400">It also shows in the Edit tab if you want to change something.</p>
              </>
            ) : j.status === "failed" ? (
              <p className="mt-2 text-xs text-red-600">{j.error}</p>
            ) : (
              <p className="py-8 text-center text-xs text-neutral-500">{j.note ?? "Upscaling… (a 60 second clip usually takes a few minutes)"}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
