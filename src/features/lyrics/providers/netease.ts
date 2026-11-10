/** NetEase Cloud Music: strong for Asian catalogues, synced LRC. */
import type { CleanTrack, Lyrics, LyricsProvider } from "../types";
import { fetchJson } from "./http";
import { lrcToLyrics, pickHit } from "./match";

interface SearchResult {
  result?: { songs?: { id: number; name: string; dt?: number }[] };
}
interface LyricResult {
  lrc?: { lyric?: string };
}

async function find(t: CleanTrack): Promise<Lyrics | null> {
  const search = await fetchJson<SearchResult>("netease.search", {
    s: `${t.title} ${t.artist}`.trim(),
    type: 1,
    limit: 8,
    offset: 0,
  });
  const songs = search?.result?.songs ?? [];
  const song = pickHit(songs, t.title, t.durationS, (s) => s.name, (s) => (s.dt ? s.dt / 1000 : undefined));
  if (!song) return null;
  const lyric = await fetchJson<LyricResult>("netease.lyric", { id: song.id, lv: 1 });
  return lrcToLyrics(lyric?.lrc?.lyric, "netease", t.title);
}

export const netease: LyricsProvider = { id: "netease", name: "NetEase", synced: true, find };
