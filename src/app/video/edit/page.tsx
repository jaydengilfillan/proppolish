"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { triggerDownload, urlToBlob } from "@/lib/image";
import { CREATE_ENGINES } from "@/lib/videoCreate";
import { Job, api, useVideoStore } from "@/lib/videoStore";
import VideoNav from "../VideoNav";

const EDIT_ENGINES = [
  { id: "klingpro", label: "Kling Omni Edit (Pro)", cost: "$0.168/s" },
  { id: "klingstd", label: "Kling Omni Edit (Standard)", cost: "$0.126/s" },
];

const jobLabel = (j: Job) => {
  if (j.kind === "edit" && !j.params) return `Edited · ${EDIT_ENGINES.find((e) => e.id === j.engine.replace("edit-", ""))?.label ?? j.engine}`;
  return CREATE_ENGINES.find((e) => e.id === j.engine)?.label ?? j.engine;
};

export default function EditPage() {
  const { jobs, addJobs, patchJob, removeJob, clearFinished, track, prefs, addPref, togglePref, removePref, prefsText, history, logPrompt } = useVideoStore();
  const done = useMemo(() => jobs.filter((j) => j.status === "done" && j.videoUrl), [jobs]);
  const edits = useMemo(() => jobs.filter((j) => j.kind === "edit"), [jobs]);
  const [selId, setSelId] = useState<string | null>(null);
  const [change, setChange] = useState("");
  const [mode, setMode] = useState<"edit" | "rerun">("edit");
  const [editEngine, setEditEngine] = useState("klingpro");
  const [usePrefs, setUsePrefs] = useState(true);
  const [newPref, setNewPref] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sel = done.find((j) => j.id === selId) ?? null;
  const canRerun = !!sel?.params;
  const suggestions = useMemo(() => [...history].sort((a, b) => b.n - a.n).slice(0, 8), [history]);

  async function run() {
    if (!sel || !change.trim()) return;
    setBusy(true);
    setError(null);
    const prefBlock = usePrefs ? prefsText() : "";
    const id = `${Date.now()}-edit-${Math.random().toString(36).slice(2, 6)}`;
    logPrompt(change);
    try {
      if (mode === "rerun" && sel.params) {
        const params = { ...sel.params, prompt: `${sel.params.prompt.replace(/[.\s]+$/g, "")}. Change: ${change.trim()}` };
        addJobs([{ id, kind: "edit", engine: sel.engine, title: `Change: ${change.trim().slice(0, 70)}`, status: "waiting", createdAt: Date.now(), params, parentId: sel.id, change: change.trim() }]);
        const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/create", {
          engine: sel.engine,
          prompt: prefBlock ? `${params.prompt} ${prefBlock}` : params.prompt,
          refs: params.refs,
          startFromFirst: params.startFromFirst,
          secs: params.secs,
          aspect: params.aspect,
          audio: params.audio,
          final: params.final,
        });
        track(id, r.statusUrl, r.responseUrl);
      } else {
        addJobs([{ id, kind: "edit", engine: `edit-${editEngine}`, title: `Change: ${change.trim().slice(0, 70)}`, status: "waiting", createdAt: Date.now(), parentId: sel.id, change: change.trim() }]);
        const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/edit", {
          engine: editEngine,
          videoUrl: sel.videoUrl,
          change: change.trim(),
          prefs: prefBlock,
        });
        track(id, r.statusUrl, r.responseUrl);
      }
    } catch (e) {
      patchJob(id, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
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
          <p className="text-sm text-neutral-500">Pick a finished clip, type what to change, and your saved preferences are applied for you.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800">
          ← Photo tools
        </Link>
      </header>
      <VideoNav active="edit" />

      {/* Pick a clip */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">1. Pick a clip</h2>
        {done.length === 0 ? (
          <p className="text-sm text-neutral-500">Finished clips from Relight, Create and Edit show up here. Make one first.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {done.map((j) => (
              <button
                key={j.id}
                onClick={() => {
                  setSelId(j.id);
                  if (!j.params) setMode("edit");
                }}
                className={`w-44 shrink-0 rounded-lg border p-1.5 text-left ${selId === j.id ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-300 hover:border-neutral-500"}`}
              >
                <video src={j.videoUrl} muted playsInline className="w-full rounded bg-black" onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                <p className="mt-1 truncate text-xs font-medium">{jobLabel(j)}</p>
                <p className="truncate text-xs text-neutral-500">{j.title ?? j.look ?? ""}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Change */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">2. What should change?</h2>
        <textarea
          value={change}
          onChange={(e) => setChange(e.target.value)}
          rows={3}
          placeholder="e.g. Make the car a dark grey SUV and slow the camera down."
          className="w-full rounded-md border border-neutral-300 p-2 text-sm"
        />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((h) => (
              <button key={h.text} onClick={() => setChange(h.text)} className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-500" title={`Used ${h.n} time${h.n === 1 ? "" : "s"}`}>
                {h.text.length > 50 ? h.text.slice(0, 50) + "…" : h.text}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => addPref(change)} disabled={!change.trim()} className="mt-2 text-xs text-neutral-500 underline disabled:opacity-40">
          Remember this as a standing preference
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "edit"} onChange={() => setMode("edit")} /> Edit this clip (keeps the shot, changes only what you ask)
          </label>
          <label className={`flex items-center gap-2 ${canRerun ? "" : "opacity-40"}`}>
            <input type="radio" disabled={!canRerun} checked={mode === "rerun"} onChange={() => setMode("rerun")} /> Regenerate from the original prompt + this change
          </label>
        </div>
        {mode === "edit" && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            Engine
            <select value={editEngine} onChange={(e) => setEditEngine(e.target.value)} className="rounded border border-neutral-300 px-2 py-1">
              {EDIT_ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} · {e.cost}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-400">Clip must be 3-15s</span>
          </label>
        )}
        {prefs.some((p) => p.on) && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={usePrefs} onChange={(e) => setUsePrefs(e.target.checked)} /> Add my saved preferences ({prefs.filter((p) => p.on).length})
          </label>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => void run()} disabled={!sel || !change.trim() || busy} className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition disabled:opacity-40">
            {busy ? "Starting…" : "Apply change"}
          </button>
          {!sel && <span className="text-xs text-neutral-500">Pick a clip first.</span>}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </section>

      {/* Preferences */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">My preferences</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Standing instructions added to every Create and Edit prompt, e.g. &quot;slow smooth camera&quot; or &quot;keep cars realistic and parked straight&quot;. Saved in this browser. Your past prompts show up above as one-tap suggestions.
        </p>
        <div className="space-y-1.5">
          {prefs.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.on} onChange={() => togglePref(p.id)} />
              <span className={p.on ? "" : "text-neutral-400 line-through"}>{p.text}</span>
              <button onClick={() => removePref(p.id)} className="ml-auto text-neutral-400 hover:text-red-600">
                ✕
              </button>
            </div>
          ))}
          {prefs.length === 0 && <p className="text-sm text-neutral-400">None yet.</p>}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addPref(newPref);
            setNewPref("");
          }}
        >
          <input value={newPref} onChange={(e) => setNewPref(e.target.value)} placeholder="Add a preference…" className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
          <button className="rounded-md border border-neutral-300 px-3 py-1 text-sm">Add</button>
        </form>
      </section>

      {/* Edit results */}
      {edits.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Edits</h2>
            <button onClick={clearFinished} className="text-xs text-neutral-500 underline">
              Clear finished
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {edits.map((j) => (
              <div key={j.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{jobLabel(j)}</p>
                  <button onClick={() => removeJob(j.id)} title="Remove" className="text-neutral-400 hover:text-red-600">
                    ✕
                  </button>
                </div>
                {j.title && <p className="mb-2 line-clamp-2 text-xs text-neutral-500">{j.title}</p>}
                {j.status === "done" && j.videoUrl ? (
                  <>
                    <video src={j.videoUrl} controls loop muted className="w-full rounded-lg bg-black" />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => void download(j.videoUrl as string, `edit-${j.id.slice(-4)}.mp4`)} className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900">
                        Download
                      </button>
                      <button onClick={() => setSelId(j.id)} className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900">
                        Edit again
                      </button>
                    </div>
                  </>
                ) : j.status === "failed" ? (
                  <p className="text-xs text-red-600">{j.error}</p>
                ) : (
                  <p className="py-10 text-center text-xs text-neutral-500">{j.note ?? (j.status === "queued" ? "Queued at fal.ai…" : j.status === "running" ? "Generating… (usually 2-6 minutes)" : "Starting…")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
