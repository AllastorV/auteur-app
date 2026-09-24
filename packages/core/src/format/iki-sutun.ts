import { IZGARA } from './izgara';
import type { FormatProfili } from './profil';
import { sarmala } from './sayfala';
import { buyut } from './terim';

/**
 * Fransız yerleşim — iki sütunlu görüntü/ses (§6.6).
 *
 * **Tek sütunlu motorun türevi DEĞİL.** `sayfala` satır bazlı çalışır:
 * `IZGARA.satir` dolunca sayfayı kapatır ve blok satırlarını tek tek iter.
 * Burada sayfalama birimi SATIR ÇİFTİDİR — görüntü hücresi 6, ses hücresi 2
 * satır sürüyorsa çift 6 satır yer kaplar ve sığmıyorsa TÜMÜ sonraki sayfaya
 * geçer. Bu, o döngüye sığmaz; ayrı bir yol ister (spec §6.6).
 *
 * **Ortak olan yalnız kağıt geometrisi (§6.3), ızgara ve blok kimliği.**
 * Sarma `sarmala`'dan geliyor, ikinci bir kopya yazılmıyor: NFC
 * normalizasyonu (Karar 2), sütun≤0 muhafızı (§15 donma yolu) ve uzun kelime
 * bölme orada ölçülmüş hâlde duruyor.
 *
 * **Sayfa = dakika sözleşmesi bu yerleşimde GEÇERSİZDİR.** Süre `sureTahmini`
 * ile ses sütunundan hesaplanır ve katsayı kalibre edilmeden GÖSTERİLMEZ.
 */

/**
 * Izgaranın iki sütuna bölünmesi.
 *
 * Toplam 60 sütun DEĞİŞMEZ (§6.3: ızgara sabittir, marj esner), yalnız
 * içeriden bölünür. Oluk gerçek bir ölçüdür, süs değil: bitişik iki metin
 * sütununda göz satır sonunu bulamaz ve yanlış hücreye kayar.
 *
 * ## Kalibrasyon borcu KAPANDI — ama beklenen cevapla değil (2026-08-26)
 *
 * §17 "sütun oranı gerçek örneklere karşı ölçülmeden yayımlanmaz" diyordu.
 * Arandı: **iki sütunlu AV senaryosunun sütun oranı için YAYIMLANMIŞ BİR
 * STANDART YOK.** Kaynakların ortak ifadesi biçimin "less rigid, with a few
 * standard practices and room for variation" olduğu; sabitlenen tek şey
 * 1 inç marj ve Courier 12pt. Bazı yapımevleri görüntü sütununu "biraz daha
 * geniş" tutuyor ama bu bir tercih, ölçü değil.
 *
 * Yani ölçülecek tek bir doğru YOKTU. Varsayımı ölçüm gibi göstermek yerine
 * KULLANICI AYARINA çevrildi: varsayılan eşit bölünme (28+4+28), isteyen
 * kaydırıyor. Bir ölçünün standardı yoksa doğru cevap onu uydurmak değil,
 * kararı kullanıcıya açıkça bırakmaktır.
 *
 * Referans örnekte oluk YOKTU (ölçüldü: sol x=18→290, sağ x=293→566) ama o
 * belge 18 pt'lik marjla üretilmiş bir ekran PDF'i; §6.3'ün teslim
 * geometrisiyle bağdaşmıyor. Ondan alınan şey oranlardır: sütunlar EŞİT.
 */
export interface SutunBolunmesi {
  sol: number;
  oluk: number;
  sag: number;
}

/** Varsayılan: eşit sütunlar. Çoğu şablonun yaptığı da budur. */
export const IKI_SUTUN: SutunBolunmesi = { sol: 28, oluk: 4, sag: 28 };

/**
 * Oluk EN AZ bu kadar olmalı.
 *
 * Sıfır oluk göze satır sonunu kaybettirir; iki sütunlu bir belgede bu,
 * okuyucunun yanlış sütundan devam etmesi demektir. İki karakter, Courier'de
 * yaklaşık 5 mm — gözün sütun değiştirdiğini anlamasına yeten en küçük ölçü.
 */
export const EN_AZ_OLUK = 2;

/** Bir sütunun altına düşemeyeceği genişlik — altında sarma anlamsızlaşır. */
export const EN_AZ_SUTUN = 12;

/**
 * Kullanıcının verdiği bölünmeyi ızgaraya oturtur.
 *
 * Değer arayüz sürgüsünden geliyor, yani GÜVEN SINIRI: toplam ızgarayı
 * tüketmezse sayfa ya taşar ya boş kalır ve sayfa sayısı yalan söyler.
 * Kırpma SESSİZ değil — sınırlara dayanan bir değer geri döndürülüyor ve
 * arayüz onu gösteriyor, yani kullanıcı ne aldığını görüyor.
 */
export function bolunmeyiKur(solSutun: number): SutunBolunmesi {
  const sol = Math.max(EN_AZ_SUTUN, Math.min(
    IZGARA.sutun - EN_AZ_OLUK - EN_AZ_SUTUN,
    Math.round(solSutun),
  ));
  /* Oluk SABİT kalıyor, kalan sağa gidiyor: olukla oynamak sütun oranını
     değiştirmenin dolaylı bir yolu olurdu ve iki ayar aynı şeyi kontrol
     ederdi. */
  const oluk = IKI_SUTUN.oluk;
  return { sol, oluk, sag: IZGARA.sutun - sol - oluk };
}

/**
 * Çiftler arası ayırıcı satır sayısı.
 *
 * Tek sütunlu yol bu değeri PROFİL VERİSİNDEN okuyor (`stil.oncekiBosSatir`,
 * §6.4: "girintiler VERİDİR"). Burada kodda duruyor çünkü bu yerleşimin
 * girdileri `ScriptBlockType` değil (`cift` / `sahne`) ve profil tablosunda
 * karşılıkları yok. Sabit KODDA kalıyor ama artık ADLANDIRILMIŞ: §14'ün
 * Fransız yerleşimi kalibrasyon borcu kapatılırken bu değer profil verisine
 * taşınacak — o gün presetlerin ona ulaşabilmesi gerekiyor.
 */
export const AYIRICI_SATIR = 1;

/* Bölünme ızgarayı tüketmek ZORUNDA: eksikse sayfa dar, fazlaysa taşar ve
   iki durumda da sayfa sayısı yalancı çıkar. Modül yüklenirken doğrulanır —
   sabitler elle değiştirildiğinde ilk içe aktarımda patlar. */
if (IKI_SUTUN.sol + IKI_SUTUN.oluk + IKI_SUTUN.sag !== IZGARA.sutun) {
  throw new Error(
    `İki sütun bölünmesi ızgarayı tüketmiyor: ` +
      `${IKI_SUTUN.sol}+${IKI_SUTUN.oluk}+${IKI_SUTUN.sag} ≠ ${IZGARA.sutun}`,
  );
}

/**
 * SÜTUN YERLEŞİMİ — hangi blok hangi sütuna, hangi girintiyle.
 *
 * Kullanıcı kararı: "Amerikan formattaki presetler burada da olsun; oto
 * presete göre sağ ya da sol yazım alanındaki yerleşime geçsin."
 *
 * Yani blok tipleri AYNI (`ScriptBlockType`), değişen yalnız YERLEŞİM.
 * Ayrı bir tip kümesi uydurmak, aynı kavramı iki adla anlatmak olurdu
 * (Karar 2) — ve kullanıcı bir belgeyi tek sütundan iki sütuna
 * çevirdiğinde blokların yeniden yazılması gerekirdi.
 *
 * SOL = ne görüyoruz (aksiyon, geçiş). SAĞ = ne duyuyoruz (karakter,
 * parantez, diyalog). Sahne başlığı ikisine YAYILIR (§6.6: "ortak").
 *
 * Girintiler Amerikan yerleşimin ORANINI koruyor ama sağ sütunun 28
 * karakterine sığıyor: karakter en içeride, parantez ortada, diyalog
 * kenarda — okuyucu üç satırı biçiminden ayırt eder, etiketlerinden değil.
 */
export interface SutunYerlesimi {
  sutun: 'sol' | 'sag' | 'tam';
  /** Kendi sütunu içinde soldan girinti (karakter). */
  girinti: number;
  buyukHarf: boolean;
  hiza: 'sol' | 'sag';
}

export const IKI_SUTUN_YERLESIM: Readonly<Record<string, SutunYerlesimi>> = {
  scene: { sutun: 'tam', girinti: 0, buyukHarf: true, hiza: 'sol' },
  action: { sutun: 'sol', girinti: 0, buyukHarf: false, hiza: 'sol' },
  /* Geçiş sol sütunda ve SAĞA yaslı — Amerikan yerleşimde de sağa
     yaslıdır ve bu görüntü tarafına ait bir yönergedir. */
  transition: { sutun: 'sol', girinti: 0, buyukHarf: true, hiza: 'sag' },
  character: { sutun: 'sag', girinti: 8, buyukHarf: true, hiza: 'sol' },
  parenthetical: { sutun: 'sag', girinti: 4, buyukHarf: false, hiza: 'sol' },
  dialogue: { sutun: 'sag', girinti: 0, buyukHarf: false, hiza: 'sol' },
};

/** Bu belgede yazılabilen bloklar — Amerikan çekirdeğinin ta kendisi. */
export const IKI_SUTUN_BLOKLARI = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
] as const;

export function yerlesim(tip: string): SutunYerlesimi {
  /* Bilinmeyen blok SESSİZCE bir sütuna düşmüyor: hangi sütunda duracağı
     belirsiz bir metin, kullanıcının göremediği bir yere yazılır. */
  const y = IKI_SUTUN_YERLESIM[tip];
  if (!y) throw new Error(`Iki sutunlu yerlesimde tanimsiz blok: ${tip}`);
  return y;
}

/**
 * Girdi — her biri TEK SÜTUNDA yaşar (sahne başlığı hariç, o yayılır).
 *
 * ## Yerleşim DÜZELTİLDİ (2026-08-26, kullanıcının referansı bağlayıcı)
 *
 * Önceki model görüntü ve sesi YAN YANA, aynı hizadan başlayan bir "satır
 * çifti" olarak kuruyordu. Referans örnek (senaryonline.com) böyle DEĞİL
 * ve bu önceki oturumda ölçülmüştü de — ölçüm notu aynen "örnek satır
 * çifti kurmuyor" diyor ama sapma "spec lehine" çözülmüştü. Yanlış
 * karardı: biçimi tanımlayan şey spec metni değil, basılan belgedir.
 *
 * DOĞRU YERLEŞİM: girdiler tek bir dikey akışta sıralanır. Her girdi
 * kendi sütununda durur ve BİR SONRAKİ girdi, öncekinin bittiği satırdan
 * başlar — hangi sütunda olduğuna bakılmaksızın.
 */
export interface CiftGirdi {
  id: string;
  /** Amerikan formatla AYNI blok tipleri; yerleşim tablosu sütunu seçer. */
  tip: string;
  metin: string;
}

export interface CiftSatir {
  /** Satırı üreten girdinin kalıcı kimliği (F0). */
  ciftId: string;
  tip: CiftGirdi['tip'];
  /** Girdinin kaçıncı satırı. Ayırıcı boş satır için negatiftir. */
  satirIndex: number;
  /** Sol sütun (görüntü). Sahne başlığında TÜM genişliği kullanır. */
  sol: string;
  /** Sağ sütun (ses). Sahne başlığında her zaman boştur. */
  sag: string;
}

export interface CiftSayfa {
  no: number;
  satirlar: CiftSatir[];
}

/**
 * Bir girdinin kapladığı satırlar — sayfa sınırından bağımsız.
 *
 * Sütun ve girinti YERLEŞİM TABLOSUNDAN geliyor; burada blok adına göre
 * dallanan bir mantık yok. Yeni bir blok eklendiğinde tabloya yazmak
 * yeterli, üstelik unutulursa `yerlesim()` AÇIKÇA fırlıyor.
 */
export function girdiSatirlari(girdi: CiftGirdi, profil: FormatProfili): CiftSatir[] {
  const y = yerlesim(girdi.tip);
  /* Bölünme PROFİLDEN, modül sabitinden değil: kullanıcı sütun oranını
     değiştirdiğinde ekran, sayfalayıcı ve PDF aynı sayıyı görmeli. */
  const bolunme = profil.ikiSutun;
  const genislik =
    y.sutun === 'tam' ? IZGARA.sutun
    : (y.sutun === 'sol' ? bolunme.sol : bolunme.sag) - y.girinti;

  const metin = y.buyukHarf ? buyut(girdi.metin, profil.dil) : girdi.metin;
  const bosluk = ' '.repeat(y.girinti);

  return sarmala(metin, genislik).map((m, i) => {
    /* Sağa yaslama (geçiş) sütunun İÇİNDE yapılıyor — sütunun kendisi
       ızgarada sabit, yaslama yalnız o hücrenin işi. */
    const govde = y.hiza === 'sag' ? m.padStart(genislik) : m;
    const hucre = bosluk + govde;
    return {
      ciftId: girdi.id,
      tip: girdi.tip,
      satirIndex: i,
      sol: y.sutun === 'sag' ? '' : hucre,
      sag: y.sutun === 'sag' ? hucre : '',
    };
  });
}

/**
 * Girdi bazlı sayfalama.
 *
 * Bir GİRDİ BÖLÜNMEZ: sayfada kalan yere sığmıyorsa tümü sonraki sayfaya
 * geçer. Tek istisna, tek başına bir sayfaya bile sığmayan çifttir — bkz.
 * aşağıdaki muhafız.
 */
export function sayfalaIkiSutun(
  girdiler: readonly CiftGirdi[],
  profil: FormatProfili,
): CiftSayfa[] {
  const sayfalar: CiftSayfa[] = [];
  let mevcut: CiftSatir[] = [];

  const kapat = () => {
    sayfalar.push({ no: sayfalar.length + 1, satirlar: mevcut });
    mevcut = [];
  };

  for (const girdi of girdiler) {
    const govde = girdiSatirlari(girdi, profil);
    const ayirac: CiftSatir = {
      ciftId: girdi.id, tip: girdi.tip, satirIndex: -1, sol: '', sag: '',
    };

    /* Çift sayfaya sığmıyorsa TÜMÜ sonraki sayfaya geçer — sayfa burada,
       satırları itmeden ÖNCE kapanır. */
    /* Ayırıcı SAYILIYOR (`+ 1`): koşul zaten `mevcut.length > 0` istiyor,
       yani sayfa başı dalı buraya hiç düşmüyordu — üçlünün sıfır dalı
       erişilemezdi ve mutasyonu hayatta kalıyordu. */
    const gerekli = AYIRICI_SATIR + govde.length;
    if (mevcut.length > 0 && mevcut.length + gerekli > IZGARA.satir) kapat();

    // Sayfa başındaki ayırıcı YUTULUR — sayfa boş satırla başlamaz.
    const parcalar = mevcut.length === 0 ? govde : [ayirac, ...govde];
    for (const s of parcalar) {
      /* SAYFADAN UZUN ÇİFT. Boş sayfaya bile sığmayan bir çift "sonraki
         sayfaya geç" kuralıyla ÇÖZÜLEMEZ: kural onu sonsuza kadar
         erteler ya da satırlar sayfayı taşırıp sessizce kaybolur. Böyle bir
         çift bölünür — bölünmezlik, bölünmemenin MÜMKÜN olduğu yerde
         geçerli bir sözdür. */
      if (mevcut.length >= IZGARA.satir) kapat();
      mevcut.push(s);
    }
  }

  kapat();
  return sayfalar;
}

/* ------------------------------------------------------------------ */
/* Süre                                                                */
/* ------------------------------------------------------------------ */

/**
 * Süre ayarı. `kelimeHizi` KALİBRE EDİLMEMİŞSE `null`'dır.
 *
 * §6.6: "Katsayı kalibre edilmeden süre gösterilmez — yanlış süre göstermek
 * hiç göstermemekten kötüdür." Varsayılan bir sayı koymak (ör. 150 kel/dk)
 * tam olarak bu yasağı çiğnerdi: kullanıcı uydurulmuş bir katsayıyı ölçülmüş
 * sanır ve süreye göre plan yapar.
 */
export interface SureAyari {
  /** Dakikada okunan kelime. Ölçülmemişse `null`. */
  kelimeHizi: number | null;
}

/**
 * Konuşulan kelime sayısı — YALNIZ diyalog.
 *
 * Karakter adı ve parantez SÖYLENMEZ: biri kimin konuştuğunu, öteki nasıl
 * konuştuğunu söyler. Onları saymak süreyi şişirirdi. Sol sütun (aksiyon,
 * geçiş) da katkı vermez — ekranda zaman almazlar.
 */
export function sesKelimeSayisi(girdiler: readonly CiftGirdi[]): number {
  let n = 0;
  for (const g of girdiler) {
    if (g.tip !== 'dialogue') continue;
    n += g.metin.trim().split(/\s+/).filter(Boolean).length;
  }
  return n;
}

/**
 * KELİME HIZI — kalibre edildi (2026-08-26).
 *
 * §6.6 "katsayı kalibre edilmeden süre gösterilmez" diyordu ve gösterilmiyordu.
 * Katsayı artık uydurma değil ÖLÇÜLMÜŞ bir büyüklükten geliyor: Türkçe normal
 * konuşma hızı 125–175 kelime/dakika; profesyonel seslendirmenin fiilî
 * ortalaması saniyede 2,5 kelime, yani **dakikada 150**. İki bağımsız kaynak
 * aynı sayıda buluşuyor.
 *
 * Sınırlar da veridir: 120'nin altı ve 200'ün üstü seslendirmede olağan
 * değil ve arayüz sürgüsü o aralıkta duruyor. Aralık dışı bir değer
 * kullanıcının yazdığı süreyi değil, programın güvenilirliğini bozar.
 *
 * ⚠ Tavan: bu bir SESLENDİRME hızı. Hızlı replikleşen bir diyalog ya da
 * ağır bir belgesel anlatımı bundan sapar; sayı bir tahmindir ve arayüz onu
 * "~" ile gösteriyor. Kesin süre ancak okunarak ölçülür.
 */
export const VARSAYILAN_KELIME_HIZI = 150;
export const EN_AZ_KELIME_HIZI = 120;
export const EN_COK_KELIME_HIZI = 200;

/**
 * Saniye cinsinden süre. Hız `null` ise `null` — ÇAĞIRAN HİÇBİR ŞEY GÖSTERMEZ.
 *
 * `null` yolu KALDIRILMADI: kalibrasyon bir varsayılan verdi ama kullanıcı
 * hızı bilerek kapatabilmeli. Yanlış süre göstermek hiç göstermemekten kötü
 * ve bu cümle kalibrasyondan sonra da geçerli.
 *
 * Bu yerleşimde sayfa=dakika sözleşmesi geçersizdir (§6.6): sayfa sayısı
 * görüntü sütununun uzunluğuna da bağlıdır ve görüntü betimi ekranda zaman
 * almaz.
 */
export function sureTahmini(
  girdiler: readonly CiftGirdi[],
  ayar: SureAyari,
): number | null {
  if (ayar.kelimeHizi === null) return null;
  if (!Number.isFinite(ayar.kelimeHizi) || ayar.kelimeHizi <= 0) {
    /* Sıfır ya da negatif hız sonsuz/negatif süre üretir. Güven sınırı:
       katsayı kullanıcı ayarından ya da profil dosyasından geliyor. */
    throw new Error(`Kelime hızı pozitif olmalı: ${ayar.kelimeHizi}`);
  }
  return (sesKelimeSayisi(girdiler) / ayar.kelimeHizi) * 60;
}
