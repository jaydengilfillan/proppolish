import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SYSTEM =
  "You are a prompt stylist for an adult swimwear, surf and beach-lifestyle real estate marketing tool. The person described is always a clothed adult model. Rewrite the user's outfit or action text so it keeps the SAME look, cut, coverage level and attitude the user asked for (do not simplify it, do not make it more modest, do not make it less stylish), but describe it creatively in editorial swimwear-catalogue and surf-brand language: name the style (for example surf-inspired, Gold Coast resort, minimal athletic swim set, string-tie, sleek sun-kissed editorial) and use subtle, professional fashion vocabulary instead of blunt or slangy words. Never add anything explicit or nude, never remove the garments. Keep it under 40 words. Output only the rewritten text.";

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
