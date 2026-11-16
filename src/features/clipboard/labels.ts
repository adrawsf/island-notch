/** Friendly names for common executables (lowercase, without .exe). */
const APP_NAMES: Record<string, string> = {
  chrome: "Chrome",
  msedge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
  opera: "Opera",
  code: "VS Code",
  explorer: "File Explorer",
  snippingtool: "Snipping Tool",
  screenclippinghost: "Snipping Tool",
  winword: "Word",
  excel: "Excel",
  powerpnt: "PowerPoint",
  onenote: "OneNote",
  outlook: "Outlook",
  notepad: "Notepad",
  windowsterminal: "Terminal",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  spotify: "Spotify",
  figma: "Figma",
  obsidian: "Obsidian",
  notion: "Notion",
};

export function sourceLabel(exe: string): string {
  if (!exe) return "";
  return APP_NAMES[exe] ?? exe.charAt(0).toUpperCase() + exe.slice(1);
}

/** "baru saja", "5 mnt", "2 jam", "kemarin", "3 Nov" */
export function relativeTime(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const date = new Date(ms);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "kemarin";
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
