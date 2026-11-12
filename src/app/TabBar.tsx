import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { openSettingsWindow } from "../core/shell/shellBridge";
import { TABS } from "./tabs/registry";

interface TabBarProps {
  activeId: string;
  onSelect: (id: string) => void;
}

const BUTTON = 28;
const GAP = 2;
const PAD = 3;

/** Glass segmented control; the active "lens" slides between tabs. A gear next to it opens the settings window. */
export function TabBar({ activeId, onSelect }: TabBarProps) {
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === activeId));
  return (
    <div className="flex items-center justify-center gap-1.5 px-4 pb-3 pt-3">
      <nav className="glass-well relative flex rounded-full" style={{ padding: PAD, gap: GAP }} aria-label="Tab notch">
        <motion.span
          aria-hidden
          className="glass-button absolute rounded-full"
          style={{ top: PAD, width: BUTTON, height: BUTTON }}
          initial={false}
          animate={{ left: PAD + activeIndex * (BUTTON + GAP) }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
        />
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              data-tip={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex items-center justify-center rounded-full transition-colors ${
                active ? "text-notch-fg" : "text-notch-muted hover:text-notch-fg"
              }`}
              style={{ width: BUTTON, height: BUTTON }}
            >
              <Icon size={14} strokeWidth={2.2} />
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => openSettingsWindow()}
        data-tip="Pengaturan"
        aria-label="Pengaturan"
        className="glass-button flex shrink-0 items-center justify-center rounded-full text-notch-muted hover:text-notch-fg"
        style={{ width: BUTTON + PAD * 2, height: BUTTON + PAD * 2 }}
      >
        <Settings size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
