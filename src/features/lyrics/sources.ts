/**
 * Lyrics sources. "auto" walks the providers in order and keeps the first
 * synced result (falling back to the first plain one); a specific source
 * asks only that provider.
 */
import { isTauri } from "@tauri-apps/api/core";
import { cleanArtist, cleanTitle, splitArtistTitle } from "./lyricsText";
import { genius } from "./providers/genius";
import { kugou } from "./providers/kugou";
import { lrclib } from "./providers/lrclib";
import { netease } from "./providers/netease";
import { qqmusic } from "./providers/qqmusic";
import type { CleanTrack, Lyrics, LyricsProvider, LyricsSource, TrackQuery } from "./types";

/** Order used by "auto": open database first, synced before plain. */
export const LYRICS_PROVIDERS: LyricsProvider[] = [lrclib, netease, kugou, qqmusic, genius];

export const LYRICS_SOURCE_OPTIONS: { id: LyricsSource; label: string }[] = [
  { id: "auto", label: "Otomatis" },
  ...LYRICS_PROVIDERS.map((p) => ({ id: p.id, label: p.synced ? p.name : `${p.name} (tanpa sinkron)` })),
];

export function providerName(id: string): string {
  return LYRICS_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

function clean(track: TrackQuery): CleanTrack | null {
  const split = splitArtistTitle(cleanTitle(track.title), cleanArtist(track.artist));
  const title = cleanTitle(split.title);
  if (!title) return null;
  return { title, artist: split.artist, album: track.album, durationS: Math.round(track.durationMs / 1000) };
}

/** A provider that fails (offline, blocked) counts as "nothing found" here. */
async function tryProvider(provider: LyricsProvider, track: CleanTrack): Promise<Lyrics | null> {
  try {
    return await provider.find(track);
  } catch (err) {
    console.warn(`[lyrics] ${provider.id}`, err);
    return null;
  }
}

export async function findLyrics(track: TrackQuery, source: LyricsSource): Promise<Lyrics | null> {
  if (!isTauri()) {
    if (!import.meta.env.DEV) return null;
    // Plain browser (`npm run dev`): the demo track's lyrics.
    const { DEMO_LYRICS } = await import("../media/demoMedia");
    return DEMO_LYRICS;
  }
  const cleaned = clean(track);
  if (!cleaned) return null;

  if (source !== "auto") {
    const provider = LYRICS_PROVIDERS.find((p) => p.id === source);
    return provider ? provider.find(cleaned) : null;
  }

  let fallback: Lyrics | null = null;
  for (const provider of LYRICS_PROVIDERS) {
    const lyrics = await tryProvider(provider, cleaned);
    if (lyrics?.synced || lyrics?.instrumental) return lyrics;
    fallback ??= lyrics;
  }
  return fallback;
}
