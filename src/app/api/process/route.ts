import { NextRequest, NextResponse } from "next/server";
import { falEdit, FalError } from "@/lib/fal";
import { buildPrompt, Mode } from "@/lib/prompts";
import { resolutionTier } from "@/lib/config";

// This route calls FAL synchronously and can take 10-20s. Allow generous time.
export const maxDuration = 60;
// Always run on the server; never statically optimise.
export const dynamic = "force-dynamic";

interface ProcessBody {
  image?: unknown; // data URI of the downscaled image
  mode?: unknown; // "interior" | "exterior"
  note?: unknown; // optional user instruction
}

function isDataUri(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/") && v.includes("base64,");
}

export async function POST(req: NextRequest) {
  let body: ProcessBody;
  try {
    body = (await req.json()) as ProcessBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // --- Validate at the boundary ---------------------------------------------
  if (!isDataUri(body.image)) {
    return NextResponse.json(
      { error: "Missing or invalid image. Expected a base64 data URI." },
      { status: 400 }
    );
  }
  const mode: Mode = body.mode === "exterior" ? "exterior" : "interior";
  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") {
      return NextResponse.json({ error: "note must be a string." }, { status: 400 });
    }
    const trimmed = body.note.trim();
    if (trimmed.length > 500) {
      return NextResponse.json(
        { error: "note is too long (max 500 characters)." },
        { status: 400 }
      );
    }
    note = trimmed || undefined;
  }

  const prompt = buildPrompt(mode, note);

  try {
    const outputUrl = await falEdit({
      prompt,
      imageDataUri: body.image,
      resolution: resolutionTier(),
    });
    return NextResponse.json({ url: outputUrl });
  } catch (err) {
    if (err instanceof FalError) {
      // Map upstream auth/quota errors to something the UI can show plainly.
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    const detail = err instanceof Error ? err.message : "Unknown server error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
