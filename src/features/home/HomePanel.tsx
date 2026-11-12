/**
 * Home tab: the cards picked in Settings → Beranda, in the user's order. The
 * big clock spans the full width; the other cards share the row below.
 */
import type { ReactNode } from "react";
import { ImagePlus, Moon, Sun } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import type { ClockSize } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { openSettingsWindow } from "../../core/shell/shellBridge";
import { formatClock, formatLongDate } from "../../shared/format";
import { useNow } from "../../shared/useNow";
import { HOME_CARD_IDS } from "./homeCards";
import { homeImage } from "./homeImage";
import { PixelCat } from "./pet/PixelCat";
import { usePetMood } from "./pet/usePetMood";
import { formatOffset, isValidZone, zoneLabel, zoneTime } from "./worldClock";

const CLOCK_TEXT: Record<ClockSize, string> = { small: "text-2xl", medium: "text-4xl", large: "text-6xl" };
const CARD_HEIGHT = 132;

export default function HomePanel(_props: TabPanelProps) {
  const s = useSettings();
  const cards = s.homeCards.filter((id) => HOME_CARD_IDS.includes(id));
  const showClock = cards.includes("clock");
  const small = cards.filter((id) => id !== "clock");

  if (cards.length === 0) {
    return (
      <EmptyHint onClick={() => openSettingsWindow("home")}>Beranda kosong · klik untuk memilih kartu</EmptyHint>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      {showClock && <ClockCard size={s.clockSize} />}
      {small.length > 0 && (
        <div className="flex gap-3" style={{ height: CARD_HEIGHT }}>
          {small.map((id) => (
            <div key={id} className="min-w-0 flex-1">
              {id === "worldClocks" && <WorldClocksCard zones={s.worldClocks} />}
              {id === "image" && <ImageCard fit={s.homeImageFit} />}
              {id === "pet" && <PetCard />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClockCard({ size }: { size: ClockSize }) {
  const now = useNow(1000);
  return (
    <div className="flex items-center justify-center gap-5 py-1">
      <span className={`${CLOCK_TEXT[size]} font-semibold tabular-nums tracking-tight`}>{formatClock(now)}</span>
      <span className="h-8 w-px bg-notch-fg/15" aria-hidden />
      <span className="text-sm leading-snug text-notch-muted">{formatLongDate(now)}</span>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass-well h-full w-full overflow-hidden rounded-2xl ${className}`}>{children}</div>;
}

function EmptyHint({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-4 text-center text-xs text-notch-muted transition-colors hover:bg-notch-fg/[0.06] hover:text-notch-fg"
    >
      {children}
    </button>
  );
}

function WorldClocksCard({ zones }: { zones: string[] }) {
  const now = useNow(15_000);
  const valid = zones.filter(isValidZone);
  if (valid.length === 0) {
    return (
      <Card>
        <EmptyHint onClick={() => openSettingsWindow("home")}>
          <Sun size={16} />
          Tambah kota
        </EmptyHint>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col justify-center gap-1.5 px-3 py-2.5">
      {valid.map((zone) => {
        const t = zoneTime(now, zone);
        const day = t.hour >= 6 && t.hour < 18;
        const Icon = day ? Sun : Moon;
        return (
          <div key={zone} className="flex items-center gap-2 text-xs">
            <Icon size={12} className={day ? "shrink-0 text-amber-400" : "shrink-0 text-sky-300"} />
            <span className="min-w-0 flex-1 truncate font-medium" data-tip={zoneLabel(zone)} data-tip-truncated>
              {zoneLabel(zone)}
            </span>
            <span className="shrink-0 text-[10px] text-notch-muted">
              {t.dayShift > 0 ? "Besok · " : t.dayShift < 0 ? "Kemarin · " : ""}
              {formatOffset(t.offsetMin)}
            </span>
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{t.time}</span>
          </div>
        );
      })}
    </Card>
  );
}

function ImageCard({ fit }: { fit: "cover" | "contain" }) {
  const src = homeImage.use();
  if (!src) {
    return (
      <Card>
        <EmptyHint onClick={() => openSettingsWindow("home")}>
          <ImagePlus size={16} />
          Pilih gambar
        </EmptyHint>
      </Card>
    );
  }
  return (
    <Card>
      <img src={src} alt="" draggable={false} className="h-full w-full" style={{ objectFit: fit }} />
    </Card>
  );
}

function PetCard() {
  const s = useSettings();
  const { mood, pet } = usePetMood();
  const caption = { idle: "Elus aku", happy: "Purrr…", dance: "♪ Joget dulu", sleep: "Lagi tidur" }[mood];
  return (
    <Card>
      <button
        type="button"
        onClick={pet}
        aria-label="Elus kucing"
        className="flex h-full w-full flex-col items-center justify-center gap-1.5"
      >
        <PixelCat mood={mood} color={s.petColor} size={76} />
        <span className="text-[11px] text-notch-muted">{caption}</span>
      </button>
    </Card>
  );
}
