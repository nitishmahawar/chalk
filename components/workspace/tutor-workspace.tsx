"use client";

import { useCallback, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  AudioLines,
  Check,
  SquarePen,
  LoaderCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useLessonGeneration,
  type ReadyLesson,
} from "@/hooks/use-lesson-generation";
import { useLessonProgress } from "@/hooks/use-lesson-progress";
import { useLessonPlayback } from "@/hooks/use-lesson-playback";
import { formatTime, stepAtTime } from "@/lib/lesson/audio";
import { LessonBoard } from "./lesson-board";
import { LessonConversation } from "./lesson-conversation";
import { LessonPlayer } from "./lesson-player";
import { TopicComposer } from "./topic-composer";
import { WorkspaceSidebar } from "./workspace-sidebar";

function ActiveLesson({
  readyLesson,
  onNewLesson,
}: {
  readyLesson: ReadyLesson;
  onNewLesson: () => void;
}) {
  const {
    lesson,
    timings,
    duration,
    audioUrl,
    id,
    questions,
    position,
    progressRevision,
  } = readyLesson;
  const {
    audioRef,
    events,
    time,
    playing,
    ready,
    buffering,
    error,
    playPause,
    seek,
    restart,
  } = useLessonPlayback(duration, position);
  const progress = useLessonProgress(id, audioRef, progressRevision);
  const [captions, setCaptions] = useState(true);
  const [boardReady, setBoardReady] = useState(false);
  const markBoardReady = useCallback(() => setBoardReady(true), []);
  const step = stepAtTime(timings, time);

  return (
    <div className="workspace-enter flex w-full min-w-0 flex-1 flex-col gap-6 p-4 sm:p-7">
      <audio ref={audioRef} src={audioUrl} preload="auto" {...events} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{lesson.subject}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatTime(duration)} {"\u00b7"} AI lesson
            </span>
          </div>
          <h1 className="text-2xl font-medium tracking-tight wrap-anywhere sm:text-3xl">
            {lesson.title}
          </h1>
          <p className="max-w-2xl text-sm wrap-anywhere text-muted-foreground">
            {lesson.objective}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onNewLesson}>
          <ArrowLeft data-icon="inline-start" />
          New topic
        </Button>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-label="Whiteboard lesson"
        >
          <LessonBoard lesson={lesson} step={step} onReady={markBoardReady} />
          {captions && (
            <div className="flex min-h-20 items-start gap-3 px-1 py-1">
              <AudioLines className="mt-1 size-4 shrink-0 text-primary" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-xs text-muted-foreground">
                  {buffering ? "Buffering narration..." : "Tutor narration"}
                </p>
                <p className="max-w-3xl text-sm leading-relaxed wrap-anywhere">
                  {lesson.steps[step].narration}
                </p>
              </div>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {progress.error && (
            <p role="alert" className="text-sm text-destructive">
              Progress could not be saved.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void progress.save()}
              >
                Retry
              </button>
            </p>
          )}
          <LessonPlayer
            time={time}
            duration={duration}
            timings={timings}
            playing={playing}
            ready={ready && boardReady}
            captions={captions}
            onSeek={seek}
            onPlayPause={playPause}
            onRestart={restart}
            onCaptions={() => setCaptions((value) => !value)}
          />
          {time >= duration && (
            <p
              role="status"
              className="flex items-center justify-center gap-2 text-sm text-primary"
            >
              <Check className="size-4" />
              Lesson complete. Replay it or ask your tutor a question.
            </p>
          )}
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            AI-generated voice. Your lesson and questions are saved to your
            account.
          </p>
        </section>
        <LessonConversation
          lesson={lesson}
          lessonId={id}
          initialQuestions={questions}
          timings={timings}
          step={step}
          onSeek={seek}
        />
      </div>
    </div>
  );
}

export function TutorWorkspace({
  initialLessonId,
}: { initialLessonId?: string } = {}) {
  const generation = useLessonGeneration(initialLessonId);
  const busy =
    generation.phase === "loading" ||
    generation.phase === "planning" ||
    generation.phase === "narration";

  return (
    <TooltipProvider delay={300}>
      <SidebarProvider
        className="workspace-shell min-w-0"
        style={{ "--sidebar-width": "15rem" } as CSSProperties}
      >
        <WorkspaceSidebar
          currentLessonId={
            generation.phase === "idle"
              ? undefined
              : (generation.lesson?.id ?? initialLessonId)
          }
          onNewLesson={generation.reset}
        />
        <SidebarInset className="min-w-0 md:w-0">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:hidden">
            <button
              type="button"
              onClick={generation.reset}
              aria-label="chalk home"
              className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <SquarePen className="size-4" strokeWidth={1.8} />
              </span>
              <span className="text-xl font-semibold tracking-tight">
                chalk<span className="text-primary">.</span>
              </span>
            </button>
            <SidebarTrigger variant="default" size="icon-lg" />
          </header>
          {generation.phase === "idle" && (
            <div className="flex flex-1 flex-col">
              <TopicComposer onGenerate={generation.generate} />
            </div>
          )}
          {(busy || generation.phase === "error") && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-14">
              <div className="flex w-full max-w-lg flex-col gap-5">
                {generation.phase === "error" ? (
                  <>
                    <Alert variant="destructive">
                      <AlertTitle>Let&apos;s try that again</AlertTitle>
                      <AlertDescription>{generation.error}</AlertDescription>
                    </Alert>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={generation.retry}>Retry</Button>
                      <Button variant="outline" onClick={generation.reset}>
                        Choose another topic
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      role="status"
                      className="flex items-center gap-3 text-lg font-medium"
                    >
                      <LoaderCircle className="size-5 text-primary motion-safe:animate-spin" />
                      {generation.phase === "loading"
                        ? "Loading your saved lesson..."
                        : generation.phase === "planning"
                          ? "Drawing up your lesson..."
                          : "Giving your lesson a voice..."}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {generation.phase === "loading"
                        ? generation.progress.total > 0
                          ? `Loading saved audio ${generation.progress.completed} of ${generation.progress.total}. Your lesson is already prepared.`
                          : "Retrieving your saved whiteboard, questions, and playback position."
                        : generation.phase === "planning"
                          ? "Your tutor is planning the explanation, examples, and whiteboard diagrams."
                          : `Narration ${generation.progress.completed} of ${generation.progress.total} ready. We are aligning each visual step with its audio.`}
                    </p>
                    <Skeleton className="h-56 w-full rounded-2xl" />
                    <p className="text-xs text-muted-foreground">
                      {generation.phase === "loading"
                        ? "Using your saved lesson and narration."
                        : "Your progress is saved. Reopen this lesson to resume preparation."}
                    </p>
                    <Button
                      variant="outline"
                      className="w-fit"
                      onClick={generation.reset}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          {generation.lesson && generation.phase === "ready" && (
            <ActiveLesson
              key={generation.lesson.audioUrl}
              readyLesson={generation.lesson}
              onNewLesson={generation.reset}
            />
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
