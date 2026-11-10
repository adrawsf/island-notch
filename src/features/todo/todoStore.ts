import { persistedValue } from "../../core/storage/persistedValue";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

const MAX_TEXT = 300;

function isTodo(v: unknown): v is Todo {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.text === "string" &&
    typeof t.done === "boolean" &&
    typeof t.createdAt === "number"
  );
}

/** Invalid entries are dropped instead of discarding the whole list. */
export const todos = persistedValue<Todo[]>("todos", [], (raw) =>
  Array.isArray(raw) ? raw.filter(isTodo) : null,
);

export function addTodo(text: string): void {
  const trimmed = text.trim().slice(0, MAX_TEXT);
  if (!trimmed) return;
  const todo: Todo = { id: crypto.randomUUID(), text: trimmed, done: false, createdAt: Date.now() };
  todos.set((list) => [...list, todo]);
}

export function toggleTodo(id: string): void {
  todos.set((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
}

export function removeTodo(id: string): void {
  todos.set((list) => list.filter((t) => t.id !== id));
}

export function clearDone(): void {
  todos.set((list) => list.filter((t) => !t.done));
}

/** Open items first (oldest first), then finished ones. */
export function sortForDisplay(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);
}
