import { shuffle, type Rand } from "./rng.js";
import type { Exercise } from "../types.js";

export function genOrdering(steps: string[], docId: string, rand: Rand): Exercise | null {
  if (steps.length < 3 || steps.length > 8) return null;
  const indexed = steps.map((text, originalIdx) => ({ text, originalIdx }));
  const shuffled = shuffle(indexed, rand);
  const items = shuffled.map((s) => s.text);
  // answerKey[i] = index into items of the step that goes i-th
  const answerKey = steps.map((_, targetOriginal) =>
    shuffled.findIndex((s) => s.originalIdx === targetOriginal),
  );
  return {
    id: `${docId}-ordering-0`,
    type: "ordering",
    payload: { items },
    answerKey,
  };
}
