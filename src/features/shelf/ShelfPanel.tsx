import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Copy, File, FolderOpen, Hand, Inbox, Link2, Type, X } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { showToast } from "../../core/toast/toastQueue";
import {
  addText,
  clearShelf,
  copyItem,
  dragOut,
  formatSize,
  onShelfDrag,
  openItem,
  removeItems,
  revealItem,
  useShelf,
  useThumb,
  type ShelfItem,
} from "./shelfBridge";

/** How far the pointer moves with the button held before it counts as a drag. */
const DRAG_THRESHOLD_PX = 5;

/**
 * Starts a drag out of the notch once the pointer moves far enough with the
 * button held; a press without movement stays a click.
 */
function useDragStart(ids: () => string[]) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  return {
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const s = start.current;
        if (!s || (e.buttons & 1) === 0) {
          start.current = null;
          return;
        }
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD_PX) return;
        start.current = null;
        dragged.current = true;
        dragOut(ids());
      },
      onPointerUp: () => {
        start.current = null;
      },
    },
    /** The press became a drag: skip the click that may follow. */
    wasDrag: () => {
      const d = dragged.current;
      dragged.current = false;
      return d;
    },
  };
}

/** Shelf tab: things dropped on the notch, ready to be dragged out again. */
export default function ShelfPanel(_props: TabPanelProps) {
  const items = useShelf();
  const [dragging, setDragging] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const files = (items ?? []).filter((i) => i.kind === "file" && i.exists);
  const all = useDragStart(() => files.map((f) => f.id));

  useEffect(() => onShelfDrag(setDragging), []);

  // Ctrl+V while the tab is open adds the copied text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text?.trim()) addText(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  if (items === null) return <div className="h-[150px]" />;

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex h-7 items-center gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-notch-muted">
          {items.length === 0 ? "Shelf kosong" : `${items.length} item`}
        </span>
        <span className="flex-1" />
        {files.length > 1 && (
          <button
            type="button"
            {...all.handlers}
            className="glass-button flex h-7 cursor-grab items-center gap-1.5 rounded-full px-3 text-xs font-semibold active:cursor-grabbing"
            data-tip="Tarik untuk memindahkan semua file sekaligus"
          >
            <Hand size={13} />
            Tarik semua ({files.length})
          </button>
        )}
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true);
              setConfirmClear(false);
              clearShelf();
            }}
            className={`flex h-7 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
              confirmClear ? "bg-red-500/85 text-white" : "glass-button"
            }`}
            data-tip="File aslinya tidak ikut terhapus"
          >
            {confirmClear ? "Yakin? Klik lagi" : "Kosongkan"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          className={`flex h-[150px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-center transition-colors ${
            dragging ? "border-notch-accent bg-notch-accent/10" : "border-notch-fg/15"
          }`}
        >
          <Inbox size={24} className={dragging ? "text-notch-accent" : "text-notch-muted"} />
          <span className="text-[13px] font-semibold">{dragging ? "Lepaskan di sini" : "Tarik file, teks, atau link ke notch"}</span>
          <span className="text-[11px] text-notch-muted">
            Disimpan sampai kamu hapus. Tarik keluar lagi ke aplikasi mana saja, atau tekan Ctrl+V untuk menempel teks.
          </span>
        </div>
      ) : (
        <ul className="grid max-h-[212px] grid-cols-5 gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          {items.map((item) => (
            <Tile key={item.id} item={item} />
          ))}
        </ul>
      )}

      {dragging && items.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-notch-accent bg-notch-bg/80 text-[13px] font-semibold backdrop-blur-sm">
          Lepaskan untuk menaruh di Shelf
        </div>
      )}
    </div>
  );
}

function Tile({ item }: { item: ShelfItem }) {
  const drag = useDragStart(() => [item.id]);
  const isFile = item.kind === "file";
  const missing = isFile && !item.exists;

  const report = (error: string | null, fallback: string) => {
    if (error) showToast({ title: fallback, body: error, durationMs: 5000 });
  };

  const onClick = async () => {
    if (drag.wasDrag() || missing) return;
    if (item.kind === "text") {
      report(await copyItem(item.id), "Gagal menyalin");
      showToast({ title: "Teks disalin" });
    } else {
      report(await openItem(item.id), "Tidak bisa dibuka");
    }
  };

  const title = isFile ? item.name : item.kind === "link" ? item.value : `${item.value.length} karakter`;
  const tip = isFile
    ? `${item.value}${item.exists && !item.isDir ? ` · ${formatSize(item.size)}` : ""}${missing ? " · file sudah dipindah atau dihapus" : ""}`
    : item.kind === "link"
      ? `${item.value} · klik untuk membuka`
      : "Klik untuk menyalin";

  return (
    <li className="group relative">
      <button
        type="button"
        {...drag.handlers}
        onClick={onClick}
        className={`flex h-[100px] w-full select-none flex-col items-center gap-1.5 rounded-xl px-1.5 pb-1.5 pt-2 text-center transition-colors hover:bg-notch-fg/[0.07] ${
          missing ? "opacity-45" : "cursor-grab active:cursor-grabbing"
        }`}
        data-tip={tip}
        draggable={false}
      >
        <TileVisual item={item} />
        <span className="line-clamp-2 w-full break-all text-[11px] leading-tight">{title}</span>
      </button>
      {missing && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-red-500/85 px-1.5 text-[9.5px] font-semibold text-white">
          Hilang
        </span>
      )}
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {isFile && item.exists && (
          <TileAction tip="Tampilkan di Explorer" onClick={async () => report(await revealItem(item.id), "Tidak bisa dibuka")}>
            <FolderOpen size={11} />
          </TileAction>
        )}
        {!isFile && (
          <TileAction
            tip="Salin"
            onClick={async () => {
              const error = await copyItem(item.id);
              report(error, "Gagal menyalin");
              if (!error) showToast({ title: item.kind === "link" ? "Link disalin" : "Teks disalin" });
            }}
          >
            <Copy size={11} />
          </TileAction>
        )}
        <TileAction tip="Hapus dari Shelf" onClick={() => removeItems([item.id])}>
          <X size={11} />
        </TileAction>
      </div>
    </li>
  );
}

function TileAction({ tip, onClick, children }: { tip: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded-full bg-notch-bg/85 text-notch-muted shadow hover:text-notch-fg"
      aria-label={tip}
      data-tip={tip}
    >
      {children}
    </button>
  );
}

function TileVisual({ item }: { item: ShelfItem }) {
  const thumb = useThumb(item.kind === "file" && item.exists ? item.value : null);
  if (item.kind === "file") {
    if (thumb) {
      return <img src={thumb} alt="" className="h-12 w-14 shrink-0 object-contain" draggable={false} />;
    }
    return (
      <span className="flex h-12 w-14 shrink-0 items-center justify-center text-notch-muted">
        {item.isDir ? <FolderOpen size={30} strokeWidth={1.5} /> : <File size={30} strokeWidth={1.5} />}
      </span>
    );
  }
  if (item.kind === "link") {
    let host = item.value;
    try {
      host = new URL(item.value).hostname.replace(/^www\./, "");
    } catch {
      // Not a full URL: show it as is.
    }
    return (
      <span className="flex h-12 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-sky-400/10 text-sky-400">
        <Link2 size={18} />
        <span className="max-w-full truncate px-1 text-[10px] font-semibold">{host}</span>
      </span>
    );
  }
  return (
    <span className="flex h-12 w-full shrink-0 items-start gap-1 overflow-hidden rounded-lg bg-notch-fg/[0.06] p-1.5 text-left text-[9.5px] leading-tight text-notch-muted">
      <Type size={10} className="mt-px shrink-0" />
      <span className="line-clamp-3">{item.value}</span>
    </span>
  );
}
