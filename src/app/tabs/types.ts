import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";

export interface TabSize {
  width: number;
  height: number;
}

/** Props every tab panel receives from the shell. */
export interface TabPanelProps {
  /** Ask the shell to collapse the notch (e.g. after an action completes). */
  requestClose: () => void;
}

/**
 * One entry in the tab registry. The shell handles navigation, sizing and
 * animation; a feature only describes itself here.
 */
export interface TabDefinition {
  /** Stable id; persisted as the last opened tab. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Expanded notch size while this tab is active. Defaults to DEFAULT_TAB_SIZE. */
  size?: TabSize;
  Panel: LazyExoticComponent<ComponentType<TabPanelProps>>;
}
