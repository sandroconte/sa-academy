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

/** Merge failed doc ids back to their previous manifest entries so the next
 *  sync still sees them as dirty (retry), while succeeded ones take the new entry. */
export function mergeFailedIntoPrev(prev: Manifest | null, next: Manifest, failedIds: Set<string>): Manifest {
  const prevById = new Map((prev?.docs ?? []).map((d) => [d.id, d]));
  const docs = next.docs.flatMap((d) => {
    if (!failedIds.has(d.id)) return [d];
    const old = prevById.get(d.id);
    return old ? [old] : []; // failed & previously absent → omit so it stays "new" next sync
  });
  return { ...next, docs };
}
