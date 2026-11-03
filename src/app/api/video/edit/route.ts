import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MODELS: Record<string, string> = {
  klingpro: "fal-ai/kling-video/o3/pro/video-to-video/edit",
  klingstd: "fal-ai/kling-video/o3/standard/video-to-video/edit",
};

/** Edits an existing video with a typed instruction (Kling Omni Edit) via fal's queue. */
export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  let body: { engine?: unknown; videoUrl?: unknown; change?: unknown; prefs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const model = typeof body.engine === "string" ? MODELS[body.engine] : undefined;
  if (!model) return NextResponse.json({ error: "Unknown edit engine." }, { status: 400 });
  if (typeof body.videoUrl !== "string" || !/^https:\/\//.test(body.videoUrl)) return NextResponse.json({ error: "Missing video." }, { status: 400 });
  const change = typeof body.change === "string" ? body.change.trim().slice(0, 1500) : "";
  if (!change) return NextResponse.json({ error: "Describe the change first." }, { status: 400 });
  const prefs = typeof body.prefs === "string" ? body.prefs.slice(0, 1500) : "";

  const prompt = `Edit @Video1 with this change: ${change.replace(/[.\s]+$/g, "")}. Keep everything else exactly the same: the architecture, every other object, the camera movement, framing, timing and all motion. Photorealistic, stable, no flicker, no new objects unless asked.${prefs ? " " + prefs : ""}`;
  const resp = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, video_url: body.videoUrl, keep_audio: true }),
  });
  const text = await resp.text();
  if (!resp.ok) return NextResponse.json({ error: `Edit refused (${resp.status}): ${text.slice(0, 300)}` }, { status: 502 });
  const json = JSON.parse(text) as { status_url?: string; response_url?: string };
  if (!json.status_url || !json.response_url) return NextResponse.json({ error: "fal returned no job URLs." }, { status: 502 });
  return NextResponse.json({ statusUrl: json.status_url, responseUrl: json.response_url });
}
