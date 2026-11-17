import { createOpenAI } from "@ai-sdk/openai";
import { LessonError } from "./errors";

export function getAIProvider() {
  if (!process.env.OPENAI_API_KEY)
    throw new LessonError(
      "Set OPENAI_API_KEY on the server to enable the tutor.",
      503,
    );
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

export function getTextModel() {
  return getAIProvider().responses(
    process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
  );
}

// Disable provider-side storage and reserve the generation budget for visible output.
export function textProviderOptions(modelId: string) {
  return {
    openai: {
      store: false,
      ...(modelId.startsWith("gpt-5") ? { reasoningEffort: "none" } : {}),
    },
  };
}
