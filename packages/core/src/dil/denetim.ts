/**
 * Yazım denetimi dilleri — §16.4.
 *
 * ## Liste SABİT YAZILMAZ, kabuktan gelir
 *
 * Desteklenen diller Chromium'un derlenmiş sözlük listesine bağlıdır ve
 * sürümden sürüme değişir. Sabit bir liste yazmak, kullanıcıya seçebileceğini
 * sandığı ama `setSpellCheckerLanguages`'in hata fırlatacağı bir dil
 * göstermek olurdu. Kabuk `availableSpellCheckerLanguages`'i bildirir, arayüz
 * yalnız onu gösterir.
 *
 * ## ÖLÇÜLDÜ: Japonca yok
 *
 * Chromium'un `kSupportedSpellCheckerLanguages` listesinde `tr`, `en-US`,
 * `de`, `fr`, `ru`, `uk` var; **`ja` YOK** ve `ja-Latn` de yok. Hunspell
 * kelime-sınırı olan yazı sistemleri için tasarlandı; kana/kanji o modele
 * girmiyor.
 *
 * Romanize Japonca için mekanizma çalışırdı — eksik olan yalnız sözlük.
 * Pratik yol PROJE SÖZLÜĞÜ: `AKIRA`, `shinjuku` gibi kelimeler oraya
 * eklenince kalıcı olarak kabul edilir (bkz. `dil/sozluk.ts`).
 */

/** Kullanıcıya gösterilen dil adları. Kabuk desteklemiyorsa gösterilmez. */
export const DIL_ADLARI: Record<string, string> = {
  tr: 'Türkçe',
  'tr-TR': 'Türkçe',
  en: 'İngilizce',
  'en-US': 'İngilizce (ABD)',
  'en-GB': 'İngilizce (Britanya)',
  de: 'Almanca',
  'de-DE': 'Almanca',
  fr: 'Fransızca',
  'fr-FR': 'Fransızca',
  ru: 'Rusça',
  'ru-RU': 'Rusça',
  uk: 'Ukraynaca',
  'uk-UA': 'Ukraynaca',
};

export interface DenetimDili {
  kod: string;
  ad: string;
}

/**
 * Kabuğun bildirdiği kodları gösterilebilir listeye çevirir.
 *
 * Tanımadığımız kod ATILMAZ, kodun kendisiyle gösterilir: kabuk destekliyorsa
 * kullanıcının onu seçme hakkı var. Süzmek, çeviri tablomuzun eksikliğini
 * kullanıcının yeteneği sanmak olurdu.
 *
 * Aynı dilin varyantları (`tr` ve `tr-TR`) ayrı ayrı listelenmez — ikisi de
 * aynı sözlüğü açar ve menüde iki kez "Türkçe" görünmesi kullanıcıya
 * aralarında bir fark varmış gibi gelir. İlk gelen kod korunur.
 */
export function denetimDilleri(mevcutKodlar: readonly string[]): DenetimDili[] {
  const gorulen = new Set<string>();
  const cikti: DenetimDili[] = [];
  for (const kod of mevcutKodlar) {
    const ad = DIL_ADLARI[kod] ?? kod;
    if (gorulen.has(ad)) continue;
    gorulen.add(ad);
    cikti.push({ kod, ad });
  }
  return cikti.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/**
 * Seçilen dilleri kabuğa verilmeden ÖNCE süzer.
 *
 * `setSpellCheckerLanguages` listede olmayan bir kod görürse FIRLATIR ve
 * o çağrıdaki bütün diller uygulanmaz — yani bir bayat kod, geçerli dilleri
 * de götürür. Güven sınırı: seçim kullanıcı ayarından geliyor ve ayar
 * kaydedildikten sonra Electron sürümü değişmiş olabilir.
 */
export function gecerliDilleri(
  secilen: readonly string[],
  mevcutKodlar: readonly string[],
): string[] {
  const mevcut = new Set(mevcutKodlar);
  return secilen.filter((k) => mevcut.has(k));
}
