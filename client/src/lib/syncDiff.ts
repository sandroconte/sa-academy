import type { Manifest } from "./types";

function pairsOf(m: Manifest | null): Map<string, string> {
  return new Map((m?.docs ?? []).map((d) => [d.id, d.sha256]));
}

export function diffManifest(prev: Manifest | null, next: Manifest): string[] {
  const before = pairsOf(prev);
  const files: string[] = [];
  for (const d of next.docs) {
    if (before.get(d.id) !== d.sha256) {
      files.push(d.file, d.exercisesFile);
    }
  }
  return files;
}

export function filesToRemove(prev: Manifest | null, next: Manifest): string[] {
  const nextIds = new Set(next.docs.map((d) => d.id));
  return (prev?.docs ?? []).filter((d) => !nextIds.has(d.id)).map((d) => d.id);
}
