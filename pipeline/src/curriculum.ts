import type { ModuleDocRef, ModuleRef, ParsedDoc, SubjectConfig } from "./types.js";

export function assignModules(
  docs: ParsedDoc[],
  subject: SubjectConfig,
): { modules: ModuleRef[]; moduleDocs: ModuleDocRef[] } {
  const declared: ModuleRef[] = subject.curriculum.modules.map((m, i) => ({
    id: m.id,
    subjectId: subject.id,
    title: m.title,
    position: i,
  }));
  const extraId = `${subject.id}-extra`;

  const buckets = new Map<string, ParsedDoc[]>(declared.map((m) => [m.id, []]));
  const extraBucket: ParsedDoc[] = [];

  for (const doc of docs) {
    if (doc.kind !== "pattern") continue;
    const hay = `${doc.slug} ${doc.title}`.toLowerCase();
    const mod =
      subject.curriculum.modules.find((m) => m.rules.some((r) => hay.includes(r)))?.id ?? null;
    if (mod === null) extraBucket.push(doc);
    else buckets.get(mod)!.push(doc);
  }

  const modules: ModuleRef[] = [];
  const moduleDocs: ModuleDocRef[] = [];

  const flush = (ref: ModuleRef, bucket: ParsedDoc[]): void => {
    if (bucket.length === 0) return;
    modules.push(ref);
    bucket
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .forEach((doc, i) => moduleDocs.push({ moduleId: ref.id, docId: doc.id, position: i }));
  };

  declared.forEach((ref) => flush(ref, buckets.get(ref.id)!));
  flush(
    {
      id: extraId,
      subjectId: subject.id,
      title: subject.curriculum.extraModuleTitle,
      position: declared.length,
    },
    extraBucket,
  );

  return { modules, moduleDocs };
}
