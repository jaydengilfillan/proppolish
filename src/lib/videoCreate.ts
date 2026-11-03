/**
 * Prompt-based video generation with reference images (all on fal.ai).
 * The page collects a prompt plus up to 4 labelled reference images; this file
 * turns that into each engine's payload so the user never writes @Image tags.
 */

export type CreateEngineId = "kling4" | "kling3pro" | "kling3std" | "klingpro" | "klingstd" | "seedance";
/** v3 = Kling 3.0 image-to-video (start image + elements), v4 = Kling 4.0 reference-to-video, omni = Kling O3 reference-to-video. */
export type CreateKind = "v3" | "v4" | "omni" | "seedance";
export type Aspect = "16:9" | "9:16" | "1:1";

export interface CreateEngine {
  id: CreateEngineId;
  kind: CreateKind;
  label: string;
  blurb: string;
  model: string;
  minSecs: number;
  maxSecs: number;
}

export const CREATE_ENGINES: CreateEngine[] = [
  {
    id: "kling4",
    kind: "v4",
    label: "Kling 4.0",
    blurb: "Newest Kling. Up to 30s, 1080p, 10 reference images. API is brand new on fal.",
    model: "kling/v4/reference-to-video",
    minSecs: 3,
    maxSecs: 30,
  },
  {
    id: "kling3pro",
    kind: "v3",
    label: "Kling 3.0 (Pro)",
    blurb: "Standard Kling 3.0. First image is the opening frame, extra images become objects. 3-15s.",
    model: "fal-ai/kling-video/v3/pro/image-to-video",
    minSecs: 3,
    maxSecs: 15,
  },
  {
    id: "kling3std",
    kind: "v3",
    label: "Kling 3.0 (Standard)",
    blurb: "Same, cheaper tier. 3-15s.",
    model: "fal-ai/kling-video/v3/standard/image-to-video",
    minSecs: 3,
    maxSecs: 15,
  },
  {
    id: "klingpro",
    kind: "omni",
    label: "Kling 3.0 Omni (Pro)",
    blurb: "Reference to video. Strong at keeping the property exact. 3-15s.",
    model: "fal-ai/kling-video/o3/pro/reference-to-video",
    minSecs: 3,
    maxSecs: 15,
  },
  {
    id: "klingstd",
    kind: "omni",
    label: "Kling 3.0 Omni (Standard)",
    blurb: "Same, cheaper tier. 3-15s.",
    model: "fal-ai/kling-video/o3/standard/reference-to-video",
    minSecs: 3,
    maxSecs: 15,
  },
  {
    id: "seedance",
    kind: "seedance",
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
  const name = (r: RefInput, i: number) => clean(r.label) || (i === 0 ? "the main scene" : `reference ${i + 1}`);
  refs.forEach((r, i) => {
    const label = name(r, i);
    switch (engine.kind) {
      case "v3": // first = opening frame, rest = @Element1..
        lines.push(i === 0 ? `The opening frame is ${label}.` : `@Element${i} is ${label}.`);
        break;
      case "seedance":
        lines.push(input.startFromFirst && i === 0 ? `@Image1 is ${label} and is the exact opening frame of the video.` : `@Image${i + 1} is ${label}.`);
        break;
      default: // v4 and omni: optional start frame, rest = @Image1..
        if (input.startFromFirst) lines.push(i === 0 ? `The opening frame is ${label}.` : `@Image${i} is ${label}.`);
        else lines.push(`@Image${i + 1} is ${label}.`);
    }
  });
  lines.push(clean(input.prompt) + ".");
  lines.push(
    "Keep the property's architecture, colours and every reference exactly as shown in the images, with no warping or melting. Realistic physics, stable camera, photorealistic, no text or logos added."
  );
  return lines.join(" ");
}

/** Engines that can't run without at least one image. */
export function needsImage(engine: CreateEngine): boolean {
  return engine.kind === "v3";
}

export function buildCreatePayload(engine: CreateEngine, input: CreateInput): Record<string, unknown> {
  const prompt = composePrompt(input, engine);
  const secs = Math.min(engine.maxSecs, Math.max(engine.minSecs, Math.round(input.secs)));
  const urls = input.refs.map((r) => r.url);
  switch (engine.kind) {
    case "seedance":
      return {
        prompt,
        image_urls: urls,
        resolution: input.final ? "1080p" : "720p",
        duration: String(secs),
        aspect_ratio: input.aspect,
        generate_audio: input.audio,
      };
    case "v3": {
      if (urls.length === 0) throw new Error(`${engine.label} needs at least one image (it becomes the opening frame).`);
      const payload: Record<string, unknown> = {
        prompt,
        start_image_url: urls[0],
        duration: String(secs),
        generate_audio: input.audio,
      };
      if (urls.length > 1) payload.elements = urls.slice(1).map((u) => ({ frontal_image_url: u }));
      return payload;
    }
    case "v4": {
      const payload: Record<string, unknown> = {
        prompt,
        duration: secs,
        resolution: input.final ? "1080p" : "720p",
        aspect_ratio: input.aspect,
      };
      if (input.startFromFirst && urls.length > 0) {
        payload.start_image_url = urls[0];
        if (urls.length > 1) payload.image_urls = urls.slice(1);
      } else if (urls.length > 0) payload.image_urls = urls;
      return payload;
    }
    default: {
      const payload: Record<string, unknown> = {
        prompt,
        duration: String(secs),
        aspect_ratio: input.aspect,
        generate_audio: input.audio,
      };
      if (input.startFromFirst && urls.length > 0) {
        payload.start_image_url = urls[0];
        if (urls.length > 1) payload.image_urls = urls.slice(1);
      } else payload.image_urls = urls;
      return payload;
    }
  }
}

/** Rough USD for one clip from fal's list prices. */
export function estimateCreateUsd(engine: CreateEngine, secs: number, final: boolean, audio: boolean): number {
  const s = Math.min(engine.maxSecs, Math.max(engine.minSecs, secs));
  switch (engine.id) {
    case "kling4":
      return s * (final ? 0.25 : 0.18);
    case "kling3pro":
    case "klingpro":
      return s * (audio ? 0.224 : 0.168);
    case "kling3std":
    case "klingstd":
      return s * (audio ? 0.168 : 0.126);
    case "seedance": {
      const w = final ? 1920 : 1280, h = final ? 1080 : 720;
      return (((w * h * 24 * s) / 1024) / 1000) * 0.0086;
    }
  }
}
