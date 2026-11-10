import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { useResolvedTheme } from "../shared/useResolvedTheme";
import { closeTeleprompter } from "../features/teleprompter/teleprompterBridge";
import { activeScript, teleprompterData } from "../features/teleprompter/teleprompterStore";

type Phase = "idle" | "countdown" | "playing" | "paused" | "done";

/** Where the reading line sits, as a share of the viewport height. */
const READING_LINE = 0.35;
const SPEED_STEP = 5;
const FONT_STEP = 2;

/**
 * The teleprompter: text scrolls up at a steady speed past a reading line.
 * Space play/pause · ↑/↓ speed · +/− text size · Home restart · Esc close.
 * Wheel or drag the text to adjust while paused or playing.
 */
export function TeleprompterReader() {
  const settings = useSettings();
  const theme = useResolvedTheme(settings.theme);
  const script = activeScript(teleprompterData.use());

  const scrollRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(0);
  const [viewport, setViewport] = useState(0);

  // Latest speed without restarting the animation loop.
  const speedRef = useRef(settings.teleprompterSpeed);
  speedRef.current = settings.teleprompterSpeed;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const start = useCallback(() => {
    const seconds = Math.round(settings.teleprompterCountdown);
    if (seconds > 0) {
      setCount(seconds);
      setPhase("countdown");
    } else {
      setPhase("playing");
    }
  }, [settings.teleprompterCountdown]);

  const restart = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setPhase("idle");
  }, []);

  const toggle = useCallback(() => {
    if (phase === "playing" || phase === "countdown") setPhase("paused");
    else if (phase === "paused") setPhase("playing");
    else {
      if (phase === "done") scrollRef.current?.scrollTo({ top: 0 });
      start();
    }
  }, [phase, start]);

  // Countdown ticks.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) {
      setPhase("playing");
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, count]);

  // Scrolling: frame-rate independent, fractional pixels accumulated.
  useEffect(() => {
    if (phase !== "playing") return;
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    let last = performance.now();
    let carry = el.scrollTop;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Follow manual wheel scrolling instead of fighting it.
      if (Math.abs(el.scrollTop - carry) > 2) carry = el.scrollTop;
      carry += speedRef.current * dt;
      el.scrollTop = carry;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        setPhase("done");
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Viewport height for the lead-in/lead-out spacers.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = settingsRef.current;
      switch (e.key) {
        case " ":
          e.preventDefault();
          toggle();
          break;
        case "ArrowUp":
          e.preventDefault();
          updateSetting("teleprompterSpeed", Math.min(200, s.teleprompterSpeed + SPEED_STEP));
          break;
        case "ArrowDown":
          e.preventDefault();
          updateSetting("teleprompterSpeed", Math.max(10, s.teleprompterSpeed - SPEED_STEP));
          break;
        case "+":
        case "=":
          updateSetting("teleprompterFontSize", Math.min(72, s.teleprompterFontSize + FONT_STEP));
          break;
        case "-":
          updateSetting("teleprompterFontSize", Math.max(14, s.teleprompterFontSize - FONT_STEP));
          break;
        case "Home":
          restart();
          break;
        case "Escape":
          closeTeleprompter();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, restart]);

  // Pause when the window is hidden, so it does not keep scrolling off screen.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPhase((p) => (p === "playing" || p === "countdown" ? "paused" : p));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button") || !isTauri()) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  const playing = phase === "playing" || phase === "countdown";
  const lineTop = Math.round(viewport * READING_LINE);

  return (
    <div className="h-full w-full p-2">
      <div
        data-theme={theme}
        className="glass relative flex h-full w-full flex-col overflow-hidden rounded-[24px] text-notch-fg"
      >
        {/* Toolbar: drag handle and controls. */}
        <div onPointerDown={onDragStart} className="flex shrink-0 items-center gap-1.5 px-3 pb-1 pt-2.5">
          <span className="min-w-0 flex-1 truncate pl-1 text-xs font-semibold text-notch-muted">
            {script?.title || "Teleprompter"}
          </span>
          <ToolButton label="Lebih lambat (↓)" onClick={() => updateSetting("teleprompterSpeed", Math.max(10, settings.teleprompterSpeed - SPEED_STEP))}>
            <Minus size={13} />
          </ToolButton>
          <span className="w-14 text-center text-[11px] tabular-nums text-notch-muted" data-tip="Kecepatan (px/detik)">
            {settings.teleprompterSpeed} px/s
          </span>
          <ToolButton label="Lebih cepat (↑)" onClick={() => updateSetting("teleprompterSpeed", Math.min(200, settings.teleprompterSpeed + SPEED_STEP))}>
            <Plus size={13} />
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-notch-fg/15" aria-hidden />
          <ToolButton label="Huruf lebih kecil (−)" onClick={() => updateSetting("teleprompterFontSize", Math.max(14, settings.teleprompterFontSize - FONT_STEP))}>
            <span className="text-[11px] font-bold">A−</span>
          </ToolButton>
          <ToolButton label="Huruf lebih besar (+)" onClick={() => updateSetting("teleprompterFontSize", Math.min(72, settings.teleprompterFontSize + FONT_STEP))}>
            <span className="text-[13px] font-bold">A+</span>
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-notch-fg/15" aria-hidden />
          <ToolButton label="Ulang dari awal (Home)" onClick={restart}>
            <RotateCcw size={13} />
          </ToolButton>
          <button
            type="button"
            onClick={toggle}
            disabled={!script?.body.trim()}
            className="glass-button flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold disabled:opacity-40"
            data-tip="Play / jeda (Spasi)"
          >
            {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            {playing ? "Jeda" : phase === "paused" ? "Lanjut" : "Mulai"}
          </button>
          <ToolButton label="Tutup (Esc)" onClick={closeTeleprompter}>
            <X size={14} />
          </ToolButton>
        </div>

        {/* Reading area. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto px-8 [mask-image:linear-gradient(transparent,black_18%,black_82%,transparent)] [scrollbar-width:none]"
          >
            <div style={{ height: lineTop }} />
            <p
              className="whitespace-pre-wrap font-semibold leading-[1.45]"
              style={{ fontSize: settings.teleprompterFontSize }}
            >
              {script?.body.trim() || "Belum ada naskah. Tulis naskah di tab Prompter pada notch."}
            </p>
            <div style={{ height: Math.max(0, viewport - lineTop) }} />
          </div>
          {/* Reading line marker. */}
          <div
            className="pointer-events-none absolute left-2 right-2 flex items-center"
            style={{ top: lineTop + settings.teleprompterFontSize * 0.72 }}
            aria-hidden
          >
            <span className="h-0 w-0 border-y-[6px] border-l-[8px] border-y-transparent border-l-notch-accent" />
            <span className="h-px flex-1 bg-notch-accent/25" />
          </div>
          {phase === "countdown" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-7xl font-bold tabular-nums text-notch-fg/90">{count}</span>
            </div>
          )}
          {phase === "done" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-notch-muted">
              Selesai · Spasi untuk mulai lagi
            </div>
          )}
        </div>

        {/* Resize grip (the window has no native frame). */}
        <div
          onPointerDown={(e) => {
            if (e.button !== 0 || !isTauri()) return;
            e.preventDefault();
            getCurrentWindow().startResizeDragging("SouthEast").catch(() => {});
          }}
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-br-[20px]"
          data-tip="Ubah ukuran"
          aria-hidden
        />
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-notch-muted transition-colors hover:bg-notch-fg/10 hover:text-notch-fg"
    >
      {children}
    </button>
  );
}
