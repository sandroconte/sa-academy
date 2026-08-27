import { getDb } from "./db";
import { groupNotesByBlock } from "./highlights";
import type { Note } from "./types";

interface NoteRow {
  id: string;
  doc_id: string;
  block_index: number;
  section_title: string;
  quote: string;
  start: number;
  end: number;
  created_at: number;
  updated_at: number;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    docId: r.doc_id,
    blockIndex: r.block_index,
    sectionTitle: r.section_title,
    quote: r.quote,
    start: r.start,
    end: r.end,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Insert a note, or return the existing one if (doc, block, quote) already exists. */
export async function addNote(input: {
  docId: string;
  blockIndex: number;
  sectionTitle: string;
  quote: string;
  start: number;
  end: number;
}): Promise<Note> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM notes WHERE doc_id=? AND block_index=? AND quote=?",
    [input.docId, input.blockIndex, input.quote],
  );
  if (existing) {
    const row = await db.getFirstAsync<NoteRow>("SELECT * FROM notes WHERE id=?", [existing.id]);
    return rowToNote(row!);
  }
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO notes(id, doc_id, block_index, section_title, quote, start, end, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [id, input.docId, input.blockIndex, input.sectionTitle, input.quote, input.start, input.end, now, now],
  );
  return {
    id,
    docId: input.docId,
    blockIndex: input.blockIndex,
    sectionTitle: input.sectionTitle,
    quote: input.quote,
    start: input.start,
    end: input.end,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listNotes(docId?: string): Promise<(Note & { docTitle: string })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow & { doc_title: string }>(
    `SELECT n.*, d.title AS doc_title FROM notes n
     JOIN documents d ON d.id = n.doc_id
     ${docId ? "WHERE n.doc_id=?" : ""}
     ORDER BY n.created_at DESC`,
    docId ? [docId] : [],
  );
  return rows.map((r) => ({ ...rowToNote(r), docTitle: r.doc_title }));
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM notes WHERE id=?", [id]);
}

export async function getNotesByBlock(docId: string): Promise<Map<number, Note[]>> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow>(
    "SELECT * FROM notes WHERE doc_id=? ORDER BY block_index",
    [docId],
  );
  return groupNotesByBlock(rows.map(rowToNote));
}
