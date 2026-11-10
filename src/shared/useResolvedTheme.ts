import { useEffect, useState } from "react";
import type { ThemeMode } from "../core/settings/settings";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** "auto" follows the Windows app theme (WebView2 reports it via the media query). */
export function useResolvedTheme(mode: ThemeMode): "dark" | "light" {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  if (mode === "auto") return systemDark ? "dark" : "light";
  return mode;
}
