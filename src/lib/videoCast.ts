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
  /** Dress the model in a plain neutral base outfit so no clothes get carried into scenes. */
  plainBase: boolean;
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
  "The person is a good-looking, well-groomed adult with a confident, warm expression, dressed in stylish, fashionable clothes. Polished, tasteful lifestyle and real estate campaign casting.";

export function designPrompt(spec: ModelSpec, variant: number): string {
  const v = ["", " Give this option a distinctly different face and look from the others.", " Give this option another distinctly different face, bone structure and hairstyle detail from the others."][variant % 3];
  return `Photorealistic full-length photograph of one ${spec.age} ${spec.gender} model with ${spec.hairColour} ${spec.hairStyle} hair, ${spec.build} build, ${spec.plainBase ? "wearing a simple plain fitted neutral base outfit (plain fitted tank top and plain shorts, no jacket, no layers, no patterns)" : "wearing a stylish " + spec.outfit + " outfit"}. ${spec.extra ? "Extra detail: " + spec.extra.slice(0, 400) + ". " : ""}${ALWAYS} Standing relaxed, facing the camera, full body from head to toe in frame with space around them, on a plain light neutral studio background, soft even flattering light, sharp focus, natural skin texture, natural proportions, shot on a professional camera. No text, no logos, no other people.${v}`;
}

const SWIM = /bikini|swim|beachwear|bather|one-piece|trunks|togs/i;
/** Beach-lifestyle campaign look: the swimwear is the whole outfit, nothing layered over it. */
const SWIM_RULE =
  "SWIMWEAR LOOK, VERY IMPORTANT: the swimwear is the person's entire outfit, worn on its own with NOTHING over it. No blazer, jacket, shirt, cover-up, kaftan, sarong, towel or any other layer, no sleeves, no baggy or loose clothing. Bare shoulders, arms, midriff and legs, bare feet. Show it as a glamorous, confident, sun-kissed Gold Coast beach lifestyle campaign photo: healthy toned figure, relaxed confident posture, glowing natural skin in the sun, tasteful and aspirational, never frumpy or covered up.";

export function tweakModelPrompt(change: string): string {
  return `Edit this photo of the model. Keep the exact same person: identical face, age, skin tone and body, recognisably the same individual, same full-length pose, framing and plain light studio background. Apply only this change: ${change.slice(0, 300)}. If the change is about clothing, completely replace the whole outfit with it and remove every previous garment and accessory, leaving no pieces of the old outfit (no leftover jacket, trousers or shoes). ${SWIM.test(change) ? SWIM_RULE + " " : ""}${ALWAYS} Photorealistic, sharp, natural, no text.`;
}

/** Edit a finished scene image: change only what is asked, keep the person, scene, framing and light. */
export function editScenePrompt(change: string): string {
  return `Edit this photo. Keep everything exactly the same: the same person (face, hair, body), the scene, background, camera angle, framing, lighting and colour. Apply only this change: ${change.slice(0, 300)}. If it is about clothing, add or swap only that item and keep the rest of the person and scene identical. ${SWIM.test(change) ? "" : ""}Photorealistic, sharp, natural, no text.`;
}

export function placePrompt(outfit: string, action: string, tweak?: string): string {
  const dress = outfit
    ? `Dress them ONLY in this outfit: ${outfit.slice(0, 300)}, styled stylishly. `
    : "Choose a stylish outfit that suits this scene and what they are doing. ";
  const swim = SWIM.test(outfit) || SWIM.test(action) || SWIM.test(tweak ?? "");
  return `${swim ? SWIM_RULE + " " : ""}Image 1 is the scene and image 2 is the model reference. Place the same person from image 2 into the scene from image 1. Use image 2 ONLY for the person's identity: face, hair, age, skin tone and build. Do NOT copy the clothing, shoes, accessories, pose or plain studio background from image 2: fully replace their clothing, with nothing left over from image 2. ${dress}The outfit, footwear and accessories must make sense for the location and activity in the scene (for example beachwear and bare feet on a beach or at a pool, no jackets, trousers or loafers there). ${action ? "They are " + action.slice(0, 300) + ". " : ""}${ALWAYS} Match the scene's lighting, colour, perspective, scale, shadows and reflections so they look truly photographed there, with natural contact with the ground and objects. Do not change the scene itself: keep the architecture, objects, camera angle, framing and crop exactly as in image 1, and add only this one person. Photorealistic, sharp, no text.${tweak ? " Adjustment requested, apply it clearly: " + tweak.slice(0, 300) + "." : ""}`;
}
