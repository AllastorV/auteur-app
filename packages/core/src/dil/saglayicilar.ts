import type { CeviriSaglayici } from './ceviri';
import { t } from './arayuz';

/**
 * DeepL ve Google Translate sağlayıcıları — §16.4.
 *
 * `fetch` DIŞARIDAN VERİLİR: ağa çıkmadan test edilebilmesi için. Sağlayıcı
 * sözleşmesinin (uzunluk korunumu, kaçış çözme, hata mesajı) doğruluğu
 * gerçek API'ye bağlı olsaydı bu kod hiç test edilemezdi.
 */

export type Getirici = typeof fetch;

export interface SaglayiciAyari {
  apiAnahtari: string;
  getirici?: Getirici;
  /** İstek başına azami bekleme. Bkz. `ZAMAN_ASIMI_MS`. */
  zamanAsimiMs?: number;
}

/**
 * Bir isteğin azami süresi.
 *
 * Zaman aşımı OLMASAYDI yanıt vermeyen bir sunucu (düşen bağlantı, sessizce
 * yutan bir vekil sunucu, askıda kalan TLS el sıkışması) çeviri penceresini
 * SONSUZA kadar "Çevriliyor…" durumunda bırakırdı: `ceviri.ts`'in iptal
 * bayrağı yalnız gruplar ARASINDA yoklanıyor, uçuştaki isteği kesmiyor.
 *
 * İki dakika, sınıra yakın bir isteğin (DeepL 100k karakter) gerçekten
 * sürebileceği en uzun makul süreden bol; daha kısası yavaş bir bağlantıda
 * geçerli çeviriyi keserdi.
 */
export const ZAMAN_ASIMI_MS = 120_000;

/** `fetch` seçeneklerine zaman aşımı sinyali ekler. */
function zamanAsimi(ayar: SaglayiciAyari): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ayar.zamanAsimiMs ?? ZAMAN_ASIMI_MS) };
}

/** Yanıt gövdesinden okunabilir hata mesajı çıkarır. */
async function hataMesaji(yanit: Response, ad: string): Promise<string> {
  let ayrinti = '';
  try {
    ayrinti = (await yanit.text()).slice(0, 300);
  } catch {
    /* Gövde okunamıyorsa durum kodu yine de anlamlı. */
  }
  return `${ad}: ${yanit.status} ${yanit.statusText}${ayrinti ? ` — ${ayrinti}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* DeepL                                                               */
/* ------------------------------------------------------------------ */

/**
 * Ücretsiz DeepL anahtarları `:fx` ile biter ve BAŞKA bir sunucuya gider.
 *
 * Yanlış sunucuya gitmek 403 verir ve kullanıcı bunu "anahtarım geçersiz"
 * diye okur. Anahtarın kendisi hangi sunucu olduğunu zaten söylüyor.
 */
export function deeplSunucu(apiAnahtari: string): string {
  return apiAnahtari.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

export function deeplSaglayici(ayar: SaglayiciAyari): CeviriSaglayici {
  const getir = ayar.getirici ?? fetch;
  return {
    ad: 'DeepL',
    /* DeepL sınırları: istek başına 50 metin, ~128 KiB gövde. Karakter
       sınırı gövde limitinin ALTINDA tutuldu — JSON kaçışı ve üstbilgiler
       de o 128 KiB'ın içinde. */
    azamiKarakter: 100_000,
    azamiParca: 50,
    async cevir(parcalar, hedef, kaynak) {
      const yanit = await getir(deeplSunucu(ayar.apiAnahtari), {
        ...zamanAsimi(ayar),
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${ayar.apiAnahtari}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: parcalar,
          target_lang: hedef.toUpperCase(),
          ...(kaynak ? { source_lang: kaynak.toUpperCase() } : {}),
        }),
      });
      if (!yanit.ok) throw new Error(await hataMesaji(yanit, 'DeepL'));

      const govde = (await yanit.json()) as { translations?: { text?: string }[] };
      if (!Array.isArray(govde.translations)) {
        throw new Error(t('DeepL: beklenmeyen yanıt biçimi. Çeviri uygulanmadı.'));
      }
      /* Eksik alan BOŞ DİZGEYE düşürülemez: boş dizge geçerli bir `string`'dir,
         `ceviri.ts`'in "hepsi ya da hiçbiri" savunması yalnız uzunluk ve tip
         denetliyor, dolayısıyla o boşluk savunmadan geçip bloğun metnini
         BELGEYE BOŞ yazardı — modülün en gururlu invaryantı sağlayıcı
         katmanından delinirdi. */
      return govde.translations.map((oge) => {
        if (typeof oge?.text !== 'string') {
          throw new Error(t('DeepL: beklenmeyen yanıt biçimi (eksik metin). Çeviri uygulanmadı.'));
        }
        return oge.text;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Google Cloud Translation v2                                         */
/* ------------------------------------------------------------------ */

/**
 * Google `format: 'text'` verilse bile kimi karakterleri HTML varlığı olarak
 * döndürür (ÖLÇÜLDÜ: kesme işareti `&#39;` gelir).
 *
 * Çözülmezse Türkçe metin `Arzu&#39;nun` diye belgeye girer — kullanıcı
 * bunu bir çeviri hatası sanır, oysa kaçış çözülmemiştir. Sayısal varlıklar
 * da çözülüyor çünkü Google hangisini kullanacağını garanti etmiyor.
 */
/**
 * Sayısal varlığı karaktere çevirir; ÇEVİRİLEMEZSE varlığı olduğu gibi bırakır.
 *
 * ÖLÇÜLDÜ: `String.fromCodePoint` sınır dışı bir sayıda `RangeError` FIRLATIR
 * (`&#1114112;` → "Invalid code point"). O fırlatma `htmlVarligiCoz`tan geçip
 * bütün çeviriyi düşürürdü — 400 bloklu bir senaryonun tamamı, tek bozuk
 * varlık yüzünden, sağlayıcı adı bile geçmeyen bir yığın iziyle. Yanıt
 * gövdesi güven sınırının DIŞINDA: araya giren bir vekil sunucu ya da
 * sağlayıcının bir hatası bu diziyi üretebilir.
 *
 * Yalnız vekil (D800–DFFF) de reddediliyor: geçerli bir metin oluşturmaz ve
 * belgeye girerse JSON/UTF-8 serileştirmesini sessizce bozar.
 *
 * Çözülemeyen varlık SİLİNMİYOR, ham hâliyle kalıyor — kullanıcı ekranda
 * `&#1114112;` görüp bunun sağlayıcıdan geldiğini anlayabilir; sessizce
 * düşen bir karakter fark edilmezdi.
 */
function kodNoktasi(ham: string, deger: number): string {
  if (!Number.isInteger(deger) || deger < 0 || deger > 0x10ffff) return ham;
  if (deger >= 0xd800 && deger <= 0xdfff) return ham;
  return String.fromCodePoint(deger);
}

export function htmlVarligiCoz(s: string): string {
  return s
    .replace(/&#(\d+);/g, (ham: string, n: string) => kodNoktasi(ham, Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (ham: string, n: string) => kodNoktasi(ham, parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    /* `&amp;` EN SONA: önce çözülseydi `&amp;lt;` ikinci turda `<` olurdu ve
       kullanıcının gerçekten yazdığı `&lt;` bozulurdu (FDX yazımındaki
       kaçış kuralının aynası). */
    .replace(/&amp;/g, '&');
}

export function googleSaglayici(ayar: SaglayiciAyari): CeviriSaglayici {
  const getir = ayar.getirici ?? fetch;
  return {
    ad: 'Google Translate',
    /* Google sınırları: istek başına 128 segment, ~30k karakter. */
    azamiKarakter: 30_000,
    azamiParca: 128,
    async cevir(parcalar, hedef, kaynak) {
      /* Anahtar ÜSTBİLGİDE, adres satırında değil. Sorgu dizesindeki bir
         anahtar DevTools ağ panelinde açıkça görünür, `performance.getEntries()`
         ile sayfa içi herhangi bir koddan okunabilir ve araya giren proxy /
         kurumsal TLS denetimi günlüklerine düz metin düşer. Google bu API için
         `X-goog-api-key`'i kabul ediyor; DeepL tarafı zaten üstbilgi kullanıyor. */
      const adres = 'https://translation.googleapis.com/language/translate/v2';
      const yanit = await getir(adres, {
        ...zamanAsimi(ayar),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': ayar.apiAnahtari,
        },
        body: JSON.stringify({
          q: parcalar,
          target: hedef,
          format: 'text',
          ...(kaynak ? { source: kaynak } : {}),
        }),
      });
      if (!yanit.ok) throw new Error(await hataMesaji(yanit, 'Google Translate'));

      const govde = (await yanit.json()) as {
        data?: { translations?: { translatedText?: string }[] };
      };
      const ceviriler = govde.data?.translations;
      if (!Array.isArray(ceviriler)) {
        throw new Error(t('Google Translate: beklenmeyen yanıt biçimi. Çeviri uygulanmadı.'));
      }
      // Eksik alan boşa düşürülmez — gerekçe DeepL tarafındaki yorumda.
      return ceviriler.map((t) => {
        if (typeof t?.translatedText !== 'string') {
          throw new Error(
            'Google Translate: beklenmeyen yanıt biçimi (eksik metin). Çeviri uygulanmadı.',
          );
        }
        return htmlVarligiCoz(t.translatedText);
      });
    },
  };
}

export type SaglayiciAdi = 'deepl' | 'google';

export function saglayiciKur(ad: SaglayiciAdi, ayar: SaglayiciAyari): CeviriSaglayici {
  return ad === 'deepl' ? deeplSaglayici(ayar) : googleSaglayici(ayar);
}
