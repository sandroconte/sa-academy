import { PACK_BASE } from "./config";
import { getDb, getSyncState, setSyncState } from "./db";
import { diffManifest, filesToRemove } from "./syncDiff";
import type { Exercise, Manifest, PackDoc } from "./types";

export interface FetchLike { (url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }> }

async function fetchJson<T>(file: string, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(`${PACK_BASE}/${file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  return JSON.parse(await res.text()) as T;
}

export interface SyncResult { ok: boolean; changed: number; stale: boolean }

export async function syncContent(fetchImpl: FetchLike = fetch): Promise<SyncResult> {
  let manifest: Manifest;
  try {
    manifest = await fetchJson<Manifest>("manifest.json", fetchImpl);
  } catch {
    return { ok: false, changed: 0, stale: true };
  }
  const prevRaw = await getSyncState("manifest");
  const prev: Manifest | null = prevRaw ? (JSON.parse(prevRaw) as Manifest) : null;
  const files = diffManifest(prev, manifest);

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const id of filesToRemove(prev, manifest)) await removeDoc(db, id);
    for (const file of files) {
      try {
        if (file.startsWith("docs/")) {
          const doc = await fetchJson<PackDoc>(file, fetchImpl);
          const meta = manifest.docs.find((d) => d.file === file)!;
          await upsertDoc(db, doc, meta.sha256);
          const ex = await fetchJson<{ docId: string; items: Exercise[] }>(
            manifest.docs.find((d) => d.id === doc.id)!.exercisesFile, fetchImpl,
          );
          await replaceExercises(db, ex.docId, ex.items);
        }
      } catch (e) {
        console.warn(`skip ${file}:`, (e as Error).message);
      }
    }
    await db.runAsync("DELETE FROM modules");
    for (const m of manifest.modules)
      await db.runAsync("INSERT INTO modules(id,subject_id,title,position) VALUES(?,?,?,?)",
        [m.id, m.subjectId, m.title, m.position]);
    await db.runAsync("DELETE FROM module_docs");
    for (const md of manifest.moduleDocs)
      await db.runAsync("INSERT INTO module_docs(module_id,doc_id,position) VALUES(?,?,?)",
        [md.moduleId, md.docId, md.position]);
    await setSyncState("manifest", JSON.stringify(manifest));
  });
  return { ok: true, changed: files.length / 2, stale: false };
}

type Db = Awaited<ReturnType<typeof getDb>>;

async function removeDoc(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM documents WHERE id=?", [id]);
  await db.runAsync("DELETE FROM exercises WHERE doc_id=?", [id]);
  await db.runAsync("DELETE FROM search_index WHERE doc_id=?", [id]);
}

async function upsertDoc(db: Db, doc: PackDoc, sha256: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO documents(id,subject_id,kind,category,title,slug,reading_min,blocks_json,sections_json,terms_json,sha256)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET subject_id=excluded.subject_id, kind=excluded.kind, category=excluded.category,
       title=excluded.title, slug=excluded.slug, reading_min=excluded.reading_min, blocks_json=excluded.blocks_json,
       sections_json=excluded.sections_json, terms_json=excluded.terms_json, sha256=excluded.sha256`,
    [doc.id, doc.subjectId, doc.kind, doc.category, doc.title, doc.slug, doc.readingMin,
     JSON.stringify(doc.blocks), JSON.stringify(doc.sections), JSON.stringify(doc.terms), sha256],
  );
  const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => b.text ?? "").join(" ");
  const body = doc.blocks.filter((b) => b.type === "paragraph").map((b) => b.text ?? "").join(" ");
  const terms = doc.terms.map((t) => `${t.term} ${t.definition ?? ""}`).join(" ");
  await db.runAsync("DELETE FROM search_index WHERE doc_id=?", [doc.id]);
  await db.runAsync("INSERT INTO search_index(doc_id,title,headings,body,terms) VALUES(?,?,?,?,?)",
    [doc.id, doc.title, headings, body, terms]);
}

async function replaceExercises(db: Db, docId: string, items: Exercise[]): Promise<void> {
  await db.runAsync("DELETE FROM exercises WHERE doc_id=?", [docId]);
  for (const it of items)
    await db.runAsync("INSERT INTO exercises(id,doc_id,type,payload_json,answer_key) VALUES(?,?,?,?,?)",
      [it.id, docId, it.type, JSON.stringify(it.payload), JSON.stringify(it.answerKey)]);
}
