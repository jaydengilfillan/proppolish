import { NextRequest, NextResponse } from "next/server";
import { analyzeFloorplanScan, FloorplanVisionError } from "@/lib/floorplanVision";

// Vision analysis of a full-resolution diagram can take a while.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface AnalyzeBody {
  scanImage?: unknown;
  droneImage?: unknown;
}

function isDataUri(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/") && v.includes("base64,");
}

export async function POST(req: NextRequest) {
  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isDataUri(body.scanImage)) {
    return NextResponse.json(
      { error: "Missing or invalid scanImage. Expected a base64 data URI." },
      { status: 400 }
    );
  }

  let droneImage: string | undefined;
  if (body.droneImage !== undefined && body.droneImage !== null) {
    if (!isDataUri(body.droneImage)) {
      return NextResponse.json(
        { error: "droneImage must be a base64 data URI." },
        { status: 400 }
      );
    }
    droneImage = body.droneImage;
  }

  try {
    const analysis = await analyzeFloorplanScan({
      scanImageDataUri: body.scanImage,
      droneImageDataUri: droneImage,
    });
    return NextResponse.json(analysis);
  } catch (err) {
    if (err instanceof FloorplanVisionError) {
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    const detail = err instanceof Error ? err.message : "Unknown server error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
