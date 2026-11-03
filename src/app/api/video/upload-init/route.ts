import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Step 1 of a direct-to-fal upload. The browser can't hold the FAL_KEY, so it
 * asks us for a one-off upload URL and then PUTs the (large) file straight to
 * fal's storage. That keeps big clips and lighting spheres out of Vercel's
 * 4.5 MB request-body limit.
 */
export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  let body: { contentType?: unknown; fileName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 120) : "upload.bin";
  if (!/^(video|image)\//.test(contentType)) {
    return NextResponse.json({ error: "Only video or image uploads are allowed." }, { status: 400 });
  }
  const resp = await fetch("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
  });
  const text = await resp.text();
  if (!resp.ok) return NextResponse.json({ error: `fal upload init failed (${resp.status}): ${text.slice(0, 200)}` }, { status: 502 });
  const json = JSON.parse(text) as { upload_url?: string; file_url?: string };
  if (!json.upload_url || !json.file_url) return NextResponse.json({ error: "fal returned no upload URL." }, { status: 502 });
  return NextResponse.json({ uploadUrl: json.upload_url, fileUrl: json.file_url });
}
