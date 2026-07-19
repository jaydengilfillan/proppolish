import type { Mode } from "./prompts";

export type JobStatus = "queued" | "processing" | "done" | "error";

export interface Job {
  id: string;
  fileName: string;
  mode: Mode;
  status: JobStatus;
  /** Object URL of the ORIGINAL upload — used for the "before" view + download-original. */
  originalUrl: string;
  /** Downscaled JPEG data URI actually sent to the server. */
  downscaledDataUri: string;
  /** FAL output image URL once processing succeeds. */
  resultUrl?: string;
  /** Readable error message when status === "error". */
  error?: string;
}
