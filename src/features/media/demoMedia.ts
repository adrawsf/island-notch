/**
 * Sample track and lyrics for the UI in a plain browser (`npm run dev`),
 * like the other features' demo data. A made-up song; the lyrics are original.
 */
import type { Lyrics } from "../lyrics/types";
import { EMPTY_MEDIA, type MediaState } from "./mediaBridge";

export const DEMO_MEDIA_ENABLED = import.meta.env.DEV;

const COVER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff8a3d"/><stop offset=".55" stop-color="#e2416b"/><stop offset="1" stop-color="#5b2a86"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#g)"/>
      <circle cx="60" cy="74" r="26" fill="#ffd27a" opacity=".9"/>
      <rect y="78" width="120" height="42" fill="#2b1446" opacity=".85"/>
      <path d="M0 92 Q30 84 60 92 T120 92 V120 H0Z" fill="#1a0b2e"/>
    </svg>`,
  );

/** Starts 47 s into the song so a lyric line is showing. */
export function demoMedia(): MediaState {
  return {
    ...EMPTY_MEDIA,
    active: true,
    appId: "Spotify.exe",
    title: "Senja di Kota",
    artist: "Nadia & The Lights",
    album: "Langit Jingga",
    isPlaying: true,
    positionMs: 47_000,
    durationMs: 214_000,
    sampledAtMs: Date.now(),
    canPlayPause: true,
    canNext: true,
    canPrevious: true,
    canSeek: true,
    artwork: COVER,
  };
}

const LINES: [number, string][] = [
  [12, "Lampu jalan mulai menyala"],
  [16.5, "Kau tertawa di ujung trotoar"],
  [21, "Kota ini terlalu ramai"],
  [25.5, "Tapi aku hanya mendengarmu"],
  [31, "Senja di kota, jangan cepat pergi"],
  [36, "Biar langit jingga menunggu kita"],
  [41, "Satu lagu lagi, satu jalan lagi"],
  [46, "Sampai bintang tahu namamu"],
  [52, "Kereta terakhir lewat pelan"],
  [57, "Kita pura-pura tidak dengar"],
  [62, "Jam di tangan boleh berhenti"],
  [67, "Malam ini milik kita berdua"],
];

export const DEMO_LYRICS: Lyrics = {
  synced: true,
  instrumental: false,
  provider: "lrclib",
  lines: LINES.map(([s, text]) => ({ timeMs: s * 1000, text })),
};
