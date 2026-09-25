/**
 * ANA SÜREÇ METİNLERİ — yerel diyalog başlıkları, video ilerlemesi ve
 * arayüze ulaşan hata mesajları arayüz diliyle yazılır.
 *
 * Neden ayrı dosya: `menu.ts` Electron'u içe aktarıyor; `safePath` ve
 * `frameStore` gibi saf modüller testte Electron'suz yükleniyor ve bu
 * çevirmene ihtiyaç duyuyor. Dil `menuDiliniAyarla` ile BİRLİKTE değişir
 * (tek kaynak: renderer'ın bildirdiği arayüz dili). Desen renderer'ın
 * `t`/`tf`'siyle aynı: Türkçe metin anahtar, bilinmeyen anahtar Türkçe düşer.
 *
 * Denetimde bulundu (2026-09-25): "Proje aç", "Projeyi kaydet", "Dışa
 * aktar" gibi yerel pencere başlıkları ve "Kodlanıyor…" ilerlemesi
 * İngilizce arayüzde de Türkçe görünüyordu.
 */
export type AnaDil = 'en' | 'tr';

let dil: AnaDil = 'en';

export function anaDiliniAyarla(yeni: AnaDil): void {
  dil = yeni;
}

const ANA_EN: Record<string, string> = {
  'Storyboard Projesi': 'Storyboard project',
  'Proje aç': 'Open project',
  'Farklı kaydet': 'Save as',
  'Projeyi kaydet': 'Save project',
  'Dışa aktar': 'Export',
  'PNG dizisini kaydet': 'Save PNG sequence',
  'ZIP arşivi': 'ZIP archive',
  'Animatiği kaydet': 'Save animatic',
  'Ses dosyası seç': 'Choose an audio file',
  'Ses': 'Audio',
  'Tamam': 'OK',
  'Eski sürümün verisi taşınamadı': 'Data from the previous version could not be moved',
  'Bu sistemde şifreli saklama yok; anahtar kaydedilmedi.': 'Encrypted storage is not available on this system; the key was not saved.',
  // video.ts
  'Kare dosyası bulunamadı — dışa aktarma yarıda kalmış olabilir.': 'A frame file is missing — the export may have been interrupted.',
  'Gömülü ffmpeg bulunamadı.': 'The bundled ffmpeg was not found.',
  'Kareler hazırlanıyor…': 'Preparing frames…',
  'Dışa aktarılacak kare yok.': 'There are no frames to export.',
  'Kodlanıyor… %s%': 'Encoding… %s%',
  'İptal edildi.': 'Cancelled.',
  'Tamamlandı — hedef süre %s sn': 'Done — target duration %s s',
  // store.ts
  'Otomatik kayıt': 'Autosave',
  '%s — otomatik kayıt': '%s — autosave',
  // dosya-iliskilendirme.ts
  'Dosya ilişkilendirmesi yalnız Windows’ta yapılabiliyor.': 'File association is only available on Windows.',
  'Dosya simgesi (dosya.ico) bulunamadı; ilişkilendirme yazılmadı.': 'The file icon (dosya.ico) was not found; the association was not written.',
  // safePath.ts
  'Geçersiz dosya yolu.': 'Invalid file path.',
  'Yalnızca .sbp dosyaları açılabilir.': 'Only .sbp files can be opened.',
  'Bu konuma erişim izni yok.': 'No permission to access this location.',
  'Geçersiz %s yolu.': 'Invalid %s path.',
  'Geçersiz %s uzantısı: %s': 'Invalid %s extension: %s',
  'Bu %s konumuna erişim izni yok.': 'No permission to access this %s location.',
  'Geçersiz %s.': 'Invalid %s.',
  'Geçersiz sürüm kimliği.': 'Invalid version ID.',
  '(yok)': '(none)',
  'video çıktısı': 'video output',
  'ses dosyası': 'audio file',
  'proje kimliği': 'project ID',
  'sürüm kimliği': 'version ID',
  'sağlayıcı adı': 'provider name',
  // frameStore.ts
  'Geçersiz iş kimliği.': 'Invalid job ID.',
  'Geçersiz kare verisi.': 'Invalid frame data.',
  'Kare verisi çok büyük.': 'Frame data is too large.',
  'Boş kare verisi.': 'Empty frame data.',
  'Geçersiz kare sırası.': 'Invalid frame index.',
  'Geçersiz kare süresi.': 'Invalid frame duration.',
  'Dışa aktarma için ayrılan disk sınırı aşıldı.': 'The disk space reserved for the export was exceeded.',
  'Kare %s eksik — dışa aktarma tamamlanamadı.': 'Frame %s is missing — the export could not be completed.',
};

/** Çevir; `%s`/`%d` yer tutucularını sırayla doldur. */
export function at(tr: string, ...degerler: (string | number)[]): string {
  let metin = dil === 'tr' ? tr : ANA_EN[tr] ?? tr;
  for (const d of degerler) metin = metin.replace(/%[ds]/, String(d));
  return metin;
}
