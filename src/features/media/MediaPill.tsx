import { AnimatePresence, motion } from "framer-motion";
import type { Lyrics } from "../lyrics/lrclib";
import { currentLineIndex } from "../lyrics/lyricsText";
import { useLyrics } from "../lyrics/useLyrics";
import type { MediaState } from "./mediaBridge";
import { useMediaPosition } from "./useMedia";
import { Artwork } from "./Artwork";

interface MediaPillProps {
  media: MediaState;
  /** Show the current synced lyric line instead of the title while playing. */
  showLyrics: boolean;
  onClick: () => void;
}

/** Collapsed-notch content while media is active: cover, title or lyric, equalizer. */
export function MediaPill({ media, showLyrics, onClick }: MediaPillProps) {
  const lyrics = useLyrics(media, showLyrics);
  const synced = lyrics.status === "found" && lyrics.lyrics.synced ? lyrics.lyrics : null;
  const showingLyrics = synced !== null && media.isPlaying;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sedang diputar: ${media.title}`}
      // Hugs the title; a fixed width while lyrics scroll so the outline does
      // not breathe on every line.
      className={`flex h-8 items-center gap-2.5 pl-1.5 pr-3.5 text-left ${showingLyrics ? "w-[300px]" : "min-w-[190px] max-w-[320px]"}`}
    >
      <Artwork src={media.artwork} className="h-[22px] w-[22px] shrink-0 rounded-full" iconSize={12} />
      <span className="relative min-w-0 flex-1 overflow-hidden text-[12px] font-semibold">
        {showingLyrics ? <LyricLine media={media} lyrics={synced} /> : <TitleLine media={media} />}
      </span>
      <Equalizer playing={media.isPlaying} />
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
  const position = useMediaPosition(media, 200);
  const index = currentLineIndex(lyrics.lines, position);
  const text = index >= 0 ? lyrics.lines[index].text : "";

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

function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={`flex h-3.5 shrink-0 items-end gap-[2px] ${playing ? "eq-playing" : ""}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="eq-bar w-[3px] rounded-full bg-notch-accent" />
      ))}
    </span>
  );
}
