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

/**
 * Declutter has two intensities:
 * - "light": for an already-fairly-clean room — pick up small, unambiguous
 *   items only (shoes, loose small objects, minor dirt) and leave everything
 *   else untouched, including things a "heavy" pass would remove.
 * - "heavy": the original full declutter pass — clears out clutter and
 *   personal belongings more broadly, tidies bedding, etc. Default, so
 *   existing behaviour for anyone who doesn't pick an intensity is unchanged.
 */
export type DeclutterIntensity = "light" | "heavy";

/**
 * Enhance has two types:
 * - "standard": the original lighting/finishing pass, split by Interior/
 *   Exterior mode as before.
 * - "night": a restoration pass for blurry night-time drone/aerial shots —
 *   recovers detail, kills motion blur/noise/haze. Always exterior/aerial by
 *   nature, so it doesn't use the Interior/Exterior mode at all.
 */
export type EnhanceType = "standard" | "night";

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
 * Twilight has two scenes:
 * - "dusk" (default): the original sunset/twilight look — sky-swap on
 *   exterior hero shots, dusk-through-the-window on interior shots.
 * - "night_city": converts a daytime balcony/rooftop/high-rise view of a
 *   city skyline into a full night cityscape — every building's windows lit,
 *   dark night sky, everything else (building shapes, layout, any signage)
 *   locked exactly as photographed. Always treated as exterior/aerial —
 *   there's no "interior" version of a skyline shot.
 */
export type TwilightScene = "dusk" | "night_city";

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

DO: Remove clutter and the occupant's movable personal belongings — laundry, towels, laundry baskets, dishes and clutter on benchtops/tables/floors, fridge stickers/magnets/notes, personal photos/posters/artwork on walls, stray/random chairs, rubbish bins, cords, toys, pet items — by masking and removing ONLY those specific clutter regions; everything else in the frame must be left pixel-for-pixel untouched. Make beds neat with clean, simple, neutral bedding. Tidy soft furnishings. Straighten vertical lines only if clearly crooked. Also give the whole image a light, professional finishing pass at the same time: correct exposure and white balance, gently lift shadowed areas while keeping highlights natural, and subtly sharpen/restore clarity and colour vibrancy through LIGHT AND SHADOW, not a colour wash — the output must look crisp and true to the original's own colours, never softer, flatter, greyer, or lower quality than the photo you started with. The result must look like a professional agency listing photo of the SAME room, not a re-coloured or re-toned one.

ABSOLUTELY DO NOT (this is a legal requirement): change, move, add or remove any wall, window, door, ceiling, floor, or built-in fixture; change room dimensions or layout; add rooms, furniture, or features that are not physically present; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); replace the sky or change the weather/time of day; remove or alter anything outside this property (neighbouring buildings, power lines, fences, structures); never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances. ALSO DO NOT change the hue of walls, tiles, benchtops, floors, cabinetry or any other surface — preserve the true, original paint and material colours exactly as photographed; do not introduce any colour cast, tint, wash, or haze over the image. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss, no colour shift. The finished image should look sharper, cleaner and richer in colour than the original — never blurrier, softer, duller, or lower quality as a result of the edit. Subtle and real, not fantasy.`;

export const EXTERIOR_PROMPT = `You are professionally editing an exterior/aerial photograph of a residential property for a real estate listing. Preserve the EXACT camera angle, framing and composition of the original photograph — do not re-compose, re-frame, or change the viewpoint. DO: remove clutter from the yard/driveway/street — cars, boats, trailers, caravans, bins, hoses, rubbish, movable objects; tidy and evenly green/repair a patchy or overgrown lawn; correct exposure, white balance and colour to a natural professional grade; subtly sharpen and lift overall clarity so the result reads crisp and clean — never softer, hazier, flatter, or lower quality than the original photo. ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky or change weather/time of day; remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only — the finished image should look sharper and cleaner than the original, never degraded by the edit.`;

/**
 * Declutter — "Light" intensity. For a room/yard that's already fairly
 * presentable and just needs a small tidy-up (a stray pair of shoes, a bit
 * of dust, a hose left out) rather than the full clear-out the standard
 * prompts above do. Deliberately narrower scope than INTERIOR_PROMPT /
 * EXTERIOR_PROMPT — if it's not small and unambiguous, leave it alone.
 */
export const DECLUTTER_LIGHT_INTERIOR_PROMPT = `You are lightly tidying a real estate listing photograph of a room that is already fairly clean and presentable — this is a light touch-up pass, not a full declutter.

DO: Remove only small, obviously out-of-place items directly in frame — shoes, a stray bag, loose small objects on the floor/benchtops/tables, stray cords, a small piece of rubbish, pet bowls or pet items — and clean up minor dirt, dust, smudges or marks on floors and surfaces. Leave everything else exactly as it is: do not rearrange or restyle furniture, do not restyle bedding beyond removing anything obviously loose or messy sitting on top of it, do not remove books, decor, plants, artwork or personal items that could plausibly be intentional styling. If an item is ambiguous or could be deliberate styling rather than clutter, leave it untouched. Only correct exposure where an area is genuinely too dark or too bright, and give the image a light overall finishing pass at the same time — correct white balance, and subtly sharpen/restore clarity and colour vibrancy through light and shadow, not a colour wash — so the result looks crisp and true to the original's own colours, never softer, flatter, or lower quality than the photo you started with.

ABSOLUTELY DO NOT (this is a legal requirement): change, move, add or remove any wall, window, door, ceiling, floor, or built-in fixture; change room dimensions or layout; add rooms, furniture, or features that are not physically present; remove or conceal any permanent defect (cracks, damp, mould, water stains, damage); replace the sky or change the weather/time of day; remove or alter anything outside this property (neighbouring buildings, power lines, fences, structures); never remove window coverings, blinds, curtains or security screens; never reposition or resize built-in appliances. ALSO DO NOT change the hue of walls, tiles, benchtops, floors, cabinetry or any other surface — preserve the true, original paint and material colours exactly as photographed; do not introduce any colour cast, tint, wash, or haze over the image. Preserve the property's true architecture and every permanent feature EXACTLY as photographed.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted textures, no fake gloss, no colour shift. The result should look like the SAME photo with only a small handful of obvious items picked up — but sharper and cleaner, not dulled or degraded by the edit — not a heavily reworked room.`;

export const DECLUTTER_LIGHT_EXTERIOR_PROMPT = `You are lightly tidying an exterior/aerial real estate photograph of a property that is already fairly presentable — this is a light touch-up pass, not a full declutter. Preserve the EXACT camera angle, framing and composition of the original photograph — do not re-compose, re-frame, or change the viewpoint.

DO: Remove only small, obviously out-of-place loose items directly in frame — shoes left by the door, a hose left out, a small bin left out, a stray piece of rubbish, a garden tool left lying around — and apply light exposure/white balance correction, plus a subtle sharpen/clarity boost so the result reads crisp — never softer, hazier, or lower quality than the original photo. Leave the lawn, garden beds and landscaping as photographed — do not regreen, repair or tidy the lawn or gardens; that is out of scope for a light pass. If an item is a larger object (a car, boat, trailer, caravan) or looks like it could be intentional (outdoor furniture, a planted pot, a bike stored neatly), leave it.

ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky or change weather/time of day; remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there; regreen or repair the lawn. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only — the result should look like the SAME photo with only a small handful of obvious items picked up, but crisp and true to its original colour and quality, not dulled by the edit.`;

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

DO: Fix patchy, dead, brown or overgrown lawn so it looks evenly green, healthy and freshly mowed — but it must still read as REAL grass: keep natural blade texture and some tonal variation across the lawn, never a single flat, uniform, plastic or synthetic-turf-looking green, and do not push the saturation into a neon or artificial colour. This is a full ground-level tidy-up, not a lawn-only pass: also clean up exposed dirt or bare patches, mud, weedy or messy garden bed edges, and dirty or stained pathways/driveways in the SAME pass as the lawn — dirt/bare patches should be reduced or blended into the surrounding healthy lawn where realistic, and pathways/driveways should look clean and swept, same material and layout, just tidier. Correct exposure, white balance and colour to a bright, natural, professional grade through LIGHT, not through a colour wash over surfaces; make greenery, garden beds and hard surfaces look clean, vibrant and well maintained; sharpen subtly. Most skies are already fine as photographed and should be left alone — only if the sky is genuinely washed out, hazy or flat should you deepen it, and even then only a small, subtle nudge back toward natural, never a strong or dramatic push. Render/painted walls, trim and any other neutral-coloured surface (white, off-white, cream, grey) MUST read as that same true neutral colour in the result — do not let white or off-white walls, render or trim shift towards pink, magenta, purple, orange or yellow. If a wall was white before, it must still look white after, just better lit. Only remove something if it is an obvious piece of visible mess directly in frame; do not go looking for clutter to remove.

ABSOLUTELY DO NOT: alter the house roof, walls, brickwork, footprint, extensions, windows, or built structures; change the property boundaries, fences, or driveway layout; replace the sky's content or change the weather/time of day; saturate or deepen the sky beyond a small, subtle correction on a genuinely washed-out sky — never produce an intensely saturated, vivid, or artificial-looking blue; a sky that was already a normal, natural blue must be left as it was, not made richer; remove, add or alter any neighbouring house, building, road, power line or structure; add pools, gardens, trees or landscaping features that are not there; apply a colour tint, wash or cast to walls, render, trim or other neutral surfaces — no pink, magenta, purple, orange or yellow tinge on anything that was originally white, off-white or grey. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint. Photorealistic and believable only.`;

/**
 * "Enhance" tab, "Night" type — a restoration pass for blurry night-time
 * drone/aerial shots (common cause: drone drift during a long night
 * exposure). Different job to the standard Enhance prompts above: this is
 * about recovering detail and killing blur/noise, not colour grading or
 * lawn touch-ups. Always exterior/aerial by nature, so it ignores the
 * Interior/Exterior mode entirely. Adapted from a prompt the app owner
 * already uses and has tested against real drone shots.
 */
export const ENHANCE_NIGHT_PROMPT = `You are professionally enhancing and restoring a blurry night-time drone/aerial real estate photograph. This is a restoration and sharpening pass — recovering detail that's genuinely there but soft/noisy, not a redesign or relighting pass. Preserve the EXACT original camera angle, perspective, framing, composition and physical layout — do not re-compose, re-frame, or change the viewpoint.

DO: Carefully recover natural detail and edge definition across the entire scene — buildings, windows, roads, landscaping and the skyline. Reduce motion blur, softness, digital noise, colour banding, compression artefacts and atmospheric haze, while maintaining realistic night-time lighting. Improve clarity and dynamic range. Keep building textures realistic, window lights controlled and highlights properly exposed. Maintain natural shadows and believable night colours. Preserve all existing signage, lettering, logos and branding exactly as photographed — do not regenerate, reinterpret, misspell, oversharpen or replace any text.

ABSOLUTELY DO NOT (this is a legal requirement): alter, redesign, move, remove or add any building, window, balcony, road, structure, light or landscape feature; change the property boundaries or footprint; replace the sky or change the time of night; remove, add or alter any neighbouring building, road, power line or structure; misrepresent, regenerate or alter any signage, lettering, logo or branding. Preserve the true building and layout and every permanent structure EXACTLY as photographed, from the same viewpoint.

Improve clarity and dynamic range without creating harsh artificial sharpening, halos, glowing edges, oversaturated colours, or an AI-generated appearance. The final result should look like a genuinely sharp photograph captured with a high-quality professional drone camera at night — not a digitally rebuilt or AI-generated image.`;

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

DO: Transform this daytime shot into a realistic night twilight scene, a premium, high-end "luxury listing" hero shot — this should look rich, warm and inviting, not flat or underwhelming. Set the sky to the sky shown in the second reference image. WINDOWS: every window on the property should read as lit from inside with a warm, confident, inviting glow, the way real houses actually look at dusk with their interior lights on — this is the standard, expected look for a twilight listing photo, so light windows properly and warmly, not dimly or timidly; do not leave windows dark just because you can't see a literal light fixture through them in a DAYTIME photo — you never can, that's normal, light them anyway. EXTERIOR-MOUNTED FIXTURES (downlights, eave lights, wall sconces, path/step lights — anything mounted to the outside of the building itself): here, and only here, be strict — first inspect the ORIGINAL daytime photo and identify only the fixtures whose physical body is actually visible in it, then switch on ONLY those, in exactly the position they already exist. Do not invent an exterior fixture anywhere just because that's a typical place one would be installed on a similar house (e.g. under an eave, beside a front door, spaced along a wall) — if a fixture body isn't visible in the original photo, it does not get added or lit. The one narrow exception: small, non-fixed garden/landscape lights (e.g. solar stake lights or small spike lights along a garden bed or path) may be added tastefully and sparingly even if not clearly visible in the daytime shot, since these are common, low-impact, easily-removable accessories — this exception does NOT extend to anything fixed to the building itself. Keep the house, landscaping, and camera angle exactly the same. To be clear, the restraint above is about not INVENTING new exterior fixture locations — it is not an instruction to dim things down: windows and any real fixtures that are there should still be lit brightly and confidently enough to produce a proper premium twilight look, with a natural, balanced glow between the sky and the lit building. If a pool is visible, illuminate the pool water a natural light blue. Push the overall grade toward a premium, editorial real estate campaign look, not a plain snapshot with the sky swapped: a richer, fuller sky gradient (still the same colours and cloud pattern from the reference image, just with more depth and richness rather than looking pale or washed out), a warm glow/bloom immediately around each lit window and fixture that bounces gently onto nearby surfaces the way real light does, deeper and more cinematic contrast between the warm lit elements and the cool dusk ambience, and true, rich colour in the building's real materials (brick, render, timber, roofing) and the landscaping — nothing should look flat, pale or washed out. Cinematic, high-end real estate twilight look — photorealistic, no stylisation.

MARKED SUBJECT PROPERTY (only applies if the photo has one): some drone/aerial shots mark a specific house or apartment as the subject with a pin, circle, arrow, highlighted outline or border, because several other houses or apartments are also visible in the same frame (a street, block, or apartment building). First check the photo for a marker like that.
- If there is NO marker/pin/circle/arrow/border anywhere in the photo: ignore this whole section and just light up the property normally, as described above.
- If there IS a marker: that marker is your guide for exactly which property is the subject — do not guess, use whichever property it's pointing at/around. Leave the marker itself completely untouched — do not remove, move, resize, redraw or restyle it in any way; it must appear in the output exactly as it does in the original photo, in the same position. Using that marker as your guide, follow this instead of lighting every building the same way:
  - Fully light the marked property as described above — every window lit with a warm confident glow, plus every one of its own real exterior fixtures switched on, following the same no-fabrication rule above (only exterior fixtures actually visible get switched on).
  - Leave the properties immediately next to it — directly beside, above, or below the marked one — unlit, so nothing competes with it for attention.
  - Buildings or houses further out may show a natural, realistic scatter of a few lit windows — not all of them, just some, the way a real street or building actually looks at dusk. For an apartment building, that means some scattered lit windows roughly five to six floors above or below the marked unit. For a street of houses, that means a few lit houses roughly five to ten houses along, or over on the next block.
  - If a city skyline or background is visible beyond the subject, light it normally as part of a natural dusk backdrop.
  - Even where a neighbouring building or house is deliberately left unlit, it must still read as a real photograph taken at dusk — soft ambient twilight light, reflections, and natural tonal variation, never a flat black cutout or silhouette.

ABSOLUTELY DO NOT (this is a legal requirement): add any EXTERIOR-MOUNTED light fixture, lamp, downlight, wall sconce, uplight, string light or illuminated feature that is not physically present in the original photograph (this restriction does NOT apply to windows — every window should be lit warmly as described above, that's expected) — this specifically includes the two most common mistakes to avoid: inventing new downlights/spotlights under eaves that don't actually exist there, and inventing new wall-mounted lights/sconces spaced along walls that aren't in the original photo; do not wash whole sections of wall in light or make the building look like it has more exterior fixtures than it actually does; leave every window dark or dim — that is just as wrong as inventing fake fixtures and makes the result look weak and unfinished; add, remove, duplicate or move any furniture, landscaping, vehicle, person or object; change the camera angle, framing, composition, zoom or perspective; change the building's structure, walls, windows, doors, roofline, or any permanent feature; alter neighbouring buildings, fences, power lines or structures; light up the properties immediately next to a marked subject property in a way that competes with it for attention; remove, move, resize, redraw or restyle any marker, pin, circle, arrow or border identifying the subject property. Preserve the property's true architecture, layout and every permanent feature EXACTLY as photographed — only the sky, all windows (lit warmly), the exterior lighting from EXISTING fixtures, and (optionally) a few small non-fixed garden lights may change.

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
 * Twilight, "Night city" scene — converts a daytime balcony/rooftop/
 * high-rise view of a city skyline into a full night cityscape. Distinct
 * from TWILIGHT_EXTERIOR_PROMPT: that one lights up ONE subject building's
 * existing fixtures against a dusk sky reference image; this one has to
 * light up EVERY building across a whole skyline and go fully dark, with no
 * reference image at all (there's no single "night city" photo to send —
 * it's described in words, same reasoning as the interior prompts above).
 * Explicit emphasis on preserving building shapes/layout and any signage,
 * per the app owner's requirement.
 */
export const TWILIGHT_NIGHT_CITYSCAPE_PROMPT = `You are professionally converting a daytime real estate photograph — typically a balcony, rooftop terrace, or high-rise view looking out over a city skyline — into a realistic night-time cityscape, as if the same view were photographed well after dark.

DO: Darken the sky to a realistic night sky — deep navy/black, with a soft natural glow near the horizon where city light bounces off the atmosphere, exactly like a real city at night. Light up the skyline: give the buildings across the view a natural scatter of illuminated windows (not every window lit — a realistic, varied mix, like real offices/apartments at night), and turn on any street lighting, and illuminate any signage on buildings using the EXACT SAME text/logo already visible in the daytime photo. If a pool, balcony floor, railing or foreground furniture is in frame, light it naturally for night-time — illuminate a pool a natural light blue if present. Keep the camera angle, framing, composition and the entire skyline's layout exactly the same as the original.

BUILDINGS, LAYOUT AND TEXT MUST STAY EXACTLY THE SAME — THIS IS THE MOST IMPORTANT RULE, NOT OPTIONAL: every building's shape, height, position, rooftop features and window grid must be identical to the daytime original — this is a lighting/time-of-day change only, never a redesign. Any signage, lettering, logos or branding visible on any building must be preserved EXACTLY as photographed — do not regenerate, reinterpret, misspell, blur, or invent new signage or text anywhere in the frame. Do not add, remove, resize, or relocate any building.

ABSOLUTELY DO NOT (this is a legal requirement): add, remove, move or resize any building or structure in the skyline; change the property's own architecture, balcony, railing, or any permanent feature; alter, invent, misspell, or remove any signage, lettering, logo or branding visible on any building; change the camera angle, framing, composition or perspective; add fireworks, aircraft, searchlights, or other dramatic elements that wouldn't realistically be there; over-light the scene into something that looks like a video game or fantasy skyline. Preserve the true skyline and every permanent structure EXACTLY as photographed, from the same viewpoint — only the lighting and time of day may change.

Keep it fully photorealistic and believable — no over-processing, no HDR halos, no warped/melted buildings, no fake gloss, no invented skyline elements.`;

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
 * Appended to EVERY job that uses the OpenAI (ChatGPT) provider, regardless
 * of tab. gpt-image-2 tends to regenerate large areas of an edit rather than
 * touching them surgically, and visibly loses fine high-frequency detail —
 * distant buildings/skylines, small windows, foliage, architectural
 * trim — when it does. Nano Banana (FAL) doesn't show this behaviour, which
 * is why this is OpenAI-only. This is the fix for a recurring complaint:
 * ChatGPT-provider results (especially busy aerial/skyline shots run through
 * the unguarded Prompt tab) coming back softer/blurrier than the original.
 */
export const OPENAI_DETAIL_PRESERVATION_INSTRUCTION = `Preserve fine detail everywhere in the frame, especially in busy or complex areas — distant buildings, skylines, foliage, roofing, brickwork, and architectural trim. Do not blur, soften, smooth over, simplify, or regenerate these areas at lower fidelity than the rest of the image. Match the sharpness and level of detail of the original photograph as closely as possible: the result should never look softer, blurrier, or less detailed than the input — only cleaner and better lit, never lower resolution or less crisp.`;

/**
 * Appended alongside OPENAI_DETAIL_PRESERVATION_INSTRUCTION for every OpenAI
 * job. That instruction alone wasn't enough on heavily-landscaped exterior
 * shots: brick, roofing and hard architecture came out crisp, but conifers,
 * palms and flowering trees (e.g. wattle) were still coming back as soft,
 * painterly blobs with no individual needle/frond/blossom structure —
 * gpt-image-2 visibly regenerates dense organic texture at lower fidelity
 * even when told generically not to blur. This names the failure mode
 * directly instead of relying on the generic instruction to cover it.
 */
export const OPENAI_FOLIAGE_DETAIL_INSTRUCTION = `Pay special attention to trees, shrubs, hedges and other foliage in the frame. Render individual leaves, needles, fronds and blossom clusters with real, distinct texture — matching what's visible in the original photo — instead of collapsing them into smooth, painterly, or blobby masses of colour. Conifers and weeping/pendulous trees should keep their individual hanging needle clusters, palms should keep distinct separate fronds, and flowering trees (e.g. wattle, jacaranda) should keep individual blossom texture rather than becoming a flat blob of colour. This matters just as much as the hard-surface detail (brick, roofing, trim) already called out above — foliage should never look softer or less detailed than the rest of the image.`;

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
  style?: TwilightStyle,
  intensity?: DeclutterIntensity,
  enhanceType?: EnhanceType,
  scene?: TwilightScene
): string {
  let base: string;
  if (tab === "general") {
    // "Prompt" tab: the user's own text IS the whole prompt — no template,
    // no DO-NOT guardrails, no legal-safety scaffolding. That's the deal:
    // full control, so full responsibility for what it does to the photo.
    base = (customPrompt ?? "").trim();
  } else if (tab === "twilight") {
    if (scene === "night_city") {
      base = TWILIGHT_NIGHT_CITYSCAPE_PROMPT;
    } else if (mode === "exterior") {
      base = TWILIGHT_EXTERIOR_PROMPT;
    } else {
      const template = style === "golden" ? TWILIGHT_INTERIOR_GOLDEN_PROMPT : TWILIGHT_INTERIOR_PROMPT;
      base = template.replace("{{SKY_DESCRIPTION}}", TWILIGHT_SKY_DESCRIPTIONS[sky ?? "orange"]);
    }
  } else if (tab === "enhance") {
    base =
      enhanceType === "night"
        ? ENHANCE_NIGHT_PROMPT
        : mode === "exterior"
          ? ENHANCE_EXTERIOR_PROMPT
          : ENHANCE_INTERIOR_PROMPT;
  } else if (tab === "restage") {
    base = mode === "exterior" ? RESTAGE_EXTERIOR_PROMPT : RESTAGE_INTERIOR_PROMPT;
  } else if (intensity === "light") {
    base = mode === "exterior" ? DECLUTTER_LIGHT_EXTERIOR_PROMPT : DECLUTTER_LIGHT_INTERIOR_PROMPT;
  } else {
    base = mode === "exterior" ? EXTERIOR_PROMPT : INTERIOR_PROMPT;
  }

  if (tab === "enhance" && enhanceType !== "night" && mode === "exterior" && provider === "openai") {
    base = base + "\n\n" + OPENAI_EXTERIOR_TEXTURE_INSTRUCTION;
  }

  // Every OpenAI-provider job, on every tab (Declutter/Enhance/Prompt), gets
  // this — the softening behaviour it's fixing isn't specific to any one tab.
  if (provider === "openai") {
    base = base + "\n\n" + OPENAI_DETAIL_PRESERVATION_INSTRUCTION;
    base = base + "\n\n" + OPENAI_FOLIAGE_DETAIL_INSTRUCTION;
  }

  if (tab === "restage" && matchReference) {
    base = base + "\n\n" + MATCH_CONSISTENCY_ADDENDUM;
  }

  // Every job's output canvas must match the input photo's own aspect ratio
  // by default — this is enforced technically too (see nearestFalAspectRatio
  // in fal.ts, which sets FAL's aspect_ratio parameter explicitly instead of
  // leaving it on "auto"), but the instruction is repeated here as a second
  // layer since the model can still crop/pad within a canvas. The Prompt tab
  // gets this appended too so it stays the default, but a custom prompt or
  // note asking for a specific crop/ratio should still win.
  base =
    base +
    "\n\nPreserve the exact original aspect ratio and framing of the input photograph — do not crop, stretch, squeeze, letterbox, pad, or otherwise change the image's proportions, unless explicitly instructed otherwise above.";

  const trimmed = note?.trim();
  if (!trimmed) return base;
  return (
    base +
    "\n\nAdditional instruction from the user (obey it, but still respect ALL the DO-NOT rules above): " +
    trimmed
  );
}
