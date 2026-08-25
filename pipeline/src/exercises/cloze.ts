import { pickN, shuffle, type Rand } from "./rng.js";
import type { Exercise, Term } from "../types.js";

function base(id: string, type: Exercise["type"], n: number): Omit<Exercise, "answerKey"> {
  return { id: `${id}-${type}-${n}`, type, payload: {} };
}

export function distractorTerms(correct: Term, pool: Term[], rand: Rand, n: number): Term[] {
  const others = pool.filter(
    (t) => t.term !== correct.term && t.definition !== null && t.term.length > 2,
  );
  const unique = [...new Map(others.map((t) => [t.term.toLowerCase(), t])).values()];
  return pickN(unique, n, rand);
}

export function genCloze(
  term: Term,
  pool: Term[],
  docId: string,
  n: number,
  rand: Rand,
): Exercise | null {
  if (!term.definition) return null;
  const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  if (!re.test(term.definition)) return null;
  const match = new RegExp(`${escaped}`, "i").exec(term.definition);
  if (!match) return null;
  const idx = match.index;
  const blanked = term.definition.slice(0, idx) + "_____" + term.definition.slice(idx + term.term.length);
  const distract = distractorTerms(term, pool, rand, 3);
  if (distract.length < 3) return null;
  const options = shuffle([term.term, ...distract.map((d) => d.term)], rand);
  return {
    ...base(docId, "cloze", n),
    payload: { prompt: blanked, options },
    answerKey: options.indexOf(term.term),
  };
}

export function genMcq(
  term: Term,
  pool: Term[],
  docId: string,
  n: number,
  rand: Rand,
): Exercise | null {
  if (!term.definition) return null;
  const defined = pool.filter((t) => t.definition !== null && t.term !== term.term);
  const unique = [...new Map(defined.map((t) => [t.term.toLowerCase(), t])).values()];
  if (unique.length < 3) return null;
  const distract = pickN(unique, 3, rand);
  const options = shuffle([term.definition, ...distract.map((d) => d.definition!)], rand);
  return {
    ...base(docId, "mcq", n),
    payload: { prompt: `What is ${term.term}?`, options },
    answerKey: options.indexOf(term.definition!),
  };
}
