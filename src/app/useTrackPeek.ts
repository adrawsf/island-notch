import { useEffect, useRef, useState } from "react";
import type { MediaState } from "../features/media/mediaBridge";

/** How long the new track's title shows before the pill goes back. */
const PEEK_MS = 4000;

/**
 * True for a few seconds after the playing track changes (or music starts),
 * so a pill that is showing something else (the focus timer) can briefly
 * show the new title. Only reacts while `enabled`.
 */
export function useTrackPeek(media: MediaState, enabled: boolean): boolean {
  const key = media.active && media.title ? [media.appId, media.title, media.artist].join("\u001f") : "";
  const previous = useRef(key);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [peeking, setPeeking] = useState(false);

  useEffect(() => {
    if (key === previous.current) return;
    previous.current = key;
    if (!key || !enabled) return;
    setPeeking(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeeking(false), PEEK_MS);
  }, [key, enabled]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return peeking && enabled;
}
