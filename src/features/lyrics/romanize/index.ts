/**
 * Romanization of lyrics lines: Japanese (romaji), Korean (Revised
 * Romanization) and Chinese (pinyin). Lines without those scripts get no
 * romanization. Each language's converter is loaded only when a song needs it.
 */
import { useEffect, useState } from "react";
import { useSettings } from "../../../core/settings/useSettings";
import type { Lyrics } from "../types";
import { romanizeKorean } from "./korean";

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

type Language = "ja" | "ko" | "zh";

/**
 * Language of each line. Han characters are Japanese when the song has any
 * kana (kanji-only lines in a Japanese song), Chinese otherwise.
 */
function detect(lines: string[]): (Language | null)[] {
  const japaneseSong = lines.some((l) => KANA.test(l));
  return lines.map((l) => {
    if (KANA.test(l)) return "ja";
    if (HANGUL.test(l)) return "ko";
    if (HAN.test(l)) return japaneseSong ? "ja" : "zh";
    return null;
  });
}

const CONVERTERS: Record<Language, (lines: string[]) => Promise<string[]>> = {
  ja: (lines) => import("./japanese").then((m) => m.romanizeJapanese(lines)),
  ko: romanizeKorean,
  zh: (lines) => import("./chinese").then((m) => m.romanizeChinese(lines)),
};

/** Romanized text per line (null = nothing to romanize), or null for the whole song. */
export async function romanizeLines(lines: string[]): Promise<(string | null)[] | null> {
  const langs = detect(lines);
  if (langs.every((l) => l === null)) return null;
  const out: (string | null)[] = lines.map(() => null);
  for (const lang of ["ja", "ko", "zh"] as const) {
    const indexes = langs.flatMap((l, i) => (l === lang ? [i] : []));
    if (!indexes.length) continue;
    try {
      const converted = await CONVERTERS[lang](indexes.map((i) => lines[i]));
      indexes.forEach((lineIndex, k) => {
        const text = converted[k]?.trim();
        if (text && text !== lines[lineIndex].trim()) out[lineIndex] = text;
      });
    } catch (err) {
      console.error(`[romanize] ${lang} failed`, err);
    }
  }
  return out;
}

// One conversion per lyrics object, shared by every component in the window.
const cache = new WeakMap<Lyrics, Promise<(string | null)[] | null>>();

function romanizeLyrics(lyrics: Lyrics): Promise<(string | null)[] | null> {
  let pending = cache.get(lyrics);
  if (!pending) {
    pending = romanizeLines(lyrics.lines.map((l) => l.text));
    cache.set(lyrics, pending);
  }
  return pending;
}

/**
 * Romanization for each line of `lyrics`, aligned with `lyrics.lines`.
 * Null while loading, when the setting is off, or for songs that need none.
 */
export function useRomanized(lyrics: Lyrics | null): (string | null)[] | null {
  const { lyricsRomanize } = useSettings();
  const [result, setResult] = useState<{ lyrics: Lyrics; lines: (string | null)[] | null } | null>(null);

  useEffect(() => {
    if (!lyrics || !lyricsRomanize) return;
    let cancelled = false;
    romanizeLyrics(lyrics).then((lines) => {
      if (!cancelled) setResult({ lyrics, lines });
    });
    return () => {
      cancelled = true;
    };
  }, [lyrics, lyricsRomanize]);

  if (!lyrics || !lyricsRomanize || result?.lyrics !== lyrics) return null;
  return result.lines;
}
