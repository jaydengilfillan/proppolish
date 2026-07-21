import { NextRequest, NextResponse } from "next/server";
import { falEdit, FalError } from "@/lib/fal";
import { openaiEdit, OpenAIImageError } from "@/lib/openai";
import { buildPrompt, Mode, Tab, TwilightSky } from "@/lib/prompts";
import { resolutionTier, Provider, TWILIGHT_SKIES } from "@/lib/config";

// This route calls the model provider synchronously. FAL is usually fast
// (10-20s) but OpenAI gpt-image-2 at "high" quality on a full 4K exterior
// edit can take well over a minute. Vercel (Hobby + Fluid compute) allows up
// to 300s, so budget close to that rather than the old 60s, which was
// causing HTTP 504s on slower OpenAI generations.
export const maxDuration = 280;
// Always run on the server; never statically optimise.
export const dynamic = "force-dynamic";

interface ProcessBody {
    image?: unknown; // data URI of the downscaled image
  mode?: unknown; // "interior" | "exterior"
  note?: unknown; // optional user instruction
  tab?: unknown; // "declutter" | "enhance" | "restage" | "twilight"
  provider?: unknown; // "fal" | "openai" (only meaningful when tab === "enhance")
  sky?: unknown; // "orange" | "purple" (only meaningful when tab === "twilight")
  width?: unknown; // original (pre-downscale) width, used by the OpenAI provider
  height?: unknown; // original (pre-downscale) height, used by the OpenAI provider
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
    const tab: Tab =
        body.tab === "enhance"
            ? "enhance"
            : body.tab === "restage"
                ? "restage"
                : body.tab === "twilight"
                    ? "twilight"
                    : "declutter";
    const sky: TwilightSky = body.sky === "purple" ? "purple" : "orange";
    // Twilight is a Nano Banana (FAL) multi-image edit only — no OpenAI path.
    const provider: Provider = tab === "twilight" ? "fal" : body.provider === "openai" ? "openai" : "fal";
    const width = typeof body.width === "number" ? body.width : undefined;
    const height = typeof body.height === "number" ? body.height : undefined;

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

  const prompt = buildPrompt(tab, mode, note, provider);

  // For every tab except Twilight, FAL/OpenAI receive just the one photo.
  // Twilight appends a second image: the absolute URL of the sky reference
  // the user picked (FAL fetches images by URL — a relative path won't work).
  const imageUrls: string[] = [body.image as string];
  if (tab === "twilight") {
    const skyPath = TWILIGHT_SKIES[sky];
    imageUrls.push(new URL(skyPath, req.nextUrl.origin).toString());
  }

  try {
        const outputUrl =
                provider === "openai"
            ? await openaiEdit({ prompt, imageDataUri: body.image, width, height })
                  : await falEdit({
                                prompt,
                                imageUrls,
                                resolution: resolutionTier(),
                  });
        return NextResponse.json({ url: outputUrl });
  } catch (err) {
        if (err instanceof FalError || err instanceof OpenAIImageError) {
                // Map upstream auth/quota errors to something the UI can show plainly.
          const status = err.status >= 400 && err.status < 600 ? err.status : 502;
                return NextResponse.json({ error: err.message }, { status });
        }
        const detail = err instanceof Error ? err.message : "Unknown server error.";
        return NextResponse.json({ error: detail }, { status: 500 });
  }
}
