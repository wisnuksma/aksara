# Aksara

Aplikasi menulis novel (PWA untuk Chrome di Mac). Spesifikasi lengkap: `CLAUDE.md`.

## Pertama kali / setelah mengunduh versi baru

Pasang Node.js (versi LTS) dari https://nodejs.org (sekali saja), lalu di Terminal:

```
cd ~/Downloads && rm -rf aksara && unzip -q aksara-<versi>.zip && cd aksara && npm install && npm run app
```

`npm run app` merakit aplikasi lalu menyajikannya di http://localhost:4173.

## Memasang di Dock (sekali saja)

1. Buka http://localhost:4173 di Google Chrome.
2. Klik **Pasang** pada kartu "Pasang Aksara di Dock", atau ikon pasang di ujung kanan
   kolom alamat, atau menu ⋮ → Transmisikan, simpan, dan bagikan → Instal halaman sebagai aplikasi.
3. Aksara muncul di Launchpad/Dock. Klik kanan ikonnya di Dock → Options → Keep in Dock.

Setelah terpasang, Aksara bisa dibuka dari Dock walau Terminal ditutup dan tanpa internet.

## Memperbarui

Jalankan lagi perintah di atas dengan zip baru, buka Aksara: akan muncul
"Versi baru Aksara tersedia" → klik **Muat ulang**.

## Untuk pengembangan

`npm run dev` (http://localhost:5173) — tanpa service worker, berubah otomatis saat kode diubah.
