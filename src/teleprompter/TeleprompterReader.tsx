/**
 * The teleprompter window (teleprompter.html). The reading itself is
 * PrompterView; this adds the window chrome: drag, resize, an adjustable
 * see-through background, and click-through (clicks reach the app behind,
 * except on the toolbar and the resize grip).
 */
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { MousePointerClick } from "lucide-react";
import { updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { useResolvedTheme } from "../shared/useResolvedTheme";
import { closeTeleprompter, setCaptureExcluded } from "../features/teleprompter/teleprompterBridge";
import { PrompterView, ToolButton } from "../features/teleprompter/PrompterView";

/** Below this background opacity the text gets a halo so it stays readable. */
const HALO_BELOW = 0.7;

export function TeleprompterReader() {
  const settings = useSettings();
  const theme = useResolvedTheme(settings.theme);
  const opacity = settings.teleprompterOpacity;
  const clickThrough = settings.teleprompterClickThrough;
  const toolbarRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);

  // The setting can change in any window (notch, settings window): apply it here.
  const hideFromCapture = settings.teleprompterHideFromCapture;
  useEffect(() => {
    setCaptureExcluded(hideFromCapture);
  }, [hideFromCapture]);

  // Tell Rust which parts stay clickable while the window lets clicks through.
  useEffect(() => {
    if (!isTauri()) return;
    const report = () => {
      const regions = [toolbarRef.current, gripRef.current].flatMap((el) => {
        if (!el) return [];
        const r = el.getBoundingClientRect();
        return [{ x: r.left, y: r.top, width: r.width, height: r.height }];
      });
      invoke("teleprompter_hit_regions", { clickThrough, regions }).catch((err) =>
        console.error("[teleprompter] hit regions", err),
      );
    };
    report();
    const observer = new ResizeObserver(report);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [clickThrough]);

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input") || !isTauri()) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  // See-through: the glass tint, grain and rim all fade with the opacity setting.
  const surface = { "--glass-alpha": opacity, "--surface-opacity": opacity } as CSSProperties;
  // The toolbar keeps a backing of its own so the controls stay readable.
  const toolbarStyle: CSSProperties | undefined =
    opacity < HALO_BELOW ? { background: `rgb(var(--glass-tint) / ${Math.max(opacity, 0.8)})` } : undefined;

  return (
    <div className="h-full w-full">
      <div
        data-theme={theme}
        style={surface}
        className="glass glass-window prompter-surface relative flex h-full w-full flex-col overflow-hidden rounded-[24px] text-notch-fg"
      >
        <PrompterView
          variant="window"
          onExit={closeTeleprompter}
          toolbarRef={toolbarRef}
          onToolbarPointerDown={onDragStart}
          toolbarStyle={toolbarStyle}
          textHalo={opacity < HALO_BELOW}
          toolbarExtra={
            <>
              <span className="mx-1 h-4 w-px bg-notch-fg/15" aria-hidden />
              <input
                type="range"
                className="glass-slider w-16 shrink-0"
                min={10}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                onChange={(e) => updateSetting("teleprompterOpacity", Number(e.target.value) / 100)}
                aria-label="Kepekatan latar"
                data-tip={`Latar ${Math.round(opacity * 100)}%`}
              />
              <ToolButton
                label={clickThrough ? "Tembus klik: aktif (klik untuk mematikan)" : "Tembus klik: mati (klik untuk mengaktifkan)"}
                pressed={clickThrough}
                onClick={() => updateSetting("teleprompterClickThrough", !clickThrough)}
              >
                <MousePointerClick size={13} />
              </ToolButton>
            </>
          }
        />

        {/* Resize grip (the window has no native frame). */}
        <div
          ref={gripRef}
          onPointerDown={(e) => {
            if (e.button !== 0 || !isTauri()) return;
            e.preventDefault();
            getCurrentWindow().startResizeDragging("SouthEast").catch(() => {});
          }}
          className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-br-[22px]"
          data-tip="Ubah ukuran"
          aria-hidden
        >
          <span className="absolute bottom-1.5 right-1.5 h-2 w-2 border-b-2 border-r-2 border-notch-fg/30" />
        </div>
      </div>
    </div>
  );
}
