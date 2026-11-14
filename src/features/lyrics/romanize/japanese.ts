/**
 * Japanese -> Hepburn romaji with kuroshiro + the kuromoji dictionary (kanji
 * readings included). The ~17 MB dictionary is served at /kuromoji-dict/ (see
 * the kuromoji-dict plugin in vite.config.ts) and loaded once, on the first
 * Japanese song, in each window that shows lyrics.
 */
import type Kuroshiro from "kuroshiro";

let instance: Promise<Kuroshiro> | null = null;

function converter(): Promise<Kuroshiro> {
  instance ??= (async () => {
    const [{ default: Kuroshiro }, { default: KuromojiAnalyzer }] = await Promise.all([
      import("kuroshiro"),
      import("kuroshiro-analyzer-kuromoji"),
    ]);
    const kuroshiro = new Kuroshiro();
    await kuroshiro.init(new KuromojiAnalyzer({ dictPath: "/kuromoji-dict/" }));
    return kuroshiro;
  })().catch((err) => {
    instance = null; // let a later song try again
    throw err;
  });
  return instance;
}

export async function romanizeJapanese(lines: string[]): Promise<string[]> {
  const k = await converter();
  const out: string[] = [];
  for (const line of lines) {
    const romaji = await k.convert(line, { to: "romaji", mode: "spaced", romajiSystem: "hepburn" });
    out.push(tidy(romaji));
  }
  return out;
}

/**
 * Verb/adjective endings kuroshiro emits as separate tokens; they read as one
 * word with what comes before ("mi te i ta" -> "mite ita").
 */
const SUFFIXES = new Set([
  "te", "ta", "teru", "teta", "tete", "tara", "tari", "masu", "mashita", "masen", "mashō", "nai", "nakatta",
  "naide", "tai", "takute", "reru", "rareru", "seru", "saseru", "nagara", "ru", "u", "yō", "zu",
]);

function joinSuffixes(text: string): string {
  const words = text.split(" ");
  const out: string[] = [];
  for (const w of words) {
    if (out.length && SUFFIXES.has(w) && /[a-zō]$/.test(out[out.length - 1])) out[out.length - 1] += w;
    else out.push(w);
  }
  return out.join(" ");
}

/** "kimi no  na wa 、 " -> "kimi no na wa," */
function tidy(text: string): string {
  return joinSuffixes(text.replace(/\s{2,}/g, " ").trim())
    .replace(/[、，]/g, ",")
    .replace(/[。．]/g, ".")
    .replace(/[！]/g, "!")
    .replace(/[？]/g, "?")
    .replace(/[「」『』]/g, '"')
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
