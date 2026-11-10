import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Maximize2, MicVocal, Minimize2, Music, SlidersHorizontal, X } from "lucide-react";
import { updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { useResolvedTheme } from "../shared/useResolvedTheme";
import { Artwork } from "../features/media/Artwork";
import { iconButton, MediaProgress, TransportButtons } from "../features/media/MediaControls";
import { mediaControl } from "../features/media/mediaBridge";
import { hideMiniPlayer } from "../features/media/miniPlayerBridge";
import { useMedia } from "../features/media/useMedia";
import { LyricsSettings } from "../features/lyrics/LyricsControls";
import { LyricsPair } from "../features/lyrics/LyricsPair";
import { LyricsView } from "../features/lyrics/LyricsView";
import { useLyrics } from "../features/lyrics/useLyrics";

/** Elements that handle their own pointer input instead of dragging the window. */
const INTERACTIVE = "button, [role='slider']";
/** Transparent margin around the card so the glass shadow is not clipped (px, each side). */
const MARGIN = 8;
/** Card width per layout (CSS px); the window is sized to the card. */
const CARD_WIDTH = { full: 400, compact: 300 } as const;

/**
 * Floating card. Full: cover, title, progress, controls, the whole lyrics
 * scrolling with the current line highlighted, and lyrics settings (source,
 * timing). Compact: cover plus the current and next line, wrapped so nothing
 * is cut off; clicking the cover plays/pauses. Drag anywhere else to move.
 * The window is sized to the card, keeping its bottom-right corner.
 */
export function MiniPlayer() {
  const media = useMedia();
  const settings = useSettings();
  const theme = useResolvedTheme(settings.theme);
  const compact = settings.miniPlayerCompact;
  // Compact mode exists to show lyrics, so it always fetches them.
  const lyrics = useLyrics(media, settings.miniPlayerLyrics || compact);
  const synced = lyrics.status === "found" && lyrics.lyrics.synced ? lyrics.lyrics : null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cardWidth = compact ? CARD_WIDTH.compact : CARD_WIDTH.full;

  // Fit the window to the card.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !isTauri()) return;
    let last = "";
    const fit = () => {
      const width = Math.ceil(card.offsetWidth + MARGIN * 2);
      const height = Math.ceil(card.offsetHeight + MARGIN * 2);
      const key = `${width}x${height}`;
      if (key === last) return;
      last = key;
      invoke("mini_player_fit", { width, height }).catch((err) => console.error("[miniplayer] fit", err));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE) || !isTauri()) return;
    getCurrentWindow()
      .startDragging()
      .catch((err) => console.error("[miniplayer] drag", err));
  };

  return (
    <div style={{ padding: MARGIN, width: "max-content" }}>
      <div
        ref={cardRef}
        data-theme={theme}
        onPointerDown={onPointerDown}
        style={{ width: cardWidth }}
        className={`glass group relative flex flex-col overflow-hidden text-notch-fg ${
          compact ? "rounded-[22px] p-2" : "gap-2.5 rounded-[26px] p-3"
        }`}
      >
        <div
          className={`absolute z-10 flex gap-0.5 rounded-full bg-[rgb(var(--glass-tint)/0.92)] p-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
            compact ? "right-1 top-1/2 -translate-y-1/2 flex-col" : "right-2 top-2"
          }`}
        >
          <button
            type="button"
            onClick={() => updateSetting("miniPlayerCompact", !compact)}
            className={`${iconButton} h-6 w-6 text-notch-muted`}
            aria-label={compact ? "Tampilan penuh" : "Tampilan ringkas"}
            data-tip={compact ? "Tampilan penuh" : "Ringkas: cover + lirik"}
          >
            {compact ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
          <button
            type="button"
            onClick={hideMiniPlayer}
            className={`${iconButton} h-6 w-6 text-notch-muted`}
            aria-label="Tutup mini player"
          >
            <X size={14} />
          </button>
        </div>

        {media.active && compact ? (
          <div className="flex items-center gap-3 pr-7">
            <button
              type="button"
              onClick={() => mediaControl("playPause")}
              disabled={!media.canPlayPause}
              className="shrink-0 rounded-[14px] transition-transform active:scale-95"
              aria-label={media.isPlaying ? "Jeda" : "Putar"}
              data-tip={media.isPlaying ? "Klik untuk jeda" : "Klik untuk putar"}
            >
              <Artwork
                src={media.artwork}
                className={`h-14 w-14 rounded-[14px] shadow-md transition-opacity ${media.isPlaying ? "" : "opacity-50"}`}
                iconSize={20}
              />
            </button>
            <div className="min-w-0 flex-1">
              {synced ? (
                <LyricsPair media={media} lyrics={synced} />
              ) : (
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold leading-5" data-tip-truncated data-tip={media.title}>
                    {media.title || "Tanpa judul"}
                  </div>
                  <div className="truncate text-xs leading-5 text-notch-muted">
                    {lyrics.status === "loading" ? "Mencari lirik…" : media.artist}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : media.active ? (
          <>
            <div className="flex items-center gap-3 pr-14">
              <Artwork src={media.artwork} className="h-16 w-16 shrink-0 rounded-[14px] shadow-md" iconSize={22} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold leading-tight" data-tip-truncated data-tip={media.title}>
                  {media.title || "Tanpa judul"}
                </div>
                {media.artist && (
                  <div className="truncate text-xs text-notch-muted" data-tip-truncated data-tip={media.artist}>
                    {media.artist}
                  </div>
                )}
              </div>
            </div>

            <MediaProgress media={media} />

            <div className="relative flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => updateSetting("miniPlayerLyrics", !settings.miniPlayerLyrics)}
                className={`${iconButton} absolute left-0 h-7 w-7 ${
                  settings.miniPlayerLyrics ? "glass-button text-notch-fg" : "text-notch-muted"
                }`}
                aria-pressed={settings.miniPlayerLyrics}
                aria-label={settings.miniPlayerLyrics ? "Sembunyikan lirik" : "Tampilkan lirik"}
                data-tip="Lirik"
              >
                <MicVocal size={14} />
              </button>
              <TransportButtons media={media} compact />
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className={`${iconButton} absolute right-0 h-7 w-7 ${settingsOpen ? "glass-button text-notch-fg" : "text-notch-muted"}`}
                aria-pressed={settingsOpen}
                aria-label="Pengaturan lirik"
                data-tip="Sumber & timing lirik"
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>

            {settings.miniPlayerLyrics && (
              <div className="glass-well rounded-2xl px-4 py-1">
                <LyricsView media={media} result={lyrics} className="h-[220px]" />
              </div>
            )}

            {settingsOpen && (
              <div className="glass-well rounded-2xl px-3.5 py-3">
                <LyricsSettings media={media} result={lyrics} />
              </div>
            )}
          </>
        ) : (
          <div
            className={`flex items-center justify-center gap-2 text-sm text-notch-muted ${compact ? "h-14 pr-7" : "h-[88px]"}`}
          >
            <Music size={18} strokeWidth={1.8} />
            Tidak ada media yang diputar
          </div>
        )}
      </div>
    </div>
  );
}
