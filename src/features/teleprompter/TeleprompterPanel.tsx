import { useCallback, useEffect, useState } from "react";
import { AppWindow, EyeOff, Play, Plus, Trash2 } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { openTeleprompter, setCaptureExcluded, useTeleprompterVisible } from "./teleprompterBridge";
import { setPrompterInNotch, usePrompterInNotch } from "./notchPrompter";
import { PrompterView } from "./PrompterView";
import {
  createScript,
  deleteScript,
  selectScript,
  teleprompterData,
  updateScript,
} from "./teleprompterStore";

/**
 * Prompter tab: pick/edit a script, then run it here in the notch or in the
 * teleprompter window.
 */
export default function TeleprompterPanel(props: TabPanelProps) {
  const inNotch = usePrompterInNotch();
  const exit = useCallback(() => setPrompterInNotch(false), []);
  // Leaving the tab mid-run ends it.
  useEffect(() => () => setPrompterInNotch(false), []);
  return inNotch ? <PrompterView variant="notch" onExit={exit} autoStart /> : <ScriptEditor {...props} />;
}

function ScriptEditor(_props: TabPanelProps) {
  const data = teleprompterData.use();
  const settings = useSettings();
  const visible = useTeleprompterVisible();
  // No script is shown until one is clicked in the list (each time the notch opens).
  const [openId, setOpenId] = useState<string | null>(null);
  const script = openId ? (data.scripts.find((s) => s.id === openId) ?? null) : null;
  const canStart = !!script && !!script.body.trim();

  const open = (id: string) => {
    selectScript(id);
    setOpenId(id);
  };

  // Apply the capture setting to an already open teleprompter right away.
  useEffect(() => {
    if (visible) setCaptureExcluded(settings.teleprompterHideFromCapture);
  }, [visible, settings.teleprompterHideFromCapture]);

  // Nothing open yet: the list takes the whole panel.
  if (!script) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex h-8 items-center gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-notch-muted">
            {data.scripts.length === 0 ? "Naskah" : `${data.scripts.length} naskah`}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOpenId(createScript())}
            className="glass-button flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-semibold"
          >
            <Plus size={14} /> Naskah baru
          </button>
        </div>
        {data.scripts.length === 0 ? (
          <div className="glass-well flex h-[134px] items-center justify-center rounded-2xl text-sm text-notch-muted">
            Belum ada naskah. Buat satu untuk mulai.
          </div>
        ) : (
          <ul className="flex max-h-[200px] flex-col gap-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            {data.scripts.map((s) => {
              const preview = s.body.trim().replace(/\s+/g, " ");
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => open(s.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-notch-fg/[0.07]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold">{s.title || "Tanpa judul"}</span>
                      <span className="truncate text-[11.5px] text-notch-muted">{preview || "Masih kosong"}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-notch-muted">
                      {preview ? `${preview.split(" ").length} kata` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Script list */}
      <div className="flex w-36 shrink-0 flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setOpenId(createScript())}
          className="glass-button flex h-8 items-center justify-center gap-1.5 rounded-full text-xs font-semibold"
        >
          <Plus size={14} /> Naskah baru
        </button>
        <ul className="h-[60px] overflow-y-auto [scrollbar-width:thin]">
          {data.scripts.length === 0 && <li className="py-2 text-center text-xs text-notch-muted">Belum ada naskah</li>}
          {data.scripts.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                // Clicking the open script again goes back to the full list.
                onClick={() => (s.id === openId ? setOpenId(null) : open(s.id))}
                className={`w-full truncate rounded-lg px-2 py-1 text-left text-xs ${
                  s.id === script?.id ? "bg-notch-fg/15 font-semibold" : "text-notch-muted hover:bg-notch-fg/5 hover:text-notch-fg"
                }`}
                data-tip-truncated data-tip={s.title}
              >
                {s.title || "Tanpa judul"}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => setPrompterInNotch(true)}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-notch-accent px-2 text-xs font-semibold text-white transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-40"
            data-tip={script ? "Mulai di notch (notch tetap terbuka)" : "Pilih naskah dulu"}
          >
            <Play size={12} fill="currentColor" /> Mulai
          </button>
          <button
            type="button"
            disabled={!canStart}
            onClick={() => openTeleprompter(settings.teleprompterHideFromCapture)}
            className="glass-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            aria-label={visible ? "Fokus ke window prompter" : "Buka di window terpisah"}
            data-tip={visible ? "Fokus ke window prompter" : "Buka di window terpisah"}
          >
            <AppWindow size={14} />
          </button>
        </div>
      </div>

      {/* Editor + controls */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {script ? (
          <>
            <div className="flex items-center gap-2">
              <input
                value={script.title}
                onChange={(e) => updateScript(script.id, { title: e.target.value.slice(0, 80) })}
                className="glass-well h-8 min-w-0 flex-1 rounded-full px-3.5 text-sm font-semibold outline-none"
                aria-label="Judul naskah"
              />
              <button
                type="button"
                onClick={() => updateSetting("teleprompterHideFromCapture", !settings.teleprompterHideFromCapture)}
                className={`rounded-full p-1.5 ${
                  settings.teleprompterHideFromCapture
                    ? "glass-button text-notch-fg"
                    : "text-notch-muted hover:bg-notch-fg/10 hover:text-notch-fg"
                }`}
                aria-pressed={settings.teleprompterHideFromCapture}
                aria-label="Sembunyikan dari rekaman dan screen share"
                data-tip={
                  settings.teleprompterHideFromCapture
                    ? "Tersembunyi dari screenshot, rekaman & screen share (klik untuk mematikan)"
                    : "Terlihat di rekaman & screen share (klik untuk menyembunyikan)"
                }
              >
                <EyeOff size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteScript(script.id);
                  setOpenId(null);
                }}
                className="rounded-full p-1.5 text-notch-muted hover:bg-notch-fg/10 hover:text-notch-fg"
                aria-label="Hapus naskah"
                data-tip="Hapus naskah"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={script.body}
              onChange={(e) => updateScript(script.id, { body: e.target.value })}
              placeholder="Tulis atau tempel naskahmu di sini…"
              spellCheck={false}
              className="glass-well h-[94px] resize-none rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed outline-none placeholder:text-notch-muted [scrollbar-width:thin]"
              aria-label="Isi naskah"
            />
          </>
        ) : (
          <div className="glass-well flex h-[134px] items-center justify-center rounded-2xl px-6 text-center text-sm text-notch-muted">
            {data.scripts.length === 0 ? "Buat naskah dulu untuk mulai" : "Klik naskah di kiri untuk membukanya"}
          </div>
        )}

      </div>
    </div>
  );
}
