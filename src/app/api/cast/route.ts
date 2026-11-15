import { NextRequest, NextResponse } from "next/server";
import { FalError, falEdit, nearestFalAspectRatio } from "@/lib/fal";
import { CastEngine, ModelSpec, designPrompt, placePrompt, tweakModelPrompt } from "@/lib/videoCast";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const isUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\//.test(v);
const str = (v: unknown, n = 80) => (typeof v === "string" ? v.slice(0, n) : "");

async function falRun(model: string, input: Record<string, unknown>): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) throw new FalError(500, "FAL_KEY is not set on the server.");
  const resp = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await resp.text();
  if (!resp.ok) throw new FalError(resp.status, `fal (${resp.status}): ${text.slice(0, 300)}`);
  const url = (JSON.parse(text) as { images?: { url?: string }[] }).images?.[0]?.url;
  if (!url) throw new FalError(502, "fal returned no image.");
  return url;
}

/** Design a model (text to image) or place a chosen model into a scene (edit). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  let useEngine: CastEngine = body.engine === "seedream" ? "seedream" : "nano";
  const BLOCK = /content.?polic|safety|flagged|nsfw|moderat|sensitive|no image/i;
  for (let attempt = 0; attempt < 2; attempt++) {
  try {
    let url: string;
    if (body.action === "design") {
      const s = (body.spec ?? {}) as Record<string, unknown>;
      const spec: ModelSpec = {
        gender: str(s.gender, 20) || "woman",
        age: str(s.age, 10) || "30s",
        hairColour: str(s.hairColour, 30) || "brunette",
        hairStyle: str(s.hairStyle, 30) || "long",
        build: str(s.build, 20) || "slim",
        outfit: str(s.outfit, 30) || "smart casual",
        extra: str(s.extra, 400),
      };
      const prompt = designPrompt(spec, typeof body.variant === "number" ? body.variant : 0);
      url =
        useEngine === "seedream"
          ? await falRun("fal-ai/bytedance/seedream/v4.5/text-to-image", { prompt, image_size: "portrait_4_3", num_images: 1, enable_safety_checker: false })
          : await falRun("fal-ai/nano-banana-pro", { prompt, aspect_ratio: "3:4", resolution: "2K", num_images: 1, safety_tolerance: "6" });
    } else if (body.action === "tweak") {
      if (!isUrl(body.modelUrl) || !str(body.change, 300).trim()) return NextResponse.json({ error: "Missing model image or change." }, { status: 400 });
      const prompt = tweakModelPrompt(str(body.change, 300));
      url =
        useEngine === "seedream"
          ? await falRun("fal-ai/bytedance/seedream/v4.5/edit", { prompt, image_urls: [body.modelUrl], image_size: "portrait_4_3", num_images: 1, enable_safety_checker: false })
          : await falEdit({ prompt, imageUrls: [body.modelUrl], resolution: "2K", aspectRatio: "3:4", safetyTolerance: "6" });
    } else if (body.action === "place") {
      if (!isUrl(body.sceneUrl) || !isUrl(body.modelUrl)) return NextResponse.json({ error: "Missing scene or model image." }, { status: 400 });
      const prompt = placePrompt(str(body.outfit, 300), str(body.actionText, 300), str(body.tweak, 300));
      const w = typeof body.width === "number" ? body.width : undefined;
      const h = typeof body.height === "number" ? body.height : undefined;
      url =
        useEngine === "seedream"
          ? await falRun("fal-ai/bytedance/seedream/v4.5/edit", { prompt, image_urls: [body.sceneUrl, body.modelUrl], image_size: "auto_2K", num_images: 1, enable_safety_checker: false })
          : await falEdit({ prompt, imageUrls: [body.sceneUrl, body.modelUrl], resolution: "2K", aspectRatio: nearestFalAspectRatio(w, h), safetyTolerance: "6" });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ url, usedEngine: useEngine });
  } catch (err) {
    const status = err instanceof FalError ? err.status : 500;
    const msg = err instanceof Error ? err.message : "Failed.";
    const blockedByFilter = BLOCK.test(msg);
    if (blockedByFilter && attempt === 0) {
      // Quiet automatic retry. If Seedream blocked it, fall back to Nano Banana Pro (loosest setting) so the shot is never held up.
      useEngine = "nano";
      continue;
    }
    return NextResponse.json(
      { error: blockedByFilter ? `The image filter blocked this (${msg.slice(0, 120)}). Try again, switch to Nano Banana Pro, or reword the outfit (for example "one-piece swimsuit", "beach cover-up", "resort wear").` : msg },
      { status }
    );
  }
  }
  return NextResponse.json({ error: "Failed." }, { status: 500 });
}
