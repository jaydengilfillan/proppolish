/**
 * PropPolish — editing prompts.
 *
 * These prompts are PROVEN and LEGALLY LOAD-BEARING. Do not soften the
 * "ABSOLUTELY DO NOT" clauses — they are what keep the tool from creating a
 * misleading listing (removing permanent defects, altering structure, or
 * touching neighbouring property). Edit with care.
 */
import type { Provider } from "./config";

export type Mode = "interior" | "exterior";

/** Which top-level feature tab the job was created under. */
export type Tab = "declutter" | "enhance" | "restage" | "twilight" | "general";

/** Which sky reference image Twilight jobs should be composited against. */
export type TwilightSky = "orange" | "purple";

export const INTERIOR_PROMPT = `You are professionally editing a real estate listing photograph to make it clean, tidy and listing-ready.

DO: Remove clutter and the occupant's movable personal belongings — laundry, towels, laundry baskets, dishes and clutter on benchtops/tables/floors, fridge stickers/magnets/notes, personal photos/posters/artwork on walls, stray/random chairs, rubbish bins, cords, toys, pet items — by masking and removing ONLY those specific clutter regions; everything else in the frame must be left pixel-for-pixel untouched. Make beds neat with clean, simple, neutral bedding. Tidy soft furnishings. Only correct exposure where an area is genuinely too dark or too bright, and straighten vertical lines only if clearly crooked. The result must look like a professional agency listing photo of the SAME room, not a re-coloured or re-toned one.

ABSOLUTELY DO NOT (this is a legal requirement): change, move, add or remove any wall, window, door, ceiling, floor, or built-in fixture; change room dimensions or layout; add rooms, furniture, or features that are not physically present; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); replace the sky or change the weather/time of day; remove or alter anything outside this property (neighbouring buildings, power lines, fences, structures); never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances. ALSO DO NOT change the colour, hue, saturation or white balance of walls, tiles, benchtops, floors, cabinetry or any other surface — preserve the true, original paint and material colours exactly as photographed; do not introduce any colour cast, tint, wash, or haze over the image. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss, no colour shift. Subtle and real, not fantasy.`;

export const EXTERIOR_PROMPT = `You are professionally editing an exterior/aerial photograph of a residential property for a real estate listing. Preserve the EXACT camera angle, framing and composition of the original photograph — do not re-compose, re-frame, or change the viewpoint. DO: remove clutter from the yard/driveway/street — cars, boats, trailers, caravans, bins, hoses, rubbish, movable objects; tidy and evenly green/repair a patchy or overgrown lawn; correct exposure, white balance and colour to a natural professional grade. ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky or change weather/time of day; remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only.`;

/**
 * "Enhance" tab prompts — photographic finishing only, minimal/no decluttering.
 * Focused on lighting, exposure, colour grading and a polished "luxury listing"
 * look. Same legal DO-NOT clauses as the declutter prompts apply.
 */
export const ENHANCE_INTERIOR_PROMPT = `You are professionally finishing a real estate listing photograph to a premium, magazine-quality standard. The room's contents and layout should be left as-is — this is a lighting and finishing pass, not a decluttering pass.

DO: Correct exposure and white balance; brighten shadowed or dim areas while keeping highlights natural (no blown-out windows); apply a warm, bright, professional real-estate colour grade; increase clarity and sharpness subtly; straighten vertical lines and correct lens distortion; make the space feel bright, inviting and "listing ready". Only tidy something if it is an obvious piece of visible mess directly in frame (e.g. a crooked cushion); do not go looking for clutter to remove.

ABSOLUTELY DO NOT (this is a legal requirement): change, move, add or remove any wall, window, door, ceiling, floor, or built-in fixture; change room dimensions or layout; add rooms, furniture, or features that are not physically present; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); replace the sky seen through windows or change the weather/time of day; remove or alter anything outside this property; never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances or furniture. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss. Polished and premium, not fantasy.`;

export const ENHANCE_EXTERIOR_PROMPT = `You are professionally finishing an exterior/aerial photograph of a residential property to a premium, "luxury listing" standard. Preserve the EXACT camera angle, framing and composition of the original photograph — do not re-compose, re-frame, or change the viewpoint. The yard's contents and layout should be left as-is — this is a lighting and finishing pass, not a decluttering pass.

DO: Fix patchy, dead, brown or overgrown lawn so it looks evenly green, healthy and freshly mowed; correct exposure, white balance and colour to a bright, natural, professional grade; deepen sky colour to a clear, appealing blue if it is washed out (without changing the weather or time of day); make greenery, garden beds and hard surfaces look clean, vibrant and well maintained; sharpen subtly. Only remove something if it is an obvious piece of visible mess directly in frame; do not go looking for clutter to remove.

ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky's content or change the weather/time of day (deepening colour is fine, changing conditions is not); remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only.`;

/**
 * "Restage" tab prompts — Nano Banana (FAL) only, no OpenAI option in the UI.
 * Removes existing movable furniture/décor and restages using the CURRENT
 * setup as the reference, swapping each item for a nicer version of the same
 * type in the same position — not a redesign. Based on a prompt supplied by
 * the app owner for real listing shoots, generalised to any room/space.
 */
export const RESTAGE_INTERIOR_PROMPT = `Use the original room photo as the base. Preserve the EXACT camera angle, perspective, composition, room dimensions, architecture, walls, windows, doors, flooring, ceiling, lighting, and all permanent fixtures.

Remove the existing movable furniture and décor, then restage the room using the current setup as the direct reference for what belongs there. Keep the same furniture layout, positioning, orientation, scale, spacing, and intended function of each area, but replace each item with a more modern, refined, higher-quality version of the same type — for example, an existing sofa becomes a nicer updated sofa in the same position and orientation, a coffee table becomes a more contemporary equivalent, and any dining setting, bed, side table, rug, lamp, artwork or accessory becomes an improved version suited to the room. Only include furniture types that were already represented in the original room.

Maintain a cohesive, neutral, high-end real estate styling with tasteful, minimal décor. The new furniture must fit the room naturally and realistically, at the correct scale, without overcrowding or changing the layout.

ABSOLUTELY DO NOT (this is a legal requirement): relocate furniture to a different wall or area, redesign the room, change room dimensions or layout, alter the architecture, add or remove any wall, window, door, ceiling, floor, or built-in fixture; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); introduce furniture types, quantities, or features not already represented in the original setup; never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Produce a crisp, photorealistic luxury real estate image: natural textures, accurate shadows, realistic scale, clean colour balance, sharp detail, and a polished, HDR-quality finish. No AI haze, softness, warped furniture, distorted lines, duplicated objects, or changes to the original camera framing.`;

export const RESTAGE_EXTERIOR_PROMPT = `Use the original exterior photo as the base. Preserve the EXACT camera angle, perspective, composition, and framing — do not re-compose or change the viewpoint. Preserve the house roof, walls, brickwork, footprint, windows, driveway, fences, landscaping, garden beds, lawn, and every permanent structure exactly as photographed.

Remove the existing movable outdoor furniture and décor (patio sets, outdoor lounges, umbrellas, outdoor rugs, planters, cushions, string lights, BBQs), then restage the outdoor area using the current setup as the direct reference for what belongs there. Keep the same layout, positioning, orientation, scale and intended function of each area, but replace each item with a more modern, refined, higher-quality version of the same type. Only include outdoor furniture types that were already represented in the original setup.

Maintain a cohesive, neutral, high-end real estate styling with tasteful, minimal outdoor décor that fits the space naturally and realistically at the correct scale.

ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, driveway layout, or landscaping; replace the sky or change the weather/time of day; remove, add or alter any neighbouring house, building, road, power line or structure; relocate outdoor furniture to a different area or introduce furniture types not already represented in the original setup. Preserve the true building, landscaping and layout EXACTLY as photographed, from the same viewpoint.

Produce a crisp, photorealistic luxury real estate image: natural textures, accurate shadows, realistic scale, clean colour balance, sharp detail, and a polished, HDR-quality finish. No AI haze, softness, warped furniture, distorted lines, duplicated objects, or changes to the original camera framing.`;

/**
 * "Twilight" tab prompt — Nano Banana (FAL) only, multi-image edit. Converts a
 * daytime front-of-house or pool/back-entertaining hero shot into a dusk shot.
 * A second image (the sky reference the user picked) is sent alongside the
 * photo; this prompt tells the model how to use it. Same hard DO-NOT pattern
 * as the rest of this file — no new fixtures, nothing moved, camera locked.
 */
export const TWILIGHT_PROMPT = `You are professionally converting a daytime real estate photograph (front-of-house or pool/back-entertaining hero shot) into a realistic night twilight scene. A second reference image is provided showing the exact sky — colour, gradient and cloud pattern — to use.

DO: Transform this daytime shot into a realistic night twilight scene. Set the sky to the sky shown in the second reference image. Turn on all visible exterior lighting that is physically already fitted to the building — window lights, downlights, wall sconces, path/step lights, eave lights — so it reads as switched on at dusk, but do not add any lighting that isn't already there. Keep the house, landscaping, and camera angle exactly the same. Maintain a natural, balanced lighting between the sky and the lit building. If a pool is visible, illuminate the pool water a natural light blue. Cinematic, high-end real estate twilight look — photorealistic, no stylisation.

ABSOLUTELY DO NOT (this is a legal requirement): add any light fixture, lamp, downlight, string light or illuminated feature that is not physically present in the original photograph; add, remove, duplicate or move any furniture, landscaping, vehicle, person or object; change the camera angle, framing, composition, zoom or perspective; change the building's structure, walls, windows, doors, roofline, or any permanent feature; alter neighbouring buildings, fences, power lines or structures. Preserve the property's true architecture, layout and every permanent feature EXACTLY as photographed — only the sky and the ambient/exterior lighting may change.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss.`;

/**
 * Extra instruction appended only for the OpenAI (ChatGPT) provider on exterior
 * Enhance jobs. gpt-image-2 handles fine surface texture work well, so we ask it
 * to specifically look at hard surfaces (driveways, paths, gutters, downpipes,
 * concrete, paving) and clean up dirt/staining/blemishes in-place — same
 * material and colour, just cleaner. This does not apply to the FAL/Nano Banana
 * provider, the Declutter tab, or the Restage tab.
 */
export const OPENAI_EXTERIOR_TEXTURE_INSTRUCTION = `Also inspect hard surface textures visible in the frame — driveways, paths, gutters, downpipes, concrete and paving. Where they show dirt, staining, moss, algae, cracks or general blemishes, clean and refresh the texture/finish so it looks well maintained, using the SAME colour, material and style already present (e.g. concrete stays the same grey concrete — do not change it to pavers, a different colour, or a different material). Do not change the shape, layout, size or material type of these surfaces — texture and cleanliness only.`;

/**
 * Build the final prompt for a job.
 *
 * The optional user note is appended AFTER the base prompt so the DO-NOT rules
 * are still in force; the note wording explicitly reminds the model to obey the
 * note while respecting those rules. The optional provider is used to append
 * provider-specific instructions (currently: OpenAI exterior texture cleanup).
 */
export function buildPrompt(
  tab: Tab,
  mode: Mode,
  note?: string,
  provider?: Provider,
  customPrompt?: string
): string {
  let base: string;
  if (tab === "general") {
    // "Prompt" tab: the user's own text IS the whole prompt — no template,
    // no DO-NOT guardrails, no legal-safety scaffolding. That's the deal:
    // full control, so full responsibility for what it does to the photo.
    base = (customPrompt ?? "").trim();
  } else if (tab === "twilight") {
    base = TWILIGHT_PROMPT;
  } else if (tab === "enhance") {
    base = mode === "exterior" ? ENHANCE_EXTERIOR_PROMPT : ENHANCE_INTERIOR_PROMPT;
  } else if (tab === "restage") {
    base = mode === "exterior" ? RESTAGE_EXTERIOR_PROMPT : RESTAGE_INTERIOR_PROMPT;
  } else {
    base = mode === "exterior" ? EXTERIOR_PROMPT : INTERIOR_PROMPT;
  }

  if (tab === "enhance" && mode === "exterior" && provider === "openai") {
    base = base + "\n\n" + OPENAI_EXTERIOR_TEXTURE_INSTRUCTION;
  }

  const trimmed = note?.trim();
  if (!trimmed) return base;
  return (
    base +
    "\n\nAdditional instruction from the user (obey it, but still respect ALL the DO-NOT rules above): " +
    trimmed
  );
}
