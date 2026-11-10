import type { ReactNode } from "react";
import { openMediaSource, type MediaState } from "./mediaBridge";
import { appDisplayName } from "./mediaFormat";

interface SourceLinkProps {
  media: MediaState;
  /** Called after the source app was brought forward (e.g. collapse the notch). */
  onOpened?: () => void;
  className?: string;
  children: ReactNode;
}

/** Makes cover/title clickable: opens the app (or browser) that is playing. */
export function SourceLink({ media, onOpened, className = "", children }: SourceLinkProps) {
  return (
    <button
      type="button"
      onClick={async () => {
        if (await openMediaSource()) onOpened?.();
      }}
      className={`min-w-0 text-left transition-opacity hover:opacity-80 active:opacity-60 ${className}`}
      data-tip={`Buka di ${appDisplayName(media.appId)}`}
    >
      {children}
    </button>
  );
}
