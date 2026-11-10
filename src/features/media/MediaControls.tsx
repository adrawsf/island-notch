/** Progress bar and transport buttons, shared by the Media tab and the mini player. */
import { useRef, useState, type PointerEvent } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { mediaControl, mediaSeek, type MediaState } from "./mediaBridge";
import { formatDuration } from "./mediaFormat";
import { useMediaPosition } from "./useMedia";

/** How long a seek target is shown before trusting SMTC's position again. */
const SEEK_HOLD_MS = 1500;

export function MediaProgress({ media, showTimes = true }: { media: MediaState; showTimes?: boolean }) {
  const live = useMediaPosition(media);
  const barRef = useRef<HTMLDivElement>(null);
  const [seek, setSeek] = useState<{ positionMs: number; at: number } | null>(null);

  const holding = seek !== null && Date.now() - seek.at < SEEK_HOLD_MS;
  const position = holding ? seek.positionMs : live;
  const ratio = media.durationMs > 0 ? Math.min(1, position / media.durationMs) : 0;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!media.canSeek || !barRef.current) return;
    e.stopPropagation(); // not a window drag
    const rect = barRef.current.getBoundingClientRect();
    const target = ((e.clientX - rect.left) / rect.width) * media.durationMs;
    setSeek({ positionMs: target, at: Date.now() });
    mediaSeek(target);
  };

  if (media.durationMs <= 0) return null;

  return (
    <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-notch-muted">
      {showTimes && <span className="w-9 text-right">{formatDuration(position)}</span>}
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        className={`relative h-4 flex-1 ${media.canSeek ? "cursor-pointer" : ""}`}
        role="slider"
        aria-label="Posisi pemutaran"
        aria-valuemin={0}
        aria-valuemax={media.durationMs}
        aria-valuenow={Math.round(position)}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-notch-fg/15">
          <div className="h-full rounded-full bg-notch-fg" style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>
      {showTimes && <span className="w-9">{formatDuration(media.durationMs)}</span>}
    </div>
  );
}

export const iconButton =
  "flex items-center justify-center rounded-full transition-colors disabled:opacity-30 hover:bg-notch-fg/10";

/** Previous / play-pause / next. `compact` for the mini player. */
export function TransportButtons({ media, compact = false }: { media: MediaState; compact?: boolean }) {
  const side = compact ? "h-8 w-8" : "h-9 w-9";
  const main = compact ? "h-9 w-9" : "h-11 w-11";
  const sideIcon = compact ? 16 : 18;
  const mainIcon = compact ? 18 : 20;
  return (
    <>
      <button
        type="button"
        className={`${iconButton} ${side}`}
        disabled={!media.canPrevious}
        onClick={() => mediaControl("previous")}
        aria-label="Sebelumnya"
      >
        <SkipBack size={sideIcon} fill="currentColor" />
      </button>
      <button
        type="button"
        className={`${iconButton} ${main} glass-button`}
        disabled={!media.canPlayPause}
        onClick={() => mediaControl("playPause")}
        aria-label={media.isPlaying ? "Jeda" : "Putar"}
      >
        {media.isPlaying ? <Pause size={mainIcon} fill="currentColor" /> : <Play size={mainIcon} fill="currentColor" />}
      </button>
      <button
        type="button"
        className={`${iconButton} ${side}`}
        disabled={!media.canNext}
        onClick={() => mediaControl("next")}
        aria-label="Berikutnya"
      >
        <SkipForward size={sideIcon} fill="currentColor" />
      </button>
    </>
  );
}
