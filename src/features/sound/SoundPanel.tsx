import { useState } from "react";
import { Bell, Check, ChevronDown, Headphones, Mic, MicOff, Speaker } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { volumeIcon } from "../media/VolumeControl";
import {
  setAppLevel,
  setMaster,
  setMicMuted,
  setOutput,
  useAppIcon,
  useMixer,
  type AppSession,
  type Endpoint,
  type Level,
} from "./mixerBridge";

/** Suara tab: output device, master volume, microphone mute, and one slider per app. */
export default function SoundPanel(_props: TabPanelProps) {
  const mixer = useMixer();
  const [picking, setPicking] = useState(false);
  const output = mixer.outputs.find((o) => o.id === mixer.outputId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          disabled={mixer.outputs.length === 0}
          className="glass-well flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-left text-xs font-semibold disabled:opacity-50"
          aria-expanded={picking}
          data-tip="Pilih output suara"
        >
          <DeviceIcon name={output?.name ?? ""} />
          <span className="min-w-0 flex-1 truncate">{output?.name ?? "Tidak ada output suara"}</span>
          <ChevronDown size={13} className={`shrink-0 text-notch-muted transition-transform ${picking ? "rotate-180" : ""}`} />
        </button>
        {mixer.mic && (
          <button
            type="button"
            onClick={() => setMicMuted(!mixer.mic!.muted)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              mixer.mic.muted ? "bg-red-500/85 text-white" : "glass-button"
            }`}
            aria-pressed={mixer.mic.muted}
            data-tip={`${mixer.mic.name} · klik untuk ${mixer.mic.muted ? "menyalakan" : "membisukan"}`}
          >
            {mixer.mic.muted ? <MicOff size={14} /> : <Mic size={14} />}
            {mixer.mic.muted ? "Mic mati" : "Mic"}
          </button>
        )}
      </div>

      {picking ? (
        <OutputList
          outputs={mixer.outputs}
          current={mixer.outputId}
          onPick={(id) => {
            setOutput(id);
            setPicking(false);
          }}
        />
      ) : (
        <>
          {mixer.master && (
            <div className="flex items-center gap-2 px-1">
              <LevelSlider
                level={mixer.master}
                label="Volume utama"
                onChange={(change) => setMaster(change)}
                strong
              />
            </div>
          )}
          <div className="px-2.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-notch-muted">Aplikasi</div>
          <ul className="h-[148px] overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            {mixer.apps.length === 0 ? (
              <li className="flex h-full items-center justify-center text-xs text-notch-muted">
                Belum ada aplikasi yang memutar suara.
              </li>
            ) : (
              mixer.apps.map((app) => <AppRow key={app.key} app={app} />)
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function DeviceIcon({ name }: { name: string }) {
  const Icon = /head|ear|buds|wh-|wf-|airpods/i.test(name) ? Headphones : Speaker;
  return <Icon size={14} className="shrink-0 text-notch-muted" />;
}

function OutputList({
  outputs,
  current,
  onPick,
}: {
  outputs: Endpoint[];
  current: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="h-[190px] overflow-y-auto [scrollbar-width:thin]" role="listbox" aria-label="Output suara">
      {outputs.map((o) => {
        const selected = o.id === current;
        return (
          <li key={o.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onPick(o.id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-notch-fg/[0.07] ${
                selected ? "font-semibold" : ""
              }`}
            >
              <DeviceIcon name={o.name} />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {selected && <Check size={14} className="shrink-0 text-notch-accent" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Mute button, slider and percent for one level. */
function LevelSlider({
  level,
  label,
  onChange,
  strong = false,
}: {
  level: Level;
  label: string;
  onChange: (change: { volume?: number; muted?: boolean }) => void;
  strong?: boolean;
}) {
  const percent = Math.round(level.volume * 100);
  const shown = level.muted ? 0 : percent;
  const Icon = volumeIcon(level.volume, level.muted);
  return (
    <>
      <button
        type="button"
        onClick={() => onChange({ muted: !level.muted })}
        className={`flex ${strong ? "h-7 w-7" : "h-6 w-6"} shrink-0 items-center justify-center rounded-full transition-colors hover:bg-notch-fg/10 ${
          level.muted ? "text-red-400" : "text-notch-muted hover:text-notch-fg"
        }`}
        aria-label={level.muted ? `Bunyikan ${label}` : `Bisukan ${label}`}
        aria-pressed={level.muted}
        data-tip={level.muted ? "Bunyikan" : "Bisukan"}
      >
        <Icon size={strong ? 15 : 13} />
      </button>
      <input
        type="range"
        className="glass-slider min-w-0 flex-1"
        min={0}
        max={100}
        step={1}
        value={shown}
        onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
        // Only the master: in the app list the wheel scrolls the list.
        onWheel={(e) => {
          if (strong && e.deltaY !== 0) onChange({ volume: Math.max(0, Math.min(100, percent + (e.deltaY < 0 ? 5 : -5))) / 100 });
        }}
        aria-label={label}
        data-tip={`${label} ${shown}%`}
      />
      <span className={`w-9 shrink-0 text-right tabular-nums text-notch-muted ${strong ? "text-xs" : "text-[11px]"}`}>{shown}%</span>
    </>
  );
}

function AppRow({ app }: { app: AppSession }) {
  return (
    <li className="flex items-center gap-2 rounded-xl px-2.5 py-1 hover:bg-notch-fg/[0.04]">
      <AppIcon app={app} />
      <span className="flex w-[124px] shrink-0 items-center gap-1.5 text-[13px]" data-tip-truncated data-tip={app.name}>
        <span className="min-w-0 truncate">{app.name}</span>
        {app.active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-label="sedang berbunyi" />}
      </span>
      <LevelSlider level={app} label={app.name} onChange={(change) => setAppLevel(app.key, change)} />
    </li>
  );
}

function AppIcon({ app }: { app: AppSession }) {
  const src = useAppIcon(app.exePath);
  if (app.system) {
    return (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-notch-fg/10 text-notch-muted">
        <Bell size={12} />
      </span>
    );
  }
  if (src) return <img src={src} alt="" className="h-[22px] w-[22px] shrink-0" draggable={false} />;
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-notch-fg/10 text-[11px] font-bold uppercase text-notch-muted">
      {app.name.charAt(0)}
    </span>
  );
}
