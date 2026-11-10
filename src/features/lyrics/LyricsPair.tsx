import { AnimatePresence, motion } from "framer-motion";
import type { MediaState } from "../media/mediaBridge";
import type { Lyrics } from "./types";
import { useLyricPosition } from "./useLyrics";
import { currentLineIndex } from "./lyricsText";

/**
 * The line being sung and the next one, sliding up as the song moves on.
 * Before the first line it shows the first line as "next".
 */
export function LyricsPair({ media, lyrics }: { media: MediaState; lyrics: Lyrics }) {
  const position = useLyricPosition(media);
  const index = currentLineIndex(lyrics.lines, position);
  const current = index >= 0 ? lyrics.lines[index].text : "";
  const next = lyrics.lines.slice(index + 1).find((l) => l.text)?.text ?? "";

  return (
    <div className="relative h-[40px] overflow-hidden" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={index}
          className="absolute inset-x-0 top-0"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="truncate text-[14px] font-semibold leading-5" data-tip-truncated data-tip={current}>
            {current || "♪"}
          </div>
          <div className="truncate text-[12px] leading-5 text-notch-muted" data-tip-truncated data-tip={next}>
            {next}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
