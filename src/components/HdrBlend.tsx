"use client";

import { useCallback, useRef, useState } from "react";
import type { Tab } from "@/lib/prompts";
import { blendExposures, HdrBlendError, MIN_BRACKETS, MAX_BRACKETS } from "@/lib/hdrBlend";

interface StagedFile {
  file: File;
  previewUrl: string;
}

interface HdrBlendProps {
  /** Called with the blended JPEG once the user picks which tab to finish it in. */
  onSend: (file: File, tab: Tab) => void;
}

const SEND_TARGETS: { tab: Tab; label: string }[] = [
  { tab: "declutter", label: "Declutter" },
  { tab: "enhance", label: "Enhance" },
  { tab: "restage", label: "Restage" },
];

export default function HdrBlend({ onSend }: HdrBlendProps) {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [blending, setBlending] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [resultUrl, setResultUrl] = useState<string | undefined>();
  const [resultBlob, setResultBlob] = useState<Blob | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const addBracketFiles = useCallback((list: FileList | File[]) => {
    const files = Array.from(list);
    setStaged((prev) => [
      ...prev,
      ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    setError(undefined);
    setResultUrl(undefined);
    setResultBlob(undefined);
  }, []);

  const removeStaged = useCallback((idx: number) => {
    setStaged((prev) => {
      const next = [...prev];
      const removed = next.splice(idx, 1)[0];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setStaged((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      return [];
    });
    setResultUrl(undefined);
    setResultBlob(undefined);
    setError(undefined);
  }, []);

  const runBlend = useCallback(async () => {
    setBlending(true);
    setError(undefined);
    try {
      const blob = await blendExposures(
        staged.map((s) => s.file),
        setProgress
      );
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(
        err instanceof HdrBlendError
          ? err.message
          : "Could not blend these photos. Try a different bracket set."
      );
    } finally {
      setBlending(false);
      setProgress("");
    }
  }, [staged]);

  const sendTo = useCallback(
    (tab: Tab) => {
      if (!resultBlob) return;
      const file = new File([resultBlob], `hdr-blend-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onSend(file, tab);
      reset();
    },
    [resultBlob, onSend, reset]
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">
        Select {MIN_BRACKETS}–{MAX_BRACKETS} bracketed exposures of the{" "}
        <span className="font-medium text-neutral-700">
          same room, same tripod position
        </span>{" "}
        — this blends them into one balanced photo using real pixel data (no AI
        guessing), which you can then send to Declutter, Enhance, or Restage for
        finishing.
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-8 text-center transition hover:border-neutral-400"
      >
        <p className="text-sm font-medium">Choose bracket photos for one room</p>
        <p className="text-xs text-neutral-500">
          {MIN_BRACKETS}–{MAX_BRACKETS} JPEGs, same framing, different exposures
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addBracketFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {staged.map((s, i) => (
            <div key={s.previewUrl} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.previewUrl}
                alt=""
                className="h-20 w-20 rounded-lg object-cover"
              />
              <button
                onClick={() => removeStaged(i)}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-[10px] text-white"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {staged.length > 0 && !resultUrl && (
        <div className="flex items-center gap-3">
          <button
            onClick={runBlend}
            disabled={
              blending || staged.length < MIN_BRACKETS || staged.length > MAX_BRACKETS
            }
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
          >
            {blending ? progress || "Blending…" : `Blend ${staged.length} photos`}
          </button>
          <button
            onClick={reset}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium transition hover:bg-neutral-50"
          >
            Clear
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {resultUrl && (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Blended result"
            className="max-h-96 w-full rounded-lg object-contain"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500">Send blended photo to:</span>
            {SEND_TARGETS.map((t) => (
              <button
                key={t.tab}
                onClick={() => sendTo(t.tab)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50"
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={reset}
              className="ml-auto text-xs text-neutral-500 underline hover:text-neutral-700"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
