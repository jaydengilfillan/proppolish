"use client";

import { useRef, useState } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

/**
 * Draggable before/after comparison. The "after" image is clipped to `pos`%
 * of the width; a range input laid over the top provides the drag handle and
 * keeps it keyboard-accessible.
 */
export default function BeforeAfterSlider({ beforeUrl, afterUrl, className }: Props) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-lg bg-neutral-200 ${className ?? ""}`}
    >
      {/* Before (full width, underneath) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt="Before"
        className="block w-full"
        draggable={false}
      />

      {/* After (clipped to pos%) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt="After"
          className="block w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* Divider line + handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-700 shadow-md">
          <span className="text-xs tracking-tighter">◀▶</span>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
        Before
      </span>
      <span className="absolute right-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
        After
      </span>

      {/* Drag control */}
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Reveal the finished image"
        className="ba-range absolute inset-0 h-full w-full"
      />
    </div>
  );
}
