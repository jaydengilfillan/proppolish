import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const okHost = (u: string | null): u is string => {
  if (!u) return false;
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.hostname === "queue.fal.run";
  } catch {
    return false;
  }
};

/** Polls an image upscale job on fal's queue. */
export async function GET(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set on the server." }, { status: 500 });
  const statusUrl = req.nextUrl.searchParams.get("statusUrl");
  const responseUrl = req.nextUrl.searchParams.get("responseUrl");
  if (!okHost(statusUrl) || !okHost(responseUrl)) return NextResponse.json({ error: "Bad job URL." }, { status: 400 });
  const headers = { Authorization: `Key ${key}` };
  const st = await fetch(statusUrl, { headers });
  const stText = await st.text();
  if (!st.ok) return NextResponse.json({ status: "FAILED", error: `fal status failed (${st.status}): ${stText.slice(0, 200)}` });
  const s = JSON.parse(stText) as { status?: string };
  if (s.status === "COMPLETED") {
    const res = await fetch(responseUrl, { headers });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ status: "FAILED", error: `fal result failed (${res.status}): ${text.slice(0, 300)}` });
    const out = JSON.parse(text) as { image?: { url?: string; file_size?: number } };
    if (!out.image?.url) return NextResponse.json({ status: "FAILED", error: "No image came back." });
    return NextResponse.json({ status: "DONE", imageUrl: out.image.url, fileSize: out.image.file_size ?? null });
  }
  return NextResponse.json({ status: s.status === "IN_QUEUE" ? "IN_QUEUE" : "IN_PROGRESS" });
}
