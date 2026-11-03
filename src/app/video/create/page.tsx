"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { triggerDownload, urlToBlob } from "@/lib/image";
import { Job, useVideoStore } from "@/lib/videoStore";
import VideoNav from "../VideoNav";
import {
  Aspect,
  CREATE_ENGINES,
  CreateEngineId,
  MAX_REFS,
  PROMPT_STARTERS,
  estimateCreateUsd,
} from "@/lib/videoCreate";

interface Ref {
  id: string;
  name: string;
  preview: string; // object URL
  blob: Blob; // resized JPEG
  w: number;
  h: number;
  label: string;
}
const money = (n: number) => `$${n.toFixed(2)}`;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (!resp.ok) throw new Error((json as { error?: string } | null)?.error || `Request failed (${resp.status})`);
  return json as T;
}

async function uploadToFal(blob: Blob, fileName: string): Promise<string> {
  const { uploadUrl, fileUrl } = await api<{ uploadUrl: string; fileUrl: string }>("/api/video/upload-init", {
    contentType: blob.type,
    fileName,
  });
  const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return fileUrl;
}

/** Decode an image file and re-encode it as a JPEG with the long edge at most 2048px. */
async function prepImage(file: File): Promise<{ blob: Blob; w: number; h: number; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.92));
    return { blob, w, h, preview: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function nearestAspect(w: number, h: number): Aspect {
  const r = w / h;
  if (r > 1.25) return "16:9";
  if (r < 0.8) return "9:16";
  return "1:1";
}

export default function CreatePage() {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [prompt, setPrompt] = useState("");
  const [startFromFirst, setStartFromFirst] = useState(false);
  const [secs, setSecs] = useState(6);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [audio, setAudio] = useState(false);
  const [final, setFinal] = useState(false);
  const [takes, setTakes] = useState(1);
  const [engines, setEngines] = useState<CreateEngineId[]>(["kling3pro"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { jobs: allJobs, addJobs, removeJob, clearFinished, track, patchJob, prefs, prefsText, logPrompt } = useVideoStore();
  const jobs = useMemo(() => allJobs.filter((j) => j.kind === "create"), [allJobs]);
  const [usePrefs, setUsePrefs] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => CREATE_ENGINES.filter((e) => engines.includes(e.id)), [engines]);
  const cost = useMemo(
    () => selected.reduce((t, e) => t + estimateCreateUsd(e, secs, final, audio) * takes, 0),
    [selected, secs, final, audio, takes]
  );
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, MAX_REFS - refs.length);
    if (imgs.length === 0) return;
    try {
      const prepared = await Promise.all(imgs.map(prepImage));
      const added: Ref[] = prepared.map((p, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: imgs[i].name,
        preview: p.preview,
        blob: p.blob,
        w: p.w,
        h: p.h,
        label: "",
      }));
      if (refs.length === 0 && added[0]) setAspect(nearestAspect(added[0].w, added[0].h));
      setRefs((r) => [...r, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image.");
    }
  }

  async function generate() {
    if (!prompt.trim() || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const urls = await Promise.all(refs.map((r, i) => uploadToFal(r.blob, `ref-${i + 1}.jpg`)));
      const payloadRefs = refs.map((r, i) => ({ url: urls[i], label: r.label }));
      const params = { prompt, refs: payloadRefs, startFromFirst, secs, aspect, audio, final };
      const prefBlock = usePrefs ? prefsText() : "";
      const sentPrompt = prefBlock ? `${prompt.trim()} ${prefBlock}` : prompt;
      logPrompt(prompt);
      const newJobs: Job[] = selected.flatMap((e) =>
        Array.from({ length: takes }, () => ({
          id: `${Date.now()}-${e.id}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "create" as const,
          engine: e.id,
          title: prompt.trim().slice(0, 80),
          status: "waiting" as const,
          createdAt: Date.now(),
          params,
        }))
      );
      addJobs(newJobs);
      await Promise.all(
        newJobs.map(async (job) => {
          try {
            const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/create", {
              engine: job.engine,
              prompt: sentPrompt,
              refs: payloadRefs,
              startFromFirst,
              secs,
              aspect,
              audio,
              final,
            });
            track(job.id, r.statusUrl, r.responseUrl);
          } catch (e) {
            patchJob(job.id, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
          }
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function download(url: string, name: string) {
    try {
      const obj = URL.createObjectURL(await urlToBlob(url));
      triggerDownload(obj, name);
      setTimeout(() => URL.revokeObjectURL(obj), 5000);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME} · Video</h1>
          <p className="text-sm text-neutral-500">Write a prompt, add reference images, and compare engines.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800">
          ← Photo tools
        </Link>
      </header>
      <VideoNav active="create" />

      {/* References */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">Reference images</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Optional, up to {MAX_REFS}. Add the property shot, a car, a person, anything that must appear. Say what each one is so the model keeps it exact.
        </p>
        <div className="flex flex-wrap gap-3">
          {refs.map((r, i) => (
            <div key={r.id} className="w-48 rounded-lg border border-neutral-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.preview} alt={r.name} className="mb-2 h-28 w-full rounded object-cover" />
              <input
                value={r.label}
                onChange={(e) => setRefs((rs) => rs.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))}
                placeholder={i === 0 ? "e.g. the house facade" : "e.g. a white SUV"}
                className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
              />
              <button onClick={() => setRefs((rs) => rs.filter((x) => x.id !== r.id))} className="mt-1 text-xs text-neutral-400 hover:text-red-600">
                Remove
              </button>
            </div>
          ))}
          {refs.length < MAX_REFS && (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void addFiles(e.dataTransfer.files);
              }}
              className="flex h-[10.5rem] w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-center text-xs text-neutral-500 hover:border-neutral-500"
            >
              Drop images here
              <br />
              or click to choose
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files)} />
            </label>
          )}
        </div>
        {refs.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={startFromFirst} onChange={(e) => setStartFromFirst(e.target.checked)} />
            Start the clip exactly from the first image (it becomes the opening frame)
          </label>
        )}
      </section>

      {/* Prompt */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Prompt</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe the clip, e.g. Create a fun clip of the car driving into the driveway."
          className="w-full rounded-md border border-neutral-300 p-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {PROMPT_STARTERS.map((p) => (
            <button key={p.label} onClick={() => setPrompt(p.text)} className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-500">
              {p.label}
            </button>
          ))}
        </div>
        {prefs.some((p) => p.on) && (
          <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={usePrefs} onChange={(e) => setUsePrefs(e.target.checked)} />
            Add my saved preferences ({prefs.filter((p) => p.on).length}) to this prompt
          </label>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          You don&apos;t need @Image tags. Each reference is labelled automatically, and a keep-it-exact instruction is added.
        </p>
      </section>

      {/* Settings */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Settings</h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            Length
            <input type="range" min={4} max={30} value={secs} onChange={(e) => setSecs(Number(e.target.value))} />
            <span className="w-8 tabular-nums">{secs}s</span>
            <span className="text-xs text-neutral-400">(Kling 4.0 up to 30s; others cap at 15s)</span>
          </label>
          <label className="flex items-center gap-2">
            Shape
            <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} className="rounded border border-neutral-300 px-2 py-1">
              <option value="16:9">16:9 landscape</option>
              <option value="9:16">9:16 vertical</option>
              <option value="1:1">1:1 square</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Takes each
            <select value={takes} onChange={(e) => setTakes(Number(e.target.value))} className="rounded border border-neutral-300 px-2 py-1">
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} /> Generate sound
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> 1080p (Kling 4.0 / Seedance)
          </label>
        </div>
      </section>

      {/* Engines */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Engines</h2>
        <div className="flex flex-wrap gap-2">
          {CREATE_ENGINES.map((e) => (
            <button
              key={e.id}
              onClick={() => setEngines((v) => toggle(v, e.id))}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                engines.includes(e.id) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"
              }`}
            >
              <span className="block font-medium">{e.label}</span>
              <span className={`block text-xs ${engines.includes(e.id) ? "text-neutral-300" : "text-neutral-500"}`}>{e.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void generate()}
          disabled={busy || !prompt.trim() || selected.length === 0}
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {busy ? "Working…" : `Generate ${selected.length * takes} clip${selected.length * takes === 1 ? "" : "s"}`}
        </button>
        <span className="text-sm text-neutral-500">Estimated {money(cost)} USD in total. Rough, from fal&apos;s list prices.</span>
      </div>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {jobs.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Results</h2>
            <button onClick={clearFinished} className="text-xs text-neutral-500 underline">
              Clear finished
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => {
              const engine = CREATE_ENGINES.find((e) => e.id === j.engine);
              return (
                <div key={j.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{engine?.label}</p>
                    <button onClick={() => removeJob(j.id)} title="Remove" className="text-neutral-400 hover:text-red-600">
                      ✕
                    </button>
                  </div>
                  {j.title && <p className="mb-2 line-clamp-2 text-xs text-neutral-500">{j.title}</p>}
                  {j.status === "done" && j.videoUrl ? (
                    <>
                      <video src={j.videoUrl} controls loop muted className="w-full rounded-lg bg-black" />
                      <button
                        onClick={() => void download(j.videoUrl as string, `${j.engine}-${j.id.slice(-4)}.mp4`)}
                        className="mt-2 rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                      >
                        Download
                      </button>
                    </>
                  ) : j.status === "failed" ? (
                    <p className="text-xs text-red-600">{j.error}</p>
                  ) : (
                    <p className="py-10 text-center text-xs text-neutral-500">
                      {j.note ?? (j.status === "queued" ? "Queued at fal.ai…" : j.status === "running" ? "Generating… (usually 2-6 minutes)" : "Starting…")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
