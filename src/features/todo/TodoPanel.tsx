import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { addTodo, clearDone, removeTodo, sortForDisplay, todos, toggleTodo } from "./todoStore";

/** To-do tab: add with Enter, tick to finish, trash to delete. */
export default function TodoPanel(_props: TabPanelProps) {
  const list = todos.use();
  const [draft, setDraft] = useState("");
  const open = list.filter((t) => !t.done).length;
  const done = list.length - open;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addTodo(draft);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <form onSubmit={submit} className="glass-well flex min-w-0 flex-1 items-center gap-2 rounded-full px-3.5">
          <Plus size={15} className="shrink-0 text-notch-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tambah tugas…"
            maxLength={300}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-notch-muted"
            aria-label="Tugas baru"
          />
        </form>
        {list.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 text-xs text-notch-muted">
            <span>{open} tersisa</span>
            {done > 0 && (
              <button type="button" onClick={clearDone} className="hover:text-notch-fg" title="Hapus tugas yang selesai">
                Bersihkan ({done})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Two columns: the list uses the width instead of growing downward. */}
      <ul className="grid max-h-[104px] grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto [scrollbar-width:thin]">
        {list.length === 0 && (
          <li className="col-span-2 py-2 text-center text-sm text-notch-muted">Belum ada tugas</li>
        )}
        {sortForDisplay(list).map((todo) => (
          <li key={todo.id} className="group flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-notch-fg/5">
            <button
              type="button"
              onClick={() => toggleTodo(todo.id)}
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                todo.done ? "border-notch-accent bg-notch-accent text-white" : "border-notch-fg/40 hover:border-notch-fg"
              }`}
              aria-label={todo.done ? `Tandai belum selesai: ${todo.text}` : `Tandai selesai: ${todo.text}`}
              aria-pressed={todo.done}
            >
              {todo.done && <Check size={12} strokeWidth={3} />}
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${todo.done ? "text-notch-muted line-through" : ""}`}
              title={todo.text}
            >
              {todo.text}
            </span>
            <button
              type="button"
              onClick={() => removeTodo(todo.id)}
              className="shrink-0 rounded-md p-1 text-notch-muted opacity-0 transition-opacity hover:text-notch-fg group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Hapus: ${todo.text}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

    </div>
  );
}
