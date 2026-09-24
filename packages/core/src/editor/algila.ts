import {
  CHARACTER_EXTENSION,
  KARAKTER_EN_UZUN,
  matchesFolded,
  SCENE_PREFIX,
  TRANSITION_TAIL,
  type ScriptBlockType,
} from '../model/script';
import type { DilAdi } from '../format/profil';
import { TERIMLER, buyut, mekanOnEki, mekanSonEki } from '../format/terim';

/**
 * Blok tipi otomatik algılama — §16.3.
 *
 * > "**Otomatik algılama varsayılandır**, elle değiştirme onu geçersiz kılar.
 * > Elle sabitlenmiş bir blok arayüzde işaretlenir ve tek tıkla otomatiğe
 * > döndürülebilir. Bu, 'program bilsin ama son söz bende olsun' ilkesidir."
 *
 * Saf fonksiyon: metin + ÖNCEKİ blok tipi → tip. Bağlam şart, çünkü aynı
 * metin farklı yerlerde farklı şey demektir — büyük harfli tek bir kelime
 * aksiyonun ortasında bir vurgu, aksiyondan sonra bir karakter adıdır.
 */

/** Geçiş terimleri. Türkçe ve İngilizce kalıplar birlikte tanınır. */
const GECISLER = [
  'KES', 'KES:', 'KESME', 'SERT KES',
  'CUT TO:', 'SMASH CUT TO:', 'MATCH CUT TO:',
  'DISSOLVE TO:', 'FADE OUT', 'FADE OUT.', 'FADE IN:', 'FADE TO BLACK.',
  'KARARMA', 'AÇILMA', 'ZINCIRLEME',
];

/**
 * Metin baştan sona BÜYÜK HARF mi (ve en az bir harf içeriyor mu).
 *
 * `buyut` KULLANILIYOR ama bu testte dilin bir FARKI YOK — ölçüldü:
 * `IŞIK`, `İSMAİL`, `ÇİĞDEM`, `ı`, `i`, `I`, `İ` dahil hiçbir dizgede
 * `s === buyut(s, 'tr')` ile `s === s.toUpperCase()` ayrışmıyor. Mutasyonu
 * öldüren bir test yok ve YAZILAMAZ; bu bilinerek eşdeğer bir mutanttır.
 *
 * Yine de `buyut` çağrılıyor: büyük harf çevrimi projede TEK yerde yaşıyor
 * (`format/terim`) ve buradan kaçmak, ileride o fonksiyon değişince
 * algılamanın sessizce geride kalmasına yol açardı.
 *
 * Dilin GERÇEKTEN fark ettiği yer sahne başlığı karşılaştırmasıdır: `iç.`
 * küçük harfle yazılıp dil `en` seçildiğinde `i → I` eşlenir ve Türkçe
 * terimle tutmaz (ölçüldü, aşağıda üç dilde büyütülüyor).
 */
function tumuBuyuk(metin: string, dil: DilAdi): boolean {
  if (!/\p{L}/u.test(metin)) return false;
  return metin === buyut(metin, dil);
}

/**
 * `(V.O.)`, `(O.S.)`, `(CONT'D)` gibi ekleri olan karakter satırını da tanır.
 * Ek çıkarıldıktan sonra kalan ad boş olmamalı — yalnız `(V.O.)` yazan bir
 * satır karakter değil paranteziktir.
 */
function karakterGovdesi(metin: string): string {
  /* Önce İÇE AKTARMANIN tanıdığı ekler (`(V.O.)`, `(O.S.)`, `(CONT'D)`,
     `(DEVAM)`, `(SES)`) — sonra genel parantez kuyruğu. İki uygulama farklı
     ek kümesi kullandığı sürece aynı satır iki farklı tiplenebiliyordu. */
  return metin.replace(CHARACTER_EXTENSION, '').replace(/\([^)]*\)\s*$/u, '').trim();
}

export interface AlgilamaBaglami {
  oncekiTip: ScriptBlockType | null;
  dil: DilAdi;
}

/**
 * Metnin blok tipini algılar.
 *
 * Sıra ÖNEMLİ: sahne başlığı ve parantezik biçimsel olarak kesin, geçiş
 * listelenmiş, karakter bağlama bağlı, diyalog önceki bloğa bağlı. Aksiyon
 * en sonda çünkü o VARSAYILAN — "hiçbirine uymadı" demek.
 */
export function blokTipiAlgila(metin: string, baglam: AlgilamaBaglami): ScriptBlockType {
  const ham = metin.normalize('NFC').trim();
  const { oncekiTip, dil } = baglam;

  /* Boş satır kendi başına tip taşımaz; ÖNCEKİ tip korunur. Aksiyona
     düşürülseydi, diyalog içinde nefes almak için bırakılan boş satır bloğun
     tipini sessizce değiştirirdi. */
  if (!ham) return oncekiTip ?? 'action';

  const buyukHam = buyut(ham, dil);
  /* HER İKİ dilin kısaltmaları taranır: İngilizce kısaltmalar Türkçe yazarken
     de yaygındır ve `INT.` yazan biri dil ayarı ne olursa olsun sahne başlığı
     yazıyordur. Girdi de İKİ dilde büyütülür — `iç.` küçük harfle yazılıp dil
     `en` seçiliyse `i → I` eşlenir ve Türkçe terimle tutmaz (ölçüldü). */
  const adaylar = [buyukHam, buyut(ham, 'tr'), buyut(ham, 'en')];
  /* Sınır denetimi `mekanOnEki`'nde — TEK EV. Burada `startsWith(mekan)`
     yazılıydı ve terimlerdeki nokta kalkınca `İÇTEN bir gülümseme` sahne
     başlığı sanıldı: nokta aynı zamanda SINIR işaretiymiş. Aynı kuralı iki
     yerde tutmak tam olarak bu hatayı üretir (Karar 2). */
  for (const dil of ['tr', 'en'] as const) {
    if (adaylar.some((a) => mekanOnEki(a, dil) !== null)) return 'scene';
  }
  /* SONDA duran mekân terimi — Türkçe yaygın yazım (`SALON İÇ GÜN`).
     ÖLÇÜLDÜ: gerçek bir Türkçe senaryoda 83 başlığın 83'ü bu sırada ve
     hepsi `character` tipleniyordu — içe aktarımda yapı tümden bozuluyordu.
     `mekanSonEki` zaman terimi de şart koşuyor, yani `İç şunu` başlık
     sanılmıyor. */
  if (adaylar.some((a) => mekanSonEki(a, 'tr') !== null)) return 'scene';
  /* İÇE AKTARMANIN kalıbı da taranıyor (`SCENE_PREFIX`): `parseFountain`
     `est`, `i/e`, `int/ext` gibi ön ekleri de tanıyor. İki uygulama farklı
     ön ek kümesi kullandığı sürece `EST. ÇATIKATI` içe aktarımda `scene`,
     algılama bağlandığı gün `action` olurdu — ve tip değişimi girintiyi,
     `oncekiBosSatir`'ı, dolayısıyla SAYFA SAYISINI değiştirir. Kalıp tek
     evde (`model/script.ts`), burada yalnız KULLANILIYOR (Karar 2). */
  if (matchesFolded(SCENE_PREFIX, ham)) return 'scene';

  if (ham.startsWith('(') && ham.endsWith(')')) return 'parenthetical';

  /* Geçiş: hem listelenmiş terimler hem içe aktarmanın KUYRUK kalıbı.
     Liste tek başınayken `ZINCIRLEME` algılamada geçiş, içe aktarımda
     aksiyon oluyordu.

     KUYRUK KALIBI BÜYÜK HARF İSTİYOR. ÖLÇÜLDÜ (gerçek senaryolar, Ginger
     & Rosa): "The caption changes to:" geçiş sanılıyordu — `to:` ile biten
     HER cümle geçiş oluyordu. Gerçek geçişler istisnasız versaldir
     (`CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`); cümle içinde geçen
     "changes to:" değildir. Yanlış tip yalnız görünüm değil GİRİNTİ ve
     `oncekiBosSatir` demek, o da SAYFA SAYISI demek. */
  const versal = ham === buyukHam && /\p{L}/u.test(ham);
  if (GECISLER.includes(buyukHam) || (versal && matchesFolded(TRANSITION_TAIL, ham))) {
    return 'transition';
  }

  /* Diyalog: karakterden ya da parantezikten SONRA gelen her şey. Bu kural
     karakter kuralından ÖNCE gelmeli, yoksa büyük harfle bağıran bir replik
     ("HAYIR!") yeni bir karakter adı sanılırdı. */
  if (oncekiTip === 'character' || oncekiTip === 'parenthetical') return 'dialogue';

  /* Karakter: büyük harf, kısa ve aksiyon/sahne/geçiş sonrası. Uzunluk sınırı
     büyük harfle yazılmış bir aksiyon cümlesini karakter sanmayı önler. */
  const govde = karakterGovdesi(ham);
  if (
    govde &&
    tumuBuyuk(govde, dil) &&
    govde.length <= KARAKTER_EN_UZUN &&
    !govde.endsWith('.')
    /* Buradaki önceki-tip listesi ERİŞİLEMEZDİ: `character` ve
       `parenthetical` durumlarında fonksiyon zaten yukarıda erken dönüyor,
       geriye tam olarak listelenen dört değer + `null` kalıyordu; yani ifade
       her zaman doğruydu. Okuyan onu gerçek bir kısıt sanıyordu — gerekçesiz
       ölü mantık, `dil/ceviri.ts`'teki bilinçli ve yorumlanmış güvenlik
       ağından farklı. */
  ) {
    return 'character';
  }

  return 'action';
}

/**
 * Bir blok dizisinin tiplerini baştan sona algılar.
 *
 * `elleSabit` olan bloklara DOKUNULMAZ (§16.3: "elle değiştirme otomatiği
 * geçersiz kılar") ama onların tipi sonraki blokların bağlamına GİRER —
 * kullanıcının kararı akışın gerisini de doğru yönlendirmeli.
 */
export function tipleriAlgila(
  bloklar: readonly { text: string; type: ScriptBlockType; elleSabit?: boolean }[],
  dil: DilAdi,
): ScriptBlockType[] {
  const sonuc: ScriptBlockType[] = [];
  let onceki: ScriptBlockType | null = null;
  for (const b of bloklar) {
    const tip: ScriptBlockType = b.elleSabit
      ? b.type
      : blokTipiAlgila(b.text, { oncekiTip: onceki, dil });
    sonuc.push(tip);
    onceki = tip;
  }
  return sonuc;
}
