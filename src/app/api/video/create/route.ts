import { NextRequest, NextResponse } from "next/server";
import { MAX_REFS, buildCreatePayload, getCreateEngine, Aspect } from "@/lib/videoCreate";

export const dynamic = "force-dynamic";

const isUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\//.test(v);
const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1"];

/** Submits a prompt + reference-image video job to fal's queue; the page polls /api/video/status. */
export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const engine = typeof body.engine === "string" ? getCreateEngine(body.engine) : undefined;
  if (!engine) return NextResponse.json({ error: "Unknown engine." }, { status: 400 });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return NextResponse.json({ error: "Write a prompt first." }, { status: 400 });
  const rawRefs = Array.isArray(body.refs) ? body.refs.slice(0, MAX_REFS) : [];
  const refs = rawRefs
    .map((r) => r as { url?: unknown; label?: unknown })
    .filter((r) => isUrl(r.url))
    .map((r) => ({ url: r.url as string, label: typeof r.label === "string" ? r.label.slice(0, 120) : "" }));
  const aspect = ASPECTS.includes(body.aspect as Aspect) ? (body.aspect as Aspect) : "16:9";
  const secs = typeof body.secs === "number" ? body.secs : 5;

  let input: Record<string, unknown>;
  try {
    input = buildCreatePayload(engine, {
    prompt,
    refs,
    startFromFirst: body.startFromFirst === true && refs.length > 0,
    secs,
    aspect,
    audio: body.audio === true,
    final: body.final === true,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad request." }, { status: 400 });
  }

  const resp = await fetch(`https://queue.fal.run/${engine.model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await resp.text();
  if (!resp.ok) return NextResponse.json({ error: `${engine.label} refused the job (${resp.status}): ${text.slice(0, 300)}` }, { status: 502 });
  const json = JSON.parse(text) as { status_url?: string; response_url?: string };
  if (!json.status_url || !json.response_url) return NextResponse.json({ error: "fal returned no job URLs." }, { status: 502 });
  return NextResponse.json({ statusUrl: json.status_url, responseUrl: json.response_url });
}
