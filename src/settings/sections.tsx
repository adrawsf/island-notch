/**
 * Settings window pages, one per sidebar entry. To add a page, write a
 * component here and list it in SECTIONS.
 */
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import {
  House,
  Info,
  Music,
  Palette,
  ScrollText,
  SlidersHorizontal,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { defaultSetting, resetSettings, updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import {
  getAutostart,
  getShellStatus,
  listMonitors,
  onShellApplied,
  setAutostart,
  type MonitorEntry,
} from "../core/shell/shellBridge";
import { IDLE_WIDGETS } from "../app/idle/idleWidgets";
import { LYRICS_SOURCE_OPTIONS } from "../features/lyrics/sources";
import { toggleMiniPlayer, useMiniPlayerVisible } from "../features/media/miniPlayerBridge";
import { AMBIENCE_SOUNDS } from "../features/pomodoro/ambience/sounds";
import { prettyShortcut } from "../shared/format";
import { Stepper } from "../shared/ui/Stepper";
import { Group, ReorderableToggles, Row, Segmented, Select, Slider, TextButton, Toggle } from "./controls";
import { HomeSection } from "./HomeSection";
import { ShortcutRecorder } from "./ShortcutRecorder";

export interface SectionProps {
  /** The shortcut recorder owns the keyboard (Esc must not close the window). */
  setCapturingKeys: (capturing: boolean) => void;
}

export interface SectionDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  Component: ComponentType<SectionProps>;
}

const set = updateSetting;

/** Re-reads something the OS owns whenever the window regains focus. */
function useOnFocus(read: () => void) {
  useEffect(() => {
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [read]);
}

// ---------- Umum ----------

function GeneralSection({ setCapturingKeys }: SectionProps) {
  const s = useSettings();
  const [autostart, setAutostartState] = useState(false);
  const [monitors, setMonitors] = useState<MonitorEntry[]>([]);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useOnFocus(
    useCallback(() => {
      getAutostart().then(setAutostartState);
      listMonitors().then(setMonitors);
    }, [])
  );

  useEffect(() => {
    getShellStatus().then((r) => setShortcutError(r?.shortcutError ?? null));
    return onShellApplied((r) => setShortcutError(r.shortcutError));
  }, []);

  const toggleAutostart = (on: boolean) => {
    setAutostartState(on);
    setAutostart(on)
      .then(setAutostartState)
      .catch(() => getAutostart().then(setAutostartState));
  };

  const monitorOptions = [
    { id: "auto", label: "Monitor utama" },
    ...monitors.map((m, i) => ({
      id: m.name,
      label: `Layar ${i + 1} · ${m.width}×${m.height}${m.primary ? " (utama)" : ""}`,
    })),
  ];
  // A monitor that is unplugged right now still shows as the choice.
  if (s.monitor && !monitors.some((m) => m.name === s.monitor)) {
    monitorOptions.push({ id: s.monitor, label: "Layar tidak terhubung" });
  }

  const defaultShortcut = defaultSetting("toggleShortcut");

  return (
    <>
      <Group title="Sistem">
        <Row title="Jalan saat login" hint="Island Notch otomatis aktif setelah masuk Windows.">
          <Toggle checked={autostart} onChange={toggleAutostart} label="Jalan saat login" />
        </Row>
        <Row title="Monitor" hint="Layar tempat notch berada.">
          <Select
            value={s.monitor ?? "auto"}
            options={monitorOptions}
            onChange={(v) => set("monitor", v === "auto" ? null : v)}
            label="Monitor"
          />
        </Row>
      </Group>

      <Group title="Buka dan tutup">
        <Row title="Buka saat kursor di atas notch" hint="Kalau mati, notch dibuka dengan klik.">
          <Toggle checked={s.expandOnHover} onChange={(v) => set("expandOnHover", v)} label="Buka saat hover" />
        </Row>
        <Row title="Jeda sebelum menutup" hint="Berapa lama notch tetap terbuka setelah kursor pergi.">
          <Slider
            value={s.closeDelayMs}
            min={0}
            max={2000}
            step={100}
            onChange={(v) => set("closeDelayMs", v)}
            label="Jeda sebelum menutup"
            format={(v) => `${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} dtk`}
          />
        </Row>
        <Row title="Shortcut global" hint="Buka atau tutup notch dari mana saja.">
          <Toggle checked={s.shortcutEnabled} onChange={(v) => set("shortcutEnabled", v)} label="Shortcut global" />
        </Row>
        <Row
          title="Kombinasi tombol"
          disabled={!s.shortcutEnabled}
          hint={
            s.toggleShortcut !== defaultShortcut ? (
              <button
                type="button"
                className="text-notch-accent hover:underline"
                onClick={() => set("toggleShortcut", defaultShortcut)}
              >
                Kembalikan ke {prettyShortcut(defaultShortcut)}
              </button>
            ) : (
              "Klik lalu tekan kombinasi baru."
            )
          }
          below={
            s.shortcutEnabled && shortcutError ? (
              <span className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-400">
                Tidak bisa dipasang: {shortcutError}. Mungkin sudah dipakai aplikasi lain.
              </span>
            ) : null
          }
        >
          <ShortcutRecorder
            value={s.toggleShortcut}
            onChange={(v) => set("toggleShortcut", v)}
            onRecordingChange={setCapturingKeys}
          />
        </Row>
      </Group>
    </>
  );
}

// ---------- Tampilan ----------

function AppearanceSection() {
  const s = useSettings();

  return (
    <>
      <Group title="Notch">
        <Row title="Tema">
          <Segmented
            value={s.theme}
            options={[
              { id: "dark", label: "Gelap" },
              { id: "light", label: "Terang" },
              { id: "auto", label: "Ikuti sistem" },
            ]}
            onChange={(v) => set("theme", v)}
            label="Tema"
          />
        </Row>
        <Row title="Bentuk" hint="Notch menempel di tepi atas; island melayang sedikit di bawahnya.">
          <Segmented
            value={s.notchShape}
            options={[
              { id: "notch", label: "Notch" },
              { id: "island", label: "Island" },
            ]}
            onChange={(v) => set("notchShape", v)}
            label="Bentuk"
          />
        </Row>
        <Row title="Ukuran">
          <Segmented
            value={s.notchSize}
            options={[
              { id: "compact", label: "Kecil" },
              { id: "default", label: "Normal" },
              { id: "large", label: "Besar" },
            ]}
            onChange={(v) => set("notchSize", v)}
            label="Ukuran"
          />
        </Row>
        <Row
          title="Kecilkan saat browser"
          hint="Notch jadi garis tipis kalau tab browser ada di bawahnya, supaya tab tetap bisa diklik."
        >
          <Toggle checked={s.shrinkForBrowsers} onChange={(v) => set("shrinkForBrowsers", v)} label="Kecilkan saat browser" />
        </Row>
        <Row
          title="Sembunyikan saat layar penuh"
          hint="Notch hilang total waktu main game atau nonton video layar penuh, lalu muncul lagi setelahnya. Shortcut tetap bisa memunculkannya."
        >
          <Toggle checked={s.hideInFullscreen} onChange={(v) => set("hideInFullscreen", v)} label="Sembunyikan saat layar penuh" />
        </Row>
      </Group>

      <Group title="Widget idle · urutan kiri ke kanan">
        <ReorderableToggles items={IDLE_WIDGETS} value={s.idleWidgets} onChange={(v) => set("idleWidgets", v)} />
      </Group>
    </>
  );
}


// ---------- Media ----------

function MediaSection() {
  const s = useSettings();
  const miniPlayerVisible = useMiniPlayerVisible();
  return (
    <>
      <Group title="Pill">
        <Row title="Tampilkan lagu di pill" hint="Saat musik diputar, pill menampilkan lagu, bukan widget idle.">
          <Toggle checked={s.idleShowsMedia} onChange={(v) => set("idleShowsMedia", v)} label="Lagu di pill" />
        </Row>
        <Row title="Lirik di pill" hint="Baris lirik yang sedang dinyanyikan." disabled={!s.idleShowsMedia}>
          <Toggle
            checked={s.pillShowsLyrics}
            onChange={(v) => set("pillShowsLyrics", v)}
            label="Lirik di pill"
            disabled={!s.idleShowsMedia}
          />
        </Row>
        <Row title="Abaikan video" hint="Film dan video di browser tidak dianggap musik.">
          <Toggle checked={s.ignoreVideo} onChange={(v) => set("ignoreVideo", v)} label="Abaikan video" />
        </Row>
      </Group>

      <Group title="Lirik">
        <Row title="Sumber lirik" hint="Otomatis mencoba semua sumber sampai ketemu.">
          <Select
            value={s.lyricsSource}
            options={LYRICS_SOURCE_OPTIONS}
            onChange={(v) => set("lyricsSource", v)}
            label="Sumber lirik"
          />
        </Row>
      </Group>

      <Group title="Mini player">
        <Row title="Tampilkan mini player" hint="Pemutar kecil yang melayang di pojok layar.">
          <Toggle checked={miniPlayerVisible} onChange={toggleMiniPlayer} label="Tampilkan mini player" />
        </Row>
        <Row title="Lirik di mini player">
          <Toggle checked={s.miniPlayerLyrics} onChange={(v) => set("miniPlayerLyrics", v)} label="Lirik di mini player" />
        </Row>
        <Row title="Mode ringkas" hint="Hanya sampul dan lirik.">
          <Toggle checked={s.miniPlayerCompact} onChange={(v) => set("miniPlayerCompact", v)} label="Mode ringkas" />
        </Row>
      </Group>
    </>
  );
}

// ---------- Pomodoro ----------

type MinuteKey = "pomodoroFocusMin" | "pomodoroShortBreakMin" | "pomodoroLongBreakMin";

function PomodoroSection() {
  const s = useSettings();
  const minutes = (key: MinuteKey, title: string) => (
    <Row title={title}>
      <Stepper value={s[key]} min={1} max={180} onChange={(v) => set(key, v)} label={`${title} (menit)`} />
      <span className="w-8 text-xs text-notch-muted">menit</span>
    </Row>
  );
  return (
    <>
      <Group title="Durasi">
        {minutes("pomodoroFocusMin", "Fokus")}
        {minutes("pomodoroShortBreakMin", "Istirahat pendek")}
        {minutes("pomodoroLongBreakMin", "Istirahat panjang")}
        <Row title="Lanjut otomatis" hint="Kalau mati, timer menunggu di akhir fase dan menghitung waktu lebihnya.">
          <Toggle checked={s.pomodoroAutoAdvance} onChange={(v) => set("pomodoroAutoAdvance", v)} label="Lanjut otomatis" />
        </Row>
      </Group>

      <Group title="Ambience saat fokus">
        <Row title="Suara">
          <Select
            value={s.ambienceSound}
            options={[{ id: "none" as const, label: "Tanpa suara" }, ...AMBIENCE_SOUNDS]}
            onChange={(v) => set("ambienceSound", v)}
            label="Suara ambience"
          />
        </Row>
        <Row title="Volume" disabled={s.ambienceSound === "none"}>
          <Slider
            value={Math.round(s.ambienceVolume * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(v) => set("ambienceVolume", v / 100)}
            label="Volume ambience"
            format={(v) => `${v}%`}
          />
        </Row>
      </Group>
    </>
  );
}

// ---------- Teleprompter ----------

function TeleprompterSection() {
  const s = useSettings();
  return (
    <Group title="Teleprompter">
      <Row title="Ukuran teks">
        <Stepper
          value={s.teleprompterFontSize}
          min={14}
          max={72}
          onChange={(v) => set("teleprompterFontSize", v)}
          label="Ukuran teks (px)"
        />
        <span className="w-8 text-xs text-notch-muted">px</span>
      </Row>
      <Row title="Kecepatan gulir">
        <Slider
          value={s.teleprompterSpeed}
          min={10}
          max={200}
          step={5}
          onChange={(v) => set("teleprompterSpeed", v)}
          label="Kecepatan gulir"
          format={(v) => `${v} px/d`}
        />
      </Row>
      <Row title="Hitung mundur" hint="Jeda sebelum teks mulai bergulir.">
        <Stepper
          value={s.teleprompterCountdown}
          min={0}
          max={10}
          onChange={(v) => set("teleprompterCountdown", v)}
          label="Hitung mundur (detik)"
        />
        <span className="w-8 text-xs text-notch-muted">dtk</span>
      </Row>
      <Row title="Sembunyikan dari rekaman" hint="Tetap terlihat di layarmu, tapi tidak muncul di screenshot, rekaman, atau screen share.">
        <Toggle
          checked={s.teleprompterHideFromCapture}
          onChange={(v) => set("teleprompterHideFromCapture", v)}
          label="Sembunyikan dari rekaman"
        />
      </Row>
    </Group>
  );
}

// ---------- Tentang ----------

function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (isTauri()) getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  // The confirmation expires so a stray second click later does nothing.
  useEffect(() => {
    if (!confirmReset) return;
    const id = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(id);
  }, [confirmReset]);

  return (
    <>
      <Group>
        <div className="flex flex-col gap-1 px-4 py-5">
          <span className="text-lg font-semibold">Island Notch</span>
          <span className="text-xs text-notch-muted">{version ? `Versi ${version}` : "Mode browser"}</span>
          <span className="mt-1 text-xs leading-relaxed text-notch-muted">
            Notch bergaya dynamic island untuk Windows: media dan lirik, catatan, pomodoro, dan teleprompter.
          </span>
        </div>
      </Group>
      <Group title="Reset">
        <Row
          title="Kembalikan pengaturan ke default"
          hint="Catatan, naskah teleprompter, dan data lain tidak ikut terhapus."
        >
          <TextButton
            danger={confirmReset}
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true);
              resetSettings();
              setConfirmReset(false);
            }}
          >
            {confirmReset ? "Yakin? Klik lagi" : "Reset"}
          </TextButton>
        </Row>
      </Group>
    </>
  );
}

export const SECTIONS: SectionDefinition[] = [
  { id: "general", label: "Umum", icon: SlidersHorizontal, Component: GeneralSection },
  { id: "appearance", label: "Tampilan", icon: Palette, Component: AppearanceSection },
  { id: "home", label: "Beranda", icon: House, Component: HomeSection },
  { id: "media", label: "Media & Lirik", icon: Music, Component: MediaSection },
  { id: "pomodoro", label: "Pomodoro", icon: Timer, Component: PomodoroSection },
  { id: "teleprompter", label: "Teleprompter", icon: ScrollText, Component: TeleprompterSection },
  { id: "about", label: "Tentang", icon: Info, Component: AboutSection },
];
