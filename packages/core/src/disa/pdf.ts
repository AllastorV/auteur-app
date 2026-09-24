import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { useUiStore } from '../store/ui';
import fontkit from '@pdf-lib/fontkit';
import type { ScriptBlock } from '../model/script';
import type { FormatProfili } from '../format/profil';
import { KARAKTER_MM } from '../format/izgara';
import { satirYuksekligiMm } from '../format/profil';
import { genislikEm } from '../format/yazi';
import { YAZI_MM } from '../format/ekran';
import { sayfala, type Sayfa } from '../format/sayfala';
import { isaretliSayfaNumaralari } from '../model/revizyon';

/**
 * PDF dışa aktarımı — §12 F1c'nin bağlayıcı maddesi:
 * "dışa aktarılan sayfa sayısı editördekiyle AYNI".
 *
 * Bu garanti YAPISALDIR, test edilmiş bir eşitlik değil: sayfalar doğrudan
 * `sayfala()`'dan geliyor ve her sayfa için tam bir PDF sayfası çiziliyor.
 * İkinci bir sayfalama hesabı yok, dolayısıyla ıraksayacak bir şey de yok
 * (Karar 34'ün PDF'teki karşılığı).
 *
 * ## Yazı tipi neden GÖMÜLÜYOR
 *
 * ÖLÇÜLDÜ: `ğ Ğ ş Ş ı İ` Latin-1'in dışında (U+011E…U+0130). PDF'in yerleşik
 * (base-14) Courier'i ile bu harfler taşınamaz; `/Differences` ile eşlemek ise
 * görüntüleyicinin yazı tipi ikamesine bahis oynamak olurdu — teslim edilen
 * dosyada SESSİZ bir kayıp riski. Gömme, doğrulanamaz bir riski (görüntüleyici
 * ne kullanıyor?) yapısal olarak doğrulanabilir bir olguya (glif dosyanın
 * içinde mi?) çeviriyor.
 *
 * ## Metin ızgaraya göre konumlanıyor, yazı tipinin ilerlemesine göre DEĞİL
 *
 * ÖLÇÜLDÜ: Courier Prime'ın ilerlemesi 1228/2048 = 0,59961 em, ızgara sabiti
 * ise 0,6. Fark 60 karakterde ~0,1 mm — küçük ama BİRİKİR. Her satır kendi
 * başlangıç noktasından çizilir ve satır içi konum yazı tipine bırakılır;
 * satır BAŞLANGIÇLARI ızgaradan gelir, böylece girintiler kağıtta tam
 * karakter hizasında durur.
 */

export interface PdfYaziTipleri {
  /** Zorunlu. Düz metin. */
  duz: Uint8Array;
  kalin?: Uint8Array;
  italik?: Uint8Array;
}

export interface PdfSecenekleri {
  profil: FormatProfili;
  yaziTipleri: PdfYaziTipleri;
  /** PDF üstverisindeki başlık. */
  baslik?: string;
  yazar?: string;
}

export interface PdfCiktisi {
  pdf: Uint8Array;
  /** `sayfala()`'nın verdiği sayı. Ayrı bir hesap YOK. */
  sayfaSayisi: number;
}

export const MM_PUNTO = 72 / 25.4;
export const mm = (deger: number) => deger * MM_PUNTO;

function satiriCiz(
  sayfa: PDFPage,
  metin: string,
  solMm: number,
  altMm: number,
  font: PDFFont,
  puntoBoyu: number,
): void {
  if (!metin) return;
  sayfa.drawText(metin, { x: mm(solMm), y: mm(altMm), size: puntoBoyu, font });
}

/** Belgeye gömülmüş yazı tipleri. */
export interface GomuluFontlar {
  duz: PDFFont;
  kalin: PDFFont;
  italik: PDFFont;
}

/**
 * Yazı tiplerini belgeye gömer.
 *
 * Kalın ve italik VERİLMEZSE düze düşülür — ama bu artık YALNIZ bir güvenlik
 * ağı: `AMERIKAN_BLOKLAR`'ın (senaryonun kendisi) hiçbir bloğu kalın ya da
 * italik değil, fakat `dizi`/`roman`/`cizgi-roman`'daki `bolum` KALIN ve
 * `sahne-oyunu`'ndaki `sahne-yonergesi` İTALİK (`format/profil.ts`). O gün
 * geldi: `yazitipi.ts`'teki `pdfYaziTipleri` artık ÜÇ ağırlığı da getiriyor,
 * yani üretim yolunda (`ExportDialog` → `pdfYaziTipleri` → burası) düşüş hiç
 * TETİKLENMİYOR. Düşüş yalnız `yaziTipleri.kalin`/`.italik` elle
 * verilMEDİĞİNDE kalır (bkz. `pdf-temiz.test.ts`: kasıtlı olarak yalnız
 * `duz` veriyor, çünkü orada iddia font değil bayt kimliği). Ölçüldü:
 * `pdf-kalin-italik.test.ts` kalın/italik bloğun içerik akışında GERÇEKTEN
 * kendi fontuyla basıldığını doğruluyor.
 */
export async function fontlariGom(
  belge: PDFDocument,
  yaziTipleri: PdfYaziTipleri,
): Promise<GomuluFontlar> {
  // fontkit alt kümelemesi Tinos gliflerini bozuyor; tam TTF gömülür (QA F11).
  const duz = await belge.embedFont(yaziTipleri.duz, { subset: false });
  return {
    duz,
    kalin: yaziTipleri.kalin ? await belge.embedFont(yaziTipleri.kalin, { subset: false }) : duz,
    italik: yaziTipleri.italik ? await belge.embedFont(yaziTipleri.italik, { subset: false }) : duz,
  };
}

/**
 * Senaryo sayfalarını VAR OLAN bir belgeye ekler ve eklenen sayfa sayısını
 * döndürür.
 *
 * Paket kurucusundan ayrı durması, "senaryo + arkasında storyboard" tek dosyasının
 * (§16.2) ikinci bir sayfalama hesabı doğurmadan kurulabilmesi içindir.
 */
/**
 * Sayfa aralığı — 1 tabanlı ve İKİ UCU DAHİL (§16.2 borcu).
 *
 * Kullanıcı "3-7. sayfalar" derken yedinci sayfayı da kastediyor; yarı açık
 * aralık programcı sözleşmesidir ve arayüzde yalan söylerdi.
 */
export interface SayfaAraligi {
  ilk: number;
  son: number;
}

/**
 * FİLİGRAN — her sayfaya çapraz basılan iz.
 *
 * Sektörde dağıtım denetiminin standart aracı: metin yapımcıya, oyuncuya ya
 * da ajansa gönderilirken her kopyaya alıcının adı basılır; metin sızarsa
 * hangi kopyadan sızdığı bilinir.
 *
 * **Metnin ALTINA çiziliyor**, üstüne değil: filigranın işi okumayı
 * engellemek değil, kopyayı işaretlemek. Üste çizilseydi teslim edilen
 * senaryo okunmaz olurdu.
 *
 * **VARSAYILAN KAPALI.** Filigranlı bir dosya kazayla teslim edilirse geri
 * alınamaz; kapalıyken kazayla filigransız teslim etmenin bedeli yok.
 */
export interface Filigran {
  metin: string;
  /**
   * Açı, derece. Pozitif değer soldan sağa YUKARI doğru — köşegen yerleşimin
   * okunaklı olanı. Sıfır yatay yazar.
   */
  aci: number;
  /** 0..1 arası. Yükseldikçe metnin okunurluğu düşer. */
  opaklik: number;
  /**
   * Metnin, verilen açıda sayfaya sığan EN UZUN çizginin ne kadarını
   * kaplayacağı (0..1).
   *
   * Eskiden burada `boyutKat` vardı: gövde puntosunun sabit bir katı.
   * Sabit punto, metnin UZUNLUĞUNU hesaba katmıyordu — "TASLAK" sayfanın
   * sol altında küçücük kalıyor, uzun bir ad kenardan taşıyordu (kullanıcı
   * bildirimi 2026-08-30: "kısa yazılınca sol altta kalıyor, her türlü
   * uçtan uca ve ortalı olmalı"). Artık punto metinden TÜRETİLİYOR.
   */
  dolulukOrani: number;
}

/**
 * Filigranın puntosunu ve BAŞLANGIÇ noktasını hesaplar.
 *
 * İki iş birden yapıyor ve ikisi birbirine bağlı: punto metnin uzunluğundan
 * türediği için başlangıç noktası ancak punto bilindikten sonra bulunabilir.
 *
 * ## Punto
 * Verilen açıda sayfaya sığan en uzun çizgi `min(G/|cos|, Y/|sin|)`. Metin
 * bunun `dolulukOrani` kadarını kaplasın isteniyor; birim puntodaki genişlik
 * ölçülüp oranlanıyor. Yatay (0°) ve dikey (90°) açılarda bölenlerden biri
 * sıfıra gider — o eksen kısıtlamaz ve `Infinity` olarak elenir.
 *
 * ## Konum
 * `drawText` metni BAŞLANGIÇ noktasından çiziyor, merkezinden değil. Metnin
 * ortası sayfanın ortasına gelsin diye başlangıç, merkezden yarım metin
 * uzunluğu GERİ alınıyor; ayrıca taban çizgisi harflerin ortası değil altı
 * olduğu için dik yönde yarım yükseklik daha kaydırılıyor.
 *
 * SAF: pdf-lib bilmez, ölçüyü çağıran veriyor. Böylece sınanabiliyor —
 * eski sabit konumlu hâli ancak üretilen PDF açılarak görülebilirdi.
 */
export function filigranYerlesimi(
  filigran: Filigran,
  sayfaGenislik: number,
  sayfaYukseklik: number,
  /** Verilen puntoda metnin genişliği. */
  metinGenisligi: (punto: number) => number,
): { punto: number; x: number; y: number } {
  const rad = (filigran.aci * Math.PI) / 180;
  const kos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  /* SIFIRA BÖLME KORUMASI YOK ve gerekmiyor: JS'te `x / 0` NaN değil
     `Infinity` verir, `Math.min` de onu zaten eler. Önce ternary'li bir
     muhafız yazılmıştı; mutasyon testi onu ÖLDÜREMEDİ — çünkü ölüydü. */
  const yataySinir = sayfaGenislik / kos;
  const dikeySinir = sayfaYukseklik / sin;
  const uzunluk = Math.min(yataySinir, dikeySinir)
    * Math.max(0, Math.min(1, filigran.dolulukOrani));

  /* Birim puntodaki genişlik ölçülüp oranlanıyor: pdf-lib'in genişliği
     puntoyla doğrusal. Sıfır genişlik (boş metin ya da fontun tanımadığı
     karakterler) bölmeyi patlatmasın diye korunuyor. */
  const birim = metinGenisligi(1);
  const punto = birim > 1e-6 ? uzunluk / birim : 1;

  /* Taban çizgisi kayması: harf yüksekliğinin kabaca yarısı. Tam metrik
     yerine oran kullanılıyor — filigran bir işaret, tipografik bir dizgi
     değil; yarım punto sapma görünmez. */
  const tabanKaymasi = punto * 0.35;

  return {
    punto,
    x: sayfaGenislik / 2 - (uzunluk / 2) * Math.cos(rad) + tabanKaymasi * Math.sin(rad),
    y: sayfaYukseklik / 2 - (uzunluk / 2) * Math.sin(rad) - tabanKaymasi * Math.cos(rad),
  };
}

export const VARSAYILAN_FILIGRAN: Filigran = {
  metin: '',
  /* 38°: Letter köşegeni ~39°. Köşegene yakın açı metni sayfanın iki
     köşesine yaslar, yani ne taşar ne de ortada küçük kalır. */
  aci: 38,
  /* 0.12 opaklık ÖLÇÜLDÜ: daha koyusu gövde metnini okunmaz kılıyor, daha
     açığı yazıcıdan hiç çıkmıyor. */
  opaklik: 0.12,
  /* 0.92: iki uçta yarım santimlik nefes payı bırakıyor. 1.0 metni kâğıdın
     tam kenarına dayardı ve kenar boşluksuz yazan yazıcılarda kırpılırdı. */
  dolulukOrani: 0.92,
};

export interface SenaryoCizSecenek {
  profil: FormatProfili;
  fontlar: GomuluFontlar;
  /** Verilmezse TÜM sayfalar basılır. */
  aralik?: SayfaAraligi | null;
  /** Kapalıysa `null` — VARSAYILAN KAPALI (bkz. `Filigran`). */
  filigran?: Filigran | null;
  /** Verilmezse revizyon basımı YAPILMAZ — beyaz sayfa, üstbilgi yok. */
  revizyon?: RevizyonBasimi | null;
}

/**
 * Revizyon basımı — renkli sayfa, üstbilgi, değişim yıldızı.
 *
 * Yalnız etkin revizyonda işaretli blok taşıyan sayfalar renk ve üstbilgi alır.
 * `yalnizIsaretli` yalnız hangi sayfaların çıktıya gireceğini belirler.
 */
export interface RevizyonBasimi {
  /** Sayfa zemini — `RENK_ZEMINI` değeri. */
  zemin: readonly [number, number, number];
  /** Sayfa üstbilgisi — "MAVİ REVİZYON · 12.03.2026". */
  ustbilgi: string;
  /** İşaretli blok kimlikleri. Bu blokların satırlarına yıldız konur. */
  isaretler: ReadonlySet<string>;
  /** Açıksa YALNIZ işaretli blok taşıyan sayfalar basılır. */
  yalnizIsaretli?: boolean;
}

/** Değişen satırın sağ kenar boşluğundaki işareti (sektör standardı). */
const DEGISIM_ISARETI = '*';

/** İşaretin metin bloğunun sağ kenarından uzaklığı. */
const ISARET_BOSLUK_MM = 4;

/** Üstbilginin üst marj çizgisinin ne kadar üstünde durduğu. */
const USTBILGI_YUKSEKLIK_MM = 6;

/**
 * Yalnız işaretli blok taşıyan sayfalar.
 *
 * Sayfalama TAM belge üzerinden yapıldıktan SONRA süzülüyor: yalnız işaretli
 * blokları sayfalasaydık sayfa sonu kararları ve numaralar bütün belgeninkinden
 * farklı çıkardı ve ekip, senaryonun geri kalanıyla hizalanmayan sayfa
 * numaraları taşıyan bir tomar alırdı (Karar 34).
 */
export function isaretlileriSuz(
  sayfalar: readonly Sayfa[],
  isaretler: ReadonlySet<string>,
): Sayfa[] {
  const secili = isaretliSayfaNumaralari(
    sayfalar, new Map([...isaretler].map((id) => [id, 'etkin'])), 'etkin',
  );
  return sayfalar.filter((s) => secili.has(s.no));
}

/**
 * Aralığı sayfalara uygular.
 *
 * Aralık dışarıdan (arayüz alanı) geliyor: ters, sıfır ya da taşan değerler
 * SESSİZCE düzeltiliyor çünkü boş bir PDF üretmek kullanıcıya hiçbir şey
 * anlatmaz. Düzeltme yalnız SINIRLARA uygulanıyor, sayfaların KENDİSİ
 * değişmiyor — sayfa numaraları motorun verdiği numaralar olarak kalıyor.
 */
export function araligiUygula(sayfalar: readonly Sayfa[], aralik?: SayfaAraligi | null): Sayfa[] {
  if (!aralik) return [...sayfalar];
  const ilk = Math.max(1, Math.min(sayfalar.length, Math.floor(aralik.ilk)));
  const son = Math.max(ilk, Math.min(sayfalar.length, Math.floor(aralik.son)));
  return sayfalar.slice(ilk - 1, son);
}

export function senaryoCiz(
  belge: PDFDocument,
  bloklar: readonly ScriptBlock[],
  opts: SenaryoCizSecenek,
): number {
  const { profil, fontlar, aralik, filigran, revizyon } = opts;
  const g = profil.geometri;
  /* Sayfalama TAM belge üzerinden — aralık SONRA uygulanıyor. Yalnız
     seçilen blokları sayfalasaydık sayfa numaraları ve sayfa sonu kararları
     bütün belgeninkinden farklı çıkardı: kullanıcı "3-7" isteyip başka bir
     kırılmayla basılmış sayfalar alırdı (Karar 34). */
  /* Süreklilik satırları PDF'te de basılıyor: ekranda görünüp çıktıda
     görünmemesi "gördüğün şey basılan şey" sözünü kırardı. */
  const tumSayfalar = sayfala(bloklar, profil, useUiStore.getState().sayfaSonuSurekliligi);
  /* Aralık ÖNCE, süzgeç SONRA: "3-7" aralığı BELGENİN 3-7. sayfaları
     demektir, süzülmüş listenin 3-7'si değil. Ters sırada kullanıcı
     istediğinden başka sayfalar alırdı. */
  const araliktakiler = araligiUygula(tumSayfalar, aralik);
  const isaretliSayfaNo = revizyon
    ? isaretliSayfaNumaralari(
        tumSayfalar, new Map([...revizyon.isaretler].map((id) => [id, 'etkin'])), 'etkin',
      )
    : new Set<number>();
  const sayfalar: Sayfa[] = revizyon?.yalnizIsaretli
    ? araliktakiler.filter((s) => isaretliSayfaNo.has(s.no))
    : araliktakiler;
  const punto = YAZI_MM * MM_PUNTO;

  for (const s of sayfalar) {
    const sayfa = belge.addPage([mm(g.sayfaGenislikMm), mm(g.sayfaYukseklikMm)]);

    if (revizyon && isaretliSayfaNo.has(s.no)) {
      /* Zemin HER ŞEYDEN ÖNCE: PDF'te sonra çizilen üste gelir, zemin sonra
         çizilseydi metnin tamamını örterdi. */
      const [kr, kg, kb] = revizyon.zemin;
      sayfa.drawRectangle({
        x: 0,
        y: 0,
        width: mm(g.sayfaGenislikMm),
        height: mm(g.sayfaYukseklikMm),
        color: rgb(kr, kg, kb),
      });
      /* Üstbilgi üst marjın İÇİNE değil ÜSTÜNE yazılıyor: metin bloğunun
         başladığı satırı aşağı kaydırsaydı aynı senaryo revizyonlu ve
         revizyonsuz basımda farklı sayfalara bölünürdü (Karar 34). */
      sayfa.drawText(revizyon.ustbilgi, {
        x: mm(g.solMm),
        y: mm(g.sayfaYukseklikMm - g.ustMm + USTBILGI_YUKSEKLIK_MM),
        size: punto,
        font: fontlar.duz,
        color: rgb(0, 0, 0),
      });
    }

    /* Satır genişliği ÖLÇÜLEREK. Eşgenişlikli yazıda karakter sayısı ×
       ızgara sabiti (eski davranış, birebir); orantılı yazıda karakter
       sayısının genişlikle ilgisi yok ve sağa yaslanmış bir geçiş sayfanın
       dışına düşerdi. */
    const satirGenisligiMm = (metin: string) => (profil.yazi.esgenislik
      ? metin.length * KARAKTER_MM
      : genislikEm(metin, profil.yazi) * (KARAKTER_MM / 0.6));

    /* FİLİGRAN metinden ÖNCE çiziliyor: PDF'te sonra çizilen üste gelir ve
       filigran metnin üstüne binseydi sayfa okunmaz olurdu. */
    if (filigran && filigran.metin) {
      /* Opaklık RENGE çevriliyor, `opacity` alanına değil: bazı PDF
         görüntüleyicileri ve baskı sürücüleri saydamlığı düzleştirirken
         metni tümüyle düşürüyor. Gri ton her yerde aynı çıkar. */
      const ton = 1 - Math.max(0, Math.min(1, filigran.opaklik));
      const yerlesim = filigranYerlesimi(
        filigran,
        mm(g.sayfaGenislikMm),
        mm(g.sayfaYukseklikMm),
        (birimGenislik) => fontlar.duz.widthOfTextAtSize(filigran.metin, birimGenislik),
      );
      sayfa.drawText(filigran.metin, {
        x: yerlesim.x,
        y: yerlesim.y,
        size: yerlesim.punto,
        font: fontlar.duz,
        color: rgb(ton, ton, ton),
        rotate: degrees(filigran.aci),
      });
    }

    s.satirlar.forEach((satir, i) => {
      const stil = profil.bloklar[satir.tip];
      if (!stil) return;
      const font = stil.kalin ? fontlar.kalin : stil.italik ? fontlar.italik : fontlar.duz;

      /* PDF'te taban çizgisi ALTTAN ölçülür. Satırın tabanı, üst marjın
         altındaki (i+1). satırın dibidir; `+1` olmasaydı ilk satır üst marjın
         ÜSTÜNE, kağıdın dışına düşerdi. */
      /* Satır yüksekliği YAZIDAN: sabit `SATIR_MM` kalsaydı çift aralıklı
         bir roman PDF'te tek aralıkla basılır, ekranda gördüğünden yarı
         kalınlıkta bir dosya teslim edilirdi. */
      const altMm = g.sayfaYukseklikMm - g.ustMm - (i + 1) * satirYuksekligiMm(profil.yazi);

      let solMm = g.solMm + stil.solMm;
      if (stil.hiza === 'sag') {
        /* Sağa yaslama ızgaradan hesaplanır, `widthOfTextAtSize` ile değil:
           yazı tipinin ilerlemesi ızgaradan azıcık farklı (ölçüldü) ve metrik
           kullanmak geçişleri diğer satırlarla aynı karakter sütununa
           oturtmazdı. */
        const metinGenislikMm = g.metinGenislikMm - stil.solMm - stil.sagMm;
        solMm = g.solMm + stil.solMm + metinGenislikMm - satirGenisligiMm(satir.metin);
      } else if (stil.hiza === 'orta') {
        const metinGenislikMm = g.metinGenislikMm - stil.solMm - stil.sagMm;
        solMm = g.solMm + stil.solMm + (metinGenislikMm - satirGenisligiMm(satir.metin)) / 2;
      }

      satiriCiz(sayfa, satir.metin, solMm, altMm, font, punto);

      /* Değişim yıldızı SAĞ KENAR BOŞLUĞUNDA — sektör standardı. Metin
         bloğunun içine konsaydı satırı kısaltır, aynı senaryo işaretli ve
         işaretsiz basımda farklı sarılırdı. */
      if (revizyon?.isaretler.has(satir.blockId)) {
        satiriCiz(
          sayfa,
          DEGISIM_ISARETI,
          g.solMm + g.metinGenislikMm + ISARET_BOSLUK_MM,
          altMm,
          fontlar.duz,
          punto,
        );
      }
    });
  }

  return sayfalar.length;
}
