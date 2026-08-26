import { getDb, isFtsAvailable } from "./db";
import type { Block, Exercise, ExerciseType, PackDoc } from "./types";
import type { DocStatus } from "./progress";

export interface DocRow {
  id: string; subjectId: string; kind: "pattern" | "lecture"; category: string;
  title: string; slug: string; readingMin: number;
  blocksJson: string; sectionsJson: string; status: DocStatus; percent: number;
}

function toDoc(r: DocRow): PackDoc & { status: DocStatus; percent: number } {
  return {
    id: r.id, subjectId: r.subjectId, kind: r.kind, category: r.category, slug: r.slug,
    title: r.title, readingMin: r.readingMin,
    blocks: JSON.parse(r.blocksJson) as Block[],
    sections: JSON.parse(r.sectionsJson) as { title: string }[],
    terms: [],
    status: r.status, percent: r.percent,
  };
}

const DOC_SELECT = `SELECT d.id, d.subject_id AS subjectId, d.kind, d.category, d.title, d.slug,
  d.reading_min AS readingMin, d.blocks_json AS blocksJson, d.sections_json AS sectionsJson,
  COALESCE(p.status,'unread') AS status, COALESCE(p.percent,0) AS percent
  FROM documents d LEFT JOIN progress p ON p.doc_id=d.id`;

export async function getDocsByIds(ids: string[]): Promise<(PackDoc & { status: DocStatus; percent: number })[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.getAllAsync<DocRow>(
    `${DOC_SELECT} WHERE d.id IN (${placeholders})`,
    ids,
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.map(toDoc).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

export async function getAllDocs(kind?: "pattern" | "lecture"): Promise<(PackDoc & { status: DocStatus; percent: number })[]> {
  const db = await getDb();
  const rows = kind
    ? await db.getAllAsync<DocRow>(`${DOC_SELECT} WHERE d.kind=? ORDER BY d.title`, [kind])
    : await db.getAllAsync<DocRow>(`${DOC_SELECT} ORDER BY d.title`);
  return rows.map(toDoc);
}

export async function getModules(): Promise<{ id: string; subjectId: string; title: string; position: number; docIds: string[] }[]> {
  const db = await getDb();
  const mods = await db.getAllAsync<{ id: string; subject_id: string; title: string; position: number }>(
    "SELECT * FROM modules ORDER BY position");
  const links = await db.getAllAsync<{ module_id: string; doc_id: string; position: number }>(
    "SELECT * FROM module_docs ORDER BY position");
  return mods.map((m) => ({
    id: m.id, subjectId: m.subject_id, title: m.title, position: m.position,
    docIds: links.filter((l) => l.module_id === m.id).sort((a, b) => a.position - b.position).map((l) => l.doc_id),
  }));
}

export async function getExercisesForDoc(docId: string): Promise<(Exercise & { docId: string })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; doc_id: string; type: ExerciseType; payload_json: string; answer_key: string }>(
    "SELECT * FROM exercises WHERE doc_id=?", [docId]);
  return rows.map((r) => ({ id: r.id, docId: r.doc_id, type: r.type, payload: JSON.parse(r.payload_json), answerKey: JSON.parse(r.answer_key) }));
}

export async function setStatus(docId: string, status: DocStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO progress(doc_id,status,percent,last_read_at,read_marked_at)
     VALUES(?, ?, ?, strftime('%s','now')*1000,
            CASE WHEN ?='read' THEN strftime('%s','now')*1000 END)
     ON CONFLICT(doc_id) DO UPDATE SET
       status=excluded.status,
       percent=CASE WHEN excluded.status='read' THEN 100 ELSE progress.percent END,
       read_marked_at=excluded.read_marked_at`,
    [docId, status, status === "read" ? 100 : 0, status],
  );
}

export async function markModuleDocs(moduleId: string, status: DocStatus): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ doc_id: string }>(
    "SELECT doc_id FROM module_docs WHERE module_id=? ORDER BY position",
    [moduleId],
  );
  for (const r of rows) await setStatus(r.doc_id, status);
}

export async function setPercent(docId: string, percent: number): Promise<void> {
  const db = await getDb();
  const clamped = Math.max(0, Math.min(100, percent));
  await db.runAsync(
    `INSERT INTO progress(doc_id,status,percent,last_read_at)
     VALUES(?,?,?,strftime('%s','now')*1000)
     ON CONFLICT(doc_id) DO UPDATE SET
       percent=MAX(progress.percent, excluded.percent),
       status=CASE WHEN excluded.percent>=95 THEN 'read'
                   WHEN progress.status='read' THEN 'read'
                   WHEN excluded.percent>0 THEN 'reading'
                   ELSE progress.status END,
       last_read_at=excluded.last_read_at`,
    [docId, clamped >= 95 ? "read" : clamped > 0 ? "reading" : "unread", clamped],
  );
}

export async function recordAttempt(exerciseId: string, docId: string, correct: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO attempts(exercise_id,doc_id,correct,answered_at) VALUES(?,?,?,?)",
    [exerciseId, docId, correct ? 1 : 0, Date.now()]);
}

export async function searchDocs(ftsQuery: string, limit = 30): Promise<{ docId: string; snippet: string }[]> {
  if (!ftsQuery || !isFtsAvailable()) return [];
  const db = await getDb();
  return db.getAllAsync<{ docId: string; snippet: string }>(
    `SELECT doc_id AS docId, snippet(search_index, 3, '<b>', '</b>', '…', 24) AS snippet
     FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT ?`,
    [ftsQuery, limit],
  );
}

export async function getMissedExerciseIds(limit = 50): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ exercise_id: string }>(
    `SELECT exercise_id FROM attempts WHERE correct=0
     GROUP BY exercise_id HAVING MAX(answered_at) ORDER BY MAX(answered_at) DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => r.exercise_id);
}

export async function getExercisesByIds(ids: string[]): Promise<(Exercise & { docId: string })[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.getAllAsync<{ id: string; doc_id: string; type: ExerciseType; payload_json: string; answer_key: string }>(
    `SELECT * FROM exercises WHERE id IN (${placeholders})`,
    ids,
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .map((r) => ({ id: r.id, docId: r.doc_id, type: r.type, payload: JSON.parse(r.payload_json), answerKey: JSON.parse(r.answer_key) }))
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
