/**
 * Stand-in for Node's `path`, which kuromoji's dictionary loader requires
 * only to join the dictionary URL and file name. Wired in through
 * `resolve.alias` in vite.config.ts (client code only).
 */
export function join(...parts: string[]): string {
  return parts.filter(Boolean).join("/").replace(/\/{2,}/g, "/");
}

export default { join };
