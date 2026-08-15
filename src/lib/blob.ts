/**
 * Vercel Blob storage — used ONLY to give the admin Usage log something to
 * link to for OpenAI-provider jobs. FAL jobs already return a hosted result
 * URL we can link to directly (see fal.ts), but OpenAI's images endpoint
 * returns raw image bytes (a data URI) with nothing hosted anywhere — so
 * without this, there'd be no way to ever look at a past ChatGPT result
 * again once the browser tab closes.
 *
 * Needs the BLOB_READ_WRITE_TOKEN env var, which Vercel sets automatically
 * once a Blob store is created and connected to the project (Storage tab).
 * Until then, uploadUsageImage() just returns null — never throws, since
 * this is a nice-to-have for the admin log, not something that should ever
 * block or fail actual photo processing.
 */
import { put } from "@vercel/blob";

/**
 * Upload a data URI (e.g. an OpenAI result, "data:image/png;base64,...") to
 * Vercel Blob and return its public URL, or null if storage isn't
 * configured or the upload fails for any reason.
 */
export async function uploadUsageImage(dataUri: string, keyHint: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const match = /^data:(.+?);base64,(.*)$/.exec(dataUri);
    if (!match) return null;
    const mime = match[1];
    const ext = mime.split("/")[1]?.split("+")[0] || "png";
    const buf = Buffer.from(match[2], "base64");
    const blob = await put(`usage/${keyHint}.${ext}`, buf, {
      access: "public",
      contentType: mime,
      addRandomSuffix: true,
    });
    return blob.url;
  } catch (err) {
    console.error("uploadUsageImage failed (non-fatal):", err);
    return null;
  }
}
