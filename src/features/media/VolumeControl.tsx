import type { WheelEvent } from "react";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import type { MediaState } from "./mediaBridge";
import { iconButton } from "./MediaControls";
import { setAppVolume, stepAppVolume, useAppVolume, VOLUME_STEP } from "./volume";

/** Speaker icon for a level (muted counts as silent). */
export function volumeIcon(volume: number, muted: boolean) {
  if (muted || volume === 0) return VolumeX;
  if (volume < 0.34) return Volume;
  if (volume < 0.67) return Volume1;
  return Volume2;
}

/**
 * Mute button + slider for the app that is playing. Hidden when its audio
 * session cannot be found (nothing to control).
 */
export function VolumeControl({
  media,
  className = "",
  variant = "full",
}: {
  media: MediaState;
  className?: string;
  /** "full": icon, slider, percent. "mini": icon and a short slider. "icon": mute button only (wheel still works). */
  variant?: "full" | "mini" | "icon";
}) {
  const state = useAppVolume(media);
  if (!state) return null;
  const { volume, muted } = state;
  const Icon = volumeIcon(volume, muted);
  const percent = Math.round(volume * 100);

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY !== 0) stepAppVolume(e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP);
  };

  return (
    <div className={`flex items-center ${variant === "full" ? "gap-2" : "gap-1"} ${className}`} onWheel={onWheel}>
      <button
        type="button"
        onClick={() => setAppVolume({ muted: !muted })}
        onPointerDown={(e) => e.stopPropagation()}
        className={`${iconButton} ${variant === "full" ? "h-7 w-7" : "h-6 w-6"} shrink-0 text-notch-muted hover:text-notch-fg`}
        aria-label={muted ? "Bunyikan" : "Bisukan"}
        aria-pressed={muted}
        data-tip={variant === "icon" ? `Volume ${muted ? 0 : percent}% · scroll untuk ubah` : muted ? "Bunyikan" : "Bisukan"}
      >
        <Icon size={variant === "full" ? 15 : 13} />
      </button>
      {variant !== "icon" && (
        <input
          type="range"
          className={`glass-slider min-w-0 ${variant === "mini" ? "w-20" : "flex-1"}`}
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : percent}
          onChange={(e) => setAppVolume({ volume: Number(e.target.value) / 100 })}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Volume"
          data-tip={`Volume ${muted ? 0 : percent}%`}
        />
      )}
      {variant === "full" && (
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-notch-muted">{muted ? "0" : percent}%</span>
      )}
    </div>
  );
}
