"use client";

/**
 * Shared state for the /video pages (Relight, Create, Edit).
 *
 * Lives in /video/layout.tsx so it survives switching between the video tabs,
 * and is saved to localStorage so jobs also survive a refresh. Running jobs
 * keep polling (and resume after a reload) until you remove them.
 * Also holds your saved preferences and prompt history.
 */

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type JobStatus = "waiting" | "queued" | "running" | "done" | "failed";

export interface CreateParams {
  prompt: string;
  refs: { url: string; label: string }[];
  startFromFirst: boolean;
  secs: number;
  aspect: string;
  audio: boolean;
  final: boolean;
}

export interface Job {
  id: string;
  kind: "relight" | "create" | "edit";
  engine: string;
  look?: string;
  title?: string;
  status: JobStatus;
  note?: string;
  videoUrl?: string;
  error?: string;
  statusUrl?: string;
  responseUrl?: string;
  createdAt: number;
  /** Original inputs of a Create job, so it can be re-run with a change. */
  params?: CreateParams;
  /** For Edit jobs: the job this was made from and what was asked. */
  parentId?: string;
  change?: string;
}

export interface Pref {
  id: string;
  text: string;
  on: boolean;
}

const JOBS_KEY = "1080x-video-jobs-v1";
const PREFS_KEY = "1080x-video-prefs-v1";
const HISTORY_KEY = "1080x-video-history-v1";
const MAX_JOBS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

interface Store {
  jobs: Job[];
  addJobs: (js: Job[]) => void;
  patchJob: (id: string, patch: Partial<Job>) => void;
  removeJob: (id: string) => void;
  clearFinished: () => void;
  /** Save the fal queue URLs on a job and poll it until it finishes. */
  track: (id: string, statusUrl: string, responseUrl: string) => void;

  prefs: Pref[];
  addPref: (text: string) => void;
  togglePref: (id: string) => void;
  removePref: (id: string) => void;
  /** The standing preferences that are switched on, as one sentence block. */
  prefsText: () => string;

  history: { text: string; n: number }[];
  /** Remember a prompt or edit you typed (for suggestions). */
  logPrompt: (text: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useVideoStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useVideoStore must be used inside VideoProvider");
  return s;
}

export function VideoProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [history, setHistory] = useState<{ text: string; n: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const polling = useRef<Set<string>>(new Set());

  const patchJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const poll = useCallback(
    async (id: string, statusUrl: string, responseUrl: string) => {
      if (polling.current.has(id)) return;
      polling.current.add(id);
      const started = Date.now();
      try {
        while (Date.now() - started < 25 * 60 * 1000) {
          await sleep(5000);
          try {
            const r = await api<{ status: string; videoUrl?: string; error?: string; position?: number }>(
              `/api/video/status?statusUrl=${encodeURIComponent(statusUrl)}&responseUrl=${encodeURIComponent(responseUrl)}`
            );
            if (r.status === "DONE") return patchJob(id, { status: "done", videoUrl: r.videoUrl, note: undefined, error: undefined });
            if (r.status === "FAILED") return patchJob(id, { status: "failed", error: r.error, note: undefined });
            patchJob(id, {
              status: r.status === "IN_QUEUE" ? "queued" : "running",
              note: r.status === "IN_QUEUE" && typeof r.position === "number" ? `Waiting in line (${r.position + 1})` : undefined,
            });
          } catch (e) {
            patchJob(id, { note: e instanceof Error ? e.message : "Retrying…" });
          }
        }
        patchJob(id, { status: "failed", error: "Took too long. Check fal.ai and try again." });
      } finally {
        polling.current.delete(id);
      }
    },
    [patchJob]
  );

  // load once after mount, then resume any jobs that were still running
  useEffect(() => {
    const saved = read<Job[]>(JOBS_KEY, []);
    const fixed = saved.map((j) =>
      !j.statusUrl && (j.status === "waiting" || j.status === "queued" || j.status === "running")
        ? { ...j, status: "failed" as JobStatus, error: "Interrupted before it started (page was closed).", note: undefined }
        : j
    );
    setJobs(fixed);
    setPrefs(read<Pref[]>(PREFS_KEY, []));
    setHistory(read<{ text: string; n: number }[]>(HISTORY_KEY, []));
    setLoaded(true);
    for (const j of fixed) {
      if (j.statusUrl && j.responseUrl && (j.status === "queued" || j.status === "running" || j.status === "waiting")) {
        void poll(j.id, j.statusUrl, j.responseUrl);
      }
    }
  }, [poll]);

  useEffect(() => {
    if (loaded) write(JOBS_KEY, jobs.slice(0, MAX_JOBS));
  }, [jobs, loaded]);
  useEffect(() => {
    if (loaded) write(PREFS_KEY, prefs);
  }, [prefs, loaded]);
  useEffect(() => {
    if (loaded) write(HISTORY_KEY, history);
  }, [history, loaded]);

  const store = useMemo<Store>(
    () => ({
      jobs,
      addJobs: (js) => setJobs((cur) => [...js, ...cur]),
      patchJob,
      removeJob: (id) => setJobs((cur) => cur.filter((j) => j.id !== id)),
      clearFinished: () => setJobs((cur) => cur.filter((j) => j.status !== "done" && j.status !== "failed")),
      track: (id, statusUrl, responseUrl) => {
        patchJob(id, { statusUrl, responseUrl, status: "queued", note: undefined });
        void poll(id, statusUrl, responseUrl);
      },
      prefs,
      addPref: (text) => {
        const t = text.trim();
        if (!t) return;
        setPrefs((cur) => (cur.some((p) => p.text.toLowerCase() === t.toLowerCase()) ? cur : [...cur, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, on: true }]));
      },
      togglePref: (id) => setPrefs((cur) => cur.map((p) => (p.id === id ? { ...p, on: !p.on } : p))),
      removePref: (id) => setPrefs((cur) => cur.filter((p) => p.id !== id)),
      prefsText: () => {
        const on = prefs.filter((p) => p.on).map((p) => p.text.replace(/[.\s]+$/g, ""));
        return on.length ? `Standing preferences: ${on.join(". ")}.` : "";
      },
      history,
      logPrompt: (text) => {
        const t = text.trim();
        if (!t || t.length > 300) return;
        setHistory((cur) => {
          const hit = cur.find((h) => h.text.toLowerCase() === t.toLowerCase());
          const next = hit ? cur.map((h) => (h === hit ? { ...h, n: h.n + 1 } : h)) : [{ text: t, n: 1 }, ...cur];
          return next.slice(0, 60);
        });
      },
    }),
    [jobs, prefs, history, patchJob, poll]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
