import type { Exercise } from "./types";

export function grade(ex: Exercise, answer: number | boolean | number[]): boolean {
  switch (ex.type) {
    case "cloze":
    case "mcq":
      return answer === ex.answerKey;
    case "truefalse":
      return answer === ex.answerKey;
    case "matching":
    case "ordering": {
      const key = ex.answerKey;
      if (!Array.isArray(answer) || !Array.isArray(key)) return false;
      return answer.length === key.length && answer.every((v, i) => v === key[i]);
    }
  }
}
