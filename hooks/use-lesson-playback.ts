"use client";

import { useEffect, useRef, useState } from "react";

export function useLessonPlayback(duration: number, initialPosition = 0) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(initialPosition);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function synchronize() {
    if (audioRef.current) setTime(audioRef.current.currentTime);
  }

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame: number;
    function tick() {
      synchronize();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [playing]);

  async function playPause() {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (audio.ended || audio.currentTime >= duration) audio.currentTime = 0;
    setError(null);
    try {
      await audio.play();
    } catch {
      setError(
        "Your browser couldn’t start the narration. Press play to try again.",
      );
    }
  }

  function seek(next: number) {
    const audio = audioRef.current;
    if (!audio || !ready || !Number.isFinite(next)) return;
    audio.currentTime = Math.max(0, Math.min(duration, next));
    synchronize();
  }

  function restart() {
    audioRef.current?.pause();
    seek(0);
  }

  return {
    audioRef,
    time,
    playing,
    ready,
    buffering,
    error,
    playPause,
    seek,
    restart,
    events: {
      onLoadedMetadata: () => {
        if (audioRef.current)
          audioRef.current.currentTime = Math.min(duration, initialPosition);
        synchronize();
        setReady(true);
        setError(null);
      },
      onTimeUpdate: synchronize,
      onSeeked: synchronize,
      onPlay: () => setPlaying(true),
      onPlaying: () => {
        setBuffering(false);
        setPlaying(true);
      },
      onPause: () => {
        setPlaying(false);
        setBuffering(false);
        synchronize();
      },
      onEnded: () => {
        setPlaying(false);
        setBuffering(false);
        setTime(duration);
      },
      onWaiting: () => setBuffering(true),
      onCanPlay: () => setBuffering(false),
      onError: () => {
        setPlaying(false);
        setReady(false);
        setBuffering(false);
        setError(
          "The narration couldn’t be loaded. Generate the lesson again to retry.",
        );
      },
    },
  };
}
