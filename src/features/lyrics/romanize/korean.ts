/**
 * Korean -> Revised Romanization, with the sound changes that matter most in
 * song lyrics: linking a final consonant to a following vowel (사랑해요 ->
 * saranghaeyo, 있어 -> isseo), nasalization (합니다 -> hamnida), the ㄹ rules
 * (설날 -> seollal) and aspiration with ㅎ (좋다 -> jota).
 */

const BASE = 0xac00;
const LAST = 0xd7a3;

// Initial consonants (19).
const INI = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
// Vowels (21).
const MED = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
// Final consonant as pronounced at the end of a syllable (28, index 0 = none).
const FIN = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
/**
 * Before a vowel (initial ㅇ) the final moves over: [what stays, the next
 * syllable's new initial]. ㅇ stays put; ㅎ goes silent.
 */
const LINK: Record<number, [string, string]> = {
  1: ["", "g"], 2: ["", "kk"], 3: ["k", "s"], 4: ["", "n"], 5: ["n", "j"], 6: ["", "n"], 7: ["", "d"],
  8: ["", "r"], 9: ["l", "g"], 10: ["l", "m"], 11: ["l", "b"], 12: ["l", "s"], 13: ["l", "t"], 14: ["l", "p"],
  15: ["", "r"], 16: ["", "m"], 17: ["", "b"], 18: ["p", "s"], 19: ["", "s"], 20: ["", "ss"], 21: ["ng", ""],
  22: ["", "j"], 23: ["", "ch"], 24: ["", "k"], 25: ["", "t"], 26: ["", "p"], 27: ["", ""],
};

const I_G = 0, I_N = 2, I_D = 3, I_R = 5, I_M = 6, I_SILENT = 11, I_J = 12, I_H = 18;
const F_H = 27;
const MED_I = 20;

interface Syllable {
  ini: number;
  med: number;
  fin: number;
}

function decompose(ch: string): Syllable | null {
  const code = ch.charCodeAt(0) - BASE;
  if (code < 0 || ch.charCodeAt(0) > LAST) return null;
  return { ini: Math.floor(code / 588), med: Math.floor((code % 588) / 28), fin: code % 28 };
}

/** Romanizes one run of consecutive Hangul syllables (a word). */
function romanizeWord(syllables: Syllable[]): string {
  const ini = syllables.map((s) => INI[s.ini]);
  const fin = syllables.map((s) => FIN[s.fin]);

  for (let i = 0; i < syllables.length - 1; i++) {
    const f = syllables[i].fin;
    const next = syllables[i + 1].ini;
    if (f === 0) continue;

    if (next === I_SILENT) {
      [fin[i], ini[i + 1]] = LINK[f];
      // Palatalization: ㄷ/ㅌ before 이 read as ㅈ/ㅊ (같이 -> gachi).
      if (syllables[i + 1].med === MED_I && (f === 7 || f === 25)) ini[i + 1] = f === 7 ? "j" : "ch";
      continue;
    }
    // Aspiration: ㄱ/ㄷ/ㅂ/ㅈ + ㅎ, and ㅎ + ㄱ/ㄷ/ㅈ.
    if (next === I_H && (fin[i] === "k" || fin[i] === "t" || fin[i] === "p") && f !== 4 && f !== 8) {
      ini[i + 1] = f === 22 ? "ch" : fin[i];
      fin[i] = "";
      continue;
    }
    if (f === F_H || f === 6 || f === 15) {
      const keep = f === 6 ? "n" : f === 15 ? "l" : "";
      if (next === I_G) [fin[i], ini[i + 1]] = [keep, "k"];
      else if (next === I_D) [fin[i], ini[i + 1]] = [keep, "t"];
      else if (next === I_J) [fin[i], ini[i + 1]] = [keep, "ch"];
      else if (next === I_N && f === F_H) fin[i] = "n";
      continue;
    }
    // ㄹ rules: ㄹ+ㄹ, ㄹ+ㄴ, ㄴ+ㄹ all become "ll".
    if (fin[i] === "l" && (next === I_R || next === I_N)) {
      ini[i + 1] = "l";
      continue;
    }
    if (fin[i] === "n" && next === I_R) {
      fin[i] = "l";
      ini[i + 1] = "l";
      continue;
    }
    // Nasalization: k/t/p before ㄴ/ㅁ; ㄹ after other finals reads as ㄴ.
    if (next === I_R) ini[i + 1] = "n";
    if (next === I_N || next === I_M || next === I_R) {
      if (fin[i] === "k") fin[i] = "ng";
      else if (fin[i] === "t") fin[i] = "n";
      else if (fin[i] === "p") fin[i] = "m";
    }
  }

  return syllables.map((s, i) => ini[i] + MED[s.med] + fin[i]).join("");
}

export function romanizeKoreanLine(line: string): string {
  let out = "";
  let run: Syllable[] = [];
  const flush = () => {
    if (run.length) out += romanizeWord(run);
    run = [];
  };
  for (const ch of line) {
    const s = decompose(ch);
    if (s) run.push(s);
    else {
      flush();
      out += ch;
    }
  }
  flush();
  return out.replace(/\s{2,}/g, " ").trim();
}

export async function romanizeKorean(lines: string[]): Promise<string[]> {
  return lines.map(romanizeKoreanLine);
}
