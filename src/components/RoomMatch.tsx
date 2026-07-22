"use client";

import { useCallback, useRef, useState } from "react";
import type { Mode } from "@/lib/prompts";
import { ACCEPTED_TYPES, COST_HINT } from "@/lib/config";
import { downscaleImage, triggerDownload, urlToBlob } from "@/lib/image";
import { buildZip } from "@/lib/zip";
import BeforeAfterSlider from "./BeforeAfterSlider";

type MatchStatus = "idle" | "processing" | "done" | "error";

interface MatchPhoto {
  id: string;
  fileName: string;
  previewUrl: string;
  dataUri: string;
  isAnchor: boolean;
  status: MatchStatus;
  resultUrl?: string;
  error?: string;
}

const MODE_LABEL: Record<Mode, string> = {
  interior: "Interior",
  exterior: "Exterior / Aerial",
};

/**
 * Room Match — link multiple angles of the SAME room so they get staged (or
 * restaged) consistently instead of each angle being generated in isolation.
 *
 * How it works: you pick one uploaded angle as the "anchor". The anchor gets
 * staged/restaged first (same Restage prompt as the regular tab, empty or
 * furnished). Every OTHER angle is then generated with a second image
 * attached — the anchor's finished result — and a prompt asking the model to
 * match furniture, style and colour palette to that reference while placing
 * things plausibly for its own camera angle.
 *
 * Honest limitation: none of the underlying models (Nano Banana included)
 * have real 3D understanding of a room, so this cannot guarantee
 * geometrically perfect placement across angles — it's a strong nudge toward
 * "same furniture, same style", not a guarantee. Expect to eyeball results
 * and retry individual angles more than with the other tabs.
 */
export default function RoomMatch() {
  const [photos, setPhotos] = useState<MatchPhoto[]>([]);
  const [mode, setMode] = useState<Mode>("interior");
  const [running, setRunning] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((id: string, p: Partial<MatchPhoto>) => {
    setPhotos((prev) => prev.map((ph) => (ph.id === id ? { ...ph, ...p } : ph)));
  }, []);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) =>
      (ACCEPTED_TYPES as readonly string[]).includes(f.type)
    );
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      try {
        const { dataUri } = await downscaleImage(file);
        setPhotos((prev) => [
          ...prev,
          {
            id,
            fileName: file.name,
            previewUrl,
            dataUri,
            isAnchor: false,
            status: "idle",
          },
        ]);
      } catch (err) {
        setPhotos((prev) => [
          ...prev,
          {
            id,
            fileName: file.name,
            previewUrl,
            dataUri: "",
            isAnchor: false,
            status: "error",
            error: err instanceof Error ? err.message : "Could not read this image.",
          },
        ]);
      }
    }
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // Switching anchors invalidates any results already generated against the
  // old one (they were matched to a different reference), so reset everyone.
  const setAnchor = useCallback((id: string) => {
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        isAnchor: p.id === id,
        status: "idle",
        resultUrl: undefined,
        error: undefined,
      }))
    );
  }, []);

  const resetAll = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setNotes({});
  }, []);

  const callProcess = useCallback(
    async (image: string, referenceImage: string | undefined, note?: string) => {
      const resp = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, mode, tab: "restage", referenceImage, note }),
      });
      const data = (await resp.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        throw new Error(data.error || `Request failed (HTTP ${resp.status}).`);
      }
      return data.url;
    },
    [mode]
  );

  const anchor = photos.find((p) => p.isAnchor);

  const runAll = useCallback(async () => {
    if (!anchor) return;
    setRunning(true);
    try {
      let anchorResultUrl = anchor.resultUrl;
      if (anchor.status !== "done") {
        patch(anchor.id, { status: "processing", error: undefined });
        try {
          anchorResultUrl = await callProcess(anchor.dataUri, undefined);
          patch(anchor.id, { status: "done", resultUrl: anchorResultUrl, error: undefined });
        } catch (err) {
          patch(anchor.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Processing failed.",
          });
          return; // nothing to match the other angles against
        }
      }

      const others = photos.filter((p) => !p.isAnchor && p.status !== "done" && p.dataUri);
      await Promise.all(
        others.map(async (p) => {
          patch(p.id, { status: "processing", error: undefined });
          try {
            const url = await callProcess(p.dataUri, anchorResultUrl);
            patch(p.id, { status: "done", resultUrl: url, error: undefined });
          } catch (err) {
            patch(p.id, {
              status: "error",
              error: err instanceof Error ? err.message : "Processing failed.",
            });
          }
        })
      );
    } finally {
      setRunning(false);
    }
  }, [anchor, photos, callProcess, patch]);

  const retryOne = useCallback(
    async (id: string) => {
      const photo = photos.find((p) => p.id === id);
      if (!photo) return;
      const note = notes[id]?.trim() || undefined;
      patch(id, { status: "processing", error: undefined });
      try {
        const referenceImage = photo.isAnchor ? undefined : anchor?.resultUrl;
        const url = await callProcess(photo.dataUri, referenceImage, note);
        patch(id, { status: "done", resultUrl: url, error: undefined });
        setNotes((prev) => ({ ...prev, [id]: "" }));
      } catch (err) {
        patch(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Processing failed.",
        });
      }
    },
    [photos, notes, anchor, callProcess, patch]
  );

  const downloadAll = useCallback(async () => {
    const done = photos.filter((p) => p.status === "done" && p.resultUrl);
    if (done.length === 0) return;
    setZipping(true);
    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      const used = new Set<string>();
      for (const p of done) {
        const blob = await urlToBlob(p.resultUrl!);
        const buf = new Uint8Array(await blob.arrayBuffer());
        const dot = p.fileName.lastIndexOf(".");
        const stem = dot > 0 ? p.fileName.slice(0, dot) : p.fileName;
        let name = `${stem}-matched.jpg`;
        let n = 1;
        while (used.has(name)) name = `${stem}-matched-${++n}.jpg`;
        used.add(name);
        entries.push({ name, data: buf });
      }
      const zip = buildZip(entries);
      const url = URL.createObjectURL(zip);
      triggerDownload(url, "room-match.zip");
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }, [photos]);

  const canRun = !!anchor && photos.length >= 2 && !running;
  const doneCount = photos.filter((p) => p.status === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Best-effort matching, not a guarantee.</p>
        <p className="mt-1">
          Upload every angle of one room, pick one photo as the anchor, then Stage &amp; Match.
          The anchor gets staged first; every other angle is generated using that finished anchor
          as a reference, aiming for the same furniture, style and colour palette. No AI model has
          real 3D understanding of a room, so placement won&apos;t be pixel-perfect across angles
          — eyeball the results and retry individual angles with a note if something&apos;s off.
        </p>
      </div>

      {/* Shot type — applies to every photo in this room. */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">Shot type:</span>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === m
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-8 text-center transition hover:border-neutral-400"
      >
        <p className="text-sm font-medium">
          Drag &amp; drop every angle of this room here, or click to choose
        </p>
        <p className="text-xs text-neutral-500">JPEG, PNG or WEBP · {COST_HINT} per angle</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {photos.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-500">
              {photos.length} angle{photos.length === 1 ? "" : "s"} · {doneCount} done
              {!anchor && photos.length >= 2 && " · pick an anchor below"}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={runAll}
                disabled={!canRun}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
              >
                {running ? "Staging & matching…" : "Stage & Match"}
              </button>
              <button
                onClick={downloadAll}
                disabled={doneCount === 0 || zipping}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-40"
              >
                {zipping ? "Zipping…" : `Download all (${doneCount})`}
              </button>
              <button
                onClick={resetAll}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50"
              >
                New room
              </button>
            </div>
          </div>

          {/* Grid */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <div
                key={p.id}
                className={`flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm ${
                  p.isAnchor ? "border-neutral-900" : "border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium" title={p.fileName}>
                    {p.fileName}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.isAnchor && (
                      <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">
                        Anchor
                      </span>
                    )}
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        p.status === "done"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "processing"
                            ? "bg-amber-100 text-amber-700"
                            : p.status === "error"
                              ? "bg-red-100 text-red-700"
                              : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {p.status === "idle"
                        ? "Idle"
                        : p.status === "processing"
                          ? "Processing…"
                          : p.status === "done"
                            ? "Done"
                            : "Error"}
                    </span>
                  </div>
                </div>

                {p.status === "done" && p.resultUrl ? (
                  <BeforeAfterSlider beforeUrl={p.previewUrl} afterUrl={p.resultUrl} />
                ) : (
                  <div className="relative overflow-hidden rounded-lg bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.previewUrl}
                      alt={p.fileName}
                      className={`block w-full ${p.status === "processing" ? "opacity-60" : ""}`}
                    />
                    {p.status === "processing" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                          {p.isAnchor ? "Staging…" : "Matching to anchor…"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {p.status === "error" && (
                  <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    {p.error ?? "Something went wrong."}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAnchor(p.id)}
                    disabled={p.isAnchor || running || !p.dataUri}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                      p.isAnchor
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white hover:bg-neutral-50"
                    }`}
                  >
                    {p.isAnchor ? "This is the anchor" : "Set as anchor"}
                  </button>
                  <button
                    onClick={() => removePhoto(p.id)}
                    disabled={running}
                    className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>

                {(p.status === "done" || p.status === "error") && p.dataUri && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={notes[p.id] ?? ""}
                      maxLength={500}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder='Retry with a note e.g. "match the rug colour too"'
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2.5 py-2 text-sm outline-none focus:border-neutral-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") retryOne(p.id);
                      }}
                    />
                    <button
                      onClick={() => retryOne(p.id)}
                      className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium transition active:scale-[0.99] hover:bg-neutral-50"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
