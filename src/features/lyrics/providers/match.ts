import { cleanTitle, normalizeForMatch, parseLrc } from "../lyricsText";
import type { Lyrics, LyricsProviderId } from "../types";

/** A hit within this many seconds of the track counts as the same recording. */
const DURATION_TOLERANCE_S = 6;

/**
 * The best search hit: same title (loosely compared), and when the duration is
 * known, the closest one within tolerance. Null when no hit has the title.
 */
export function pickHit<T>(
  hits: T[],
  title: string,
  durationS: number,
  titleOf: (hit: T) => string | undefined,
  durationSOf: (hit: T) => number | undefined,
): T | null {
  const wanted = normalizeForMatch(title);
  const sameTitle = hits.filter((h) => {
    const got = normalizeForMatch(cleanTitle(titleOf(h) ?? ""));
    return got !== "" && (got.includes(wanted) || wanted.includes(got));
  });
  if (sameTitle.length === 0) return null;
  if (durationS <= 0) return sameTitle[0];
  const scored = sameTitle
    .map((h) => ({ h, diff: Math.abs((durationSOf(h) ?? durationS) - durationS) }))
    .sort((a, b) => a.diff - b.diff);
  return scored[0].diff <= DURATION_TOLERANCE_S ? scored[0].h : null;
}

/**
 * Synced lyrics from LRC text, or null when it has no real lines. Pass the
 * track title to drop the "Title - Artist" header some providers put first.
 */
export function lrcToLyrics(
  lrc: string | null | undefined,
  provider: LyricsProviderId,
  title = "",
): Lyrics | null {
  if (!lrc) return null;
  const lines = parseLrc(lrc).filter((l) => !isCreditLine(l) && !isTitleLine(l, title));
  return lines.some((l) => l.text) ? { synced: true, instrumental: false, lines, provider } : null;
}

/** Unsynced lyrics from plain text, or null when empty. */
export function plainToLyrics(text: string | null | undefined, provider: LyricsProviderId): Lyrics | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((t, i) => ({ timeMs: i, text: t.trim() }));
  return lines.some((l) => l.text) ? { synced: false, instrumental: false, lines, provider } : null;
}

/** "Title - Artist" header in the first seconds (Kugou, QQ Music). */
function isTitleLine(line: { timeMs: number; text: string }, title: string): boolean {
  if (!title || line.timeMs > 15_000 || !line.text.includes(" - ")) return false;
  const wanted = normalizeForMatch(title);
  return wanted !== "" && normalizeForMatch(line.text).includes(wanted);
}

/** Credit roles providers list before the lyrics ("作词：X", "Lyrics by: Y"). */
const CREDIT_ROLE =
  /^(作词|作曲|编曲|制作人|监制|和声|合声|混音|母带|录音|吉他|贝斯|鼓|弦乐|键盘|出品|发行|OP|SP|词|曲|lyricist|composer|arranger|producer|(lyrics|music|composed|written|produced|arranged|mixed|mastered|recorded)\s+by)[^:：]{0,6}[:：]/i;

/** Credit lines only appear in the opening of a song; later lines are left alone. */
function isCreditLine(line: { timeMs: number; text: string }): boolean {
  return line.timeMs <= 45_000 && CREDIT_ROLE.test(line.text);
}
