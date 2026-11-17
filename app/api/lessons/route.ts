import { z } from "zod";
import { topicSchema } from "@/lib/lesson/schema";
import { createSavedLesson, listSavedLessons } from "@/db/lessons";
import {
  lessonErrorResponse,
  readBody,
  requireLearner,
} from "@/lib/lesson/server/http";
export async function POST(request: Request) {
  try {
    const owner = await requireLearner(request);
    const { topic, requestId } = z
      .object({ topic: topicSchema, requestId: z.uuid() })
      .parse(await readBody(request));
    return Response.json(await createSavedLesson(owner, topic, requestId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return lessonErrorResponse(error);
  }
}
export async function GET(request: Request) {
  try {
    const owner = await requireLearner(request);
    return Response.json(
      await listSavedLessons(
        owner,
        new URL(request.url).searchParams.get("cursor") ?? undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return lessonErrorResponse(error);
  }
}
