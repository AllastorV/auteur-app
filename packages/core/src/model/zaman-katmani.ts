/**
 * ZAMAN KATMANI — sahnenin anlatı düzlemi.
 *
 * ## Neden ETİKET, neden ayrıştırma değil
 *
 * Bir sahnenin geriye dönüş olup olmadığı sahne başlığından ÇIKARILAMAZ.
 * Sektörde tutarsız yazılıyor: `GERİYE DÖNÜŞ`, `FLASHBACK`, `1987 —`,
 * bazen hiçbir şey. Ayrıştırmayla tahmin etmek, yanlış bir grafiği doğru
 * gibi göstermek olurdu — bu programın ölçüm disiplinine aykırı.
 *
 * O yüzden katman kullanıcının verdiği bir etikettir. Etiketlenmemiş senaryo
 * tümüyle `simdi` görünür; doğru varsayılan, çünkü senaryoların çoğu
 * doğrusaldır ve yanlış bir varsayım değil, YOKLUĞUN dürüst gösterimidir.
 *
 * Bu dosya SAF: ProseMirror, React, Yjs bilmiyor.
 */

export type ZamanKatmani = 'simdi' | 'geri' | 'ileri' | 'hayal';

export const VARSAYILAN_KATMAN: ZamanKatmani = 'simdi';

/** Arayüzde gösterilecek sıra — kronolojik değil, ANLATIYA uzaklık sırası. */
export const KATMANLAR: readonly ZamanKatmani[] = ['simdi', 'geri', 'ileri', 'hayal'];

/**
 * Sözlük anahtarları. Metin BURADA Türkçe kalıyor ve gösterildiği yerde
 * `t()` ile çevriliyor — modül seviyesinde `t()` çağırmak dili dondururdu
 * (modül bir kez değerlendirilir, dil değişince yeniden çalışmaz).
 */
export const KATMAN_ADLARI: Record<ZamanKatmani, string> = {
  simdi: 'şimdi',
  geri: 'geriye dönüş',
  ileri: 'ileriye sıçrama',
  hayal: 'rüya / hayal',
};

const GECERLI = new Set<string>(KATMANLAR);

/**
 * Ham değeri katmana çevirir — GÜVEN SINIRI.
 *
 * Değer proje dosyasından, yani kullanıcının elinden geliyor: elle
 * düzenlenmiş, eski bir sürümden kalmış ya da başka bir uygulama yazmış
 * olabilir. Tanınmayan her şey varsayılana düşer, fırlatmaz — bir etiket
 * yüzünden belge açılmaz olmak çok ağır bir ceza olurdu.
 */
export function katmanCoz(ham: unknown): ZamanKatmani {
  return typeof ham === 'string' && GECERLI.has(ham) ? (ham as ZamanKatmani) : VARSAYILAN_KATMAN;
}

/**
 * Hikâye sırası — sahnenin OLAY dünyasındaki yeri.
 *
 * `null` bilinmiyor demek ve bilinçli bir durumdur: kullanıcı katmanı
 * etiketleyip sırayı boş bırakabilir. Sıfır bir cevaptır, boşluk değil —
 * o yüzden `0` da geçerli bir sıra sayılıyor.
 */
export function hikayeSirasiCoz(ham: unknown): number | null {
  return typeof ham === 'number' && Number.isFinite(ham) ? ham : null;
}

/**
 * GÜNÜN SAATİ anahtarından gösterilecek ada.
 *
 * `format/terim.ts`'teki `TERIMLER[dil].zaman` ile karıştırılmamalı: o
 * SENARYODA yazılan terim (büyük harf, belge dilinde, `GÜN`). Bu ise
 * arayüz etiketi. İkisi ayrı çünkü belge dili ile arayüz dili ayrı —
 * Türkçe senaryo yazan biri arayüzü İngilizce kullanabiliyor.
 *
 * Metin BURADA Türkçe kalıyor, gösterildiği yerde `t()` ile çevriliyor:
 * modül seviyesinde `t()` çağırmak dili dondururdu.
 */
export const ZAMAN_ADLARI: Record<string, string> = {
  gunduz: 'gündüz', gece: 'gece', safak: 'şafak', aksam: 'akşam',
  bilinmiyor: 'bilinmiyor',
};
