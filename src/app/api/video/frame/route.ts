import { NextRequest, NextResponse } from "next/server";
import { falEdit, FalError, nearestFalAspectRatio } from "@/lib/fal";
import { FRAME_COST_USD } from "@/lib/videoEngines";
import { chargeCredits, checkCredits } from "@/lib/videoBilling";
import { extraFor, framePrompt, getLook, getScene } from "@/lib/videoLooks";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Relights the clip's first frame (Nano Banana Pro) so the video engines have a look to follow. */
export async function POST(req: NextRequest) {
  let body: { image?: unknown; look?: unknown; scene?: unknown; variant?: unknown; tweak?: unknown; width?: unknown; height?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const look = typeof body.look === "string" ? getLook(body.look) : undefined;
  if (!look) return NextResponse.json({ error: "Unknown look." }, { status: 400 });
  if (typeof body.image !== "string" || !(body.image.startsWith("data:image/") || /^https:\/\//.test(body.image))) {
    return NextResponse.json({ error: "Missing frame image." }, { status: 400 });
  }
  const width = typeof body.width === "number" ? body.width : undefined;
  const height = typeof body.height === "number" ? body.height : undefined;
  const blocked = await checkCredits(req, FRAME_COST_USD);
  if (blocked) return blocked;
  try {
    const url = await falEdit({
      prompt: framePrompt(look, getScene(typeof body.scene === "string" ? body.scene : undefined), extraFor(typeof body.variant === "number" ? body.variant : 0, typeof body.tweak === "string" ? body.tweak.slice(0, 400) : "")),
      imageUrls: [body.image],
      resolution: "2K",
      aspectRatio: nearestFalAspectRatio(width, height),
    });
    await chargeCredits(req, FRAME_COST_USD, `${look.id} · first frame`);
    return NextResponse.json({ url });
  } catch (err) {
    const status = err instanceof FalError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Frame generation failed." }, { status });
  }
}
