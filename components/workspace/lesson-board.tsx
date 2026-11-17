"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { LessonPlan } from "@/lib/lesson/schema";
import { lessonBoardViewport } from "@/lib/lesson/board";

const GeneratedBoard = dynamic(() => import("./generated-board"), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full sm:h-[500px]" />,
});

export function LessonBoard({
  lesson,
  step,
  onReady,
}: {
  lesson: LessonPlan;
  step: number;
  onReady: () => void;
}) {
  const current = lesson.steps[step];
  const viewport = useMemo(() => lessonBoardViewport(lesson), [lesson]);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] items-center gap-3 border-b border-border px-5 py-3">
        <span aria-hidden="true" />
        <h2 className="min-w-0 text-center text-sm font-medium wrap-anywhere">
          {current.title}
        </h2>
        <span className="justify-self-end text-right text-xs tabular-nums text-muted-foreground">
          Step {step + 1} of {lesson.steps.length}
        </span>
      </div>
      <GeneratedBoard
        scene={current.scene}
        viewport={viewport}
        onReady={onReady}
      />
      <p className="sr-only">{current.narration}</p>
    </div>
  );
}
