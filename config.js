// =============================================
//  PENGATURAN UMUM — berlaku untuk semua mobil
//  Data mobil, foto & PDF disimpan di Supabase (project black-amatis):
//    tabel galeri_mobil (1 baris per mobil), bucket galeri-qr (1 folder per mobil, nama folder = kode)
// =============================================
window.VIEWER_CONFIG = {
  // Alamat server galeri (jangan diubah)
  apiUrl: "https://ddxcjzykcrozxqwubexr.supabase.co/functions/v1/galeri-qr",

  // Nama yang tampil di tab browser & halaman pembuka
  namaSitus: "Concerto Surabaya",

  // Watermark bawaan (bisa ditimpa per mobil)
  watermark: "CONCERTO SURABAYA",

  // Tambahkan tanggal & jam saat dibuka ke watermark (true / false)
  watermarkTanggal: true,

  // Pesan saat halaman dibuka tanpa kode QR
  pesanTanpaKode: "Silakan scan QR code yang ada di mobil untuk melihat galerinya."
};
