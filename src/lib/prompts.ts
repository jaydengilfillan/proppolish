/**
 * PropPolish — editing prompts.
 *
 * These prompts are PROVEN and LEGALLY LOAD-BEARING. Do not soften the
 * "ABSOLUTELY DO NOT" clauses — they are what keep the tool from creating a
 * misleading listing (removing permanent defects, altering structure, or
 * touching neighbouring property). Edit with care.
 */

export type Mode = "interior" | "exterior";

export const INTERIOR_PROMPT = `You are professionally editing a real estate listing photograph to make it clean, tidy and listing-ready.

DO: Remove clutter and the occupant's movable personal belongings — laundry, towels, laundry baskets, dishes and clutter on benchtops/tables/floors, fridge stickers/magnets/notes, personal photos/posters/artwork on walls, stray/random chairs, rubbish bins, cords, toys, pet items. Make beds neat with clean, simple, neutral bedding. Tidy soft furnishings. Correct exposure and white balance, brighten dim/shadowed areas, apply a natural professional real-estate colour grade, and straighten vertical lines. The result must look like a professional agency listing photo.

ABSOLUTELY DO NOT (this is a legal requirement): change, move, add or remove any wall, window, door, ceiling, floor, or built-in fixture; change room dimensions or layout; add rooms, furniture, or features that are not physically present; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); replace the sky or change the weather/time of day; remove or alter anything outside this property (neighbouring buildings, power lines, fences, structures); never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss. Subtle and real, not fantasy.`;

export const EXTERIOR_PROMPT = `You are professionally editing an exterior/aerial photograph of a residential property for a real estate listing. Preserve the EXACT camera angle, framing and composition of the original photograph — do not re-compose, re-frame, or change the viewpoint. DO: remove clutter from the yard/driveway/street — cars, boats, trailers, caravans, bins, hoses, rubbish, movable objects; tidy and evenly green/repair a patchy or overgrown lawn; correct exposure, white balance and colour to a natural professional grade. ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky or change weather/time of day; remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only.`;

/**
 * Build the final prompt for a job.
 *
 * The optional user note is appended AFTER the base prompt so the DO-NOT rules
 * are still in force; the note wording explicitly reminds the model to obey the
 * note while respecting those rules.
 */
export function buildPrompt(mode: Mode, note?: string): string {
  const base = mode === "exterior" ? EXTERIOR_PROMPT : INTERIOR_PROMPT;
  const trimmed = note?.trim();
  if (!trimmed) return base;
  return (
    base +
    "\n\nAdditional instruction from the user (obey it, but still respect ALL the DO-NOT rules above): " +
    trimmed
  );
}
