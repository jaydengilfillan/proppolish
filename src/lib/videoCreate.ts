/**
 * Prompt-based video generation with reference images (all on fal.ai).
 * The page collects a prompt plus up to 4 labelled reference images; this file
 * turns that into each engine's payload so the user never writes @Image tags.
 */

export type CreateEngineId = "klingpro" | "klingstd" | "seedance";
export type Aspect = "16:9" | "9:16" | "1:1";

export interface CreateEngine {
  id: CreateEngineId;
  label: string;
  blurb: string;
  model: string;
  minSecs: number;
  maxSecs: number;
}

export const CREATE_ENGINES: CreateEngine[] = [
  {
    id: "klingpro",
    label: "Kling 3.0 Omni (Pro)",
    blurb: "Reference to video. Strong at keeping the property exact. 3-15s.",
    model: "fal-ai/kling-video/o3/pro/reference-to-video",
    minSecs: 3,
    maxSecs: 15,
  },
  {
    id: "klingstd",
    label: "Kling 3.0 Omni (Standard)",
    blurb: "Same, cheaper tier. 3-15s.",
    model: "fal-ai/kling-video/o3/standard/reference-to-video",
    minSecs: 3,
    maxSecs: 15,
  },
  {
    id: "seedance",
    label: "Seedance 2.0",
    blurb: "Reference to video with up to 4 images. 4-15s.",
    model: "bytedance/seedance-2.0/reference-to-video",
    minSecs: 4,
    maxSecs: 15,
  },
];

export function getCreateEngine(id: string): CreateEngine | undefined {
  return CREATE_ENGINES.find((e) => e.id === id);
}

export const MAX_REFS = 4;

export interface RefInput {
  url: string;
  /** What this image is, in plain words, e.g. "the house facade" or "a white SUV". */
  label: string;
}

export interface CreateInput {
  prompt: string;
  refs: RefInput[];
  /** Use the first reference as the exact opening frame of the clip. */
  startFromFirst: boolean;
  secs: number;
  aspect: Aspect;
  audio: boolean;
  final: boolean;
}

export const PROMPT_STARTERS: { label: string; text: string }[] = [
  { label: "Car drives in", text: "A fun, natural clip of the car driving up and pulling into the driveway in front of the house, smooth camera, golden afternoon light." },
  { label: "Drone reveal", text: "A slow cinematic drone reveal pulling back and rising to show the whole property, smooth steady motion." },
  { label: "Push-in", text: "A smooth slow push-in toward the front door, gentle parallax, the garden moving softly in a light breeze." },
  { label: "Lifestyle", text: "A family arrives home and walks toward the front door, relaxed, natural, warm afternoon light." },
  { label: "Pool day", text: "A sunny pool day: the water sparkles and ripples gently, a light breeze moves the palms, a slow cinematic camera drift." },
];

const clean = (s: string) => s.trim().replace(/[.\s]+$/g, "");

/** Builds the full prompt, labelling each reference so the model knows what it is. */
export function composePrompt(input: CreateInput, engine: CreateEngine): string {
  const lines: string[] = [];
  const refs = input.refs;
  const kling = engine.id !== "seedance";
  refs.forEach((r, i) => {
    const label = clean(r.label) || (i === 0 ? "the main scene" : `reference ${i + 1}`);
    if (kling && input.startFromFirst) {
      if (i === 0) lines.push(`The opening frame is ${label}.`);
      else lines.push(`@Image${i} is ${label}.`);
    } else if (!kling && input.startFromFirst && i === 0) {
      lines.push(`@Image1 is ${label} and is the exact opening frame of the video.`);
    } else {
      lines.push(`@Image${kling && input.startFromFirst ? i : i + 1} is ${label}.`);
    }
  });
  lines.push(clean(input.prompt) + ".");
  lines.push(
    "Keep the property's architecture, colours and every reference exactly as shown in the images, with no warping or melting. Realistic physics, stable camera, photorealistic, no text or logos added."
  );
  return lines.join(" ");
}

export function buildCreatePayload(engine: CreateEngine, input: CreateInput): Record<string, unknown> {
  const prompt = composePrompt(input, engine);
  const secs = Math.min(engine.maxSecs, Math.max(engine.minSecs, Math.round(input.secs)));
  if (engine.id === "seedance") {
    return {
      prompt,
      image_urls: input.refs.map((r) => r.url),
      resolution: input.final ? "1080p" : "720p",
      duration: String(secs),
      aspect_ratio: input.aspect,
      generate_audio: input.audio,
    };
  }
  const refs = input.refs.map((r) => r.url);
  const payload: Record<string, unknown> = {
    prompt,
    duration: String(secs),
    aspect_ratio: input.aspect,
    generate_audio: input.audio,
  };
  if (input.startFromFirst && refs.length > 0) {
    payload.start_image_url = refs[0];
    if (refs.length > 1) payload.image_urls = refs.slice(1);
  } else {
    payload.image_urls = refs;
  }
  return payload;
}

/** Rough USD for one clip from fal's list prices. */
export function estimateCreateUsd(engine: CreateEngine, secs: number, final: boolean, audio: boolean): number {
  const s = Math.min(engine.maxSecs, Math.max(engine.minSecs, secs));
  switch (engine.id) {
    case "klingpro":
      return s * (audio ? 0.224 : 0.168);
    case "klingstd":
      return s * (audio ? 0.168 : 0.126);
    case "seedance": {
      const w = final ? 1920 : 1280, h = final ? 1080 : 720;
      return (((w * h * 24 * s) / 1024) / 1000) * 0.0086;
    }
  }
}
