import { z } from "zod";
import { claimPlan, savePlan, failPlan, getLessonDetail } from "@/db/lessons";
import { generateLesson } from "@/lib/lesson/server/generate-lesson";
import { requireLessonRateLimit } from "@/lib/lesson/server/rate-limit";
import {
  LessonError,
  lessonErrorResponse,
  requireLearner,
} from "@/lib/lesson/server/http";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let claimed: { owner: string; id: string; lease: string } | undefined;
  try {
    const owner = await requireLearner(request);
    const id = z.uuid().parse((await context.params).id);
    const { record, lease } = await claimPlan(owner, id);
    if (lease) {
      claimed = { owner, id, lease };
      await requireLessonRateLimit(owner, "plan");
      const plan = await generateLesson(record.topic, request.signal);
      await savePlan(owner, id, lease, plan);
    }
    return Response.json(await getLessonDetail(owner, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (claimed)
      await failPlan(
        claimed.owner,
        claimed.id,
        claimed.lease,
        error instanceof LessonError
          ? error.message
          : "Lesson preparation was interrupted. Please retry.",
      ).catch(console.error);
    return lessonErrorResponse(error);
  }
}
