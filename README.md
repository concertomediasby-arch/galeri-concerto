# galeri-concerto

Halaman viewer galeri QR mobil Concerto Surabaya, di-host GitHub Pages di **https://galeri.concerto.id**.

- 1 QR = 1 mobil: `https://galeri.concerto.id/#<kode>`
- Data mobil, foto, dan PDF **tidak** disimpan di repo ini. Semuanya ada di Supabase
  (project `black-amatis`: tabel `galeri_mobil`, bucket privat `galeri-qr`) dan diambil
  lewat edge function `galeri-qr` yang memberi link sementara (5 menit).
- Repo ini hanya berisi tampilan: `index.html`, `app.js`, `config.js`.

Menambah mobil atau foto tidak perlu mengubah repo ini.
