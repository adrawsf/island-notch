/**
 * Tab registry: the ONLY place a tab needs to be added.
 *
 * To add a feature tab:
 * 1. Build its panel in `src/features/<feature>/` as a default-exported component
 *    that accepts `TabPanelProps`.
 * 2. Add an entry below. Order here is the order in the tab bar.
 */
import { lazy } from "react";
import { House, Info } from "lucide-react";
import type { TabDefinition, TabSize } from "./types";

export const COLLAPSED_SIZE: TabSize = { width: 200, height: 34 };
export const DEFAULT_TAB_SIZE: TabSize = { width: 600, height: 280 };

export const TABS: TabDefinition[] = [
  {
    id: "home",
    label: "Beranda",
    icon: House,
    Panel: lazy(() => import("../../features/home/HomePanel")),
  },
  {
    id: "about",
    label: "Tentang",
    icon: Info,
    size: { width: 520, height: 240 },
    Panel: lazy(() => import("../../features/about/AboutPanel")),
  },
];

export function findTab(id: string | null): TabDefinition {
  return TABS.find((t) => t.id === id) ?? TABS[0];
}
