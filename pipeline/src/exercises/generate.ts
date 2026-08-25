import { fnv1a32, mulberry32, type Rand } from "./rng.js";
import { genCloze, genMcq } from "./cloze.js";
import { genMatching } from "./matching.js";
import { genTrueFalse } from "./truefalse.js";
import { genOrdering } from "./ordering.js";
import { orderedSteps } from "../parse.js";
import type { Exercise, ParsedDoc } from "../types.js";

const CAPS: Record<Exercise["type"], number> = {
  cloze: 4,
  mcq: 3,
  truefalse: 3,
  matching: 1,
  ordering: 1,
};
const TOTAL_CAP = 12;
const MIN_DEF_LEN = 25;

export function generateExercises(doc: ParsedDoc): Exercise[] {
  const seed = fnv1a32(`${doc.id}|${doc.title}|${doc.terms.length}`);
  const rand = mulberry32(seed);
  const defined = doc.terms.filter(
    (t) => t.definition !== null && t.definition.length >= MIN_DEF_LEN,
  );
  const out: Exercise[] = [];

  const countType = (type: Exercise["type"]): number =>
    out.filter((e) => e.type === type).length;

  const push = (type: Exercise["type"], make: (rand: Rand) => Exercise | Exercise[] | null): void => {
    if (out.length >= TOTAL_CAP || countType(type) >= CAPS[type]) return;
    const made = make(rand);
    const list = made === null ? [] : Array.isArray(made) ? made : [made];
    for (const ex of list) {
      if (out.length >= TOTAL_CAP || countType(type) >= CAPS[type]) break;
      const stem = JSON.stringify(ex.payload).slice(0, 160);
      if (out.some((e) => JSON.stringify(e.payload).slice(0, 160) === stem)) continue;
      out.push(ex);
    }
  };

  // deterministic term order: seeded shuffle
  const shuffledDefined = [...defined].sort(() => rand() - 0.5);

  for (const term of shuffledDefined) {
    push("cloze", (r) => genCloze(term, doc.terms, doc.id, countType("cloze"), r));
  }
  for (const term of shuffledDefined) {
    push("mcq", (r) => genMcq(term, doc.terms, doc.id, countType("mcq"), r));
  }
  push("matching", (r) => genMatching(doc.terms, doc.id, r));
  push("truefalse", (r) => genTrueFalse(doc.terms, doc.id, r));
  const stepsList = orderedSteps(doc.blocks);
  if (stepsList.length > 0) push("ordering", (r) => genOrdering(stepsList[0]!, doc.id, r));

  return out.sort((a, b) => a.id.localeCompare(b.id));
}
