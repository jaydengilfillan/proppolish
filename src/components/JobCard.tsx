"use client";

import { useState } from "react";
import type { Job } from "@/lib/types";
import { COST_HINT } from "@/lib/config";
import { triggerDownload, urlToBlob } from "@/lib/image";
import BeforeAfterSlider from "./BeforeAfterSlider";

interface Props {
  job: Job;
  onToggleMode: (id: string) => void;
  onRetry: (id: string, note: string) => void;
}

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Queued",
  processing: "Processing…",
  done: "Done",
  error: "Error",
};

const STATUS_STYLE: Record<Job["status"], string> = {
  queued: "bg-neutral-100 text-neutral-600",
  processing: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
};

export default function JobCard({ job, onToggleMode, onRetry }: Props) {
  const [note, setNote] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadResult() {
    if (!job.resultUrl) return;
    setDownloading(true);
    try {
      const blob = await urlToBlob(job.resultUrl);
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, downloadName(job.fileName));
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fall back to opening the URL directly if the cross-origin fetch fails.
      triggerDownload(job.resultUrl, downloadName(job.fileName));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium" title={job.fileName}>
          {job.fileName}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[job.status]}`}
        >
          {STATUS_LABEL[job.status]}
        </span>
          {job.tab === "enhance" && job.provider ? (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-600">
              {job.provider === "openai" ? "ChatGPT" : "Nano Banana"}
            </span>
          ) : null}
      </div>

      {/* Media area */}
      {job.status === "done" && job.resultUrl ? (
        <BeforeAfterSlider beforeUrl={job.originalUrl} afterUrl={job.resultUrl} />
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.originalUrl}
            alt={job.fileName}
            className={`block w-full ${job.status === "processing" ? "opacity-60" : ""}`}
          />
          {job.status === "processing" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                Polishing…
              </span>
            </div>
          )}
        </div>
      )}

      {job.status === "error" && (
        <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {job.error ?? "Something went wrong."}
        </p>
      )}

      {/* Mode toggle (only meaningful before/at queue time, but always available) */}
      <label className="flex items-center gap-2 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={job.mode === "exterior"}
          disabled={job.status === "processing"}
          onChange={() => onToggleMode(job.id)}
          className="h-3.5 w-3.5 rounded border-neutral-300"
        />
        Exterior / aerial shot
      </label>

      {/* Actions when done */}
      {job.status === "done" && job.resultUrl && (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownloadResult}
            disabled={downloading}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-50"
          >
            {downloading ? "Preparing…" : "Download"}
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder='Retry with a note e.g. "also remove the rug"'
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2.5 py-2 text-sm outline-none focus:border-neutral-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && note.trim()) {
                  onRetry(job.id, note.trim());
                  setNote("");
                }
              }}
            />
            <button
              onClick={() => {
                onRetry(job.id, note.trim());
                setNote("");
              }}
              className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium transition active:scale-[0.99] hover:bg-neutral-50"
            >
              Retry
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">
            {COST_HINT} · AI-edited image
          </p>
        </div>
      )}
    </div>
  );
}

function downloadName(original: string): string {
  const dot = original.lastIndexOf(".");
  const stem = dot > 0 ? original.slice(0, dot) : original;
  return `${stem}-polished.jpg`;
}
