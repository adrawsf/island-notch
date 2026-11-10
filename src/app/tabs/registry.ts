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
import { House, Info, ListTodo, Music, NotebookPen, Timer } from "lucide-react";
import type { LazyPanel, TabDefinition, TabPanelProps } from "./types";

/** `lazy()` that can also be preloaded. */
function panel(loader: () => Promise<{ default: ComponentType<TabPanelProps> }>): LazyPanel {
  return Object.assign(lazy(loader), { preload: loader });
}

/** Panel width when a tab does not set one (CSS px). */
export const DEFAULT_TAB_WIDTH = 400;
/** Tabs opened by hover/shortcut while their feature is active. */
export const MEDIA_TAB_ID = "media";
export const POMODORO_TAB_ID = "pomodoro";

export const TABS: TabDefinition[] = [
  {
    id: "home",
    label: "Beranda",
    icon: House,
    width: 380,
    Panel: panel(() => import("../../features/home/HomePanel")),
  },
  {
    id: MEDIA_TAB_ID,
    label: "Media",
    icon: Music,
    width: 520,
    Panel: panel(() => import("../../features/media/MediaPanel")),
  },
  {
    id: "todo",
    label: "Tugas",
    icon: ListTodo,
    width: 520,
    Panel: panel(() => import("../../features/todo/TodoPanel")),
  },
  {
    id: "notes",
    label: "Catatan",
    icon: NotebookPen,
    width: 480,
    Panel: panel(() => import("../../features/notes/NotesPanel")),
  },
  {
    id: POMODORO_TAB_ID,
    label: "Pomodoro",
    icon: Timer,
    width: 540,
    Panel: panel(() => import("../../features/pomodoro/PomodoroPanel")),
  },
  {
    id: "about",
    label: "Tentang",
    icon: Info,
    width: 300,
    Panel: panel(() => import("../../features/about/AboutPanel")),
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
