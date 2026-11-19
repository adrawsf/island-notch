/**
 * Tab registry: the ONLY place a tab needs to be added.
 *
 * To add a feature tab:
 * 1. Build its panel in `src/features/<feature>/` as a default-exported component
 *    that accepts `TabPanelProps`. Let it size itself by its content (no
 *    `h-full`); the shell measures it and fits the notch around it.
 * 2. Add an entry below. Order here is the order in the tab bar.
 */
import { lazy, type ComponentType } from "react";
import { Activity, AudioLines, Bell, ClipboardList, House, Inbox, Music, NotebookPen, ScrollText, Timer } from "lucide-react";
import type { LazyPanel, TabDefinition, TabPanelProps } from "./types";

/** `lazy()` that can also be preloaded. */
function panel(loader: () => Promise<{ default: ComponentType<TabPanelProps> }>): LazyPanel {
  return Object.assign(lazy(loader), { preload: loader });
}

/** Panel width when a tab does not set one (CSS px). */
export const DEFAULT_TAB_WIDTH = 400;

export const TABS: TabDefinition[] = [
  {
    id: "home",
    label: "Beranda",
    icon: House,
    width: 560,
    Panel: panel(() => import("../../features/home/HomePanel")),
  },
  {
    id: "media",
    label: "Media",
    icon: Music,
    width: 560,
    Panel: panel(() => import("../../features/media/MediaPanel")),
  },
  {
    id: "notifications",
    label: "Notifikasi",
    icon: Bell,
    width: 500,
    Panel: panel(() => import("../../features/notifications/NotificationsPanel")),
  },
  {
    id: "sound",
    label: "Suara",
    icon: AudioLines,
    width: 520,
    Panel: panel(() => import("../../features/sound/SoundPanel")),
  },
  {
    id: "system",
    label: "Sistem",
    icon: Activity,
    width: 580,
    Panel: panel(() => import("../../features/system/SystemPanel")),
  },
  {
    id: "notes",
    label: "Catatan",
    icon: NotebookPen,
    width: 540,
    Panel: panel(() => import("../../features/notes/NotesPanel")),
  },
  {
    id: "clipboard",
    label: "Clipboard",
    icon: ClipboardList,
    width: 520,
    Panel: panel(() => import("../../features/clipboard/ClipboardPanel")),
  },
  {
    id: "shelf",
    label: "Shelf",
    icon: Inbox,
    width: 540,
    Panel: panel(() => import("../../features/shelf/ShelfPanel")),
  },
  {
    id: "pomodoro",
    label: "Pomodoro",
    icon: Timer,
    width: 540,
    Panel: panel(() => import("../../features/pomodoro/PomodoroPanel")),
  },
  {
    id: "teleprompter",
    label: "Prompter",
    icon: ScrollText,
    width: 520,
    Panel: panel(() => import("../../features/teleprompter/TeleprompterPanel")),
  },
];

export function findTab(id: string | null): TabDefinition {
  return TABS.find((t) => t.id === id) ?? TABS[0];
}

/** Starts loading every panel so switching tabs never shows an empty notch. */
export function preloadPanels(): void {
  for (const tab of TABS) {
    tab.Panel.preload().catch((err) => console.error(`[tabs] preload ${tab.id}`, err));
  }
}
