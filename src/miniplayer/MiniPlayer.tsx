import type { PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { Music, X } from "lucide-react";
import { useSettings } from "../core/settings/useSettings";
import { useResolvedTheme } from "../shared/useResolvedTheme";
import { Artwork } from "../features/media/Artwork";
import { iconButton, MediaProgress, TransportButtons } from "../features/media/MediaControls";
import { hideMiniPlayer } from "../features/media/miniPlayerBridge";
import { useMedia } from "../features/media/useMedia";

/** Elements that handle their own pointer input instead of dragging the window. */
const INTERACTIVE = "button, [role='slider']";

/** Floating card: cover, title, progress and controls. Drag anywhere else to move. */
export function MiniPlayer() {
  const media = useMedia();
  const { theme: themeMode } = useSettings();
  const theme = useResolvedTheme(themeMode);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE) || !isTauri()) return;
    getCurrentWindow()
      .startDragging()
      .catch((err) => console.error("[miniplayer] drag", err));
  };

  return (
    // The window has an 8px transparent margin so the glass shadow is not clipped.
    <div className="h-full w-full p-2">
      <div
        data-theme={theme}
        onPointerDown={onPointerDown}
        className="glass group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-[26px] p-3 text-notch-fg"
      >
        <button
          type="button"
          onClick={hideMiniPlayer}
          className={`${iconButton} absolute right-2 top-2 h-6 w-6 text-notch-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100`}
          aria-label="Tutup mini player"
        >
          <X size={14} />
        </button>

        {media.active ? (
          <>
            <Artwork src={media.artwork} className="h-24 w-24 shrink-0 rounded-[18px] shadow-md" iconSize={28} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold leading-tight" title={media.title}>
                  {media.title || "Tanpa judul"}
                </div>
                {media.artist && <div className="truncate text-xs text-notch-muted">{media.artist}</div>}
              </div>
              <MediaProgress media={media} showTimes={false} />
              <div className="flex items-center justify-center gap-2">
                <TransportButtons media={media} compact />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-notch-muted">
            <Music size={18} strokeWidth={1.8} />
            Tidak ada media yang diputar
          </div>
        )}
      </div>
    </div>
  );
}
