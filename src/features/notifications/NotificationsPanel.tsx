import { useEffect, useState, type ReactNode } from "react";
import { Bell, BellOff, ChevronDown, ShieldAlert, Sparkles, X } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { showToast } from "../../core/toast/toastQueue";
import { useNow } from "../../shared/useNow";
import {
  notchHistory,
  openNotificationApp,
  openNotificationSettings,
  relativeTime,
  removeNotifications,
  useNotificationIcon,
  useWindowsNotifications,
  type AccessStatus,
} from "./notifBridge";

/** One row, from Windows or from the notch itself. */
interface Row {
  key: string;
  title: string;
  body: string;
  time: number;
  remove: () => void;
  open?: () => void;
}

interface Group {
  /** App User Model ID, or "notch". */
  id: string;
  name: string;
  rows: Row[];
  latest: number;
}

const NOTCH_GROUP = "notch";

/** Notifikasi tab: Windows notifications grouped by app, plus the notch's own toasts. */
export default function NotificationsPanel(_props: TabPanelProps) {
  const list = useWindowsNotifications();
  const history = notchHistory.use();
  const { notificationMutedApps } = useSettings();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const now = useNow(30_000).getTime();

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const groups = new Map<string, Group>();
  for (const n of list?.items ?? []) {
    const id = n.appId || n.appName;
    const group = groups.get(id) ?? { id, name: n.appName, rows: [], latest: 0 };
    group.rows.push({
      key: `w${n.id}`,
      title: n.title || n.appName,
      body: n.body,
      time: n.time,
      remove: () => removeNotifications([n.id]),
      open: n.appId
        ? async () => {
            const error = await openNotificationApp(n.appId);
            if (error) showToast({ title: `${n.appName} tidak bisa dibuka`, body: error });
          }
        : undefined,
    });
    group.latest = Math.max(group.latest, n.time);
    groups.set(id, group);
  }
  if (history.length > 0) {
    groups.set(NOTCH_GROUP, {
      id: NOTCH_GROUP,
      name: "Island Notch",
      latest: history[0].time,
      rows: history.map((e) => ({
        key: e.id,
        title: e.title,
        body: e.body,
        time: e.time,
        remove: () => notchHistory.set((prev) => prev.filter((x) => x.id !== e.id)),
      })),
    });
  }
  const sorted = [...groups.values()].sort((a, b) => b.latest - a.latest);
  const total = sorted.reduce((sum, g) => sum + g.rows.length, 0);

  const clearGroup = (g: Group) => {
    if (g.id === NOTCH_GROUP) notchHistory.set([]);
    else removeNotifications((list?.items ?? []).filter((n) => (n.appId || n.appName) === g.id).map((n) => n.id));
  };

  const toggleMute = (g: Group) => {
    const muted = notificationMutedApps.some((m) => m.id === g.id);
    updateSetting(
      "notificationMutedApps",
      muted ? notificationMutedApps.filter((m) => m.id !== g.id) : [...notificationMutedApps, { id: g.id, name: g.name }],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-notch-muted">
          {total === 0 ? "Notifikasi" : `${total} notifikasi`}
        </span>
        <span className="flex-1" />
        {total > 0 && (
          <button
            type="button"
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true);
              setConfirmClear(false);
              sorted.forEach(clearGroup);
            }}
            className={`flex h-7 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
              confirmClear ? "bg-red-500/85 text-white" : "glass-button"
            }`}
            data-tip="Juga dihapus dari pusat notifikasi Windows"
          >
            {confirmClear ? "Yakin? Klik lagi" : "Hapus semua"}
          </button>
        )}
      </div>

      {list && list.status !== "allowed" && <AccessBanner status={list.status} />}

      {total === 0 ? (
        <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 text-center text-notch-muted">
          <Bell size={22} />
          <span className="text-[13px] font-semibold text-notch-fg">Belum ada notifikasi</span>
          <span className="text-[11px]">Notifikasi dari aplikasi Windows dan dari notch muncul di sini.</span>
        </div>
      ) : (
        <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          {sorted.map((g) => (
            <GroupView
              key={g.id}
              group={g}
              now={now}
              collapsed={collapsed.has(g.id)}
              muted={notificationMutedApps.some((m) => m.id === g.id)}
              onToggle={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.id)) next.delete(g.id);
                  else next.add(g.id);
                  return next;
                })
              }
              onMute={g.id === NOTCH_GROUP ? undefined : () => toggleMute(g)}
              onClear={() => clearGroup(g)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccessBanner({ status }: { status: AccessStatus }) {
  const text =
    status === "off"
      ? "Membaca notifikasi Windows dimatikan di Pengaturan → Notifikasi."
      : status === "denied"
        ? "Windows belum mengizinkan Island Notch membaca notifikasi."
        : "Notifikasi Windows tidak bisa dibaca di perangkat ini. Riwayat notch tetap tercatat.";
  return (
    <div className="glass-well flex items-center gap-2.5 rounded-2xl px-3 py-2 text-xs">
      <ShieldAlert size={16} className="shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      {status === "denied" && (
        <button
          type="button"
          onClick={openNotificationSettings}
          className="glass-button shrink-0 rounded-full px-3 py-1 font-semibold"
        >
          Buka izin
        </button>
      )}
    </div>
  );
}

function GroupView({
  group,
  now,
  collapsed,
  muted,
  onToggle,
  onMute,
  onClear,
}: {
  group: Group;
  now: number;
  collapsed: boolean;
  muted: boolean;
  onToggle: () => void;
  onMute?: () => void;
  onClear: () => void;
}) {
  return (
    <section className="glass-well rounded-2xl px-1.5 pb-1 pt-1">
      <div className="flex h-7 items-center gap-1.5 pl-1">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={!collapsed}>
          <GroupIcon id={group.id} name={group.name} />
          <span className="min-w-0 truncate text-[12px] font-semibold">{group.name}</span>
          <span className="shrink-0 text-[11px] text-notch-muted">{group.rows.length}</span>
          {muted && <BellOff size={11} className="shrink-0 text-notch-muted" aria-label="dibisukan" />}
          <ChevronDown size={13} className={`shrink-0 text-notch-muted transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        {onMute && (
          <IconButton tip={muted ? "Tampilkan lagi di notch" : "Jangan munculkan di notch"} onClick={onMute}>
            {muted ? <Bell size={12} /> : <BellOff size={12} />}
          </IconButton>
        )}
        <IconButton tip="Hapus semua dari aplikasi ini" onClick={onClear}>
          <X size={12} />
        </IconButton>
      </div>
      {!collapsed && (
        <ul className="flex flex-col">
          {group.rows.map((row) => (
            <li key={row.key} className="group relative">
              <button
                type="button"
                onClick={row.open}
                disabled={!row.open}
                className="flex w-full flex-col rounded-xl px-2 py-1.5 text-left transition-colors enabled:hover:bg-notch-fg/[0.06]"
                data-tip={row.open ? `Buka ${group.name}` : undefined}
              >
                <span className="flex items-baseline gap-2 pr-6">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{row.title}</span>
                  <span className="shrink-0 text-[10.5px] text-notch-muted">{relativeTime(row.time, now)}</span>
                </span>
                {row.body && <span className="line-clamp-2 whitespace-pre-line text-[11.5px] leading-snug text-notch-muted">{row.body}</span>}
              </button>
              <span className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton tip="Hapus" onClick={row.remove}>
                  <X size={11} />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupIcon({ id, name }: { id: string; name: string }) {
  const src = useNotificationIcon(id === NOTCH_GROUP ? "" : id);
  if (id === NOTCH_GROUP) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-notch-accent/20 text-notch-accent">
        <Sparkles size={11} />
      </span>
    );
  }
  if (src) return <img src={src} alt="" className="h-5 w-5 shrink-0 rounded-md object-contain" draggable={false} />;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-notch-fg/10 text-[10px] font-bold uppercase text-notch-muted">
      {name.charAt(0)}
    </span>
  );
}

function IconButton({ tip, onClick, children }: { tip: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-notch-muted transition-colors hover:bg-notch-fg/10 hover:text-notch-fg"
      aria-label={tip}
      data-tip={tip}
    >
      {children}
    </button>
  );
}
