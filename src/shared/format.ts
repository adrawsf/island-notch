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

const KEY_NAMES: Record<string, string> = {
  CommandOrControl: "Ctrl",
  Control: "Ctrl",
  Super: "Win",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

/** "Control+Alt+N" -> "Ctrl+Alt+N", "Super+Backquote" -> "Win+`" */
export function prettyShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => KEY_NAMES[part] ?? part.replace(/^Numpad(\d)$/, "Num $1"))
    .join("+");
}
