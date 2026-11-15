import { NextRequest, NextResponse } from "next/server";
import { FalError, falEdit, nearestFalAspectRatio } from "@/lib/fal";
import { CastEngine, ModelSpec, designPrompt, placePrompt, tweakModelPrompt, editScenePrompt } from "@/lib/videoCast";

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

const grokEdit = (prompt: string, urls: string[], aspect?: string) =>
  falRun("xai/grok-imagine-image/edit", { prompt, image_urls: urls.slice(0, 3), num_images: 1, resolution: "2k", output_format: "jpeg", aspect_ratio: aspect && /^(2:1|16:9|4:3|3:2|1:1|2:3|3:4|9:16|1:2)$/.test(aspect) ? aspect : "auto", enable_safety_checker: false });

/** xAI Grok Imagine called directly on api.x.ai (not through fal). Needs XAI_API_KEY. Result is re-hosted on fal storage so later steps can reuse it. */
async function xaiRun(prompt: string, urls: string[], aspect?: string): Promise<string> {
  const xkey = process.env.XAI_API_KEY;
  if (!xkey) throw new FalError(500, "XAI_API_KEY is not set on the server (add it in Vercel, then redeploy).");
  const ar = aspect && /^(1:1|3:4|4:3|9:16|16:9|2:3|3:2|1:2|2:1)$/.test(aspect) ? aspect : "auto";
  const edit = urls.length > 0;
  const text = urls.length > 1 ? prompt.replace(/\b[Ii]mage 1\b/g, "<IMAGE_0>").replace(/\b[Ii]mage 2\b/g, "<IMAGE_1>") : prompt;
  const reqBody: Record<string, unknown> = { model: "grok-imagine-image-2.0", prompt: text, n: 1, resolution: "2k", aspect_ratio: ar, response_format: "b64_json" };
  if (urls.length === 1) reqBody.image = { url: urls[0], type: "image_url" };
  if (urls.length > 1) reqBody.images = urls.slice(0, 3).map((u) => ({ url: u, type: "image_url" }));
  const resp = await fetch(edit ? "https://api.x.ai/v1/images/edits" : "https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${xkey}`, "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const raw = await resp.text();
  if (!resp.ok) throw new FalError(resp.status, `xai (${resp.status}): ${raw.slice(0, 300)}`);
  const json = JSON.parse(raw) as { data?: { b64_json?: string; mime_type?: string }[] };
  const img = json.data?.[0];
  if (!img?.b64_json) throw new FalError(422, "xAI returned no image (blocked or empty).");
  const fkey = process.env.FAL_KEY;
  if (!fkey) throw new FalError(500, "FAL_KEY is not set on the server.");
  const ct = img.mime_type || "image/jpeg";
  const init = await fetch("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: { Authorization: `Key ${fkey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: ct, file_name: `grok-${Date.now()}.${ct.includes("png") ? "png" : "jpg"}` }),
  });
  if (!init.ok) throw new FalError(502, `fal upload init failed (${init.status}).`);
  const { upload_url, file_url } = (await init.json()) as { upload_url: string; file_url: string };
  const put = await fetch(upload_url, { method: "PUT", body: Buffer.from(img.b64_json, "base64"), headers: { "Content-Type": ct } });
  if (!put.ok) throw new FalError(502, `fal upload failed (${put.status}).`);
  return file_url;
}

/** Google Gemini image model called directly (not through fal). Needs GOOGLE_API_KEY on the server. Result is hosted on fal storage so the rest of the app can reuse the URL. */
async function geminiRun(prompt: string, urls: string[], aspect?: string): Promise<string> {
  const gkey = process.env.GOOGLE_API_KEY;
  if (!gkey) throw new FalError(500, "GOOGLE_API_KEY is not set on the server (add it in Vercel, then redeploy).");
  const parts: Record<string, unknown>[] = [];
  for (const u of urls) {
    const r = await fetch(u);
    if (!r.ok) throw new FalError(502, `Could not read an input image (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    parts.push({ inlineData: { mimeType: r.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: buf.toString("base64") } });
  }
  parts.push({ text: prompt });
  const cats = ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"];
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": gkey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(aspect ? { imageConfig: { aspectRatio: aspect } } : {}) },
      safetySettings: cats.map((category) => ({ category, threshold: "BLOCK_NONE" })),
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new FalError(resp.status, `gemini (${resp.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
  const img = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) throw new FalError(422, "Gemini returned no image (blocked or empty).");
  const fkey = process.env.FAL_KEY;
  if (!fkey) throw new FalError(500, "FAL_KEY is not set on the server.");
  const ct = img.mimeType || "image/png";
  const init = await fetch("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: { Authorization: `Key ${fkey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: ct, file_name: `gemini-${Date.now()}.${ct.includes("jpeg") ? "jpg" : "png"}` }),
  });
  if (!init.ok) throw new FalError(502, `fal upload init failed (${init.status}).`);
  const { upload_url, file_url } = (await init.json()) as { upload_url: string; file_url: string };
  const put = await fetch(upload_url, { method: "PUT", body: Buffer.from(img.data, "base64"), headers: { "Content-Type": ct } });
  if (!put.ok) throw new FalError(502, `fal upload failed (${put.status}).`);
  return file_url;
}

/** Design a model (text to image) or place a chosen model into a scene (edit). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  let useEngine: CastEngine = body.engine === "seedream" ? "seedream" : body.engine === "gemini" ? "gemini" : body.engine === "grok" ? "grok" : body.engine === "xai" ? "xai" : "nano";
  const BLOCK = /content.?polic|safety|flagged|nsfw|moderat|sensitive|no image/i;
  for (let attempt = 0; attempt < 3; attempt++) {
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
        outfit: str(s.outfit, 300),
        extra: str(s.extra, 400),
        plainBase: s.plainBase !== false,
        activity: str(s.activity, 200),
      };
      const prompt = designPrompt(spec, typeof body.variant === "number" ? body.variant : 0);
      url =
        useEngine === "xai"
          ? await xaiRun(prompt, [], "3:4")
          : useEngine === "grok"
          ? await falRun("xai/grok-imagine-image", { prompt, aspect_ratio: "3:4", resolution: "2k", output_format: "jpeg", num_images: 1, enable_safety_checker: false })
          : useEngine === "gemini"
          ? await geminiRun(prompt, [], "3:4")
          : useEngine === "seedream"
          ? await falRun("fal-ai/bytedance/seedream/v4.5/text-to-image", { prompt, image_size: "portrait_4_3", num_images: 1, enable_safety_checker: false })
          : await falRun("fal-ai/nano-banana-pro", { prompt, aspect_ratio: "3:4", resolution: "2K", num_images: 1, safety_tolerance: "6" });
    } else if (body.action === "tweak") {
      if (!isUrl(body.modelUrl) || !str(body.change, 300).trim()) return NextResponse.json({ error: "Missing model image or change." }, { status: 400 });
      const prompt = tweakModelPrompt(str(body.change, 300), (body.softer === true ? "soft" : str(body.age, 40)));
      url =
        useEngine === "xai"
          ? await xaiRun(prompt, [body.modelUrl], "3:4")
          : useEngine === "grok"
          ? await grokEdit(prompt, [body.modelUrl], "3:4")
          : useEngine === "gemini"
          ? await geminiRun(prompt, [body.modelUrl], "3:4")
          : useEngine === "seedream"
          ? await falRun("fal-ai/bytedance/seedream/v4.5/edit", { prompt, image_urls: [body.modelUrl], image_size: "portrait_4_3", num_images: 1, enable_safety_checker: false })
          : await falEdit({ prompt, imageUrls: [body.modelUrl], resolution: "2K", aspectRatio: "3:4", safetyTolerance: "6" });
    } else if (body.action === "editscene") {
      if (!isUrl(body.imageUrl) || !str(body.change, 300).trim()) return NextResponse.json({ error: "Missing image or change." }, { status: 400 });
      const prompt = editScenePrompt(str(body.change, 300), (body.softer === true ? "soft" : str(body.age, 40)));
      const w = typeof body.width === "number" ? body.width : undefined;
      const h = typeof body.height === "number" ? body.height : undefined;
      url =
        useEngine === "xai"
          ? await xaiRun(prompt, [body.imageUrl], nearestFalAspectRatio(w, h))
          : useEngine === "grok"
          ? await grokEdit(prompt, [body.imageUrl], nearestFalAspectRatio(w, h))
          : useEngine === "gemini"
          ? await geminiRun(prompt, [body.imageUrl], nearestFalAspectRatio(w, h))
          : useEngine === "seedream"
          ? await falRun("fal-ai/bytedance/seedream/v4.5/edit", { prompt, image_urls: [body.imageUrl], image_size: "auto_2K", num_images: 1, enable_safety_checker: false })
          : await falEdit({ prompt, imageUrls: [body.imageUrl], resolution: "2K", aspectRatio: nearestFalAspectRatio(w, h), safetyTolerance: "6" });
    } else if (body.action === "place") {
      if (!isUrl(body.sceneUrl) || !isUrl(body.modelUrl)) return NextResponse.json({ error: "Missing scene or model image." }, { status: 400 });
      const prompt = placePrompt(str(body.outfit, 300), str(body.actionText, 300), str(body.tweak, 300), (body.softer === true ? "soft" : str(body.age, 40)));
      const w = typeof body.width === "number" ? body.width : undefined;
      const h = typeof body.height === "number" ? body.height : undefined;
      url =
        useEngine === "xai"
          ? await xaiRun(prompt, [body.sceneUrl, body.modelUrl], nearestFalAspectRatio(w, h))
          : useEngine === "grok"
          ? await grokEdit(prompt, [body.sceneUrl, body.modelUrl], nearestFalAspectRatio(w, h))
          : useEngine === "gemini"
          ? await geminiRun(prompt, [body.sceneUrl, body.modelUrl], nearestFalAspectRatio(w, h))
          : useEngine === "seedream"
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
    if (blockedByFilter && attempt < 2 && (useEngine === "seedream" || useEngine === "nano")) {
      // Quiet automatic retry. If Seedream blocked it, fall back to Nano Banana Pro (loosest setting) so the shot is never held up.
      useEngine = useEngine === "seedream" ? "nano" : "grok";
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
