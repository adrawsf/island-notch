import { useState } from "react";
import { MicVocal, Music, PictureInPicture2, SlidersHorizontal } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { LyricsSettings } from "../lyrics/LyricsControls";
import { LyricsView } from "../lyrics/LyricsView";
import { useLyrics } from "../lyrics/useLyrics";
import type { MediaState } from "./mediaBridge";
import { appDisplayName } from "./mediaFormat";
import { iconButton, MediaProgress, TransportButtons } from "./MediaControls";
import { toggleMiniPlayer, useMiniPlayerVisible } from "./miniPlayerBridge";
import { useMedia } from "./useMedia";
import { Artwork } from "./Artwork";

/**
 * Media tab. Cover on the left, the centre is only the lyrics (or the track
 * details when lyrics are off), controls on the right. Progress runs along
 * the bottom, and lyrics settings open below it only when asked for.
 */
export default function MediaPanel({ requestClose }: TabPanelProps) {
  const media = useMedia();
  const { mediaLyricsOpen } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lyrics = useLyrics(media, mediaLyricsOpen || settingsOpen);
  const miniPlayerVisible = useMiniPlayerVisible();

  if (!media.active) {
    return (
      <div className="flex items-center justify-center gap-2 py-5 text-notch-muted">
        <Music size={18} strokeWidth={1.8} />
        <span className="text-sm">Tidak ada media yang diputar</span>
      </div>
    );
  }

  const toggleClass = (on: boolean) =>
    `${iconButton} h-7 w-7 ${on ? "glass-button text-notch-fg" : "text-notch-muted"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-5">
        <Artwork src={media.artwork} className="h-[84px] w-[84px] shrink-0 rounded-[18px] shadow-lg" iconSize={28} />

        <div className="min-w-0 flex-1">
          {mediaLyricsOpen ? (
            <div className="flex flex-col gap-1">
              <TrackLine media={media} />
              <LyricsView media={media} result={lyrics} className="h-[62px]" />
            </div>
          ) : (
            <TrackInfo media={media} />
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            <TransportButtons media={media} compact />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={toggleClass(mediaLyricsOpen)}
              onClick={() => updateSetting("mediaLyricsOpen", !mediaLyricsOpen)}
              aria-label={mediaLyricsOpen ? "Tampilkan info lagu" : "Tampilkan lirik"}
              aria-pressed={mediaLyricsOpen}
              data-tip="Lirik"
            >
              <MicVocal size={14} />
            </button>
            <button
              type="button"
              className={toggleClass(settingsOpen)}
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Pengaturan lirik"
              aria-pressed={settingsOpen}
              data-tip="Sumber & timing lirik"
            >
              <SlidersHorizontal size={14} />
            </button>
            <button
              type="button"
              className={toggleClass(miniPlayerVisible)}
              onClick={() => {
                toggleMiniPlayer();
                // Opening it hands the music over: the notch goes back to idle.
                if (!miniPlayerVisible) requestClose();
              }}
              aria-label={miniPlayerVisible ? "Tutup mini player" : "Buka mini player"}
              aria-pressed={miniPlayerVisible}
              data-tip="Mini player"
            >
              <PictureInPicture2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <MediaProgress media={media} />

      {settingsOpen && (
        <div className="glass-well rounded-2xl px-3.5 py-3">
          <LyricsSettings media={media} result={lyrics} />
        </div>
      )}
    </div>
  );
}

/** One compact line above the lyrics: title, then artist. */
function TrackLine({ media }: { media: MediaState }) {
  return (
    <div className="min-w-0 truncate text-[12px] leading-4" data-tip-truncated data-tip={`${media.title} · ${media.artist}`}>
      <span className="font-semibold">{media.title || "Tanpa judul"}</span>
      {media.artist && <span className="text-notch-muted"> · {media.artist}</span>}
    </div>
  );
}

function TrackInfo({ media }: { media: MediaState }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-notch-muted">
        {appDisplayName(media.appId)}
      </div>
      <div className="truncate text-[15px] font-semibold leading-snug" data-tip-truncated data-tip={media.title}>
        {media.title || "Tanpa judul"}
      </div>
      {media.artist && (
        <div className="truncate text-sm text-notch-muted" data-tip-truncated data-tip={media.artist}>
          {media.artist}
        </div>
      )}
    </div>
  );
}
