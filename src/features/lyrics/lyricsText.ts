/** Text helpers for lyrics lookup: cleaning SMTC metadata and parsing LRC. */

export interface LyricLine {
  /** Start time in ms. For unsynced lyrics this is just the line index. */
  timeMs: number;
  text: string;
}

/** Words that mark a bracketed or dashed suffix as noise, not part of the title. */
const NOISE =
  "official|audio|video|lyrics?|visuali[sz]er|mv|m/v|music video|hd|4k|remaster(?:ed)?|explicit|clean|feat\\.?|ft\\.?|live|version|color coded";
const BRACKETED_NOISE = new RegExp(`\\s*[(\\[【][^)\\]】]*\\b(?:${NOISE})\\b[^)\\]】]*[)\\]】]`, "gi");
const DASHED_NOISE = new RegExp(`\\s+-\\s+(?:${NOISE})\\b.*$`, "i");
const FEATURING = /\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i;

/** "Song (Official Video) [HD] feat. X | Label" -> "Song" */
export function cleanTitle(title: string): string {
  const cleaned = title
    .replace(BRACKETED_NOISE, "")
    .replace(DASHED_NOISE, "")
    .replace(/\s+\|.*$/, "")
    .replace(FEATURING, "")
    .trim();
  return cleaned || title.trim();
}

/** Browser names that SMTC reports as "artist" for web players. */
const NOT_ARTISTS = new Set([
  "google chrome",
  "chrome",
  "microsoft edge",
  "edge",
  "firefox",
  "mozilla firefox",
  "brave",
  "opera",
  "vivaldi",
]);

/** "Artist - Topic" / "ArtistVEVO" (YouTube channels) -> "Artist"; browser names -> "". */
export function cleanArtist(artist: string): string {
  const trimmed = artist.trim();
  if (NOT_ARTISTS.has(trimmed.toLowerCase())) return "";
  return trimmed
    .replace(/\s+-\s+topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/,.*$/, "") // first credited artist only
    .trim();
}

/**
 * Web players often put "Artist - Title" in the title. Splits it when the
 * artist is unknown or matches one side.
 */
export function splitArtistTitle(title: string, artist: string): { title: string; artist: string } {
  const parts = title.split(" - ");
  if (parts.length < 2) return { title, artist };
  const left = parts[0].trim();
  const right = parts.slice(1).join(" - ").trim();
  if (!artist) return { artist: left, title: right };
  if (artist.toLowerCase() === left.toLowerCase()) return { artist, title: right };
  if (artist.toLowerCase() === right.toLowerCase()) return { artist, title: left };
  return { title, artist };
}

/** Letters and digits only, lowercased: for loose title comparison. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parses LRC (`[mm:ss.xx] text`, several stamps per line allowed), sorted by time. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(LRC_TIME)];
    if (stamps.length === 0) continue;
    const text = raw.replace(LRC_TIME, "").trim();
    for (const [, min, sec, frac = "0"] of stamps) {
      const fracMs = Number(frac.padEnd(3, "0").slice(0, 3));
      lines.push({ timeMs: Number(min) * 60_000 + Number(sec) * 1000 + fracMs, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function currentLineIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
