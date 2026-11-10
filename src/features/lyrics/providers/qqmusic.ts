/** QQ Music: large Mandarin catalogue, synced LRC (base64). */
import type { CleanTrack, Lyrics, LyricsProvider } from "../types";
import { decodeBase64Utf8, fetchJson } from "./http";
import { lrcToLyrics, pickHit } from "./match";

interface SearchResult {
  data?: { song?: { list?: { songmid: string; songname: string; interval?: number }[] } };
}
interface LyricResult {
  lyric?: string;
}

async function find(t: CleanTrack): Promise<Lyrics | null> {
  const search = await fetchJson<SearchResult>("qqmusic.search", {
    p: 1,
    n: 8,
    w: `${t.title} ${t.artist}`.trim(),
    format: "json",
  });
  const songs = search?.data?.song?.list ?? [];
  const song = pickHit(songs, t.title, t.durationS, (s) => s.songname, (s) => s.interval);
  if (!song) return null;
  const lyric = await fetchJson<LyricResult>("qqmusic.lyric", { songmid: song.songmid, format: "json", nobase64: 0 });
  if (!lyric?.lyric) return null;
  return lrcToLyrics(decodeBase64Utf8(lyric.lyric), "qqmusic", t.title);
}

export const qqmusic: LyricsProvider = { id: "qqmusic", name: "QQ Music", synced: true, find };
