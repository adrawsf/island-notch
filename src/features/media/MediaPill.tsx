import { AnimatePresence, motion } from "framer-motion";
import type { Lyrics } from "../lyrics/types";
import { currentLineIndex } from "../lyrics/lyricsText";
import { useRomanized } from "../lyrics/romanize";
import { useLyricPosition, useLyrics } from "../lyrics/useLyrics";
import type { MediaState } from "./mediaBridge";
import { Artwork } from "./Artwork";

interface MediaPillProps {
  media: MediaState;
  /** Show the current synced lyric line instead of the title while playing. */
  showLyrics: boolean;
  onClick: () => void;
}

/** Collapsed-notch content while media is active: cover plus title or the current lyric line. */
export function MediaPill({ media, showLyrics, onClick }: MediaPillProps) {
  const lyrics = useLyrics(media, showLyrics);
  const synced = lyrics.status === "found" && lyrics.lyrics.synced && !media.tabOnly ? lyrics.lyrics : null;
  const showingLyrics = synced !== null && media.isPlaying;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sedang diputar: ${media.title}`}
      // Hugs its text: the notch widens and narrows with each lyric line (the
      // shell springs between the measured widths); very long lines truncate.
      className="flex h-8 min-w-[96px] max-w-[380px] items-center gap-2.5 pl-1.5 pr-4 text-left"
    >
      <Artwork src={media.artwork} className="h-[22px] w-[22px] shrink-0 rounded-full" iconSize={12} />
      <span className="relative min-w-0 flex-1 overflow-hidden text-[12px] font-semibold">
        {showingLyrics ? <LyricLine media={media} lyrics={synced} /> : <TitleLine media={media} />}
      </span>
    </button>
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
  const position = useLyricPosition(media);
  const romanized = useRomanized(lyrics);
  const index = currentLineIndex(lyrics.lines, position);
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
