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

async function downloadFile(url: string, name: string) {
  try {
    const o = URL.createObjectURL(await urlToBlob(url));
    triggerDownload(o, name);
    setTimeout(() => URL.revokeObjectURL(o), 5000);
  } catch {
    window.open(url, "_blank");
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
  const [placeEngine, setPlaceEngine] = useState<CastEngine>("seedream");
  const addRef = useRef<HTMLInputElement | null>(null);
  const { jobs, addJobs, track, patchJob } = useVideoStore();
  const [bkUrl, setBkUrl] = useState("");
  const [bkPreview, setBkPreview] = useState("");
  const [bkPrompt, setBkPrompt] = useState("Natural, subtle, realistic motion, gentle smooth camera movement.");
  const [bkEngine, setBkEngine] = useState("wan22");
  const [bkSecs, setBkSecs] = useState(5);
  const [bkAspect, setBkAspect] = useState("9:16");
  const [bkBusy, setBkBusy] = useState(false);
  const [bkError, setBkError] = useState("");
  const [bkJobs, setBkJobs] = useState<string[]>([]);
  const [bkPlace, setBkPlace] = useState(true);
  const [bkHasModel, setBkHasModel] = useState(false);
  const [bkAction, setBkAction] = useState("");
  const [bkStills, setBkStills] = useState<Record<string, string>>({});
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

  async function pickBackup(file: File | undefined) {
    if (!file) return;
    setBkBusy(true);
    setBkError("");
    try {
      const sc = await sceneFromFile(file);
      setBkUrl(await uploadToFal(sc.blob, `backup-${Date.now()}.jpg`));
      setBkPreview(sc.preview);
      setBkHasModel(false);
      setBkAspect(sc.w / sc.h > 1.2 ? "16:9" : sc.w / sc.h < 0.83 ? "9:16" : "1:1");
    } catch (e) {
      setBkError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBkBusy(false);
    }
  }

  /** Backup video: any still, any prompt, straight to a backup engine. */
  async function startBackup() {
    if (!bkUrl || !bkPrompt.trim()) return;
    const eng = CREATE_ENGINES.find((e) => e.id === bkEngine) ?? CREATE_ENGINES[0];
    const id = `${Date.now()}-backup-${Math.random().toString(36).slice(2, 6)}`;
    const refsStill = (u: string) => [{ url: u, label: "the opening frame" }];
    const job: Job = { id, kind: "create", engine: eng.id, title: `Backup: ${bkPrompt.trim().slice(0, 60)}`, status: "waiting", createdAt: Date.now(), note: bkPlace && active && !bkHasModel ? "Placing your model into the still first…" : undefined, retriesLeft: 0, attempts: 1 };
    addJobs([job]);
    setBkJobs((j) => [id, ...j]);
    try {
      let still = bkUrl;
      if (bkPlace && active && !bkHasModel) {
        const placeBody = { action: "place", engine: placeEngine, age: active.summary, sceneUrl: bkUrl, modelUrl: active.url, outfit: "", actionText: bkAction, tweak: "" };
        try {
          still = (await api<{ url: string }>("/api/cast", placeBody)).url;
        } catch {
          // blocked: reword what you typed and try once more
          patchJob(id, { note: "Filter refused it, rewording and retrying…" });
          still = (await api<{ url: string }>("/api/cast", { ...placeBody, actionText: await reword(bkAction), softer: true })).url;
        }
      }
      setBkStills((m) => ({ ...m, [id]: still }));
      patchJob(id, { note: undefined });
      const body = { engine: eng.id, prompt: `${bkAction.trim() ? "The person is " + bkAction.trim() + ". " : ""}${bkPrompt.trim()} Keep the person's face, hair, outfit and the whole scene consistent with the opening frame.`, refs: refsStill(still), startFromFirst: true, secs: bkSecs, aspect: bkAspect, audio: false, final: false };
      const r2 = await api<{ statusUrl: string; responseUrl: string }>("/api/video/create", body);
      track(id, r2.statusUrl, r2.responseUrl);
    } catch (e) {
      patchJob(id, { status: "failed", error: e instanceof Error ? e.message : "Failed", note: undefined });
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

      <Workbench saved={saved} activeId={activeId} setActiveId={setActiveId} />

      {/* Backup video */}
      <section className="mb-6 rounded-xl border border-dashed border-neutral-300 bg-white p-4">
        <h2 className="text-sm font-semibold">Backup video (only when the normal engines refuse)</h2>
        <p className="mb-3 text-xs text-neutral-500">Pick any still and send it straight to a different engine. Wan is an open model with its input and output safety checks switched off in the request. MiniMax is a separate provider with its checker off. Neither is guaranteed to accept every image, and fal can still enforce its own checks.</p>
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-40">
            <input type="file" accept="image/*,video/*" onChange={(e) => void pickBackup(e.target.files?.[0])} className="w-full text-xs" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {bkPreview && <img src={bkPreview} alt="Backup still" className="mt-2 w-full rounded" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={bkPlace && !bkHasModel} disabled={bkHasModel || !active} onChange={(e) => setBkPlace(e.target.checked)} />
              {bkHasModel ? "This still already has the model in it" : active ? `Place ${active.name} into this still first (keeps their exact outfit)` : "Choose a model above to place into the still"}
            </label>
            <input value={bkAction} onChange={(e) => setBkAction(e.target.value)} placeholder="What is the model doing? e.g. walking along the shore" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <textarea value={bkPrompt} onChange={(e) => setBkPrompt(e.target.value)} rows={2} className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" placeholder="What should move?" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select value={bkEngine} onChange={(e) => setBkEngine(e.target.value)} className="rounded border border-neutral-300 px-2 py-1">
                {CREATE_ENGINES.filter((e) => ["wan22", "minimaxh3", "seedance15", "kling3pro"].includes(e.id)).map((e) => (
                  <option key={e.id} value={e.id}>{e.label} (about ${estimateCreateUsd(e, bkSecs, false, false).toFixed(2)})</option>
                ))}
              </select>
              <select value={bkSecs} onChange={(e) => setBkSecs(Number(e.target.value))} className="rounded border border-neutral-300 px-2 py-1">
                {[3, 5, 8, 10].map((n) => (<option key={n} value={n}>{n} seconds</option>))}
              </select>
              <select value={bkAspect} onChange={(e) => setBkAspect(e.target.value)} className="rounded border border-neutral-300 px-2 py-1">
                {["16:9", "9:16", "1:1"].map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
              <button onClick={() => void startBackup()} disabled={!bkUrl || bkBusy || !bkPrompt.trim()} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Make backup video</button>
            </div>
            {bkError && <p className="text-xs text-red-600">{bkError}</p>}
          </div>
        </div>
        {bkJobs.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {bkJobs.map((id) => {
              const j = jobs.find((x) => x.id === id);
              if (!j) return null;
              return (
                <div key={id} className="rounded-lg border border-neutral-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {bkStills[id] && j.status !== "done" && <img src={bkStills[id]} alt="Opening frame" className="mb-2 w-full rounded" />}
                  {j.status === "done" && j.videoUrl ? (
                    <>
                      <video src={j.videoUrl} controls loop muted className="w-full rounded bg-black" />
                      <a href={j.videoUrl} download target="_blank" rel="noreferrer" className="mt-2 inline-block rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Download video</a>
                    </>
                  ) : j.status === "failed" ? (
                    <p className="text-xs text-red-600">{j.error}</p>
                  ) : (
                    <p className="py-6 text-center text-xs text-neutral-500">{j.note ?? "Making the video… (usually 1-6 minutes)"}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}


interface Scene { id: string; preview: string; url?: string; w: number; h: number; error?: string }
interface Gen {
  id: string; sceneId: string; scenePreview: string; sceneUrl: string; w: number; h: number;
  modelName: string; modelUrl: string; modelPreview: string; age: string;
  sceneText: string; outfit: string; action: string; engine: CastEngine; makeVideo: boolean; vidEngine: string; secs: number;
  status: "placing" | "done" | "error"; still?: string; error?: string; jobId?: string; tried: string[]; edit: string; editing?: boolean;
}

/** Workbench: pick scenes and models, set what you want, and click Generate as often as you like. Every click starts new runs in the background. */
function Workbench({ saved, activeId, setActiveId }: { saved: SavedModel[]; activeId: string | null; setActiveId: (id: string) => void }) {
  const { jobs, addJobs, track, patchJob } = useVideoStore();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selScenes, setSelScenes] = useState<string[]>([]);
  const [selModels, setSelModels] = useState<string[]>([]);
  const [outfit, setOutfit] = useState("");
  const [action, setAction] = useState("");
  const [sceneText, setSceneText] = useState("");
  const [takes, setTakes] = useState(1);
  const [placeEngine, setPlaceEngine] = useState<CastEngine>("seedream");
  const [makeVideo, setMakeVideo] = useState(true);
  const [vidEngine, setVidEngine] = useState("seedance15");
  const [secs, setSecs] = useState(5);
  const [gens, setGens] = useState<Gen[]>([]);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const placeEng = CAST_ENGINES.find((e) => e.id === placeEngine)!;

  // keep at least the active model selected
  useEffect(() => {
    if (selModels.length === 0 && activeId && saved.some((m) => m.id === activeId)) setSelModels([activeId]);
  }, [activeId, saved, selModels.length]);

  const patch = (id: string, p: Partial<Gen>) => setGens((g) => g.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function addScenes(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = `s${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      try {
        const sc = await sceneFromFile(file);
        setScenes((l) => [...l, { id, preview: sc.preview, w: sc.w, h: sc.h }]);
        setSelScenes((l) => [...l, id]);
        void uploadToFal(sc.blob, `scene-${Date.now()}.jpg`)
          .then((url) => setScenes((l) => l.map((x) => (x.id === id ? { ...x, url } : x))))
          .catch((e) => setScenes((l) => l.map((x) => (x.id === id ? { ...x, error: e instanceof Error ? e.message : "Upload failed" } : x))));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not read that file");
      }
    }
  }

  async function startVideo(g: Gen, still: string, engineOverride?: string) {
    const eng = CREATE_ENGINES.find((e) => e.id === (engineOverride ?? g.vidEngine)) ?? CREATE_ENGINES[0];
    const ratio = g.w && g.h ? g.w / g.h : 1.78;
    const aspect = ratio > 1.2 ? "16:9" : ratio < 0.83 ? "9:16" : "1:1";
    const prompt = `${g.action ? "The person is " + g.action.slice(0, 300) + ". " : ""}Natural, subtle, realistic motion: the person moves naturally and confidently in the scene with believable body movement, gentle smooth cinematic camera movement. Keep the person's face, hair, outfit and the whole scene exactly consistent with the opening frame. Photorealistic, no text.`;
    const refs = [{ url: still, label: "the opening frame" }];
    const body = { engine: eng.id, prompt, refs, startFromFirst: true, secs: g.secs, aspect, audio: false, final: false };
    const id = `${Date.now()}-cast-${Math.random().toString(36).slice(2, 6)}`;
    const job: Job = { id, kind: "create", engine: eng.id, title: `${g.modelName}: ${(g.action || g.outfit || "scene").slice(0, 60)}`, status: "waiting", createdAt: Date.now(), params: { prompt, refs, startFromFirst: true, secs: g.secs, aspect, audio: false, final: false }, retriesLeft: 0, attempts: 1, request: { path: "/api/video/create", body } };
    addJobs([job]);
    setGens((l) => l.map((x) => (x.id === g.id ? { ...x, jobId: id, tried: [...(engineOverride ? x.tried : []), eng.id] } : x)));
    try {
      const r = await api<{ statusUrl: string; responseUrl: string }>("/api/video/create", body);
      track(id, r.statusUrl, r.responseUrl);
    } catch (e) {
      patchJob(id, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function run(g: Gen, over?: { outfit?: string; action?: string; softer?: boolean }) {
    const o = over?.outfit ?? g.outfit;
    const a = over?.action ?? g.action;
    patch(g.id, { status: "placing", error: undefined, outfit: o, action: a, jobId: undefined, still: undefined });
    try {
      const r = g.sceneUrl
        ? await api<{ url: string }>("/api/cast", { action: "place", softer: over?.softer === true, age: g.age, engine: g.engine, sceneUrl: g.sceneUrl, modelUrl: g.modelUrl, outfit: o, actionText: a, tweak: "", width: g.w, height: g.h })
        : await api<{ url: string }>("/api/cast", { action: "newscene", softer: over?.softer === true, age: g.age, engine: g.engine, modelUrl: g.modelUrl, sceneText: g.sceneText, outfit: o, actionText: a });
      patch(g.id, { status: "done", still: r.url });
      if (g.makeVideo) void startVideo({ ...g, outfit: o, action: a }, r.url);
    } catch (e) {
      patch(g.id, { status: "error", error: e instanceof Error ? e.message : "Failed" });
    }
  }

  function generate() {
    setErr("");
    const sc = scenes.filter((s) => selScenes.includes(s.id) && s.url);
    const ms = saved.filter((m) => selModels.includes(m.id));
    if (ms.length === 0) return setErr("Tick at least one model.");
    // No scene ticked: one run per model that creates the scene from your description (or a fitting one).
    const list: { id: string; preview: string; url: string; w: number; h: number }[] = sc.length ? sc.map((s) => ({ id: s.id, preview: s.preview, url: s.url!, w: s.w, h: s.h })) : [{ id: "none", preview: "", url: "", w: 3, h: 4 }];
    const made: Gen[] = [];
    for (const s of list)
      for (const m of ms)
        for (let t = 0; t < takes; t++)
          made.push({ id: `g${Date.now()}${Math.random().toString(36).slice(2, 6)}`, sceneId: s.id, scenePreview: s.preview, sceneUrl: s.url, w: s.w, h: s.h, modelName: m.name, modelUrl: m.url, modelPreview: m.url, age: m.summary, sceneText, outfit, action, engine: placeEngine, makeVideo, vidEngine, secs, status: "placing", tried: [], edit: "" });
    setGens((l) => [...made, ...l]);
    made.forEach((g) => void run(g));
  }

  async function editStill(g: Gen) {
    const t = g.edit.trim();
    if (!g.still || !t) return;
    patch(g.id, { editing: true, edit: "" });
    try {
      const r = await api<{ url: string }>("/api/cast", { action: "editscene", age: g.age, engine: g.engine, imageUrl: g.still, change: t, width: g.w, height: g.h });
      patch(g.id, { editing: false, still: r.url });
    } catch (e) {
      patch(g.id, { editing: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  /** Use a finished image as a new scene, so a second model can be put into it. */
  function reuseAsScene(g: Gen) {
    if (!g.still) return;
    const id = `s${Date.now()}`;
    setScenes((l) => [...l, { id, preview: g.still!, url: g.still, w: g.w, h: g.h }]);
    setSelScenes([id]);
  }

  /** If a video is refused by a content filter, quietly retry it on the next engine. */
  const retriedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const CHAIN = ["seedance15", "kling3pro", "kling3std", "seedance_i2v", "wan22", "minimaxh3"];
    for (const g of gens) {
      if (!g.jobId || !g.still) continue;
      const j = jobs.find((x) => x.id === g.jobId);
      if (!j || j.status !== "failed" || retriedRef.current.has(j.id)) continue;
      if (!/content|policy|likeness|safety|moderat|flagged|blocked|partner/i.test(j.error ?? "")) continue;
      const next = CHAIN.find((c) => !g.tried.includes(c));
      retriedRef.current.add(j.id);
      if (next) void startVideo(g, g.still, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, gens]);

  const count = Math.max(1, selScenes.filter((id) => scenes.find((s) => s.id === id)?.url).length) * selModels.length * takes;
  const perCost = placeEng.cost + (makeVideo ? estimateCreateUsd(CREATE_ENGINES.find((e) => e.id === vidEngine) ?? CREATE_ENGINES[0], secs, false, false) : 0);
  const running = gens.filter((g) => g.status === "placing" || (g.jobId && jobs.find((j) => j.id === g.jobId && !["done", "failed"].includes(j.status)))).length;

  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">2. Scene workbench</h2>
        {running > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">{running} running in the background. Keep going.</span>}
      </div>

      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Scenes (optional: tick photos, or describe one below, or leave empty and one is created for you)</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {scenes.map((s) => (
          <div key={s.id} onClick={() => setSelScenes((l) => toggle(l, s.id))} className={`relative h-24 w-24 cursor-pointer overflow-hidden rounded-lg border-2 ${selScenes.includes(s.id) ? "border-neutral-900" : "border-neutral-200 opacity-70"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.preview} alt="Scene" className="h-full w-full object-cover" />
            {!s.url && !s.error && <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] text-white">Uploading…</span>}
            {s.error && <span className="absolute inset-x-0 bottom-0 bg-red-600 text-center text-[10px] text-white">Failed</span>}
            {selScenes.includes(s.id) && <span className="absolute left-1 top-1 rounded-full bg-neutral-900 px-1.5 text-[10px] text-white">✓</span>}
            <button onClick={(e) => { e.stopPropagation(); setScenes((l) => l.filter((x) => x.id !== s.id)); setSelScenes((l) => l.filter((x) => x !== s.id)); }} className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-neutral-600">×</button>
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-xs text-neutral-500 hover:border-neutral-500">
          <span className="text-xl leading-none">+</span>Add photos or clips
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { void addScenes(e.target.files); e.target.value = ""; }} />
      </div>

      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Models (tick one or more)</p>
      {saved.length === 0 ? (
        <p className="mb-4 text-xs text-neutral-500">Make or add a model above first.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {saved.map((m) => (
            <div key={m.id} onClick={() => { setSelModels((l) => toggle(l, m.id)); setActiveId(m.id); }} className={`relative w-20 cursor-pointer overflow-hidden rounded-lg border-2 ${selModels.includes(m.id) ? "border-neutral-900" : "border-neutral-200 opacity-70"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.name} className="h-24 w-full object-cover object-top" />
              <p className="truncate px-1 py-0.5 text-center text-[10px]">{m.name}</p>
              {selModels.includes(m.id) && <span className="absolute left-1 top-1 rounded-full bg-neutral-900 px-1.5 text-[10px] text-white">✓</span>}
            </div>
          ))}
        </div>
      )}

      <input value={sceneText} onChange={(e) => setSceneText(e.target.value)} disabled={selScenes.length > 0} placeholder={selScenes.length > 0 ? "Using your ticked scene photo(s)" : "Describe the scene (optional), e.g. a quiet Gold Coast beach at sunrise"} className="mb-2 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="What are they doing? e.g. running along the beach" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        <input value={outfit} onChange={(e) => setOutfit(e.target.value)} placeholder="Outfit: leave BLANK to keep the model's exact outfit" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {OUTFIT_CHIPS.map((c) => (
          <button key={c} onClick={() => setOutfit(outfit === c ? "" : c)} className={`rounded-full border px-2 py-0.5 text-[11px] ${outfit === c ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-500"}`}>{c}</button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 p-3 text-xs">
        <div className="flex overflow-hidden rounded border border-neutral-300">
          {CAST_ENGINES.map((e) => (
            <button key={e.id} onClick={() => setPlaceEngine(e.id)} className={`px-2 py-1 ${placeEngine === e.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>{e.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 font-medium"><input type="checkbox" checked={makeVideo} onChange={(e) => setMakeVideo(e.target.checked)} />Make the video too</label>
        <select value={vidEngine} onChange={(e) => setVidEngine(e.target.value)} disabled={!makeVideo} className="rounded border border-neutral-300 px-2 py-1">
          {CREATE_ENGINES.map((e) => (<option key={e.id} value={e.id}>{e.label}</option>))}
        </select>
        <select value={secs} onChange={(e) => setSecs(Number(e.target.value))} disabled={!makeVideo} className="rounded border border-neutral-300 px-2 py-1">
          {[3, 5, 8, 10].map((n) => (<option key={n} value={n}>{n}s</option>))}
        </select>
        <span className="flex items-center gap-1">Takes
          <span className="flex overflow-hidden rounded border border-neutral-300">
            {[1, 2, 3].map((n) => (<button key={n} onClick={() => setTakes(n)} className={`px-2 py-1 ${takes === n ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>{n}</button>))}
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={generate} className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white">
          Generate {count > 0 ? `${count} ` : ""}{count === 1 ? "run" : "runs"}
        </button>
        <span className="text-xs text-neutral-500">{count > 0 ? `About ${money(perCost * count)}. ` : ""}Never locks: change anything and click again to start more.</span>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      {gens.length > 0 && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gens.map((g) => {
            const j = g.jobId ? jobs.find((x) => x.id === g.jobId) : undefined;
            return (
              <div key={g.id} className="rounded-lg border border-neutral-200 p-2">
                <div className="mb-2 flex items-center gap-2 text-[11px] text-neutral-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {g.scenePreview ? <img src={g.scenePreview} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="rounded bg-neutral-100 px-1">new scene</span>}
                  <span>+</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.modelPreview} alt="" className="h-8 w-8 rounded object-cover object-top" />
                  <span className="min-w-0 flex-1 truncate">{g.modelName}{g.action ? `: ${g.action}` : ""}</span>
                  <button onClick={() => setGens((l) => l.filter((x) => x.id !== g.id))} className="text-neutral-400 hover:text-red-600">×</button>
                </div>
                {g.status === "placing" && <p className="py-16 text-center text-xs text-neutral-500">Placing the model…</p>}
                {g.status === "error" && (
                  <div>
                    <p className="text-xs text-red-600">{g.error}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button onClick={() => void run(g)} className="rounded border border-neutral-300 px-2 py-1 text-xs">Try again</button>
                      <button onClick={async () => void run(g, { outfit: await reword(g.outfit), action: await reword(g.action), softer: true })} className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white">Reword subtly and retry</button>
                    </div>
                  </div>
                )}
                {g.still && (
                  <>
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.still} alt="Result" className="w-full rounded" />
                      {g.editing && <span className="absolute inset-0 flex items-center justify-center rounded bg-white/70 text-xs">Editing…</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button onClick={() => void downloadFile(g.still!, `${g.modelName}-scene.png`)} className="rounded border border-neutral-300 px-2 py-1 text-[11px]">Download</button>
                      <button onClick={() => void run(g)} className="rounded border border-neutral-300 px-2 py-1 text-[11px]">Redo</button>
                      <button onClick={() => reuseAsScene(g)} className="rounded border border-neutral-300 px-2 py-1 text-[11px]" title="Use this image as a scene so you can put another model into it">Add another model to this</button>
                      <button onClick={() => void startVideo(g, g.still!)} className="rounded bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white">{g.jobId ? "Another video" : "Make video"}</button>
                    </div>
                    <div className="mt-1 flex gap-1">
                      <input value={g.edit} onChange={(e) => patch(g.id, { edit: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void editStill(g); }} placeholder="Edit this image, e.g. add a sarong" className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-[11px]" />
                      <button onClick={() => void editStill(g)} disabled={!g.edit.trim() || g.editing} className="rounded border border-neutral-300 px-2 py-1 text-[11px] disabled:opacity-40">Edit</button>
                    </div>
                    {g.error && g.status === "done" && <p className="mt-1 text-xs text-red-600">{g.error}</p>}
                  </>
                )}
                {j && (
                  <div className="mt-2 rounded border border-neutral-200 p-1">
                    {j.status === "done" && j.videoUrl ? (
                      <>
                        <video src={j.videoUrl} controls loop muted className="w-full rounded bg-black" />
                        <a href={j.videoUrl} download target="_blank" rel="noreferrer" className="mt-1 inline-block rounded border border-neutral-300 px-2 py-1 text-[11px]">Download video</a>
                      </>
                    ) : j.status === "failed" ? (
                      <div>
                        <p className="text-xs text-red-600">{j.error}</p>
                        <select defaultValue="" onChange={(e) => { if (e.target.value && g.still) void startVideo(g, g.still, e.target.value); e.target.value = ""; }} className="mt-1 rounded border border-neutral-300 px-1 py-1 text-[11px]">
                          <option value="">Retry on another engine…</option>
                          {CREATE_ENGINES.map((e) => (<option key={e.id} value={e.id}>{e.label}</option>))}
                        </select>
                      </div>
                    ) : (
                      <p className="py-5 text-center text-xs text-neutral-500">{j.note ?? "Making the video… (usually 2-6 minutes, keep working)"}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-400">Videos also appear in the Video tab under Create, where you can edit them.</p>
    </section>
  );
}
