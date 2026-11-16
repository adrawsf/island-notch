import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Pin, PinOff, ScanText, Search, Trash2, X } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { prettyShortcut } from "../../shared/format";
import {
  applyEntry,
  clearHistory,
  deleteEntry,
  pinEntry,
  startOcrSnip,
  useClipboardHistory,
  useThumbnail,
  type ClipboardEntry,
} from "./clipboardBridge";
import { relativeTime, sourceLabel } from "./labels";

/** Clipboard tab: what was copied (click to paste it again) and OCR from the screen. */
export default function ClipboardPanel({ requestClose }: TabPanelProps) {
  const settings = useSettings();
  const [query, setQuery] = useState("");
  const entries = useClipboardHistory(query);
  const pinned = entries.filter((e) => e.pinned);
  const recent = entries.filter((e) => !e.pinned);

  const snip = () => {
    requestClose();
    startOcrSnip();
  };

  const use = (entry: ClipboardEntry) => {
    if (settings.clipboardAutoPaste) requestClose();
    applyEntry(entry.id, settings.clipboardAutoPaste).catch((err) => console.error("[clipboard] paste", err));
  };

  const ocrTip = settings.ocrShortcutEnabled
    ? `Ambil teks dari layar (${prettyShortcut(settings.ocrShortcut)})`
    : "Ambil teks dari layar";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <label className="glass-well flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3">
          <Search size={13} className="shrink-0 text-notch-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Cari di riwayat…"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-notch-muted"
            aria-label="Cari di riwayat clipboard"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 text-notch-muted hover:text-notch-fg"
              aria-label="Hapus pencarian"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={snip}
          className="glass-button flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"
          data-tip={ocrTip}
        >
          <ScanText size={14} /> Ambil teks
        </button>
        <ClearButton disabled={recent.length === 0} />
      </div>

      <ul className="h-[176px] overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {!settings.clipboardHistory ? (
          <li className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-notch-muted">
            Riwayat clipboard dimatikan.
            <button
              type="button"
              onClick={() => updateSetting("clipboardHistory", true)}
              className="glass-button rounded-full px-3 py-1 text-xs font-semibold text-notch-fg"
            >
              Nyalakan
            </button>
          </li>
        ) : entries.length === 0 ? (
          <li className="flex h-full items-center justify-center px-6 text-center text-xs text-notch-muted">
            {query ? "Tidak ada yang cocok." : "Belum ada yang disalin. Salin apa saja (Ctrl+C), nanti muncul di sini."}
          </li>
        ) : (
          <>
            {pinned.length > 0 && <SectionLabel>Disematkan</SectionLabel>}
            {pinned.map((e) => (
              <Row key={e.id} entry={e} onUse={use} />
            ))}
            {pinned.length > 0 && recent.length > 0 && <SectionLabel>Terbaru</SectionLabel>}
            {recent.map((e) => (
              <Row key={e.id} entry={e} onUse={use} />
            ))}
          </>
        )}
      </ul>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <li className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-notch-muted">{children}</li>
  );
}

/** Two clicks: the first asks, the second clears (pinned items stay). */
function ClearButton({ disabled }: { disabled: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          clearHistory();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
      className={`flex h-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors disabled:opacity-40 ${
        armed ? "bg-red-500/80 px-3 text-white" : "w-8 text-notch-muted hover:bg-notch-fg/10 hover:text-notch-fg"
      }`}
      aria-label="Hapus riwayat"
      data-tip={armed ? undefined : "Hapus riwayat (yang disematkan tetap)"}
    >
      {armed ? "Hapus semua?" : <Trash2 size={14} />}
    </button>
  );
}

function Row({ entry, onUse }: { entry: ClipboardEntry; onUse: (entry: ClipboardEntry) => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copyOnly = () => {
    applyEntry(entry.id, false)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1200);
      })
      .catch((err) => console.error("[clipboard] copy", err));
  };

  const meta = [
    sourceLabel(entry.source),
    relativeTime(entry.createdAt),
    entry.kind === "image" ? `${entry.width}×${entry.height}` : entry.chars > 120 ? `${entry.chars.toLocaleString("id-ID")} karakter` : "",
  ].filter(Boolean);

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onUse(entry)}
        className="flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-1.5 pr-24 text-left transition-colors hover:bg-notch-fg/[0.07]"
      >
        {entry.kind === "text" ? (
          <span className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-snug">{entry.preview.trim()}</span>
        ) : (
          <Thumbnail id={entry.id} />
        )}
        <span className="truncate text-[11px] text-notch-muted">{meta.join(" · ")}</span>
      </button>
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <ActionButton label={copied ? "Disalin" : "Salin saja"} onClick={copyOnly}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </ActionButton>
        <ActionButton label={entry.pinned ? "Lepas sematan" : "Sematkan"} onClick={() => pinEntry(entry.id, !entry.pinned)}>
          {entry.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </ActionButton>
        <ActionButton label="Hapus" onClick={() => deleteEntry(entry.id)}>
          <X size={13} />
        </ActionButton>
      </div>
      {entry.pinned && (
        <Pin size={11} className="pointer-events-none absolute right-2.5 top-2.5 text-notch-accent group-hover:hidden" aria-hidden />
      )}
    </li>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-button flex h-6 w-6 items-center justify-center rounded-full"
      aria-label={label}
      data-tip={label}
    >
      {children}
    </button>
  );
}

function Thumbnail({ id }: { id: number }) {
  const src = useThumbnail(id);
  return src ? (
    <img src={src} alt="" className="h-14 max-w-[220px] self-start rounded-lg object-cover" draggable={false} />
  ) : (
    <span className="h-14 w-24 rounded-lg bg-notch-fg/10" aria-hidden />
  );
}
