import { AnimatePresence, motion } from "framer-motion";
import type { MediaState } from "../media/mediaBridge";
import type { Lyrics } from "./types";
import { useLyricLineIndex } from "./useLyrics";
import { useRomanized } from "./romanize";

/**
 * The line being sung and the next one. Long lines wrap instead of being cut
 * off, so the block grows with the text (the mini player window follows).
 * Before the first line it shows the first line as "next".
 */
export function LyricsPair({ media, lyrics }: { media: MediaState; lyrics: Lyrics }) {
  const index = useLyricLineIndex(media, lyrics.lines);
  const romanized = useRomanized(lyrics);
  const current = index >= 0 ? lyrics.lines[index].text : "";
  const currentRoma = index >= 0 ? romanized?.[index] : null;
  const nextIndex = lyrics.lines.findIndex((l, i) => i > index && l.text);
  const next = nextIndex >= 0 ? lyrics.lines[nextIndex].text : "";
  const nextRoma = nextIndex >= 0 ? romanized?.[nextIndex] : null;

  return (
    <div className="min-h-[40px]" aria-live="polite">
      {/* "wait": the old pair leaves before the new one enters, so the block's
          height is always that of the visible text. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="break-words text-[14px] font-semibold leading-5">{current || "♪"}</div>
          {currentRoma && <div className="break-words text-[12px] leading-4 text-notch-fg/70">{currentRoma}</div>}
          {next && <div className="mt-0.5 break-words text-[12px] leading-[18px] text-notch-muted">{next}</div>}
          {nextRoma && <div className="break-words text-[11px] leading-4 text-notch-fg/45">{nextRoma}</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
