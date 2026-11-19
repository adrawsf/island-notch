/**
 * Notes, Keep-style: each note is either free text or a checklist, and can be
 * switched either way without losing its content.
 */
import { persistedValue } from "../../core/storage/persistedValue";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type NoteKind = "text" | "checklist";

export interface Note {
  id: string;
  title: string;
  kind: NoteKind;
  /** Body of a text note. */
  text: string;
  /** Items of a checklist note. */
  items: ChecklistItem[];
  updatedAt: number;
}

export interface NotesData {
  notes: Note[];
  activeId: string | null;
}

const MAX_TEXT = 20_000;
const MAX_ITEM = 300;

const uid = () => crypto.randomUUID();

function isItem(v: unknown): v is ChecklistItem {
  const i = v as Record<string, unknown> | null;
  return !!i && typeof i.id === "string" && typeof i.text === "string" && typeof i.done === "boolean";
}

/** Repairs a note from disk; null when it is not a note at all. */
function toNote(v: unknown): Note | null {
  const n = v as Record<string, unknown> | null;
  if (!n || typeof n.id !== "string") return null;
  return {
    id: n.id,
    title: typeof n.title === "string" ? n.title : "",
    kind: n.kind === "checklist" ? "checklist" : "text",
    text: typeof n.text === "string" ? n.text : "",
    items: Array.isArray(n.items) ? n.items.filter(isItem) : [],
    updatedAt: typeof n.updatedAt === "number" ? n.updatedAt : 0,
  };
}

function validate(raw: unknown): NotesData | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !Array.isArray(r.notes)) return null;
  const notes = r.notes.map(toNote).filter((n): n is Note => n !== null);
  const activeId = typeof r.activeId === "string" && notes.some((n) => n.id === r.activeId) ? r.activeId : null;
  return { notes, activeId };
}

/**
 * First run after the merge: the old to-do list becomes a "Tugas" checklist
 * and the old single note becomes a text note.
 */
async function migrate(read: (key: string) => Promise<unknown>): Promise<NotesData | null> {
  const notes: Note[] = [];
  const oldTodos = await read("todos");
  if (Array.isArray(oldTodos) && oldTodos.length > 0) {
    const items = oldTodos
      .filter((t): t is { id: string; text: string; done: boolean } => isItem(t))
      .map(({ id, text, done }) => ({ id, text, done }));
    if (items.length > 0) {
      notes.push({ id: uid(), title: "Tugas", kind: "checklist", text: "", items, updatedAt: Date.now() });
    }
  }
  const oldNote = await read("note");
  if (typeof oldNote === "string" && oldNote.trim()) {
    notes.push({ id: uid(), title: "Catatan", kind: "text", text: oldNote, items: [], updatedAt: Date.now() });
  }
  return notes.length > 0 ? { notes, activeId: notes[0].id } : null;
}

export const notesData = persistedValue<NotesData>("notes", { notes: [], activeId: null }, validate, { migrate });

export function activeNote(data: NotesData): Note | null {
  return data.notes.find((n) => n.id === data.activeId) ?? data.notes[0] ?? null;
}

/** Title shown in the list: the title, or the first words of the content. */
export function displayTitle(note: Note): string {
  if (note.title.trim()) return note.title;
  const first = note.kind === "text" ? note.text.split("\n").find((l) => l.trim()) : note.items[0]?.text;
  return first?.trim().slice(0, 40) || "Tanpa judul";
}

function patchNote(id: string, patch: (n: Note) => Partial<Note>) {
  notesData.set((d) => ({
    ...d,
    notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch(n), updatedAt: Date.now() } : n)),
  }));
}

/** Adds an empty note, makes it the active one, and returns its id. */
export function createNote(kind: NoteKind): string {
  const note: Note = { id: uid(), title: "", kind, text: "", items: [], updatedAt: Date.now() };
  notesData.set((d) => ({ notes: [note, ...d.notes], activeId: note.id }));
  return note.id;
}

export function selectNote(id: string): void {
  notesData.set((d) => ({ ...d, activeId: id }));
}

export function deleteNote(id: string): void {
  notesData.set((d) => {
    const notes = d.notes.filter((n) => n.id !== id);
    return { notes, activeId: d.activeId === id ? (notes[0]?.id ?? null) : d.activeId };
  });
}

export function setTitle(id: string, title: string): void {
  patchNote(id, () => ({ title: title.slice(0, 80) }));
}

export function setText(id: string, text: string): void {
  patchNote(id, () => ({ text: text.slice(0, MAX_TEXT) }));
}

/**
 * Switches the note's kind, carrying the content across when the other side
 * is empty: text lines become items, items become lines.
 */
export function setKind(id: string, kind: NoteKind): void {
  patchNote(id, (n) => {
    if (n.kind === kind) return {};
    if (kind === "checklist" && n.items.length === 0) {
      const items = n.text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text) => ({ id: uid(), text: text.slice(0, MAX_ITEM), done: false }));
      return { kind, items };
    }
    if (kind === "text" && !n.text.trim()) {
      return { kind, text: n.items.map((i) => i.text).join("\n") };
    }
    return { kind };
  });
}

export function addItem(id: string, text: string): void {
  const trimmed = text.trim().slice(0, MAX_ITEM);
  if (!trimmed) return;
  patchNote(id, (n) => ({ items: [...n.items, { id: uid(), text: trimmed, done: false }] }));
}

export function toggleItem(id: string, itemId: string): void {
  patchNote(id, (n) => ({ items: n.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }));
}

export function removeItem(id: string, itemId: string): void {
  patchNote(id, (n) => ({ items: n.items.filter((i) => i.id !== itemId) }));
}

export function clearDoneItems(id: string): void {
  patchNote(id, (n) => ({ items: n.items.filter((i) => !i.done) }));
}
