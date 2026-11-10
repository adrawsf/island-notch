import { AnimatePresence, motion } from "framer-motion";
import type { MediaState } from "../media/mediaBridge";
import type { Lyrics } from "./types";
import { useLyricPosition } from "./useLyrics";
import { currentLineIndex } from "./lyricsText";

/**
 * The line being sung and the next one. Long lines wrap instead of being cut
 * off, so the block grows with the text (the mini player window follows).
 * Before the first line it shows the first line as "next".
 */
export function LyricsPair({ media, lyrics }: { media: MediaState; lyrics: Lyrics }) {
  const position = useLyricPosition(media);
  const index = currentLineIndex(lyrics.lines, position);
  const current = index >= 0 ? lyrics.lines[index].text : "";
  const next = lyrics.lines.slice(index + 1).find((l) => l.text)?.text ?? "";

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
          {next && <div className="mt-0.5 break-words text-[12px] leading-[18px] text-notch-muted">{next}</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
