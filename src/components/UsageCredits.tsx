"use client";

import { useEffect, useState } from "react";

interface UsageResponse {
  configured: boolean;
  weeklyTotal?: number;
  weeklyAllowance?: number | null;
}

/**
 * Small header badge showing the CURRENT user's own weekly credit usage —
 * e.g. "$18.40 of $50 this week". Deliberately shows only your own number:
 * the API route this calls (/api/usage) can only ever return the caller's
 * own total, never anyone else's or the wider account/org total. Soft limit
 * only — going over the allowance is just a colour change, never blocked.
 * Renders nothing if the user has no allowance configured (e.g. admins).
 */
export default function UsageCredits() {
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UsageResponse | null) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || !data.configured) return null;
  const { weeklyTotal, weeklyAllowance } = data;
  if (weeklyAllowance === null || weeklyAllowance === undefined || typeof weeklyTotal !== "number") {
    return null;
  }

  const pctRaw = weeklyAllowance > 0 ? (weeklyTotal / weeklyAllowance) * 100 : 0;
  const pct = Math.min(100, pctRaw);
  const remaining = Math.max(0, weeklyAllowance - weeklyTotal);

  // Health-bar style gradient: full green (hue 120) when nothing's been
  // spent yet, sliding through yellow/amber and down to full red (hue 0)
  // as the week's allowance gets used up. Clamp the pct used for the colour
  // calc to 100 so it settles on solid red once over budget, rather than
  // wrapping back around the colour wheel.
  const hue = 120 - (Math.min(100, pctRaw) / 100) * 120;
  const barColour = `hsl(${hue}, 75%, 45%)`;
  const textColour = `hsl(${hue}, 70%, 38%)`;

  return (
    <div className="hidden flex-col items-end gap-0.5 sm:flex" title="Your credits reset weekly">
      <span className="text-xs font-medium" style={{ color: textColour }}>
        ${remaining.toFixed(2)} credits left this week
      </span>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: barColour }}
        />
      </div>
    </div>
  );
}
