"use client";

import {
  Captions,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTime, type LessonTiming } from "@/lib/lesson/audio";

type LessonPlayerProps = {
  time: number;
  duration: number;
  timings: LessonTiming[];
  ready: boolean;
  playing: boolean;
  captions: boolean;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onCaptions: () => void;
};

export function LessonPlayer({
  time,
  duration,
  timings,
  ready,
  playing,
  captions,
  onSeek,
  onPlayPause,
  onRestart,
  onCaptions,
}: LessonPlayerProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
      <div className="flex items-center gap-4">
        <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(time)}
        </span>
        <Slider
          className="min-w-0 flex-1"
          aria-label="Lesson timeline"
          min={0}
          max={duration}
          disabled={!ready}
          step={0.1}
          value={[time]}
          trackChildren={timings.slice(1).map((timing, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-card"
              style={{ left: `${(timing.start / duration) * 100}%` }}
            />
          ))}
          onValueChange={(value) =>
            onSeek(Array.isArray(value) ? value[0] : value)
          }
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(duration)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRestart}
                disabled={!ready}
                aria-label="Restart lesson"
              />
            }
          >
            <RotateCcw />
          </TooltipTrigger>
          <TooltipContent>Restart</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              onSeek(
                [...timings]
                  .reverse()
                  .find((timing) => timing.start < time - 0.05)?.start ?? 0,
              )
            }
            aria-label="Previous step"
            disabled={!ready || time === 0}
          >
            <SkipBack />
          </Button>
          <Button
            size="icon-lg"
            onClick={onPlayPause}
            disabled={!ready}
            aria-label={
              playing
                ? "Pause lesson"
                : time >= duration
                  ? "Replay lesson"
                  : "Play lesson"
            }
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              onSeek(
                timings.find((timing) => timing.start > time + 0.05)?.start ??
                  duration,
              )
            }
            aria-label="Next step"
            disabled={!ready || time >= duration}
          >
            <SkipForward />
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={captions ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={onCaptions}
                aria-label="Toggle captions"
                aria-pressed={captions}
              />
            }
          >
            <Captions />
          </TooltipTrigger>
          <TooltipContent>
            {captions ? "Hide captions" : "Show captions"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
