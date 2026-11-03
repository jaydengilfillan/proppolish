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

/** Polls a fal queue job. Only queue.fal.run URLs are accepted. */
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
  const s = JSON.parse(stText) as { status?: string; queue_position?: number };
  if (s.status === "COMPLETED") {
    const res = await fetch(responseUrl, { headers });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ status: "FAILED", error: `fal result failed (${res.status}): ${text.slice(0, 300)}` });
    const out = JSON.parse(text) as { video?: { url?: string } };
    if (!out.video?.url) return NextResponse.json({ status: "FAILED", error: "The model returned no video (it may have been blocked by a content filter)." });
    return NextResponse.json({ status: "DONE", videoUrl: out.video.url });
  }
  if (s.status === "IN_QUEUE") return NextResponse.json({ status: "IN_QUEUE", position: s.queue_position });
  return NextResponse.json({ status: "IN_PROGRESS" });
}
