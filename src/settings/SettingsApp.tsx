import { Suspense, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { Minus, X } from "lucide-react";
import { useSettings } from "../core/settings/useSettings";
import { closeSettingsWindow, minimizeSettingsWindow, onSettingsNavigate } from "../core/shell/shellBridge";
import { useResolvedTheme } from "../shared/useResolvedTheme";
import { SECTIONS } from "./sections";

/** Transparent margin around the card for the glass shadow (see WIDTH/HEIGHT in settings_window.rs). */
const MARGIN = 16;
const INTERACTIVE = "button, input, select, textarea, a, [role=switch], [role=radio]";

/** The settings window: sidebar of sections on the left, the section on the right. */
export function SettingsApp() {
  const settings = useSettings();
  const theme = useResolvedTheme(settings.theme);
  // Another window can ask for a section: "#home" on first open, an event after.
  const [sectionId, setSectionId] = useState(() => initialSection());
  const [capturingKeys, setCapturingKeys] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];

  // Block body: scrollTo returns a promise in newer WebView2, and an effect must not return one.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [sectionId]);

  useEffect(
    () =>
      onSettingsNavigate((id) => {
        if (SECTIONS.some((s) => s.id === id)) setSectionId(id);
      }),
    [],
  );

  // Esc closes the window, unless the shortcut recorder is listening.
  useEffect(() => {
    if (capturingKeys) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettingsWindow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capturingKeys]);

  // Drag the window by any empty spot of the sidebar or the header.
  const onDragArea = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE) || !isTauri()) return;
    getCurrentWindow()
      .startDragging()
      .catch((err) => console.error("[settings] drag", err));
  };

  const { Component } = section;

  return (
    <div className="h-full w-full" style={{ padding: MARGIN }}>
      <div
        data-theme={theme}
        className="glass relative flex h-full w-full overflow-hidden rounded-[28px] font-sans text-notch-fg"
        style={{ colorScheme: theme }}
      >
        {/* Sidebar */}
        <aside className="flex w-[196px] shrink-0 flex-col gap-1 border-r border-notch-fg/[0.07] p-3" onPointerDown={onDragArea}>
          <div className="px-3 pb-3 pt-2">
            <span className="text-[15px] font-semibold">Pengaturan</span>
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Bagian pengaturan">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = id === sectionId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSectionId(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                    active ? "glass-button text-notch-fg" : "text-notch-muted hover:bg-notch-fg/[0.06] hover:text-notch-fg"
                  }`}
                >
                  <Icon size={15} strokeWidth={2.1} className={active ? "text-notch-accent" : undefined} />
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="flex-1" />
        </aside>

        {/* Section */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between py-3 pl-6 pr-3" onPointerDown={onDragArea}>
            <h2 className="text-lg font-semibold">{section.label}</h2>
            <div className="flex gap-1">
              <WindowButton label="Kecilkan" onClick={minimizeSettingsWindow}>
                <Minus size={14} strokeWidth={2.2} />
              </WindowButton>
              <WindowButton label="Tutup" onClick={closeSettingsWindow}>
                <X size={14} strokeWidth={2.2} />
              </WindowButton>
            </div>
          </header>
          <div ref={scrollRef} className="settings-scroll flex-1 overflow-y-auto px-6 pb-6">
            <div className="flex flex-col gap-6">
              <Suspense fallback={null}>
                <Component setCapturingKeys={setCapturingKeys} />
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function initialSection(): string {
  const hash = window.location.hash.slice(1);
  return SECTIONS.some((s) => s.id === hash) ? hash : SECTIONS[0].id;
}

function WindowButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-notch-muted transition-colors hover:bg-notch-fg/10 hover:text-notch-fg"
    >
      {children}
    </button>
  );
}
