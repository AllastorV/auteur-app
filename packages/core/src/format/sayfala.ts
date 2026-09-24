import type { ScriptBlock, ScriptBlockType } from '../model/script';
import { sureklilikTerimleri } from './senaryo-ayarlari';
import { IZGARA } from './izgara';
import { kullanilabilirGenislikMm, sutunGenisligi, type FormatProfili } from './profil';
import { genislikEm } from './yazi';
import { KARAKTER_MM } from './izgara';
import { buyut } from './terim';

export interface SayfaSatiri {
  /** Satırı üreten bloğun kalıcı kimliği. */
  blockId: string;
  tip: ScriptBlockType;
  /** Bloğun kaçıncı satırı. Boş ayırıcı satırlar için negatiftir. */
  satirIndex: number;
  metin: string;
  /**
   * SAYFA SONU SÜREKLİLİĞİ satırı mı — "(DEVAMI VAR)" / "KARAKTER (DEVAM)".
   * Bu satırlar BELGEDE YOK, sayfalayıcı üretiyor: düzenlenemezler ve
   * kelime sayımına girmezler. İşaret olmasaydı ekran onları olağan metin
   * gibi düzenlenebilir çizerdi ve kullanıcı silmeye çalışırdı.
   */
  surekliligi?: 'devami-var' | 'devam';
}

export interface Sayfa {
  no: number;
  satirlar: SayfaSatiri[];
}

/**
 * ÖLÇÜSÜ DIŞARIDAN VERİLEN sarma — tek ev, iki birim.
 *
 * Eşgenişlikli yazıda ölçü KARAKTER SAYISI, orantılı yazıda MİLİMETRE. Kural
 * (sarkan boşluk, sığmayan kelimenin bölünmesi, boşluğun genişliğe sayılması)
 * ikisinde de aynı; ayrı iki fonksiyon yazılsaydı biri düzeltilip öteki
 * unutulduğunda ekranla PDF ıraksardı (Karar 2).
 *
 * `sinir` ve `olc` AYNI birimde olmak zorunda — bu sözleşme çağıranın.
 */
export function sarmalaOlcuyle(
  metin: string,
  sinir: number,
  olc: (metin: string) => number,
): string[] {
  if (!(sinir > 0) || !Number.isFinite(sinir)) {
    throw new Error(`Sarma siniri pozitif ve sonlu olmali: ${sinir}`);
  }

  /* Metin BOŞLUK ve BOŞLUK-DIŞI öbeklerine ayrılıyor. Boşluğu kelimeden
     ayrı tutmak şart: sarkma kuralı yalnız boşluğa uygulanıyor. */
  const parcalar = metin.normalize('NFC').match(/\s+|\S+/gu) ?? [];

  const satirlar: string[] = [];
  /* `mevcut` boşluklarıyla BİRLİKTE tutuluyor: boşluk satır genişliğine
     SAYILIR. Yalnız satır SONUNDAKİ boşluklar sarkar, yani yazılırken
     kırpılır — tarayıcı da onları çizmez. */
  let mevcut = '';
  const yaz = () => {
    satirlar.push(mevcut.replace(/\s+$/u, ''));
    mevcut = '';
  };

  for (const parca of parcalar) {
    if (/^\s/u.test(parca)) {
      /* SARKMA: boşluk tek başına satır kırmaz. Kırılma bir sonraki kelime
         sığmadığında olur ve boşluklar önceki satırın sonunda kalır. */
      mevcut += parca;
      continue;
    }

    let k = parca;
    /* Aradaki boşluk GENİŞLİĞE SAYILIYOR — kırpılmışı değil. İlk yazışımda
       kırpılmışını kullanmıştım ve `sarmala('aaa bbb', 6)` yedi karakterlik
       satır üretti: boşluk ölçüye girmeyince satır sütunu aşıyordu. */
    if (olc(mevcut + k) > sinir && mevcut.replace(/\s+$/u, '') !== '') yaz();

    /* Sığmayan tek kelime BÖLÜNÜR — taşırmak ızgarayı bozar ve sayfa
       sayısını yalancı çıkarır. Bölme noktası ÖLÇÜLEREK bulunuyor: orantılı
       yazıda karakter sayısı genişliği vermez. */
    while (olc(k) > sinir) {
      if (mevcut) yaz();
      let kes = 1;
      while (kes < k.length && olc(k.slice(0, kes + 1)) <= sinir) kes++;
      satirlar.push(k.slice(0, kes));
      k = k.slice(kes);
    }
    mevcut += k;
  }

  if (mevcut) yaz();
  return satirlar.length ? satirlar : [''];
}

/**
 * Sarma önbelleği — ÖLÇÜMLE açılan bir borç (§6.2 / `editor/sayfa.ts`).
 *
 * `sayfa.ts` "artımlı sayfalama ölçüm eşiği aşılırsa yapılır" diyordu. Eşik
 * AŞILDI: 1000 sayfalık (21.000 bloklu) bir projede her tuş vuruşu belgenin
 * TAMAMINI yeniden sayfalıyor ve `sarmala` bu işin %86'sı (ölçüldü:
 * sarmala 83 ms / sayfala 96 ms / tuş 198 ms). Oysa bir tuş vuruşu tek bir
 * bloğun metnini değiştirir — kalan 20.999 blok aynı metinle aynı sütuna
 * sarılır ve aynı sonucu verir.
 *
 * Sarma SAF: aynı (metin, sütun) her zaman aynı satırları verir. Bu yüzden
 * önbellek davranışı değiştirmez, yalnız tekrarı keser.
 *
 * KOPYA DÖNÜYORUZ. Önbellekteki diziyi doğrudan vermek, çağıranın onu
 * değiştirmesi hâlinde SONRAKİ çağrıyı bozardı — "saf fonksiyon" sözleşmesi
 * sessizce çürürdü. Dizeler değişmez olduğu için yüzeysel kopya yeterli ve
 * maliyeti sarmanın yanında ölçülemez.
 *
 * TAVAN gerekli: sınırsız önbellek uzun bir oturumda (her tuş vuruşu bir
 * ara metin üretir) bellek sızıntısıdır. Dolunca TÜMÜ boşalır — LRU
 * defterini tutmak, kazandığından fazlasını harcardı.
 */
const SARMA_ONBELLEK = new Map<number, Map<string, readonly string[]>>();
/** ~50 bin girdi ≈ birkaç MB; 1000 sayfalık belge 21 bin blok tutuyor. */
export const SARMA_ONBELLEK_TAVANI = 50_000;

/** Ölçüm ve testler için — üretimde çağrılmaz. */
export function sarmaOnbelleginiTemizle(): void {
  SARMA_ONBELLEK.clear();
}

/**
 * Metni sütun genişliğine göre sarar — TARAYICININ `white-space: pre-wrap`
 * KURALLARIYLA AYNI.
 *
 * ## Neden birebir aynı olmak zorunda (§17 borcu, ölçüldü)
 *
 * Sayfa SAYISI motordan geliyor (Karar 34) ama ekrandaki sayfa SINIRI da
 * motorun satır sayımıyla konumlanıyor. Motor bir bloğu 1 satır sayarken
 * tarayıcı 2 çiziyorsa sınır her böyle blokta bir satır kayıyor ve kayma
 * BİRİKİMLİ.
 *
 * Ölçüldü (e2e, gerçek Chromium, 60 sütun):
 *   `'Kapi acildi.  Ruzgar girdi.  Perde ucustu.  Ayse dondu birden.'`
 *   → motor 1 satır, DOM 2 satır.
 * Sebep: eski sarma `split(/\s+/)` ile ardışık boşlukları TEK boşluğa
 * indiriyordu (62 karakter → 59), `pre-wrap` ise koruyor. Cümle sonuna çift
 * boşluk daktilo alışkanlığı ve senaryo yazarlarında yaygın.
 *
 * ## Uygulanan kurallar
 *
 * 1. **Boşluklar KORUNUR** ve genişliğe sayılır.
 * 2. **Satır sonundaki boşluklar SARKAR**: taşma saymazlar. CSS bunu
 *    "hanging white space" diye adlandırır ve olmasa satır sonuna basılan
 *    her boşluk satırı erken kırardı.
 * 3. Sütuna sığmayan tek kelime BÖLÜNÜR — CSS tarafında karşılığı
 *    `overflow-wrap: anywhere` ve o kural `ekran.ts`'te YAZILI.
 * 4. Metin ÖNCE NFC'ye normalize edilir ve bu TEK yerde olur (Karar 2).
 *    NFD gelen Türkçe harfler (`ş`, `ğ`, `İ` — macOS dosya adları, kimi PDF
 *    çıkarımları) taban harf + birleşik işaret olarak İKİ kod birimi sayılır;
 *    normalize edilmezse aynı senaryo görünüşte aynıyken %50 daha fazla sayfa
 *    verir ve sarma birleşik işareti taban harfinden koparır. NFC idempotent.
 *
 * ponytail: NFC grapheme cluster sorununu tümüyle çözmez — emoji, ZWJ
 * dizileri ve bazı Hint yazıları hâlâ yanlış sayılır. Courier/senaryo
 * bağlamında orantılı çözüm budur; tam grapheme desteği ayrı bir iştir.
 */
export function sarmala(metin: string, sutun: number): string[] {
  // ON KOSUL (Karar 25) — `sutunGenisligi`'nin izgara dogrulamasinin KOPYASI
  // DEGIL. O, bir blok STILININ izgaraya oturup oturmadigini dogrular; bu,
  // kamusal sinirdan (barrel) gelen ARGUMANIN kullanilabilir oldugunu
  // dogrular. Muhafiz olmazsa sutun <= 0 sonsuz dongu uretir: uygulama
  // donar ve kaydedilmemis yazi kaybolur (§15).
  // Kesirli sutun donmaz ama izgara disidir; ikisi de burada reddedilir.
  if (!Number.isInteger(sutun) || sutun < 1) {
    throw new Error(`Sarma sutunu tam sayi ve en az 1 olmali: ${sutun}`);
  }
  /* İKİ KATLI harita — `${sutun}|${metin}` gibi birleşik anahtar DEĞİL.
     ÖLÇÜLDÜ: 21.000 bloklu belgede birleşik anahtar her sayfalamada
     megabaytlarca geçici dize ayırıyor ve kazancın yarısını yiyordu
     (sayfala 96 → 67 ms); iki katlı haritada anahtar için hiç dize
     ayrılmıyor. Sütun sayısı bir avuçtur (blok tipi kadar), metin zaten
     elimizde. */
  let sutunBellek = SARMA_ONBELLEK.get(sutun);
  if (!sutunBellek) SARMA_ONBELLEK.set(sutun, (sutunBellek = new Map()));
  const bellekte = sutunBellek.get(metin);
  if (bellekte) return bellekte.slice();

  /* Eşgenişlikli ölçü: karakter sayısı. Sütun aritmetiği DEĞİŞMEDİ, yalnız
     genel yoldan geçiyor. */
  const satirlar = sarmalaOlcuyle(metin, sutun, (m) => m.length);
  if (sutunBellek.size >= SARMA_ONBELLEK_TAVANI) sutunBellek.clear();
  sutunBellek.set(metin, satirlar);
  return satirlar.slice();
}


/** Sayfa sonunda yalnız bırakılmaması gereken blok tipleri. */
const YALNIZ_KALMAZ: ReadonlySet<ScriptBlockType> = new Set(['scene', 'character']);

export function sayfala(
  bloklar: readonly ScriptBlock[],
  profil: FormatProfili,
  /**
   * SAYFA SONU SÜREKLİLİĞİ (§ STARC paketi, kullanıcı kararı 2026-08-27):
   * bölünen diyaloğun altına "(DEVAMI VAR)", yeni sayfadaki karakterin
   * yanına "(DEVAM)" satırı ekler.
   *
   * VARSAYILAN KAPALI ve bu bilinçli: satırlar SAYFA SAYISINI değiştirir
   * (her bölünme iki satır ekler) ve açık gelseydi mevcut projelerin sayfa
   * sayısı bir sürüm sonra kendiliğinden kayardı — "1 sayfa ≈ 1 dakika"
   * sözleşmesine güvenen kullanıcı bunu sessiz bir bozulma olarak yaşardı.
   */
  surekli = false,
): Sayfa[] {
  const sayfalar: Sayfa[] = [];
  let mevcut: SayfaSatiri[] = [];

  const kapat = () => {
    sayfalar.push({ no: sayfalar.length + 1, satirlar: mevcut });
    mevcut = [];
  };

  for (let bi = 0; bi < bloklar.length; bi++) {
    const b = bloklar[bi];
    const stil = profil.bloklar[b.type];
    // ON KOSUL (O-5) — `kagitGeometrisi`'ndeki bilinmeyen-anahtar muhafizinin
    // KARDESI: ikisi de ayni guven sinirindan (profil verisi / ice aktarim)
    // besleniyor. Muhafiz olmazsa `stil.yeniSayfada` "Cannot read properties
    // of undefined" der ve ne blok tipini ne kimligini gosterir.
    if (!stil) {
      throw new Error(`Profilde tanimsiz blok tipi: ${b.type} (blok ${b.id})`);
    }

    // `yeniSayfada` bir SAYFALAMA kuralidir, render kurali degil (Karar 12):
    // beyan edilmis ama uygulanmayan alan sessizce yanlis sayfa sayisi
    // uretir. Kural yalniz burada yasar (Karar 2) ve `gerekli` mantigindan
    // ONCE gelir. Bos sayfada tetiklenmez.
    //
    // İKİ KAYNAK, TEK KURAL: profil "bu TİP sayfa başlar" der (roman
    // bölümü), `b.yeniSayfada` kullanıcının Ctrl+Enter ile "bu SATIR
    // sayfa başlasın" demesidir. Birleşme burada, tek koşulda.
    if ((stil.yeniSayfada || b.yeniSayfada) && mevcut.length > 0) kapat();

    const metin = stil.buyukHarf ? buyut(b.text, profil.dil) : b.text;
    /* ÖLÇÜ YAZIDAN. Eşgenişlikli yolda `sutunGenisligi` çağrılmaya devam
       ediyor — o ızgara hizasını da DOĞRULUYOR (girinti karakter katı mı) ve
       o denetim mm ölçüsünde karşılıksız kalırdı. */
    const sarmalanmis = profil.yazi.esgenislik
      ? sarmala(metin, sutunGenisligi(stil))
      : sarmalaOlcuyle(
          metin,
          kullanilabilirGenislikMm(stil),
          /* em → mm: 12pt em, Courier'in karakter genişliğinin 1/0.6'sı.
             `KARAKTER_MM / 0.6` tam olarak 12 punto em'in mm karşılığı. */
          (m) => genislikEm(m, profil.yazi) * (KARAKTER_MM / 0.6),
        );
    const govde: SayfaSatiri[] = sarmalanmis.map((m, i) => ({
      blockId: b.id, tip: b.type, satirIndex: i, metin: m,
    }));

    const bosluk: SayfaSatiri[] = Array.from({ length: stil.oncekiBosSatir }, (_, i) => ({
      blockId: b.id, tip: b.type, satirIndex: -1 - i, metin: '',
    }));

    /* Yalnız kalmaması gereken blok, sayfada kendisi + SONRAKİ bloğun ilk
       görünür satırı sığmıyorsa sayfayı çevir.

       Sabit `+1` yetmiyordu: sahne başlığından sonra gelen blokların hepsinin
       `oncekiBosSatir`'ı 1, yani ayırıcısıyla birlikte İKİ satır ister.
       Ölçüldü — 26 aksiyon + sahne başlığı + aksiyon dizisinde başlık sayfanın
       SON satırında kalıyor, 55. satır boş duruyor ve aksiyon öbür sayfaya
       geçiyordu; `YALNIZ_KALMAZ`'ın önlemek için var olduğu durum tam buydu.
       `character` tuzağa düşmüyordu çünkü ardından gelen `dialogue`'un
       ayırıcısı sıfır — yani hata tipe göre saklanıyordu. */
    const sonraki = bloklar[bi + 1];
    const sonrakiStil = sonraki ? profil.bloklar[sonraki.type] : undefined;
    // Sonraki blok yoksa yalnız kalma sorunu da yok: sayfa zaten bitiyor.
    const sonrakiIlk = sonrakiStil ? sonrakiStil.oncekiBosSatir + 1 : 0;
    const gerekli = YALNIZ_KALMAZ.has(b.type)
      ? bosluk.length + govde.length + sonrakiIlk
      : bosluk.length + 1;
    if (mevcut.length > 0 && mevcut.length + gerekli > profil.satirSayisi) kapat();

    // Önceki boş satırlar sayfa başında YUTULUR — sayfa boş satırla başlamaz.
    // Kural yalnız burada yaşar; ikinci bir yerde tekrarlanırsa mutasyon
    // testi ısırmaz (kontrolör ön taramasında yakalandı, Karar 2).
    const parcalar = mevcut.length === 0 ? govde : [...bosluk, ...govde];
    for (const s of parcalar) {
      if (mevcut.length >= profil.satirSayisi) {
        /* DİYALOG ORTASINDA bölünme: sektörde sayfa sonuna "(DEVAMI VAR)",
           yeni sayfaya "KARAKTER (DEVAM)" basılır. Okuyucu repliğin
           bittiğini sanmasın diye vardır ve çekimde kimin konuştuğu
           sayfanın başında yeniden görünür.

           `s.satirIndex > 0`: bloğun İLK satırında bölünme "ortada"
           sayılmaz — orada diyalog henüz başlamamıştır, olağan sayfa
           çevirme yeter. */
        if (surekli && b.type === 'dialogue' && s.satirIndex > 0 && mevcut.length > 0) {
          const terim = sureklilikTerimleri(profil.dil);
          /* Son satır SONRAKİ sayfaya itiliyor ve yeri "(DEVAMI VAR)"a
             veriliyor: sayfa zaten dolu, araya satır SIĞMAZ. İtmeseydik
             ya satır taşardı ya da metin kaybolurdu. */
          const itilen = mevcut.pop()!;
          mevcut.push({
            blockId: b.id, tip: b.type, satirIndex: -1000,
            metin: terim.devamiVar, surekliligi: 'devami-var',
          });
          kapat();
          /* Yeni sayfanın başında karakter adı + (DEVAM). Ad, bu diyaloğun
             ÖNÜNDEKİ `character` bloğundan; geriye tarama yapılıyor çünkü
             araya parantez bloğu girebiliyor. */
          const ad = oncekiKarakterAdi(bloklar, bi);
          mevcut.push({
            blockId: b.id, tip: 'character', satirIndex: -1001,
            metin: ad ? `${ad} ${terim.devam}` : terim.devam,
            surekliligi: 'devam',
          });
          mevcut.push(itilen);
          /* `continue` YOK: `s` henüz eklenmedi. İlk sürümde buradan
             atlanıyordu ve o satır sessizce kayboluyordu — testin
             yakaladığı hata tam buydu ("hiçbir METİN satırı kaybolmuyor").
             `itilen` bir ÖNCEKİ satır; `s` aşağıda ekleniyor. */
        } else {
          kapat();
        }
      }
      mevcut.push(s);
    }
  }

  kapat();
  return sayfalar;
}

/**
 * `bi` indeksindeki diyaloğun konuşanı — geriye doğru en yakın `character`.
 *
 * Araya `parenthetical` girebiliyor, o yüzden bir önceki bloğa bakmak
 * yetmez. Sahne başlığına ya da aksiyona çarpılırsa konuşan bulunamamış
 * demektir ve `null` dönüyor: uydurma bir ad basmak, çekimde yanlış oyuncuyu
 * çağırmak olurdu.
 */
function oncekiKarakterAdi(bloklar: readonly ScriptBlock[], bi: number): string | null {
  for (let i = bi - 1; i >= 0; i--) {
    const t = bloklar[i].type;
    if (t === 'character') return bloklar[i].text.trim() || null;
    if (t !== 'parenthetical' && t !== 'dialogue') return null;
  }
  return null;
}
