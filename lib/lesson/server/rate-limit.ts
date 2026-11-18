import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { LessonError } from "./errors";

export const lessonRateLimits = {
  create: { requests: 10, label: "lesson creation" },
  plan: { requests: 5, label: "lesson generation" },
  narration: { requests: 90, label: "narration generation" },
  question: { requests: 20, label: "tutor answers" },
} as const;

type Action = keyof typeof lessonRateLimits;
let redis: Redis | undefined;
const limiters: Partial<Record<Action, Ratelimit>> = {};

function getLimiter(action: Action) {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    throw new LessonError(
      "Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable lesson generation.",
      503,
    );

  redis ??= Redis.fromEnv({
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(2500),
    enableAutoPipelining: false,
  });
  return (limiters[action] ??= new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(lessonRateLimits[action].requests, "10 m"),
    prefix: `chalk:ratelimit:${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development"}:${action}`,
    analytics: false,
    ephemeralCache: false,
    timeout: 2000,
  }));
}

export async function requireLessonRateLimit(owner: string, action: Action) {
  try {
    const result = await getLimiter(action).limit(owner);
    await result.pending;
    // Upstash allows requests on timeout by default; paid AI calls must stay blocked.
    if (result.reason === "timeout") {
      console.error("[rate-limit] Upstash request timed out", { action });
      throw new LessonError(
        "Rate limiting is temporarily unavailable. Please try again shortly.",
        503,
      );
    }
    if (!result.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000),
      );
      throw new LessonError(
        `Too many requests for ${lessonRateLimits[action].label}. Please try again in ${retryAfter} seconds.`,
        429,
        retryAfter,
      );
    }
  } catch (error) {
    if (error instanceof LessonError) throw error;
    console.error("[rate-limit] Upstash request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new LessonError(
      "Rate limiting is temporarily unavailable. Please try again shortly.",
      503,
    );
  }
}
