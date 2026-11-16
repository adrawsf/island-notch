/**
 * The OCR overlay (snip.html): dims the monitor, the user drags a box over
 * the text, and Rust reads it (src-tauri/src/ocr.rs). Esc, a right click or
 * leaving the window cancels.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../core/tauriEvents";

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smaller boxes count as a stray click. */
const MIN_SIZE = 4;

function toRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function SnipApp() {
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const done = useRef(false);

  const reset = useCallback(() => {
    done.current = false;
    setStart(null);
    setEnd(null);
  }, []);

  // Paint the cleared overlay before Rust hides it, so it never reopens with the old box.
  const finish = useCallback((rect: Rect | null) => {
    if (done.current) return;
    done.current = true;
    setStart(null);
    setEnd(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (isTauri()) invoke("ocr_snip_finish", { rect }).catch((err) => console.error("[snip] finish", err));
      }),
    );
  }, []);

  useEffect(() => subscribe("snip://start", reset), [reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(null);
    };
    const onBlur = () => finish(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [finish]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return finish(null);
    if (e.button !== 0) return;
    done.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start) setEnd({ x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const rect = toRect(start, { x: e.clientX, y: e.clientY });
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      setStart(null);
      setEnd(null);
      return;
    }
    finish(rect);
  };

  const rect = start && end ? toRect(start, end) : null;

  return (
    <div
      className={`fixed inset-0 cursor-crosshair select-none ${rect ? "" : "bg-black/35"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[3px] outline outline-[1.5px] outline-white/90"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.35)",
          }}
        />
      )}
      {!start && (
        <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-sm font-medium text-white shadow-lg">
          Seret untuk memilih teks · Esc untuk batal
        </div>
      )}
    </div>
  );
}
