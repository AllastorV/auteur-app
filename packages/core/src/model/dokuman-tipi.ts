import type { ScriptBlockType } from './script';

/**
 * Doküman tipleri — §13.2 / F7.
 *
 * ## Neden tek `ScriptBlock`, tipe göre ayrı model değil
 *
 * Kullanıcı bir metni roman olarak başlatıp senaryoya çevirebilmeli ve o
 * dönüşümde METNİNİ KAYBETMEMELİ. Ayrı modeller olsaydı dönüşüm bir içe
 * aktarma olurdu ve her içe aktarma kayıp riskidir. Blok tipi tek bir
 * birlikte duruyor; doküman tipi yalnız HANGİ bloklara izin verildiğini ve
 * onların nasıl dizileceğini söylüyor.
 *
 * ## Neden "izin verilen bloklar" bir liste
 *
 * Menüde roman bloğu gören bir senaryo yazarı onu seçer ve profilde karşılığı
 * olmadığı için sayfalayıcı fırlatır. Liste hem menüyü hem doğrulamayı
 * besliyor — tek kaynak.
 */

export type DokumanTipiAdi =
  | 'senaryo'
  | 'dizi'
  | 'sahne-oyunu'
  | 'radyo-oyunu'
  | 'roman'
  | 'cizgi-roman'
  | 'duz-metin'
  | 'goruntu-ses'
  | 'fon-dosyasi';

export interface DokumanTipi {
  id: DokumanTipiAdi;
  ad: string;
  /**
   * Tek satırlık açıklama: tipin ADI değil, SAYFASI ne demek.
   *
   * "Roman" adı bir kategoridir; seçen kişinin sorduğu soru ise "seçersem
   * yerleşim ne olacak". Açıklama o soruyu yanıtlar ve tanım yeri burasıdır
   * — `t()` ile SARILMAZ, kullanan bileşen sarar (`SEKME_ADLARI` kalıbı).
   */
  aciklama: string;
  /** Bu tipte yazılabilen bloklar; sıra menü sırasıdır. */
  bloklar: readonly ScriptBlockType[];
  /** Yeni bir belge bu blokla başlar. */
  varsayilanBlok: ScriptBlockType;
  /**
   * Yapı birimi: gezginin ve analizin "bölüm" dediği şey.
   * Senaryoda sahne, romanda bölüm, çizgi romanda sayfa.
   */
  yapiBlogu: ScriptBlockType;
  yapiAdi: string;
  /**
   * §6.2'nin "1 sayfa ≈ 1 dakika" sözleşmesi bu tipte GEÇERLİ mi.
   *
   * Romanda ve düz metinde değil: sayfa süreyi ölçmez. Yanlış yerde
   * göstermek, yazara olmayan bir bilgi vermek olurdu (§6.6'da Fransız
   * yerleşimi için verilen kararın aynısı).
   */
  sayfaDakika: boolean;
  /**
   * Belge İKİ SÜTUNLU mu (§6.6 — "Fransız yerleşim").
   *
   * Bu bir marj varyasyonu değil, ikinci bir belge türüdür: birimi satır
   * değil ÇİFT, sayfalayıcısı ayrı (`sayfalaIkiSutun`), editörü ayrı.
   * Bayrak burada duruyor ki çağıranlar tipin ADINA bakmak zorunda
   * kalmasın — `tip.id === 'goruntu-ses'` karşılaştırması yarın ikinci bir
   * iki sütunlu tip eklendiğinde sessizce eksik kalırdı.
   */
  ikiSutun?: boolean;
  /**
   * Bu belge SIFIRDAN değil, başka bir belgeden TÜRETİLEREK kurulur.
   *
   * Fon başvuru dosyası böyle: bölümleri kurumun ek listesinden, taslakları
   * senaryodan geliyor. "Yeni proje" penceresinde boş bir kart olarak
   * durmasının anlamı yok — orada seçilse kullanıcı bomboş bir belge alır
   * ve özelliğin ne olduğunu hiç görmez. Kurulum yolu tek: açık senaryodan
   * "Bu senaryodan fon dosyası oluştur".
   */
  turetilen?: boolean;
}

const senaryoBloklari = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
] as const;

/**
 * Kayıt defteri.
 *
 * `Record` tam olmak zorunda: `DokumanTipiAdi`'na yeni bir tip eklenip
 * buraya yazılmazsa DERLEME kırılır. Sessizce eksik kalan bir tip, menüde
 * görünmeyen ama dosyada duran bir belge demek olurdu.
 */
export const DOKUMAN_TIPLERI: Readonly<Record<DokumanTipiAdi, DokumanTipi>> = {
  senaryo: {
    id: 'senaryo', ad: 'Senaryo',
    aciklama: 'Amerikan tek sütun: sahne başlığı, tam genişlik aksiyon, ortada dar diyalog sütunu.',
    bloklar: senaryoBloklari,
    varsayilanBlok: 'action', yapiBlogu: 'scene', yapiAdi: 'Sahne',
    sayfaDakika: true,
  },
  dizi: {
    id: 'dizi', ad: 'Dizi bölümü',
    aciklama: 'Senaryonun aynısı; üstünde bölüm katmanı var, gezgin ve analiz bölümle sayar.',
    /* Diziyi senaryodan ayıran şey blok kümesi değil YAPI: bölüm (`bolum`)
       sahnelerin üstünde bir katman. Ayrı bir blok kümesi uydurmak, aynı
       formatı iki kez tanımlamak olurdu (Karar 2). */
    bloklar: ['bolum', ...senaryoBloklari],
    varsayilanBlok: 'action', yapiBlogu: 'bolum', yapiAdi: 'Bölüm',
    sayfaDakika: true,
  },
  'sahne-oyunu': {
    id: 'sahne-oyunu', ad: 'Sahne oyunu',
    aciklama: 'Perde ve sahne. Aksiyonun yerinde sahne yönergesi — oyuncuya verilen yönerge, kameranın gördüğü değil.',
    /* Aksiyon yerine SAHNE YÖNERGESİ: tiyatroda yazılan şey kameranın
       gördüğü değil, oyuncuya verilen yönergedir ve italik dizilir. */
    bloklar: ['bolum', 'scene', 'sahne-yonergesi', 'character', 'parenthetical', 'dialogue'],
    varsayilanBlok: 'sahne-yonergesi', yapiBlogu: 'bolum', yapiAdi: 'Perde',
    sayfaDakika: true,
  },
  'radyo-oyunu': {
    id: 'radyo-oyunu', ad: 'Radyo oyunu',
    aciklama: 'Ses ve müzik ayrı bloklar; aranabilir ve sayılabilir. Anlatının yarısı onlarda kurulur.',
    /* Ses ve müzik AYRI bloklar: radyoda anlatının yarısı onlarla kuruluyor
       ve aksiyonun içine gömülselerse ne aranabilir ne sayılabilirlerdi. */
    bloklar: ['scene', 'ses', 'muzik', 'character', 'parenthetical', 'dialogue'],
    varsayilanBlok: 'dialogue', yapiBlogu: 'scene', yapiAdi: 'Sahne',
    sayfaDakika: true,
  },
  roman: {
    id: 'roman', ad: 'Roman',
    aciklama: 'Bölüm ve paragraf; ilk satır girintili. Sayfa burada süre ölçmez.',
    bloklar: ['bolum', 'paragraf', 'dialogue'],
    varsayilanBlok: 'paragraf', yapiBlogu: 'bolum', yapiAdi: 'Bölüm',
    /* Romanda sayfa SÜREYİ ölçmez; göstermek yazara olmayan bir bilgi
       vermek olurdu. */
    sayfaDakika: false,
  },
  'cizgi-roman': {
    id: 'cizgi-roman', ad: 'Çizgi roman',
    aciklama: 'Sayfa, kare, balon. Yapı birimi sahne değil sayfadır.',
    /* Çizgi romanda yapı birimi SAYFA: kare sayfanın içinde, balon karenin
       içinde. Sahne diye bir birim yok — olsaydı sayfa sayısı ile anlatı
       birimi birbirinden kopardı. */
    bloklar: ['sayfa', 'kare', 'altyazi', 'character', 'balon'],
    varsayilanBlok: 'kare', yapiBlogu: 'sayfa', yapiAdi: 'Sayfa',
    sayfaDakika: false,
  },
  'duz-metin': {
    id: 'duz-metin', ad: 'Düz metin',
    aciklama: 'Tek blok: paragraf. Biçim dayatmayan boş sayfa — not, tretman, sinopsis.',
    bloklar: ['paragraf'],
    varsayilanBlok: 'paragraf', yapiBlogu: 'paragraf', yapiAdi: 'Paragraf',
    sayfaDakika: false,
  },
  /**
   * FRANSIZ (İKİ SÜTUN) — §6.6.
   *
   * Ad "Fransız (iki sütun)" biçiminde yazılıyor, yalın "Fransız" değil:
   * Fransa'da yazılan uzun metraj senaryosu (continuité dialoguée) TEK
   * sütunludur ve bununla ilgisi yoktur; ad benzerliği Türkçe kullanımdan
   * gelir ve spec bu ayrımı açıkça istiyor.
   *
   * `bloklar` AMERİKAN ÇEKİRDEĞİNİN AYNISI (kullanıcı kararı: "Amerikan
   * formattaki presetler burada da olsun"). Değişen şey blok tipleri değil,
   * YERLEŞİM: aksiyon ve geçiş sol sütuna, karakter/parantez/diyalog sağ
   * sütuna, sahne başlığı ikisine birden düşüyor
   * (`IKI_SUTUN_YERLESIM`). Ayrı bir tip kümesi uydurmak aynı kavramı iki
   * adla anlatmak olurdu ve belgeyi tek sütuna çevirmek blokları yeniden
   * yazmayı gerektirirdi.
   *
   * Sayfa=dakika GEÇERSİZ: sayfa sayısı görüntü sütununun uzunluğuna da
   * bağlı ve görüntü betimi ekranda zaman almaz.
   */
  /**
   * FON BAŞVURU DOSYASI — ayrı belge, senaryonun içinde bölüm DEĞİL
   * (kullanıcı kararı 2026-09-01).
   *
   * Blok kümesi bilerek en dar olanı: bölüm + paragraf. Kurumun ek listesi
   * bölüm başlıklarını veriyor, gövde düz paragraf. Yeni bir blok tipi
   * uydurmak (`fon-basligi` gibi) aynı kavramı ikinci bir adla anlatmak
   * olurdu — roman ve düz metin zaten bu ikiliyle yazılıyor.
   *
   * `sayfaDakika` FALSE: sayfa burada süre değil, kurumun sınırı. Eurimages
   * "sinopsis en fazla 3 sayfa" diyor ve o sayfa aynı sayfalayıcıdan
   * ölçülüyor — ikinci bir ölçüm kurulmuyor (Karar 2).
   */
  'fon-dosyasi': {
    id: 'fon-dosyasi', ad: 'Fon başvuru dosyası',
    aciklama: 'Kurumun ek listesi bölüm bölüm kuruluyor; türetilebilenler senaryodan doluyor, gerisini sen yazıyorsun.',
    bloklar: ['bolum', 'paragraf'],
    varsayilanBlok: 'paragraf', yapiBlogu: 'bolum', yapiAdi: 'Bölüm',
    sayfaDakika: false,
    turetilen: true,
  },
  'goruntu-ses': {
    id: 'goruntu-ses', ad: 'Fransız (iki sütun)',
    aciklama: 'İki sütun: solda görüntü, sağda ses. Ayrı sayfalayıcı; birim satır değil satır çifti.',
    bloklar: ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'],
    varsayilanBlok: 'action', yapiBlogu: 'scene', yapiAdi: 'Sahne',
    sayfaDakika: false,
    ikiSutun: true,
  },
};

/** Bilinmeyen tip adı SESSİZCE senaryoya düşmez — çağıran bilmeli. */
export function dokumanTipi(ad: unknown): DokumanTipi | null {
  /* `in` PROTOTİP ZİNCİRİNİ de gezer: `'__proto__' in DOKUMAN_TIPLERI` doğru
     çıkar ve `Object.prototype` doküman tipi diye döner — sonra `tipProfili`
     ondan blok listesi okumaya çalışır. `meta.dokumanTipi` belgeden geliyor,
     yani güven sınırının dışında. Kendi anahtarı sorularak kapatılıyor
     (`format/izgara.ts` ve `format/yazi.ts` ile aynı düzeltme). */
  return typeof ad === 'string' && Object.prototype.hasOwnProperty.call(DOKUMAN_TIPLERI, ad)
    ? DOKUMAN_TIPLERI[ad as DokumanTipiAdi]
    : null;
}

/**
 * Blok bu doküman tipinde yazılabilir mi.
 *
 * İçe aktarma ve tip değişimi bu kapıdan geçiyor: izin verilmeyen blok
 * DÜŞÜRÜLMÜYOR, tipin varsayılan bloğuna çevriliyor — metin kaybolmasın.
 */
export function bloguUyarla(tip: DokumanTipi, blok: ScriptBlockType): ScriptBlockType {
  return tip.bloklar.includes(blok) ? blok : tip.varsayilanBlok;
}
