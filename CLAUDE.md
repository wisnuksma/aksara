# Aksara — Aplikasi Menulis Novel untuk Mac

Nama aplikasi: **Aksara** (tagline: "Tulis naskah dan bangun dunia ceritamu, di satu meja."). Ikon aplikasi: monogram huruf "A" Lora warna emas `#C9A45C` di atas kotak biru tinta `#23273A`.

Dokumen ini adalah spesifikasi utama proyek. Baca seluruhnya sebelum menulis kode.
Pemilik proyek bukan programmer: jelaskan langkah dengan bahasa sederhana (Bahasa Indonesia),
kerjakan sedikit demi sedikit, dan pastikan setiap langkah bisa langsung dicoba.

---

## 1. Ringkasan produk

Aplikasi pribadi untuk menulis novel di Mac. Fokus pada:
- Editor naskah yang nyaman, halamannya lebar seperti Google Docs.
- Struktur Bab → Adegan (binder).
- Story bible (tokoh, tempat, faksi/kerajaan, lore) yang terhubung ke naskah.
- Asisten AI untuk saat buntu, koreksi ejaan/kalimat, dan mencari adegan.
- Data aman: autosave, snapshot, file biasa di folder milik pengguna.

Cerita pertama yang akan ditulis: fantasi tentang konflik dua kerajaan, **Estelle** dan **Navea**.
Seluruh teks antarmuka dalam **Bahasa Indonesia**.

---

## 2. Keputusan teknis (sudah disepakati)

- **Bentuk:** web app (PWA) yang **dipasang lewat Google Chrome** ("Install app") supaya tampil
  sebagai aplikasi di Dock Mac. Alasan: Chrome mendukung File System Access API
  (`showDirectoryPicker`) sehingga naskah bisa disimpan langsung sebagai file di folder pilihan
  pengguna. Safari tidak mendukung pemilih folder, jadi bukan target utama.
- **Stack yang disarankan:** Vite + React + TypeScript. Editor: **TipTap** (ProseMirror).
  Styling: CSS biasa / CSS variables (tanpa framework UI berat).
- **Penyimpanan:** File System Access API ke folder proyek. Simpan handle folder di IndexedDB
  agar tidak perlu memilih ulang setiap membuka aplikasi (minta izin ulang bila perlu).
- **Offline:** service worker. Menulis, story bible, export harus jalan tanpa internet.
  Hanya Asisten AI yang butuh internet.
- **Hosting:** GitHub Pages (gratis, pemilik sudah familier).
- **Versi kode:** Git sejak hari pertama. Commit kecil per fitur dengan pesan jelas,
  supaya mudah kembali ke versi sebelumnya.
- **Masa depan (bukan sekarang):** dibungkus jadi .app dengan Tauri, membaca folder yang sama.

---

## 3. Struktur data (satu novel = satu folder)

```
<Judul Novel>/
├── project.json          # judul, genre, target kata, target harian, urutan binder, setting
├── manuscript/
│   ├── 01-bab-satu/
│   │   ├── _bab.json     # judul bab, catatan
│   │   ├── 01-adegan.md  # front matter YAML + isi Markdown
│   │   └── 02-adegan.md
│   └── 02-.../
├── bible/
│   ├── tokoh/<slug>.md   # front matter: nama, alias[], faksi, peran, field bebas
│   ├── tempat/<slug>.md
│   ├── faksi/<slug>.md
│   └── lore/<slug>.md
├── snapshots/<id-adegan>/<timestamp>.md
└── stats.json            # jumlah kata per hari (untuk target & streak)
```

Front matter adegan: `judul, status (ide|draf|revisi|selesai), pov, lokasi, waktu_cerita, alur, sinopsis, tokoh[]`.

**Aturan keamanan data (wajib):**
- Autosave ~1 detik setelah berhenti mengetik, dan saat pindah adegan / jendela kehilangan fokus.
- Tulis aman: tulis ke file sementara lalu ganti nama, jangan menimpa langsung.
- Snapshot otomatis setiap pindah adegan bila ada perubahan; snapshot manual lewat tombol.
- Jangan pernah menghapus file pengguna tanpa konfirmasi.
- Indikator "Tersimpan" / "Menyimpan…" selalu terlihat.

---

## 4. Desain (Arah A — "Perkamen & Tinta", versi final)

File referensi visual ada di folder `design-reference/` (format .dc.html; baca markup & style
inline-nya sebagai acuan, tidak perlu dijalankan). Urutan penting:
`Welcome` → `Baru` → `Kosong` → `Final` / `Final-Gelap`.

### Token warna — terang
| Peran | Hex |
|---|---|
| Sidebar & header (biru tinta) | `#1B1E2B` |
| Kartu di sidebar | `#23273A` |
| Garis di area gelap | `#2A2E40` / `#2F3448` |
| Teks di area gelap | `#E8E3D6` (sekunder `#B4B6C6`, redup `#9A9DB0`) |
| Aksen emas | `#C9A45C` (teks emas di atas terang: `#8A6A2B`) |
| Latar area naskah | `#EFE7D6` |
| Kertas / kartu terang | `#FFFBF3` |
| Panel kanan | `#F7F1E4` |
| Garis terang | `#E6DCC6` / `#E0D4BA` |
| Teks utama | `#2A2620` (sekunder `#3D372D`, redup `#6E6555`) |
| Estelle (sorotan nama) | teks `#1F3A66`, latar `#E3E9F3`, kartu `#22304A` |
| Navea (sorotan nama) | teks `#7A2E45`, kartu `#3A2330` |
| Kesalahan ejaan | `#B23A2E`, latar `#F6E1DC` |

### Token warna — gelap (ikut setelan Appearance macOS, `prefers-color-scheme`)
Sidebar tetap sama. Area naskah: latar `#13151E`, kertas `#1E2130`, panel `#181B26`,
teks `#E4DED0` (sekunder `#C9C3B5`, redup `#A39C8C`), emas teks `#D4B26C`, garis `#2C3044`,
Estelle `#B4CAEC`, Navea `#E8AABD`, ejaan `#F08A7C`.

### Tipografi
- UI: **Inter** 13px.
- Judul aplikasi / nama bab di binder: **Lora** 600 (nama bab 16px).
- Naskah & judul adegan: **Lora** — isi 17px, line-height 1.8; judul adegan 26px 600.
- _(Diganti dari Cormorant Garamond + Literata atas permintaan pemilik: lebih lembut dan nyaman dibaca. File di `design-reference/` masih memakai font lama.)_
- Label kecil: 11px, 600, huruf kapital, letter-spacing .14em, warna emas.

### Tata letak jendela utama (1440×900 sebagai acuan)
- Header 56px: tombol jendela, nama novel, segmented control **Menulis | Merencanakan | Dunia**, tombol Cari (⌘K).
- Kiri (220px, gelap): binder Bab → Adegan dengan progres, blok story bible, cincin target harian.
- Tengah: toolbar format ala Google Docs (urungkan/ulangi, gaya paragraf, font, ukuran, B/I/U,
  perataan, komentar, zoom) lalu **halaman kertas lebar 816px**, margin ±1 inci, tinggi halaman
  penuh, **di-scroll di dalam area tengah** (jendela tidak ikut memanjang).
- Kanan (320px): panel tab **Asisten | Adegan | Catatan**.
- Kedua panel samping bisa disembunyikan. Mode fokus (⌘.): hanya halaman, paragraf aktif terang,
  lainnya diredupkan.

---

## 5. Fitur per fase

### Fase 1 — bisa dipakai menulis (kerjakan ini dulu)
1. Layar sambutan: Mulai novel baru (⌘N), Buka proyek (⌘O), Impor naskah; daftar proyek terbaru (dengan empty state).
2. Dialog novel baru: judul, genre, target kata, struktur awal (Kosong / Tiga babak / Fantasi epik), pilih folder.
3. Ruang kerja: binder (tambah/ubah nama/urutkan bab & adegan dengan drag), editor TipTap, autosave ke file, hitung kata (adegan, bab, hari ini), indikator tersimpan.
4. Empty state sesuai desain `Kosong`.
5. Dark mode otomatis.
6. Pasang sebagai PWA (manifest + service worker) dan petunjuk "Install app" di Chrome.

### Fase 2
- Story bible (CRUD tokoh/tempat/faksi/lore, field bebas).
- Auto-link: nama & alias dari story bible disorot di naskah; hover = kartu ringkas; klik = buka entri.
- Panel inspector adegan (sinopsis, status, POV, lokasi, waktu, alur, tokoh).
- Export: **.docx** (library `docx`, bisa dibuka di Google Docs), **PDF** (print stylesheet), Markdown. Impor .docx (`mammoth`), dipecah per heading menjadi bab.
- Snapshot + bandingkan versi.

### Fase 3 — Asisten AI
- Memakai **Anthropic Claude API** dengan API key milik pengguna, disimpan lokal (bukan di repo). Panggilan langsung dari browser memerlukan header `anthropic-dangerous-direct-browser-access: true`; jelaskan risikonya dan simpan key hanya di perangkat.
- Konteks yang dikirim: adegan aktif + entri story bible yang relevan (bukan seluruh novel).
- Fitur: chat bebas; tombol cepat **Saya buntu**, **Periksa ejaan**, **Cari adegan**, **Cek konsistensi**.
- Koreksi ejaan/kalimat tampil sebagai garis bergelombang di naskah + kartu saran (Terima / Abaikan) dengan alasan singkat (mengacu kaidah EYD/PUEBI).
- Cari adegan: pencarian bahasa alami → kartu hasil berisi kutipan, klik untuk membuka adegan.
- AI **tidak pernah mengubah naskah tanpa persetujuan** pengguna.

### Fase 4
Papan plot (corkboard), timeline peristiwa, peta relasi tokoh, peta dunia dengan pin, statistik streak, tombol "Kirim ke Google Docs" lewat Google Drive API.

---

## 6. Cara kerja dengan pemilik proyek

- Kerjakan satu fitur kecil per langkah, lalu beri tahu cara mencobanya (perintah yang dijalankan, apa yang harus terlihat).
- Jalankan dan uji sendiri sebelum bilang selesai; perbaiki error sendiri.
- Commit Git setelah setiap fitur yang berfungsi.
- Bila ada keputusan yang mengubah arah (misalnya ganti library), tanya dulu.
- Jangan menambah fitur di luar fase yang sedang dikerjakan tanpa diminta.

---

## 7. Aset logo

- `design-reference/pena-aksara.png`: ilustrasi pena bulu warna emas (latar transparan) yang diletakkan kecil di atas huruf "a" terakhir pada judul "Aksara" di layar sambutan (lihat `Welcome.dc.html`; di file itu gambar dirujuk sebagai `/_blob/...`, ganti dengan path aset lokal).
- Gambar ini berasal dari template stok. Sebelum dipakai di luar pemakaian pribadi, pastikan lisensinya (atribusi/izin logo) sudah sesuai.
