"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { triggerDownload, urlToBlob } from "@/lib/image";
import { CAST_ENGINES, CastEngine, ModelSpec, OPTIONS, softenText } from "@/lib/videoCast";
import { CREATE_ENGINES, estimateCreateUsd } from "@/lib/videoCreate";
import { useVideoStore, Job } from "@/lib/videoStore";

interface SavedModel {
  id: string;
  name: string;
  url: string;
  engine: CastEngine;
  summary: string;
  width?: number;
  height?: number;
}
interface SceneRow {
  id: string;
  file?: File;
  preview?: string;
  sceneUrl?: string;
  width?: number;
  height?: number;
  outfit: string;
  action: string;
  tweak: string;
  tweakAll: string;
  result?: string;
  videoJobId?: string;
  busy: boolean;
  error?: string;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

/** Creative reword: an LLM rewrites the text in subtler catalogue wording with the same meaning; falls back to the plain word swap. */
async function reword(text: string): Promise<string> {
  if (!text.trim()) return text;
  try {
    const r = await api<{ text: string; changed?: boolean }>("/api/cast/reword", { text });
    if (r.changed && r.text) return r.text;
  } catch {
    /* fall through */
  }
  return softenText(text);
}

async function uploadToFal(blob: Blob, fileName: string): Promise<string> {
  const { uploadUrl, fileUrl } = await api<{ uploadUrl: string; fileUrl: string }>("/api/video/upload-init", { contentType: blob.type, fileName });
  const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return fileUrl;
}

/** A still image from a photo or a video clip's first frame, as a JPEG (long edge max 2048). */
async function sceneFromFile(file: File): Promise<{ blob: Blob; w: number; h: number; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    let el: CanvasImageSource;
    let sw: number;
    let sh: number;
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("Could not read this video."));
        v.src = url;
      });
      v.currentTime = 0;
      await new Promise<void>((res) => {
        v.onseeked = () => res();
      });
      el = v;
      sw = v.videoWidth;
      sh = v.videoHeight;
    } else {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("Could not read this image."));
        img.src = url;
      });
      el = img;
      sw = img.naturalWidth;
      sh = img.naturalHeight;
    }
    const k = Math.min(1, 2048 / Math.max(sw, sh));
    const w = Math.round(sw * k);
    const h = Math.round(sh * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(el, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), "image/jpeg", 0.92));
    return { blob, w, h, preview: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const money = (n: number) => `$${n.toFixed(2)}`;
const OUTFIT_CHIPS = ["a stylish summer dress", "a classic bikini", "a bikini with a sarong", "a one-piece swimsuit", "a tailored business suit", "smart casual shirt and chinos", "elegant evening wear", "activewear"];
const STORE_KEY = "cast-models-v1";

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export default function CastPage() {
  const [spec, setSpec] = useState<ModelSpec>({ gender: "woman", age: "30s", hairColour: "brunette", hairStyle: "long", build: "slim", outfit: "", extra: "", plainBase: true });
  const [outfitChips, setOutfitChips] = useState<string[]>([]);
  const [outfitText, setOutfitText] = useState("");
  const [activityChips, setActivityChips] = useState<string[]>([]);
  const [activityText, setActivityText] = useState("");
  const setActivity = (chips: string[], text: string) => {
    setActivityChips(chips);
    setActivityText(text);
    setSpec((sp) => ({ ...sp, activity: [...chips, text.trim()].filter(Boolean).join(", ") }));
  };
  const setOutfit = (chips: string[], text: string) => {
    setOutfitChips(chips);
    setOutfitText(text);
    setSpec((sp) => ({ ...sp, outfit: [...chips, text.trim()].filter(Boolean).join(", ") }));
  };
  const [engine, setEngine] = useState<CastEngine>("seedream");
  const [opts, setOpts] = useState<{ url?: string; busy: boolean; error?: string; change?: string }[]>([]);
    const [saved, setSaved] = useState<SavedModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<SceneRow[]>([{ id: "r1", outfit: "", action: "", tweak: "", tweakAll: "", busy: false }]);
  const [placeEngine, setPlaceEngine] = useState<CastEngine>("seedream");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addRef = useRef<HTMLInputElement | null>(null);
  const { jobs, addJobs, track, patchJob } = useVideoStore();
  const [makeVideo, setMakeVideo] = useState(true);
  const [vidEngine, setVidEngine] = useState("kling3pro");
  const [vidSecs, setVidSecs] = useState(5);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [looks, setLooks] = useState<string[]>([]);
  const [lookResults, setLookResults] = useState<{ look: string; url?: string; busy: boolean; error?: string }[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const list = JSON.parse(raw) as SavedModel[];
        setSaved(list);
        if (list[0]) setActiveId(list[0].id);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const persist = (list: SavedModel[]) => {
    setSaved(list);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  const eng = CAST_ENGINES.find((e) => e.id === engine)!;
  const placeEng = CAST_ENGINES.find((e) => e.id === placeEngine)!;
  const active = saved.find((m) => m.id === activeId) ?? null;

  async function generateOptions() {
    setOpts([0, 1, 2].map(() => ({ busy: true })));
    await Promise.all(
      [0, 1, 2].map(async (i) => {
        try {
          const r = await api<{ url: string }>("/api/cast", { action: "design", engine, spec, variant: i });
          setOpts((o) => o.map((x, j) => (j === i ? { busy: false, url: r.url, change: "" } : x)));
        } catch (e) {
          setOpts((o) => o.map((x, j) => (j === i ? { busy: false, error: e instanceof Error ? e.message : "Failed" } : x)));
        }
      })
    );
  }

  /** Change something on an option (outfit, hair, anything) without losing the person. */
  async function tweakOption(i: number, text: string) {
    const t = text.trim();
    const cur = opts[i]?.url;
    if (!t || !cur) return;
    setOpts((o) => o.map((x, j) => (j === i ? { ...x, busy: true, error: undefined } : x)));
    try {
      const r = await api<{ url: string }>("/api/cast", { action: "tweak", age: spec.age, engine, modelUrl: cur, change: t });
      setOpts((o) => o.map((x, j) => (j === i ? { busy: false, url: r.url, change: "" } : x)));
    } catch (e) {
      setOpts((o) => o.map((x, j) => (j === i ? { ...x, busy: false, error: e instanceof Error ? e.message : "Failed" } : x)));
    }
  }

  /** Retry a failed option with the description and extra text rewritten in plainer terms. */
  async function retryOption(i: number) {
    const softSpec: ModelSpec = { ...spec, outfit: spec.outfit ? await reword(spec.outfit) : "", extra: await reword(spec.extra) };
    setOpts((o) => o.map((x, j) => (j === i ? { busy: true } : x)));
    try {
      const r = await api<{ url: string }>("/api/cast", { action: "design", engine, spec: softSpec, variant: i, softer: true });
      setOpts((o) => o.map((x, j) => (j === i ? { busy: false, url: r.url, change: "" } : x)));
    } catch (e) {
      setOpts((o) => o.map((x, j) => (j === i ? { busy: false, error: e instanceof Error ? e.message : "Failed" } : x)));
    }
  }

  function choose(url: string) {
    const name = window.prompt("Name this model", `Model ${saved.length + 1}`)?.trim();
    if (!name) return;
    const m: SavedModel = { id: `${Date.now()}`, name, url, engine, summary: `${spec.age} ${spec.gender}, ${spec.hairColour} hair` };
    persist([m, ...saved]);
    setActiveId(m.id);
  }

  /** Add a real person (e.g. an agent screenshot) as a model. */
  async function addModel(file: File | undefined) {
    if (!file) return;
    setAddBusy(true);
    setAddError("");
    try {
      const sc = await sceneFromFile(file);
      const url = await uploadToFal(sc.blob, `model-${Date.now()}.jpg`);
      const name = window.prompt("Name this model", `Model ${saved.length + 1}`)?.trim() || `Model ${saved.length + 1}`;
      const m: SavedModel = { id: `${Date.now()}`, name, url, engine: "seedream", summary: "Added photo", width: sc.w, height: sc.h };
      persist([m, ...saved]);
      setActiveId(m.id);
      setLookResults([]);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAddBusy(false);
      if (addRef.current) addRef.current.value = "";
    }
  }

  async function runLook(i: number, l: string, softer = false) {
    if (!active) return;
    setLookResults((o) => o.map((x, j) => (j === i ? { look: l, busy: true } : x)));
    try {
      const r = await api<{ url: string }>("/api/cast", {
        action: "editscene",
        engine: "seedream",
        softer,
        age: active.summary,
        imageUrl: active.url,
        width: active.width,
        height: active.height,
        change: `Change the person's whole outfit to ${l}, fully replacing every garment they are wearing. Keep the same face, hair, body, pose and background`,
      });
      setLookResults((o) => o.map((x, j) => (j === i ? { look: l, busy: false, url: r.url } : x)));
    } catch (e) {
      setLookResults((o) => o.map((x, j) => (j === i ? { look: l, busy: false, error: e instanceof Error ? e.message : "Failed" } : x)));
    }
  }

  /** Generate the active model in each ticked outfit/style (Seedream), keeping the same person. */
  async function generateLooks() {
    if (!active || looks.length === 0) return;
    const list = [...looks];
    setLookResults(list.map((l) => ({ look: l, busy: true })));
    await Promise.all(list.map((l, i) => runLook(i, l)));
  }

  const patchRow = (id: string, p: Partial<SceneRow>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function pickScene(id: string, file: File | undefined) {
    if (!file) return;
    patchRow(id, { busy: true, error: undefined });
    try {
      const s = await sceneFromFile(file);
      const sceneUrl = await uploadToFal(s.blob, `scene-${Date.now()}.jpg`);
      patchRow(id, { file, preview: s.preview, sceneUrl, width: s.w, height: s.h, busy: false });
    } catch (e) {
      patchRow(id, { busy: false, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function place(row: SceneRow, tweak?: string, softer = false) {
    if (!active || !row.sceneUrl) return;
    const t = [row.tweakAll, tweak].filter(Boolean).join(". ");
    patchRow(row.id, { busy: true, error: undefined, tweak: "", tweakAll: t });
    try {
      const r = await api<{ url: string }>("/api/cast", {
        action: "place",
        softer,
        age: active.summary,
        engine: placeEngine,
        sceneUrl: row.sceneUrl,
        modelUrl: active.url,
        outfit: row.outfit,
        actionText: row.action,
        tweak: t,
        width: row.width,
        height: row.height,
      });
      patchRow(row.id, { busy: false, result: r.url });
      if (makeVideo) void startVideo(row, r.url);
    } catch (e) {
      patchRow(row.id, { busy: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  /** Turn the finished still (model already in the scene) straight into a video, in the background. */
  async function startVideo(row: SceneRow, stillUrl: string) {
    const eng = CREATE_ENGINES.find((e) => e.id === vidEngine) ?? CREATE_ENGINES[0];
    const ratio = row.width && row.height ? row.width / row.height : 1.78;
    const aspect = ratio > 1.2 ? "16:9" : ratio < 0.83 ? "9:16" : "1:1";
    const prompt = `${row.action ? "The person is " + row.action.slice(0, 300) + ". " : ""}Natural, subtle, realistic motion: the person moves naturally and confidently in the scene with believable body movement, gentle smooth cinematic camera movement. Keep the person's face, hair, outfit and the whole scene exactly consistent with the opening frame. Photorealistic, no text.`;
    const body = { engine: eng.id, prompt, refs: [{ url: stillUrl, label: "the opening frame" }], startFromFirst: true, secs: vidSecs, aspect, audio: false, final: false };
    const id = `${Date.now()}-cast-${Math.random().toString(36).slice(2, 6)}`;
    const job: Job = {
      id,
      kind: "create",
      engine: eng.id,
      title: `Model scene: ${(row.action || row.outfit || "scene").slice(0, 60)}`,
      status: "waiting",
      createdAt: Date.now(),
      params: { prompt, refs: body.refs, startFromFirst: true, secs: vidSecs, aspect, audio: false, final: false },
      retriesLeft: 0,
      attempts: 1,
      request: { path: "/api/video/create", body },
    };
    addJobs([job]);
    patchRow(row.id, { videoJobId: id });
    try {
      const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/create", body);
      track(id, r.statusUrl, r.responseUrl);
    } catch (e) {
      patchJob(id, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
    }
  }

  /** Edit the finished image itself (e.g. "add a sarong"): quick, keeps the person and scene. */
  async function editResult(row: SceneRow, text: string) {
    const t = text.trim();
    if (!row.result || !t) return;
    patchRow(row.id, { busy: true, error: undefined, tweak: "" });
    try {
      const r = await api<{ url: string }>("/api/cast", { action: "editscene", age: active?.summary, engine: placeEngine, imageUrl: row.result, change: t, width: row.width, height: row.height });
      patchRow(row.id, { busy: false, result: r.url });
    } catch (e) {
      patchRow(row.id, { busy: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function download(url: string, name: string) {
    try {
      const o = URL.createObjectURL(await urlToBlob(url));
      triggerDownload(o, name);
      setTimeout(() => URL.revokeObjectURL(o), 5000);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME} · Models</h1>
          <p className="text-sm text-neutral-500">Design a model once, then place the same person into different scenes and outfits. Every model is generated attractive, well groomed and stylishly dressed.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-2">
            <input ref={addRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => void addModel(e.target.files?.[0])} />
            <button onClick={() => addRef.current?.click()} disabled={addBusy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">{addBusy ? "Adding…" : "+ Add model"}</button>
            <Link href="/" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800">← Photo tools</Link>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </div>
      </header>

      {/* 1. Design */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">1. Design a model</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Select label="Gender" value={spec.gender} options={OPTIONS.gender} onChange={(v) => setSpec({ ...spec, gender: v })} />
          <Select label="Age" value={spec.age} options={OPTIONS.age} onChange={(v) => setSpec({ ...spec, age: v })} />
          <Select label="Hair colour" value={spec.hairColour} options={OPTIONS.hairColour} onChange={(v) => setSpec({ ...spec, hairColour: v })} />
          <Select label="Hair style" value={spec.hairStyle} options={OPTIONS.hairStyle} onChange={(v) => setSpec({ ...spec, hairStyle: v })} />
          <Select label="Build" value={spec.build} options={OPTIONS.build} onChange={(v) => setSpec({ ...spec, build: v })} />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-neutral-600">Outfit (optional): tick any, type your own, or leave blank</p>
          <div className="flex flex-wrap gap-2">
            {["bikini", "swimwear", "beachwear", "smart casual", "elegant", "business", "athleisure", "relaxed linen", "summer dress", "evening wear"].map((c) => (
              <label key={c} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${outfitChips.includes(c) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
                <input type="checkbox" className="hidden" checked={outfitChips.includes(c)} onChange={() => setOutfit(outfitChips.includes(c) ? outfitChips.filter((x) => x !== c) : [...outfitChips, c], outfitText)} />
                {c}
              </label>
            ))}
          </div>
          <input
            value={outfitText}
            onChange={(e) => setOutfit(outfitChips, e.target.value)}
            placeholder="Or describe your own, e.g. small olive triangle bikini, surf-brand editorial swim look"
            className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-neutral-600">Activity (optional): what they are doing, with props</p>
          <div className="flex flex-wrap gap-2">
            {["surfing, holding a surfboard", "cooking, holding a pan and chef's utensils", "walking a happy dog on a lead", "mid workout, holding a water bottle and towel", "holding house keys, welcoming and smiling"].map((c) => (
              <label key={c} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${activityChips.includes(c) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
                <input type="checkbox" className="hidden" checked={activityChips.includes(c)} onChange={() => setActivity(activityChips.includes(c) ? activityChips.filter((x) => x !== c) : [...activityChips, c], activityText)} />
                {c}
              </label>
            ))}
          </div>
          <input
            value={activityText}
            onChange={(e) => setActivity(activityChips, e.target.value)}
            placeholder="Or your own, e.g. carrying a tray of cocktails, sitting at a laptop on the deck"
            className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" checked={spec.plainBase} onChange={(e) => setSpec({ ...spec, plainBase: e.target.checked })} />
          <span>Plain base outfit: used only when no outfit is ticked or typed above, so no clothes get carried into your scenes.</span>
        </label>
        <textarea
          value={spec.extra}
          onChange={(e) => setSpec({ ...spec, extra: e.target.value })}
          rows={2}
          placeholder="Anything else? e.g. green eyes, freckles, sun-kissed skin, Mediterranean look"
          className="mt-3 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex overflow-hidden rounded border border-neutral-300">
            {CAST_ENGINES.map((e) => (
              <button key={e.id} onClick={() => setEngine(e.id)} className={`px-3 py-1.5 ${engine === e.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>
                {e.label} <span className="text-xs opacity-70">{money(e.cost)}</span>
              </button>
            ))}
          </div>
          <button onClick={() => void generateOptions()} disabled={opts.some((o) => o.busy)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            Generate 3 options ({money(eng.cost * 3)})
          </button>
          <span className="text-xs text-neutral-400">{eng.blurb}. Tip: run the same description on both engines to compare.</span>
        </div>
        {opts.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {opts.map((o, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 p-2">
                {o.busy && <p className="py-20 text-center text-xs text-neutral-500">Generating…</p>}
                {o.error && (
                  <>
                    <p className="text-xs text-red-600">{o.error}</p>
                    <button onClick={() => void retryOption(i)} className="mt-1 w-full rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white">Reword subtly and retry</button>
                  </>
                )}
                {o.url && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.url} alt={`Option ${i + 1}`} className="w-full rounded" />
                    <button onClick={() => choose(o.url!)} className="mt-2 w-full rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">Choose this one</button>
                    <textarea
                      value={o.change ?? ""}
                      onChange={(e) => setOpts((x) => x.map((y, j) => (j === i ? { ...y, change: e.target.value } : y)))}
                      rows={2}
                      placeholder="Change this one: e.g. red dress, shorter blonde hair, add sunglasses"
                      className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                    <button onClick={() => void tweakOption(i, o.change ?? "")} disabled={!(o.change ?? "").trim() || o.busy} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40">Apply to this one only ({money(eng.cost)})</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Saved models */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Your models</h2>
        {saved.length === 0 ? (
          <p className="text-xs text-neutral-500">Choose one of the options above and it is saved here. Saved in this browser.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {saved.map((m) => (
              <div key={m.id} className={`w-36 rounded-lg border p-2 ${m.id === activeId ? "border-neutral-900" : "border-neutral-200"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.name} onClick={() => setActiveId(m.id)} className="w-full cursor-pointer rounded" />
                <p className="mt-1 text-xs font-medium">{m.name}</p>
                <p className="text-[11px] text-neutral-500">{m.summary}</p>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <button onClick={() => setActiveId(m.id)} className={m.id === activeId ? "font-medium" : "underline"}>{m.id === activeId ? "In use" : "Use"}</button>
                  <button onClick={() => persist(saved.filter((x) => x.id !== m.id))} className="text-neutral-400 hover:text-red-600">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Looks for the active model */}
      {active && (
        <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Outfits and styles for {active.name}</h2>
          <p className="mb-2 text-xs text-neutral-500">Tick the looks you want, then generate. Keeps the same person and changes the clothing (ByteDance Seedream, about $0.04 each).</p>
          <div className="flex flex-wrap gap-2">
            {OUTFIT_CHIPS.concat(["a smart real estate agent outfit", "casual weekend wear", "a red dress", "driving-ready stylish casual wear"]).map((c) => (
              <label key={c} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${looks.includes(c) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
                <input type="checkbox" className="hidden" checked={looks.includes(c)} onChange={() => setLooks((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))} />
                {c}
              </label>
            ))}
          </div>
          <button onClick={() => void generateLooks()} disabled={looks.length === 0 || lookResults.some((r) => r.busy)} className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            Generate {looks.length || ""} look{looks.length === 1 ? "" : "s"}
          </button>
          {lookResults.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {lookResults.map((r, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 p-2">
                  <p className="mb-1 text-[11px] text-neutral-500">{r.look}</p>
                  {r.busy && <p className="py-16 text-center text-xs text-neutral-500">Generating…</p>}
                  {r.error && (
                    <>
                      <p className="text-xs text-red-600">{r.error}</p>
                      <button onClick={async () => void runLook(i, await reword(r.look), true)} className="mt-1 w-full rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white">Reword subtly and retry</button>
                    </>
                  )}
                  {r.url && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt={r.look} className="w-full rounded" />
                      <button onClick={() => void download(r.url!, `${active.name}-${i + 1}.jpg`)} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium">Download</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 2. Scenes */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">2. Put {active ? active.name : "your model"} into scenes</h2>
          <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
            {CAST_ENGINES.map((e) => (
              <button key={e.id} onClick={() => setPlaceEngine(e.id)} className={`px-3 py-1 ${placeEngine === e.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>
                {e.label} <span className="text-xs opacity-70">{money(e.cost)}</span>
              </button>
            ))}
          </div>
        </div>
        {!active && <p className="mb-3 text-xs text-amber-700">Choose a model first.</p>}
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 p-3 text-xs">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={makeVideo} onChange={(e) => setMakeVideo(e.target.checked)} />
            Make the video straight after (no second step)
          </label>
          <select value={vidEngine} onChange={(e) => setVidEngine(e.target.value)} disabled={!makeVideo} className="rounded border border-neutral-300 px-2 py-1">
            {CREATE_ENGINES.map((e) => (
              <option key={e.id} value={e.id}>{e.label} (about ${estimateCreateUsd(e, vidSecs, false, false).toFixed(2)})</option>
            ))}
          </select>
          <select value={vidSecs} onChange={(e) => setVidSecs(Number(e.target.value))} disabled={!makeVideo} className="rounded border border-neutral-300 px-2 py-1">
            {[3, 5, 8, 10, 15].map((n) => (
              <option key={n} value={n}>{n} seconds</option>
            ))}
          </select>
          <span className="text-neutral-400">Upload a still or a video. For a video the model is placed into its first frame and the video is made from that. Scenes run side by side.</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex gap-3">
                <div className="w-40 shrink-0">
                  {r.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.preview} alt="Scene" className="w-full rounded" />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded bg-neutral-100 text-xs text-neutral-400">No scene yet</div>
                  )}
                  <button onClick={() => fileRefs.current[r.id]?.click()} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                    {r.preview ? "Change scene" : "Choose photo or clip"}
                  </button>
                  <input ref={(el) => { fileRefs.current[r.id] = el; }} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => void pickScene(r.id, e.target.files?.[0])} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input value={r.action} onChange={(e) => patchRow(r.id, { action: e.target.value })} placeholder="What are they doing? e.g. walking in through the front door" className="rounded border border-neutral-300 px-2 py-1.5 text-xs" />
                  <input value={r.outfit} onChange={(e) => patchRow(r.id, { outfit: e.target.value })} placeholder="Leave BLANK to keep the model's exact outfit, or type a different one" className="rounded border border-neutral-300 px-2 py-1.5 text-xs" />
                  <div className="flex flex-wrap gap-1">
                    {OUTFIT_CHIPS.map((c) => (
                      <button key={c} onClick={() => patchRow(r.id, { outfit: c })} className="rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:border-neutral-500">{c}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => void place(r)} disabled={!active || !r.sceneUrl || r.busy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                  {r.busy ? "Working…" : makeVideo ? `Place model + make video (${money(placeEng.cost)} + video)` : `Place model (${money(placeEng.cost)})`}
                </button>
                {rows.length > 1 && <button onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))} className="text-xs text-neutral-400 underline">Remove</button>}
              </div>
              {r.error && (
                <div className="mt-2">
                  <p className="text-xs text-red-600">{r.error}</p>
                  <button
                    onClick={async () => {
                      const u = { ...r, outfit: await reword(r.outfit), action: await reword(r.action), tweakAll: await reword(r.tweakAll) };
                      patchRow(r.id, { outfit: u.outfit, action: u.action, tweakAll: u.tweakAll });
                      void place(u, undefined, true);
                    }}
                    className="mt-1 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Reword subtly and retry
                  </button>
                  <span className="ml-2 text-xs text-neutral-400">Your text is rewritten in subtler wording with the same meaning (shown above) and run again.</span>
                </div>
              )}
              {r.result && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.result} alt="Result" className="w-full rounded" />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button onClick={() => void download(r.result!, `model-scene-${r.id}.png`)} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Download</button>
                    <input value={r.tweak} onChange={(e) => patchRow(r.id, { tweak: e.target.value })} placeholder="Edit this image, e.g. add a sarong, make the dress red" className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-xs" />
                    <button onClick={() => void editResult(r, r.tweak)} disabled={r.busy || !r.tweak.trim()} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-40">Edit this ({money(placeEng.cost)})</button>
                    <button onClick={() => void place(r, r.tweak)} disabled={r.busy || !r.tweak.trim()} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-40">Redo from scratch</button>
                    <button onClick={() => void startVideo(r, r.result!)} className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white">Make video from this image</button>
                  </div>
                  {(() => {
                    const j = r.videoJobId ? jobs.find((x) => x.id === r.videoJobId) : undefined;
                    if (!j) return null;
                    return (
                      <div className="mt-3 rounded-lg border border-neutral-200 p-2">
                        {j.status === "done" && j.videoUrl ? (
                          <>
                            <video src={j.videoUrl} controls loop muted className="w-full rounded bg-black" />
                            <a href={j.videoUrl} download target="_blank" rel="noreferrer" className="mt-2 inline-block rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Download video</a>
                          </>
                        ) : j.status === "failed" ? (
                          <p className="text-xs text-red-600">{j.error}</p>
                        ) : (
                          <p className="py-6 text-center text-xs text-neutral-500">{j.note ?? (j.status === "queued" ? "Video queued…" : j.status === "running" ? "Making the video… (usually 2-6 minutes, you can keep working)" : "Starting the video…")}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
        {rows.length < 6 && (
          <button onClick={() => setRows((r) => [...r, { id: `r${Date.now()}`, outfit: "", action: "", tweak: "", tweakAll: "", busy: false }])} className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">+ Add another scene</button>
        )}
        <p className="mt-3 text-xs text-neutral-400">Videos also appear in the Video tab under Create, where you can edit them.</p>
      </section>
    </main>
  );
}
