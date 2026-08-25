export interface RepoSource {
  repo: string; // "owner/name"
  paths?: string[]; // subpaths to scan (repo root if omitted)
  path?: string; // single subpath (lectures case)
  kind: "patterns" | "lectures";
}

export interface SubjectConfig {
  id: string;
  name: string;
  sources: RepoSource[];
  curriculum: {
    modules: { id: string; title: string; rules: string[] }[];
    extraModuleTitle: string;
  };
}

export interface SubjectsConfig {
  subjects: SubjectConfig[];
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "ordered-list"
  | "code"
  | "image"
  | "table"
  | "blockquote";

export interface Block {
  type: BlockType;
  level?: number; // heading level
  text?: string; // paragraph/blockquote/heading text
  items?: string[]; // list items
  lang?: string; // code language
  value?: string; // code content
  url?: string; // image url
  alt?: string; // image alt
  rows?: string[][]; // table rows
}

export interface Term {
  term: string;
  definition: string | null; // defining sentence containing the term, if found
}

export interface ParsedDoc {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string; // source folder or "lectures"
  title: string;
  slug: string;
  readingMin: number;
  blocks: Block[];
  sections: { title: string }[];
  terms: Term[];
}

export type ExerciseType = "cloze" | "mcq" | "matching" | "truefalse" | "ordering";

export interface Exercise {
  id: string;
  type: ExerciseType;
  payload: Record<string, unknown>;
  answerKey: number | number[] | boolean;
}

export interface ModuleRef {
  id: string;
  subjectId: string;
  title: string;
  position: number;
}

export interface ModuleDocRef {
  moduleId: string;
  docId: string;
  position: number;
}

export interface ManifestDocEntry {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string;
  title: string;
  file: string;
  exercisesFile: string;
  sha256: string;
}

export interface Manifest {
  version: Record<string, string>; // repo label -> commit sha
  subjects: { id: string; name: string }[];
  docs: ManifestDocEntry[];
  modules: ModuleRef[];
  moduleDocs: ModuleDocRef[];
}

export interface RepoInput {
  label: string; // "patterns" | "lectures"
  url: string; // owner/name
  localDir: string; // cloned checkout
  sha: string;
  sources: RepoSource[];
}
