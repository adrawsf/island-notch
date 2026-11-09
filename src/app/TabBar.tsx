import { TABS } from "./tabs/registry";

interface TabBarProps {
  activeId: string;
  onSelect: (id: string) => void;
}

export function TabBar({ activeId, onSelect }: TabBarProps) {
  return (
    <nav className="flex shrink-0 items-center justify-center gap-1 px-4 pb-1 pt-2.5" aria-label="Tab notch">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = id === activeId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              active ? "bg-white/15 text-white" : "text-notch-muted hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={14} strokeWidth={2.2} />
          </button>
        );
      })}
    </nav>
  );
}
