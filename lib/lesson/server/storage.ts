import { del, get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { LessonError } from "./errors";

function logStorageFailure(operation: string, error: unknown) {
  let message = error instanceof Error ? error.message : undefined;
  for (const secret of [
    process.env.BLOB_READ_WRITE_TOKEN,
    process.env.VERCEL_OIDC_TOKEN,
  ]) {
    if (secret && message) message = message.replaceAll(secret, "[redacted]");
  }
  const cause = error instanceof Error ? error.cause : undefined;
  const causeCode = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  console.error("[lesson-audio] Blob request failed", {
    operation,
    errorType: error instanceof Error ? error.constructor.name : "UnknownError",
    message,
    causeCode: typeof causeCode === "string" && /^[A-Z][A-Z0-9_]{1,50}$/.test(causeCode) ? causeCode : undefined,
    authentication: process.env.BLOB_READ_WRITE_TOKEN
      ? "read-write-token"
      : "oidc",
    storeIdConfigured: Boolean(process.env.BLOB_STORE_ID),
  });
}

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
  try {
    const blob = await put(
      `lessons/${lessonId}/${step}-${randomUUID()}.pcm`,
      audio,
      {
        access: "private",
        contentType: "application/octet-stream",
        addRandomSuffix: false,
        // Explicit credentials take precedence over Vercel's automatic OIDC selection.
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
    return blob.pathname;
  } catch (error) {
    logStorageFailure("upload", error);
    throw new LessonError(
      "Narration could not be saved to storage. Please try again.",
      502,
    );
  }
}

export async function readNarration(path: string) {
  requireAudioStorage();
  try {
    const result = await get(path, {
      access: "private",
      useCache: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200)
      throw new LessonError(
        "Saved narration could not be found. Please try again later.",
        502,
      );
    return result.stream;
  } catch (error) {
    if (error instanceof LessonError) throw error;
    logStorageFailure("read", error);
    throw new LessonError(
      "Saved narration could not be loaded from storage. Please try again.",
      502,
    );
  }
}

export async function removeUncommittedNarration(path: string) {
  try {
    await del(path, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    logStorageFailure("cleanup", error);
  }
}
