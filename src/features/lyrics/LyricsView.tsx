import { useEffect, useRef } from "react";
import { mediaSeek, type MediaState } from "../media/mediaBridge";
import { useLyricPosition } from "./useLyrics";
import { currentLineIndex } from "./lyricsText";
import type { LyricsResult } from "./useLyrics";

interface LyricsViewProps {
  media: MediaState;
  result: LyricsResult;
  className?: string;
}

/** Scrolling lyrics; the current synced line is highlighted and kept centered. */
export function LyricsView({ media, result, className = "" }: LyricsViewProps) {
  if (result.status !== "found") {
    const message =
      result.status === "notFound"
        ? "Lirik tidak ditemukan"
        : result.status === "error"
          ? "Gagal memuat lirik"
          : "Mencari lirik…";
    return <div className={`flex items-center justify-center text-sm text-notch-muted ${className}`}>{message}</div>;
  }
  const { lyrics } = result;
  if (lyrics.instrumental) {
    return <div className={`flex items-center justify-center text-sm text-notch-muted ${className}`}>Instrumental</div>;
  }
  return lyrics.synced ? (
    <SyncedLyrics media={media} lines={lyrics.lines} className={className} />
  ) : (
    <div className={`overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-notch-muted ${className}`}>
      {lyrics.lines.map((l) => l.text).join("\n")}
    </div>
  );
}

function SyncedLyrics({
  media,
  lines,
  className,
}: {
  media: MediaState;
  lines: { timeMs: number; text: string }[];
  className: string;
}) {
  const position = useLyricPosition(media);
  const current = currentLineIndex(lines, position);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    const line = lineRefs.current[Math.max(0, current)];
    if (!container || !line) return;
    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2,
      behavior: "smooth",
    });
  }, [current]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-y-auto [mask-image:linear-gradient(transparent,black_25%,black_75%,transparent)] [scrollbar-width:none] ${className}`}
    >
      <div className="flex flex-col gap-1 py-[40%]">
        {lines.map((line, i) => (
          <button
            key={`${line.timeMs}-${i}`}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            type="button"
            onClick={() => media.canSeek && mediaSeek(line.timeMs)}
            className={`text-left text-[15px] font-semibold leading-snug transition-[color,opacity] duration-300 ${
              i === current ? "text-notch-fg" : "text-notch-fg/35 hover:text-notch-fg/60"
            }`}
          >
            {line.text || "♪"}
          </button>
        ))}
      </div>
    </div>
  );
}
