"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { BoardElement } from "@/lib/lesson/schema";
import {
  boardElementStyle,
  canDisplayBoard,
  type BoardViewport,
} from "@/lib/lesson/board";
import { Skeleton } from "@/components/ui/skeleton";
import "@excalidraw/excalidraw/index.css";

function skeleton(
  element: BoardElement,
  dark: boolean,
): ExcalidrawElementSkeleton {
  const { fontSize, ...appearance } = boardElementStyle(element, dark);
  const base = {
    id: element.id,
    x: element.x,
    y: element.y,
    ...appearance,
    roughness: 0,
    fillStyle: "solid" as const,
    locked: true,
    seed: 42,
  };
  if (element.type === "text")
    return {
      ...base,
      type: "text",
      text: element.text,
      fontSize,
      fontFamily: 2,
      width: element.width,
      height: element.height,
      autoResize: false,
    };
  if (element.type === "arrow" || element.type === "line")
    return {
      ...base,
      type: element.type,
      points: [
        [0, 0],
        [element.width, element.height],
      ],
      ...(element.type === "arrow" ? { endArrowhead: "arrow" as const } : {}),
      ...(element.text
        ? { label: { text: element.text, fontSize: 19, fontFamily: 2 } }
        : {}),
    };
  return {
    ...base,
    type: element.type,
    width: element.width,
    height: element.height,
    ...(element.type === "rectangle"
      ? { roundness: { type: 3 as const } }
      : {}),
    ...(element.text
      ? {
          label: {
            text: element.text,
            fontSize,
            fontFamily: 2,
            textAlign: "center" as const,
            verticalAlign: "middle" as const,
          },
        }
      : {}),
  };
}

export default function GeneratedBoard({
  scene,
  viewport,
  onReady,
}: {
  scene: BoardElement[];
  viewport: BoardViewport;
  onReady: () => void;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [painted, setPainted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const elements = useMemo(
    () =>
      convertToExcalidrawElements(
        scene.map((element) => skeleton(element, dark)),
        { regenerateIds: false },
      ),
    [scene, dark],
  );

  const applyScene = useEffectEvent(() => {
    if (!api || api.getAppState().isLoading) return;
    api.updateScene({
      elements,
      appState: { viewBackgroundColor: dark ? "#191f27" : "#fcfcfa" },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  });
  useEffect(() => {
    applyScene();
  }, [api, elements, dark]);

  useEffect(() => {
    if (!api) return;
    const frameBounds = convertToExcalidrawElements(
      [{ id: "lesson-viewport", type: "rectangle", ...viewport }],
      { regenerateIds: false },
    );
    let fitted = false;
    let frame = 0;
    let paintFrame = 0;
    // The API is exposed before Excalidraw restores initialData and measures its viewport.
    function fit() {
      if (!api) return;
      const state = api.getAppState();
      const bounds = containerRef.current?.getBoundingClientRect();
      if (
        !bounds ||
        !canDisplayBoard(state, bounds, api.getSceneElements().length)
      )
        return;
      const firstFit = !fitted;
      fitted = true;
      if (firstFit) applyScene();
      api.scrollToContent(frameBounds, {
        fitToViewport: true,
        animate: false,
        viewportZoomFactor: 0.94,
        maxZoom: 1.25,
      });
      cancelAnimationFrame(paintFrame);
      paintFrame = requestAnimationFrame(() => {
        setPainted(true);
        onReady();
      });
    }
    function scheduleFit() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }
    const unsubscribe = api.onChange(() => {
      if (!fitted) scheduleFit();
    });
    scheduleFit();
    const observer = new ResizeObserver(scheduleFit);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(paintFrame);
      unsubscribe();
      observer.disconnect();
    };
  }, [api, viewport, onReady]);

  // Contain Excalidraw's fixed SVG layer within the embedded board viewport.
  return (
    <div
      ref={containerRef}
      className="generated-board relative h-[400px] w-full min-w-0 max-w-full overflow-hidden sm:h-[500px]"
      style={{ contain: "layout paint" }}
      aria-label="AI-generated teaching whiteboard"
    >
      <div className="absolute inset-0">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{
            elements,
            appState: { viewBackgroundColor: dark ? "#191f27" : "#fcfcfa" },
            scrollToContent: true,
          }}
          theme={dark ? "dark" : "light"}
          viewModeEnabled
          zenModeEnabled
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveAsImage: false,
              toggleTheme: false,
            },
          }}
        />
      </div>
      {!painted && (
        <div role="status" className="absolute inset-0">
          <Skeleton className="h-full w-full rounded-none" />
          <span className="sr-only">Preparing the whiteboard...</span>
        </div>
      )}
    </div>
  );
}
