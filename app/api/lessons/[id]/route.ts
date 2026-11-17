import { z } from "zod";
import { getLessonDetail } from "@/db/lessons";
import { lessonErrorResponse, requireLearner } from "@/lib/lesson/server/http";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireLearner(request);
    const id = z.uuid().parse((await context.params).id);
    return Response.json(await getLessonDetail(owner, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return lessonErrorResponse(error);
  }
}
