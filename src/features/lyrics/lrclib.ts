/**
 * Lyrics lookup on LRCLIB. HTTP goes through Rust (`lrclib_request`), which
 * only allows the LRCLIB host; this module decides what to ask and which hit
 * to trust.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { cleanArtist, cleanTitle, normalizeForMatch, parseLrc, splitArtistTitle, type LyricLine } from "./lyricsText";

export interface Lyrics {
  synced: boolean;
  instrumental: boolean;
  lines: LyricLine[];
}

interface LrclibRecord {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export interface TrackQuery {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

/** A search hit within this many seconds of the track counts as the same recording. */
const DURATION_TOLERANCE_S = 6;

async function request(endpoint: "get" | "search", params: Record<string, string>): Promise<unknown> {
  const query = Object.entries(params).filter(([, v]) => v !== "");
  return invoke("lrclib_request", { endpoint, query });
}

function toLyrics(record: LrclibRecord | null | undefined): Lyrics | null {
  if (!record) return null;
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics);
    if (lines.some((l) => l.text)) return { synced: true, instrumental: false, lines };
  }
  if (record.plainLyrics) {
    const lines = record.plainLyrics.split(/\r?\n/).map((text, i) => ({ timeMs: i, text: text.trim() }));
    if (lines.some((l) => l.text)) return { synced: false, instrumental: false, lines };
  }
  if (record.instrumental) return { synced: false, instrumental: true, lines: [] };
  return null;
}

/** Best search hit: same title, closest duration, synced lyrics preferred. */
function pickBest(records: LrclibRecord[], title: string, durationS: number): LrclibRecord | null {
  const wanted = normalizeForMatch(title);
  const sameTitle = records.filter((r) => {
    const got = normalizeForMatch(cleanTitle(r.trackName ?? ""));
    return got !== "" && (got.includes(wanted) || wanted.includes(got));
  });
  const closeEnough = sameTitle.filter(
    (r) => durationS <= 0 || !r.duration || Math.abs(r.duration - durationS) <= DURATION_TOLERANCE_S,
  );
  const pool = closeEnough.length > 0 ? closeEnough : sameTitle;
  return pool.find((r) => r.syncedLyrics) ?? pool.find((r) => r.plainLyrics || r.instrumental) ?? null;
}

/** Looks the track up; null when LRCLIB has nothing usable. */
export async function findLyrics(track: TrackQuery): Promise<Lyrics | null> {
  if (!isTauri()) return null;
  const split = splitArtistTitle(cleanTitle(track.title), cleanArtist(track.artist));
  const title = cleanTitle(split.title);
  const artist = split.artist;
  const durationS = Math.round(track.durationMs / 1000);
  if (!title) return null;

  // 1. Exact signature match (fast, cached on LRCLIB's side).
  if (artist && durationS > 0) {
    const exact = toLyrics(
      (await request("get", {
        track_name: title,
        artist_name: artist,
        album_name: track.album,
        duration: String(durationS),
      })) as LrclibRecord | null,
    );
    if (exact?.synced || exact?.instrumental) return exact;
  }

  // 2. Search by fields, then 3. free text.
  const searches: Record<string, string>[] = [
    { track_name: title, artist_name: artist },
    { q: `${artist} ${title}`.trim() },
  ];
  let fallback: Lyrics | null = null;
  for (const params of searches) {
    const hits = (await request("search", params)) as LrclibRecord[] | null;
    const lyrics = toLyrics(pickBest(Array.isArray(hits) ? hits : [], title, durationS));
    if (lyrics?.synced) return lyrics;
    fallback ??= lyrics;
  }
  return fallback;
}
