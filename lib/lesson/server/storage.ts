import { del, get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { LessonError } from "./errors";

export function requireAudioStorage() {
  if (
    !process.env.BLOB_READ_WRITE_TOKEN &&
    !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
  )
    throw new LessonError(
      "Configure a private Vercel Blob store and set BLOB_READ_WRITE_TOKEN to save narration.",
      503,
    );
}

export async function storeNarration(
  lessonId: string,
  step: number,
  audio: ArrayBuffer,
) {
  requireAudioStorage();
  const blob = await put(
    `lessons/${lessonId}/${step}-${randomUUID()}.pcm`,
    audio,
    {
      access: "private",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
    },
  );
  return blob.pathname;
}

export async function readNarration(path: string) {
  requireAudioStorage();
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200)
    throw new LessonError(
      "Saved narration could not be found. Please try again later.",
      502,
    );
  return result.stream;
}

export async function removeUncommittedNarration(path: string) {
  try {
    await del(path);
  } catch {
    console.error("Could not clean up an uncommitted narration upload.");
  }
}
