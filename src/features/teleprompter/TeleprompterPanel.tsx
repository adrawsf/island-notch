import { useEffect } from "react";
import { EyeOff, Play, Plus, Trash2 } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { openTeleprompter, setCaptureExcluded, useTeleprompterVisible } from "./teleprompterBridge";
import {
  activeScript,
  createScript,
  deleteScript,
  selectScript,
  teleprompterData,
  updateScript,
} from "./teleprompterStore";

/** Prompter tab: pick/edit a script, then open the teleprompter window. */
export default function TeleprompterPanel(_props: TabPanelProps) {
  const data = teleprompterData.use();
  const settings = useSettings();
  const visible = useTeleprompterVisible();
  const script = activeScript(data);

  // Apply the capture setting to an already open teleprompter right away.
  useEffect(() => {
    if (visible) setCaptureExcluded(settings.teleprompterHideFromCapture);
  }, [visible, settings.teleprompterHideFromCapture]);

  return (
    <div className="flex gap-4">
      {/* Script list */}
      <div className="flex w-36 shrink-0 flex-col gap-1.5">
        <button
          type="button"
          onClick={createScript}
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
                onClick={() => selectScript(s.id)}
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
        <button
          type="button"
          disabled={!script || !script.body.trim()}
          onClick={() => openTeleprompter(settings.teleprompterHideFromCapture)}
          className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-notch-accent px-3 text-xs font-semibold text-white transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          <Play size={12} fill="currentColor" /> {visible ? "Fokus" : "Buka prompter"}
        </button>
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
                onClick={() => deleteScript(script.id)}
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
          <div className="flex h-[134px] items-center justify-center text-sm text-notch-muted">
            Buat naskah dulu untuk mulai
          </div>
        )}

      </div>
    </div>
  );
}
