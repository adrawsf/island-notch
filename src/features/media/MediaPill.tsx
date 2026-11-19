import { useEffect, useRef, useState, type WheelEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Lyrics } from "../lyrics/types";
import { useRomanized } from "../lyrics/romanize";
import { useLyricLineIndex, useLyrics } from "../lyrics/useLyrics";
import type { MediaState } from "./mediaBridge";
import { Artwork } from "./Artwork";
import { stepAppVolume, useAppVolume, VOLUME_STEP } from "./volume";
import { volumeIcon } from "./VolumeControl";
import { stepMaster, type Level } from "../sound/mixerBridge";

/** How long the volume level stays in the pill after the last wheel step. */
const VOLUME_FLASH_MS = 1200;

interface MediaPillProps {
  media: MediaState;
  /** Show the current synced lyric line instead of the title while playing. */
  showLyrics: boolean;
  onClick: () => void;
  /** The wheel changed the volume: the notch should stay collapsed. */
  onWheelVolume?: () => void;
}

/** Collapsed-notch content while media is active: cover plus title or the current lyric line. */
export function MediaPill({ media, showLyrics, onClick, onWheelVolume }: MediaPillProps) {
  const lyrics = useLyrics(media, showLyrics);
  const synced = lyrics.status === "found" && lyrics.lyrics.synced && (!media.tabOnly || media.timelineEstimated) ? lyrics.lyrics : null;
  const showingLyrics = synced !== null && media.isPlaying;
  const volume = useAppVolume(media);
  const [flash, setFlash] = useState(false);
  // No audio session found for the player: the wheel changes the master volume.
  const [master, setMasterLevel] = useState<Level | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Wheel over the pill: volume up/down, the level shows for a moment.
  const onWheel = (e: WheelEvent) => {
    if (e.deltaY === 0) return;
    onWheelVolume?.();
    const delta = e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP;
    if (volume) stepAppVolume(delta);
    else stepMaster(delta).then((level) => level && setMasterLevel(level));
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), VOLUME_FLASH_MS);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onWheel={onWheel}
      aria-label={`Sedang diputar: ${media.title}`}
      // Hugs its text: the notch widens and narrows with each lyric line (the
      // shell springs between the measured widths); very long lines truncate.
      className="flex h-8 min-w-[96px] max-w-[380px] items-center gap-2.5 pl-1.5 pr-4 text-left"
    >
      <Artwork src={media.artwork} className="h-[22px] w-[22px] shrink-0 rounded-full" iconSize={12} />
      <span className="relative min-w-0 flex-1 overflow-hidden text-[12px] font-semibold">
        {flash && (volume ?? master) ? (
          <VolumeLine volume={(volume ?? master)!.volume} muted={(volume ?? master)!.muted} />
        ) : showingLyrics ? (
          <LyricLine media={media} lyrics={synced} />
        ) : (
          <TitleLine media={media} />
        )}
      </span>
    </button>
  );
}

/** The volume level in place of the title while the wheel is in use. */
export function VolumeLine({ volume, muted }: { volume: number; muted: boolean }) {
  const Icon = volumeIcon(volume, muted);
  const percent = muted ? 0 : Math.round(volume * 100);
  return (
    <span className="flex items-center gap-2">
      <Icon size={13} className="shrink-0" />
      <span className="relative h-1 w-24 overflow-hidden rounded-full bg-notch-fg/20">
        <span className="absolute inset-y-0 left-0 rounded-full bg-notch-fg" style={{ width: `${percent}%` }} />
      </span>
      <span className="w-8 tabular-nums">{percent}%</span>
    </span>
  );
}

function TitleLine({ media }: { media: MediaState }) {
  return (
    <span className="block truncate">
      {media.title}
      {media.artist && <span className="font-normal text-notch-muted"> · {media.artist}</span>}
    </span>
  );
}

/** Current lyric line; falls back to the title before the first line and in gaps. */
function LyricLine({ media, lyrics }: { media: MediaState; lyrics: Lyrics }) {
  const index = useLyricLineIndex(media, lyrics.lines);
  const romanized = useRomanized(lyrics);
  // One line only: the romanization replaces the original when there is one.
  const text = index >= 0 ? (romanized?.[index] ?? lyrics.lines[index].text) : "";

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={text ? `line-${index}` : "title"}
        className="block"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
      >
        {text ? <span className="block truncate">{text}</span> : <TitleLine media={media} />}
      </motion.span>
    </AnimatePresence>
  );
}
