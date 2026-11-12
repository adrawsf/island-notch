/**
 * The home card image, stored as a data URL in its own store file so saving
 * other data never rewrites it. GIFs are kept as-is (to stay animated);
 * other images are scaled down and re-encoded.
 */
import { persistedValue } from "../../core/storage/persistedValue";

/** Longest side after scaling (CSS px at 2x for a ~200px card). */
const MAX_SIDE = 900;
/** GIFs cannot be scaled without losing animation; cap their size instead. */
const MAX_GIF_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const homeImage = persistedValue<string | null>(
  "homeImage",
  null,
  (raw) => (raw === null || (typeof raw === "string" && raw.startsWith("data:image/")) ? (raw as string | null) : null),
  { file: "home-image.json" },
);

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // WebP keeps transparency (PNG stickers) and stays small for photos.
  return canvas.toDataURL("image/webp", 0.88);
}

/** Validates, shrinks and stores `file`. Throws a message for the user. */
export async function importHomeImage(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("File itu bukan gambar.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Gambarnya terlalu besar (maksimal 25 MB).");
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF_BYTES) throw new Error("GIF maksimal 4 MB supaya tetap ringan.");
    homeImage.set(await readAsDataUrl(file));
    return;
  }
  try {
    homeImage.set(await downscale(file));
  } catch {
    throw new Error("Gambar ini tidak bisa dibaca.");
  }
}
