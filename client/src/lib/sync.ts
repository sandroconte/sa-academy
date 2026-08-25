import { PACK_BASE } from "./config";
import { getDb, getSyncState, setSyncState } from "./db";
import { diffManifest, filesToRemove, mergeFailedIntoPrev } from "./syncDiff";
import type { Exercise, Manifest, ManifestDoc, PackDoc } from "./types";

export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

async function fetchJson<T>(file: string, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(`${PACK_BASE}/${file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  return JSON.parse(await res.text()) as T;
}

export interface SyncResult { ok: boolean; changed: number; failed: number; stale: boolean }

export async function syncContent(fetchImpl: FetchLike = fetch): Promise<SyncResult> {
  let manifest: Manifest;
  try {
    manifest = await fetchJson<Manifest>("manifest.json", fetchImpl);
  } catch {
    return { ok: false, changed: 0, failed: 0, stale: true };
  }

  let prev: Manifest | null = null;
  const prevRaw = await getSyncState("manifest");
  if (prevRaw) {
    try {
      prev = JSON.parse(prevRaw) as Manifest;
    } catch {
      prev = null; // corrupt cache → full resync
    }
  }

  const filesSet = new Set(diffManifest(prev, manifest));

  // Phase 1 — fetch everything OUTSIDE the db transaction (no lock across network).
  interface Group { meta: ManifestDoc; doc: PackDoc; exercises: Exercise[] }
  const groups: Group[] = [];
  const failedIds = new Set<string>();
  for (const meta of manifest.docs) {
    if (!filesSet.has(meta.file)) continue;
    try {
      const doc = await fetchJson<PackDoc>(meta.file, fetchImpl);
      const ex = await fetchJson<{ docId: string; items: Exercise[] }>(meta.exercisesFile, fetchImpl);
      groups.push({ meta, doc, exercises: ex.items }); // both payloads present before any write
    } catch (e) {
      console.warn(`skip ${meta.id}:`, (e as Error).message);
      failedIds.add(meta.id);
    }
  }

  // Phase 2 — single short write transaction (writes only).
  const db = await getDb();
  const saved = mergeFailedIntoPrev(prev, manifest, failedIds);
  await db.withTransactionAsync(async () => {
    for (const id of filesToRemove(prev, manifest)) await removeDoc(db, id);
    for (const g of groups) {
      await upsertDoc(db, g.doc, g.meta.sha256);
      await replaceExercises(db, g.doc.id, g.exercises);
    }
    await db.runAsync("DELETE FROM modules");
    for (const m of manifest.modules)
      await db.runAsync("INSERT INTO modules(id,subject_id,title,position) VALUES(?,?,?,?)",
        [m.id, m.subjectId, m.title, m.position]);
    await db.runAsync("DELETE FROM module_docs");
    for (const md of manifest.moduleDocs)
      await db.runAsync("INSERT INTO module_docs(module_id,doc_id,position) VALUES(?,?,?)",
        [md.moduleId, md.docId, md.position]);
    await setSyncState("manifest", JSON.stringify(saved));
  });

  return { ok: true, changed: groups.length, failed: failedIds.size, stale: false };
}

type Db = Awaited<ReturnType<typeof getDb>>;

async function removeDoc(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM documents WHERE id=?", [id]);
  await db.runAsync("DELETE FROM exercises WHERE doc_id=?", [id]);
  await db.runAsync("DELETE FROM search_index WHERE doc_id=?", [id]);
  await db.runAsync("DELETE FROM module_docs WHERE doc_id=?", [id]);
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
