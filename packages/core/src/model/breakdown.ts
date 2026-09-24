/**
 * Çekim dökümü (breakdown) modeli — §13.2 borcu (F8).
 *
 * Saf: Yjs bilmez, React bilmez. Sahne başına yapım öğelerini üretir ve
 * OTOMATİK toplananla ELLE girileni AYRI tutar — kullanıcı hangisinin kendi
 * kararı olduğunu bilmeli (görev tanımı).
 *
 * ## Sahne bölme: `sceneId`, `type === 'scene'` DEĞİL
 *
 * Karar `model/yapi.ts` ve `model/analiz.ts`te zaten yazılı: başlıksız açılış
 * sahnesi de bir sahnedir, tipe bakan bir bölme onu bir öncekine yapıştırırdı.
 * Aynı ilke burada TEKRAR YAZILMIYOR, yalnız uygulanıyor.
 *
 * ## Karakterler ve mekân TEK EVDEN
 *
 * `karakterleriTopla` (`model/karakter.ts`) ve `lokasyonlariTopla`
 * (`model/lokasyon.ts`) her sahnenin KENDİ bloklarına sınırlanmış olarak
 * çağrılıyor — kendi ayrıştırıcımızı yazmıyoruz, ikisi de zaten senaryo
 * genelinde aynı işi yapıyor, burada yalnız girdiyi sahneyle sınırlıyoruz.
 *
 * `zaman` (gün/gece) bu ikisinin döndürmediği tek parça: `sahneBasligiAyristir`
 * (`format/terim.ts`) — `lokasyonlariTopla`'nın İÇİNDE zaten kullandığı aynı
 * paylaşılan ayrıştırıcı — sahne başlığına bir kez daha, yalnız bu alan için
 * çağrılıyor.
 */

import type { ScriptBlock } from './script';
import type { DilAdi } from '../format/profil';
import { sahneBasligiAyristir, type ZamanAnahtar } from '../format/terim';
import { karakterleriTopla } from './karakter';
import { lokasyonlariTopla, VARSAYILAN_LOKASYON_TIPI, type LokasyonTipi } from './lokasyon';
import { hikayeSirasiCoz, katmanCoz, VARSAYILAN_KATMAN, type ZamanKatmani } from './zaman-katmani';

/** Elle eklenen yapım öğeleri — Yjs kökünde `sceneId` ile anahtarlı (görev tanımı). */
export interface BreakdownEki {
  ozelEsya: string[];
  kostum: string[];
  efekt: string[];
  notlar: string;
  /** Dakika, tahmini. Bilinmiyorsa `null` — sıfır bir tahmindir, boşluk değil. */
  sureTahmini: number | null;
  /**
   * Sahnenin anlatı düzlemi (şimdi / geriye dönüş / ileriye sıçrama / hayal).
   *
   * BURADA duruyor, ayrı bir kök haritada değil: geriye dönüş bir YAPIM
   * verisidir — kostümü, makyajı, gradeʼi değiştirir — ve bu harita zaten
   * `sceneId` ile anahtarlı sahne başına yapım verisini tutuyor. İkinci bir
   * ev açmak aynı soruyu iki yere sormak olurdu (Karar 2).
   */
  zamanKatmani: ZamanKatmani;
  /**
   * Sahnenin HİKÂYE (olay) sırasındaki yeri. Anlatı sırasıyla karşılaştırılıp
   * "doğrusal mı" sorusunu cevaplıyor. Etiketlenmemişse `null`.
   */
  hikayeSirasi: number | null;
}

export const BOS_BREAKDOWN_EKI: BreakdownEki = {
  ozelEsya: [], kostum: [], efekt: [], notlar: '', sureTahmini: null,
  zamanKatmani: VARSAYILAN_KATMAN, hikayeSirasi: null,
};

/**
 * Serbest metin listesi normalizasyonu — boş/dizge-olmayan girdi süzülür.
 *
 * EXPORTED: `model/baslik-sayfasi.ts` (iletişim satırları) AYNI temizliği
 * kullanıyor — ikinci bir sanitizasyon yazılsaydı biri düzeltilip öteki
 * unutulurdu (Karar 2).
 */
export function metinListesiDuzelt(deger: unknown): string[] {
  if (!Array.isArray(deger)) return [];
  return deger
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.normalize('NFC').trim())
    .filter(Boolean);
}

function sureTahminiDuzelt(deger: unknown): number | null {
  return typeof deger === 'number' && Number.isFinite(deger) && deger >= 0 ? deger : null;
}

/** Belgeden okunan ham değeri güvenli bir `BreakdownEki`'ye çevirir. */
export function breakdownEkiDuzelt(ham: unknown): BreakdownEki {
  const o = (ham ?? {}) as Record<string, unknown>;
  return {
    ozelEsya: metinListesiDuzelt(o.ozelEsya),
    kostum: metinListesiDuzelt(o.kostum),
    efekt: metinListesiDuzelt(o.efekt),
    notlar: typeof o.notlar === 'string' ? o.notlar.normalize('NFC') : '',
    sureTahmini: sureTahminiDuzelt(o.sureTahmini),
    zamanKatmani: katmanCoz(o.zamanKatmani),
    hikayeSirasi: hikayeSirasiCoz(o.hikayeSirasi),
  };
}

/** Çekim dökümü satırı — bir sahnenin OTOMATİK + ELLE alanları birleşik. */
export interface BreakdownSatiri {
  sceneId: string;
  /** Senaryodaki sırası (0'dan). */
  sira: number;
  baslik: string;
  /** İlk bloğun kimliği — tıklamada `blogaGit` buraya gider. */
  ilkBlokId: string;
  /** OTOMATİK — `karakterleriTopla`'dan, sahneye sınırlı. */
  karakterler: string[];
  /** OTOMATİK — `lokasyonlariTopla`'dan, sahneye sınırlı (bir sahne bir mekân). */
  mekan: string;
  icDis: LokasyonTipi;
  zaman: ZamanAnahtar | null;
  /** ELLE — kullanıcının kaydettiği yapım öğeleri. */
  ek: BreakdownEki;
}

/** Bloğu sahne kimliğine göre gruplar — `senaryoyuCozumle`deki bölme kuralının aynısı. */
function sahnelereBol(bloklar: readonly ScriptBlock[]): {
  sceneId: string; sira: number; ilkBlokId: string; blocks: ScriptBlock[];
}[] {
  const gruplar: { sceneId: string; sira: number; ilkBlokId: string; blocks: ScriptBlock[] }[] = [];
  let acik: (typeof gruplar)[number] | null = null;
  for (const blok of bloklar) {
    const sceneId = blok.sceneId || '';
    if (!acik || acik.sceneId !== sceneId) {
      acik = { sceneId, sira: gruplar.length, ilkBlokId: blok.id, blocks: [] };
      gruplar.push(acik);
    }
    acik.blocks.push(blok);
  }
  return gruplar;
}

/**
 * Sahne başına çekim dökümü satırlarını çıkarır.
 *
 * `ekler` — `sceneId` → `BreakdownEki`, çağıran Yjs'ten okuyup veriyor (bu
 * dosya Yjs bilmiyor). Kayıt yoksa `BOS_BREAKDOWN_EKI` kullanılır.
 */
export function breakdownSatirlariniCikar(
  bloklar: readonly ScriptBlock[],
  dil: DilAdi,
  ekler: ReadonlyMap<string, BreakdownEki> | Readonly<Record<string, BreakdownEki>>,
): BreakdownSatiri[] {
  const ekOku = (id: string): BreakdownEki | undefined =>
    ekler instanceof Map ? ekler.get(id) : (ekler as Record<string, BreakdownEki>)[id];

  return sahnelereBol(bloklar).map((sahne) => {
    const baslikBlok = sahne.blocks.find((b) => b.type === 'scene');
    const baslik = baslikBlok?.text.trim() || '(başlıksız)';
    const lok = lokasyonlariTopla(sahne.blocks, dil)[0];
    const parca = baslikBlok ? sahneBasligiAyristir(baslikBlok.text, dil) : null;
    return {
      sceneId: sahne.sceneId,
      sira: sahne.sira,
      baslik,
      ilkBlokId: sahne.ilkBlokId,
      karakterler: karakterleriTopla(sahne.blocks).map((k) => k.ad),
      mekan: lok?.ad ?? '',
      icDis: lok?.tip ?? VARSAYILAN_LOKASYON_TIPI,
      zaman: parca?.zaman ?? null,
      ek: breakdownEkiDuzelt(ekOku(sahne.sceneId)),
    };
  });
}
