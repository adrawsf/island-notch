import { useEffect, useState } from "react";
import { HardDrive, Usb, X } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { showToast } from "../../core/toast/toastQueue";
import { useAppIcon } from "../sound/mixerBridge";
import {
  batteryIcon,
  endApp,
  formatBytes,
  formatDuration,
  formatRate,
  useDisks,
  useLive,
  useTopApps,
  type AppSort,
  type AppUsage,
  type Battery,
  type Live,
} from "./sysmonBridge";

type View = "apps" | "disks";

/** Sistem tab: live CPU, memory, GPU and network, the heaviest apps, disks and battery. */
export default function SystemPanel(_props: TabPanelProps) {
  const live = useLive();
  const [view, setView] = useState<View>("apps");

  return (
    <div className="flex flex-col gap-2">
      <Stats live={live} />
      <div className="flex items-center gap-2 px-0.5">
        <div className="glass-well flex rounded-full p-0.5 text-[11px] font-semibold" role="tablist">
          {(
            [
              ["apps", "Aplikasi berat"],
              ["disks", "Penyimpanan"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-full px-3 py-1 transition-colors ${
                view === id ? "bg-notch-fg/15 text-notch-fg" : "text-notch-muted hover:text-notch-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {live?.battery && <BatteryChip battery={live.battery} />}
      </div>
      <div className="h-[140px]">{view === "apps" ? <AppList /> : <DiskList />}</div>
    </div>
  );
}

// ---------- Live numbers ----------

function Stats({ live }: { live: Live | null }) {
  const history = live?.history ?? [];
  const now = history[history.length - 1];
  const gpu = live?.gpus[0];
  const netMax = Math.max(64 * 1024, ...history.map((s) => Math.max(s.down, s.up)));

  return (
    <div className="grid grid-cols-4 gap-2">
      <StatCard
        label="CPU"
        value={now ? `${Math.round(now.cpu)}%` : "–"}
        detail={shortCpuName(live?.cpuName ?? "")}
        tip={live?.cpuName ? `${live.cpuName} · ${live.cores} thread` : undefined}
        values={history.map((s) => s.cpu)}
        color="text-sky-400"
        hot={!!now && now.cpu >= 90}
      />
      <StatCard
        label="Memori"
        value={now ? `${Math.round(now.ram)}%` : "–"}
        detail={live ? `${formatBytes(live.memory.used)} / ${formatBytes(live.memory.total)}` : ""}
        values={history.map((s) => s.ram)}
        color="text-violet-400"
        hot={!!now && now.ram >= 90}
      />
      <StatCard
        label="GPU"
        value={gpu ? `${Math.round(gpu.usage)}%` : "–"}
        detail={gpu ? `${formatBytes(gpu.memoryUsed)} / ${formatBytes(gpu.memoryTotal)}` : live ? "Tidak terbaca" : ""}
        tip={live?.gpus.map((g) => `${g.name}: ${Math.round(g.usage)}%`).join("\n") || undefined}
        values={history.map((s) => s.gpu ?? 0)}
        color="text-emerald-400"
      />
      <StatCard
        label="Jaringan"
        value={now ? `↓ ${formatRate(now.down)}` : "–"}
        detail={now ? `↑ ${formatRate(now.up)}` : ""}
        values={history.map((s) => (s.down / netMax) * 100)}
        second={history.map((s) => (s.up / netMax) * 100)}
        color="text-amber-400"
        small
      />
    </div>
  );
}

/** "AMD Ryzen 7 5800H with Radeon Graphics" → "Ryzen 7 5800H". */
function shortCpuName(name: string): string {
  return name
    .replace(/\(R\)|\(TM\)|®|™/gi, "")
    .replace(/\b(AMD|Intel|Core|CPU|Processor)\b/gi, "")
    .replace(/\bwith .*$/i, "")
    .replace(/@.*$/, "")
    .replace(/\b\d+-Core\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function StatCard({
  label,
  value,
  detail,
  tip,
  values,
  second,
  color,
  hot = false,
  small = false,
}: {
  label: string;
  value: string;
  detail: string;
  tip?: string;
  values: number[];
  second?: number[];
  color: string;
  hot?: boolean;
  small?: boolean;
}) {
  return (
    <div className="glass-well relative flex h-[84px] flex-col overflow-hidden rounded-2xl px-3 pb-1.5 pt-1.5" data-tip={tip}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-notch-muted">{label}</span>
      <span
        className={`truncate font-semibold tabular-nums leading-tight ${small ? "mt-0.5 text-[13px]" : "text-xl"} ${
          hot ? "text-red-400" : ""
        }`}
      >
        {value}
      </span>
      <span className="truncate text-[10.5px] tabular-nums text-notch-muted">{detail}</span>
      <Sparkline values={values} second={second} className={`absolute inset-x-0 bottom-0 h-6 ${hot ? "text-red-400" : color}`} />
    </div>
  );
}

const SPARK_POINTS = 60;

function points(values: number[]): string {
  const offset = SPARK_POINTS - values.length;
  return values
    .map((v, i) => `${((offset + i) / (SPARK_POINTS - 1)) * 100},${30 - (Math.max(0, Math.min(100, v)) / 100) * 28}`)
    .join(" ");
}

/** The last minute as a line with a soft fill. Values are 0-100. */
function Sparkline({ values, second, className }: { values: number[]; second?: number[]; className: string }) {
  if (values.length < 2) return null;
  const line = points(values);
  const start = ((SPARK_POINTS - values.length) / (SPARK_POINTS - 1)) * 100;
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={`pointer-events-none ${className}`} aria-hidden>
      <polygon points={`${start},30 ${line} 100,30`} fill="currentColor" opacity={0.14} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {second && second.length > 1 && (
        <polyline
          points={points(second)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.6}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

// ---------- Battery ----------

function BatteryChip({ battery }: { battery: Battery }) {
  const Icon = batteryIcon(battery);
  const status = battery.charging
    ? "Mengisi daya"
    : battery.plugged
      ? "Tersambung ke charger"
      : battery.secondsLeft
        ? `Sisa ±${formatDuration(battery.secondsLeft)}`
        : "Pakai baterai";
  const low = !battery.plugged && battery.percent <= 20;
  return (
    <span
      className={`flex items-center gap-1.5 text-[11px] font-semibold tabular-nums ${low ? "text-red-400" : "text-notch-muted"}`}
      data-tip={status}
    >
      <Icon size={15} className={battery.charging ? "text-emerald-400" : undefined} />
      {battery.percent}%<span className="font-normal">· {status}</span>
    </span>
  );
}

// ---------- Heaviest apps ----------

function AppList() {
  const [sort, setSort] = useState<AppSort>("cpu");
  const [refresh, setRefresh] = useState(0);
  const apps = useTopApps(sort, refresh);

  const header = (key: AppSort, label: string, width: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={`${width} shrink-0 text-right transition-colors ${sort === key ? "text-notch-fg" : "hover:text-notch-fg"}`}
      aria-pressed={sort === key}
      data-tip={`Urutkan menurut ${label}`}
    >
      {label}
      {sort === key ? " ↓" : ""}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-notch-muted">
        <span className="flex-1">Aplikasi</span>
        {header("cpu", "CPU", "w-12")}
        {header("memory", "Memori", "w-16")}
        <span className="w-12 shrink-0" />
      </div>
      {apps === null ? (
        <div className="flex flex-1 items-center justify-center text-xs text-notch-muted">Menghitung…</div>
      ) : (
        <ul className="flex flex-col">
          {apps.map((app) => (
            <AppRow key={app.key} app={app} onEnded={() => setRefresh((r) => r + 1)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AppRow({ app, onEnded }: { app: AppUsage; onEnded: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const icon = useAppIcon(app.exePath);

  // The confirmation expires so a stray later click does nothing.
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  const end = async () => {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    const error = await endApp(app.key);
    if (error) showToast({ title: `${app.name} tidak bisa diakhiri`, body: error, durationMs: 5000 });
    onEnded();
  };

  return (
    <li className="flex h-[23px] items-center gap-2 rounded-lg px-2.5 hover:bg-notch-fg/[0.04]">
      {icon ? (
        <img src={icon} alt="" className="h-4 w-4 shrink-0" draggable={false} />
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-notch-fg/10 text-[9px] font-bold uppercase text-notch-muted">
          {app.name.charAt(0)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[12.5px]" data-tip-truncated data-tip={app.name}>
        {app.name}
        {app.processes > 1 && <span className="ml-1.5 text-[10.5px] text-notch-muted">{app.processes} proses</span>}
      </span>
      <span className="w-12 shrink-0 text-right text-[11.5px] tabular-nums">{app.cpu.toFixed(1)}%</span>
      <span className="w-16 shrink-0 text-right text-[11.5px] tabular-nums text-notch-muted">{formatBytes(app.memory)}</span>
      <span className="flex w-12 shrink-0 justify-end">
        {app.canEnd && (
          <button
            type="button"
            onClick={end}
            className={`flex h-5 items-center justify-center rounded-full transition-colors ${
              confirm ? "bg-red-500/85 px-2 text-[10.5px] font-semibold text-white" : "w-5 text-notch-muted hover:bg-notch-fg/10 hover:text-red-400"
            }`}
            aria-label={`Akhiri ${app.name}`}
            data-tip={confirm ? "Klik lagi untuk mengakhiri. Yang belum disimpan bisa hilang." : "Akhiri aplikasi"}
          >
            {confirm ? "Akhiri" : <X size={12} />}
          </button>
        )}
      </span>
    </li>
  );
}

// ---------- Disks ----------

function DiskList() {
  const disks = useDisks();
  if (!disks) return <div className="flex h-full items-center justify-center text-xs text-notch-muted">Membaca disk…</div>;
  return (
    <ul className="flex h-full flex-col gap-1 overflow-y-auto [scrollbar-width:thin]">
      {disks.map((d) => {
        const used = 1 - d.free / d.total;
        const Icon = d.removable ? Usb : HardDrive;
        const letter = d.root.replace(/\\$/, "");
        return (
          <li key={d.root} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5">
            <Icon size={16} className="shrink-0 text-notch-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {d.label || (d.removable ? "Disk lepas" : "Disk lokal")} ({letter})
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-notch-muted">
                  {formatBytes(d.free)} kosong dari {formatBytes(d.total)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-notch-fg/10">
                <div
                  className={`h-full rounded-full ${used >= 0.9 ? "bg-red-400" : "bg-sky-400"}`}
                  style={{ width: `${Math.max(2, used * 100)}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
