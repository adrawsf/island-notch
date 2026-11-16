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
    shell/             Jembatan ke shell Rust (monitor, shortcut, window pengaturan, autostart)
    toast/             Antrean notifikasi notch (showToast)
    storage/           Data fitur yang disimpan (persistedValue, file data.json)
  features/<fitur>/    Satu folder per fitur: panel, hook, service
  miniplayer/          Entry window mini player (miniplayer.html)
  teleprompter/        Entry window teleprompter (teleprompter.html)
  snip/                Entry overlay OCR (snip.html): seret kotak di atas teks
  settings/            Entry window pengaturan (settings.html): halaman per kategori di sections.tsx
  shared/              Utilitas kecil (format waktu, hook umum)
src-tauri/src/
  lib.rs               Hanya merangkai plugin, setup, dan daftar command
  window.rs            Posisi window utama + browser args WebView2
  hit_test.rs          Polling kursor untuk click-through dan klik di luar
  foreground.rs        Deteksi window di depan: browser menempel atas (notch jadi garis tipis), app layar penuh (notch disembunyikan)
  shell.rs             Menerapkan config shell dari frontend (apply_shell_config)
  settings_window.rs   Window pengaturan + daftar monitor dan autostart untuk frontend
  tray.rs              Ikon dan menu tray (klik kiri buka/tutup notch, klik kanan menu singkat)
  shortcut.rs          Shortcut global: buka/tutup notch dan OCR
  media.rs             Now playing via SMTC (polling, artwork, kontrol, seek)
  volume.rs            Volume app yang sedang memutar (Core Audio, seperti slider di Volume Mixer)
  lyrics.rs            HTTP penyedia lirik (allowlist endpoint; pencocokan dan parsing di TS)
  teleprompter.rs      Window teleprompter (tembus klik kecuali toolbar, bisa disembunyikan dari rekaman/screen share)
  miniplayer.rs        Window mini player (dibuat sekali, disembunyikan saat ditutup)
  clipboard.rs         Riwayat clipboard (teks + gambar, disimpan di app data/clipboard), salin balik + paste ke app sebelumnya
  ocr.rs               Overlay potong layar + Windows OCR (Windows.Media.Ocr), hasilnya disalin
  imaging.rs           Encode/decode PNG lewat Windows imaging (tanpa crate tambahan)
  process.rs           Nama exe dari PID
```

## Konvensi

- **Menambah tab:** buat panel di `src/features/<fitur>/` (default export, menerima `TabPanelProps`), lalu daftarkan di `src/app/tabs/registry.ts` dengan lebar panelnya. Tinggi notch mengikuti isi panel (jangan pakai `h-full`); shell mengukur konten dan menganimasikan notch ke ukuran itu. Pill dan toast juga mengikuti lebar isinya.
- **Widget idle:** tambahkan komponen di `IDLE_WIDGETS` (`src/app/idle/idleWidgets.tsx`). Window pengaturan otomatis menampilkannya sebagai pilihan; pill menyesuaikan lebar dengan widget yang aktif.
- **Tampilan:** gaya liquid glass lewat kelas `glass` (permukaan), `glass-button` (kontrol timbul), dan `glass-well` (input/track cekung) di `src/styles/index.css`. Token warnanya per tema di `[data-theme]`.
- **Setting baru:** tambahkan ke `SCHEMA` di `src/core/settings/settings.ts` lengkap dengan default dan validator. Nilai yang hilang atau salah tipe di disk selalu jatuh ke default.
- **Modul Rust:** satu file atau folder per domain. Command-nya didefinisikan di modul itu, lalu didaftarkan di `lib.rs`.
- **Window baru:** wajib memakai `WEBVIEW_BROWSER_ARGS` dari `window.rs`. Args yang berbeda membuat WebView2 gagal dengan error `0x8007139F`. Buat window di thread terpisah (lihat `miniplayer.rs`), jangan dari thread utama atau command sync, karena WebView2 bisa deadlock. Tiap window punya file HTML sendiri yang didaftarkan di `vite.config.ts` dan label-nya ditambahkan di `capabilities/default.json`.
- **Pengaturan:** sumber kebenarannya `settings.ts`. Window pengaturan (`src/settings/`) mengubah store; window notch menangkap perubahannya dan mengirim bagian yang dibutuhkan Rust (monitor, shortcut, filter video) lewat `apply_shell_config`. Setting baru yang perlu diatur user: tambahkan kontrolnya di `src/settings/sections.tsx`.
- **Data fitur** (catatan, naskah, dll.) bukan setting: pakai `persistedValue(key, fallback, validate)` dari `src/core/storage/`. Data yang rusak di disk jatuh ke fallback, dan perubahannya tersinkron antar-window. Data besar (gambar) pakai opsi `file` supaya punya file store sendiri.
- **Romanisasi lirik** ada di `src/features/lyrics/romanize/`: Korea ditulis sendiri, Mandarin pakai pinyin-pro, Jepang pakai kuroshiro + kamus kuromoji. Kamus disajikan dari `node_modules` lewat plugin `kuromojiDict` di `vite.config.ts` (tidak disalin ke repo), dan kuromoji butuh shim `zlibShim.ts` + `pathShim.ts` (alias di config yang sama).
- **Sumber lirik baru:** buat provider di `src/features/lyrics/providers/`, daftarkan di `sources.ts`, dan tambahkan endpoint-nya di allowlist `lyrics.rs`. Frontend hanya menyebut nama endpoint, tidak pernah URL.
- **Notifikasi:** fitur apa pun cukup memanggil `showToast({ title, body })` dari `src/core/toast/toastQueue.ts`.
- **Rahasia** seperti file OAuth client dan `.env` tidak boleh di-commit. Polanya sudah ada di `.gitignore`.

## Roadmap

1. **Kerangka** ✅: project, shell notch, registry tab, setting, click-through.
2. **Shell lanjutan** ✅: pilih monitor, ukuran dan bentuk (notch/island), tema, widget idle, notifikasi notch (antrean toast), tray, autostart, shortcut global (default `Ctrl+Alt+N`, bisa direkam ulang).
3. **Media:** SMTC (judul, artis, artwork, progress, kontrol) ✅ (tab Media + pill lagu), lirik sinkron (LRCLIB, NetEase, Kugou, QQ Music, Genius; geser timing per lagu; romanisasi Jepang/Korea/Mandarin) ✅, mini player ✅, volume app musik (tab Media, mini player, scroll di pill) ✅.
4. **Beranda kustom** ✅: kartu jam (ukuran + bunyi tiap jam dengan jam tenang), world clock, gambar/GIF, kucing piksel (juga bisa jadi widget idle). **Produktivitas:** Catatan (teks + checklist, gaya Keep) ✅, Pomodoro + ambience sintesis (hujan, ombak, api, angin, noise) ✅, Teleprompter (di notch atau window tembus pandang/tembus klik) ✅, Kalender Google.
5. **Sistem:** Clipboard (riwayat teks + gambar, pin, cari, klik untuk paste) dan OCR (potong area layar, shortcut `Ctrl+Alt+T`) ✅, volume mixer, monitor sistem, Drop Shelf, pusat notifikasi.
6. **Window pengaturan** ✅ (glass, sidebar kategori, dibuka dari tombol ⚙ di notch atau tray), updater, dan rilis.
