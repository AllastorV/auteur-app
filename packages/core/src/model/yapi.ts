import type { DokumanTipi } from './dokuman-tipi';
import type { ScriptBlock } from './script';
import type { FormatProfili } from '../format/profil';
import { sayaclar } from '../format/ekran';
import { sayfala } from '../format/sayfala';

/**
 * Tip başına yapı paneli ve istatistik — F7 (§13.1 "Yapı" / "İstatistik" sütunları).
 *
 * Saf: bloklardan yapı birimlerini (senaryoda sahne, romanda bölüm, çizgi
 * romanda sayfa…) ve belge geneli istatistiği üretir. DOM bilmez, sayfalamayı
 * kendisi hesaplamaz — `format/sayfala`'yı ÇAĞIRIR (Karar 34: sayfa sayısı TEK
 * sayfalayıcıdan).
 *
 * ## Sınır: `yapiBlogu === 'scene'` mi değil mi
 *
 * Senaryo/radyo-oyunu/Fransız yerleşimde yapı birimi SAHNE ve sahnenin
 * kalıcı kimliği `sceneId`'dir — bu kural (başlıksız açılış da bir sahnedir,
 * `type === 'scene'` ile bölmek onu bir öncekine yapıştırır) `model/analiz.ts`
 * → `senaryoyuCozumle`'de zaten yazılı; burada AYNI ilke uygulanıyor, ikinci
 * bir yazımı YOK.
 *
 * Bölüm/sayfa/paragraf tipinde ise böyle bir kimlik yok: `reconcileScript`
 * yalnız `type === 'scene'` bloklarında yeni `sceneId` üretir
 * (`model/reconcile.ts`), yani `bolum`/`sayfa`/`paragraf` blokları hep aynı
 * (çoğu zaman boş) kimliği taşır. O tiplerde sınırı BLOK TİPİNİN KENDİSİ
 * çiziyor: `tip.yapiBlogu` tipinde bir blok görülünce yeni birim başlar.
 */

export interface YapiBirimi {
  /** Sahne tipinde `sceneId`, diğerlerinde ilk bloğun kimliği — kalıcı, React key. */
  id: string;
  /** Birimin adı: sahne başlığı / bölüm-sayfa-paragraf bloğunun metni. Yoksa "(başlıksız)". */
  ad: string;
  /** Belgedeki sırası (0'dan). */
  sira: number;
  /** İlk bloğun kimliği — tıklamada `blogaGit` buraya gider. */
  ilkBlokId: string;
  blokSayisi: number;
  kelime: number;
  /** Bu birim TEK BAŞINA sayfalansa kaç sayfa tutar (Karar 34, `sayfala` ile). */
  sayfa: number;
}

export interface YapiIstatistigi {
  birimler: YapiBirimi[];
  toplamBirim: number;
  toplamKelime: number;
  /** Belgenin GERÇEK toplam sayfa sayısı — bütün bloklar tek seferde sayfalanır. */
  toplamSayfa: number;
  /** Ortalama birim uzunluğu (sayfa). Birim yoksa sıfır — `0/0` NaN üretmez. */
  ortalamaSayfa: number;
  enUzun: YapiBirimi | null;
  enKisa: YapiBirimi | null;
}

/** Birimin adı: sahnede başlık, diğer tiplerde sınırı çizen bloğun metni. */
function birimAdi(bloklar: readonly ScriptBlock[], tip: DokumanTipi): string {
  if (tip.yapiBlogu === 'scene') {
    const baslik = bloklar.find((b) => b.type === 'scene')?.text.trim();
    return baslik || '(başlıksız)';
  }
  const ilk = bloklar[0];
  return ilk.type === tip.yapiBlogu && ilk.text.trim() ? ilk.text.trim() : '(başlıksız)';
}

/** Belgeyi doküman tipinin `yapiBlogu`'na göre yapı birimlerine böler. */
export function yapiBirimleriniCikar(
  bloklar: readonly ScriptBlock[],
  tip: DokumanTipi,
  profil: FormatProfili,
): YapiBirimi[] {
  const sahneTabanli = tip.yapiBlogu === 'scene';
  const birimler: YapiBirimi[] = [];
  let mevcut: ScriptBlock[] = [];
  /* Sahne tabanlı tipte sınır AÇILAN birimin sceneId'si sabitlenip her yeni
     blokla karşılaştırılıyor — `senaryoyuCozumle`deki `acik.sceneId !== sceneId`
     ile aynı ilke. */
  let mevcutSceneId = '';

  const kapat = () => {
    if (!mevcut.length) return;
    const ilk = mevcut[0];
    const s = sayaclar(mevcut, profil);
    birimler.push({
      id: sahneTabanli ? ilk.sceneId : ilk.id,
      ad: birimAdi(mevcut, tip),
      sira: birimler.length,
      ilkBlokId: ilk.id,
      blokSayisi: mevcut.length,
      kelime: s.kelime,
      sayfa: s.sayfa,
    });
    mevcut = [];
  };

  for (const blok of bloklar) {
    const yeniBirim = mevcut.length > 0 && (
      sahneTabanli ? blok.sceneId !== mevcutSceneId : blok.type === tip.yapiBlogu
    );
    if (yeniBirim) kapat();
    if (mevcut.length === 0) mevcutSceneId = blok.sceneId;
    mevcut.push(blok);
  }
  kapat();

  return birimler;
}

/** Belge geneli istatistik — F7 §13.1 "İstatistik" sütunu. */
export function yapiIstatistigiCikar(
  bloklar: readonly ScriptBlock[],
  tip: DokumanTipi,
  profil: FormatProfili,
): YapiIstatistigi {
  if (bloklar.length === 0) {
    return {
      birimler: [], toplamBirim: 0, toplamKelime: 0, toplamSayfa: 0,
      ortalamaSayfa: 0, enUzun: null, enKisa: null,
    };
  }

  const birimler = yapiBirimleriniCikar(bloklar, tip, profil);
  /* Belgenin GERÇEK sayfa sayısı: birim sayfalarının TOPLAMI değil — her birim
     kendi başına sayfalandığında yarım sayfalar yukarı yuvarlanır ve toplam
     gerçek sayıdan büyük çıkar. Karar 34 tek sayfalayıcıyı burada da zorluyor:
     bütün bloklar TEK seferde sayfalanıyor. */
  const toplamSayfa = sayfala(bloklar, profil).length;
  const toplamKelime = birimler.reduce((t, b) => t + b.kelime, 0);

  let enUzun: YapiBirimi | null = null;
  let enKisa: YapiBirimi | null = null;
  for (const b of birimler) {
    if (!enUzun || b.sayfa > enUzun.sayfa) enUzun = b;
    if (!enKisa || b.sayfa < enKisa.sayfa) enKisa = b;
  }

  return {
    birimler,
    toplamBirim: birimler.length,
    toplamKelime,
    toplamSayfa,
    /* Bölme SIFIRA karşı korunmuyor çünkü korunacak bir durum yok: döngü
       `bloklar`daki HER bloğu `mevcut`a itiyor ve `kapat()` sonda kayıtsız
       çağrılıyor, yani `bloklar.length > 0` iken `birimler.length` asla sıfır
       olamaz (yukarıdaki erken dönüş zaten TEK sıfır-birim durumunu, boş
       `bloklar`ı, kapatıyor). NaN tuzağı (`pay` alanındaki gibi) buraya hiç
       ulaşmıyor — sahte bir muhafız mutasyon testinde ASLA kırmızı dönmezdi.  */
    ortalamaSayfa: toplamSayfa / birimler.length,
    enUzun,
    enKisa,
  };
}
