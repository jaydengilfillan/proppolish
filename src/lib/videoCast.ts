/**
 * Cast: design a consistent model, then place that same person into different scenes and outfits.
 * Image engines: Nano Banana Pro (best identity hold) or Seedream 4.5 (cheaper).
 */
export type CastEngine = "nano" | "seedream" | "gemini" | "grok" | "xai";

export const CAST_ENGINES: { id: CastEngine; label: string; blurb: string; cost: number }[] = [
  { id: "nano", label: "Nano Banana Pro", blurb: "Best at keeping the same face", cost: 0.15 },
  { id: "seedream", label: "Seedream 4.5", blurb: "Cheaper, try it side by side", cost: 0.04 },
  { id: "grok", label: "Grok Imagine (xAI)", blurb: "Different filter, backup when others block", cost: 0.03 },
  { id: "xai", label: "Grok direct (xAI, not fal)", blurb: "Runs on xAI's own API with your xAI key", cost: 0.03 },
  { id: "gemini", label: "Gemini direct (Google)", blurb: "Not on fal, own key, backup when fal blocks", cost: 0.13 },
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
  "The person is a strikingly attractive adult with a confident, warm, magnetic expression, wearing fashionable, flattering clothes. High-end lifestyle campaign casting, not corporate or conservative.";

const GLAM_F = "Proper Gold Coast glamour, a head-turning high-fashion beauty: glossy, freshly styled and blow-dried hair with volume and shine (never messy, flat or unkempt), full polished make-up with defined brows, lashes and glossy lips, flawless glowing bronzed skin, an hourglass figure with a toned waist, curvy hips and a full, shapely bust, long toned legs, confident model pose. Not average, not girl-next-door, not a librarian or office look.";
const GLAM_M = "Proper Gold Coast glamour: a strikingly handsome, athletic and well-built man with broad shoulders and defined abs, sharp jawline, sun-bronzed skin, thick styled hair with product, confident model pose. Not average, not corporate.";
const FEMALE_AGE: Record<string, string> = {
  "40s": "Glamorous, strikingly beautiful, youthful and fit woman in her 40s: glossy blow-dried styled hair, full polished make-up, flawless glowing bronzed skin, toned hourglass figure with a full shapely bust, confident model pose. Not average, not frumpy.",
  "50s": "Elegant, glamorous, striking woman in her 50s who looks incredible: polished styled hair, refined make-up, glowing bronzed skin, fit toned figure, expensive-looking resort style, radiant confidence. Not average, not frumpy.",
  "60s": "Stunning, elegant, wealthy-looking woman in her 60s: silver or immaculately styled hair, refined make-up, glowing tan, fit toned figure, expensive jewellery, radiant confidence. Not average, not frumpy.",
};
const MALE_AGE: Record<string, string> = {
  "40s": "The absolute stereotype of a fit, tanned dad in his 40s: strong athletic build with broad shoulders and defined arms, deep sun-bronzed tan, short styled hair, light stubble, warm confident grin, relaxed alpha energy. Not average.",
  "50s": "Distinguished, very fit and tanned man in his 50s: strong muscular build, broad shoulders, groomed salt-and-pepper hair and stubble, deep tan, successful and confident. Not average.",
  "60s": "The absolute stereotype of a jacked silver fox in his 60s with money: muscular, broad-shouldered, gym-built physique, immaculate silver hair and groomed beard, deep tan, luxury watch, expensive resort-style clothes, commanding confidence. Not average.",
};
const glam = (spec: { gender: string; age: string }) => {
  const male = /man|male|guy/i.test(spec.gender) && !/woman|female/i.test(spec.gender);
  if (isYoung(spec.age)) return male ? GLAM_M : GLAM_F;
  const k = (spec.age.match(/[456]0s/) ?? [""])[0];
  return (male ? MALE_AGE : FEMALE_AGE)[k] ?? "";
};
const SWIM = /bikini|swim|beachwear|bather|one-piece|trunks|togs/i;

export function designPrompt(spec: ModelSpec, variant: number): string {
  const beach = !spec.plainBase && SWIM.test(spec.outfit);
  const v = ["", " Give this option a distinctly different face and look from the others.", " Give this option another distinctly different face, bone structure and hairstyle detail from the others."][variant % 3];
  return `Photorealistic full-length photograph of one ${spec.age} ${spec.gender} model with ${spec.hairColour} ${spec.hairStyle} hair, ${spec.build} build, ${spec.plainBase ? "wearing a simple plain fitted neutral base outfit (plain fitted tank top and plain shorts, no jacket, no layers, no patterns)" : "wearing a stylish " + spec.outfit + " outfit"}. ${beach ? swimRule(spec.age) + " " : ""}${glam(spec) + " "}${spec.extra ? "Extra detail: " + spec.extra.slice(0, 400) + ". " : ""}${ALWAYS} Standing in a confident model pose, facing the camera, full body from head to toe in frame with space around them, on a plain light neutral studio background, soft glamorous flattering light, sharp focus, flawless glowing skin, shot on a professional camera. No text, no logos, no other people.${v}`;
}

/** Beach-lifestyle campaign look: the swimwear is the whole outfit, nothing layered over it. Slimmer and more glamorous for 20s and 30s. */
const isYoung = (age?: string) => /\b[23]0s?\b/.test(age ?? "") && !/\b[456]0s?\b/.test(age ?? "");
export function swimRule(age?: string): string {
  if (age === "soft") return "The person wears a bikini as their whole outfit, with no other layers over it. Relaxed beach lifestyle photo.";
  const cut = isYoung(age)
    ? "a slim triangle bikini with low-rise bottoms"
    : "a classic bikini";
  return `The person wears ${cut} as their whole outfit, with nothing layered over it: no shirt, jacket, cover-up or sarong, no high-waisted bottoms. Confident, relaxed, sun-kissed Gold Coast beach lifestyle photo.`;
}

export function tweakModelPrompt(change: string, age?: string): string {
  return `Edit this photo of the model. Keep the same person: identical face and recognisably the same individual (apply any requested change to hair, make-up, figure, build, tan or styling), same full-length pose, framing and plain light studio background. Apply only this change: ${change.slice(0, 300)}. If the change is about clothing, completely replace the whole outfit with it and remove every previous garment and accessory, leaving no pieces of the old outfit (no leftover jacket, trousers or shoes). ${SWIM.test(change) ? swimRule(age) + " " : ""}${ALWAYS} Photorealistic, sharp, natural, no text.`;
}

/** Edit a finished scene image: change only what is asked, keep the person, scene, framing and light. */
export function editScenePrompt(change: string, age?: string): string {
  return `Edit this photo. Keep everything exactly the same: the same person (face, hair, body), the scene, background, camera angle, framing, lighting and colour. Apply only this change: ${change.slice(0, 300)}. If it is about clothing, add or swap only that item and keep the rest of the person and scene identical. ${SWIM.test(change) ? "" : ""}Photorealistic, sharp, natural, no text.`;
}

export function placePrompt(outfit: string, action: string, tweak?: string, age?: string): string {
  const dress = outfit
    ? `Dress them ONLY in this outfit: ${outfit.slice(0, 300)}, styled stylishly. `
    : "Choose a stylish outfit that suits this scene and what they are doing. ";
  const swim = SWIM.test(outfit) || SWIM.test(action) || SWIM.test(tweak ?? "");
  return `${swim ? swimRule(age) + " " : ""}Image 1 is the scene and image 2 is the model reference. Place the same person from image 2 into the scene from image 1. Use image 2 ONLY for the person's identity: face, hair, age, skin tone and build. Do NOT copy the clothing, shoes, accessories, pose or plain studio background from image 2: fully replace their clothing, with nothing left over from image 2. ${dress}The outfit, footwear and accessories must make sense for the location and activity in the scene (for example beachwear and bare feet on a beach or at a pool, no jackets, trousers or loafers there). ${action ? "They are " + action.slice(0, 300) + ". " : ""}${ALWAYS} Match the scene's lighting, colour, perspective, scale, shadows and reflections so they look truly photographed there, with natural contact with the ground and objects. Do not change the scene itself: keep the architecture, objects, camera angle, framing and crop exactly as in image 1, and add only this one person. Photorealistic, sharp, no text.${tweak ? " Adjustment requested, apply it clearly: " + tweak.slice(0, 300) + "." : ""}`;
}

/**
 * Plain-language rewording for retries: swaps charged or slangy descriptors for neutral, factual clothing terms
 * (e.g. "micro bikini" becomes "slim classic bikini"). Returns the reworded text; the caller shows it to the user.
 */
export function softenText(text: string): string {
  let t = text;
  t = t.replace(/\b(micro|tiny|itsy[- ]bitsy|string|skimpy|minimal|brazilian|thong)\s+(bikini|swimsuit|swimwear)/gi, "slim classic $2");
  t = t.replace(/\b(sexy|seductive|provocative|revealing|sultry|busty|skin-?tight|tight|barely[- ]there|very small|tiny|skimpy)\b[,]?\s*/gi, "");
  t = t.replace(/\b(bikini)\s+(body|babe)\b/gi, "$1");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t || text;
}
