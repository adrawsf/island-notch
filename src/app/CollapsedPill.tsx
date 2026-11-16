import { Fragment, useEffect, useRef, useState, type WheelEvent } from "react";
import { resolveIdleWidgets } from "./idle/idleWidgets";
import { VolumeLine } from "../features/media/MediaPill";
import { VOLUME_STEP } from "../features/media/volume";
import { stepMaster, type Level } from "../features/sound/mixerBridge";

/** How long the volume level stays in the pill after the last wheel step. */
const VOLUME_FLASH_MS = 1200;

interface CollapsedPillProps {
  /** Widget ids from the `idleWidgets` setting, in display order. */
  widgets: string[];
  onClick: () => void;
  /** The wheel changed the volume: the notch should stay collapsed. */
  onWheelVolume?: () => void;
}

/**
 * The idle notch: the chosen widgets side by side, and nothing more. Its
 * width is exactly its content plus padding, so one widget makes a small
 * pill and three make a wider one. With no widgets it is a small blank pill.
 * The wheel changes the master volume, shown in place of the widgets.
 */
export function CollapsedPill({ widgets, onClick, onWheelVolume }: CollapsedPillProps) {
  const items = resolveIdleWidgets(widgets);
  const [level, setLevel] = useState<Level | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY === 0) return;
    onWheelVolume?.();
    stepMaster(e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP).then((next) => next && setLevel(next));
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), VOLUME_FLASH_MS);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onWheel={onWheel}
      aria-label="Buka notch"
      className="flex h-8 min-w-[64px] items-center justify-center gap-2 px-3.5 text-[13px] tracking-tight"
    >
      {flash && level ? (
        <span className="text-[12px] font-semibold">
          <VolumeLine volume={level.volume} muted={level.muted} />
        </span>
      ) : (
        items.map(({ id, Component }, i) => (
          <Fragment key={id}>
            {i > 0 && <span className="h-1 w-1 rounded-full bg-notch-fg/30" aria-hidden />}
            <Component />
          </Fragment>
        ))
      )}
    </button>
  );
}
