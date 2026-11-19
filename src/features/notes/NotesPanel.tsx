import { useState, type FormEvent } from "react";
import { Check, ListChecks, Plus, StickyNote, Trash2, X } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import {
  addItem,
  clearDoneItems,
  createNote,
  deleteNote,
  displayTitle,
  notesData,
  removeItem,
  selectNote,
  setKind,
  setText,
  setTitle,
  toggleItem,
  type Note,
} from "./notesStore";

/** Notes tab: several notes, each free text or a checklist. */
export default function NotesPanel(_props: TabPanelProps) {
  const data = notesData.use();
  // No note is shown until one is clicked (each time the notch opens); the
  // list then fills the panel. Clicking the open note again goes back to it.
  const [openId, setOpenId] = useState<string | null>(null);
  const note = openId ? (data.notes.find((n) => n.id === openId) ?? null) : null;

  const open = (id: string) => {
    selectNote(id);
    setOpenId(id);
  };

  if (!note) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex h-8 items-center gap-1.5 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-notch-muted">
            {data.notes.length === 0 ? "Catatan" : `${data.notes.length} catatan`}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOpenId(createNote("text"))}
            className="glass-button flex h-8 items-center justify-center gap-1 rounded-full px-3.5 text-xs font-semibold"
          >
            <Plus size={13} /> Catatan
          </button>
          <button
            type="button"
            onClick={() => setOpenId(createNote("checklist"))}
            className="glass-button flex h-8 items-center justify-center gap-1 rounded-full px-3.5 text-xs font-semibold"
          >
            <ListChecks size={13} /> Checklist
          </button>
        </div>
        {data.notes.length === 0 ? (
          <div className="glass-well flex h-[134px] items-center justify-center rounded-2xl text-sm text-notch-muted">
            Belum ada catatan. Buat catatan atau checklist baru.
          </div>
        ) : (
          <ul className="flex max-h-[200px] flex-col gap-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            {data.notes.map((n) => {
              const remaining = n.kind === "checklist" ? n.items.filter((i) => !i.done).length : 0;
              const preview =
                n.kind === "checklist"
                  ? n.items.length === 0
                    ? "Checklist kosong"
                    : `${remaining} dari ${n.items.length} belum selesai`
                  : n.text.trim().replace(/\s+/g, " ") || "Masih kosong";
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-notch-fg/[0.07]"
                  >
                    {n.kind === "checklist" ? (
                      <ListChecks size={15} className="shrink-0 text-notch-muted" />
                    ) : (
                      <StickyNote size={15} className="shrink-0 text-notch-muted" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold">{displayTitle(n)}</span>
                      <span className="truncate text-[11.5px] text-notch-muted">{preview}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Note list */}
      <div className="flex w-40 shrink-0 flex-col gap-1.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setOpenId(createNote("text"))}
            className="glass-button flex h-8 flex-1 items-center justify-center gap-1 rounded-full text-xs font-semibold"
            data-tip="Catatan teks baru"
          >
            <Plus size={13} /> Catatan
          </button>
          <button
            type="button"
            onClick={() => setOpenId(createNote("checklist"))}
            className="glass-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            aria-label="Checklist baru"
            data-tip="Checklist baru"
          >
            <ListChecks size={14} />
          </button>
        </div>
        <ul className="h-[100px] overflow-y-auto [scrollbar-width:thin]">
          {data.notes.length === 0 && <li className="py-2 text-center text-xs text-notch-muted">Belum ada catatan</li>}
          {data.notes.map((n) => {
            const remaining = n.kind === "checklist" ? n.items.filter((i) => !i.done).length : 0;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => (n.id === openId ? setOpenId(null) : open(n.id))}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
                    n.id === note?.id ? "bg-notch-fg/15 font-semibold" : "text-notch-muted hover:bg-notch-fg/5 hover:text-notch-fg"
                  }`}
                  data-tip-truncated data-tip={displayTitle(n)}
                >
                  {n.kind === "checklist" ? (
                    <ListChecks size={12} className="shrink-0 opacity-70" />
                  ) : (
                    <StickyNote size={12} className="shrink-0 opacity-70" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{displayTitle(n)}</span>
                  {remaining > 0 && <span className="shrink-0 tabular-nums opacity-70">{remaining}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <NoteHeader note={note} onDeleted={() => setOpenId(null)} />
        {note.kind === "text" ? <TextBody note={note} /> : <ChecklistBody note={note} />}
      </div>
    </div>
  );
}

function NoteHeader({ note, onDeleted }: { note: Note; onDeleted: () => void }) {
  const kindButton = (active: boolean) =>
    `flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
      active ? "glass-button text-notch-fg" : "text-notch-muted hover:text-notch-fg"
    }`;
  return (
    <div className="flex items-center gap-2">
      <input
        value={note.title}
        onChange={(e) => setTitle(note.id, e.target.value)}
        placeholder="Judul"
        className="glass-well h-8 min-w-0 flex-1 rounded-full px-3.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-notch-muted"
        aria-label="Judul catatan"
      />
      {/* Text / checklist switch */}
      <div className="glass-well flex shrink-0 rounded-full p-0.5" role="group" aria-label="Jenis catatan">
        <button
          type="button"
          onClick={() => setKind(note.id, "text")}
          className={kindButton(note.kind === "text")}
          aria-pressed={note.kind === "text"}
          data-tip="Teks"
        >
          <StickyNote size={13} />
        </button>
        <button
          type="button"
          onClick={() => setKind(note.id, "checklist")}
          className={kindButton(note.kind === "checklist")}
          aria-pressed={note.kind === "checklist"}
          data-tip="Checklist"
        >
          <ListChecks size={13} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          deleteNote(note.id);
          onDeleted();
        }}
        className="shrink-0 rounded-full p-1.5 text-notch-muted hover:bg-notch-fg/10 hover:text-notch-fg"
        aria-label="Hapus catatan"
        data-tip="Hapus catatan"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TextBody({ note }: { note: Note }) {
  return (
    <textarea
      value={note.text}
      onChange={(e) => setText(note.id, e.target.value)}
      placeholder="Tulis catatan…"
      spellCheck={false}
      className="glass-well h-[100px] resize-none rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed outline-none placeholder:text-notch-muted [scrollbar-width:thin]"
      aria-label="Isi catatan"
    />
  );
}

function ChecklistBody({ note }: { note: Note }) {
  const [draft, setDraft] = useState("");
  const open = note.items.filter((i) => !i.done).length;
  const done = note.items.length - open;
  // Open items first, finished ones after, each group in insertion order.
  const items = [...note.items.filter((i) => !i.done), ...note.items.filter((i) => i.done)];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addItem(note.id, draft);
    setDraft("");
  };

  return (
    <div className="flex h-[100px] flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <form onSubmit={submit} className="glass-well flex min-w-0 flex-1 items-center gap-2 rounded-full px-3">
          <Plus size={13} className="shrink-0 text-notch-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tambah item…"
            maxLength={300}
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-notch-muted"
            aria-label="Item baru"
          />
        </form>
        {note.items.length > 0 && (
          <span className="shrink-0 text-xs text-notch-muted">
            {open} tersisa
            {done > 0 && (
              <button
                type="button"
                onClick={() => clearDoneItems(note.id)}
                className="ml-2 hover:text-notch-fg"
                data-tip="Hapus item yang selesai"
              >
                Bersihkan ({done})
              </button>
            )}
          </span>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {items.length === 0 && <li className="py-2 text-center text-xs text-notch-muted">Belum ada item</li>}
        {items.map((item) => (
          <li key={item.id} className="group flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-notch-fg/5">
            <button
              type="button"
              onClick={() => toggleItem(note.id, item.id)}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                item.done ? "border-notch-accent bg-notch-accent text-white" : "border-notch-fg/40 hover:border-notch-fg"
              }`}
              aria-label={item.done ? `Tandai belum selesai: ${item.text}` : `Tandai selesai: ${item.text}`}
              aria-pressed={item.done}
            >
              {item.done && <Check size={10} strokeWidth={3} />}
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${item.done ? "text-notch-muted line-through" : ""}`}
              data-tip-truncated data-tip={item.text}
            >
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => removeItem(note.id, item.id)}
              className="shrink-0 rounded-md p-0.5 text-notch-muted opacity-0 transition-opacity hover:text-notch-fg group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Hapus: ${item.text}`}
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
