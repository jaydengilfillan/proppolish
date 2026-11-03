import { NextRequest, NextResponse } from "next/server";
import { buildPayload, engineApplies, getEngine } from "@/lib/videoEngines";
import { getLook, getScene } from "@/lib/videoLooks";

export const dynamic = "force-dynamic";

interface StartBody {
  engine?: unknown;
  look?: unknown;
  scene?: unknown;
  videoUrl?: unknown;
  frameUrl?: unknown;
  sphereUrl?: unknown;
  secs?: unknown;
  width?: unknown;
  height?: unknown;
  final?: unknown;
}

const isUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\//.test(v);

/** Submits a relight job to fal's queue and returns immediately; the page polls /status. */
export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  let body: StartBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const engine = typeof body.engine === "string" ? getEngine(body.engine) : undefined;
  const look = typeof body.look === "string" ? getLook(body.look) : undefined;
  if (!engine || !look) return NextResponse.json({ error: "Unknown engine or look." }, { status: 400 });
  if (!engineApplies(engine, look)) return NextResponse.json({ error: `${engine.label} only does night looks.` }, { status: 400 });
  if (!isUrl(body.videoUrl)) return NextResponse.json({ error: "Missing uploaded clip." }, { status: 400 });
  if (engine.needsFrame && !isUrl(body.frameUrl)) return NextResponse.json({ error: "This engine needs the relit first frame." }, { status: 400 });
  if (engine.needsSphere && !isUrl(body.sphereUrl)) return NextResponse.json({ error: "This engine needs the lighting sphere." }, { status: 400 });
  const secs = typeof body.secs === "number" && body.secs > 0 ? Math.min(body.secs, engine.maxSecs) : engine.maxSecs;

  const input = buildPayload(engine, look, {
    videoUrl: body.videoUrl,
    frameUrl: isUrl(body.frameUrl) ? body.frameUrl : undefined,
    sphereUrl: isUrl(body.sphereUrl) ? body.sphereUrl : undefined,
    secs,
    width: typeof body.width === "number" ? body.width : 1280,
    height: typeof body.height === "number" ? body.height : 720,
    final: body.final === true,
  }, getScene(typeof body.scene === "string" ? body.scene : undefined));

  const resp = await fetch(`https://queue.fal.run/${engine.model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await resp.text();
  if (!resp.ok) {
    return NextResponse.json({ error: `${engine.label} refused the job (${resp.status}): ${text.slice(0, 300)}` }, { status: 502 });
  }
  const json = JSON.parse(text) as { status_url?: string; response_url?: string };
  if (!json.status_url || !json.response_url) return NextResponse.json({ error: "fal returned no job URLs." }, { status: 502 });
  return NextResponse.json({ statusUrl: json.status_url, responseUrl: json.response_url });
}
