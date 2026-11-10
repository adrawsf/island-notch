import { MicVocal, Music, PictureInPicture2 } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { LyricsView } from "../lyrics/LyricsView";
import { useLyrics } from "../lyrics/useLyrics";
import type { MediaState } from "./mediaBridge";
import { appDisplayName } from "./mediaFormat";
import { iconButton, MediaProgress, TransportButtons } from "./MediaControls";
import { toggleMiniPlayer, useMiniPlayerVisible } from "./miniPlayerBridge";
import { useMedia } from "./useMedia";
import { Artwork } from "./Artwork";

/** Media tab: cover, track info or lyrics, seekable progress and transport controls. */
export default function MediaPanel(_props: TabPanelProps) {
  const media = useMedia();
  const { mediaLyricsOpen } = useSettings();
  const lyrics = useLyrics(media, mediaLyricsOpen);
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
    <div className="flex items-center gap-5">
      <Artwork src={media.artwork} className="h-[84px] w-[84px] shrink-0 rounded-[18px] shadow-lg" iconSize={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {mediaLyricsOpen ? (
          <LyricsView media={media} result={lyrics} className="h-[54px]" />
        ) : (
          <TrackInfo media={media} />
        )}
        <MediaProgress media={media} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="flex items-center gap-1.5">
          <TransportButtons media={media} compact />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={toggleClass(miniPlayerVisible)}
            onClick={toggleMiniPlayer}
            aria-label={miniPlayerVisible ? "Tutup mini player" : "Buka mini player"}
            aria-pressed={miniPlayerVisible}
            title="Mini player"
          >
            <PictureInPicture2 size={14} />
          </button>
          <button
            type="button"
            className={toggleClass(mediaLyricsOpen)}
            onClick={() => updateSetting("mediaLyricsOpen", !mediaLyricsOpen)}
            aria-label={mediaLyricsOpen ? "Tampilkan info lagu" : "Tampilkan lirik"}
            aria-pressed={mediaLyricsOpen}
            title="Lirik (LRCLIB)"
          >
            <MicVocal size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackInfo({ media }: { media: MediaState }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-notch-muted">
        {appDisplayName(media.appId)}
      </div>
      <div className="truncate text-[15px] font-semibold leading-snug" title={media.title}>
        {media.title || "Tanpa judul"}
      </div>
      {media.artist && (
        <div className="truncate text-sm text-notch-muted" title={media.artist}>
          {media.artist}
        </div>
      )}
    </div>
  );
}
