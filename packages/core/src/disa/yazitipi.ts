/// <reference types="vite/client" />
import duzUrl from '@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf';
import kalinUrl from '@expo-google-fonts/courier-prime/700Bold/CourierPrime_700Bold.ttf';
import italikUrl from '@expo-google-fonts/courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf';
import tinosDuzUrl from '@expo-google-fonts/tinos/400Regular/Tinos_400Regular.ttf';
import tinosKalinUrl from '@expo-google-fonts/tinos/700Bold/Tinos_700Bold.ttf';
import tinosItalikUrl from '@expo-google-fonts/tinos/400Regular_Italic/Tinos_400Regular_Italic.ttf';
import type { PdfYaziTipleri } from './pdf';
import type { YaziTipiAdi } from '../format/yazi';

/**
 * PDF için Courier Prime TTF'ini getirir.
 *
 * ## Neden gömülü yazı tipi (ölçüldü)
 *
 * `ğ Ğ ş Ş ı İ` Latin-1'in dışında (U+011E…U+0130); PDF'in yerleşik base-14
 * Courier'i ile taşınamazlar. Görüntüleyicinin yazı tipi ikamesine bahis
 * oynamak, TESLİM EDİLEN dosyada sessiz kayıp riskidir.
 *
 * `@fontsource/courier-prime` KULLANILAMAZ (ölçüldü): `latin` alt kümesinde
 * `ğ Ğ ş Ş İ` yok, `latin-ext` alt kümesinde temel ASCII yok. Tam TTF şart.
 *
 * ## Neden ÜÇ ağırlık
 *
 * Gerekçe "hiçbir blok kalın ya da italik değil" idi ve F1b-4'te
 * GEÇERSİZLEŞTİ: Yazım sekmesi altı blok tipinin her biri için Kalın/İtalik
 * onay kutusu sunuyor. Preset PDF'e ulaşmadığı sürece (K5) fark edilmiyordu;
 * ulaştığı an `fontlariGom` sessizce `duz`'a düşer ve kullanıcı kalın yazdığı
 * sahne başlığını PDF'te düz görürdü — teslim edilen dosyada sessiz kayıp.
 */

const ADRESLER: Record<YaziTipiAdi, { duz: string; kalin: string; italik: string }> = {
  'courier-prime': { duz: duzUrl, kalin: kalinUrl, italik: italikUrl },
  tinos: { duz: tinosDuzUrl, kalin: tinosKalinUrl, italik: tinosItalikUrl },
};

/* Önbellek YAZI BAŞINA: tek bir önbellek kullanılsaydı bir romanı bastıktan
   sonra açılan senaryo Tinos gömülmüş bir PDF üretirdi — teslim dosyasında
   sessiz ve geri alınamaz bir hata. */
const onbellekler = new Map<YaziTipiAdi, Promise<PdfYaziTipleri>>();

export function pdfYaziTipleri(ad: YaziTipiAdi = 'courier-prime'): Promise<PdfYaziTipleri> {
  const adresler = ADRESLER[ad];
  let onbellek = onbellekler.get(ad) ?? null;
  onbellek ??= (async () => {
    const getir = async (adres: string, ad: string) => {
      const yanit = await fetch(adres);
      if (!yanit.ok) {
        /* Sessizce base-14'e düşmek YASAK: Türkçe harfler kaybolur ve kullanıcı
           bunu ancak dosyayı teslim ettikten sonra fark eder. */
        throw new Error(`Yazı tipi yüklenemedi (${ad}, ${yanit.status}). PDF üretilemedi.`);
      }
      return new Uint8Array(await yanit.arrayBuffer());
    };
    /* Üçü PARALEL: sıralı indirmek dışa aktarımı üç katı bekletirdi ve
       birinin hatası ötekileri zaten iptal ediyor. */
    const [duz, kalin, italik] = await Promise.all([
      getir(adresler.duz, 'düz'),
      getir(adresler.kalin, 'kalın'),
      getir(adresler.italik, 'italik'),
    ]);
    return { duz, kalin, italik };
  })();
  onbellekler.set(ad, onbellek);
  /* Başarısızlık ÖNBELLEKLENMEZ: geçici bir ağ hatası tüm oturum boyunca
     PDF'i kilitlemez. */
  return onbellek.catch((hata) => {
    onbellekler.delete(ad);
    throw hata;
  });
}
