import type { TabPanelProps } from "../../app/tabs/types";
import { persistedValue } from "../../core/storage/persistedValue";

const MAX_LENGTH = 20_000;

/** One quick note, saved as you type. */
export const note = persistedValue<string>("note", "", (raw) => (typeof raw === "string" ? raw : null));

export default function NotesPanel(_props: TabPanelProps) {
  const text = note.use();
  return (
    <div className="relative">
      <textarea
        value={text}
        onChange={(e) => note.set(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="Tulis catatan cepat…"
        spellCheck={false}
        className="glass-well block h-[100px] w-full resize-none rounded-2xl px-4 pb-6 pt-3.5 text-sm leading-relaxed outline-none placeholder:text-notch-muted [scrollbar-width:thin]"
        aria-label="Catatan"
      />
      <div className="pointer-events-none absolute bottom-1.5 right-3.5 text-[10px] text-notch-muted">
        {text.length > 0 ? `${text.length.toLocaleString("id-ID")} karakter · tersimpan otomatis` : "Tersimpan otomatis"}
      </div>
    </div>
  );
}
