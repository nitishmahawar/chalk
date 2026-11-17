import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, close } from "./index";
import { user, lesson, narrationSegment, lessonQuestion } from "./schema";
import {
  createSavedLesson,
  getLessonDetail,
  getOwnedLesson,
  getSavedNarration,
  listSavedLessons,
  claimPlan,
  savePlan,
  claimNarration,
  saveNarration,
  saveProgress,
  claimQuestion,
  saveAnswer,
  failAnswer,
  listQuestions,
} from "./lessons";
import { savedLessonSchema, type LessonPlan } from "../lib/lesson/schema";

test("saved lessons enforce ownership, retry safely, recover work, and preserve progress", async () => {
  const owner = randomUUID(),
    other = randomUUID();
  try {
    await db.insert(user).values([
      {
        id: owner,
        name: "Persistence test",
        email: `${owner}@example.invalid`,
      },
      {
        id: other,
        name: "Persistence test",
        email: `${other}@example.invalid`,
      },
    ]);
    const requestId = randomUUID();
    const created = await createSavedLesson(owner, "Fractions", requestId);
    assert.equal(savedLessonSchema.parse(created).id, created.id);
    assert.equal(
      (await createSavedLesson(owner, "Fractions", requestId)).id,
      created.id,
    );
    await assert.rejects(
      createSavedLesson(owner, "Another topic", requestId),
      /another topic/,
    );
    await assert.rejects(getOwnedLesson(other, created.id), /not found/);
    assert.equal((await listSavedLessons(other)).items.length, 0);
    const first = await claimPlan(owner, created.id);
    assert.ok(first.lease);
    await assert.rejects(claimPlan(owner, created.id), /another request/);
    // Simulate a crashed request and ensure its old lease cannot commit afterwards.
    await db
      .update(lesson)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(lesson.id, created.id));
    const replacement = await claimPlan(owner, created.id);
    assert.ok(replacement.lease);
    const plan: LessonPlan = {
      title: "Fractions",
      subject: "Math",
      objective: "Compare fractions",
      takeaway: "Equal parts",
      steps: Array.from({ length: 12 }, (_, i) => ({
        title: `Step ${i + 1}`,
        narration:
          "Compare equal parts of the same whole to understand how the numerator and denominator describe a fraction in this example.",
        scene: [
          {
            id: "whole",
            type: "rectangle",
            x: 100,
            y: 100,
            width: 200,
            height: 100,
            text: "Whole",
            color: "blue",
          },
        ],
      })),
    };
    await assert.rejects(
      savePlan(owner, created.id, first.lease, plan),
      /another request/,
    );
    await savePlan(owner, created.id, replacement.lease, plan);
    assert.equal((await claimPlan(owner, created.id)).lease, null);
    await assert.rejects(claimNarration(other, created.id, 0), /not found/);
    for (let step = 0; step < 12; step++) {
      const segment = await claimNarration(owner, created.id, step);
      assert.ok(segment.lease);
      await assert.rejects(
        claimNarration(owner, created.id, step),
        /another request/,
      );
      await saveNarration(
        owner,
        created.id,
        segment.segment.id,
        segment.lease,
        `test-only/${created.id}/${step}.pcm`,
        24000,
      );
      assert.equal((await claimNarration(owner, created.id, step)).lease, null);
    }
    await assert.rejects(getSavedNarration(other, created.id, 0), /not found/);
    const storedAudio = await getSavedNarration(owner, created.id, 0);
    assert.equal(storedAudio.blobPath, `test-only/${created.id}/0.pcm`);
    assert.equal(storedAudio.status, "ready");
    const ready = await getLessonDetail(owner, created.id);
    assert.equal(ready.status, "ready");
    assert.equal(ready.duration, 12);
    assert.equal(ready.completedSteps.length, 12);
    await saveProgress(owner, created.id, 8, 2);
    await saveProgress(owner, created.id, 2, 1);
    assert.equal((await getOwnedLesson(owner, created.id)).position, 8);
    await saveProgress(owner, created.id, 99, 3);
    assert.equal((await getOwnedLesson(owner, created.id)).position, 12);
    assert.ok((await getOwnedLesson(owner, created.id)).completedAt);
    await saveProgress(owner, created.id, 0, 4);
    assert.ok((await getOwnedLesson(owner, created.id)).completedAt);
    await assert.rejects(saveProgress(other, created.id, 1, 5), /not found/);
    const questionId = randomUUID();
    await assert.rejects(
      claimQuestion(other, created.id, questionId, "Why?"),
      /not found/,
    );
    const question = await claimQuestion(owner, created.id, questionId, "Why?");
    assert.ok(question.lease);
    await assert.rejects(
      claimQuestion(owner, created.id, questionId, "Why?"),
      /another request/,
    );
    await saveAnswer(
      created.id,
      questionId,
      question.lease,
      "Because the parts are equal.",
    );
    assert.equal(
      (await claimQuestion(owner, created.id, questionId, "Why?")).lease,
      null,
    );
    const retryId = randomUUID();
    const retry = await claimQuestion(
      owner,
      created.id,
      retryId,
      "Explain again",
    );
    assert.ok(retry.lease);
    assert.equal(retry.history.length, 2);
    await failAnswer(created.id, retryId, retry.lease, "Interrupted");
    const edited = await claimQuestion(
      owner,
      created.id,
      retryId,
      "A simpler example?",
    );
    assert.ok(edited.lease);
    await db
      .update(lessonQuestion)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(lessonQuestion.id, retryId));
    assert.equal(
      (await listQuestions(owner, created.id)).find(
        (turn) => turn.id === retryId,
      )?.status,
      "error",
    );
    const recovered = await claimQuestion(
      owner,
      created.id,
      retryId,
      "An even simpler example?",
    );
    assert.ok(recovered.lease);
    await saveAnswer(
      created.id,
      retryId,
      recovered.lease,
      "Cut an apple into equal halves.",
    );
    assert.equal(
      (await getLessonDetail(owner, created.id)).questions.length,
      2,
    );
    // Same database timestamp exercises microsecond-safe keyset pagination.
    await db.insert(lesson).values(
      Array.from({ length: 22 }, (_, i) => ({
        userId: owner,
        topic: `Pagination ${i}`,
        title: `Pagination ${i}`,
        requestId: randomUUID(),
        createdAt: sql`now()`,
      })),
    );
    const page1 = await listSavedLessons(owner);
    assert.equal(page1.items.length, 20);
    assert.ok(page1.nextCursor);
    const page2 = await listSavedLessons(owner, page1.nextCursor);
    assert.equal(
      new Set([...page1.items, ...page2.items].map((item) => item.id)).size,
      23,
    );
    await db
      .delete(lesson)
      .where(and(eq(lesson.id, created.id), eq(lesson.userId, owner)));
    assert.equal(
      (
        await db
          .select()
          .from(narrationSegment)
          .where(eq(narrationSegment.lessonId, created.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(lessonQuestion)
          .where(eq(lessonQuestion.lessonId, created.id))
      ).length,
      0,
    );
  } finally {
    await db.delete(user).where(eq(user.id, owner));
    await db.delete(user).where(eq(user.id, other));
    await close();
  }
});
