/** Teleprompter scripts, saved locally and shared with the teleprompter window. */
import { persistedValue } from "../../core/storage/persistedValue";

export interface Script {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface TeleprompterData {
  scripts: Script[];
  activeId: string | null;
}

const MAX_BODY = 100_000;

function isScript(v: unknown): v is Script {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.title === "string" && typeof s.body === "string" && typeof s.updatedAt === "number";
}

export const teleprompterData = persistedValue<TeleprompterData>(
  "teleprompter",
  { scripts: [], activeId: null },
  (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const scripts = Array.isArray(r.scripts) ? r.scripts.filter(isScript) : [];
    const activeId = typeof r.activeId === "string" && scripts.some((s) => s.id === r.activeId) ? r.activeId : null;
    return { scripts, activeId };
  },
);

/** The selected script, or the first one, or null when there are none. */
export function activeScript(data: TeleprompterData): Script | null {
  return data.scripts.find((s) => s.id === data.activeId) ?? data.scripts[0] ?? null;
}

export function createScript(): void {
  const script: Script = { id: crypto.randomUUID(), title: "Naskah baru", body: "", updatedAt: Date.now() };
  teleprompterData.set((d) => ({ scripts: [script, ...d.scripts], activeId: script.id }));
}

export function selectScript(id: string): void {
  teleprompterData.set((d) => ({ ...d, activeId: id }));
}

export function updateScript(id: string, patch: Partial<Pick<Script, "title" | "body">>): void {
  teleprompterData.set((d) => ({
    ...d,
    scripts: d.scripts.map((s) =>
      s.id === id
        ? {
            ...s,
            ...patch,
            body: (patch.body ?? s.body).slice(0, MAX_BODY),
            updatedAt: Date.now(),
          }
        : s,
    ),
  }));
}

export function deleteScript(id: string): void {
  teleprompterData.set((d) => {
    const scripts = d.scripts.filter((s) => s.id !== id);
    return { scripts, activeId: d.activeId === id ? (scripts[0]?.id ?? null) : d.activeId };
  });
}
