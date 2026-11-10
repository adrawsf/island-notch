import type { LyricLine } from "./lyricsText";

export type LyricsProviderId = "lrclib" | "netease" | "kugou" | "qqmusic" | "genius";
/** "auto" tries every provider in order. */
export type LyricsSource = "auto" | LyricsProviderId;

export interface Lyrics {
  synced: boolean;
  instrumental: boolean;
  lines: LyricLine[];
  /** Which provider these came from. */
  provider: LyricsProviderId;
}

/** The track as SMTC reports it. */
export interface TrackQuery {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

/** The track after cleaning, as providers search for it. */
export interface CleanTrack {
  title: string;
  artist: string;
  album: string;
  /** 0 when unknown. */
  durationS: number;
}

export interface LyricsProvider {
  id: LyricsProviderId;
  name: string;
  /** Whether this provider can return time-synced lyrics. */
  synced: boolean;
  find(track: CleanTrack): Promise<Lyrics | null>;
}
