import type { ScriptBlockType } from '../model/script';
import { IZGARA, KARAKTER_MM, SATIR_MM, kagitGeometrisi, type Geometri, type KagitAdi } from './izgara';
import { COURIER_PRIME, type YaziTipi } from './yazi';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../model/dokuman-tipi';
import { IKI_SUTUN, type SutunBolunmesi } from './iki-sutun';

/** Sayfa yerleşimi. `fransiz` iki sütunlu görüntü/ses yerleşimidir (§6.6). */
export type GeometriAdi = 'amerikan' | 'fransiz';
export type DilAdi = 'tr' | 'en';
export type Hiza = 'sol' | 'orta' | 'sag';

export interface BlokStili {
  /** Metin bloğunun soluna göre girinti (mm). */
  solMm: number;
  /** Metin bloğunun sağına göre içeri çekme (mm). */
  sagMm: number;
  buyukHarf: boolean;
  kalin: boolean;
  italik: boolean;
  hiza: Hiza;
  /** Bu bloktan önce bırakılan boş satır sayısı. */
  oncekiBosSatir: number;
  /** Blok her zaman yeni sayfada başlar mı. */
  yeniSayfada: boolean;
}

export interface FormatProfili {
  geometriAdi: GeometriAdi;
  kagit: KagitAdi;
  dil: DilAdi;
  geometri: Geometri;
  /**
   * Yalnız BU doküman tipinin blokları tanımlı — kısmi.
   *
   * Tam kayıt olsaydı senaryo profili roman bloklarına da stil vermek
   * zorunda kalırdı ve o stiller anlamsız olurdu. Tanımsız bir blokla
   * karşılaşan `sayfala` AÇIKÇA fırlatıyor: sessizce varsayılan bir stile
   * düşmek, kullanıcının yanlış tipte yazdığını gizlerdi.
   */
  bloklar: Readonly<Partial<Record<ScriptBlockType, Readonly<BlokStili>>>>;
  /**
   * Sayfanın ölçüsünü veren yazı tipi.
   *
   * Senaryo ailesinde DAİMA Courier Prime ve KİLİTLİ: sayfa ≈ dakika
   * sözleşmesi ızgaranın kendisidir (§16.3). Romanda ve düz metinde tercih
   * edilebilir — orada sayfa süreyi ölçmüyor, el yazması sayfasını ölçüyor.
   */
  yazi: YaziTipi;
  /**
   * Sayfaya sığan satır sayısı — YAZIDAN TÜRETİLİR, sabit değil.
   *
   * Courier'de 55 (§6.3: sektörün fiilî değeri). Çift aralıklı Times'ta
   * satır iki katı yer kapladığı için yarısı kadar. Sabit 55 yazılsaydı
   * roman sayfaları iki kat metin taşıyor görünür ve sayfa sayısı yayıncının
   * saydığının yarısı çıkardı.
   */
  satirSayisi: number;
  /**
   * Yazı tipi DEĞİŞTİRİLEBİLİR mi.
   *
   * Kilit `sayfaDakika` ile aynı şey: sayfa ≈ dakika sözleşmesinin geçerli
   * olduğu her tipte yazı sektör standardıdır ve ızgaranın kendisidir
   * (§16.3 "profil profilinin zorunlu kıldığı ölçüler preset tarafından
   * EZİLEMEZ"). Roman ve düz metinde sayfa süreyi değil el yazması sayfasını
   * ölçüyor; orada Times el yazması standardıdır ve kilit anlamsız olurdu.
   *
   * Ayrı bir bayrak olarak SAKLANMIYOR, tipten TÜRETİLİYOR: iki yerde
   * tutulsaydı biri değişince öteki sessizce eskirdi (Karar 2).
   */
  yaziKilitli: boolean;
  /**
   * İki sütunlu belgenin sütun bölünmesi (§6.6).
   *
   * Profilde çünkü kağıt ve yazı gibi bir BELGE ölçüsü: ekran, sayfalayıcı
   * ve PDF üçü de aynı sayıyı görmeli. Modül sabitinden okunsaydı kullanıcı
   * bölünmeyi değiştirdiğinde biri eskide kalır ve sütun çizgisi metnin
   * ortasından geçerdi (Karar 2).
   */
  ikiSutun: SutunBolunmesi;
}

const varsayilan = (o: Partial<BlokStili>): BlokStili => ({
  solMm: 0, sagMm: 0, buyukHarf: false, kalin: false, italik: false,
  hiza: 'sol', oncekiBosSatir: 0, yeniSayfada: false, ...o,
});

/**
 * Amerikan teslim geometrisi (spec §6.4). Ölçüler metin bloğuna görecelidir.
 *
 * SAHNE BAŞLIĞI ve KARAKTER KALINDIR (kullanıcı kararı 2026-08-26).
 *
 * Önceki karar tersiydi ve gerekçesi şuydu: "STARC kalın yazar ama klasik
 * teslim formatı yazmaz." Doğruydu ama kullanıcının kendi formatı bu ve
 * kararı klasik teslim geleneğini yeniyor — bu programın kullanıcısı o.
 *
 * SAYFA SAYISINI ETKİLEMEZ: Courier kalın da eşgenişliklidir (0,6 em), yani
 * ızgara ve sayfa ≈ dakika sözleşmesi dokunulmadan duruyor. Kalınlık burada
 * yalnız görsel bir ayrım — ve boş bir sayfada blok tipini ayırt etmenin
 * en hızlı yolu.
 *
 * Girintiler VERİDİR, sabit değil: sektörde üç rakip aile var (Final Draft /
 * Cole&Haag / Story Sense) ve hiçbiri tek doğru değil. Üçünün uzlaştığı ve
 * sayfa sayısını belirleyen tek ölçü diyalog genişliğidir (3.5 in = 35 sütun).
 */
export const AMERIKAN_BLOKLAR: Readonly<Partial<Record<ScriptBlockType, Readonly<BlokStili>>>> = {
  scene: varsayilan({ buyukHarf: true, kalin: true, oncekiBosSatir: 2 }),
  action: varsayilan({ oncekiBosSatir: 1 }),
  character: varsayilan({ solMm: 50.8, buyukHarf: true, kalin: true, oncekiBosSatir: 1 }),
  parenthetical: varsayilan({ solMm: 38.1, sagMm: 38.1 }),
  dialogue: varsayilan({ solMm: 25.4, sagMm: 38.1 }),
  transition: varsayilan({ sagMm: 12.7, buyukHarf: true, hiza: 'sag', oncekiBosSatir: 1 }),
};

/**
 * Doküman tipine göre blok stilleri — F7.
 *
 * Her tip YALNIZ kendi bloklarını tanımlıyor. Ortak olanlar `AMERIKAN_BLOKLAR`
 * üzerinden geliyor: senaryo girintileri sektörde uzlaşılmış ölçüler ve onları
 * her tip için yeniden yazmak, birinin değişince ötekilerin sessizce eskimesi
 * demek olurdu (Karar 2).
 */
const senaryoStilleri = AMERIKAN_BLOKLAR;

/** Bölüm başlığı: her tipte yeni sayfada başlar ve ortalanır. */
const bolumStili = varsayilan({
  buyukHarf: true, kalin: true, hiza: 'orta', oncekiBosSatir: 2, yeniSayfada: true,
});

export const TIP_BLOKLARI: Readonly<
  Record<string, Readonly<Partial<Record<ScriptBlockType, Readonly<BlokStili>>>>>
> = {
  senaryo: senaryoStilleri,
  dizi: { bolum: bolumStili, ...senaryoStilleri },
  'sahne-oyunu': {
    bolum: bolumStili,
    scene: senaryoStilleri.scene!,
    /* Sahne yönergesi İTALİK ve girintili: oyuncuya verilen yönerge,
       söylenen sözden görsel olarak ayrılmalı. */
    'sahne-yonergesi': varsayilan({ solMm: 12.7, sagMm: 12.7, italik: true, oncekiBosSatir: 1 }),
    character: senaryoStilleri.character!,
    parenthetical: senaryoStilleri.parenthetical!,
    dialogue: senaryoStilleri.dialogue!,
  },
  'radyo-oyunu': {
    scene: senaryoStilleri.scene!,
    /* Ses ve müzik BÜYÜK HARF: radyo metninde teknik yönerge, seslendirilen
       metinden bir bakışta ayrılmalı — yayında karışması pahalıdır. */
    ses: varsayilan({ buyukHarf: true, oncekiBosSatir: 1 }),
    muzik: varsayilan({ buyukHarf: true, italik: true, oncekiBosSatir: 1 }),
    character: senaryoStilleri.character!,
    parenthetical: senaryoStilleri.parenthetical!,
    dialogue: senaryoStilleri.dialogue!,
  },
  roman: {
    bolum: bolumStili,
    /* Roman paragrafı: ilk satır girintisi yerine bloklar arası boşluk.
       Izgara sabit genişlikli ve ilk-satır girintisi bu ızgarada satır
       sayısını değiştirmezdi ama sayfa sayısını da değiştirmezdi — yani
       görsel bir tercihi motora sokmanın karşılığı yok. */
    paragraf: varsayilan({ oncekiBosSatir: 1 }),
    dialogue: varsayilan({ solMm: 12.7, oncekiBosSatir: 1 }),
  },
  'cizgi-roman': {
    /* Sayfa yeni sayfada başlar: çizgi romanda sayfa ANLATI birimidir,
       yalnız kağıt değil. */
    sayfa: varsayilan({ buyukHarf: true, kalin: true, oncekiBosSatir: 2, yeniSayfada: true }),
    kare: varsayilan({ solMm: 12.7, oncekiBosSatir: 1 }),
    altyazi: varsayilan({ solMm: 25.4, italik: true }),
    character: senaryoStilleri.character!,
    balon: senaryoStilleri.dialogue!,
  },
  'duz-metin': { paragraf: varsayilan({ oncekiBosSatir: 1 }) },
  /* FON BAŞVURU DOSYASI: her bölüm kurumun bir EKİ ve ayrı bir dosya
     olarak teslim ediliyor — `bolumStili`nin `yeniSayfada` bayrağı burada
     tesadüf değil, teslim biçiminin ta kendisi. Gövde romanın paragrafıyla
     aynı: girinti yerine bloklar arası boşluk. */
  'fon-dosyasi': { bolum: bolumStili, paragraf: varsayilan({ oncekiBosSatir: 1 }) },
  /* İKİ SÜTUNLU BELGE (§6.6) — YERLEŞİM yok, TİPOGRAFİ var.
     Girinti ve sütun genişliği `IKI_SUTUN` sabitlerinde kalıyor: bu
     yerleşimin birimi `ScriptBlockType` değil, görüntü/ses çifti. Ama
     KALINLIK ve BÜYÜK HARF blok tipine bağlı ve bir yerde yazılı olmak
     zorunda.

     Tablo eskiden BOŞTU ve sonuç ölçüldü: ekranda
     `.iki-sutun-scene{font-weight:700}` ile kalın görünen sahne başlığı
     PDF'te düz çıkıyordu, presetteki kalınlık da tutunacak bir stil
     bulamıyordu. Değerler ekran CSS'iyle birebir: sahne kalın + versal,
     karakter yalnız versal (ekranda da kalın değil).

     Girinti alanları BİLİNÇLİ OLARAK varsayılan: buradan okunmuyorlar,
     iki sütunlu sayfalayıcı `IKI_SUTUN`a bakıyor. İki yerde yaşayan bir
     girinti, biri değişince ötekini sessizce eskitirdi (Karar 2). */
  'goruntu-ses': {
    scene: varsayilan({ buyukHarf: true, kalin: true }),
    action: varsayilan({}),
    character: varsayilan({ buyukHarf: true }),
    parenthetical: varsayilan({}),
    dialogue: varsayilan({}),
    transition: varsayilan({ buyukHarf: true }),
  },

};

/**
 * Bir blok tipinin satır başına kaç karakter aldığı.
 *
 * Izgara hizası burada DOĞRULANIR, yuvarlanarak gizlenmez: girintiler
 * karakter genişliğinin tam katı değilse sayfa sayısı yalancı çıkar ve
 * sayfa=dakika sözleşmesi sessizce bozulur (spec §6.3). Yuvarlamak hatayı
 * yutmak olurdu.
 *
 * Sonuç POZİTİF olmak zorundadır: girintiler metin bloğunu tümüyle yerse
 * sıfır ya da negatif sütun çıkar ve `sarmala` sonsuz döngüye girer —
 * uygulama donar, kullanıcının kaydedilmemiş işi gider. Bu bir veri kaybı
 * yoludur (spec §15), sessizce geçilemez.
 */
/**
 * Bloğun kullanabileceği genişlik, MİLİMETRE.
 *
 * `sutunGenisligi` ile aynı ölçünün iki yazılışı: o sütun sayar, bu mm.
 * Eşgenişlikli yazıda ikisi birbirine `KARAKTER_MM` ile çevrilir; orantılı
 * yazıda sütun diye bir şey olmadığı için yalnız bu geçerli.
 */
export function kullanilabilirGenislikMm(stil: BlokStili): number {
  return IZGARA.sutun * KARAKTER_MM - stil.solMm - stil.sagMm;
}

/**
 * Yazının satır yüksekliği, MİLİMETRE.
 *
 * `SATIR_MM` (1/6 inç) Courier'in em'i ile birebir aynı; başka bir yazıda
 * satır `satirEm` katı yer kaplar. Sabit `SATIR_MM` kullanılsaydı çift
 * aralıklı bir roman satırı ekranda üst üste binerdi.
 */
export function satirYuksekligiMm(yazi: YaziTipi): number {
  return SATIR_MM * yazi.satirEm;
}

/**
 * Sayfaya sığan satır sayısı — YAZIDAN türetilir.
 *
 * Courier'de tam olarak `IZGARA.satir` (55) çıkıyor ve bu bir TESADÜF DEĞİL:
 * metin yüksekliği zaten 55 × 1/6 inç olarak tanımlı. Türetim, ızgarayı
 * bozmadan başka bir yazının kaç satır aldığını da veriyor.
 */
export function sayfaSatirSayisi(yazi: YaziTipi): number {
  return Math.floor((IZGARA.satir * SATIR_MM) / satirYuksekligiMm(yazi));
}

export function sutunGenisligi(stil: BlokStili): number {
  const mm = IZGARA.sutun * KARAKTER_MM - stil.solMm - stil.sagMm;
  const sutun = mm / KARAKTER_MM;
  const yuvarlak = Math.round(sutun);
  if (Math.abs(sutun - yuvarlak) > 1e-9) {
    throw new Error(
      `Girinti izgaraya oturmuyor: sol=${stil.solMm} sag=${stil.sagMm} -> ${sutun} sutun`,
    );
  }
  if (yuvarlak <= 0) {
    throw new Error(
      `Sutun genisligi pozitif degil: sol=${stil.solMm} sag=${stil.sagMm} -> ${yuvarlak} sutun`,
    );
  }
  return yuvarlak;
}

export function profilOlustur(
  geometriAdi: GeometriAdi,
  kagit: KagitAdi,
  dil: DilAdi,
): FormatProfili {
  if (geometriAdi !== 'amerikan') {
    throw new Error(`Geometri henuz tanimli degil: ${geometriAdi}`);
  }
  return {
    geometriAdi, kagit, dil,
    geometri: kagitGeometrisi(kagit),
    bloklar: AMERIKAN_BLOKLAR,
    yazi: COURIER_PRIME,
    satirSayisi: sayfaSatirSayisi(COURIER_PRIME),
    /* Bu yol senaryo geometrisidir (`amerikan`); yazı kilitli. */
    yaziKilitli: true,
    ikiSutun: IKI_SUTUN,
  };
}

/**
 * Doküman tipine göre profil — F7.
 *
 * Geometri (kağıt, ızgara, marjlar) TİPE GÖRE DEĞİŞMİYOR: §6.3'ün kağıt
 * geometrisi teslim standardı ve roman da senaryo da aynı kağıda basılıyor.
 * Değişen yalnız blok stilleri.
 *
 * Bilinmeyen tip SESSİZCE senaryoya düşmüyor: düşseydi kullanıcı roman
 * yazdığını sanıp senaryo girintileriyle basılmış bir dosya teslim ederdi.
 */
export function tipProfili(
  tipAdi: string,
  kagit: KagitAdi,
  dil: DilAdi,
  /* Yazı tipi İSTEĞE BAĞLI ve varsayılanı Courier: çağıranların çoğu senaryo
     yolunda ve orada yazı KİLİTLİ. Verilmediğinde eski davranış birebir
     korunuyor. */
  yazi: YaziTipi = COURIER_PRIME,
  /* İki sütunlu belge dışında kullanılmıyor; verilmezse eşit bölünme. */
  bolunme?: SutunBolunmesi,
): FormatProfili {
  /* Düz indeksleme prototip anahtarlarında muhafızı deliyordu:
     `TIP_BLOKLARI['constructor']` `Object` işlevini döner, doğru sayılır ve
     "Bilinmeyen dokuman tipi" hatası ATILMAZ — profil, blok listesi yerine
     bir işlevle kurulur. Tip adı belgeden (`meta.dokumanTipi`) geliyor.
     `model/dokuman-tipi.ts` ile aynı düzeltme. */
  const bloklar = Object.prototype.hasOwnProperty.call(TIP_BLOKLARI, tipAdi)
    ? TIP_BLOKLARI[tipAdi]
    : undefined;
  if (!bloklar) throw new Error(`Bilinmeyen dokuman tipi: ${tipAdi}`);
  /* KİLİT BURADA UYGULANIYOR, çağırana bırakılmıyor: senaryo profilini Times
     ile isteyen bir çağıran sessizce kabul edilseydi sayfa ≈ dakika
     sözleşmesi teslim dosyasında çökerdi ve bunu ancak yapımcı fark ederdi. */
  /* YAZI KİLİDİ İKİ SEBEPTEN doğar, biri değil:
       1. sayfa ≈ dakika sözleşmesi (senaryo ailesi),
       2. IZGARA KARAKTER SAYIYOR (iki sütunlu belge).
     İkincisi eksikti ve sonuç ölçüldü: Fransız belgede ekran Courier
     çiziyor (format/ekran.ts bunu açıkça sabitliyor, gerekçesi de "ekran ile
     PDF aynı sayıyı vermeli"), PDF ise varsayılan tercihle Tinos
     basıyordu. İki sütunlu sayfalayıcı 28 SÜTUN sayıyor; orantılı bir
     yazıda o sayı gerçek genişliği anlatmaz ve metin sütunu taşar. */
  const tip = dokumanTipi(tipAdi) ?? DOKUMAN_TIPLERI.senaryo;
  const kilitli = tip.sayfaDakika || Boolean(tip.ikiSutun);
  return {
    geometriAdi: 'amerikan', kagit, dil,
    geometri: kagitGeometrisi(kagit),
    bloklar,
    yazi: kilitli ? COURIER_PRIME : yazi,
    satirSayisi: sayfaSatirSayisi(kilitli ? COURIER_PRIME : yazi),
    yaziKilitli: kilitli,
    ikiSutun: bolunme ?? IKI_SUTUN,
  };
}
