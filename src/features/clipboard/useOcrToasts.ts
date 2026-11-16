import { useEffect } from "react";
import { showToast } from "../../core/toast/toastQueue";
import { onOcrResult } from "./clipboardBridge";

const PREVIEW = 90;

/** Shows the outcome of a screen OCR in the notch. Notch window only. */
export function useOcrToasts() {
  useEffect(
    () =>
      onOcrResult(({ text, error }) => {
        if (error) {
          showToast({ title: "Gagal membaca teks", body: error, durationMs: 6000 });
        } else if (text) {
          const flat = text.replace(/\s+/g, " ").trim();
          showToast({
            title: "Teks disalin",
            body: flat.length > PREVIEW ? `${flat.slice(0, PREVIEW)}…` : flat,
          });
        } else {
          showToast({ title: "Tidak ada teks terbaca", body: "Coba pilih area yang lebih pas dengan tulisannya." });
        }
      }),
    [],
  );
}
