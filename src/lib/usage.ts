/**
 * Usage tracking — records an estimated $ cost per job against the user who
 * ran it, so the app owner can see who's spending what without relying on
 * FAL/OpenAI's dashboards (which are billed to one shared API key and can't
 * tell users apart at all — see the conversation that led to this file).
 *
 * Backed by Upstash Redis (REST API, works fine from Vercel's serverless/edge
 * runtime — no persistent connection needed). This is a genuinely NEW piece
 * of infrastructure: nothing in this app persisted anything before this.
 * Until the env vars below are set, every function here degrades to a no-op
 * / empty result rather than throwing, so a missing database never breaks
 * actual photo processing — usage tracking is a nice-to-have layered on top.
 *
 * Env vars (set one pair):
 *   KV_REST_API_URL / KV_REST_API_TOKEN               — Vercel's own
 *     "Storage" tab -> Upstash for Redis integration sets these automatically.
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — if you provisioned
 *     Upstash directly instead of through Vercel's Storage tab.
 *
 *   ADMIN_USERNAMES     — comma-separated usernames (must match AUTH_USERS)
 *     who can see the full admin Usage view. e.g. "1080XMEDIA"
 *   WEEKLY_ALLOWANCES   — comma-separated "username:dollars" pairs, the
 *     weekly $ credit shown to that user. e.g. "NIKO:50". Usernames not
 *     listed here have no allowance shown (treated as unlimited/admin).
 */
import { Redis } from "@upstash/redis";

export type UsageTab = "declutter" | "enhance" | "restage" | "twilight" | "general" | "floorplan_scan";

export interface UsageEntry {
  tab: UsageTab;
  mode?: string;
  provider?: string;
  cost: number;
  at: number; // epoch ms
  /**
   * URL to the actual output image, so the admin Usage view can show/link to
   * it. For FAL jobs this is FAL's own hosted result URL (no extra upload
   * needed). For OpenAI jobs there's no hosted URL — the API returns raw
   * image bytes — so this is a copy uploaded to Vercel Blob storage
   * (see src/lib/blob.ts). Undefined if the upload failed or wasn't
   * attempted (e.g. Blob storage isn't configured); the log entry still
   * records fine either way, it just won't have a thumbnail.
   */
  imageUrl?: string;
}

// A rough, non-metered estimate for OpenAI jobs — OpenAI bills gpt-image-2
// per-token rather than a flat per-image rate (see config.ts's own
// OPENAI_COST_HINT, "~$0.10–$0.30/generation"). This is the midpoint. It's
// an estimate for internal awareness, not a substitute for OpenAI's own
// billing — worth saying so anywhere this number is shown.
export const OPENAI_ESTIMATED_COST = 0.2;

// gpt-5.6-terra (Floor Plan "Import from scan") is priced per-token and
// cheap — "a few cents per scan" per config.ts's own comment.
export const FLOORPLAN_SCAN_ESTIMATED_COST = 0.05;

let cachedClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedClient !== undefined) return cachedClient;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedClient = url && token ? new Redis({ url, token }) : null;
  return cachedClient;
}

/** Whether a Redis backend is actually configured yet. */
export function isUsageConfigured(): boolean {
  return getRedis() !== null;
}

/** Parse ADMIN_USERNAMES ("1080XMEDIA,otheradmin") into a Set. */
export function getAdminUsernames(): Set<string> {
  const raw = process.env.ADMIN_USERNAMES ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isAdmin(username: string | null | undefined): boolean {
  if (!username) return false;
  return getAdminUsernames().has(username);
}

/** Parse WEEKLY_ALLOWANCES ("NIKO:50,otheruser:75") into a { username: dollars } map. */
export function getWeeklyAllowances(): Record<string, number> {
  const raw = process.env.WEEKLY_ALLOWANCES ?? "";
  const out: Record<string, number> = {};
  for (const entry of raw.split(",")) {
    const piece = entry.trim();
    if (!piece) continue;
    const idx = piece.indexOf(":");
    if (idx <= 0) continue;
    const username = piece.slice(0, idx).trim();
    const amount = Number(piece.slice(idx + 1).trim());
    if (username && Number.isFinite(amount)) out[username] = amount;
  }
  return out;
}

export function getWeeklyAllowance(username: string): number | null {
  const allowances = getWeeklyAllowances();
  return username in allowances ? allowances[username] : null;
}

/**
 * Stable "YYYY-Www" ISO week key for a date — used as the reset boundary for
 * weekly totals. No cron job needed: once a new week's key starts getting
 * used, the previous week's counter simply stops being read as "current".
 */
export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

const HISTORY_LIMIT = 500; // per-user and combined logs are capped to this many most-recent entries
const WEEK_KEY_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days — plenty past any weekly reset

/**
 * Record one job's estimated cost against a user. Never throws — usage
 * tracking must never be the thing that breaks actual photo processing, so
 * any Redis error here is swallowed (logged to the server console only).
 */
export async function recordUsage(username: string, entry: UsageEntry): Promise<void> {
  const redis = getRedis();
  if (!redis || !username) return;
  try {
    const week = isoWeekKey(new Date(entry.at));
    const totalKey = `usage:total:${week}:${username}`;
    const logKey = `usage:log:${username}`;
    const allLogKey = `usage:log:all`;
    const record = JSON.stringify({ ...entry, username });

    await Promise.all([
      redis.incrbyfloat(totalKey, entry.cost),
      redis.expire(totalKey, WEEK_KEY_TTL_SECONDS),
      redis.lpush(logKey, record),
      redis.ltrim(logKey, 0, HISTORY_LIMIT - 1),
      redis.lpush(allLogKey, record),
      redis.ltrim(allLogKey, 0, HISTORY_LIMIT - 1),
    ]);
  } catch (err) {
    console.error("recordUsage failed (non-fatal):", err);
  }
}

/** Current week's running $ total for a user. 0 if unconfigured or unused. */
export async function getWeeklyTotal(username: string): Promise<number> {
  const redis = getRedis();
  if (!redis || !username) return 0;
  try {
    const week = isoWeekKey();
    const val = await redis.get<string | number>(`usage:total:${week}:${username}`);
    const num = typeof val === "string" ? Number(val) : val;
    return typeof num === "number" && Number.isFinite(num) ? num : 0;
  } catch (err) {
    console.error("getWeeklyTotal failed (non-fatal):", err);
    return 0;
  }
}

/** Most recent job history for a single user, newest first. */
export async function getHistory(username: string, limit = 100): Promise<(UsageEntry & { username: string })[]> {
  const redis = getRedis();
  if (!redis || !username) return [];
  try {
    const raw = await redis.lrange(`usage:log:${username}`, 0, Math.max(0, limit - 1));
    return raw
      .map((r) => safeParse(r))
      .filter((r): r is UsageEntry & { username: string } => r !== null);
  } catch (err) {
    console.error("getHistory failed (non-fatal):", err);
    return [];
  }
}

/** Most recent job history across ALL users, newest first — admin view. */
export async function getAllHistory(limit = 200): Promise<(UsageEntry & { username: string })[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.lrange(`usage:log:all`, 0, Math.max(0, limit - 1));
    return raw
      .map((r) => safeParse(r))
      .filter((r): r is UsageEntry & { username: string } => r !== null);
  } catch (err) {
    console.error("getAllHistory failed (non-fatal):", err);
    return [];
  }
}

function safeParse(raw: unknown): (UsageEntry & { username: string }) | null {
  try {
    // Upstash's client auto-parses JSON strings it recognises; guard both cases.
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj && typeof obj === "object" && typeof (obj as { username?: unknown }).username === "string") {
      return obj as UsageEntry & { username: string };
    }
    return null;
  } catch {
    return null;
  }
}
