/**
 * Building blocks of the settings window: groups, rows and glass controls.
 * Every control is controlled (value + onChange) and knows nothing about the
 * settings store.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A titled card of rows. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {title && <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-notch-muted">{title}</h3>}
      <div className="flex flex-col divide-y divide-notch-fg/[0.07] rounded-2xl bg-notch-fg/[0.045] ring-1 ring-inset ring-notch-fg/[0.06]">
        {children}
      </div>
    </section>
  );
}

interface RowProps {
  title: string;
  hint?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
  /** Content under the row (e.g. an error), full width. */
  below?: ReactNode;
}

/** Label on the left, control on the right. */
export function Row({ title, hint, disabled, children, below }: RowProps) {
  return (
    <div className={`flex flex-col gap-2 px-4 py-3 transition-opacity ${disabled ? "opacity-45" : ""}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium">{title}</span>
          {hint && <span className="text-xs leading-snug text-notch-muted">{hint}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
      {below}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** iOS-style switch. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-notch-accent" : "glass-well"
      } ${disabled ? "cursor-default" : ""}`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.35)] transition-[left] duration-200 ${
          checked ? "left-[19px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

/** Glass segmented control for a handful of choices. */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="glass-well flex rounded-full p-[3px]" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active ? "glass-button text-notch-fg" : "text-notch-muted hover:text-notch-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface SelectProps<T extends string> {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

/** Native select (the OS draws the list) dressed as a glass well. */
export function Select<T extends string>({ value, options, onChange, label }: SelectProps<T>) {
  return (
    <div className="glass-well relative flex items-center rounded-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className="max-w-[240px] cursor-pointer appearance-none bg-transparent py-1 pl-3 pr-8 text-xs font-medium text-notch-fg outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-notch-muted" />
    </div>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  /** Text shown next to the slider, e.g. "0,6 dtk". */
  format: (value: number) => string;
}

/**
 * Glass slider. Shows the value while dragging and saves on every step; the
 * local state keeps the thumb smooth when the store answers a frame later.
 */
export function Slider({ value, min, max, step, onChange, label, format }: SliderProps) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="glass-slider w-40"
        min={min}
        max={max}
        step={step}
        value={local}
        aria-label={label}
        onChange={(e) => {
          const next = Number(e.target.value);
          setLocal(next);
          onChange(next);
        }}
      />
      <span className="w-14 text-right text-xs tabular-nums text-notch-muted">{format(local)}</span>
    </div>
  );
}

/** Small text button (secondary actions such as "reset"). */
export function TextButton({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-button rounded-full px-3 py-1 text-xs font-medium ${danger ? "text-[#ff453a]" : "text-notch-fg"}`}
    >
      {children}
    </button>
  );
}
