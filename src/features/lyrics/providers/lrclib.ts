/** LRCLIB (lrclib.net): open lyrics database, synced LRC. */
import { cleanTitle } from "../lyricsText";
import type { CleanTrack, Lyrics, LyricsProvider } from "../types";
import { fetchJson } from "./http";
import { lrcToLyrics, pickHit, plainToLyrics } from "./match";

interface LrclibRecord {
  trackName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function toLyrics(r: LrclibRecord | null | undefined): Lyrics | null {
  if (!r) return null;
  const synced = lrcToLyrics(r.syncedLyrics, "lrclib");
  if (synced) return synced;
  const plain = plainToLyrics(r.plainLyrics, "lrclib");
  if (plain) return plain;
  return r.instrumental ? { synced: false, instrumental: true, lines: [], provider: "lrclib" } : null;
}

async function find(t: CleanTrack): Promise<Lyrics | null> {
  // 1. Exact signature (fast, cached on LRCLIB's side).
  if (t.artist && t.durationS > 0) {
    const exact = toLyrics(
      await fetchJson<LrclibRecord>("lrclib.get", {
        track_name: t.title,
        artist_name: t.artist,
        album_name: t.album,
        duration: t.durationS,
      }),
    );
    if (exact?.synced || exact?.instrumental) return exact;
  }
  // 2. Field search, then 3. free text; synced beats plain.
  let fallback: Lyrics | null = null;
  const searches: Record<string, string>[] = [
    { track_name: t.title, artist_name: t.artist },
    { q: `${t.artist} ${t.title}`.trim() },
  ];
  for (const params of searches) {
    const hits = (await fetchJson<LrclibRecord[]>("lrclib.search", params)) ?? [];
    const synced = hits.filter((h) => h.syncedLyrics);
    const hit =
      pickHit(synced, t.title, t.durationS, (h) => cleanTitle(h.trackName ?? ""), (h) => h.duration) ??
      pickHit(hits, t.title, t.durationS, (h) => cleanTitle(h.trackName ?? ""), (h) => h.duration);
    const lyrics = toLyrics(hit);
    if (lyrics?.synced) return lyrics;
    fallback ??= lyrics;
  }
  return fallback;
}

export const lrclib: LyricsProvider = { id: "lrclib", name: "LRCLIB", synced: true, find };
