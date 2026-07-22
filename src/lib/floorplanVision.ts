/**
 * Server-side OpenAI vision client for Floor Plan's "Import from scan"
 * feature. Reads OPENAI_API_KEY from the environment; never sent to the
 * browser. Must only be imported from server code (an API route).
 *
 * This is a TEXT+VISION model (chat completions), not gpt-image-2 (which
 * only edits/generates images) -- it reads a CubiCasa export and transcribes
 * what's printed on it, plus proposes a rough starting layout. The contract
 * with the rest of the app: transcribed text (room labels, dimension
 * strings, area summaries) is treated as a best-effort OCR read that the
 * user must eyeball against the original scan before exporting -- the Floor
 * Plan editor keeps every imported shape fully editable for exactly that
 * reason. Coordinates are a rough draft for placement, nothing more.
 */
import { OPENAI_VISION_MODEL } from "./config";

export class FloorplanVisionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FloorplanVisionError";
    this.status = status;
  }
}

export interface VisionRoom {
  label: string;
  dimensionText: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionFloor {
  name: string;
  rooms: VisionRoom[];
}

export interface VisionPoint {
  x: number;
  y: number;
}

export interface FloorplanAnalysis {
  floors: VisionFloor[];
  lotBoundary: VisionPoint[];
  driveway: VisionPoint[];
  totalAreaText: string;
  areaBreakdownText: string;
  excludedAreasText: string;
  notes: string;
}

const ROOM_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    dimensionText: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
  required: ["label", "dimensionText", "x", "y", "width", "height"],
  additionalProperties: false,
} as const;

const POINT_SCHEMA = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
  additionalProperties: false,
} as const;

const FLOORPLAN_SCHEMA = {
  type: "object",
  properties: {
    floors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          rooms: { type: "array", items: ROOM_SCHEMA },
        },
        required: ["name", "rooms"],
        additionalProperties: false,
      },
    },
    lotBoundary: { type: "array", items: POINT_SCHEMA },
    driveway: { type: "array", items: POINT_SCHEMA },
    totalAreaText: { type: "string" },
    areaBreakdownText: { type: "string" },
    excludedAreasText: { type: "string" },
    notes: { type: "string" },
  },
  required: [
    "floors",
    "lotBoundary",
    "driveway",
    "totalAreaText",
    "areaBreakdownText",
    "excludedAreasText",
    "notes",
  ],
  additionalProperties: false,
} as const;

const PROMPT = `You are analysing a CubiCasa floor plan export for a real estate tool. A second image (an aerial/drone photo of the same property) may also be provided.

TRANSCRIBE, do not calculate or guess: read every room label and its printed dimension text exactly as shown (e.g. "2.81 m x 6.00 m"), character for character. If a floor plan shows multiple storeys (e.g. "1st floor" / "2nd floor" labels), group rooms under their correct floor, in reading order.

Also transcribe, verbatim, any summary text printed at the bottom of the plan: the overall total area into totalAreaText, any per-floor breakdown into areaBreakdownText, and any excluded-areas breakdown (patio, porch, garage, walls, etc.) into excludedAreasText. Leave a field as an empty string if that text isn't present.

Then propose a ROUGH starting layout -- this is only a draft a human will drag into its correct final position by hand, so approximate is fine. For each floor independently, place its rooms inside a 0,0 (top-left) to 1000,1000 (bottom-right) coordinate box: x/y is the room's top-left corner, width/height are its size in that same box, sized roughly proportional to the room's real dimensions (a room labelled "2.81 m x 6.00 m" should be roughly a 2.81:6.00 ratio box) and positioned to roughly match the room's real position and neighbours in the source image, without overlapping other rooms on the same floor.

If a drone/aerial photo was provided, also propose a rough lot boundary polygon (3-8 points) and a rough driveway polygon (3-8 points), in that same 0-1000 box, corresponding to the ground floor. If no drone photo was provided, leave lotBoundary and driveway as empty arrays.

Put any other useful observations (e.g. which direction the drone photo suggests the front of the block faces) in notes.`;

export interface AnalyzeParams {
  scanImageDataUri: string;
  droneImageDataUri?: string;
}

export async function analyzeFloorplanScan(params: AnalyzeParams): Promise<FloorplanAnalysis> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new FloorplanVisionError(
      500,
      "OPENAI_API_KEY is not set on the server. Add it to .env.local (local) or your Vercel project env vars."
    );
  }

  const content: unknown[] = [
    { type: "text", text: PROMPT },
    { type: "image_url", image_url: { url: params.scanImageDataUri } },
  ];
  if (params.droneImageDataUri) {
    content.push({ type: "image_url", image_url: { url: params.droneImageDataUri } });
  }

  const body = {
    model: OPENAI_VISION_MODEL,
    messages: [{ role: "user", content }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "floorplan_analysis", strict: true, schema: FLOORPLAN_SCHEMA },
    },
  };

  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new FloorplanVisionError(502, `Could not reach OpenAI: ${detail}`);
  }

  const text = await resp.text();

  if (!resp.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || text;
    } catch {
      /* keep raw text */
    }
    throw new FloorplanVisionError(resp.status, message || `OpenAI returned HTTP ${resp.status}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FloorplanVisionError(502, "OpenAI returned a non-JSON response.");
  }

  const raw = extractMessageContent(json);
  if (!raw) {
    throw new FloorplanVisionError(502, "OpenAI response did not contain any content.");
  }

  let parsed: FloorplanAnalysis;
  try {
    parsed = JSON.parse(raw) as FloorplanAnalysis;
  } catch {
    throw new FloorplanVisionError(502, "OpenAI's structured response could not be parsed as JSON.");
  }

  return parsed;
}

function extractMessageContent(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const contentVal = (message as { content?: unknown }).content;
  return typeof contentVal === "string" ? contentVal : null;
}
