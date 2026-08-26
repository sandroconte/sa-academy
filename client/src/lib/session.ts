import type { ExerciseType } from "./types";

export interface SessionItem {
  exerciseId: string;
  docId: string;
  type: ExerciseType;
  payload: Record<string, unknown>;
  answerKey: number | number[] | boolean;
}

function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildSession(
  pool: SessionItem[],
  cap: number,
  rand: () => number = Math.random,
): SessionItem[] {
  return shuffle(pool, rand).slice(0, Math.max(0, cap));
}
