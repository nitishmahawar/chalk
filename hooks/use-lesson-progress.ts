"use client";
import { useMutation } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
export function useLessonProgress(
  id: string,
  audioRef: RefObject<HTMLAudioElement | null>,
  initialRevision: number,
) {
  const revision = useRef(initialRevision);
  const [error, setError] = useState(false);
  const { mutateAsync } = useMutation({
    retry: false,
    mutationFn: async (body: { position: number; revision: number }) => {
      const response = await fetch(`/api/lessons/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      if (!response.ok) throw new Error("Progress could not be saved.");
    },
  });
  const save = useCallback(
    async (audio = audioRef.current) => {
      if (!audio || audio.readyState === 0) return;
      revision.current = Math.max(revision.current + 1, Date.now());
      try {
        await mutateAsync({
          position: audio.currentTime,
          revision: revision.current,
        });
        setError(false);
      } catch {
        setError(true);
      }
    },
    [audioRef, mutateAsync],
  );
  useEffect(() => {
    const audio = audioRef.current;
    const timer = setInterval(() => {
      if (audio && !audio.paused) void save();
    }, 5000);
    const flush = () => {
      void save(audio);
    };
    audio?.addEventListener("pause", flush);
    audio?.addEventListener("seeked", flush);
    audio?.addEventListener("ended", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(timer);
      audio?.removeEventListener("pause", flush);
      audio?.removeEventListener("seeked", flush);
      audio?.removeEventListener("ended", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      void save(audio);
    };
  }, [audioRef, save]);
  return { error, save };
}
