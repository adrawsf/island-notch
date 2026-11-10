# Island Notch

Notch bergaya *dynamic island* untuk Windows. Dibangun dengan Tauri v2, React 19, TypeScript, Vite, dan Tailwind.

Ini adalah penulisan ulang bersih dari fitur-fitur notch-island, dengan arsitektur yang lebih modular.

## Menjalankan

```powershell
npm install
$env:CARGO_BUILD_JOBS=4; npm run tauri dev
```

- `npm run dev` menjalankan frontend saja di browser (http://localhost:1431). Fitur yang butuh Tauri otomatis jadi no-op.
- `npm run typecheck` menjalankan pengecekan TypeScript.

## Struktur

```
src/
  app/                 Shell notch: buka/tutup, animasi, tab bar
    idle/              Widget idle (isi pill saat tidak ada aktivitas)
    tabs/registry.ts   Daftar tab (satu-satunya tempat menambah tab)
  core/                Infrastruktur bersama
    settings/          Setting bertipe + default + validasi
    notch/             Jembatan ke hit-test Rust (click-through, hover, toggle)
    shell/             Jembatan ke shell Rust (monitor, shortcut, tray)
    toast/             Antrean notifikasi notch (showToast)
    storage/           Data fitur yang disimpan (persistedValue, file data.json)
  features/<fitur>/    Satu folder per fitur: panel, hook, service
  miniplayer/          Entry window mini player (miniplayer.html)
  shared/              Utilitas kecil (format waktu, hook umum)
src-tauri/src/
  lib.rs               Hanya merangkai plugin, setup, dan daftar command
  window.rs            Posisi window utama + browser args WebView2
  hit_test.rs          Polling kursor untuk click-through dan klik di luar
  shell.rs             Menerapkan config shell dari frontend (apply_shell_config)
  tray.rs              Ikon dan menu tray (pengaturan sementara)
  shortcut.rs          Shortcut global buka/tutup notch
  media.rs             Now playing via SMTC (polling, artwork, kontrol, seek)
  lyrics.rs            HTTP ke LRCLIB (host dikunci; pencocokan dan parsing di TS)
  miniplayer.rs        Window mini player (dibuat sekali, disembunyikan saat ditutup)
```

## Konvensi

- **Menambah tab:** buat panel di `src/features/<fitur>/` (default export, menerima `TabPanelProps`), lalu daftarkan di `src/app/tabs/registry.ts` dengan lebar panelnya. Tinggi notch mengikuti isi panel (jangan pakai `h-full`); shell mengukur konten dan menganimasikan notch ke ukuran itu. Pill dan toast juga mengikuti lebar isinya.
- **Widget idle:** tambahkan komponen di `IDLE_WIDGETS` (`src/app/idle/idleWidgets.tsx`). Menu tray otomatis menampilkannya sebagai pilihan; pill menyesuaikan lebar dengan widget yang aktif.
- **Tampilan:** gaya liquid glass lewat kelas `glass` (permukaan), `glass-button` (kontrol timbul), dan `glass-well` (input/track cekung) di `src/styles/index.css`. Token warnanya per tema di `[data-theme]`.
- **Setting baru:** tambahkan ke `SCHEMA` di `src/core/settings/settings.ts` lengkap dengan default dan validator. Nilai yang hilang atau salah tipe di disk selalu jatuh ke default.
- **Modul Rust:** satu file atau folder per domain. Command-nya didefinisikan di modul itu, lalu didaftarkan di `lib.rs`.
- **Window baru:** wajib memakai `WEBVIEW_BROWSER_ARGS` dari `window.rs`. Args yang berbeda membuat WebView2 gagal dengan error `0x8007139F`. Buat window di thread terpisah (lihat `miniplayer.rs`), jangan dari thread utama atau command sync, karena WebView2 bisa deadlock. Tiap window punya file HTML sendiri yang didaftarkan di `vite.config.ts` dan label-nya ditambahkan di `capabilities/default.json`.
- **Pengaturan shell:** sumber kebenarannya `settings.ts`. Frontend mengirim config ke Rust lewat `apply_shell_config`; pilihan di menu tray dikirim balik sebagai event `tray://select` (`<grup>:<nilai>`). Nilai union di `settings.ts` harus sama dengan daftar opsi di `tray.rs`.
- **Data fitur** (to-do, catatan, dll.) bukan setting: pakai `persistedValue(key, fallback, validate)` dari `src/core/storage/`. Data yang rusak di disk jatuh ke fallback, dan perubahannya tersinkron antar-window.
- **Notifikasi:** fitur apa pun cukup memanggil `showToast({ title, body })` dari `src/core/toast/toastQueue.ts`.
- **Rahasia** seperti file OAuth client dan `.env` tidak boleh di-commit. Polanya sudah ada di `.gitignore`.

## Roadmap

1. **Kerangka** ✅: project, shell notch, registry tab, setting, click-through.
2. **Shell lanjutan** ✅: pilih monitor, ukuran dan bentuk (notch/island), tema, widget idle, notifikasi notch (antrean toast), tray, autostart, shortcut global (default `Ctrl+Alt+N`). Pengaturannya sementara lewat menu tray.
3. **Media:** SMTC (judul, artis, artwork, progress, kontrol) ✅ (tab Media + pill lagu), lirik sinkron dari LRCLIB ✅, mini player ✅.
4. **Produktivitas:** To-Do ✅, Mini Note ✅, Pomodoro ✅, Kalender Google, Teleprompter.
5. **Sistem:** Clipboard dan OCR, volume mixer, monitor sistem, Drop Shelf, pusat notifikasi.
6. **Window pengaturan, updater, dan rilis.**
