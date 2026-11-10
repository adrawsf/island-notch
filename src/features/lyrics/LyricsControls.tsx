import { RotateCcw } from "lucide-react";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import type { MediaState } from "../media/mediaBridge";
import { LYRICS_SOURCE_OPTIONS, providerName } from "./sources";
import { OFFSET_LIMIT_MS, setLyricsOffset, useLyricsOffset, type LyricsResult } from "./useLyrics";

/** Short chip labels; the full names stay in the tooltip. */
const CHIP_LABEL: Record<string, string> = { auto: "Otomatis", qqmusic: "QQ" };

/** "+1,5 dtk" / "−0,5 dtk" / "0 dtk" */
function formatOffset(ms: number): string {
  if (ms === 0) return "0 dtk";
  const s = (Math.abs(ms) / 1000).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${ms > 0 ? "+" : "−"}${s} dtk`;
}

/**
 * Lyrics settings for the Media tab: source chips and a timing slider for the
 * current track. Left of centre shows lines earlier, right shows them later.
 */
export function LyricsSettings({ media, result }: { media: MediaState; result: LyricsResult }) {
  const { lyricsSource } = useSettings();
  const offset = useLyricsOffset(media);
  const found = result.status === "found" ? result.lyrics.provider : null;
  const synced = result.status === "found" && result.lyrics.synced && !media.tabOnly;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] text-notch-muted">Sumber</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Sumber lirik">
          {LYRICS_SOURCE_OPTIONS.map((o) => {
            const active = o.id === lyricsSource;
            const label = CHIP_LABEL[o.id] ?? providerName(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateSetting("lyricsSource", o.id)}
                data-tip={o.id === "auto" && found ? `Otomatis: dipakai ${providerName(found)}` : o.label}
                className={`h-6 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                  active ? "glass-button text-notch-fg" : "text-notch-muted hover:bg-notch-fg/10 hover:text-notch-fg"
                }`}
              >
                {label}
                {o.id === "auto" && active && found && <span className="opacity-60"> · {providerName(found)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`flex items-center gap-2 ${synced ? "" : "opacity-40"}`}>
        <span className="w-12 shrink-0 text-[11px] text-notch-muted">Timing</span>
        <span className="text-[10px] text-notch-muted">Cepat</span>
        <input
          type="range"
          min={-OFFSET_LIMIT_MS}
          max={OFFSET_LIMIT_MS}
          step={100}
          value={offset}
          disabled={!synced}
          onChange={(e) => setLyricsOffset(media, Number(e.target.value))}
          onDoubleClick={() => setLyricsOffset(media, 0)}
          className="glass-slider min-w-0 flex-1"
          aria-label="Geser timing lirik"
          aria-valuetext={formatOffset(offset)}
          data-tip="Geser untuk menyamakan lirik dengan lagu (klik dua kali untuk reset)"
        />
        <span className="text-[10px] text-notch-muted">Lambat</span>
        <button
          type="button"
          disabled={!synced || offset === 0}
          onClick={() => setLyricsOffset(media, 0)}
          className="flex h-6 w-[72px] shrink-0 items-center justify-center gap-1 rounded-full text-[11px] tabular-nums text-notch-fg transition-colors hover:bg-notch-fg/10 disabled:hover:bg-transparent"
          data-tip="Reset timing lagu ini"
        >
          {offset !== 0 && <RotateCcw size={10} />}
          {formatOffset(offset)}
        </button>
      </div>
    </div>
  );
}
