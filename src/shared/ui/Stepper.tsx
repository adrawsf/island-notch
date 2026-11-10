import { useEffect, useState, type WheelEvent } from "react";
import { Minus, Plus } from "lucide-react";

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Accessible name, e.g. "Durasi fokus (menit)". */
  label: string;
}

/**
 * Glass number stepper: − value +. The value can also be typed (applied on
 * Enter or blur) or changed with the mouse wheel while hovering.
 */
export function Stepper({ value, min, max, onChange, label }: StepperProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const set = (next: number) => {
    const clamped = Math.max(min, Math.min(max, Math.round(next)));
    if (clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  };

  // Reads the field itself: the draft state may not have re-rendered yet.
  const commit = (text: string) => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) setDraft(String(value));
    else set(n);
  };

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY !== 0) set(value + (e.deltaY < 0 ? 1 : -1));
  };

  const step =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-notch-muted transition-colors hover:bg-notch-fg/10 hover:text-notch-fg disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="glass-well flex h-6 items-center rounded-full" onWheel={onWheel} role="group" aria-label={label}>
      <button type="button" className={step} onClick={() => set(value - 1)} disabled={value <= min} aria-label="Kurangi">
        <Minus size={11} strokeWidth={2.5} />
      </button>
      <input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp") set(value + 1);
          if (e.key === "ArrowDown") set(value - 1);
        }}
        className="w-7 bg-transparent text-center text-xs tabular-nums text-notch-fg outline-none"
        aria-label={label}
      />
      <button type="button" className={step} onClick={() => set(value + 1)} disabled={value >= max} aria-label="Tambah">
        <Plus size={11} strokeWidth={2.5} />
      </button>
    </div>
  );
}
