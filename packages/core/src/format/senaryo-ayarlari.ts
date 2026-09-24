import type { ScriptBlock } from '../model/script';

/**
 * SENARYO AYARLARI — STARC'ın senaryo modülü kutuları, paketlenmiş hâlde.
 *
 * Kullanıcı kararı (2026-08-27): "birleştirilebilen varsa tek ayar olarak
 * ekle." Üç paket:
 *
 * 1. **Numaralandırma** — STARC'ta iki kutu (`Sahne numarasını göster`
 *    solda/sağda + `Diyalog numarasını göster`). İkisi de aynı soruyu
 *    soruyor: kenar boşluğunda numara görünsün mü.
 * 2. **Sayfa sonu sürekliliği** — STARC'ta iki kutu (`(DEVAM EDECEK) ekle`
 *    + `Sayfa sonlarındaki senaryo metnini otomatik düzelt`). İkisi TEK
 *    davranışın iki yarısı: bölünen diyaloğun altına (DEVAMI VAR), yeni
 *    sayfadaki karakterin yanına (DEVAM). Biri açık öteki kapalı olsaydı
 *    çıktı yarım kalırdı — sektörde ikisi birlikte basılır.
 * 3. **Süre hesabı** — STARC'ta üç yöntem; burada da üç, ama TEK seçim.
 *
 * Bu dosya SAF: ProseMirror, React ve dosya sistemi bilmiyor.
 */

/* ------------------------------ numaralar ----------------------------- */

/** Sahne numarasının hangi kenarda görüneceği. */
export type NumaraKenari = 'kapali' | 'sol' | 'sag' | 'ikisi';

export interface NumaraAyari {
  sahne: NumaraKenari;
  /**
   * Diyalog numarası — dublaj ve çeviri stüdyoları replikleri numarayla
   * takip eder. Kenar seçimi YOK: her zaman solda, sahne numarasıyla aynı
   * sütunda; iki ayrı kenar ayarı aynı kenar boşluğunda çakışırdı.
   */
  diyalog: boolean;
}

export const VARSAYILAN_NUMARA: NumaraAyari = { sahne: 'kapali', diyalog: false };

/**
 * Bloklara görüntülenecek numaraları dağıtır.
 *
 * Sahne numarası BLOĞUN KENDİ `scene` alanından geliyor, burada yeniden
 * sayılmıyor (Karar 2): o alan içe aktarımda ve sahne ekleme sırasında
 * zaten üretiliyor ve ikinci bir sayaç, içe aktarılmış bir senaryoda
 * orijinal numaralarla çakışırdı.
 *
 * Diyalog numarası ise BELGEDE YOK — burada sayılıyor, çünkü kalıcı bir
 * replik numarası kavramı yok ve olmamalı: araya replik eklendiğinde
 * bütün numaralar kayar, kalıcı saklamak onları bayatlatırdı.
 */
export function blokNumaralari(
  bloklar: readonly ScriptBlock[],
  ayar: NumaraAyari,
): Map<string, string> {
  const sonuc = new Map<string, string>();
  let diyalogSayaci = 0;
  for (const b of bloklar) {
    if (b.type === 'scene' && ayar.sahne !== 'kapali' && b.scene) {
      sonuc.set(b.id, b.scene);
    }
    if (b.type === 'dialogue') {
      diyalogSayaci++;
      if (ayar.diyalog) sonuc.set(b.id, String(diyalogSayaci));
    }
  }
  return sonuc;
}

/* -------------------------- sayfa sonu sürekliliği -------------------- */

export interface SureklilikTerimleri {
  /** Bölünen diyaloğun ALTINA — "(DEVAMI VAR)" / "(MORE)". */
  devamiVar: string;
  /** Yeni sayfada karakterin YANINA — "(DEVAM)" / "(CONT'D)". */
  devam: string;
}

/**
 * Terimler DİLE bağlı: sektörde İngilizce senaryo `(MORE)`/`(CONT'D)`,
 * Türkçe senaryo `(DEVAMI VAR)`/`(DEVAM)` kullanıyor. Sabitlemek §16.4'ün
 * dil eksenini kırardı.
 */
export function sureklilikTerimleri(dil: string): SureklilikTerimleri {
  return dil === 'tr'
    ? { devamiVar: '(DEVAMI VAR)', devam: '(DEVAM)' }
    : { devamiVar: '(MORE)', devam: "(CONT'D)" };
}

/* ------------------------------- süre --------------------------------- */

export type SureYontemi = 'sayfa' | 'karakter' | 'ozel';

export interface SureAyari {
  yontem: SureYontemi;
  /** `sayfa`: bir sayfanın saniyesi. STARC varsayılanı 60. */
  sayfaSaniye: number;
  /** `karakter`: kaç karakter kaç saniye. STARC varsayılanı 1350 / 60. */
  karakterSayisi: number;
  karakterSaniye: number;
  /** `ozel`: blok tipi başına saniye. STARC'ın "paragraf başına" tablosu. */
  ozelSahne: number;
  ozelAksiyon: number;
  ozelDiyalog: number;
}

/** STARC'ın kendi varsayılanları (registry'den okundu, 2026-08-27). */
export const VARSAYILAN_SURE: SureAyari = {
  yontem: 'sayfa',
  sayfaSaniye: 60,
  karakterSayisi: 1350,
  karakterSaniye: 60,
  ozelSahne: 2,
  ozelAksiyon: 1,
  ozelDiyalog: 2,
};

/**
 * Senaryonun süresini SANİYE olarak hesaplar.
 *
 * `sayfa` yöntemi sayfa sayısını `sayfala`dan alıyor — ikinci bir sayfa
 * formülü YOK (Karar 34). Öteki iki yöntem sayfadan bağımsız; onlarda
 * sayfa sayısı hiç kullanılmıyor, yani "1 sayfa ≈ 1 dakika" sözleşmesi
 * o modlarda geçerli değil ve arayüz bunu söylemek zorunda.
 */
export function sureHesapla(
  bloklar: readonly ScriptBlock[],
  sayfaSayisi: number,
  ayar: SureAyari,
): number {
  if (ayar.yontem === 'sayfa') return sayfaSayisi * ayar.sayfaSaniye;

  if (ayar.yontem === 'karakter') {
    const toplam = bloklar.reduce((t, b) => t + b.text.length, 0);
    /* Sıfıra bölme: bozuk bir tercih dosyası karakterSayisi=0 verirse
       Infinity dönerdi ve arayüz "∞ dk" yazardı. */
    if (ayar.karakterSayisi <= 0) return 0;
    return (toplam / ayar.karakterSayisi) * ayar.karakterSaniye;
  }

  /* `ozel`: blok tipi başına sabit saniye. Sahne başlığı da sayılıyor —
     STARC'ta ayrı bir alanı var ve varsayılanı 2 sn (kesme süresi). */
  return bloklar.reduce((t, b) => {
    if (b.type === 'scene') return t + ayar.ozelSahne;
    if (b.type === 'dialogue' || b.type === 'parenthetical') return t + ayar.ozelDiyalog;
    if (b.type === 'action') return t + ayar.ozelAksiyon;
    return t;
  }, 0);
}
