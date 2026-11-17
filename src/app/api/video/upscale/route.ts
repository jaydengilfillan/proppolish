import { NextRequest, NextResponse } from "next/server";
import { chargeCredits, checkCredits } from "@/lib/videoBilling";

export const dynamic = "force-dynamic";

const MODELS = ["Proteus", "Artemis HQ", "Artemis MQ", "Gaia HQ", "Nyx"] as const;

/** Topaz Video AI upscale on fal (queue). Keeps frame rate and colours: no target_fps, no interpolation. */
export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  let b: { videoUrl?: unknown; model?: unknown; factor?: unknown; h264?: unknown; secs?: unknown; w?: unknown; h?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof b.videoUrl !== "string" || !/^https:\/\//.test(b.videoUrl)) return NextResponse.json({ error: "Missing video." }, { status: 400 });
  const model = (MODELS as readonly string[]).includes(String(b.model)) ? String(b.model) : "Proteus";
  const factor = Math.min(4, Math.max(1, Number(b.factor) || 2));
  const secs = Math.min(180, Math.max(1, Number(b.secs) || 30));
  const w = Math.max(1, Number(b.w) || 1920);
  const h = Math.max(1, Number(b.h) || 1080);
  const outShort = Math.min(w, h) * factor;
  const rate = outShort <= 720 ? 0.01 : outShort <= 1080 ? 0.02 : 0.08;
  const cost = Math.round(secs * rate * (model === "Gaia 2" ? 0.5 : 1) * 100) / 100;
  const blocked = await checkCredits(req, cost);
  if (blocked) return blocked;
  const resp = await fetch("https://queue.fal.run/fal-ai/topaz/upscale/video", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: b.videoUrl, model, upscale_factor: factor, H264_output: b.h264 !== false }),
  });
  const text = await resp.text();
  if (!resp.ok) return NextResponse.json({ error: `Upscale refused (${resp.status}): ${text.slice(0, 300)}` }, { status: 502 });
  const json = JSON.parse(text) as { status_url?: string; response_url?: string };
  if (!json.status_url || !json.response_url) return NextResponse.json({ error: "fal returned no job URLs." }, { status: 502 });
  await chargeCredits(req, cost, `upscale-video · ${model} ${factor}x`);
  return NextResponse.json({ statusUrl: json.status_url, responseUrl: json.response_url, cost });
}
