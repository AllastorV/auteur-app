/**
 * Lokasyon modeli — §13.2 (`locationinformation`/`locationstructure`, F8).
 *
 * Saf: Yjs bilmez, React bilmez. Desen `model/karakter.ts` ile birebir aynı
 * — o dosya "TEK EV" olarak karakter tarafını çözüyor, bu da mekân tarafını.
 */

import { sozlukAnahtari } from '../dil/sozluk';
import type { DilAdi } from '../format/profil';
import { sahneBasligiAyristir } from '../format/terim';
import type { ScriptBlock } from './script';

export type LokasyonTipi = 'ic' | 'dis';

export const VARSAYILAN_LOKASYON_TIPI: LokasyonTipi = 'ic';

export interface Lokasyon {
  id: string;
  ad: string;
  tip: LokasyonTipi;
  aciklama: string;
  notlar: string;
}

export const LOKASYON_ADI_EN_UZUN = 80;

/** Adı normalleştirir: NFC, kırpılmış, uzunluk sınırlı. Boş ad GEÇERSİZ. */
export function lokasyonAdiDuzelt(deger: unknown): string {
  if (typeof deger !== 'string') return '';
  return deger.normalize('NFC').trim().slice(0, LOKASYON_ADI_EN_UZUN);
}

/** Bilinmeyen değer varsayılana düşer — belge elle kurcalanmış olabilir. */
export function lokasyonTipiDuzelt(deger: unknown): LokasyonTipi {
  return deger === 'ic' || deger === 'dis' ? deger : VARSAYILAN_LOKASYON_TIPI;
}

/** Ad karşılaştırma anahtarı — `model/karakter.ts`teki `karakterAnahtari` ile TEK EV. */
export function lokasyonAnahtari(ad: string): string {
  return sozlukAnahtari(ad);
}

export interface LokasyonGecerlilik {
  gecerli: boolean;
  hata?: string;
}

/** `karakterAdiGecerliMi`nin lokasyon karşılığı — aynı gerekçe. */
export function lokasyonAdiGecerliMi(
  ad: string,
  digerleri: readonly Lokasyon[],
  kendiId?: string,
): LokasyonGecerlilik {
  const temiz = lokasyonAdiDuzelt(ad);
  if (!temiz) return { gecerli: false, hata: 'Lokasyon adı boş olamaz.' };
  const anahtar = lokasyonAnahtari(temiz);
  const cakisan = digerleri.find(
    (l) => l.id !== kendiId && lokasyonAnahtari(l.ad) === anahtar,
  );
  if (cakisan) return { gecerli: false, hata: `"${cakisan.ad}" adıyla zaten bir lokasyon var.` };
  return { gecerli: true };
}

/** Senaryodan otomatik toplanan bir lokasyonun ilk görünüşü. */
export interface ToplananLokasyon {
  ad: string;
  tip: LokasyonTipi;
  /** İlk `scene` bloğunun kimliği — `blogaGit` buraya gider. */
  ilkBlokId: string;
}

/**
 * Sahne başlıklarından lokasyon adlarını çıkarır — §13.2 otomatik toplama.
 *
 * Ayrıştırma `format/terim.ts`teki `sahneBasligiAyristir` — TEK EV, başlık
 * ayrıştırma kuralları (baştaki/sondaki mekân teriminin okunması, ayraç
 * tespiti) burada YENİDEN YAZILMIYOR. `yer` alanı zaten tam lokasyon adı.
 *
 * Mekân terimi ayrıştırıcı tarafından ÇÖZÜLEMEZSE (`mekan` yok — başlık
 * beklenen kalıpta değil) lokasyon VARSAYILAN tipe düşer; yutulmuyor, çünkü
 * yer adının kendisi yine de anlamlı bir kayıt.
 */
export function lokasyonlariTopla(
  bloklar: readonly ScriptBlock[],
  dil: DilAdi,
): ToplananLokasyon[] {
  const gorulen = new Map<string, ToplananLokasyon>();
  for (const blok of bloklar) {
    if (blok.type !== 'scene') continue;
    const parca = sahneBasligiAyristir(blok.text, dil);
    const ad = parca.yer.trim();
    if (!ad) continue;
    const anahtar = lokasyonAnahtari(ad);
    if (!gorulen.has(anahtar)) {
      gorulen.set(anahtar, { ad, tip: parca.mekan ?? VARSAYILAN_LOKASYON_TIPI, ilkBlokId: blok.id });
    }
  }
  return [...gorulen.values()];
}

/** Kadro listesinde gösterilen tek satır — `KarakterSatiri`nin lokasyon karşılığı. */
export interface LokasyonSatiri {
  id?: string;
  ad: string;
  tip: LokasyonTipi;
  aciklama: string;
  ilkBlokId?: string;
}

/** `karakterSatirlari`nin lokasyon karşılığı — aynı iki yönlü birleşim. */
export function lokasyonSatirlari(
  kayitlar: ReadonlyMap<string, Lokasyon> | Readonly<Record<string, Lokasyon>>,
  bloklar: readonly ScriptBlock[],
  dil: DilAdi,
): LokasyonSatiri[] {
  const kayitListesi = kayitlar instanceof Map ? [...kayitlar.values()] : Object.values(kayitlar);
  const toplanan = lokasyonlariTopla(bloklar, dil);
  const toplananAnahtar = new Map(toplanan.map((t) => [lokasyonAnahtari(t.ad), t]));
  const gorulenAnahtar = new Set<string>();
  const satirlar: LokasyonSatiri[] = [];

  for (const l of kayitListesi) {
    const anahtar = lokasyonAnahtari(l.ad);
    gorulenAnahtar.add(anahtar);
    satirlar.push({
      id: l.id,
      ad: l.ad,
      tip: l.tip,
      aciklama: l.aciklama,
      ilkBlokId: toplananAnahtar.get(anahtar)?.ilkBlokId,
    });
  }
  for (const t of toplanan) {
    const anahtar = lokasyonAnahtari(t.ad);
    if (gorulenAnahtar.has(anahtar)) continue;
    satirlar.push({ ad: t.ad, tip: t.tip, aciklama: '', ilkBlokId: t.ilkBlokId });
  }
  return satirlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
