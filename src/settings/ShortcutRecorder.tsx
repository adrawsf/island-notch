import { useEffect, useState } from "react";
import { prettyShortcut } from "../shared/format";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  /** Recording takes the keyboard; the window should not react to Esc meanwhile. */
  onRecordingChange?: (recording: boolean) => void;
}

/** `KeyboardEvent.code` -> global-shortcut key name, or null if not allowed alone. */
function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  if (/^Numpad\d$/.test(code)) return code;
  const named = [
    "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
    "Insert", "Delete", "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
    "Semicolon", "Quote", "Comma", "Period", "Slash",
  ];
  return named.includes(code) ? code : null;
}

function modifiers(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  return mods;
}

/**
 * Click, then press the combination. Needs Ctrl, Alt or Win (Shift alone
 * would steal ordinary typing), except for F-keys. Esc cancels.
 */
export function ShortcutRecorder({ value, onChange, onRecordingChange }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    if (!recording) return;
    const stop = () => {
      setRecording(false);
      setPreview([]);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const mods = modifiers(e);
      if (e.key === "Escape" && mods.length === 0) return stop();
      const key = keyName(e.code);
      if (!key) {
        setPreview(mods);
        return;
      }
      const strong = mods.some((m) => m !== "Shift");
      if (!strong && !/^F\d+$/.test(key)) {
        setHint("Tambahkan Ctrl, Alt, atau Win");
        setPreview(mods);
        return;
      }
      onChange([...mods, key].join("+"));
      setHint(null);
      stop();
    };
    const onKeyUp = (e: KeyboardEvent) => setPreview(modifiers(e));
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", stop);
    };
  }, [recording, onChange]);

  const label = recording
    ? preview.length
      ? `${prettyShortcut(preview.join("+"))}+…`
      : "Tekan kombinasi…"
    : prettyShortcut(value);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setHint(null);
          setRecording((r) => !r);
        }}
        aria-label="Ubah shortcut"
        data-tip={recording ? "Esc untuk batal" : "Klik untuk mengubah"}
        className={`min-w-[120px] rounded-full px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
          recording ? "bg-notch-accent text-white" : "glass-button text-notch-fg"
        }`}
      >
        {label}
      </button>
      {recording && hint && <span className="text-[11px] text-notch-muted">{hint}</span>}
    </div>
  );
}
