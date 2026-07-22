import type { Mode, Tab, TwilightSky } from "./prompts";
import type { Provider } from "./config";

export type JobStatus = "queued" | "processing" | "done" | "error";

export interface Job {
    id: string;
    fileName: string;
    mode: Mode;
    /** Which top-level tab this job was created under. */
  tab: Tab;
    /** Which model to use — only meaningful when tab === "enhance" or "general". */
  provider?: Provider;
    /** Which sky reference to composite against — only meaningful when tab === "twilight". */
  sky?: TwilightSky;
    /** The user's own free-text prompt — only meaningful (and required) when tab === "general". */
  customPrompt?: string;
    status: JobStatus;
    /** Object URL of the ORIGINAL upload — used for the "before" view + download-original. */
  originalUrl: string;
    /** Downscaled JPEG data URI actually sent to the server. */
  downscaledDataUri: string;
    /** Original (pre-downscale) pixel dimensions — used by the OpenAI provider to pick an output size. */
  width?: number;
    height?: number;
    /** FAL/OpenAI output image URL (or data URI) once processing succeeds. */
  resultUrl?: string;
    /** Readable error message when status === "error". */
  error?: string;
}
