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
    tabs/registry.ts   Daftar tab (satu-satunya tempat menambah tab)
  core/                Infrastruktur bersama
    settings/          Setting bertipe + default + validasi
    notch/             Jembatan ke hit-test Rust (click-through, hover)
  features/<fitur>/    Satu folder per fitur: panel, hook, service
  shared/              Utilitas kecil (format waktu, hook umum)
src-tauri/src/
  lib.rs               Hanya merangkai plugin, setup, dan daftar command
  window.rs            Posisi window utama + browser args WebView2
  hit_test.rs          Polling kursor untuk click-through dan klik di luar
```

## Konvensi

- **Menambah tab:** buat panel di `src/features/<fitur>/` (default export, menerima `TabPanelProps`), lalu daftarkan di `src/app/tabs/registry.ts`. Shell yang mengurus navigasi, ukuran, dan animasi.
- **Setting baru:** tambahkan ke `SCHEMA` di `src/core/settings/settings.ts` lengkap dengan default dan validator. Nilai yang hilang atau salah tipe di disk selalu jatuh ke default.
- **Modul Rust:** satu file atau folder per domain. Command-nya didefinisikan di modul itu, lalu didaftarkan di `lib.rs`.
- **Window baru:** wajib memakai `WEBVIEW_BROWSER_ARGS` dari `window.rs`. Args yang berbeda membuat WebView2 gagal dengan error `0x8007139F`.
- **Rahasia** seperti file OAuth client dan `.env` tidak boleh di-commit. Polanya sudah ada di `.gitignore`.

## Roadmap

1. **Kerangka** ✅: project, shell notch, registry tab, setting, click-through.
2. **Shell lanjutan:** pilih monitor, ukuran dan posisi, tema, widget idle, notifikasi notch (antrean toast), tray, autostart, shortcut global.
3. **Media:** SMTC (judul, artis, artwork, progress, kontrol), lirik, mini player.
4. **Produktivitas:** To-Do, Mini Note, Pomodoro, Kalender Google, Teleprompter.
5. **Sistem:** Clipboard dan OCR, volume mixer, monitor sistem, Drop Shelf, pusat notifikasi.
6. **Window pengaturan, updater, dan rilis.**
