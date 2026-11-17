"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  savedLessonSchema,
  type SavedLesson,
  type LessonPlan,
} from "@/lib/lesson/schema";
import { assembleNarration, type LessonTiming } from "@/lib/lesson/audio";
import {
  fetchSavedNarration,
  lessonRequest,
  postLessonRequest,
} from "@/lib/lesson/client";

export type ReadyLesson = Omit<SavedLesson, "lesson" | "duration"> & {
  lesson: LessonPlan;
  audioUrl: string;
  duration: number;
  timings: LessonTiming[];
};
type Draft = { envelope: SavedLesson; chunks: (ArrayBuffer | undefined)[] };
type Phase = "idle" | "loading" | "planning" | "narration" | "ready" | "error";

export function useLessonGeneration(initialLessonId?: string) {
  const queryClient = useQueryClient();
  const request = useMutation({
    mutationFn: ({
      path,
      body,
      signal,
    }: {
      path: string;
      body: unknown;
      signal: AbortSignal;
    }) => postLessonRequest(path, body, signal),
    retry: false,
  });
  const idRef = useRef(initialLessonId);
  const requestIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>(
    initialLessonId ? "loading" : "idle",
  );
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<ReadyLesson | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);
  const draftRef = useRef<Draft | null>(null);
  const topicRef = useRef("");
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      versionRef.current++;
      controllerRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const resumeSavedLesson = useEffectEvent(() => {
    void run("", true);
  });
  useEffect(() => {
    if (initialLessonId) resumeSavedLesson();
  }, [initialLessonId]);

  function reset() {
    idRef.current = undefined;
    requestIdRef.current = null;
    window.history.replaceState(null, "", "/");
    versionRef.current++;
    controllerRef.current?.abort();
    draftRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setLesson(null);
    setError(null);
    setPhase("idle");
    setProgress({ completed: 0, total: 0 });
  }

  async function run(topic: string, resume: boolean) {
    controllerRef.current?.abort();
    const version = ++versionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    topicRef.current = topic;
    setError(null);
    try {
      let draft = resume ? draftRef.current : null;
      if (!draft) {
        setPhase(idRef.current ? "loading" : "planning");
        let envelope: SavedLesson;
        if (idRef.current) {
          const savedId = idRef.current;
          envelope = await queryClient.fetchQuery({
            queryKey: ["lesson", savedId],
            queryFn: async ({ signal }) =>
              savedLessonSchema.parse(
                await (
                  await lessonRequest(`/api/lessons/${savedId}`, {
                    signal,
                  })
                ).json(),
              ),
            staleTime: 0,
            retry: false,
          });
        } else {
          requestIdRef.current ??= crypto.randomUUID();
          envelope = savedLessonSchema.parse(
            await (
              await request.mutateAsync({
                path: "/api/lessons",
                body: { topic, requestId: requestIdRef.current },
                signal: controller.signal,
              })
            ).json(),
          );
          if (version !== versionRef.current) return;
          idRef.current = envelope.id;
          window.history.replaceState(null, "", `/lessons/${envelope.id}`);
          void queryClient.invalidateQueries({ queryKey: ["lessons"] });
        }
        if (version !== versionRef.current || controller.signal.aborted) return;
        if (!envelope.lesson) {
          setPhase("planning");
          envelope = savedLessonSchema.parse(
            await (
              await request.mutateAsync({
                path: `/api/lessons/${envelope.id}/generate`,
                body: {},
                signal: controller.signal,
              })
            ).json(),
          );
        }
        if (version !== versionRef.current) return;
        if (!envelope.lesson)
          throw new Error("The lesson plan is missing. Please retry.");
        draft = { envelope, chunks: new Array(envelope.lesson.steps.length) };
        draftRef.current = draft;
      }
      const currentDraft = draft;
      const total = currentDraft.chunks.length;
      const completedSteps = new Set(currentDraft.envelope.completedSteps);
      const savedAudio =
        currentDraft.envelope.status === "ready" ||
        completedSteps.size === total;
      setPhase(savedAudio ? "loading" : "narration");
      setProgress({
        completed: currentDraft.chunks.filter(Boolean).length,
        total,
      });
      let nextIndex = 0;

      async function worker() {
        while (nextIndex < total) {
          const index = nextIndex++;
          if (currentDraft.chunks[index]) continue;
          const audioKey = ["lesson-audio", currentDraft.envelope.id, index];
          let chunk: ArrayBuffer;
          if (savedAudio || completedSteps.has(index)) {
            chunk = await queryClient.fetchQuery({
              queryKey: audioKey,
              queryFn: ({ signal }) =>
                fetchSavedNarration(currentDraft.envelope.id, index, signal),
              staleTime: Infinity,
              retry: false,
            });
          } else {
            const response = await request.mutateAsync({
              path: "/api/lessons/narration",
              body: { lessonId: currentDraft.envelope.id, step: index },
              signal: controller.signal,
            });
            chunk = await response.arrayBuffer();
          }
          if (version !== versionRef.current || controller.signal.aborted)
            return;
          if (!chunk.byteLength || chunk.byteLength % 2 !== 0)
            throw new Error("A narration segment was invalid. Please retry.");
          queryClient.setQueryData(audioKey, chunk);
          completedSteps.add(index);
          currentDraft.envelope.completedSteps = [...completedSteps];
          currentDraft.chunks[index] = chunk;
          setProgress({
            completed: currentDraft.chunks.filter(Boolean).length,
            total,
          });
        }
      }

      await Promise.all([worker(), worker()]);
      if (version !== versionRef.current || controller.signal.aborted) return;
      const audio = assembleNarration(
        currentDraft.chunks.map((chunk) => {
          if (!chunk)
            throw new Error("A narration segment is missing. Please retry.");
          return chunk;
        }),
      );
      const audioUrl = URL.createObjectURL(audio.blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = audioUrl;
      setLesson({
        ...currentDraft.envelope,
        status: "ready",
        lesson: currentDraft.envelope.lesson!,
        audioUrl,
        duration: audio.duration,
        timings: audio.timings,
      });
      // Audio chunks are no longer needed once the browser owns the complete WAV.
      draftRef.current = null;
      setPhase("ready");
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    } catch (error) {
      if (version !== versionRef.current) return;
      controller.abort();
      setError(
        error instanceof Error
          ? error.message
          : "The lesson could not be generated.",
      );
      setPhase("error");
    }
  }

  function generate(topic: string) {
    reset();
    void run(topic, false);
  }
  function retry() {
    void run(topicRef.current, true);
  }

  return { phase, progress, error, lesson, generate, retry, reset };
}
