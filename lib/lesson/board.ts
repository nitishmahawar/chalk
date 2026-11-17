import type { BoardElement, LessonPlan } from "./schema";

const palettes = {
  light: {
    ink: { stroke: "#263445", fill: "#f1f5f9" },
    blue: { stroke: "#245ac4", fill: "#e8f0ff" },
    green: { stroke: "#187446", fill: "#e7f5ec" },
    orange: { stroke: "#9a570d", fill: "#fff2d9" },
    red: { stroke: "#b43b3b", fill: "#fce9e9" },
    muted: { stroke: "#8390a0", fill: "#f3f5f7" },
  },
  dark: {
    ink: { stroke: "#e0e7ef", fill: "#28313c" },
    blue: { stroke: "#a8c7ff", fill: "#263b5b" },
    green: { stroke: "#9de0b8", fill: "#223e30" },
    orange: { stroke: "#f2ce8c", fill: "#443622" },
    red: { stroke: "#f0aaaa", fill: "#452b30" },
    muted: { stroke: "#8a96a6", fill: "#242c35" },
  },
};

export function boardElementStyle(element: BoardElement, dark: boolean) {
  const palette = palettes[dark ? "dark" : "light"][element.color];
  const isShape = element.type === "rectangle" || element.type === "ellipse";
  const isFocus = element.color === "blue" || element.color === "green";
  const isEquation = element.type === "text" && /[=∑∫√×÷±]/u.test(element.text);
  return {
    strokeColor: palette.stroke,
    backgroundColor: isShape ? palette.fill : "transparent",
    opacity: element.color === "muted" ? 55 : 100,
    strokeWidth: element.type === "text" ? 1 : isFocus ? 2.5 : 1.6,
    fontSize: isEquation ? 30 : element.type === "text" ? 24 : 22,
  };
}

// One viewport for the whole lesson keeps the diagram still while its focus changes.
export function lessonBoardViewport(lesson: LessonPlan) {
  const elements = lesson.steps.flatMap((step) => step.scene);
  if (!elements.length) return { x: 0, y: 0, width: 1000, height: 560 };
  const left = Math.min(
    ...elements.map((element) =>
      Math.min(element.x, element.x + element.width),
    ),
  );
  const top = Math.min(
    ...elements.map((element) =>
      Math.min(element.y, element.y + element.height),
    ),
  );
  const right = Math.max(
    ...elements.map((element) =>
      Math.max(element.x, element.x + element.width),
    ),
  );
  const bottom = Math.max(
    ...elements.map((element) =>
      Math.max(element.y, element.y + element.height),
    ),
  );
  const width = Math.max(400, right - left + 80);
  const height = Math.max(260, bottom - top + 80);
  return {
    x: (left + right - width) / 2,
    y: (top + bottom - height) / 2,
    width,
    height,
  };
}

export type BoardViewport = ReturnType<typeof lessonBoardViewport>;

export function canDisplayBoard(
  state: { isLoading: boolean; width: number; height: number },
  container: { width: number; height: number },
  elementCount: number,
) {
  return (
    !state.isLoading &&
    elementCount > 0 &&
    container.width > 0 &&
    container.height > 0 &&
    Math.abs(state.width - container.width) <= 1 &&
    Math.abs(state.height - container.height) <= 1
  );
}
