import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lt,
  ne,
  or,
  sql,
  getTableColumns,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./index";
import { lesson, narrationSegment, lessonQuestion } from "./schema";
import type { LessonPlan } from "../lib/lesson/schema";
import { LessonError } from "../lib/lesson/server/errors";

const leaseAvailable = (
  column:
    | typeof lesson.leaseExpiresAt
    | typeof narrationSegment.leaseExpiresAt
    | typeof lessonQuestion.leaseExpiresAt,
) => or(isNull(column), lt(column, new Date()));
const busy = () =>
  new LessonError(
    "This step is being prepared in another request. Waiting for it to finish…",
    409,
    2,
  );

export async function getOwnedLesson(owner: string, id: string) {
  const [record] = await db
    .select()
    .from(lesson)
    .where(and(eq(lesson.id, id), eq(lesson.userId, owner)));
  if (!record) throw new LessonError("Lesson not found.", 404);
  return record;
}

function summary(record: typeof lesson.$inferSelect) {
  return {
    id: record.id,
    topic: record.topic,
    title: record.title,
    status: record.status,
    error: record.error,
    duration: record.duration,
    position: record.position,
    progressRevision: record.progressRevision,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function questionSummary(record: typeof lessonQuestion.$inferSelect) {
  const interrupted =
    record.status === "pending" &&
    (!record.leaseExpiresAt || record.leaseExpiresAt.getTime() < Date.now());
  return {
    id: record.id,
    question: record.question,
    answer: record.answer,
    status: interrupted ? ("error" as const) : record.status,
    error: interrupted
      ? "The answer was interrupted. Please retry."
      : record.error,
  };
}

export async function listQuestions(owner: string, id: string) {
  await getOwnedLesson(owner, id);
  const rows = await db
    .select()
    .from(lessonQuestion)
    .where(eq(lessonQuestion.lessonId, id))
    .orderBy(asc(lessonQuestion.createdAt), asc(lessonQuestion.id));
  return rows.map(questionSummary);
}

export async function getLessonDetail(owner: string, id: string) {
  const record = await getOwnedLesson(owner, id);
  const [segments, questions] = await Promise.all([
    db
      .select({ step: narrationSegment.step })
      .from(narrationSegment)
      .where(
        and(
          eq(narrationSegment.lessonId, id),
          eq(narrationSegment.status, "ready"),
        ),
      ),
    listQuestions(owner, id),
  ]);
  return {
    ...summary(record),
    lesson: record.plan,
    completedSteps: segments.map((segment) => segment.step),
    questions,
  };
}

export async function createSavedLesson(
  owner: string,
  topic: string,
  requestId: string,
) {
  await db
    .insert(lesson)
    .values({ userId: owner, topic, title: topic, requestId })
    .onConflictDoNothing({ target: [lesson.userId, lesson.requestId] });
  const [record] = await db
    .select()
    .from(lesson)
    .where(and(eq(lesson.userId, owner), eq(lesson.requestId, requestId)));
  if (!record || record.topic !== topic)
    throw new LessonError(
      "This request identifier already belongs to another topic.",
      409,
    );
  return getLessonDetail(owner, record.id);
}

export async function listSavedLessons(owner: string, cursor?: string) {
  let before: { createdAt: string; id: string } | undefined;
  if (cursor) {
    try {
      const value = z
        .object({ createdAt: z.iso.datetime(), id: z.uuid() })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      before = { createdAt: value.createdAt, id: value.id };
    } catch {
      throw new LessonError("Invalid lesson history cursor.");
    }
  }
  const rows = await db
    .select({
      ...getTableColumns(lesson),
      cursorDate: sql<string>`to_char(${lesson.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(lesson)
    .where(
      and(
        eq(lesson.userId, owner),
        before
          ? or(
              lt(lesson.createdAt, sql`${before.createdAt}::timestamptz`),
              and(
                eq(lesson.createdAt, sql`${before.createdAt}::timestamptz`),
                lt(lesson.id, before.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(lesson.createdAt), desc(lesson.id))
    .limit(21);
  const items = rows.slice(0, 20).map(summary);
  const last = rows.slice(0, 20).at(-1);
  return {
    items,
    nextCursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.cursorDate, id: last.id }),
          ).toString("base64url")
        : null,
  };
}

export async function claimPlan(owner: string, id: string) {
  const record = await getOwnedLesson(owner, id);
  if (record.plan) return { record, lease: null };
  const lease = randomUUID();
  const [claimed] = await db
    .update(lesson)
    .set({
      status: "planning",
      error: null,
      leaseToken: lease,
      leaseExpiresAt: new Date(Date.now() + 180000),
    })
    .where(
      and(
        eq(lesson.id, id),
        eq(lesson.userId, owner),
        isNull(lesson.plan),
        leaseAvailable(lesson.leaseExpiresAt),
      ),
    )
    .returning();
  if (!claimed) {
    const latest = await getOwnedLesson(owner, id);
    if (latest.plan) return { record: latest, lease: null };
    throw busy();
  }
  return { record: claimed, lease };
}

export async function savePlan(
  owner: string,
  id: string,
  lease: string,
  plan: LessonPlan,
) {
  await db.transaction(async (tx) => {
    const [saved] = await tx
      .update(lesson)
      .set({
        plan,
        title: plan.title,
        status: "narration",
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(lesson.id, id),
          eq(lesson.userId, owner),
          eq(lesson.leaseToken, lease),
        ),
      )
      .returning({ id: lesson.id });
    if (!saved) throw busy();
    await tx
      .insert(narrationSegment)
      .values(plan.steps.map((_, step) => ({ lessonId: id, step })))
      .onConflictDoNothing();
  });
}

export async function failPlan(
  owner: string,
  id: string,
  lease: string,
  message: string,
) {
  await db
    .update(lesson)
    .set({
      status: "error",
      error: message,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(lesson.id, id),
        eq(lesson.userId, owner),
        eq(lesson.leaseToken, lease),
      ),
    );
}

export async function getSavedNarration(
  owner: string,
  id: string,
  step: number,
) {
  await getOwnedLesson(owner, id);
  const [segment] = await db
    .select()
    .from(narrationSegment)
    .where(
      and(eq(narrationSegment.lessonId, id), eq(narrationSegment.step, step)),
    );
  if (segment?.status !== "ready" || !segment.blobPath)
    throw new LessonError(
      "Saved narration is not available for this step.",
      404,
    );
  return segment;
}

export async function claimNarration(owner: string, id: string, step: number) {
  const record = await getOwnedLesson(owner, id);
  if (!record.plan || !record.plan.steps[step])
    throw new LessonError("The lesson plan is not ready for this step.", 409);
  await db
    .insert(narrationSegment)
    .values({ lessonId: id, step })
    .onConflictDoNothing();
  const [segment] = await db
    .select()
    .from(narrationSegment)
    .where(
      and(eq(narrationSegment.lessonId, id), eq(narrationSegment.step, step)),
    );
  if (segment.status === "ready" && segment.blobPath)
    return { record, segment, lease: null };
  const lease = randomUUID();
  const [claimed] = await db
    .update(narrationSegment)
    .set({
      status: "generating",
      leaseToken: lease,
      leaseExpiresAt: new Date(Date.now() + 120000),
      error: null,
    })
    .where(
      and(
        eq(narrationSegment.id, segment.id),
        ne(narrationSegment.status, "ready"),
        leaseAvailable(narrationSegment.leaseExpiresAt),
      ),
    )
    .returning();
  if (!claimed) throw busy();
  return { record, segment: claimed, lease };
}

export async function saveNarration(
  owner: string,
  id: string,
  segmentId: string,
  lease: string,
  blobPath: string,
  sampleCount: number,
) {
  await db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, id), eq(lesson.userId, owner)))
      .for("update");
    if (!record?.plan) throw new LessonError("Lesson not found.", 404);
    const [saved] = await tx
      .update(narrationSegment)
      .set({
        status: "ready",
        blobPath,
        sampleCount,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(narrationSegment.id, segmentId),
          eq(narrationSegment.lessonId, id),
          eq(narrationSegment.leaseToken, lease),
        ),
      )
      .returning({ id: narrationSegment.id });
    if (!saved) throw busy();
    const completed = await tx
      .select({ sampleCount: narrationSegment.sampleCount })
      .from(narrationSegment)
      .where(
        and(
          eq(narrationSegment.lessonId, id),
          eq(narrationSegment.status, "ready"),
        ),
      );
    const ready = completed.length === record.plan.steps.length;
    await tx
      .update(lesson)
      .set({
        status: ready ? "ready" : "narration",
        error: null,
        ...(ready
          ? {
              duration:
                completed.reduce(
                  (sum, item) => sum + (item.sampleCount ?? 0),
                  0,
                ) / 24000,
            }
          : {}),
      })
      .where(eq(lesson.id, id));
  });
}

export async function failNarration(
  owner: string,
  id: string,
  segmentId: string,
  lease: string,
  message: string,
) {
  await getOwnedLesson(owner, id);
  await db
    .update(narrationSegment)
    .set({
      status: "error",
      error: message,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(narrationSegment.id, segmentId),
        eq(narrationSegment.lessonId, id),
        eq(narrationSegment.leaseToken, lease),
      ),
    );
}

export async function saveProgress(
  owner: string,
  id: string,
  position: number,
  revision: number,
) {
  const record = await getOwnedLesson(owner, id);
  if (record.status !== "ready" || !record.duration)
    throw new LessonError("Playback is not ready yet.", 409);
  const bounded = Math.max(0, Math.min(record.duration, position));
  await db
    .update(lesson)
    .set({
      position: bounded,
      progressRevision: revision,
      ...(bounded >= record.duration - 0.25
        ? { completedAt: record.completedAt ?? new Date() }
        : {}),
    })
    .where(
      and(
        eq(lesson.id, id),
        eq(lesson.userId, owner),
        lt(lesson.progressRevision, revision),
      ),
    );
}

export async function claimQuestion(
  owner: string,
  id: string,
  questionId: string,
  question: string,
) {
  const record = await getOwnedLesson(owner, id);
  if (!record.plan)
    throw new LessonError("Generate the lesson before asking a question.", 409);
  await db
    .insert(lessonQuestion)
    .values({ id: questionId, lessonId: id, question })
    .onConflictDoNothing();
  const [existing] = await db
    .select()
    .from(lessonQuestion)
    .where(
      and(eq(lessonQuestion.id, questionId), eq(lessonQuestion.lessonId, id)),
    );
  if (!existing)
    throw new LessonError("This question identifier is already in use.", 409);
  if (
    existing.question !== question &&
    existing.status !== "error" &&
    !(
      existing.status === "pending" &&
      (!existing.leaseExpiresAt ||
        existing.leaseExpiresAt.getTime() < Date.now())
    )
  )
    throw new LessonError(
      "This question identifier belongs to another question.",
      409,
    );
  if (existing.status === "complete")
    return { record, turn: existing, lease: null, history: [] };
  const lease = randomUUID();
  const [turn] = await db
    .update(lessonQuestion)
    .set({
      question,
      answer: null,
      status: "pending",
      error: null,
      leaseToken: lease,
      leaseExpiresAt: new Date(Date.now() + 90000),
    })
    .where(
      and(
        eq(lessonQuestion.id, questionId),
        eq(lessonQuestion.lessonId, id),
        ne(lessonQuestion.status, "complete"),
        leaseAvailable(lessonQuestion.leaseExpiresAt),
      ),
    )
    .returning();
  if (!turn) throw busy();
  const previous = await db
    .select()
    .from(lessonQuestion)
    .where(
      and(
        eq(lessonQuestion.lessonId, id),
        eq(lessonQuestion.status, "complete"),
        ne(lessonQuestion.id, questionId),
      ),
    )
    .orderBy(desc(lessonQuestion.createdAt), desc(lessonQuestion.id))
    .limit(6);
  const history = previous.reverse().flatMap((item) => [
    { role: "user" as const, content: item.question },
    { role: "assistant" as const, content: item.answer! },
  ]);
  return { record, turn, lease, history };
}

export async function saveAnswer(
  id: string,
  questionId: string,
  lease: string,
  answer: string,
) {
  const [turn] = await db
    .update(lessonQuestion)
    .set({
      answer,
      status: "complete",
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(lessonQuestion.id, questionId),
        eq(lessonQuestion.lessonId, id),
        eq(lessonQuestion.leaseToken, lease),
      ),
    )
    .returning();
  if (!turn) throw busy();
  return questionSummary(turn);
}

export async function failAnswer(
  id: string,
  questionId: string,
  lease: string,
  message: string,
) {
  await db
    .update(lessonQuestion)
    .set({
      status: "error",
      error: message,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(lessonQuestion.id, questionId),
        eq(lessonQuestion.lessonId, id),
        eq(lessonQuestion.leaseToken, lease),
      ),
    );
}
