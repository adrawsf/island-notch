/**
 * The pixel cat: a 16×16 sprite drawn as SVG rects, so it stays crisp at any
 * size. Moods change the face and add CSS motion (see .pet-* in index.css):
 *   idle  - blinks now and then, tail swishes
 *   happy - ^^ eyes and floating hearts (after a click)
 *   dance - bobs and tilts while music plays, notes float up
 *   sleep - eyes shut, slow breathing, z's (late at night)
 */
import { memo, useEffect, useState } from "react";
import type { PetColor } from "../../../core/settings/settings";

export type PetMood = "idle" | "happy" | "dance" | "sleep";

// k outline · b fur · s darker fur (stripes) · w belly/muzzle · p pink · e eye
const BODY = [
  "................",
  "..k.......k.....",
  ".kpk.....kpk....",
  ".kbbk...kbbk....",
  ".kbsbkkkbsbk....",
  ".kbbbsbsbbbk....",
  ".kbbbbbbbbbk....",
  ".kbbbwpwbbbk....",
  ".kbbbwwwbbbk....",
  "..kbbbbbbbk.....",
  "..kbbwwwbbk.....",
  ".kbsbwwwbsbk....",
  ".kbbbwwwbbbk....",
  ".kbsbwwwbsbk....",
  ".kbwbbbbbwbk....",
  "..kkkkkkkkk.....",
];

/** Faces drawn over BODY rows 5-6 (cols 2-10). "." keeps the body pixel. */
const FACES: Record<"open" | "blink" | "happy", Record<number, string>> = {
  open: { 5: "..e.....e..", 6: "..e.....e.." },
  blink: { 6: "..k.....k.." },
  happy: { 5: "..k.....k..", 6: ".k.k...k.k." },
};

/** Tail frames drawn over the right side; swapped to swish. */
const TAILS: Record<number, string>[] = [
  { 9: "..............k.", 10: ".............kbk", 11: ".............kbk", 12: "............kbk.", 13: "...........bbk.." },
  { 10: "..............kk", 11: ".............kbk", 12: "............kbbk", 13: "...........bbk.." },
];

const PALETTES: Record<PetColor, Record<string, string>> = {
  orange: { k: "#3b2418", b: "#f2a65a", s: "#d9822b", w: "#fff1dc", p: "#ff9fb2", e: "#2a1a12" },
  gray: { k: "#23252b", b: "#a3a9b5", s: "#7c8391", w: "#eef0f4", p: "#ffa3b5", e: "#15171b" },
  black: { k: "#0d0d10", b: "#3a3a44", s: "#2b2b33", w: "#5b5b68", p: "#ff8fa6", e: "#ffd84a" },
  cream: { k: "#5a4632", b: "#fbe8cc", s: "#efcfa3", w: "#ffffff", p: "#ffacbd", e: "#3a2a1c" },
};

/** Overlays `patch` rows onto `grid` (only non-"." chars, offset by `col`). */
function overlay(grid: string[], patch: Record<number, string>, col = 0): string[] {
  const out = [...grid];
  for (const [row, text] of Object.entries(patch)) {
    const r = Number(row);
    const chars = out[r].split("");
    for (let i = 0; i < text.length; i++) if (text[i] !== ".") chars[col + i] = text[i];
    out[r] = chars.join("");
  }
  return out;
}

const Sprite = memo(function Sprite({ grid, palette }: { grid: string[]; palette: Record<string, string> }) {
  const rects = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (c !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={palette[c]} />);
    }
  }
  return <>{rects}</>;
});

interface PixelCatProps {
  mood: PetMood;
  color: PetColor;
  /** Rendered height in px (the sprite is square). */
  size: number;
  /** Floating hearts / notes / z's (off in the tiny pill version). */
  effects?: boolean;
}

export function PixelCat({ mood, color, size, effects = true }: PixelCatProps) {
  const [blink, setBlink] = useState(false);
  const [tail, setTail] = useState(0);

  // Blink every few seconds while awake.
  useEffect(() => {
    if (mood === "sleep" || mood === "happy") return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, 2500 + Math.random() * 3500);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [mood]);

  // Tail swish: lazy while idle, quick while dancing, still while asleep.
  useEffect(() => {
    if (mood === "sleep") return;
    const id = setInterval(() => setTail((t) => 1 - t), mood === "dance" ? 260 : mood === "happy" ? 200 : 700);
    return () => clearInterval(id);
  }, [mood]);

  const face = mood === "sleep" || blink ? "blink" : mood === "happy" ? "happy" : "open";
  const grid = overlay(overlay(BODY, FACES[face], 1), TAILS[tail]);

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className={`pet-${mood} block overflow-visible`}
        role="img"
        aria-label="Kucing piksel"
      >
        <Sprite grid={grid} palette={PALETTES[color]} />
      </svg>
      {effects && mood !== "idle" && <Effects mood={mood} size={size} />}
    </div>
  );
}

const EFFECT_GLYPH: Record<Exclude<PetMood, "idle">, string> = { happy: "♥", dance: "♪", sleep: "z" };

/** Three glyphs that float up from the cat's head, staggered. */
function Effects({ mood, size }: { mood: Exclude<PetMood, "idle">; size: number }) {
  const glyph = EFFECT_GLYPH[mood];
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={`${mood}-${i}`}
          className={`pet-float pet-float-${mood} absolute font-semibold`}
          style={{
            left: `${55 + i * 14}%`,
            top: "6%",
            fontSize: Math.max(9, size * 0.2),
            animationDelay: `${i * 0.6}s`,
          }}
        >
          {glyph}
        </span>
      ))}
    </span>
  );
}
