export const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;

export type LessonTiming = { start: number; end: number };

export function assembleNarration(chunks: readonly ArrayBuffer[]) {
  if (!chunks.length) throw new Error("No narration was generated.");
  let byteLength = 0;
  const timings: LessonTiming[] = chunks.map((chunk) => {
    if (!chunk.byteLength || chunk.byteLength % 2 !== 0)
      throw new Error("Invalid narration audio. Please retry.");
    const start = byteLength / BYTES_PER_SECOND;
    byteLength += chunk.byteLength;
    return { start, end: byteLength / BYTES_PER_SECOND };
  });
  const wav = new ArrayBuffer(44 + byteLength);
  const view = new DataView(wav);
  const bytes = new Uint8Array(wav);
  function writeText(offset: number, text: string) {
    for (let index = 0; index < text.length; index++)
      view.setUint8(offset + index, text.charCodeAt(index));
  }
  writeText(0, "RIFF");
  view.setUint32(4, 36 + byteLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, BYTES_PER_SECOND, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, byteLength, true);
  let offset = 44;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return {
    blob: new Blob([wav], { type: "audio/wav" }),
    timings,
    duration: byteLength / BYTES_PER_SECOND,
  };
}

export function stepAtTime(timings: readonly LessonTiming[], time: number) {
  const index = timings.findIndex((timing) => time < timing.end);
  return index === -1 ? Math.max(0, timings.length - 1) : index;
}

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
