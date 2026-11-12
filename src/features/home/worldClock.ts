/**
 * World clock helpers: a list of well-known cities, plus every IANA zone the
 * runtime knows, and formatting of a time in another zone relative to ours.
 */

export interface ZoneOption {
  zone: string;
  /** City name shown on the card. */
  label: string;
  /** Extra search words (country, other spellings). */
  keywords?: string;
}

/** Popular cities first; names in Indonesian where they differ. */
export const CITIES: ZoneOption[] = [
  { zone: "Asia/Jakarta", label: "Jakarta", keywords: "indonesia wib bandung surabaya" },
  { zone: "Asia/Makassar", label: "Makassar", keywords: "indonesia wita bali denpasar" },
  { zone: "Asia/Jayapura", label: "Jayapura", keywords: "indonesia wit papua" },
  { zone: "Asia/Singapore", label: "Singapura", keywords: "singapore" },
  { zone: "Asia/Kuala_Lumpur", label: "Kuala Lumpur", keywords: "malaysia" },
  { zone: "Asia/Bangkok", label: "Bangkok", keywords: "thailand" },
  { zone: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh", keywords: "vietnam saigon" },
  { zone: "Asia/Manila", label: "Manila", keywords: "filipina philippines" },
  { zone: "Asia/Hong_Kong", label: "Hong Kong" },
  { zone: "Asia/Shanghai", label: "Shanghai", keywords: "china tiongkok beijing" },
  { zone: "Asia/Taipei", label: "Taipei", keywords: "taiwan" },
  { zone: "Asia/Seoul", label: "Seoul", keywords: "korea" },
  { zone: "Asia/Tokyo", label: "Tokyo", keywords: "jepang japan osaka" },
  { zone: "Asia/Kolkata", label: "Mumbai", keywords: "india delhi kolkata" },
  { zone: "Asia/Dubai", label: "Dubai", keywords: "uae uni emirat arab" },
  { zone: "Asia/Riyadh", label: "Riyadh", keywords: "saudi arabia mekah mecca makkah madinah" },
  { zone: "Europe/Istanbul", label: "Istanbul", keywords: "turki turkey" },
  { zone: "Europe/Moscow", label: "Moskow", keywords: "rusia russia moscow" },
  { zone: "Europe/London", label: "London", keywords: "inggris uk britain" },
  { zone: "Europe/Paris", label: "Paris", keywords: "prancis france" },
  { zone: "Europe/Berlin", label: "Berlin", keywords: "jerman germany" },
  { zone: "Europe/Amsterdam", label: "Amsterdam", keywords: "belanda netherlands" },
  { zone: "Europe/Madrid", label: "Madrid", keywords: "spanyol spain" },
  { zone: "Europe/Rome", label: "Roma", keywords: "italia italy rome" },
  { zone: "Africa/Cairo", label: "Kairo", keywords: "mesir egypt cairo" },
  { zone: "Africa/Lagos", label: "Lagos", keywords: "nigeria" },
  { zone: "Africa/Johannesburg", label: "Johannesburg", keywords: "afrika selatan south africa" },
  { zone: "America/New_York", label: "New York", keywords: "amerika usa as" },
  { zone: "America/Chicago", label: "Chicago", keywords: "amerika usa as" },
  { zone: "America/Denver", label: "Denver", keywords: "amerika usa as" },
  { zone: "America/Los_Angeles", label: "Los Angeles", keywords: "amerika usa as san francisco" },
  { zone: "America/Toronto", label: "Toronto", keywords: "kanada canada" },
  { zone: "America/Mexico_City", label: "Mexico City", keywords: "meksiko mexico" },
  { zone: "America/Sao_Paulo", label: "São Paulo", keywords: "brasil brazil" },
  { zone: "America/Argentina/Buenos_Aires", label: "Buenos Aires", keywords: "argentina" },
  { zone: "Australia/Sydney", label: "Sydney", keywords: "australia" },
  { zone: "Australia/Perth", label: "Perth", keywords: "australia" },
  { zone: "Pacific/Auckland", label: "Auckland", keywords: "selandia baru new zealand" },
  { zone: "Pacific/Honolulu", label: "Honolulu", keywords: "hawaii" },
  { zone: "UTC", label: "UTC", keywords: "gmt utc" },
];

/** "America/Argentina/Buenos_Aires" -> "Buenos Aires" */
function nameFromZone(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

export function zoneLabel(zone: string): string {
  return CITIES.find((c) => c.zone === zone)?.label ?? nameFromZone(zone);
}

/** The zone exists in this runtime (a stored zone may not, after an ICU update). */
export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

let allZones: ZoneOption[] | null = null;

/** Known cities, then every other IANA zone. */
function zoneOptions(): ZoneOption[] {
  if (!allZones) {
    // Skip zones already listed, also under another id (Buenos_Aires vs Argentina/Buenos_Aires).
    const known = new Set([...CITIES.map((c) => c.zone), ...CITIES.map((c) => nameFromZone(c.zone).toLowerCase())]);
    let extra: string[] = [];
    try {
      // ES2022 API; the TS lib in use does not declare it yet.
      const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
      extra = (intl.supportedValuesOf?.("timeZone") ?? []).filter((z) => !known.has(z) && !known.has(nameFromZone(z).toLowerCase()));
    } catch {
      extra = [];
    }
    allZones = [...CITIES, ...extra.map((zone) => ({ zone, label: nameFromZone(zone), keywords: zone.toLowerCase() }))];
  }
  return allZones;
}

/** Cities matching `query` (name, country, or zone id). */
export function searchZones(query: string, limit = 8): ZoneOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return CITIES.slice(0, limit);
  return zoneOptions()
    .filter((o) => `${o.label} ${o.keywords ?? ""} ${o.zone}`.toLowerCase().includes(q))
    .slice(0, limit);
}

/** Wall-clock parts of `date` in `zone`. */
function partsIn(date: Date, zone: string): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

export interface ZoneTime {
  /** "14.05" */
  time: string;
  hour: number;
  /** Minutes ahead of local time (negative = behind). */
  offsetMin: number;
  /** -1 yesterday, 0 today, 1 tomorrow, relative to the local date. */
  dayShift: number;
}

export function zoneTime(date: Date, zone: string): ZoneTime {
  const there = partsIn(date, zone);
  const thereUtc = Date.UTC(there.y, there.m - 1, there.d, there.h, there.min);
  const hereUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
  const offsetMin = Math.round((thereUtc - hereUtc) / 60_000);
  const dayShift = Math.sign(
    Date.UTC(there.y, there.m - 1, there.d) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const time = `${String(there.h).padStart(2, "0")}.${String(there.min).padStart(2, "0")}`;
  return { time, hour: there.h, offsetMin, dayShift };
}

/** "+5 jam", "−2,5 jam", "Sama" */
export function formatOffset(offsetMin: number): string {
  if (offsetMin === 0) return "Sama";
  const hours = Math.abs(offsetMin) / 60;
  const text = hours.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `${offsetMin > 0 ? "+" : "−"}${text} jam`;
}
