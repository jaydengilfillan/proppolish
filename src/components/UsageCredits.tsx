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

  const pct = weeklyAllowance > 0 ? Math.min(100, (weeklyTotal / weeklyAllowance) * 100) : 0;
  const remaining = Math.max(0, weeklyAllowance - weeklyTotal);
  const colour = pct >= 100 ? "text-red-600" : pct >= 80 ? "text-amber-600" : "text-neutral-500";

  return (
    <div className="hidden flex-col items-end gap-0.5 sm:flex" title="Your credits reset weekly">
      <span className={`text-xs font-medium ${colour}`}>
        ${remaining.toFixed(2)} credits left this week
      </span>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${
            pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-neutral-900"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
