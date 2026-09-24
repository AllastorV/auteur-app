/**
 * Karakter modeli — §13.2 (`characterinformation`/`characterstructure`, F8).
 *
 * Saf: Yjs bilmez, React bilmez. Yalnız "karakter nedir", "ad geçerli mi" ve
 * "senaryoda hangi karakterler geçiyor" sorularını yanıtlar. Desen
 * `model/yerimi.ts`'in aynısı: sabit alan kümesi, belgeden okunan ham
 * değeri güvenli bir kayda çeviren bir `Duzelt` fonksiyonu.
 */

import { sozlukAnahtari } from '../dil/sozluk';
import { karakterAdi } from './analiz';
import type { ScriptBlock } from './script';

export interface Karakter {
  id: string;
  ad: string;
  aciklama: string;
  renk: string;
  notlar: string;
}

/** Ad bu uzunluğu aşarsa listede okunmaz hâle gelir — `ETIKET_EN_UZUN` ile aynı gerekçe. */
export const KARAKTER_ADI_EN_UZUN = 80;

/**
 * Adı normalleştirir: NFC, kırpılmış, uzunluk sınırlı.
 *
 * `etiketiDuzelt` (`model/yerimi.ts`) ile AYNI şekil ama boş değer burada
 * GEÇERSİZ — karakterin tek kimlik alanı bu, boş bırakılırsa listede hangi
 * kaydın hangisi olduğu anlaşılmaz (yer iminde etiket isteğe bağlıydı çünkü
 * blok metni bir yedek gösterimdi; karakterin öyle bir yedeği yok).
 */
export function adiDuzelt(deger: unknown): string {
  if (typeof deger !== 'string') return '';
  return deger.normalize('NFC').trim().slice(0, KARAKTER_ADI_EN_UZUN);
}

/**
 * Ad karşılaştırma anahtarı — Türkçe İ/ı tuzağından bağımsız.
 *
 * TEK EV: kendi katlamamızı yazmıyoruz. `dil/sozluk.ts`'teki `sozlukAnahtari`
 * tam bu sorunu çözmek için var — `'ISPARTA'.toLocaleLowerCase('tr')` →
 * `'ısparta'` ama `.toLocaleLowerCase('en')` → `'isparta'` tuzağını
 * `toLocaleLowerCase('tr')` SONRASINDA `ı`→`i` indirgeyerek kapatıyor, ve
 * kendi belgesinde "Karakter adları... buraya girer" diyerek zaten bu işi
 * hedefliyor. `format/terim.ts`'teki `buyut` farklı bir işi çözüyor (sabit
 * TERİM tablosuyla dil-duyarlı BÜYÜTME); iki ayrı Türkçe metnin AYNI kişi
 * olup olmadığını sormuyor, `sozlukAnahtari` soruyor.
 */
export function karakterAnahtari(ad: string): string {
  return sozlukAnahtari(ad);
}

export interface KarakterGecerlilik {
  gecerli: boolean;
  hata?: string;
}

/**
 * Karakter adının geçerliliğini denetler: boş olamaz, başka bir karakterle
 * (Türkçe katlamayla) ÇAKIŞAMAZ.
 *
 * Sessiz kabul yerine AÇIKÇA reddediyoruz (Karar — proje kuralı "sessiz
 * başarısızlık yasak"): aynı isimde iki kayıt oluşsaydı hangisinin "gerçek"
 * karakter olduğu belirsizleşir ve senaryo bağlantısı (§13.2 karakter
 * diyalogları) hangi kayda gideceğini bilemezdi.
 *
 * `kendiId` GÜNCELLEMEDE kendi kaydını çakışma saymaz — "Ayşe"yi yeniden
 * "Ayşe" olarak kaydetmek bir çakışma değildir.
 */
export function karakterAdiGecerliMi(
  ad: string,
  digerleri: readonly Karakter[],
  kendiId?: string,
): KarakterGecerlilik {
  const temiz = adiDuzelt(ad);
  if (!temiz) return { gecerli: false, hata: 'Karakter adı boş olamaz.' };
  const anahtar = karakterAnahtari(temiz);
  const cakisan = digerleri.find(
    (k) => k.id !== kendiId && karakterAnahtari(k.ad) === anahtar,
  );
  if (cakisan) return { gecerli: false, hata: `"${cakisan.ad}" adıyla zaten bir karakter var.` };
  return { gecerli: true };
}

/** Senaryodan otomatik toplanan bir karakterin ilk görünüşü. */
export interface ToplananKarakter {
  ad: string;
  /** İlk `character` bloğunun kimliği — `blogaGit` buraya gider. */
  ilkBlokId: string;
}

/**
 * Senaryo bloklarından karakter adlarını çıkarır — §13.2 otomatik toplama.
 *
 * `AYŞE (V.O.)` ile `AYŞE` AYNI karakter sayılır: normalizasyon
 * `model/analiz.ts`'teki `karakterAdi` — TEK EV, `CHARACTER_EXTENSION`
 * kalıbını burada YENİDEN YAZMIYORUZ. Aynı fonksiyon dramaturjik
 * istatistikte de kullanılıyor; iki tüketici aynı adı görür.
 *
 * Sıra BELGE SIRASI: ilk geçen ad listede önce çıkar, `siraliImler` ile aynı
 * gerekçe (kullanıcı yukarıdan aşağı tarar).
 */
export function karakterleriTopla(bloklar: readonly ScriptBlock[]): ToplananKarakter[] {
  const gorulen = new Map<string, ToplananKarakter>();
  for (const blok of bloklar) {
    if (blok.type !== 'character') continue;
    const ad = karakterAdi(blok.text);
    if (!ad) continue;
    const anahtar = karakterAnahtari(ad);
    if (!gorulen.has(anahtar)) gorulen.set(anahtar, { ad, ilkBlokId: blok.id });
  }
  return [...gorulen.values()];
}

/** Kadro listesinde gösterilen tek satır — kayıtlı ve/veya senaryoda geçen. */
export interface KarakterSatiri {
  /** Kayıtlı karakterin kimliği — yalnız senaryoda geçip hiç kaydedilmemişse yok. */
  id?: string;
  ad: string;
  aciklama: string;
  /** Senaryoda geçtiyse ilk göründüğü blok — yoksa kayıt senaryoda YOK demektir. */
  ilkBlokId?: string;
}

/**
 * Kayıtlı karakterlerle (`Y.Map`) senaryodan toplananları BİRLEŞTİRİR.
 *
 * Birleşim iki yönlü: kullanıcı bir karakteri elle kaydedip henüz senaryoya
 * yazmamış olabilir (satırda `ilkBlokId` yok, tıklama devre dışı kalır) ya
 * da senaryoda konuşan biri henüz kaydedilmemiş olabilir (satırda `id` yok).
 * İkisini de göstermeyen bir liste, ya kaydı ya da senaryodaki gerçeği
 * gizlerdi.
 *
 * Eşleştirme Türkçe katlamalı anahtarla — kayıtlı `"Ayşe"` ile senaryodaki
 * `AYŞE` aynı satırda buluşur.
 */
export function karakterSatirlari(
  kayitlar: ReadonlyMap<string, Karakter> | Readonly<Record<string, Karakter>>,
  bloklar: readonly ScriptBlock[],
): KarakterSatiri[] {
  const kayitListesi = kayitlar instanceof Map ? [...kayitlar.values()] : Object.values(kayitlar);
  const toplanan = karakterleriTopla(bloklar);
  const toplananAnahtar = new Map(toplanan.map((t) => [karakterAnahtari(t.ad), t]));
  const gorulenAnahtar = new Set<string>();
  const satirlar: KarakterSatiri[] = [];

  for (const k of kayitListesi) {
    const anahtar = karakterAnahtari(k.ad);
    gorulenAnahtar.add(anahtar);
    satirlar.push({
      id: k.id,
      ad: k.ad,
      aciklama: k.aciklama,
      ilkBlokId: toplananAnahtar.get(anahtar)?.ilkBlokId,
    });
  }
  for (const t of toplanan) {
    const anahtar = karakterAnahtari(t.ad);
    if (gorulenAnahtar.has(anahtar)) continue;
    satirlar.push({ ad: t.ad, aciklama: '', ilkBlokId: t.ilkBlokId });
  }
  return satirlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
