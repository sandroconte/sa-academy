import { pickN, shuffle, type Rand } from "./rng.js";
import type { Exercise, Term } from "../types.js";

export function genMatching(pool: Term[], docId: string, rand: Rand): Exercise | null {
  const defined = pool.filter((t) => t.definition !== null && t.definition.length < 220);
  const unique = [...new Map(defined.map((t) => [t.term.toLowerCase(), t])).values()];
  if (unique.length < 4) return null;
  const chosen = pickN(unique, 4, rand);
  const left = shuffle(chosen, rand);
  const right = shuffle(chosen, rand);
  return {
    id: `${docId}-matching-0`,
    type: "matching",
    payload: {
      pairsLeft: left.map((t) => t.term),
      pairsRight: right.map((t) => t.definition!),
    },
    answerKey: left.map((l) => right.findIndex((r) => r.term === l.term)),
  };
}
