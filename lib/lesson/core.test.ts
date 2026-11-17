import assert from "node:assert/strict";
import test from "node:test";
import { generateSpeech } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { assembleNarration, formatTime, stepAtTime } from "./audio";
import {
  boardElementStyle,
  canDisplayBoard,
  lessonBoardViewport,
} from "./board";
import {
  lessonPlanSchema,
  topicSchema,
  validateLesson,
  type LessonPlan,
} from "./schema";
import { generateLesson } from "./server/generate-lesson";
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { fetchSavedNarration } from "./client";

test("whiteboard readiness waits for restored elements and the measured embedded viewport", () => {
  const container = { width: 700, height: 400 };
  assert.equal(
    canDisplayBoard({ ...container, isLoading: true }, container, 3),
    false,
  );
  assert.equal(
    canDisplayBoard({ ...container, isLoading: false }, container, 0),
    false,
  );
  assert.equal(
    canDisplayBoard(
      { width: 1440, height: 900, isLoading: false },
      container,
      3,
    ),
    false,
  );
  assert.equal(
    canDisplayBoard(
      { width: 0, height: 0, isLoading: false },
      { width: 0, height: 0 },
      3,
    ),
    false,
  );
  assert.equal(
    canDisplayBoard({ ...container, isLoading: false }, container, 3),
    true,
  );
});

test("reopening saved narration uses read-only requests and reuses the query cache", async (context) => {
  const queries = new QueryClient();
  const samples = new Uint8Array([0, 0, 1, 0, 255, 127]);
  const paths: string[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (path: string, init?: RequestInit) => {
      assert.equal(
        init?.method ?? "GET",
        "GET",
        "saved audio must not invoke generation",
      );
      paths.push(path);
      return new Response(samples);
    },
  );
  try {
    for (let reopen = 0; reopen < 2; reopen++) {
      const chunks = await Promise.all(
        Array.from({ length: 12 }, (_, step) =>
          queries.fetchQuery({
            queryKey: ["lesson-audio", "saved-lesson", step],
            queryFn: ({ signal }) =>
              fetchSavedNarration("saved-lesson", step, signal),
            staleTime: Infinity,
            retry: false,
          }),
        ),
      );
      assert.equal(assembleNarration(chunks).timings.length, 12);
      chunks.forEach((chunk) =>
        assert.deepEqual(new Uint8Array(chunk), samples),
      );
    }
    assert.deepEqual(
      paths,
      Array.from(
        { length: 12 },
        (_, step) => `/api/lessons/saved-lesson/narration/${step}`,
      ),
    );
  } finally {
    queries.clear();
  }
});

test("missing saved audio fails without falling back to paid generation", async (context) => {
  let calls = 0;
  context.mock.method(
    globalThis,
    "fetch",
    async (_path: string, init?: RequestInit) => {
      calls++;
      assert.equal(init?.method ?? "GET", "GET");
      return Response.json(
        { error: "Saved narration is not available for this step." },
        { status: 404 },
      );
    },
  );
  await assert.rejects(
    fetchSavedNarration("saved-lesson", 0),
    /Saved narration is not available/,
  );
  assert.equal(calls, 1);
});

test("workspace copy has no broken UTF-8 punctuation", () => {
  const source = readFileSync(
    "components/workspace/tutor-workspace.tsx",
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:\u00c2[\u0080-\u00bf]|\u00e2\u20ac|\u00ef\u00bf\u00bd|\ufffd)/,
  );
});

function validLesson(): LessonPlan {
  return {
    title: "A test lesson",
    subject: "Science",
    objective: "Understand a simple relationship.",
    takeaway: "Use a diagram to compare the two objects.",
    steps: Array.from({ length: 12 }, (_, index) => ({
      title: `Step ${index + 1}`,
      narration:
        "Look at these two objects and compare how their positions change as we move through this simple visual example together before deciding.",
      scene: [
        {
          id: "object",
          type: "rectangle" as const,
          x: 30,
          y: 50,
          width: 200,
          height: 100,
          text: "Object",
          color: "blue" as const,
        },
        {
          id: "label",
          type: "text" as const,
          x: 260,
          y: 50,
          width: 240,
          height: 50,
          text: "Compare",
          color: "ink" as const,
        },
      ],
    })),
  };
}

function modelResult(
  lesson: LessonPlan | null,
  finish: "stop" | "length" | "content-filter" = "stop",
) {
  return {
    content: lesson
      ? [{ type: "text" as const, text: JSON.stringify(lesson) }]
      : [],
    finishReason: { unified: finish, raw: finish },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
    },
    response: {
      id: "test-response",
      timestamp: new Date(),
      modelId: "test-model",
    },
    warnings: [],
  };
}

test("PCM assembly preserves samples and computes exact beat boundaries", async () => {
  const first = new Uint8Array(48000);
  first.set([0x34, 0x12]);
  const second = new Uint8Array(96000);
  second.set([0x78, 0x56]);
  const result = assembleNarration([first.buffer, second.buffer]);
  assert.equal(result.duration, 3);
  assert.deepEqual(result.timings, [
    { start: 0, end: 1 },
    { start: 1, end: 3 },
  ]);
  const wav = await result.blob.arrayBuffer();
  const bytes = new Uint8Array(wav);
  const view = new DataView(wav);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(40, true), 144000);
  assert.deepEqual([...bytes.slice(44, 46)], [0x34, 0x12]);
  assert.deepEqual([...bytes.slice(48044, 48046)], [0x78, 0x56]);
  assert.equal(stepAtTime(result.timings, 0.999), 0);
  assert.equal(stepAtTime(result.timings, 1), 1);
  assert.equal(stepAtTime(result.timings, 3), 1);
  assert.equal(stepAtTime(result.timings, 0), 0);
  assert.equal(formatTime(125), "2:05");
});

test("audio assembly rejects empty and truncated samples", () => {
  assert.throws(() => assembleNarration([]));
  assert.throws(() => assembleNarration([new ArrayBuffer(0)]));
  assert.throws(() => assembleNarration([new ArrayBuffer(3)]));
});

test("board appearance distinguishes focal shapes, equations and earlier context", () => {
  const shape = validLesson().steps[0].scene[0];
  const focus = boardElementStyle(shape, false);
  assert.notEqual(focus.backgroundColor, "transparent");
  assert.equal(focus.opacity, 100);
  const earlier = boardElementStyle({ ...shape, color: "muted" }, false);
  assert.ok(earlier.opacity < focus.opacity);
  assert.ok(earlier.strokeWidth < focus.strokeWidth);
  const arrow = boardElementStyle({ ...shape, type: "arrow" }, false);
  assert.equal(arrow.backgroundColor, "transparent");
  const label = boardElementStyle(
    { ...shape, type: "text", text: "Velocity" },
    false,
  );
  const equation = boardElementStyle(
    { ...shape, type: "text", text: "F = m × a" },
    false,
  );
  assert.equal(label.backgroundColor, "transparent");
  assert.ok(equation.fontSize > label.fontSize);
  assert.notEqual(
    boardElementStyle(shape, true).strokeColor,
    focus.strokeColor,
  );
});

test("the lesson viewport includes later scenes and backward-pointing arrows", () => {
  const lesson = validLesson();
  lesson.steps[11].scene.push({
    id: "later-arrow",
    type: "arrow",
    x: 900,
    y: 480,
    width: -300,
    height: -180,
    text: "",
    color: "blue",
  });
  const viewport = lessonBoardViewport(lesson);
  for (const element of lesson.steps.flatMap((step) => step.scene)) {
    for (const [x, y] of [
      [element.x, element.y],
      [element.x + element.width, element.y + element.height],
    ]) {
      assert.ok(x > viewport.x && x < viewport.x + viewport.width);
      assert.ok(y > viewport.y && y < viewport.y + viewport.height);
    }
  }
  assert.ok(viewport.width >= 400 && viewport.height >= 260);
  assert.deepEqual(lessonBoardViewport(structuredClone(lesson)), viewport);
});

test("AI SDK structured generation repairs short narration with its rejected draft", async (context) => {
  context.mock.method(console, "info", () => {});
  context.mock.method(console, "warn", () => {});
  const shortLesson = validLesson();
  for (const step of shortLesson.steps)
    step.narration =
      "Look at these objects and compare how their positions change in this example.";
  const model = new MockLanguageModelV4({
    doGenerate: [modelResult(shortLesson), modelResult(validLesson())],
  });
  const lesson = await generateLesson(
    "An example",
    new AbortController().signal,
    model,
  );
  assert.deepEqual(lesson, validLesson());
  assert.equal(model.doGenerateCalls.length, 2);
  const repairPrompt = JSON.stringify(model.doGenerateCalls[1].prompt);
  assert.match(repairPrompt, /156 spoken words/);
  const draftMessage = model.doGenerateCalls[1].prompt.find(
    (message) => message.role === "assistant",
  );
  assert.ok(draftMessage?.role === "assistant");
  const draftText = draftMessage.content.find((part) => part.type === "text");
  assert.ok(draftText?.type === "text");
  assert.deepEqual(JSON.parse(draftText.text), shortLesson);
  assert.throws(() => validateLesson(shortLesson), /must contain 200–340/);
});

test("lesson schema fixes step count without imposing a constrained-decoding word regex", () => {
  const schema = z.toJSONSchema(lessonPlanSchema) as unknown as {
    properties: {
      steps: {
        minItems: number;
        maxItems: number;
        items: { properties: { narration: { pattern?: string } } };
      };
    };
  };
  assert.equal(schema.properties.steps.minItems, 12);
  assert.equal(schema.properties.steps.maxItems, 12);
  assert.equal(
    schema.properties.steps.items.properties.narration.pattern,
    undefined,
  );
  const varied = validLesson();
  varied.steps[0].narration =
    "Compare the two objects and notice how changing their positions helps reveal the relationship between them before we move to the next example.";
  assert.doesNotThrow(() => validateLesson(varied));
});

test("AI SDK validation rejects twenty steps and repeated invalid responses remain bounded", async (context) => {
  context.mock.method(console, "info", () => {});
  context.mock.method(console, "warn", () => {});
  context.mock.method(console, "error", () => {});
  const oversized = validLesson();
  oversized.steps = Array.from({ length: 20 }, (_, index) => ({
    ...oversized.steps[index % 12],
    title: `Step ${index + 1}`,
  }));
  for (const step of oversized.steps)
    step.narration = Array(28).fill("explanation").join(" ");
  const model = new MockLanguageModelV4({
    doGenerate: [modelResult(oversized), modelResult(validLesson())],
  });
  assert.equal(
    (await generateLesson("An example", new AbortController().signal, model))
      .steps.length,
    12,
  );
  assert.equal(model.doGenerateCalls.length, 2);
  assert.match(
    JSON.stringify(model.doGenerateCalls[1].prompt),
    /560 spoken words across 20 steps/,
  );
  const invalidModel = new MockLanguageModelV4({
    doGenerate: () => Promise.resolve(modelResult(oversized)),
  });
  await assert.rejects(
    generateLesson("An example", new AbortController().signal, invalidModel),
    /couldn’t complete a valid lesson/,
  );
  assert.equal(invalidModel.doGenerateCalls.length, 2);
});

test("token-limited empty output retries with a larger budget before starting narration", async (context) => {
  context.mock.method(console, "info", () => {});
  context.mock.method(console, "warn", () => {});
  const model = new MockLanguageModelV4({
    doGenerate: [modelResult(null, "length"), modelResult(validLesson())],
  });
  assert.deepEqual(
    await generateLesson("An example", new AbortController().signal, model),
    validLesson(),
  );
  assert.equal(model.doGenerateCalls[0].maxOutputTokens, 16000);
  assert.equal(model.doGenerateCalls[1].maxOutputTokens, 24000);
});

test("content-filtered structured output fails clearly without retrying", async (context) => {
  context.mock.method(console, "info", () => {});
  context.mock.method(console, "warn", () => {});
  const model = new MockLanguageModelV4({
    doGenerate: modelResult(null, "content-filter"),
  });
  await assert.rejects(
    generateLesson("An example", new AbortController().signal, model),
    /choose another topic/,
  );
  assert.equal(model.doGenerateCalls.length, 1);
});

test("AI SDK speech uses OpenAI PCM and preserves the samples required by the timeline", async () => {
  const samples = new Uint8Array(48000);
  samples.set([0x34, 0x12]);
  let calls = 0;
  const provider = createOpenAI({
    apiKey: "test-key-not-a-real-credential",
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-4o-mini-tts");
      assert.equal(body.response_format, "pcm");
      assert.equal(body.voice, "coral");
      return new Response(samples, {
        headers: { "Content-Type": "audio/pcm" },
      });
    },
  });
  const { audio } = await generateSpeech({
    model: provider.speech("gpt-4o-mini-tts"),
    text: "An example narration.",
    voice: "coral",
    outputFormat: "pcm",
    maxRetries: 0,
  });
  assert.equal(calls, 1);
  assert.deepEqual(audio.uint8Array, samples);
  assert.equal(
    assembleNarration([Uint8Array.from(audio.uint8Array).buffer]).duration,
    1,
  );
});

test("lesson validation rejects invalid layouts, duplicate IDs and text-only slides", () => {
  assert.equal(validateLesson(validLesson()).steps.length, 12);
  assert.equal(topicSchema.safeParse("  ").success, false);
  let lesson = validLesson();
  lesson.steps[0].scene[0].x = 950;
  assert.throws(() => validateLesson(lesson), /fit inside/);
  lesson = validLesson();
  lesson.steps[0].scene[1].id = "object";
  assert.throws(() => validateLesson(lesson), /unique/);
  lesson = validLesson();
  lesson.steps[0].scene[0].type = "text";
  assert.throws(() => validateLesson(lesson), /visually/);
});
