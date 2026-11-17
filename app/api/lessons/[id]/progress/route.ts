import { z } from "zod";
import { saveProgress } from "@/db/lessons";
import {
  lessonErrorResponse,
  requireLearner,
  readBody,
} from "@/lib/lesson/server/http";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireLearner(request);
    const id = z.uuid().parse((await context.params).id);
    const { position, revision } = z
      .object({
        position: z.number().finite().min(0),
        revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      })
      .parse(await readBody(request));
    await saveProgress(owner, id, position, revision);
    return new Response(null, { status: 204 });
  } catch (error) {
    return lessonErrorResponse(error);
  }
}
