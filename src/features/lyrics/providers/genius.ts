/** Genius: complete lyrics, but not time-synced (shown as plain text). */
import { normalizeForMatch } from "../lyricsText";
import type { CleanTrack, Lyrics, LyricsProvider } from "../types";
import { fetchJson, fetchText } from "./http";
import { plainToLyrics } from "./match";

interface SearchResult {
  response?: { sections?: { type: string; hits?: { result?: { title?: string; path?: string } }[] }[] };
}

/** Lyrics text from a Genius song page. */
function extractLyrics(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parts: string[] = [];
  doc.querySelectorAll('[data-lyrics-container="true"]').forEach((container) => {
    // Page furniture (contributor counts, "Read more") is marked for exclusion.
    container.querySelectorAll('[data-exclude-from-selection="true"]').forEach((el) => el.remove());
    container.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    parts.push(container.textContent ?? "");
  });
  return parts
    .join("\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l)) // section labels like [Chorus]
    .join("\n");
}

async function find(t: CleanTrack): Promise<Lyrics | null> {
  const search = await fetchJson<SearchResult>("genius.search", { q: `${t.artist} ${t.title}`.trim() });
  const sections = search?.response?.sections ?? [];
  const songs = sections.find((s) => s.type === "song")?.hits ?? [];
  const wanted = normalizeForMatch(t.title);
  const hit = songs.find((h) => {
    const got = normalizeForMatch(h.result?.title ?? "");
    return got && (got.includes(wanted) || wanted.includes(got));
  });
  const path = hit?.result?.path;
  if (!path) return null;
  const html = await fetchText("genius.page", {}, path);
  return html ? plainToLyrics(extractLyrics(html), "genius") : null;
}

export const genius: LyricsProvider = { id: "genius", name: "Genius", synced: false, find };
