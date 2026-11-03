/**
 * Video relight: the lighting "looks" a clip can be pushed to.
 *
 * Natural looks aim for a clean, believable result (an overcast pool clip
 * becomes a perfect sunny day). Cinematic looks push to premium hero-shot
 * lighting from a normal clip. Each look carries:
 *  - frame:  prompt for the Nano Banana edit of the clip's first frame
 *  - video:  the lighting phrase used by the video engines
 *  - sphere: the light spec used to render the lighting sphere MiniMax wants
 */

export type LookGroup = "natural" | "cinematic";

export interface SphereSpec {
  /** Direction the light comes FROM: x right, y up, z toward the camera. */
  dir: [number, number, number];
  /** Key light colour 0-255. */
  key: [number, number, number];
  /** Ambient / fill colour 0-255. */
  ambient: [number, number, number];
  /** 0 = hard shadow edge, 1 = very soft. */
  softness: number;
}

export interface Look {
  id: string;
  label: string;
  group: LookGroup;
  night: boolean;
  blurb: string;
  video: string;
  sphere: SphereSpec;
}

export interface Scene {
  id: string;
  label: string;
  blurb: string;
  /** Extra direction for the prompts; empty for auto. */
  note: string;
}

export const SCENES: Scene[] = [
  { id: "auto", label: "Auto", blurb: "Let the model judge", note: "" },
  {
    id: "outdoor",
    label: "Outdoor",
    blurb: "Exterior, garden, facade",
    note: "This is an outdoor / exterior scene. Prioritise the sky, the sun or moon direction, and how the light falls on the building, landscaping and lawn. Keep lawn and plants natural.",
  },
  {
    id: "indoor",
    label: "Indoor",
    blurb: "Rooms, interiors",
    note: "This is an indoor scene. Light the room as that time of day would: change the daylight coming through windows and doors and the colour of the light on walls, floors and furniture, and switch interior lamps on or off to suit. Keep the room's layout and finishes exactly the same, and keep any view through windows believable.",
  },
  {
    id: "pool",
    label: "Pool",
    blurb: "Pool and water",
    note: "This scene features a swimming pool. Pay special attention to the water: colour, clarity, sparkle and reflections should match the lighting, and underwater pool lights should glow when it is dusk or night. Keep the pool shape, tiles and surrounds unchanged.",
  },
  {
    id: "view",
    label: "View / balcony",
    blurb: "Skyline, ocean, horizon",
    note: "This scene is built around a view (balcony, skyline, ocean or horizon). Treat the sky and the distant view as the hero: relight the horizon, clouds, water and distant buildings so they match, and let the light wrap naturally onto the foreground balcony, glass and furniture.",
  },
];

export function getScene(id?: string): Scene {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

const sceneLine = (scene?: Scene) => (scene && scene.note ? ` ${scene.note}` : "");

export const LOOKS: Look[] = [
  {
    id: "sunny",
    label: "Sunny",
    group: "natural",
    night: false,
    blurb: "Perfect clear day, blue sky",
    video:
      "a perfect clear sunny day: bright clean blue sky with at most a few soft white clouds, the sun high and slightly behind the camera, crisp natural daylight, natural vibrant colour, clear sparkling turquoise water if there is any, no storm clouds, no haze, no orange cast",
    sphere: { dir: [0.25, 0.8, 0.55], key: [255, 247, 232], ambient: [120, 150, 200], softness: 0.35 },
  },
  {
    id: "twilight",
    label: "Twilight",
    group: "natural",
    night: false,
    blurb: "Just after sunset, lights on",
    video:
      "twilight just after sunset: a deep blue sky with a soft warm glow at the horizon, dim blue ambient light, every interior and exterior light switched on and glowing warm, windows glowing warm, pool lights on and the water glowing if there is a pool",
    sphere: { dir: [0.1, 0.35, 0.9], key: [255, 190, 130], ambient: [40, 60, 120], softness: 0.6 },
  },
  {
    id: "night",
    label: "Night",
    group: "natural",
    night: true,
    blurb: "Night, lights on, clearly visible",
    video:
      "night time: a dark navy sky with a few faint stars, every interior and exterior light switched on and glowing warm, windows warm lit, pool lights on if there is a pool, exposed like a professional night real-estate photograph so the property stays clearly visible",
    sphere: { dir: [0.0, 0.2, 1.0], key: [255, 200, 140], ambient: [15, 22, 50], softness: 0.7 },
  },
  {
    id: "sunrise",
    label: "Hero sunrise",
    group: "cinematic",
    night: false,
    blurb: "Low golden-pink sun, haze, rim light",
    video:
      "a cinematic hero sunrise: the sun low on the horizon casting warm golden-pink light, long soft shadows, glowing atmospheric haze, warm rim light on edges and water, a sky that grades from soft peach at the horizon to clear blue above, rich but natural colour, premium luxury real-estate film look",
    sphere: { dir: [0.85, 0.2, 0.45], key: [255, 190, 120], ambient: [90, 110, 170], softness: 0.3 },
  },
  {
    id: "golden",
    label: "Golden hour",
    group: "cinematic",
    night: false,
    blurb: "Rich low sun, warm light, cool shadows",
    video:
      "cinematic golden hour: low warm sun raking across every surface, rich golden highlights against cool soft shadows, glowing warm sky, strong depth and contrast, glittering reflections on water, premium luxury real-estate film look",
    sphere: { dir: [-0.8, 0.25, 0.5], key: [255, 175, 95], ambient: [85, 105, 165], softness: 0.25 },
  },
  {
    id: "blue_hour",
    label: "Dramatic twilight",
    group: "cinematic",
    night: false,
    blurb: "Deep blue sky, fiery horizon, glowing windows",
    video:
      "dramatic cinematic blue hour: a deep saturated blue sky with a fiery orange glow on the horizon, strong contrast between cool ambient light and warm glowing windows and lights, glossy reflections on water and glass, premium luxury real-estate film look",
    sphere: { dir: [0.0, 0.15, 1.0], key: [255, 160, 90], ambient: [30, 55, 140], softness: 0.45 },
  },
  {
    id: "moonlit",
    label: "Moonlit night",
    group: "cinematic",
    night: true,
    blurb: "Moon-washed night, warm lit windows",
    video:
      "a cinematic moonlit night: a deep blue-black sky with a bright moon, soft blue moonlight across the scene, warm glowing windows and lights, shimmering reflections on water, premium luxury real-estate film look",
    sphere: { dir: [-0.4, 0.8, 0.45], key: [170, 195, 255], ambient: [18, 28, 70], softness: 0.4 },
  },
];

export function getLook(id: string): Look | undefined {
  return LOOKS.find((l) => l.id === id);
}

/** Prompt for the Nano Banana relight of the clip's first frame. */
export function framePrompt(look: Look, scene?: Scene): string {
  const strength =
    look.group === "cinematic"
      ? "Push the lighting to a dramatic, high-end, cinematic standard."
      : "Keep the result natural, clean and believable, the way a skilled photographer would shoot it in this light.";
  return `Use the supplied video frame as the exact base image. Keep the architecture, every object, the camera angle, perspective, framing, crop, image dimensions and aspect ratio exactly the same. Do not add, remove, move, recolour or redesign anything. This is a lighting and sky change only.

Relight the whole scene as ${look.video}. ${strength}${sceneLine(scene)} Make the sky, the direction and colour of the light, the shadows, the reflections and the glow of lights all agree with this lighting, on every surface. Keep fine detail, text and textures sharp. No people or objects that are not already in the frame. Photorealistic.`;
}

/** Prompt for Seedance's video edit. @Video1 is the clip, @Image1 the relit first frame. */
export function seedancePrompt(look: Look, scene?: Scene): string {
  return `Strictly edit @Video1. Keep every object, the architecture, the camera movement, framing, composition and all motion exactly as in @Video1. Change ONLY the lighting, sky and time of day to ${look.video}.${sceneLine(scene)} Use @Image1 as the exact look of the opening frame and keep that same lighting consistent for the whole clip with no flicker. Photorealistic, stable architecture, no new objects, no added people.`;
}

/** Short prompt for engines that take a relit first frame (ID-V2V). */
export function relightPrompt(look: Look, scene?: Scene): string {
  return `${look.video}.${sceneLine(scene)} Photorealistic, the same lighting held steady throughout the clip, stable architecture, no flicker.`;
}

/** Draw the lighting sphere MiniMax reads the light from. Browser only. */
export function renderSphere(look: Look, size = 512): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const img = ctx.createImageData(size, size);
  const { dir, key, ambient, softness } = look.sphere;
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const L: [number, number, number] = [dir[0] / len, dir[1] / len, dir[2] / len];
  const R = size * 0.4;
  const c = size / 2;
  const albedo = 0.72;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x - c) / R, dy = (c - y) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) {
        img.data[i] = 24; img.data[i + 1] = 24; img.data[i + 2] = 24; img.data[i + 3] = 255;
        continue;
      }
      const n: [number, number, number] = [dx, dy, Math.sqrt(1 - d2)];
      const ndl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
      // wrap lighting: higher softness lets light bleed past the terminator
      const wrap = softness * 0.6;
      const diff = Math.max(0, (ndl + wrap) / (1 + wrap));
      const shaped = Math.pow(diff, 1 + (1 - softness) * 0.8);
      for (let ch = 0; ch < 3; ch++) {
        const v = albedo * (ambient[ch] * 0.55 + key[ch] * shaped);
        img.data[i + ch] = Math.max(0, Math.min(255, v));
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
