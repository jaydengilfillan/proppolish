/**
 * Video relight engines (all run on fal.ai). The /video page lets the user
 * tick several and compare. Payload shapes were checked against each model's
 * fal schema.
 */
import { Look, Scene, relightPrompt, seedancePrompt } from "./videoLooks";

export type EngineId = "klingpro" | "klingstd" | "seedance" | "idv2v" | "h3max" | "ltxnight";

export interface EngineInput {
  videoUrl: string;
  frameUrl?: string;
  sphereUrl?: string;
  secs: number;
  width: number;
  height: number;
  final: boolean;
}

export interface Engine {
  id: EngineId;
  label: string;
  blurb: string;
  model: string;
  needsFrame: boolean;
  needsSphere: boolean;
  nightOnly: boolean;
  /** Longest source clip (seconds) the engine accepts. */
  maxSecs: number;
  /** Shortest source clip (seconds) the engine accepts. */
  minSecs?: number;
}

export const ENGINES: Engine[] = [
  {
    id: "klingpro",
    label: "Kling 3.0 Omni Edit (Pro)",
    blurb: "The Kling edit you use on Higgsfield. 3-15s clips.",
    model: "fal-ai/kling-video/o3/pro/video-to-video/edit",
    needsFrame: true,
    needsSphere: false,
    nightOnly: false,
    maxSecs: 15,
    minSecs: 3,
  },
  {
    id: "klingstd",
    label: "Kling 3.0 Omni Edit (Standard)",
    blurb: "Same edit, cheaper tier. 3-15s clips.",
    model: "fal-ai/kling-video/o3/standard/video-to-video/edit",
    needsFrame: true,
    needsSphere: false,
    nightOnly: false,
    maxSecs: 15,
    minSecs: 3,
  },
  {
    id: "seedance",
    label: "Seedance 2.0",
    blurb: "Most flexible: lighting, sky and weather. Can drift slightly.",
    model: "bytedance/seedance-2.0/reference-to-video",
    needsFrame: true,
    needsSphere: false,
    nightOnly: false,
    maxSecs: 15,
  },
  {
    id: "idv2v",
    label: "ID-V2V Relight",
    blurb: "Built to keep the scene identical. 720p, about 10s max.",
    model: "fal-ai/id-v2v/relight",
    needsFrame: true,
    needsSphere: false,
    nightOnly: false,
    maxSecs: 10,
  },
  {
    id: "h3max",
    label: "MiniMax H3 Max",
    blurb: "Reads the light from a lighting sphere. Up to 2K.",
    model: "minimax/h3-max/relight",
    needsFrame: false,
    needsSphere: true,
    nightOnly: false,
    maxSecs: 15,
  },
  {
    id: "ltxnight",
    label: "LTX day to night",
    blurb: "Night looks only. Quick and cheap. About 6s max at 720p.",
    model: "fal-ai/ltx-2.3-quality/day-to-night",
    needsFrame: false,
    needsSphere: false,
    nightOnly: true,
    maxSecs: 6,
  },
];

export function getEngine(id: string): Engine | undefined {
  return ENGINES.find((e) => e.id === id);
}

export function engineApplies(engine: Engine, look: Look): boolean {
  return !engine.nightOnly || look.night;
}

/** Rough USD estimate for one clip, from each model's fal price. */
export function estimateUsd(engine: Engine, secs: number, final: boolean): number {
  switch (engine.id) {
    case "klingpro":
      return secs * 0.168;
    case "klingstd":
      return secs * 0.126;
    case "seedance": {
      const w = final ? 1920 : 1280, h = final ? 1080 : 720;
      const tokens = ((w * h * 24 * secs) / 1024) * 2; // input + output video
      return (tokens / 1000) * 0.0086;
    }
    case "idv2v":
      return secs * 0.2;
    case "h3max":
      return secs * (final ? 0.16 : 0.08);
    case "ltxnight":
      return ((1280 * 720 * secs * 24) / 1e6) * 0.0024075;
  }
}

export const FRAME_COST_USD = 0.15;

export function buildPayload(engine: Engine, look: Look, input: EngineInput, scene?: Scene): Record<string, unknown> {
  const frames = Math.max(9, Math.round(input.secs * 24));
  switch (engine.id) {
    case "klingpro":
    case "klingstd":
      return {
        prompt: seedancePrompt(look, scene),
        video_url: input.videoUrl,
        image_urls: input.frameUrl ? [input.frameUrl] : [],
        keep_audio: false,
      };
    case "seedance":
      return {
        prompt: seedancePrompt(look, scene),
        video_urls: [input.videoUrl],
        image_urls: input.frameUrl ? [input.frameUrl] : [],
        resolution: input.final ? "1080p" : "720p",
        duration: String(Math.min(15, Math.max(4, Math.round(input.secs)))),
        aspect_ratio: "auto",
        generate_audio: false,
        bitrate_mode: "high",
      };
    case "idv2v":
      return {
        prompt: relightPrompt(look, scene),
        video_url: input.videoUrl,
        image_url: input.frameUrl,
        resolution: "720p",
        num_frames: Math.min(241, Math.max(17, frames)),
        num_inference_steps: 30,
        guidance_scale: 5,
        vace_scale: 1,
      };
    case "h3max":
      return {
        video_url: input.videoUrl,
        reference_image_url: input.sphereUrl,
        resolution: input.final ? "1080P" : "768P",
        aspect_ratio: "adaptive",
      };
    case "ltxnight":
      return {
        video_url: input.videoUrl,
        prompt: "a real estate property",
        resolution: input.secs > 6 ? "480p" : "720p",
        num_frames: Math.min(481, Math.max(9, frames)),
        frames_per_second: 24,
        num_inference_steps: 20,
        generate_audio: false,
        video_quality: "high",
      };
  }
}
