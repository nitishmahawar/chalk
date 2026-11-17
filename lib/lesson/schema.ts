import { z } from "zod";

export const boardElementSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["rectangle", "ellipse", "text", "arrow", "line"]),
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(560),
  width: z.number().min(-1000).max(1000),
  height: z.number().min(-560).max(560),
  text: z.string().max(100),
  color: z.enum(["ink", "blue", "green", "orange", "red", "muted"]),
});

// Complete board snapshots make backward seeking identical to forward playback.
export const lessonPlanSchema = z.object({
  title: z.string().min(1).max(100),
  subject: z.string().min(1).max(50),
  objective: z.string().min(1).max(240),
  takeaway: z.string().min(1).max(400),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        narration: z.string().min(20).max(600),
        scene: z.array(boardElementSchema).min(2).max(14),
      }),
    )
    .length(12),
});

export const topicSchema = z
  .string()
  .trim()
  .min(3, "Enter at least 3 characters.")
  .max(300);
export const questionSchema = z.string().trim().min(1).max(1500);
export const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(5000),
    }),
  )
  .max(12);

export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type BoardElement = z.infer<typeof boardElementSchema>;
export type ChatMessage = z.infer<typeof historySchema>[number];
export const lessonIdSchema = z.uuid();
export const savedQuestionSchema = z.object({
  id: z.uuid(),
  question: z.string(),
  answer: z.string().nullable(),
  status: z.enum(["pending", "complete", "error"]),
  error: z.string().nullable(),
});
export const savedLessonSchema = z.object({
  id: z.uuid(),
  topic: z.string(),
  title: z.string(),
  status: z.enum(["planning", "narration", "ready", "error"]),
  lesson: lessonPlanSchema.nullable(),
  error: z.string().nullable(),
  duration: z.number().nullable(),
  position: z.number(),
  progressRevision: z.number(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  completedSteps: z.array(z.number().int()),
  questions: z.array(savedQuestionSchema),
});
export const lessonSummarySchema = savedLessonSchema.omit({
  lesson: true,
  questions: true,
  completedSteps: true,
});
export const lessonListSchema = z.object({
  items: z.array(lessonSummarySchema),
  nextCursor: z.string().nullable(),
});
export type SavedLesson = z.infer<typeof savedLessonSchema>;
export type SavedQuestion = z.infer<typeof savedQuestionSchema>;
export type LessonSummary = z.infer<typeof lessonSummarySchema>;

export function validateLesson(value: unknown): LessonPlan {
  const lesson = lessonPlanSchema.parse(value);
  const wordCount = lesson.steps.reduce(
    (count, step) => count + step.narration.trim().split(/\s+/).length,
    0,
  );
  if (wordCount < 200 || wordCount > 340)
    throw new Error(
      `The lesson has ${wordCount} spoken words; it must contain 200–340.`,
    );
  for (const [stepIndex, step] of lesson.steps.entries()) {
    const ids = new Set<string>();
    for (const [elementIndex, element] of step.scene.entries()) {
      const location = `Step ${stepIndex + 1}, element ${elementIndex + 1} (${element.type})`;
      if (ids.has(element.id))
        throw new Error(
          `${location}: board element IDs must be unique within a scene.`,
        );
      ids.add(element.id);
      const linear = element.type === "arrow" || element.type === "line";
      if (!linear && (element.width < 30 || element.height < 24))
        throw new Error(
          `${location}: board shapes must have readable dimensions; received ${element.width}×${element.height}, minimum 30×24.`,
        );
      if (linear && Math.hypot(element.width, element.height) < 10)
        throw new Error(
          `${location}: board lines must have a visible length; received ${Math.hypot(element.width, element.height)}.`,
        );
      if (
        element.x + element.width < 0 ||
        element.x + element.width > 1000 ||
        element.y + element.height < 0 ||
        element.y + element.height > 560
      )
        throw new Error(
          `${location}: board elements must fit inside the 1000×560 teaching canvas; start (${element.x}, ${element.y}), end (${element.x + element.width}, ${element.y + element.height}).`,
        );
      if (element.type === "text" && !element.text.trim())
        throw new Error(`${location}: text elements must contain text.`);
    }
    if (!step.scene.some((element) => element.type !== "text"))
      throw new Error(
        `Step ${stepIndex + 1}: each scene must explain the topic visually, but this scene contains only text.`,
      );
  }
  return lesson;
}
