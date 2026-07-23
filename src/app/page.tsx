"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Job, JobStatus } from "@/lib/types";
import type { Mode, Tab, TwilightSky, TwilightStyle } from "@/lib/prompts";
import {
  ACCEPTED_TYPES,
  APP_NAME,
  APP_TAGLINE,
  COST_HINT,
  OPENAI_COST_HINT,
  MAX_EDGE,
} from "@/lib/config";
import type { Provider } from "@/lib/config";
import { downscaleImage, triggerDownload, urlToBlob } from "@/lib/image";
import { buildZip } from "@/lib/zip";
import JobCard from "@/components/JobCard";
import HdrBlend from "@/components/HdrBlend";
import RoomMatch from "@/components/RoomMatch";
import FloorPlan from "@/components/FloorPlan";

// How many images to process at once. Keeps the FAL account inside sane limits
// while still working through a 30-image batch quickly.
const CONCURRENCY = 3;

const TAB_LABEL: Record<Tab, string> = {
  declutter: "Declutter",
  enhance: "Enhance",
  restage: "Restage",
  twilight: "Twilight",
  general: "Prompt",
};

const SKY_LABEL: Record<TwilightSky, string> = {
  orange: "Orange sunset",
  purple: "Purple twilight",
};

const STYLE_LABEL: Record<TwilightStyle, string> = {
  natural: "Natural",
  golden: "Golden",
};

const MODE_LABEL: Record<Mode, string> = {
  interior: "Interior",
  exterior: "Exterior / Aerial",
};

/**
 * "process" = the normal Declutter/Enhance/Restage/Twilight upload + job grid.
 * "hdr" = the bracket-blending panel, which produces one merged photo that
 * then gets handed off into the "process" flow via HdrBlend's onSend.
 * "match" = Room Match: link multiple angles of one room so they get staged
 * consistently instead of independently. Self-contained, like "hdr".
 * "floorplan" = Floor Plan builder: hand-drawn shapes + typed labels,
 * rendered into a branded template. Zero AI calls, entirely client-side.
 */
type View = "process" | "hdr" | "match" | "floorplan";

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [view, setView] = useState<View>("process");
  const [activeTab, setActiveTab] = useState<Tab>("declutter");
  const [activeMode, setActiveMode] = useState<Mode>("interior");
  const [enhanceProvider, setEnhanceProvider] = useState<Provider>("fal");
  const [twilightSky, setTwilightSky] = useState<TwilightSky>("orange");
  const [twilightStyle, setTwilightStyle] = useState<TwilightStyle>("natural");
  const [generalProvider, setGeneralProvider] = useState<Provider>("fal");
  const [generalPrompt, setGeneralPrompt] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep a live ref to jobs so async workers read current state without stale closures.
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;

  const patchJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const processJob = useCallback(
    async (
      id: string,
      note?: string,
      snapshot?: Pick<
        Job,
        | "downscaledDataUri"
        | "mode"
        | "tab"
        | "provider"
        | "sky"
        | "style"
        | "customPrompt"
        | "width"
        | "height"
      >
    ) => {
      // Prefer an explicit snapshot (avoids a race where jobsRef hasn't yet
      // been updated by React's commit); fall back to the live ref for retries.
      const source = snapshot ?? jobsRef.current.find((j) => j.id === id);
      if (!source || !source.downscaledDataUri) return;
      patchJob(id, { status: "processing", error: undefined });
      try {
        const resp = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: source.downscaledDataUri,
            mode: source.mode,
            tab: source.tab,
            provider: source.provider,
            sky: source.sky,
            style: source.style,
            customPrompt: source.customPrompt,
            width: source.width,
            height: source.height,
            note,
          }),
        });
        const data = (await resp.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!resp.ok || !data.url) {
          throw new Error(data.error || `Request failed (HTTP ${resp.status}).`);
        }
        patchJob(id, { status: "done", resultUrl: data.url, error: undefined });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Processing failed.";
        patchJob(id, { status: "error", error: message });
      }
    },
    [patchJob]
  );

  /** Simple concurrency-limited runner over freshly created jobs. */
  const runBatch = useCallback(
    async (batch: Job[]) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < batch.length) {
          const job = batch[cursor++];
          await processJob(job.id, undefined, {
            downscaledDataUri: job.downscaledDataUri,
            mode: job.mode,
            tab: job.tab,
            provider: job.provider,
            sky: job.sky,
            style: job.style,
            customPrompt: job.customPrompt,
            width: job.width,
            height: job.height,
          });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker)
      );
    },
    [processJob]
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[], overrideTab?: Tab, overrideMode?: Mode) => {
      const tab = overrideTab ?? activeTab;
      const mode = overrideMode ?? activeMode;
      const files = Array.from(fileList).filter((f) =>
        (ACCEPTED_TYPES as readonly string[]).includes(f.type)
      );
      if (files.length === 0) return;

      // Prompt tab requires the user to type something before any photo can
      // be queued — there is no fallback template to fall back to.
      const trimmedGeneralPrompt = generalPrompt.trim();
      if (tab === "general" && !trimmedGeneralPrompt) return;

      const provider =
        tab === "enhance" ? enhanceProvider : tab === "general" ? generalProvider : undefined;

      setLoadingFiles(true);
      const newJobs: Job[] = [];
      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const originalUrl = URL.createObjectURL(file);
        try {
          const { dataUri, width, height } = await downscaleImage(file);
          newJobs.push({
            id,
            fileName: file.name,
            mode,
            tab,
            provider,
            sky: tab === "twilight" ? twilightSky : undefined,
            style: tab === "twilight" && mode === "interior" ? twilightStyle : undefined,
            customPrompt: tab === "general" ? trimmedGeneralPrompt : undefined,
            status: "queued",
            originalUrl,
            downscaledDataUri: dataUri,
            width,
            height,
          });
        } catch (err) {
          newJobs.push({
            id,
            fileName: file.name,
            mode,
            tab,
            provider,
            sky: tab === "twilight" ? twilightSky : undefined,
            style: tab === "twilight" && mode === "interior" ? twilightStyle : undefined,
            customPrompt: tab === "general" ? trimmedGeneralPrompt : undefined,
            status: "error",
            originalUrl,
            downscaledDataUri: "",
            error:
              err instanceof Error
                ? err.message
                : "Could not read this image.",
          });
        }
      }
      setLoadingFiles(false);
      setJobs((prev) => [...prev, ...newJobs]);

      const ready = newJobs.filter((j) => j.status === "queued");
      if (ready.length > 0) {
        // Process from the snapshot directly — do NOT depend on jobsRef being
        // committed yet (it may not be at this point).
        runBatch(ready);
      }
    },
    [runBatch, activeTab, activeMode, enhanceProvider, twilightSky, twilightStyle, generalProvider, generalPrompt]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const retry = useCallback(
    (id: string, note: string) => {
      processJob(id, note || undefined);
    },
    [processJob]
  );

  const clearAll = useCallback(() => {
    jobsRef.current
      .filter((j) => j.tab === activeTab)
      .forEach((j) => URL.revokeObjectURL(j.originalUrl));
    setJobs((prev) => prev.filter((j) => j.tab !== activeTab));
  }, [activeTab]);

  const visibleJobs = useMemo(
    () => jobs.filter((j) => j.tab === activeTab),
    [jobs, activeTab]
  );

  const doneJobs = useMemo(
    () => visibleJobs.filter((j) => j.status === "done" && j.resultUrl),
    [visibleJobs]
  );

  const counts = useMemo(() => {
    const c: Record<JobStatus, number> = {
      queued: 0,
      processing: 0,
      done: 0,
      error: 0,
    };
    for (const j of visibleJobs) c[j.status]++;
    return c;
  }, [visibleJobs]);

  const downloadAll = useCallback(async () => {
    if (doneJobs.length === 0) return;
    setZipping(true);
    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      const used = new Set<string>();
      for (const j of doneJobs) {
        if (!j.resultUrl) continue;
        const blob = await urlToBlob(j.resultUrl);
        const buf = new Uint8Array(await blob.arrayBuffer());
        let name = zipName(j.fileName);
        let n = 1;
        while (used.has(name)) name = zipName(j.fileName, ++n);
        used.add(name);
        entries.push({ name, data: buf });
      }
      const zip = buildZip(entries);
      const url = URL.createObjectURL(zip);
      triggerDownload(url, `${APP_NAME.toLowerCase()}-polished.zip`);
      URL.revokeObjectURL(url);
    } catch {
      // Non-fatal: individual Download buttons still work per card.
    } finally {
      setZipping(false);
    }
  }, [doneJobs]);

  const handleHandoffSend = useCallback(
    (file: File, tab: Tab) => {
      setActiveTab(tab);
      setView("process");
      addFiles([file], tab);
    },
    [addFiles]
  );

  const costHint =
    (activeTab === "enhance" && enhanceProvider === "openai") ||
    (activeTab === "general" && generalProvider === "openai")
      ? OPENAI_COST_HINT
      : COST_HINT;

  const promptRequiredButMissing = activeTab === "general" && !generalPrompt.trim();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-sm text-neutral-500">{APP_TAGLINE}</p>
      </header>

      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setView("process");
              setActiveTab(t);
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              view === "process" && activeTab === t
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
        <button
          onClick={() => setView("hdr")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            view === "hdr"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          HDR Blend
        </button>
        <button
          onClick={() => setView("match")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            view === "match"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          Room Match
        </button>
        <button
          onClick={() => setView("floorplan")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            view === "floorplan"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          Floor Plan
        </button>
      </div>

      {/* Interior / Exterior selector — applies to every tab except Prompt
          (which sends the user's own text with no template). Twilight needs
          this too now: interior dusk shots use a different prompt to
          exterior ones (interior must keep true wall colour, exterior
          repaints the sky). Set BEFORE uploading so new jobs are queued with
          the right prompt from the start (avoids paying twice: once for an
          auto-processed wrong mode, then again on Retry after switching it). */}
      {view === "process" && activeTab !== "general" && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-neutral-500">Shot type:</span>
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setActiveMode(m)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  activeMode === m
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "hdr" ? (
        <HdrBlend onSend={handleHandoffSend} />
      ) : view === "match" ? (
        <RoomMatch />
      ) : view === "floorplan" ? (
        <FloorPlan />
      ) : (
        <>
          {/* Enhance / Prompt tabs: model selector. Each tab remembers its
              own last-picked provider (enhanceProvider vs generalProvider)
              rather than sharing one, so switching tabs doesn't surprise you. */}
          {(activeTab === "enhance" || activeTab === "general") && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Model:</span>
              <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
                <button
                  onClick={() =>
                    activeTab === "enhance" ? setEnhanceProvider("fal") : setGeneralProvider("fal")
                  }
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    (activeTab === "enhance" ? enhanceProvider : generalProvider) === "fal"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  Nano Banana
                </button>
                <button
                  onClick={() =>
                    activeTab === "enhance"
                      ? setEnhanceProvider("openai")
                      : setGeneralProvider("openai")
                  }
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    (activeTab === "enhance" ? enhanceProvider : generalProvider) === "openai"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  ChatGPT
                </button>
              </div>
            </div>
          )}

          {/* Prompt tab: free-text prompt box. This IS the whole prompt sent
              to the model — no template, no guardrails — so a photo can't be
              queued until something is typed here. */}
          {activeTab === "general" && (
            <div className="mb-4 flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Prompt:</span>
              <textarea
                value={generalPrompt}
                onChange={(e) => setGeneralPrompt(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder='e.g. "Remove the wet/rain look from the driveway and make it look dry"'
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
              <p className="text-[11px] text-neutral-400">
                Sent to the model exactly as typed — no built-in decluttering or
                safety rules apply here, so describe exactly what you want.
              </p>
            </div>
          )}

          {/* Twilight tab: sky reference picker. Default is the orange sunset.
              For exterior shots this decides which reference image is sent
              alongside the photo; for interior shots it only informs the
              wording used to describe the window view (no image is sent for
              interior — see prompts.ts). */}
          {activeTab === "twilight" && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Sky:</span>
              <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
                {(Object.keys(SKY_LABEL) as TwilightSky[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setTwilightSky(s)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      twilightSky === s
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    {SKY_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Twilight interior only: Natural keeps walls at their true
              daytime colour (only fixtures glow warm). Golden allows a
              deliberate warm golden-hour glow across the whole room — this
              is the look picked after testing, not a bug being tolerated. */}
          {activeTab === "twilight" && activeMode === "interior" && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Look:</span>
              <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
                {(Object.keys(STYLE_LABEL) as TwilightStyle[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => setTwilightStyle(st)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      twilightStyle === st
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    {STYLE_LABEL[st]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!promptRequiredButMissing) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (promptRequiredButMissing) {
                e.preventDefault();
                setDragging(false);
                return;
              }
              onDrop(e);
            }}
            onClick={() => {
              if (promptRequiredButMissing) return;
              fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (promptRequiredButMissing) return;
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${
              promptRequiredButMissing
                ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60"
                : "cursor-pointer " +
                  (dragging
                    ? "border-neutral-900 bg-neutral-100"
                    : "border-neutral-300 bg-white hover:border-neutral-400")
            }`}
          >
            {promptRequiredButMissing ? (
              <p className="text-sm font-medium text-neutral-500">
                Type a prompt above first
              </p>
            ) : (
              <>
                <p className="text-base font-medium">
                  Drag &amp; drop photos here, or click to choose
                </p>
                <p className="text-xs text-neutral-500">
                  JPEG, PNG or WEBP · up to ~30 at a time · {costHint}
                </p>
                <p className="text-[11px] text-neutral-400">
                  Resized to {MAX_EDGE}px in your browser before upload. HEIC is
                  not supported in v1.
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              disabled={promptRequiredButMissing}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* Toolbar */}
          {visibleJobs.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="text-sm text-neutral-500">
                {visibleJobs.length} image{visibleJobs.length === 1 ? "" : "s"} ·{" "}
                {counts.done} done
                {counts.processing > 0 && ` · ${counts.processing} processing`}
                {counts.error > 0 && ` · ${counts.error} error`}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={downloadAll}
                  disabled={doneJobs.length === 0 || zipping}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
                >
                  {zipping
                    ? "Zipping…"
                    : `Download all (${doneJobs.length})`}
                </button>
                <button
                  onClick={clearAll}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {loadingFiles && (
            <p className="mt-4 text-sm text-neutral-500">Reading &amp; resizing images…</p>
          )}

          {/* Grid */}
          <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onRetry={retry}
              />
            ))}
          </section>
        </>
      )}

      {/* Footer note */}
      <footer className="mt-10 border-t border-neutral-200 pt-4 text-[11px] leading-relaxed text-neutral-400">
        Outputs are AI-edited. This tool declutters movable items and applies
        photographic finishing only — it is written to never remove permanent
        defects, alter structure, or change neighbouring property. Restage additionally replaces furniture and décor with styled equivalents in the same layout. HDR Blend combines your own bracket exposures using real pixel data — no AI is involved in that step. Twilight replaces the sky with your chosen reference and turns on existing exterior lighting only — it does not add fixtures or move anything. Prompt sends your own instruction to the model directly, with none of the built-in safety rules the other tabs apply — use it deliberately. Room Match links multiple angles of one room to the same staged furniture — a best effort, not a geometric guarantee, since no model here understands 3D space. Floor Plan has no AI involved at all — every shape and number is drawn and typed by you, rendered into a branded template. Always eyeball
        exterior shots: the model occasionally re-composes them — hit Retry if the
        framing changed.
      </footer>
    </main>
  );
}

function zipName(original: string, n = 1): string {
  const dot = original.lastIndexOf(".");
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const suffix = n > 1 ? `-${n}` : "";
  return `${stem}-polished${suffix}.jpg`;
}
