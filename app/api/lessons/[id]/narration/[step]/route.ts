import { z } from "zod";
import { getSavedNarration } from "@/db/lessons";
import { lessonErrorResponse, requireLearner } from "@/lib/lesson/server/http";
import { readNarration } from "@/lib/lesson/server/storage";

export const maxDuration = 90;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; step: string }> },
) {
  try {
    const owner = await requireLearner(request);
    const { id, step } = z
      .object({
        id: z.uuid(),
        step: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .pipe(z.number().int().min(0).max(19)),
      })
      .parse(await context.params);
    const segment = await getSavedNarration(owner, id, step);
    return new Response(await readNarration(segment.blobPath!), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Audio-Sample-Rate": "24000",
      },
    });
  } catch (error) {
    return lessonErrorResponse(error);
  }
}
