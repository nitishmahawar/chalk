import { z } from "zod";
import { generateSpeech } from "ai";
import {
  lessonErrorResponse,
  LessonError,
  readBody,
  requireLearner,
} from "@/lib/lesson/server/http";
import { getAIProvider } from "@/lib/lesson/server/ai";
import { requireLessonRateLimit } from "@/lib/lesson/server/rate-limit";
import { claimNarration, saveNarration, failNarration } from "@/db/lessons";
import {
  requireAudioStorage,
  storeNarration,
  readNarration,
  removeUncommittedNarration,
} from "@/lib/lesson/server/storage";

export const maxDuration = 90;

export async function POST(request: Request) {
  let claim:
    { owner: string; id: string; segmentId: string; lease: string } | undefined;
  let uploaded: string | undefined;
  try {
    const owner = await requireLearner(request);
    const { lessonId, step } = z
      .object({
        lessonId: z.uuid(),
        step: z.number().int().min(0).max(19),
      })
      .parse(await readBody(request));
    requireAudioStorage();
    const { record, segment, lease } = await claimNarration(
      owner,
      lessonId,
      step,
    );
    if (!lease)
      return new Response(await readNarration(segment.blobPath!), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "private, no-store",
        },
      });
    claim = { owner, id: lessonId, segmentId: segment.id, lease };
    await requireLessonRateLimit(owner, "narration");
    const lesson = record.plan!;
    if (!lesson.steps[step])
      throw new LessonError("This lesson step does not exist.");
    const { audio: generatedAudio } = await generateSpeech({
      model: getAIProvider().speech("gpt-4o-mini-tts"),
      voice: "coral",
      outputFormat: "pcm",
      instructions:
        "You are a clear, warm tutor. Speak at a natural, steady teaching pace. Read only the provided text. Do not add words or introduce the lesson again.",
      text: lesson.steps[step].narration,
      maxRetries: 0,
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(75000),
      ]),
    });
    const audio = Uint8Array.from(generatedAudio.uint8Array).buffer;
    if (
      !audio.byteLength ||
      audio.byteLength % 2 !== 0 ||
      audio.byteLength > 3 * 1024 * 1024
    )
      throw new LessonError(
        "The voice service returned invalid audio. Please retry.",
        502,
      );
    uploaded = await storeNarration(lessonId, step, audio);
    await saveNarration(
      owner,
      lessonId,
      segment.id,
      lease,
      uploaded,
      audio.byteLength / 2,
    );
    uploaded = undefined;
    return new Response(audio, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Audio-Sample-Rate": "24000",
      },
    });
  } catch (error) {
    if (uploaded) await removeUncommittedNarration(uploaded);
    if (claim)
      await failNarration(
        claim.owner,
        claim.id,
        claim.segmentId,
        claim.lease,
        error instanceof LessonError
          ? error.message
          : "Narration was interrupted. Please retry.",
      ).catch(console.error);
    return lessonErrorResponse(error);
  }
}
