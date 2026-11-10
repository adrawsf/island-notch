const LOCALE = "id-ID";

export function formatClock(date: Date): string {
  return date.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "Sen, 9 Nov" */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

/** "Control+Alt+N" -> "Ctrl+Alt+N" */
export function prettyShortcut(shortcut: string): string {
  return shortcut.replace("CommandOrControl", "Ctrl").replace("Control", "Ctrl");
}
