/**
 * Başlık sayfası ekranı modeli — §16.2 borcu, §14 "Başlık sayfası düzenleyici" (F1).
 *
 * `BaslikSayfasi` arayüzü BURADA TANIMLANMIYOR: PDF'e çizen `disa/baslik-sayfasi.ts`
 * zaten tanımlıyor (dün yazıldı) ve ekranın düzenlediği şekille PDF'in çizdiği
 * şekil AYNI olmak zorunda — ikinci bir tip TEK EV kuralını (Karar 2) kırardı.
 * Bu dosya yalnız o şeklin BELGEDEN okunan ham değerini güvenli bir kayda
 * çeviriyor — desen `model/yerimi.ts`'in aynısı.
 */
import type { BaslikSayfasi } from '../disa/baslik-sayfasi';
import { metinListesiDuzelt } from './breakdown';

/** Ad/yazar/sürüm alanları bu uzunluğu aşarsa ekranda ve PDF'te okunmaz olur. */
export const BASLIK_SAYFASI_ALAN_EN_UZUN = 200;
/** İletişim bloğu satır sayısı — sol alt köşe, sonsuz uzayamaz. */
export const ILETISIM_SATIR_EN_COK = 8;
/** Yazar satırı sayısı — ortak yazımda bile bu kadarı sayfaya sığar. */
export const YAZAR_SATIR_EN_COK = 6;
/**
 * Başlık ve alt başlık satır sayısı.
 *
 * Bu alanlar da ÇOK SATIRLI: tek satırlık bir alanda Enter hiçbir şey
 * yapmıyor, uzun bir film adı yatayda kayıyordu (kullanıcı bildirimi
 * 2026-08-30). Sınır üç — kapak başlığı 23 punto ve dördüncü satır alt
 * başlığın üstüne binerdi.
 */
export const BASLIK_SATIR_EN_COK = 3;

function metinDuzelt(deger: unknown): string {
  if (typeof deger !== 'string') return '';
  /* Satır sonu TEK SATIRLIK alanlarda temizleniyor: yapıştırılan çok
     satırlı bir metin başlığı sayfanın dışına taşırırdı. */
  return deger.replace(/[\r\n]+/g, ' ').normalize('NFC').slice(0, BASLIK_SAYFASI_ALAN_EN_UZUN);
}

/**
 * ÇOK SATIRLI alan temizleyicisi. Satır sonları KORUNUYOR ama satır sayısı
 * ve satır uzunluğu sınırlı — sayfa taşmasın.
 *
 * Yazar, başlık ve alt başlık aynı kuralı paylaşıyor; ayrı fonksiyonlar
 * biri düzeltilip ötekiler unutulduğunda ıraksardı (Karar 2).
 */
function cokSatirDuzelt(deger: unknown, enCokSatir: number): string {
  if (typeof deger !== 'string') return '';
  return deger
    .normalize('NFC')
    .split(/\r?\n/)
    .map((satir) => satir.slice(0, BASLIK_SAYFASI_ALAN_EN_UZUN))
    .slice(0, enCokSatir)
    .join('\n');
}

/** Belgede hiç kayıt yokken kullanılan boş biçim — PDF'te hiçbir satır çizilmez. */
export const BOS_BASLIK_SAYFASI: BaslikSayfasi = { baslik: '' };

/**
 * Belgeden okunan ham değeri güvenli bir `BaslikSayfasi`'ye çevirir.
 *
 * Alanlar `baslikSayfasiCiz`'in zaten uyguladığı kuralla tutarlı: boş dizge
 * "çizilmeyen satır" anlamına gelir (bkz. `disa/baslik-sayfasi.ts`), yani
 * eksik alanı `undefined` yerine `''` yapmak PDF çıktısını DEĞİŞTİRMEZ.
 */
export function baslikSayfasiDuzelt(ham: unknown): BaslikSayfasi {
  const o = (ham ?? {}) as Record<string, unknown>;
  return {
    baslik: cokSatirDuzelt(o.baslik, BASLIK_SATIR_EN_COK),
    altBaslik: cokSatirDuzelt(o.altBaslik, BASLIK_SATIR_EN_COK),
    yazar: cokSatirDuzelt(o.yazar, YAZAR_SATIR_EN_COK),
    surum: metinDuzelt(o.surum),
    tarih: metinDuzelt(o.tarih),
    /* Boş/yalnız-boşluk girdiler ve dizge-olmayanlar `metinListesiDuzelt`
       (`model/breakdown.ts`) ile süzülüyor — repoda ZATEN doğru davranan
       aynı sanitizasyon (Karar 2), burada ikinci bir yol yazılmıyor. */
    iletisim: metinListesiDuzelt(o.iletisim)
      .map((s) => s.slice(0, BASLIK_SAYFASI_ALAN_EN_UZUN))
      .slice(0, ILETISIM_SATIR_EN_COK),
  };
}
