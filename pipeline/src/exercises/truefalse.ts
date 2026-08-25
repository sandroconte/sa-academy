import { pickN, type Rand } from "./rng.js";
import type { Exercise, Term } from "../types.js";

export function genTrueFalse(pool: Term[], docId: string, rand: Rand): Exercise[] {
  const defined = pool.filter((t) => t.definition !== null);
  const out: Exercise[] = [];
  if (defined.length === 0) return out;

  // true statements: real definitions
  for (const t of pickN(defined, Math.min(2, defined.length), rand)) {
    out.push({
      id: `${docId}-truefalse-${out.length}`,
      type: "truefalse",
      payload: { statement: t.definition! },
      answerKey: true,
    });
  }

  // false statements: pair a term with another term's definition
  const swappable = defined.filter((t) =>
    t.definition!.toLowerCase().includes(t.term.toLowerCase()),
  );
  for (const t of pickN(swappable, Math.min(2, swappable.length), rand)) {
    const others = defined.filter((o) => o.term !== t.term && o.definition !== null);
    if (others.length === 0) continue;
    const victim = pickN(others, 1, rand)[0]!;
    const swapped = t.definition!.replace(
      new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      victim.term,
    );
    if (swapped === t.definition) continue;
    out.push({
      id: `${docId}-truefalse-${out.length}`,
      type: "truefalse",
      payload: { statement: swapped },
      answerKey: false,
    });
  }
  return out;
}
