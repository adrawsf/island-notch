/** Settings → Beranda: which home cards show, and each card's options. */
import { useRef, useState } from "react";
import { Bell, ImagePlus, Plus, Search, Trash2, X } from "lucide-react";
import { updateSetting, type PetColor } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { playChime } from "../features/home/chime";
import { HOME_CARDS } from "../features/home/homeCards";
import { homeImage, importHomeImage } from "../features/home/homeImage";
import { PixelCat } from "../features/home/pet/PixelCat";
import { formatOffset, isValidZone, searchZones, zoneLabel, zoneTime } from "../features/home/worldClock";
import { useNow } from "../shared/useNow";
import { Group, IconButton, ReorderableToggles, Row, Segmented, Select, TextButton, Toggle } from "./controls";

const set = updateSetting;
const MAX_ZONES = 4;
const HOURS = Array.from({ length: 24 }, (_, h) => ({ id: String(h), label: `${String(h).padStart(2, "0")}.00` }));
const PET_COLORS: { id: PetColor; label: string }[] = [
  { id: "orange", label: "Oranye" },
  { id: "gray", label: "Abu" },
  { id: "black", label: "Hitam" },
  { id: "cream", label: "Krem" },
];

export function HomeSection() {
  const s = useSettings();
  return (
    <>
      <Group title="Kartu · urutan atas ke bawah">
        <ReorderableToggles items={HOME_CARDS} value={s.homeCards} onChange={(v) => set("homeCards", v)} />
      </Group>

      <Group title="Jam">
        <Row title="Ukuran jam">
          <Segmented
            value={s.clockSize}
            options={[
              { id: "small", label: "Kecil" },
              { id: "medium", label: "Sedang" },
              { id: "large", label: "Besar" },
            ]}
            onChange={(v) => set("clockSize", v)}
            label="Ukuran jam"
          />
        </Row>
        <Row title="Bunyi tiap jam" hint="Denting lembut tepat di setiap pergantian jam.">
          <TextButton onClick={playChime}>
            <span className="flex items-center gap-1.5">
              <Bell size={12} /> Tes
            </span>
          </TextButton>
          <Toggle checked={s.hourlyChime} onChange={(v) => set("hourlyChime", v)} label="Bunyi tiap jam" />
        </Row>
        <Row title="Jam tenang" hint="Tidak berbunyi di rentang jam ini." disabled={!s.hourlyChime}>
          <Toggle
            checked={s.chimeQuietHours}
            onChange={(v) => set("chimeQuietHours", v)}
            label="Jam tenang"
            disabled={!s.hourlyChime}
          />
        </Row>
        <Row title="Rentang jam tenang" disabled={!s.hourlyChime || !s.chimeQuietHours}>
          <Select
            value={String(s.chimeQuietStart)}
            options={HOURS}
            onChange={(v) => set("chimeQuietStart", Number(v))}
            label="Jam tenang mulai"
          />
          <span className="text-xs text-notch-muted">sampai</span>
          <Select
            value={String(s.chimeQuietEnd)}
            options={HOURS}
            onChange={(v) => set("chimeQuietEnd", Number(v))}
            label="Jam tenang selesai"
          />
        </Row>
      </Group>

      <WorldClockGroup zones={s.worldClocks} />
      <ImageGroup fit={s.homeImageFit} />

      <Group title="Kucing piksel">
        <Row
          title="Warna bulu"
          hint="Tidur jam 23.00–06.00, joget kalau ada musik, senang kalau dielus. Bisa juga muncul di pill lewat Tampilan → Widget idle."
        >
          <PixelCat mood="idle" color={s.petColor} size={36} effects={false} />
          <Segmented value={s.petColor} options={PET_COLORS} onChange={(v) => set("petColor", v)} label="Warna bulu" />
        </Row>
      </Group>
    </>
  );
}

function WorldClockGroup({ zones }: { zones: string[] }) {
  const now = useNow(15_000);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const full = zones.length >= MAX_ZONES;
  const results = searchZones(query).filter((o) => !zones.includes(o.zone));

  const add = (zone: string) => {
    if (full || zones.includes(zone)) return;
    set("worldClocks", [...zones, zone]);
    setQuery("");
  };

  return (
    <Group title={`World clock · ${zones.length}/${MAX_ZONES}`}>
      {zones.map((zone) => {
        const valid = isValidZone(zone);
        const t = valid ? zoneTime(now, zone) : null;
        return (
          <Row key={zone} title={zoneLabel(zone)} hint={t ? `${t.time} · ${formatOffset(t.offsetMin)}` : "Zona tidak dikenal"}>
            <IconButton label="Hapus" onClick={() => set("worldClocks", zones.filter((z) => z !== zone))}>
              <X size={12} strokeWidth={2.4} />
            </IconButton>
          </Row>
        );
      })}
      {!full && (
        <div className="relative px-4 py-3">
          <div className="glass-well flex items-center gap-2 rounded-full px-3 py-1.5">
            <Search size={13} className="shrink-0 text-notch-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) add(results[0].zone);
                if (e.key === "Escape") {
                  e.stopPropagation();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Cari kota atau negara, mis. Tokyo"
              aria-label="Cari kota"
              className="min-w-0 flex-1 bg-transparent text-xs text-notch-fg outline-none placeholder:text-notch-muted"
            />
          </div>
          {focused && results.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5">
              {results.map((o) => {
                const t = zoneTime(now, o.zone);
                return (
                  <button
                    key={o.zone}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(o.zone)}
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs hover:bg-notch-fg/[0.07]"
                  >
                    <Plus size={12} className="shrink-0 text-notch-accent" />
                    <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                    <span className="shrink-0 text-notch-muted">{formatOffset(t.offsetMin)}</span>
                    <span className="w-10 shrink-0 text-right tabular-nums">{t.time}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Group>
  );
}

function ImageGroup({ fit }: { fit: "cover" | "contain" }) {
  const src = homeImage.use();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importHomeImage(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Group title="Gambar">
      <Row
        title={src ? "Gambar saat ini" : "Belum ada gambar"}
        hint="PNG, JPG, WebP, atau GIF (maks. 4 MB, tetap bergerak)."
        below={error ? <span className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-400">{error}</span> : null}
      >
        {src && (
          <img src={src} alt="" className="h-12 w-12 rounded-xl ring-1 ring-notch-fg/10" style={{ objectFit: fit }} />
        )}
        <TextButton onClick={() => input.current?.click()}>
          <span className="flex items-center gap-1.5">
            <ImagePlus size={12} /> {busy ? "Memproses…" : src ? "Ganti" : "Pilih gambar"}
          </span>
        </TextButton>
        {src && (
          <IconButton label="Hapus gambar" onClick={() => homeImage.set(null)}>
            <Trash2 size={12} />
          </IconButton>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </Row>
      <Row title="Tampilan gambar" disabled={!src}>
        <Segmented
          value={fit}
          options={[
            { id: "cover", label: "Isi kartu" },
            { id: "contain", label: "Utuh" },
          ]}
          onChange={(v) => set("homeImageFit", v)}
          label="Tampilan gambar"
        />
      </Row>
    </Group>
  );
}
