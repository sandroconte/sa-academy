import { createHash } from "node:crypto";
import { generateExercises } from "./exercises/generate.js";
import type {
  Exercise,
  Manifest,
  ManifestDocEntry,
  ModuleDocRef,
  ModuleRef,
  ParsedDoc,
  SubjectConfig,
} from "./types.js";

export function docToId(subjectId: string, kind: "pattern" | "lecture", slug: string): string {
  return `${subjectId}-${kind}-${slug}`;
}

export interface BuiltPack {
  manifest: Manifest;
  files: Record<string, string>; // relative path -> json content
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function buildPack(
  docs: ParsedDoc[],
  modules: ModuleRef[],
  moduleDocs: ModuleDocRef[],
  subject: SubjectConfig,
  version: Record<string, string>,
): BuiltPack {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const files: Record<string, string> = {};
  const entries: ManifestDocEntry[] = [];

  for (const doc of sorted) {
    const exercises: Exercise[] = generateExercises(doc);
    const docPath = `docs/${doc.id}.json`;
    const exPath = `exercises/${doc.id}.json`;
    const docJson = JSON.stringify(doc, null, 2) + "\n";
    const exJson = JSON.stringify({ docId: doc.id, items: exercises }, null, 2) + "\n";
    files[docPath] = docJson;
    files[exPath] = exJson;
    entries.push({
      id: doc.id,
      subjectId: doc.subjectId,
      kind: doc.kind,
      category: doc.category,
      title: doc.title,
      file: docPath,
      exercisesFile: exPath,
      sha256: sha256(docJson),
    });
  }

  const manifest: Manifest = {
    version,
    subjects: [{ id: subject.id, name: subject.name }],
    docs: entries,
    modules: [...modules].sort((a, b) => a.position - b.position),
    moduleDocs: [...moduleDocs].sort(
      (a, b) => a.moduleId.localeCompare(b.moduleId) || a.position - b.position,
    ),
  };
  files["manifest.json"] = JSON.stringify(manifest, null, 2) + "\n";
  return { manifest, files };
}
