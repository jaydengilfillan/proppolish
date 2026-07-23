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

/**
 * Interior Twilight has two looks:
 * - "natural": walls/ceiling/floor stay their true daytime neutral colour,
 *   only lit fixtures glow warm and the window view goes dusk. Closer to a
 *   literal "same room, lights on, sun down" result.
 * - "golden": an intentionally warm, cinematic "golden hour" ambient glow is
 *   allowed to wash gently across the whole room, not just near fixtures —
 *   this is the look the app owner actually preferred after testing, and is
 *   now an explicit deliberate style rather than an unwanted colour leak.
 */
export type TwilightStyle = "natural" | "golden";

/**
 * Plain-text descriptions of each sky option, used for INTERIOR twilight jobs
 * instead of sending the actual reference photo. Interior jobs kept picking up
 * the reference image's orange/purple hue as a global colour grade across
 * walls, ceilings and cabinetry no matter how firmly the prompt forbade it —
 * a known failure mode of multi-image edit models blending palettes across
 * all supplied images. Describing the sky in words instead removes that bias
 * source entirely; only the small window/glass-door area needs to match it,
 * so a description is precise enough and there's no second image to leak.
 * Exterior jobs are unaffected — they still use the real reference image,
 * since the whole point there IS to repaint the sky itself to match exactly.
 */
export const TWILIGHT_SKY_DESCRIPTIONS: Record<TwilightSky, string> = {
  orange:
    "a rich dusk sky that is mostly a deep, cool blue across the upper sky, softening down through a dusty blue-grey and then a pale blush pink lower down, with only a narrow warm orange-peach glow right along the horizon line where the sun has just set — most of the sky is cool blue, the warm colour is a thin band right at the horizon, not the whole sky",
  purple:
    "a moody twilight sky that is mostly a deep indigo-purple across the upper sky, softening down through a dusty mauve-pink lower down, with only a narrow warm golden-peach glow right along the horizon line where the sun has just set — most of the sky is cool indigo-purple, the warm colour is a thin band right at the horizon, not the whole sky",
};

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

DO: Correct exposure and white balance; brighten shadowed or dim areas while keeping highlights natural (no blown-out windows); apply a warm, bright, professional real-estate colour grade through LIGHT AND SHADOW, not through a colour wash over surfaces; increase clarity and sharpness subtly; straighten vertical lines and correct lens distortion; make the space feel bright, inviting and "listing ready". Walls, ceilings and any other neutral surface (white, off-white, cream, grey) MUST read as that same true neutral colour in the result — brightening and warming the light in the room is fine, but the wall paint itself must not shift towards pink, magenta, purple, orange or yellow. If a wall was white before, it must still look white after, just better lit. Only tidy something if it is an obvious piece of visible mess directly in frame (e.g. a crooked cushion); do not go looking for clutter to remove.

ABSOLUTELY DO NOT (this is a legal requirement): change, move, add or remove any wall, window, door, ceiling, floor, or built-in fixture; change room dimensions or layout; add rooms, furniture, or features that are not physically present; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); replace the sky seen through windows or change the weather/time of day; remove or alter anything outside this property; never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances or furniture; never apply a colour tint, wash or cast to walls, ceilings or other neutral surfaces — no pink, magenta, purple, orange or yellow tinge on anything that was originally white, off-white or grey. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss. Polished and premium, not fantasy.`;

export const ENHANCE_EXTERIOR_PROMPT = `You are professionally finishing an exterior/aerial photograph of a residential property to a premium, "luxury listing" standard. Preserve the EXACT camera angle, framing and composition of the original photograph — do not re-compose, re-frame, or change the viewpoint. The yard's contents and layout should be left as-is — this is a lighting and finishing pass, not a decluttering pass.

DO: Fix patchy, dead, brown or overgrown lawn so it looks evenly green, healthy and freshly mowed; correct exposure, white balance and colour to a bright, natural, professional grade through LIGHT, not through a colour wash over surfaces; make greenery, garden beds and hard surfaces look clean, vibrant and well maintained; sharpen subtly. Most skies are already fine as photographed and should be left alone — only if the sky is genuinely washed out, hazy or flat should you deepen it, and even then only a small, subtle nudge back toward natural, never a strong or dramatic push. Render/painted walls, trim and any other neutral-coloured surface (white, off-white, cream, grey) MUST read as that same true neutral colour in the result — do not let white or off-white walls, render or trim shift towards pink, magenta, purple, orange or yellow. If a wall was white before, it must still look white after, just better lit. Only remove something if it is an obvious piece of visible mess directly in frame; do not go looking for clutter to remove.

ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky's content or change the weather/time of day; saturate or deepen the sky beyond a small, subtle correction on a genuinely washed-out sky — never produce an intensely saturated, vivid, or artificial-looking blue; a sky that was already a normal, natural blue must be left as it was, not made richer; remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there; apply a colour tint, wash or cast to walls, render, trim or other neutral surfaces — no pink, magenta, purple, orange or yellow tinge on anything that was originally white, off-white or grey. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only.`;

/**
 * "Restage" tab prompts — Nano Banana (FAL) only, no OpenAI option in the UI.
 * Removes existing movable furniture/décor and restages using the CURRENT
 * setup as the reference, swapping each item for a nicer version of the same
 * type in the same position — not a redesign. Based on a prompt supplied by
 * the app owner for real listing shoots, generalised to any room/space.
 */
export const RESTAGE_INTERIOR_PROMPT = `Use the original room photo as the base. Preserve the EXACT camera angle, perspective, composition, room dimensions, architecture, walls, windows, doors, flooring, ceiling, lighting, and all permanent fixtures.

If the room already has furniture: remove the existing movable furniture and décor, then restage using the current setup as the direct reference for what belongs there. Keep the same furniture layout, positioning, orientation, scale, spacing, and intended function of each area, but replace each item with a more modern, refined, higher-quality version of the same type — for example, an existing sofa becomes a nicer updated sofa in the same position and orientation, a coffee table becomes a more contemporary equivalent, and any dining setting, bed, side table, rug, lamp, artwork or accessory becomes an improved version suited to the room. Only include furniture types that were already represented — do not introduce new categories of furniture into an already-furnished room.

If the room is empty or near-empty (no existing furniture to reference): stage it from scratch with an appropriate, tasteful furniture set for its evident function — e.g. a living room gets a sofa, coffee table and rug; a bedroom gets a bed, side tables and a lamp; a dining area gets a table and chairs; a kitchen gets simple styling accessories only, no structural changes. Place everything at a realistic scale for the room's actual dimensions, in a natural, functional layout that respects the room's proportions, doorways and walkways.

Maintain a cohesive, neutral, high-end real estate styling with tasteful, minimal décor. The furniture must fit the room naturally and realistically, at the correct scale, without overcrowding or changing the layout.

ABSOLUTELY DO NOT (this is a legal requirement): relocate furniture to a different wall or area, redesign the room, change room dimensions or layout, alter the architecture, add or remove any wall, window, door, ceiling, floor, or built-in fixture; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); if furniture already exists, introduce furniture types, quantities, or features not already represented in the original setup; never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Produce a crisp, photorealistic luxury real estate image: natural textures, accurate shadows, realistic scale, clean colour balance, sharp detail, and a polished, HDR-quality finish. No AI haze, softness, warped furniture, distorted lines, duplicated objects, or changes to the original camera framing.`;

export const RESTAGE_EXTERIOR_PROMPT = `Use the original exterior photo as the base. Preserve the EXACT camera angle, perspective, composition, and framing — do not re-compose or change the viewpoint. Preserve the house roof, walls, brickwork, footprint, windows, driveway, fences, landscaping, garden beds, lawn, and every permanent structure exactly as photographed.

If the outdoor area already has furniture: remove the existing movable outdoor furniture and décor (patio sets, outdoor lounges, umbrellas, outdoor rugs, planters, cushions, string lights, BBQs), then restage using the current setup as the direct reference for what belongs there. Keep the same layout, positioning, orientation, scale and intended function of each area, but replace each item with a more modern, refined, higher-quality version of the same type. Only include outdoor furniture types that were already represented — do not introduce new categories into an already-furnished space.

If the outdoor area is empty or near-empty (no existing furniture to reference): stage it from scratch with an appropriate, tasteful outdoor furniture set for its evident function — e.g. a back entertaining area gets an outdoor lounge or dining setting; a pool surround gets sun loungers. Place everything at a realistic scale for the space's actual dimensions, in a natural layout that respects paving, walkways and sightlines.

Maintain a cohesive, neutral, high-end real estate styling with tasteful, minimal outdoor décor that fits the space naturally and realistically at the correct scale.

ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, driveway layout, or landscaping; replace the sky or change the weather/time of day; remove, add or alter any neighbouring house, building, road, power line or structure; relocate outdoor furniture to a different area; if furniture already exists, introduce furniture types not already represented in the original setup. Preserve the true building, landscaping and layout EXACTLY as photographed, from the same viewpoint.

Produce a crisp, photorealistic luxury real estate image: natural textures, accurate shadows, realistic scale, clean colour balance, sharp detail, and a polished, HDR-quality finish. No AI haze, softness, warped furniture, distorted lines, duplicated objects, or changes to the original camera framing.`;

/**
 * "Twilight" tab prompts — Nano Banana (FAL) only. Converts a daytime shot
 * into a dusk shot. Same hard DO-NOT pattern as the rest of this file — no
 * new fixtures, nothing moved, camera locked. Split interior/exterior because
 * an interior shot has no direct sky to repaint. Exterior sends the actual
 * sky reference image (a second input image) since repainting the sky to
 * match it exactly is the whole point there. Interior does NOT send that
 * image — the walls kept picking up its colour as a global grade regardless
 * of instructions, a known failure mode of multi-image blending — so interior
 * jobs describe the sky in words instead (TWILIGHT_SKY_DESCRIPTIONS) and pick
 * one of two interior styles: "natural" (walls stay true daytime colour) or
 * "golden" (a deliberate warm golden-hour glow across the room, which is what
 * the app owner actually preferred after side-by-side testing).
 */
export const TWILIGHT_EXTERIOR_PROMPT = `You are professionally converting a daytime real estate photograph (front-of-house or pool/back-entertaining hero shot) into a realistic night twilight scene. A second reference image is provided showing the exact sky — colour, gradient and cloud pattern — to use.

DO: Transform this daytime shot into a realistic night twilight scene. Set the sky to the sky shown in the second reference image. Turn on all visible exterior lighting that is physically already fitted to the building — window lights, downlights, wall sconces, path/step lights, eave lights — so it reads as switched on at dusk, but do not add any lighting that isn't already there. Keep the house, landscaping, and camera angle exactly the same. Maintain a natural, balanced lighting between the sky and the lit building. If a pool is visible, illuminate the pool water a natural light blue. Cinematic, high-end real estate twilight look — photorealistic, no stylisation.

ABSOLUTELY DO NOT (this is a legal requirement): add any light fixture, lamp, downlight, string light or illuminated feature that is not physically present in the original photograph; add, remove, duplicate or move any furniture, landscaping, vehicle, person or object; change the camera angle, framing, composition, zoom or perspective; change the building's structure, walls, windows, doors, roofline, or any permanent feature; alter neighbouring buildings, fences, power lines or structures. Preserve the property's true architecture, layout and every permanent feature EXACTLY as photographed — only the sky and the ambient/exterior lighting may change.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss.`;

export const TWILIGHT_INTERIOR_PROMPT = `You are professionally converting a daytime interior real estate photograph into a realistic dusk/twilight scene, as if the same room were photographed at that same time of evening. No second reference image is provided for this job — the sky/window view is described in words below on purpose, so there is nothing external whose colour could leak onto the room's own surfaces.

DO: Through any windows or glass doors, replace the visible outside sky/view with {{SKY_DESCRIPTION}}. That described colour belongs ONLY in that small window/glass area — nowhere else in the frame. Turn on interior lights that are physically already fitted to the room (ceiling lights, downlights, lamps, pendants) and dim the overall ambient exposure slightly so the room reads as photographed at dusk, not midday. Any warmth in the room must come ONLY from those real, existing light sources glowing at their own natural colour temperature (typically a soft neutral-to-warm white, like a real downlight or lamp) — small, localised pools of light immediately around each fixture are fine and expected. Keep the room's contents, furniture, layout and camera angle exactly the same.

WALLS, CEILING AND FLOOR MUST STAY THEIR TRUE DAYTIME COLOUR — THIS IS THE MOST IMPORTANT RULE, NOT OPTIONAL: if a wall, ceiling, cabinet or floor was white, off-white, cream or grey in the original photo, it MUST still read as that same neutral colour here, just dimmer and under artificial light instead of daylight. There must be NO overall orange, amber, peach, tan, honey, purple, pink or magenta cast washed across walls, ceilings, floors or cabinetry — not even a subtle one. Before finishing, check every large surface in the frame: does it still look like the same neutral material as the daytime original, just under warm little pools of lamp/downlight glow — or does the whole surface look tinted/dyed by a sunset colour? If it looks tinted or dyed anywhere, that is wrong — repaint it back to the original neutral colour. Only the direct, local glow immediately surrounding a lit fixture may shift warm; large flat expanses of wall, ceiling and floor away from any fixture must remain visibly neutral (white/off-white/cream/grey), the same as they were in the original photo, changed only by being dimmer.

ABSOLUTELY DO NOT (this is a legal requirement): add any light fixture, lamp, downlight or illuminated feature that is not physically present in the original photograph; add, remove, duplicate or move any furniture or object; change the camera angle, framing, composition, zoom or perspective; change the room's structure, walls, windows, doors, ceiling, floor, or any permanent feature; apply the outside sky colour, or any orange/amber/purple/pink colour wash, to walls, ceilings, floors, cabinetry or benchtops. Preserve the room's true architecture, true wall/surface colours, layout and every permanent feature EXACTLY as photographed — only the view through windows/glass, the overall ambient exposure, and which fixtures are switched on may change.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss, no colour wash over surfaces.`;

export const TWILIGHT_INTERIOR_GOLDEN_PROMPT = `You are professionally converting a daytime interior real estate photograph into a warm, cinematic "golden hour dusk" scene, as if the same room were photographed right at that magic-hour moment in the evening. No second reference image is provided for this job — the sky/window view is described in words below on purpose.

DO: Through any windows or glass doors, replace the visible outside sky/view with {{SKY_DESCRIPTION}}. Turn on interior lights that are physically already fitted to the room (ceiling lights, downlights, lamps, pendants) and dim the overall ambient exposure so the room reads as photographed at dusk, not midday. This style is deliberately warm and golden: let a soft, gentle golden-hour glow settle across the room as a whole — walls, ceiling and floor may take on a warm honey/golden cast from the low warm light and the glow of the room's own fixtures, in addition to brighter pools directly around each lamp/downlight. Keep the room's contents, furniture, layout and camera angle exactly the same.

KEEP IT TASTEFUL, NOT A FILTER: the golden warmth should look like real warm light filling the room, not a flat colour overlay pasted on top of the image. Surfaces should still show their true material and form — timber still looks like timber, upholstery still looks like fabric — just bathed in soft golden light. Avoid pushing it into a heavy, saturated, artificial orange; this should read as an inviting, premium "golden hour" real estate photo, not a fantasy or a colour-filter effect. Do not let colours clip or go neon — keep shadows and highlights natural and believable.

ABSOLUTELY DO NOT (this is a legal requirement): add any light fixture, lamp, downlight or illuminated feature that is not physically present in the original photograph; add, remove, duplicate or move any furniture or object; change the camera angle, framing, composition, zoom or perspective; change the room's structure, walls, windows, doors, ceiling, floor, or any permanent feature. Preserve the room's true architecture, layout and every permanent feature EXACTLY as photographed — only the view through windows/glass, the overall ambient exposure/warmth, and which fixtures are switched on may change.

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
 * "Room Match" addendum — appended to a Restage prompt when a second image is
 * supplied: a reference photo of the SAME room, a different angle, already
 * staged/restaged. Used by the Room Match tool so multiple angles of one room
 * land on matching furniture instead of each angle being staged in isolation.
 *
 * Caveat this prompt can't fully solve: 2D image models have no real 3D
 * understanding of the room, so this asks for consistent furniture choices
 * and plausible placement, not geometrically perfect alignment across angles.
 */
export const MATCH_CONSISTENCY_ADDENDUM = `A second reference image is provided: this exact same room, already staged, photographed from a different angle. Match your result for THIS photo to that reference as closely as possible — the same sofa, same coffee table, same rug, same artwork, same lighting fixtures, same colour palette and same overall styling should appear in both, just seen from this photo's own camera angle and framing. Do not copy the reference image directly — place each piece of furniture in a position and orientation that is physically plausible for what this specific angle would actually show of the same room, including anything from the reference that would logically be out of frame or hidden from here. The goal: someone flipping between these photos should recognise it as the same room, staged once, not two different rooms.`;

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
  customPrompt?: string,
  matchReference?: boolean,
  sky?: TwilightSky,
  style?: TwilightStyle
): string {
  let base: string;
  if (tab === "general") {
    // "Prompt" tab: the user's own text IS the whole prompt — no template,
    // no DO-NOT guardrails, no legal-safety scaffolding. That's the deal:
    // full control, so full responsibility for what it does to the photo.
    base = (customPrompt ?? "").trim();
  } else if (tab === "twilight") {
    if (mode === "exterior") {
      base = TWILIGHT_EXTERIOR_PROMPT;
    } else {
      const template = style === "golden" ? TWILIGHT_INTERIOR_GOLDEN_PROMPT : TWILIGHT_INTERIOR_PROMPT;
      base = template.replace("{{SKY_DESCRIPTION}}", TWILIGHT_SKY_DESCRIPTIONS[sky ?? "orange"]);
    }
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

  if (tab === "restage" && matchReference) {
    base = base + "\n\n" + MATCH_CONSISTENCY_ADDENDUM;
  }

  const trimmed = note?.trim();
  if (!trimmed) return base;
  return (
    base +
    "\n\nAdditional instruction from the user (obey it, but still respect ALL the DO-NOT rules above): " +
    trimmed
  );
}
