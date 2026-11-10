import type { ComponentType } from "react";
import { CloudRain, Flame, Volume2, VolumeX, Waves, Wind } from "lucide-react";
import { updateSetting } from "../../../core/settings/settings";
import { useSettings } from "../../../core/settings/useSettings";
import { previewAmbience } from "./ambience";
import { AMBIENCE_SOUNDS, type AmbienceId } from "./sounds";

const ICONS: Partial<Record<AmbienceId, ComponentType<{ size?: number }>>> = {
  rain: CloudRain,
  ocean: Waves,
  fire: Flame,
  wind: Wind,
};
/** Noise colours read better as words than icons. */
const SHORT: Partial<Record<AmbienceId, string>> = { brown: "Brown", pink: "Pink", white: "White" };

/**
 * Ambience for focus sessions: pick a sound (plays a short preview when the
 * timer is not running) and set its volume. It plays during focus only.
 */
export function AmbiencePicker() {
  const { ambienceSound, ambienceVolume } = useSettings();
  const chip = (active: boolean) =>
    `flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-medium transition-colors ${
      active ? "glass-button text-notch-fg" : "text-notch-muted hover:bg-notch-fg/10 hover:text-notch-fg"
    }`;

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[11px] text-notch-muted" data-tip="Diputar otomatis selama sesi fokus berjalan">
        Ambience
      </span>
      <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Suara ambience">
        <button
          type="button"
          role="radio"
          aria-checked={ambienceSound === "none"}
          onClick={() => updateSetting("ambienceSound", "none")}
          className={chip(ambienceSound === "none")}
          data-tip="Tanpa suara"
          aria-label="Tanpa suara"
        >
          <VolumeX size={13} />
        </button>
        {AMBIENCE_SOUNDS.map(({ id, label }) => {
          const Icon = ICONS[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={ambienceSound === id}
              onClick={() => {
                updateSetting("ambienceSound", id);
                previewAmbience(id);
              }}
              className={chip(ambienceSound === id)}
              data-tip={label}
              aria-label={label}
            >
              {Icon ? <Icon size={13} /> : SHORT[id]}
            </button>
          );
        })}
      </div>
      <span className="flex-1" />
      <Volume2 size={13} className={`shrink-0 text-notch-muted ${ambienceSound === "none" ? "opacity-40" : ""}`} />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={ambienceVolume}
        disabled={ambienceSound === "none"}
        onChange={(e) => updateSetting("ambienceVolume", Number(e.target.value))}
        className="glass-slider w-20 shrink-0 disabled:opacity-40"
        aria-label="Volume ambience"
        data-tip={`Volume ${Math.round(ambienceVolume * 100)}%`}
      />
    </div>
  );
}
