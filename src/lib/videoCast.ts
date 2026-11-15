/**
 * Cast: design a consistent model, then place that same person into different scenes and outfits.
 * Image engines: Nano Banana Pro (best identity hold) or Seedream 4.5 (cheaper).
 */
export type CastEngine = "nano" | "seedream";

export const CAST_ENGINES: { id: CastEngine; label: string; blurb: string; cost: number }[] = [
  { id: "nano", label: "Nano Banana Pro", blurb: "Best at keeping the same face", cost: 0.15 },
  { id: "seedream", label: "Seedream 4.5", blurb: "Cheaper, try it side by side", cost: 0.04 },
];

export interface ModelSpec {
  gender: string;
  age: string;
  hairColour: string;
  hairStyle: string;
  build: string;
  outfit: string;
  extra: string;
}

export const OPTIONS = {
  gender: ["woman", "man"],
  age: ["20s", "30s", "40s", "50s", "60s"],
  hairColour: ["blonde", "brunette", "black", "auburn / red", "silver / grey"],
  hairStyle: ["long", "shoulder length", "short", "wavy", "tied back"],
  build: ["slim", "athletic", "average", "curvy"],
  outfit: ["smart casual", "elegant", "beachwear", "business", "athleisure", "relaxed linen"],
} as const;

/** Every model is an adult and always attractive, well groomed and stylishly dressed. */
const ALWAYS =
  "The person is a strikingly attractive, naturally beautiful adult, well groomed, healthy, with a great face and a confident, warm expression, and is always dressed in stylish, fashionable, flattering clothes that fit perfectly and suit their body. Premium lifestyle and real estate campaign quality casting, never plain, frumpy, unstylish or unflattering.";

export function designPrompt(spec: ModelSpec, variant: number): string {
  const v = ["", " Give this option a distinctly different face and look from the others.", " Give this option another distinctly different face, bone structure and hairstyle detail from the others."][variant % 3];
  return `Photorealistic full-length photograph of one ${spec.age} ${spec.gender} model with ${spec.hairColour} ${spec.hairStyle} hair, ${spec.build} build, wearing a stylish ${spec.outfit} outfit. ${spec.extra ? "Extra detail: " + spec.extra.slice(0, 400) + ". " : ""}${ALWAYS} Standing relaxed, facing the camera, full body from head to toe in frame with space around them, on a plain light neutral studio background, soft even flattering light, sharp focus, natural skin texture, natural proportions, shot on a professional camera. No text, no logos, no other people.${v}`;
}

export function placePrompt(outfit: string, action: string, tweak?: string): string {
  return `Image 1 is the scene and image 2 is the model. Place the exact same person from image 2 into the scene from image 1: identical face, hair, age and body, recognisably the same person. ${action ? "They are " + action.slice(0, 300) + ". " : ""}${outfit ? "They are wearing " + outfit.slice(0, 300) + ", styled stylishly and flattering. " : "Keep a stylish, flattering outfit. "}${ALWAYS} Match the scene's lighting, colour, perspective, scale, shadows and reflections so they look truly photographed there, with natural contact with the ground and any objects. Do not change the scene itself: keep the architecture, objects, camera angle, framing and crop exactly as in image 1, and add only this one person. Photorealistic, sharp, no text.${tweak ? " Adjustment requested, apply it clearly: " + tweak.slice(0, 300) + "." : ""}`;
}
