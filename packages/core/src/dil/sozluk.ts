/**
 * Özel sözlük — §16.4.
 *
 * İki katman:
 * - **Proje sözlüğü** belgede yaşar ve ortak çalışmada PAYLAŞILIR. Karakter
 *   adları, mekânlar, uydurma terimler buraya girer: bir yazarın eklediği
 *   `AYŞE` bütün ekipte düzelir.
 * - **Kullanıcı sözlüğü** kabuğun kendi deposunda, projeler arası taşınır.
 *
 * Bu modül saf: depoyu bilmez, yalnız anahtarı ve eşleşmeyi tanımlar.
 */

/**
 * Sözlük anahtarı — büyük/küçük harf ve Türkçe nokta ayrımından bağımsız.
 *
 * ## Neden yalnız `toLocaleLowerCase` YETMEZ
 *
 * Senaryoda aynı ad üç biçimde geçer: karakter bloğunda `AYŞE`, aksiyonda
 * `Ayşe`, diyalogda `ayşe`. Anahtar bunları AYNI yere düşürmeli, yoksa
 * kullanıcı aynı kelimeyi üç kez eklemek zorunda kalır.
 *
 * ## Türkçe ı/i tuzağı — ÖLÇÜLDÜ
 *
 * `'ISPARTA'.toLocaleLowerCase('tr')` → `ısparta`, `.toLocaleLowerCase('en')`
 * → `isparta`. Yani aynı kelime, belgenin diline göre iki ayrı anahtar
 * üretir; dil değişince sözlük sessizce ıskalar. Belgede TR ve EN metin bir
 * arada bulunabildiği için "belgenin dili" de tek başına çözmez.
 *
 * Çözüm: küçültmeden SONRA `ı`'yı `i`'ye indirgemek. Bedeli, yalnız ı/i ile
 * ayrılan iki Türkçe kelimenin (`sıkı` / `siki`) aynı anahtara düşmesi —
 * kişisel bir sözlükte en kötü sonuç "bir kelime fazla kabul edildi"dir.
 * Ters yön (kelimenin sözlükte olduğu hâlde yanlış işaretlenmesi) kullanıcıyı
 * her seferinde rahatsız ederdi; bu yön etmez.
 *
 * ## Birleşik nokta (U+0307) — tuzağın ikinci yarısı, ÖLÇÜLDÜ
 *
 * `'İSTANBUL'.toLowerCase()` — yerelsiz küçültme, yani tarayıcının, panonun,
 * CSS `text-transform`ın ve yerel verilmemiş her JS çağrısının yolu — tek bir
 * `i` değil, `i` + U+0307 (BİRLEŞİK NOKTA) üretir. Unicode'da bu ikilinin
 * birleşik karşılığı yok, dolayısıyla `normalize('NFC')` onları BİRLEŞTİRMEZ.
 *
 * Sonuç: başka bir programda küçültülüp yapıştırılan `i̇stanbul` ile bizim
 * ürettiğimiz `istanbul` AYRI anahtarlara düşerdi ve kullanıcı sözlüğüne
 * eklediği kelimeyi yine kırmızı altçizgili görürdü — üstteki gerekçenin
 * "sessizce ıskalar" dediği hatanın ta kendisi. `i` sonrası birleşik nokta
 * bu yüzden düşürülüyor; `i`'nin zaten bir noktası var, ikincisi bilgi
 * taşımıyor.
 */
export function sozlukAnahtari(kelime: string): string {
  return kelime
    .normalize('NFC')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .trim();
}

/**
 * Sözlüğe girmeye uygun mu.
 *
 * Boş, yalnız noktalama ya da rakam içeren parçalar sözlüğü şişirir ve hiçbir
 * denetleyici onları zaten yanlış saymaz. Güven sınırı: kelime seçimden ya da
 * denetleyicinin raporundan geliyor.
 */
export function sozlugeUygun(kelime: string): boolean {
  const k = kelime.normalize('NFC').trim();
  if (k.length === 0 || k.length > 64) return false;
  // En az bir harf içermeli — `\p{L}` Türkçe harfleri de kapsar.
  return /\p{L}/u.test(k);
}

/** Sözlük girdisi: anahtar → kullanıcının yazdığı ÖZGÜN biçim. */
export type SozlukKaydi = Record<string, string>;

/**
 * İki katmanı tek görünüme indirir.
 *
 * Proje katmanı ÜSTTE: aynı anahtar iki katmanda da varsa projedeki özgün
 * yazım gösterilir. Ekipçe üzerinde anlaşılmış yazım, tek kullanıcının
 * kendi kaydından önce gelir.
 */
export function sozlukBirlestir(kullanici: SozlukKaydi, proje: SozlukKaydi): SozlukKaydi {
  return { ...kullanici, ...proje };
}

/** Kelime sözlükte mi. */
export function sozlukteVar(sozluk: SozlukKaydi, kelime: string): boolean {
  return Object.prototype.hasOwnProperty.call(sozluk, sozlukAnahtari(kelime));
}

/**
 * Metindeki sözlüğe uygun kelimeleri çıkarır — sözlüğe toplu ekleme için.
 *
 * Kesme işareti kelimenin İÇİNDE kalır (`Arzu'nun` tek kelimedir) ama sonda
 * kalırsa düşer; ayırmak, sözlüğe `nun` gibi anlamsız parçalar sokardı.
 */
export function kelimeleriAyir(metin: string): string[] {
  const bulunan = metin.normalize('NFC').match(/\p{L}[\p{L}\p{M}''’-]*/gu) ?? [];
  const gorulen = new Set<string>();
  const cikti: string[] = [];
  for (const ham of bulunan) {
    const k = ham.replace(/[''’-]+$/u, '');
    if (!sozlugeUygun(k)) continue;
    const anahtar = sozlukAnahtari(k);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    cikti.push(k);
  }
  return cikti;
}
