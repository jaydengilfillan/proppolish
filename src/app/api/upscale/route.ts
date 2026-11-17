import { NextRequest, NextResponse } from "next/server";
import { chargeCredits, checkCredits } from "@/lib/videoBilling";

export const dynamic = "force-dynamic";

const MODELS = ["Standard V2", "High Fidelity V2", "Low Resolution V2", "CGI", "Standard MAX", "Wonder 3"] as const;

/** Topaz image upscale on fal (queue). */
export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  let b: { imageUrl?: unknown; model?: unknown; factor?: unknown; format?: unknown; face?: unknown; faithful?: unknown; w?: unknown; h?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof b.imageUrl !== "string" || !/^https:\/\//.test(b.imageUrl)) return NextResponse.json({ error: "Missing image." }, { status: 400 });
  const model = (MODELS as readonly string[]).includes(String(b.model)) ? String(b.model) : "Standard V2";
  const factor = Math.min(6, Math.max(1, Number(b.factor) || 4));
  const format = b.format === "png" ? "png" : "jpeg";
  const mp = (Math.max(1, Number(b.w) || 2000) * factor * (Math.max(1, Number(b.h) || 1500) * factor)) / 1e6;
  const cost = mp <= 24 ? 0.1 : mp <= 48 ? 0.2 : 0.4; // rough budget; check fal's price list
  const blocked = await checkCredits(req, cost);
  if (blocked) return blocked;
  const resp = await fetch("https://queue.fal.run/fal-ai/topaz/upscale/image", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: b.imageUrl, model, upscale_factor: factor, output_format: format, face_enhancement: b.face !== false, ...(b.faithful === true ? { sharpen: 0, denoise: 0, fix_compression: 0 } : {}) }),
  });
  const text = await resp.text();
  if (!resp.ok) return NextResponse.json({ error: `Upscale refused (${resp.status}): ${text.slice(0, 300)}` }, { status: 502 });
  const json = JSON.parse(text) as { status_url?: string; response_url?: string };
  if (!json.status_url || !json.response_url) return NextResponse.json({ error: "fal returned no job URLs." }, { status: 502 });
  await chargeCredits(req, cost, `upscale-image · ${model} ${factor}x`);
  return NextResponse.json({ statusUrl: json.status_url, responseUrl: json.response_url });
}
