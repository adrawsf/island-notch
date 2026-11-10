/** HTTP for lyrics providers, through the Rust allowlist (`lyrics_request`). */
import { invoke } from "@tauri-apps/api/core";

/** GETs an allowlisted endpoint; null when the provider has no entry (404). */
export async function fetchText(
  endpoint: string,
  params: Record<string, string | number> = {},
  path?: string,
): Promise<string | null> {
  const query = Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
  return invoke<string | null>("lyrics_request", { endpoint, query, path: path ?? null });
}

export async function fetchJson<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const text = await fetchText(endpoint, params);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Base64 to UTF-8 text (Kugou and QQ Music deliver LRC this way). */
export function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}
