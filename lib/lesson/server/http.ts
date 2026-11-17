import { APICallError } from "ai";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { LessonError } from "./errors";
export { LessonError } from "./errors";

export async function requireLearner(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new LessonError("This request is not allowed.", 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new LessonError("Please sign in to continue.", 401);
  return session.user.id;
}

export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new LessonError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new LessonError("The request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw new LessonError("This request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new LessonError("The request contains invalid JSON.");
  }
}

export function lessonErrorResponse(error: unknown) {
  let status = 500;
  let message = "Something went wrong. Please try again.";
  if (error instanceof LessonError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    message = error.issues[0]?.message ?? "Invalid request.";
  } else if (error instanceof Error && error.name === "TimeoutError") {
    status = 504;
    message = "The AI service took too long to respond. Please retry.";
  } else if (APICallError.isInstance(error)) {
    status = error.statusCode === 429 ? 429 : 502;
    message =
      error.statusCode === 429
        ? "The AI service is busy or its quota has been reached. Please try again later."
        : "The AI service couldn’t complete this request. Please try again.";
    console.error("AI provider request failed", {
      status: error.statusCode,
      retryable: error.isRetryable,
      requestId: error.responseHeaders?.["x-request-id"],
    });
  } else if (error instanceof Error && error.name === "AbortError") {
    status = 408;
    message = "The request was cancelled. Please retry.";
  } else {
    console.error("Tutor request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(error instanceof LessonError && error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : {}),
      },
    },
  );
}
