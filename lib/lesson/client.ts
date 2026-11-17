export async function lessonRequest(path: string, init: RequestInit = {}) {
  const started = Date.now();
  while (true) {
    const response = await fetch(path, { ...init, cache: "no-store" });
    if (response.ok) return response;
    if (
      response.status === 409 &&
      response.headers.has("Retry-After") &&
      Date.now() - started < 180000
    ) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
          init.signal?.removeEventListener("abort", abort);
          resolve();
        }, 2000);
        if (init.signal?.aborted) abort();
        else init.signal?.addEventListener("abort", abort, { once: true });
      });
      continue;
    }
    const result = await response.json().catch(() => null);
    throw new Error(
      result?.error ||
        (response.status === 401
          ? "Your session expired. Please sign in again."
          : "The request failed. Please try again."),
    );
  }
}
export function postLessonRequest(
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  return lessonRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function fetchSavedNarration(
  lessonId: string,
  step: number,
  signal?: AbortSignal,
) {
  const response = await lessonRequest(
    `/api/lessons/${lessonId}/narration/${step}`,
    { signal },
  );
  const chunk = await response.arrayBuffer();
  if (!chunk.byteLength || chunk.byteLength % 2 !== 0)
    throw new Error(
      "A saved narration segment was invalid. Please retry loading it.",
    );
  return chunk;
}
