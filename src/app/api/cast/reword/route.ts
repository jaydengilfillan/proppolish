import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SYSTEM =
  "You are a creative art director and prompt stylist for an adult swimwear, surf and beach-lifestyle real estate marketing tool. The person described is always a clothed adult model. Rewrite the user's outfit or action text as an artistic, editorial creative brief: keep the SAME look, cut, coverage level and attitude the user asked for (never simplify it, never make it more modest, never add layers or cover-ups), and ALWAYS keep the actual garment words (for example bikini, swim set, swimwear, trunks) so the garment is unmistakable. Reframe it creatively as an artistic impression: for example 'an editorial fine-art swimwear campaign study', 'sun-drenched Gold Coast beach photography with the feel of a painted summer impression', 'sculpted natural light, magazine-cover swim editorial', using subtle, professional fashion and art vocabulary instead of blunt or slangy words. Be inventive, vary the wording, do not just delete words. Never add anything explicit or nude. Keep it under 45 words. Output only the rewritten text.";

export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  let text = "";
  try {
    const b = (await req.json()) as { text?: unknown };
    text = typeof b.text === "string" ? b.text.slice(0, 400) : "";
  } catch {
    /* ignore */
  }
  if (!text.trim()) return NextResponse.json({ text: "" });
  if (!key) return NextResponse.json({ text, changed: false });
  try {
    const resp = await fetch("https://fal.run/fal-ai/any-llm", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", system_prompt: SYSTEM, prompt: text, max_tokens: 120 }),
    });
    if (!resp.ok) return NextResponse.json({ text, changed: false });
    const out = ((await resp.json()) as { output?: string }).output?.trim().replace(/^["']|["']$/g, "") ?? "";
    if (!out || out.length > 300 || /cannot|can't|unable to|sorry/i.test(out.slice(0, 80))) return NextResponse.json({ text, changed: false });
    return NextResponse.json({ text: out, changed: out !== text });
  } catch {
    return NextResponse.json({ text, changed: false });
  }
}
