/** Kugou: large catalogue, synced LRC (base64). Searched by "artist - title" + duration. */
import type { CleanTrack, Lyrics, LyricsProvider } from "../types";
import { decodeBase64Utf8, fetchJson } from "./http";
import { lrcToLyrics } from "./match";

interface CandidateResult {
  candidates?: { id: string; accesskey: string; song?: string; duration?: number }[];
}
interface DownloadResult {
  content?: string;
}

async function find(t: CleanTrack): Promise<Lyrics | null> {
  const keyword = t.artist ? `${t.artist} - ${t.title}` : t.title;
  const search = await fetchJson<CandidateResult>("kugou.search", {
    ver: 1,
    man: "yes",
    client: "mobi",
    keyword,
    duration: t.durationS > 0 ? t.durationS * 1000 : "",
    hash: "",
  });
  // Kugou already ranks by keyword + duration; take its first candidate.
  const candidate = search?.candidates?.[0];
  if (!candidate?.id || !candidate.accesskey) return null;
  const download = await fetchJson<DownloadResult>("kugou.download", {
    ver: 1,
    client: "pc",
    id: candidate.id,
    accesskey: candidate.accesskey,
    fmt: "lrc",
    charset: "utf8",
  });
  if (!download?.content) return null;
  return lrcToLyrics(decodeBase64Utf8(download.content), "kugou", t.title);
}

export const kugou: LyricsProvider = { id: "kugou", name: "Kugou", synced: true, find };
