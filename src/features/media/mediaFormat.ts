/** 83_000 -> "1:23", 3_723_000 -> "1:02:03" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Readable app name from an SMTC AppUserModelId:
 * "Spotify.exe" -> "Spotify", "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" -> "Spotify",
 * "MSEdge" -> "MSEdge".
 */
export function appDisplayName(appId: string): string {
  let name = appId.includes("!") ? appId.slice(appId.lastIndexOf("!") + 1) : appId;
  name = name.replace(/\.exe$/i, "");
  if (name.includes("\\")) name = name.slice(name.lastIndexOf("\\") + 1);
  return name || "Media";
}
