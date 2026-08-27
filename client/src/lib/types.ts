export interface ManifestDoc {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string;
  title: string;
  file: string;
  exercisesFile: string;
  sha256: string;
}

export interface ManifestModule {
  id: string;
  subjectId: string;
  title: string;
  position: number;
}

export interface Manifest {
  version: Record<string, string>;
  subjects: { id: string; name: string }[];
  docs: ManifestDoc[];
  modules: ManifestModule[];
  moduleDocs: { moduleId: string; docId: string; position: number }[];
}

export type BlockType =
  | "heading" | "paragraph" | "list" | "ordered-list"
  | "code" | "image" | "table" | "blockquote";

export interface Block {
  type: BlockType;
  level?: number;
  text?: string;
  items?: string[];
  lang?: string;
  value?: string;
  url?: string;
  alt?: string;
  rows?: string[][];
}

export interface PackDoc {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string;
  slug: string;
  title: string;
  readingMin: number;
  blocks: Block[];
  sections: { title: string }[];
  terms: { term: string; definition: string | null }[];
}

export type ExerciseType = "cloze" | "mcq" | "matching" | "truefalse" | "ordering";

export interface Exercise {
  id: string;
  type: ExerciseType;
  payload: Record<string, unknown>;
  answerKey: number | number[] | boolean;
}

/** Titles generated from filenames lack spaces: "corruption-layer-pattern". */
export function displayTitle(title: string): string {
  return title.includes(" ") ? title : title.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export interface Note {
  id: string;
  docId: string;
  blockIndex: number;
  sectionTitle: string;
  quote: string;
  start: number;
  end: number;
  createdAt: number;
  updatedAt: number;
}
