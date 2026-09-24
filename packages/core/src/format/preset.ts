import type { ScriptBlockType } from '../model/script';
import { IZGARA, KARAKTER_MM } from './izgara';
import type { BlokStili, FormatProfili, Hiza } from './profil';

/**
 * Yazım presetleri — §16.3.
 *
 * > "Format profilinin zorunlu kıldığı ölçüler (Courier 12pt, sayfa marjları)
 * > preset tarafından **ezilemez**; ezilebilseydi sayfa=süre sözleşmesi
 * > çökerdi. Ezilmeye çalışılırsa arayüz **nedenini söyleyerek reddeder**."
 *
 * Reddedilen alanlar bu tipte YER ALIR, dışarıda bırakılmaz. Gerekçe:
 * arayüz onları göstermek ve reddi göstermek zorunda. Tipten silinselerdi
 * kullanıcı denetimi hiç görmez, "neden yazı tipini değiştiremiyorum?"
 * sorusu cevapsız kalırdı. Görünmez bir sınır, açıklanan bir sınırdan
 * kötüdür.
 */

export interface BlokPreseti {
  /* --- serbest --- */
  kalin?: boolean;
  italik?: boolean;
  buyukHarf?: boolean;
  hiza?: Hiza;
  oncekiBosSatir?: number;
  yeniSayfada?: boolean;
  /** Girinti — ama TAM KARAKTER olmak zorunda. */
  solMm?: number;
  sagMm?: number;

  /* --- profilin zorunlu kıldığı, ezilemez --- */
  yaziTipi?: string;
  punto?: number;
  satirAraligi?: number;
}

export interface PresetRed {
  alan: keyof BlokPreseti;
  sebep: string;
}

export interface PresetSonucu {
  stil: BlokStili;
  /** Boş değilse arayüz bunları KULLANICIYA GÖSTERMEK zorunda (§16.3). */
  redler: PresetRed[];
}

/** Sayfa=süre sözleşmesini taşıyan, hiçbir presetin dokunamayacağı alanlar. */
/* Gerekceler DISARI ACIK: arayuz onlari yeniden yazarsa iki yerde yasarlar
   ve biri degisince oteki sessizce eskir (Karar 2). */
export const EZILEMEZ_GEREKCE: Record<'yaziTipi' | 'punto' | 'satirAraligi', string> = {
  yaziTipi:
    'Senaryo yazı tipi Courier’dir; sektör konvansiyonu ve sayfa sayısı buna bağlı.',
  punto:
    'Punto 12’dir: satır başına 60 karakter, sayfa başına 55 satır. Değişirse sayfa ≈ dakika sözleşmesi çöker.',
  satirAraligi:
    'Satır aralığı ızgaranın kendisidir (6 satır/inç); değişirse sayfa sayısı yalancı çıkar.',
};

/**
 * Preseti taban stile uygular; ezilemez ve ızgara dışı istekleri REDDEDER.
 *
 * Reddetmek sessizce yoksaymak DEĞİLDİR: her red gerekçesiyle döner ve arayüz
 * onu gösterir. Sessizce yoksaymak, kullanıcının ayarı değiştirdiğini sanıp
 * teslim ettiği dosyanın başka çıkmasına yol açardı.
 */
export function presetUygula(taban: BlokStili, preset: BlokPreseti): PresetSonucu {
  const redler: PresetRed[] = [];
  const stil: BlokStili = { ...taban };

  for (const alan of ['yaziTipi', 'punto', 'satirAraligi'] as const) {
    if (preset[alan] !== undefined) redler.push({ alan, sebep: EZILEMEZ_GEREKCE[alan] });
  }

  if (preset.kalin !== undefined) stil.kalin = preset.kalin;
  if (preset.italik !== undefined) stil.italik = preset.italik;
  if (preset.buyukHarf !== undefined) stil.buyukHarf = preset.buyukHarf;
  if (preset.hiza !== undefined) stil.hiza = preset.hiza;
  if (preset.yeniSayfada !== undefined) stil.yeniSayfada = preset.yeniSayfada;

  if (preset.oncekiBosSatir !== undefined) {
    const n = preset.oncekiBosSatir;
    /* Boş satır sayısı TAM ve negatif olmayan bir sayı olmak zorunda: kesirli
       değer ızgarayı bozar, negatif değer `Array.from({length})` üzerinden
       sessizce sıfıra düşer ve kullanıcı ayarın işlediğini sanır. */
    if (!Number.isInteger(n) || n < 0) {
      redler.push({
        alan: 'oncekiBosSatir',
        sebep: `Önceki boş satır tam ve negatif olmayan bir sayı olmalı: ${n}`,
      });
    } else {
      stil.oncekiBosSatir = n;
    }
  }

  const girinti = (alan: 'solMm' | 'sagMm') => {
    const mm = preset[alan];
    if (mm === undefined) return;
    const sutun = mm / KARAKTER_MM;
    if (!Number.isFinite(mm) || mm < 0 || Math.abs(sutun - Math.round(sutun)) > 1e-9) {
      redler.push({
        alan,
        sebep: `Girinti tam karakter katı olmalı (${KARAKTER_MM.toFixed(2)} mm): ${mm}`,
      });
      return;
    }
    stil[alan] = mm;
  };
  girinti('solMm');
  girinti('sagMm');

  /* Girintiler ayrı ayrı geçerli olsa da TOPLAMI metin bloğunu yiyebilir.
     Sıfır ya da negatif sütun `sarmala`'yı sonsuz döngüye sokar — uygulama
     donar, kaydedilmemiş iş gider (§15). Bu bir veri kaybı yoludur; burada
     reddedilir ve taban girintiler korunur. */
  /* Sütun TAM SAYI olarak hesaplanır, mm üzerinden değil: `60*2,54 - 59*2,54`
     kayan noktada 0,9999… veriyor ve tam bir sütun bırakan geçerli bir girinti
     yanlışlıkla reddediliyordu (ölçüldü). Girintiler bu noktada zaten tam
     karakter katı olarak doğrulanmış durumda. */
  const kalanSutun =
    IZGARA.sutun - Math.round(stil.solMm / KARAKTER_MM) - Math.round(stil.sagMm / KARAKTER_MM);
  if (kalanSutun < 1) {
    redler.push({
      alan: 'solMm',
      sebep: `Girintiler metin bloğunu yiyor: kalan ${kalanSutun} sütun. En az 1 sütun kalmalı.`,
    });
    stil.solMm = taban.solMm;
    stil.sagMm = taban.sagMm;
  }

  return { stil, redler };
}

/** Blok tipi → preset. Profile yazılır, PROJEYE değil (§16.3). */
export type PresetTablosu = Partial<Record<ScriptBlockType, BlokPreseti>>;

/**
 * Profili presetlerle yeniden kurar.
 *
 * Yeni bir profil NESNESİ döner, tabanı değiştirmez: profil paylaşılan bir
 * değerdir ve yerinde değiştirilirse aynı tabandan türeyen başka profiller de
 * sessizce kayar.
 */
export function profileUygula(
  taban: FormatProfili,
  presetler: PresetTablosu,
): { profil: FormatProfili; redler: Partial<Record<ScriptBlockType, PresetRed[]>> } {
  const bloklar = { ...taban.bloklar } as Record<ScriptBlockType, BlokStili>;
  const redler: Partial<Record<ScriptBlockType, PresetRed[]>> = {};

  for (const [tip, preset] of Object.entries(presetler) as [ScriptBlockType, BlokPreseti][]) {
    if (!preset || !taban.bloklar[tip]) continue;
    const sonuc = presetUygula(taban.bloklar[tip], preset);
    bloklar[tip] = sonuc.stil;
    if (sonuc.redler.length) redler[tip] = sonuc.redler;
  }

  return { profil: { ...taban, bloklar }, redler };
}
