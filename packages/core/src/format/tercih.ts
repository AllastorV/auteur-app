import type { DilAdi } from './profil';
import { sayfaRengiCoz, VARSAYILAN_SAYFA_RENGI, type SayfaRengi } from './sayfa-rengi';
import {
  VARSAYILAN_NUMARA, VARSAYILAN_SURE,
  type NumaraAyari, type NumaraKenari, type SureAyari, type SureYontemi,
} from './senaryo-ayarlari';
import type { KagitAdi } from './izgara';
import type { BlokPreseti, PresetTablosu } from './preset';
import { YAZI_TIPLERI, type YaziTipiAdi } from './yazi';
import {
  EN_AZ_KELIME_HIZI, EN_COK_KELIME_HIZI, IKI_SUTUN,
  VARSAYILAN_KELIME_HIZI, bolunmeyiKur,
} from './iki-sutun';
import { BLOK_TIPLERI, type ScriptBlockType } from '../model/script';
import { arayuzDili } from '../dil/arayuz';

/**
 * KULLANICI FORMAT PROFİLİ — kağıt, dil ve yazım presetleri (§16.3).
 *
 * > "Preset değişiklikleri format profiline yazılır, PROJEYE değil — böylece
 * > bir yazarın tercihi bütün projelerinde geçerli olur, ama teslim formatı
 * > bozulmaz."
 *
 * Böyle bir depo yoktu: seçim `ui` mağazasında oturumla sınırlıydı ve her
 * açılışta sıfırlanıyordu (§17 borcu). Kağıdını A4 yapan bir yazar programı
 * her açtığında Letter buluyordu.
 *
 * **PROJEYE YAZILMAZ.** Doküman tipi projenin bir özelliğidir (ortak çalışan
 * da aynı tipi görmeli), ama kağıt ve dil YAZARIN tercihidir: aynı senaryoyu
 * açan iki kişiden birinin A4 sevmesi ötekinin ekranını değiştirmemeli.
 *
 * **Depo `localStorage`.** Hem Electron renderer'ında hem tarayıcıda var,
 * yani tek uygulama iki kabukta da çalışıyor ve ne yeni bir IPC yolu ne de
 * yeni bir dosya biçimi gerekiyor.
 *
 * ⚠ Tavan: tercihler makineler arasında SENKRONLANMAZ ve site verisi
 * temizlenirse gider. Format tercihi için kabul edilebilir — kaybı bir
 * seçimi yeniden yapmaktır, metin değil. §15'in koruduğu şey metindir ve o
 * buraya hiç uğramıyor.
 */

export interface FormatTercihi {
  kagit: KagitAdi;
  dil: DilAdi;
  presetler: PresetTablosu;
  /**
   * Senaryo DIŞI tiplerde kullanılacak yazı tipi.
   *
   * Senaryo ailesinde yok sayılır — orada yazı kilitli (`yaziKilitli`) ve
   * tercihin onu ezmesine izin verilseydi kilit yalnız arayüzde kalırdı.
   */
  yazi: YaziTipiAdi;
  /**
   * İki sütunlu belgede SOL sütunun genişliği (§6.6).
   *
   * Ayar çünkü ölçülecek tek bir doğru YOK: iki sütunlu AV senaryosunun
   * sütun oranı için yayımlanmış bir standart bulunmuyor, kaynakların ortak
   * ifadesi biçimin esnek olduğu. Varsayımı ölçüm gibi göstermek yerine
   * karar kullanıcıya bırakıldı.
   */
  solSutun: number;
  /**
   * Seslendirme hızı, kelime/dakika. `null` ise süre GÖSTERİLMEZ.
   *
   * `null` yolu kalibrasyondan sonra da duruyor: yanlış süre göstermek hiç
   * göstermemekten kötü ve kullanıcı hızı bilerek kapatabilmeli.
   */
  kelimeHizi: number | null;
  /**
   * Senaryo sayfasinin EKRAN rengi (4 sabit secenek). YALNIZ gorunum:
   * disa aktarim her zaman beyaz zemine siyah yazi (bkz. format/sayfa-rengi).
   */
  sayfaRengi: SayfaRengi;
  /** Akıllı yazım düzeltmeleri paketi (bkz. editor/akilli-duzeltme.ts). */
  akilliDuzeltme: boolean;
  /** Daktilo modu: imleç ortada + satır vurgusu + paragraf odağı. */
  daktiloModu: boolean;
  /** Arayüz ölçeği, 0.8–1.5 arası. */
  arayuzOlcegi: number;
  numaraAyari: NumaraAyari;
  sayfaSonuSurekliligi: boolean;
  sureAyari: SureAyari;
  /**
   * Zaman damgası otoritesinin adresi. Boşsa `VARSAYILAN_TSA`.
   *
   * Bir FORMAT tercihi değil ama BURADA: bu dosya §16.3'ün istediği tek
   * KULLANICI düzeyi profil ve ikinci bir tercih evi açmak, hangisinin
   * hangi ayarı tuttuğunu iki yerde sormak olurdu (Karar 2). Kurumsal ya
   * da hukuki bir TSA kullanan yazar adresi bir kez yazsın diye kalıcı.
   */
  tsaUrl: string;
}

export const VARSAYILAN_TERCIH: FormatTercihi = {
  kagit: 'letter',
  /* KAYITLI TERCİH YOKSA belge dili ARAYÜZ dilini izler. Sabit `'tr'` idi:
     İngilizce arayüzle açılan yeni bir kullanıcının ilk senaryosu Türkçe
     terimlerle ve Türkçe büyük harfle (`İNT. STATİON — NİGHT`) başlıyordu —
     tanıtım videosunda bile görünüyordu. Getter, çünkü arayüz dili
     çalışma zamanında değişebilir; açıkça seçilmiş bir dil (`o.dil`)
     her zaman önceliklidir. */
  get dil(): DilAdi { return arayuzDili(); },
  presetler: {},
  /* Varsayılan Tinos: roman ve düz metnin el yazması standardı Times'tır ve
     Tinos onunla metrik uyumlu. Courier varsayılan olsaydı yeni bir roman
     sektörün beklemediği bir sayfa sayısıyla açılırdı. */
  yazi: 'tinos',
  solSutun: IKI_SUTUN.sol,
  /* KALİBRE EDİLDİ: Türkçe profesyonel seslendirmenin fiilî ortalaması
     dakikada 150 kelime (saniyede 2,5). Bkz. `VARSAYILAN_KELIME_HIZI`. */
  kelimeHizi: VARSAYILAN_KELIME_HIZI,
  sayfaRengi: VARSAYILAN_SAYFA_RENGI,
  /* Akıllı düzeltmeler AÇIK: yazarken metni iyileştiren, geri alınabilir
     ve sektör biçimine yaklaştıran kurallar — kapalı gelseydi çoğu
     kullanıcı varlığını hiç öğrenmezdi. */
  akilliDuzeltme: true,
  /* Daktilo modu KAPALI: ekranın kaydırma davranışını değiştiriyor ve
     beklemeyen kullanıcı için rahatsız edici — isteyen açar. */
  daktiloModu: false,
  arayuzOlcegi: 1,
  numaraAyari: VARSAYILAN_NUMARA,
  /* KAPALI: açık gelseydi mevcut projelerin sayfa sayısı kendiliğinden
     kayardı (bkz. sayfala.ts `surekli` parametresi). */
  sayfaSonuSurekliligi: false,
  sureAyari: VARSAYILAN_SURE,
  /* BOŞ: `kanit/rfc3161.ts`teki varsayılan adres kullanılsın. Adresi
     buraya kopyalamak aynı değeri iki yerde tutmak olurdu. */
  tsaUrl: '',
};

/** Arayüz ölçeği sınırları — altında okunmaz, üstünde araç çubuğu taşar. */
export const OLCEK_EN_AZ = 0.8;
export const OLCEK_EN_COK = 1.5;

const ANAHTAR = 'mizansen.format.v1';

const KAGITLAR = new Set<string>(['letter', 'a4']);
const DILLER = new Set<string>(['tr', 'en']);
const HIZALAR = new Set<string>(['sol', 'orta', 'sag']);

/**
 * Presetin GÜVENLİ alanları. `yaziTipi`, `punto`, `satirAraligi` BİLİNÇLİ
 * OLARAK YOK: onlar `presetUygula` tarafından zaten reddediliyor ve depodan
 * geri okunmaları, reddedilecek bir değeri her açılışta diriltip kullanıcıya
 * her seferinde aynı red gerekçesini göstermek olurdu.
 */
function presetOku(ham: unknown): BlokPreseti | null {
  if (typeof ham !== 'object' || ham === null) return null;
  const g = ham as Record<string, unknown>;
  const p: BlokPreseti = {};
  for (const alan of ['kalin', 'italik', 'buyukHarf', 'yeniSayfada'] as const) {
    if (typeof g[alan] === 'boolean') p[alan] = g[alan] as boolean;
  }
  if (typeof g.hiza === 'string' && HIZALAR.has(g.hiza)) p.hiza = g.hiza as BlokPreseti['hiza'];
  for (const alan of ['oncekiBosSatir', 'solMm', 'sagMm'] as const) {
    const v = g[alan];
    if (typeof v === 'number' && Number.isFinite(v)) p[alan] = v;
  }
  /* Boş preset SAKLANMAZ: tablo `Partial` ve boş bir girdi ile girdinin hiç
     olmaması aynı şey. İkisini de tutmak "kullanıcı bu bloğa dokundu mu"
     sorusuna iki farklı cevap üretirdi. */
  return Object.keys(p).length ? p : null;
}

/**
 * Ham metni tercihe çevirir — GÜVEN SINIRI.
 *
 * `localStorage` kullanıcının elinde: elle düzenlenebilir, eski bir sürümden
 * kalmış olabilir, başka bir uygulama yazmış olabilir. Tanınmayan her şey
 * VARSAYILANA düşer, fırlatmaz: tercih dosyası bozuk diye program açılmamak
 * çok ağır bir ceza olurdu. Ama sessizce YANLIŞ değeri kullanmak da yok —
 * tanınmayan değer kullanılmıyor, varsayılan kullanılıyor.
 */
/* Güven sınırı: depo kullanıcının elinde, tanınmayan her şey varsayılana. */
const KENARLAR: readonly NumaraKenari[] = ['kapali', 'sol', 'sag', 'ikisi'];
const YONTEMLER: readonly SureYontemi[] = ['sayfa', 'karakter', 'ozel'];

function numaraCoz(ham: unknown): NumaraAyari {
  const o = (ham ?? {}) as Record<string, unknown>;
  return {
    sahne: KENARLAR.includes(o.sahne as NumaraKenari)
      ? (o.sahne as NumaraKenari) : VARSAYILAN_NUMARA.sahne,
    diyalog: typeof o.diyalog === 'boolean' ? o.diyalog : VARSAYILAN_NUMARA.diyalog,
  };
}

/** Sayı alanları POZİTİF olmalı: sıfır ya da eksi süre saçma sonuç verir. */
function sayiCoz(deger: unknown, varsayilan: number): number {
  return typeof deger === 'number' && Number.isFinite(deger) && deger > 0 ? deger : varsayilan;
}

function sureCoz(ham: unknown): SureAyari {
  const o = (ham ?? {}) as Record<string, unknown>;
  return {
    yontem: YONTEMLER.includes(o.yontem as SureYontemi)
      ? (o.yontem as SureYontemi) : VARSAYILAN_SURE.yontem,
    sayfaSaniye: sayiCoz(o.sayfaSaniye, VARSAYILAN_SURE.sayfaSaniye),
    karakterSayisi: sayiCoz(o.karakterSayisi, VARSAYILAN_SURE.karakterSayisi),
    karakterSaniye: sayiCoz(o.karakterSaniye, VARSAYILAN_SURE.karakterSaniye),
    ozelSahne: sayiCoz(o.ozelSahne, VARSAYILAN_SURE.ozelSahne),
    ozelAksiyon: sayiCoz(o.ozelAksiyon, VARSAYILAN_SURE.ozelAksiyon),
    ozelDiyalog: sayiCoz(o.ozelDiyalog, VARSAYILAN_SURE.ozelDiyalog),
  };
}

export function tercihiCoz(ham: string | null): FormatTercihi {
  if (!ham) return VARSAYILAN_TERCIH;
  let g: unknown;
  try {
    g = JSON.parse(ham);
  } catch {
    return VARSAYILAN_TERCIH;
  }
  if (typeof g !== 'object' || g === null) return VARSAYILAN_TERCIH;
  const o = g as Record<string, unknown>;

  const presetler: PresetTablosu = {};
  if (typeof o.presetler === 'object' && o.presetler !== null) {
    for (const [tip, ham2] of Object.entries(o.presetler as Record<string, unknown>)) {
      /* Blok tipi de doğrulanıyor: tanınmayan anahtar `sayfala`'ya kadar
         gider ve orada AÇIKÇA fırlar — tercih dosyasından gelen bir çöp
         yüzünden belge açılamaz olurdu. */
      if (!BLOK_TIPLERI.has(tip)) continue;
      const p = presetOku(ham2);
      if (p) presetler[tip as ScriptBlockType] = p;
    }
  }

  return {
    kagit: typeof o.kagit === 'string' && KAGITLAR.has(o.kagit)
      ? (o.kagit as KagitAdi) : VARSAYILAN_TERCIH.kagit,
    dil: typeof o.dil === 'string' && DILLER.has(o.dil)
      ? (o.dil as DilAdi) : VARSAYILAN_TERCIH.dil,
    presetler,
    yazi: typeof o.yazi === 'string' && o.yazi in YAZI_TIPLERI
      ? (o.yazi as YaziTipiAdi) : VARSAYILAN_TERCIH.yazi,
    /* `bolunmeyiKur` ızgaraya oturtuyor: depodan gelen bir çöp değer sayfayı
       taşırır ya da boş bırakır ve sayfa sayısı yalan söylerdi. */
    solSutun: typeof o.solSutun === 'number' && Number.isFinite(o.solSutun)
      ? bolunmeyiKur(o.solSutun).sol : VARSAYILAN_TERCIH.solSutun,
    /* Aralık dışı hız kullanıcının yazdığını değil programın güvenilirliğini
       bozar; `null` (kapalı) bilinçli bir seçim, o yüzden korunuyor. */
    kelimeHizi: o.kelimeHizi === null ? null
      : typeof o.kelimeHizi === 'number' && Number.isFinite(o.kelimeHizi)
        ? Math.max(EN_AZ_KELIME_HIZI, Math.min(EN_COK_KELIME_HIZI, Math.round(o.kelimeHizi)))
        : VARSAYILAN_TERCIH.kelimeHizi,
    sayfaRengi: sayfaRengiCoz(o.sayfaRengi),
    akilliDuzeltme: typeof o.akilliDuzeltme === 'boolean'
      ? o.akilliDuzeltme : VARSAYILAN_TERCIH.akilliDuzeltme,
    daktiloModu: typeof o.daktiloModu === 'boolean'
      ? o.daktiloModu : VARSAYILAN_TERCIH.daktiloModu,
    /* Aralık dışı ölçek arayüzü kullanılamaz hâle getirirdi — kıskaçlanıyor. */
    arayuzOlcegi: typeof o.arayuzOlcegi === 'number' && Number.isFinite(o.arayuzOlcegi)
      ? Math.max(OLCEK_EN_AZ, Math.min(OLCEK_EN_COK, o.arayuzOlcegi))
      : VARSAYILAN_TERCIH.arayuzOlcegi,
    numaraAyari: numaraCoz(o.numaraAyari),
    sayfaSonuSurekliligi: typeof o.sayfaSonuSurekliligi === 'boolean'
      ? o.sayfaSonuSurekliligi : VARSAYILAN_TERCIH.sayfaSonuSurekliligi,
    sureAyari: sureCoz(o.sureAyari),
    /* Adres kullanıcının elinde, yani güven sınırının dışında: dizge
       olmayan bir değer boşa düşüyor ve varsayılan adres kullanılıyor —
       tercih dosyasındaki bir çöp yüzünden damga hiç alınamaz olmamalı. */
    tsaUrl: typeof o.tsaUrl === 'string' ? o.tsaUrl.trim().slice(0, 500) : '',
  };
}

/** Tercihi metne çevirir. Okuma ile aynı biçim — tek yuvarlak gidiş. */
export function tercihiYaz(t: FormatTercihi): string {
  return JSON.stringify({
    kagit: t.kagit, dil: t.dil, presetler: t.presetler, yazi: t.yazi,
    solSutun: t.solSutun, kelimeHizi: t.kelimeHizi, sayfaRengi: t.sayfaRengi,
    akilliDuzeltme: t.akilliDuzeltme, daktiloModu: t.daktiloModu, arayuzOlcegi: t.arayuzOlcegi,
    numaraAyari: t.numaraAyari, sayfaSonuSurekliligi: t.sayfaSonuSurekliligi,
    sureAyari: t.sureAyari,
    tsaUrl: t.tsaUrl,
  });
}

/* ------------------------------------------------------------------ */
/* Depo — `localStorage`, her erişim korumalı                          */
/* ------------------------------------------------------------------ */

/**
 * `localStorage` bazı bağlamlarda ERİŞİLDİĞİ ANDA fırlatır (gizli pencere,
 * site verisi engelli tarayıcı, bazı test ortamları). Erişim `try` içinde:
 * tercih okunamadı diye program açılmamak, kaydedilmemiş bir tercihten çok
 * daha pahalı olurdu.
 */
function depo(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function tercihOku(): FormatTercihi {
  const d = depo();
  if (!d) return VARSAYILAN_TERCIH;
  try {
    return tercihiCoz(d.getItem(ANAHTAR));
  } catch {
    return VARSAYILAN_TERCIH;
  }
}

/** Yazamazsa SESSİZ kalır — tercih kaydı kullanıcının işini bölmemeli. */
export function tercihKaydet(t: FormatTercihi): void {
  const d = depo();
  if (!d) return;
  try {
    d.setItem(ANAHTAR, tercihiYaz(t));
  } catch {
    /* Kota dolu ya da yazma engelli. §15.4'ün "sessiz başarısızlık yasağı"
       METİN kaybı içindir; burada kaybolan şey bir kağıt seçimi ve kullanıcı
       onu zaten ekranda görüyor. */
  }
}
