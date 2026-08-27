import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const CORE_DDL = `
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL,
  title TEXT NOT NULL, slug TEXT NOT NULL, reading_min INTEGER NOT NULL,
  blocks_json TEXT NOT NULL, sections_json TEXT NOT NULL, terms_json TEXT NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS modules(
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, title TEXT NOT NULL, position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS module_docs(
  module_id TEXT NOT NULL, doc_id TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY(module_id, doc_id));
CREATE TABLE IF NOT EXISTS exercises(
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, type TEXT NOT NULL,
  payload_json TEXT NOT NULL, answer_key TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS exercises_doc ON exercises(doc_id);
CREATE TABLE IF NOT EXISTS progress(
  doc_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'unread',
  percent REAL NOT NULL DEFAULT 0, last_read_at INTEGER, read_marked_at INTEGER);
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, block_index INTEGER NOT NULL,
  section_title TEXT NOT NULL, quote TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notes_doc ON notes(doc_id);
CREATE INDEX IF NOT EXISTS notes_doc_block ON notes(doc_id, block_index);
CREATE TABLE IF NOT EXISTS attempts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id TEXT NOT NULL, doc_id TEXT NOT NULL,
  correct INTEGER NOT NULL, answered_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const FTS_DDL = `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  doc_id UNINDEXED, title, headings, body, terms, tokenize='porter unicode61');`;

let ftsAvailable = true;

/**
 * The expo-sqlite web (wasm) build ships without FTS5; native builds have it.
 * We probe once at open time so search degrades gracefully instead of crashing.
 */
export function isFtsAvailable(): boolean {
  return ftsAvailable;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("sa-academy.db")
      .then(async (db) => {
        await db.execAsync(CORE_DDL);
        try {
          await db.execAsync(FTS_DDL);
          ftsAvailable = true;
        } catch {
          ftsAvailable = false;
        }
        return db;
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}

export async function getSyncState(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key=?", [key]);
  return row?.value ?? null;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO sync_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, value]);
}
