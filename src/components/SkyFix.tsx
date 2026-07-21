"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "@/lib/prompts";
import { applySkyFix, type SkyFixRect } from "@/lib/skyFix";

interface SkyFixProps {
  onSend: (file: File, tab: Tab) => void;
}

const SEND_TARGETS: { tab: Tab; label: string }[] = [
  { tab: "declutter", label: "Declutter" },
  { tab: "enhance", label: "Enhance" },
  { tab: "restage", label: "Restage" },
];

const DISPLAY_MAX_WIDTH = 860;

export default function SkyFix({ onSend }: SkyFixProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState<SkyFixRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | undefined>();
  const [resultBlob, setResultBlob] = useState<Blob | undefined>();
  const [error, setError] = useState<string | undefined>();

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setSourceFile(null);
    setImgEl(null);
    setRect(null);
    setDragStart(null);
    setResultUrl(undefined);
    setResultBlob(undefined);
    setError(undefined);
  }, []);

  const pickFile = useCallback((file: File) => {
    setError(undefined);
    setResultUrl(undefined);
    setResultBlob(undefined);
    setRect(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      const scale = Math.min(1, DISPLAY_MAX_WIDTH / img.naturalWidth);
      setDisplaySize({
        width: Math.round(img.naturalWidth * scale),
        height: Math.round(img.naturalHeight * scale),
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
    setSourceFile(file);
  }, []);

  // Draw the source image + current selection rectangle onto the display canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl || displaySize.width === 0) return;
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(imgEl, 0, 0, displaySize.width, displaySize.height);
    if (rect) {
      const x = rect.x0 * displaySize.width;
      const y = rect.y0 * displaySize.height;
      const w = (rect.x1 - rect.x0) * displaySize.width;
      const h = (rect.y1 - rect.y0) * displaySize.height;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "rgba(59,130,246,0.15)";
      ctx.fillRect(x, y, w, h);
    }
  }, [imgEl, displaySize, rect]);

  const canvasPointToNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const box = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      const y = Math.max(0, Math.min(1, (clientY - box.top) / box.height));
      return { x, y };
    },
    []
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!imgEl) return;
      const p = canvasPointToNormalized(e.clientX, e.clientY);
      setDragStart(p);
      setRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    },
    [imgEl, canvasPointToNormalized]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragStart) return;
      const p = canvasPointToNormalized(e.clientX, e.clientY);
      setRect({
        x0: Math.min(dragStart.x, p.x),
        y0: Math.min(dragStart.y, p.y),
        x1: Math.max(dragStart.x, p.x),
        y1: Math.max(dragStart.y, p.y),
      });
    },
    [dragStart, canvasPointToNormalized]
  );

  const onPointerUp = useCallback(() => {
    setDragStart(null);
  }, []);

  const hasUsableRect = !!rect && rect.x1 - rect.x0 > 0.02 && rect.y1 - rect.y0 > 0.02;

  const runApply = useCallback(async () => {
    if (!imgEl || !rect || !hasUsableRect) return;
    setApplying(true);
    setError(undefined);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get a 2D canvas context in this browser.");
      ctx.drawImage(imgEl, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const fixed = applySkyFix(imageData, rect);
      ctx.putImageData(fixed, 0, 0);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95)
      );
      if (!blob) throw new Error("Could not encode the result.");
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the sky fix.");
    } finally {
      setApplying(false);
    }
  }, [imgEl, rect, hasUsableRect]);

  const downloadResult = useCallback(() => {
    if (!resultBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(resultBlob);
    a.download = `sky-fixed-${Date.now()}.jpg`;
    a.click();
  }, [resultBlob]);

  const sendTo = useCallback(
    (tab: Tab) => {
      if (!resultBlob) return;
      const file = new File([resultBlob], `sky-fixed-${Date.now()}.jpg`, { type: "image/jpeg" });
      onSend(file, tab);
      reset();
    },
    [resultBlob, onSend, reset]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">This is a deliberate departure from photographed conditions.</p>
        <p className="mt-1">
          Recolouring an overcast sky to look blue changes what was actually in front of the
          camera. Declutter and Enhance both refuse to touch skies for exactly this reason — this
          tool exists as a separate, explicit step so you decide, photo by photo, whether that
          tradeoff is right for a given listing and market.
        </p>
      </div>

      {!imgEl && (
        <div
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-8 text-center transition hover:border-neutral-400"
        >
          <p className="text-sm font-medium">Choose a photo with a window or sky visible</p>
          <p className="text-xs text-neutral-500">JPEG, PNG or WEBP</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {imgEl && !resultUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-600">
            Drag a rectangle over the window/glass area where the sky is visible. Draw it a
            little generously — the algorithm will resolve the exact branch/frame edges inside
            your rectangle on its own.
          </p>
          <div ref={containerRef} className="w-fit overflow-hidden rounded-xl border border-neutral-200">
            <canvas
              ref={canvasRef}
              className="block cursor-crosshair touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runApply}
              disabled={!hasUsableRect || applying}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              {applying ? "Fixing sky…" : "Apply sky fix"}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium transition hover:bg-neutral-50"
            >
              Choose a different photo
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {resultUrl && (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Sky-fixed result" className="max-h-96 w-full rounded-lg object-contain" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={downloadResult}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Download
            </button>
            <span className="text-xs text-neutral-500">or send to:</span>
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
