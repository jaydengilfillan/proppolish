"use client";

import { useCallback, useEffect, useState } from "react";

interface UserSummary {
  username: string;
  weeklyTotal: number;
  weeklyAllowance: number | null;
}

interface HistoryEntry {
  username: string;
  tab: string;
  mode?: string;
  provider?: string;
  cost: number;
  at: number;
  imageUrl?: string;
}

interface AdminUsageResponse {
  configured: boolean;
  users: UserSummary[];
  history: HistoryEntry[];
  error?: string;
}

const TAB_DISPLAY: Record<string, string> = {
  declutter: "Declutter",
  enhance: "Enhance",
  restage: "Restage",
  twilight: "Twilight",
  general: "Prompt",
  floorplan_scan: "Floor Plan scan",
};

/**
 * Admin-only usage dashboard — who's spending what. Only ever mounted/shown
 * when the logged-in user is in ADMIN_USERNAMES (checked both client-side,
 * via /api/me's isAdmin flag gating whether this tab even appears, AND
 * server-side, since /api/usage/admin independently re-checks the caller's
 * session before returning anything — so this is never just "hidden in the
 * UI", the data genuinely isn't reachable without an admin login).
 */
export default function UsageAdmin() {
  const [data, setData] = useState<AdminUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/usage/admin")
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as AdminUsageResponse;
        if (!r.ok) throw new Error(body.error || `Request failed (HTTP ${r.status}).`);
        return body;
      })
      .then((body) => setData(body))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load usage."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Usage</h2>
        <button
          onClick={load}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:text-neutral-800"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-neutral-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && !data.configured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Usage tracking isn&apos;t connected to a database yet — add the Upstash Redis
          integration in Vercel (Storage tab) and set ADMIN_USERNAMES / WEEKLY_ALLOWANCES,
          then redeploy. Nothing is being logged until then.
        </div>
      )}

      {data && data.configured && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.users.map((u) => {
              const pct =
                u.weeklyAllowance && u.weeklyAllowance > 0
                  ? Math.min(100, (u.weeklyTotal / u.weeklyAllowance) * 100)
                  : null;
              return (
                <div key={u.username} className="rounded-lg border border-neutral-200 p-4">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-neutral-900">{u.username}</span>
                    <span className="text-sm text-neutral-500">
                      ${u.weeklyTotal.toFixed(2)}
                      {u.weeklyAllowance !== null ? ` / $${u.weeklyAllowance.toFixed(2)}` : ""}
                      <span className="ml-1 text-xs text-neutral-400">this week</span>
                    </span>
                  </div>
                  {pct !== null && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-neutral-900"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="mb-2 text-sm font-medium text-neutral-700">Recent activity</h3>
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Image</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Tool</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-neutral-400">
                      No activity logged yet.
                    </td>
                  </tr>
                )}
                {data.history.map((h, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="px-3 py-2">
                      {h.imageUrl ? (
                        <a href={h.imageUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={h.imageUrl}
                            alt="Result"
                            className="h-10 w-10 rounded object-cover ring-1 ring-neutral-200 transition hover:opacity-80"
                          />
                        </a>
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded bg-neutral-100 text-[10px] text-neutral-400">
                          n/a
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {new Date(h.at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-neutral-900">{h.username}</td>
                    <td className="px-3 py-2 text-neutral-700">
                      {TAB_DISPLAY[h.tab] ?? h.tab}
                      {h.mode ? ` · ${h.mode}` : ""}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {h.provider === "openai" ? "ChatGPT" : h.provider === "fal" ? "Nano Banana" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-700">${h.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Costs are estimates based on each job&apos;s model/resolution, not exact billing —
            check FAL/OpenAI&apos;s own dashboards for authoritative totals.
          </p>
        </>
      )}
    </div>
  );
}
