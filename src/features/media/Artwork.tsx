import { Music } from "lucide-react";

interface ArtworkProps {
  src: string | null;
  className: string;
  iconSize: number;
}

/** Cover art, or a music-note placeholder when the app provides none. */
export function Artwork({ src, className, iconSize }: ArtworkProps) {
  if (src) return <img src={src} alt="" draggable={false} className={`${className} object-cover`} />;
  return (
    <div className={`${className} flex items-center justify-center bg-notch-fg/10 text-notch-muted`}>
      <Music size={iconSize} strokeWidth={1.8} />
    </div>
  );
}
