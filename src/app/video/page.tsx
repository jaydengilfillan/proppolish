"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { LOOKS, Look, SCENES, renderSphere } from "@/lib/videoLooks";
import { ENGINES, Engine, EngineId, FRAME_COST_USD, engineApplies, estimateUsd } from "@/lib/videoEngines";
import { triggerDownload, urlToBlob } from "@/lib/image";
import { Job, useVideoStore } from "@/lib/videoStore";
import VideoNav from "./VideoNav";

interface FrameState {
  status: "loading" | "done" | "failed";
  url?: string;
  error?: string;
}
interface Clip {
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
  firstFrame: string; // JPEG data URI
}

const MAX_SECS = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  if (!resp.ok) {
    const msg = (json as { error?: string } | null)?.error;
    throw new Error(msg || `Request failed (${resp.status})`);
  }
  return json as T;
}

/** Upload straight from the browser to fal storage (avoids Vercel's body limit). */
async function uploadToFal(blob: Blob, fileName: string): Promise<string> {
  const { uploadUrl, fileUrl } = await api<{ uploadUrl: string; fileUrl: string }>("/api/video/upload-init", {
    contentType: blob.type,
    fileName,
  });
  const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return fileUrl;
}

async function dataUriToBlob(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Could not read this video file."));
    v.src = url;
  });
}

async function readClip(file: File): Promise<Clip> {
  const url = URL.createObjectURL(file);
  const v = await loadVideo(url);
  v.currentTime = 0.05;
  await new Promise<void>((r) => {
    v.onseeked = () => r();
  });
  const scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * scale);
  c.height = Math.round(v.videoHeight * scale);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return {
    file,
    url,
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
    firstFrame: c.toDataURL("image/jpeg", 0.9),
  };
}

/**
 * Re-encodes the clip to a 720p MP4 in the browser (the video models want
 * 480p-720p, 2-15s, under 50 MB). Plays the clip into a canvas and records it,
 * so it takes about as long as the clip itself.
 */
async function prepareClip(file: File, secs: number, onProgress: (p: number) => void): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = await loadVideo(url);
    const long = Math.max(video.videoWidth, video.videoHeight);
    const scale = Math.min(1, 1280 / long);
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const mime = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01E", "video/mp4"].find((m) =>
      typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported(m) : false
    );
    if (!mime) throw new Error("This browser can't make MP4 clips. Use Chrome or Safari.");
    const dur = Math.min(video.duration, secs);
    const recorder = new MediaRecorder(canvas.captureStream(24), { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
    });
    video.currentTime = 0;
    await new Promise<void>((r) => {
      video.onseeked = () => r();
    });
    ctx.drawImage(video, 0, 0, w, h);
    recorder.start(500);
    await video.play();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        ctx.drawImage(video, 0, 0, w, h);
        onProgress(Math.min(1, video.currentTime / dur));
        if (video.currentTime >= dur - 0.04 || video.ended || performance.now() - started > (dur * 2 + 15) * 1000) {
          resolve();
          return;
        }
        if ("requestVideoFrameCallback" in video) (video as HTMLVideoElement).requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    video.pause();
    recorder.stop();
    return await done;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function VideoPage() {
  const [clip, setClip] = useState<Clip | null>(null);
  const [secs, setSecs] = useState(5);
  const [scene, setScene] = useState("auto");
  const [looks, setLooks] = useState<string[]>(["sunny"]);
  const [engines, setEngines] = useState<EngineId[]>(["klingpro"]);
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { jobs: allJobs, addJobs, patchJob, removeJob, clearFinished, track } = useVideoStore();
  const jobs = useMemo(() => allJobs.filter((j) => j.kind === "relight"), [allJobs]);
  const [frames, setFrames] = useState<Record<string, FrameState>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const preparedRef = useRef<{ key: string; url: string } | null>(null);

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("video/")) {
      setError("Drop a video file (MP4 or MOV).");
      return;
    }
    try {
      const c = await readClip(file);
      setClip(c);
      setSecs(Math.max(2, Math.min(5, Math.floor(c.duration))));
      setFrames({});
      preparedRef.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this video.");
    }
  }, []);

  const selectedLooks = useMemo(() => LOOKS.filter((l) => looks.includes(l.id)), [looks]);
  const selectedEngines = useMemo(() => ENGINES.filter((e) => engines.includes(e.id)), [engines]);
  const pairs = useMemo(
    () => selectedLooks.flatMap((l) => selectedEngines.filter((e) => engineApplies(e, l) && secs >= (e.minSecs ?? 0)).map((e) => ({ look: l, engine: e }))),
    [selectedLooks, selectedEngines, secs]
  );
  const cost = useMemo(() => {
    const frameLooks = new Set(pairs.filter((p) => p.engine.needsFrame).map((p) => p.look.id));
    let total = frameLooks.size * FRAME_COST_USD;
    for (const p of pairs) total += estimateUsd(p.engine, Math.min(secs, p.engine.maxSecs), final);
    return total;
  }, [pairs, secs, final]);

  async function generate() {
    if (!clip || pairs.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // 1) prepare + upload the clip (cached per length)
      const key = `${clip.file.name}-${clip.file.size}-${secs}`;
      let videoUrl = preparedRef.current?.key === key ? preparedRef.current.url : "";
      if (!videoUrl) {
        setStage("Preparing the clip… 0%");
        const blob = await prepareClip(clip.file, secs, (p) => setStage(`Preparing the clip… ${Math.round(p * 100)}%`));
        setStage("Uploading the clip…");
        videoUrl = await uploadToFal(blob, `clip-${Date.now()}.mp4`);
        preparedRef.current = { key, url: videoUrl };
      }

      // 2) create the job cards
      const newJobs: Job[] = pairs.map((p) => ({
        kind: "relight" as const,
        createdAt: Date.now(),
        id: `${Date.now()}-${p.engine.id}-${p.look.id}-${Math.random().toString(36).slice(2, 6)}`,
        engine: p.engine.id,
        look: p.look.id,
        status: "waiting" as const,
        note: p.engine.needsFrame ? "Waiting for the relit first frame" : "Starting",
      }));
      addJobs(newJobs);
      setStage("");

      // 3) relit first frames (one per look, shared by the engines that use them)
      const frameLooks = Array.from(new Set(pairs.filter((p) => p.engine.needsFrame).map((p) => p.look)));
      const frameUrls: Record<string, string | null> = {};
      await Promise.all(
        frameLooks.map(async (look) => {
          setFrames((f) => ({ ...f, [look.id]: { status: "loading" } }));
          try {
            const r = await api<{ url: string }>("/api/video/frame", {
              image: clip.firstFrame,
              look: look.id,
              scene,
              width: clip.width,
              height: clip.height,
            });
            frameUrls[look.id] = r.url;
            setFrames((f) => ({ ...f, [look.id]: { status: "done", url: r.url } }));
          } catch (e) {
            frameUrls[look.id] = null;
            setFrames((f) => ({ ...f, [look.id]: { status: "failed", error: e instanceof Error ? e.message : "Failed" } }));
          }
        })
      );

      // 4) start every job and poll it
      await Promise.all(
        newJobs.map(async (job) => {
          const engine = ENGINES.find((e) => e.id === job.engine) as Engine;
          const look = LOOKS.find((l) => l.id === job.look) as Look;
          try {
            let sphereUrl: string | undefined;
            if (engine.needsSphere) {
              sphereUrl = await uploadToFal(await dataUriToBlob(renderSphere(look)), `sphere-${look.id}.png`);
            }
            if (engine.needsFrame && !frameUrls[look.id]) throw new Error("The relit first frame failed, so this one couldn't start.");
            const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/start", {
              engine: engine.id,
              look: look.id,
              scene,
              videoUrl,
              frameUrl: frameUrls[look.id] ?? undefined,
              sphereUrl,
              secs,
              width: clip.width,
              height: clip.height,
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
      setStage("");
    } finally {
      setBusy(false);
    }
  }

  async function download(url: string, name: string) {
    try {
      const blob = await urlToBlob(url);
      const obj = URL.createObjectURL(blob);
      triggerDownload(obj, name);
      setTimeout(() => URL.revokeObjectURL(obj), 5000);
    } catch {
      window.open(url, "_blank");
    }
  }

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME} · Video relight</h1>
          <p className="text-sm text-neutral-500">
            Drop a clip, pick a look, and compare engines. Natural looks stay true to the scene; cinematic looks push it to hero lighting.
          </p>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800">
          ← Photo tools
        </Link>
      </header>

      <VideoNav active="relight" />

      {/* Clip */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        {!clip ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInput.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 px-6 py-14 text-center hover:border-neutral-500"
          >
            <p className="text-sm font-medium">Drop a video clip here, or click to choose</p>
            <p className="mt-1 text-xs text-neutral-500">MP4 or MOV. It gets prepared at 720p in your browser, so 4K clips are fine.</p>
            <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,420px)_1fr]">
            <video src={clip.url} controls muted className="w-full rounded-lg bg-black" />
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="font-medium">{clip.file.name}</p>
                <p className="text-xs text-neutral-500">
                  {clip.width}×{clip.height} · {clip.duration.toFixed(1)}s
                </p>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-neutral-600">Use the first</span>
                <input
                  type="number"
                  min={2}
                  max={Math.min(MAX_SECS, Math.floor(clip.duration))}
                  value={secs}
                  onChange={(e) => setSecs(Math.max(2, Math.min(MAX_SECS, Math.floor(clip.duration), Number(e.target.value) || 2)))}
                  className="w-16 rounded-md border border-neutral-300 px-2 py-1"
                />
                <span className="text-neutral-600">seconds (max {MAX_SECS}; cost scales with length)</span>
              </label>
              <button onClick={() => { setClip(null); setFrames({}); }} className="w-fit text-xs text-neutral-500 underline">
                Use a different clip
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Scene */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Scene</h2>
        <div className="flex flex-wrap gap-2">
          {SCENES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScene(s.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                scene === s.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"
              }`}
            >
              <span className="block font-medium">{s.label}</span>
              <span className={`block text-xs ${scene === s.id ? "text-neutral-300" : "text-neutral-500"}`}>{s.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Looks */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Look</h2>
        {(["natural", "cinematic"] as const).map((g) => (
          <div key={g} className="mb-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{g === "natural" ? "Natural" : "Cinematic hero"}</p>
            <div className="flex flex-wrap gap-2">
              {LOOKS.filter((l) => l.group === g).map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLooks((v) => toggle(v, l.id))}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    looks.includes(l.id) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  <span className="block font-medium">{l.label}</span>
                  <span className={`block text-xs ${looks.includes(l.id) ? "text-neutral-300" : "text-neutral-500"}`}>{l.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Engines */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Engines to trial</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ENGINES.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm hover:border-neutral-400">
              <input type="checkbox" className="mt-1" checked={engines.includes(e.id)} onChange={() => setEngines((v) => toggle(v, e.id))} />
              <span>
                <span className="block font-medium">
                  {e.label} <span className="text-xs font-normal text-neutral-400">~{money(estimateUsd(e, Math.min(secs, e.maxSecs), final))} per clip</span>
                </span>
                <span className="block text-xs text-neutral-500">{e.blurb}</span>
                {e.minSecs && secs < e.minSecs && engines.includes(e.id) && (
                  <span className="block text-xs text-amber-600">Needs at least {e.minSecs}s, so it will be skipped until you raise the length.</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} />
          <span>Final quality (1080p on Seedance and MiniMax, costs more)</span>
        </label>
      </section>

      {/* Go */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void generate()}
          disabled={!clip || busy || pairs.length === 0}
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {busy ? "Working…" : `Generate ${pairs.length} clip${pairs.length === 1 ? "" : "s"}`}
        </button>
        <span className="text-sm text-neutral-500">Estimated {money(cost)} USD in total (includes relit first frames). Rough, from fal's list prices.</span>
        {stage && <span className="text-sm text-neutral-700">{stage}</span>}
      </div>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Relit frames */}
      {Object.keys(frames).length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Relit first frames</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(frames).map(([id, f]) => (
              <div key={id} className="w-56 rounded-lg border border-neutral-200 bg-white p-2">
                <p className="mb-1 text-xs font-medium">{LOOKS.find((l) => l.id === id)?.label}</p>
                {f.status === "loading" && <p className="py-8 text-center text-xs text-neutral-500">Generating…</p>}
                {f.status === "failed" && <p className="text-xs text-red-600">{f.error}</p>}
                {f.status === "done" && f.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={id} className="w-full rounded" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
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
              const engine = ENGINES.find((e) => e.id === j.engine);
              const look = LOOKS.find((l) => l.id === j.look);
              return (
                <div key={j.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {look?.label} <span className="text-neutral-400">·</span> {engine?.label}
                    </p>
                    <button onClick={() => removeJob(j.id)} title="Remove" className="text-neutral-400 hover:text-red-600">
                      ✕
                    </button>
                  </div>
                  {j.status === "done" && j.videoUrl ? (
                    <>
                      <video src={j.videoUrl} controls loop muted className="w-full rounded-lg bg-black" />
                      <button
                        onClick={() => void download(j.videoUrl as string, `${look?.id}-${engine?.id}.mp4`)}
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
