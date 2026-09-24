/**
 * Dünya modeli — §13.2 (`worldinformation`/`worldstructure`/`worldsmap`, F8).
 *
 * Saf: Yjs bilmez, React bilmez. Desen `model/karakter.ts` ve `model/lokasyon.ts`
 * ile birebir aynı — o iki dosya "TEK EV" olarak kadro/mekân tarafını çözüyor,
 * bu da kurgu evreni notları (mekan dışı bağlam: kurum, kavram, olay, nesne) tarafını.
 *
 * Otomatik toplama YOK: karakter ve lokasyon senaryodan (character/scene
 * bloklarından) çıkarılabiliyordu çünkü Fountain'ın kendi söz dizimi onları
 * işaretliyor. Bir "dünya" notu (`İmparatorluk`, `Kan Yemini`, `Veba`) metinde
 * ayırt edici bir kalıpla durmuyor — toplamaya çalışmak ya hiçbir şey
 * yakalamaz ya da rastgele özel adları yanlışlıkla dünya sayardı.
 */

import { sozlukAnahtari } from '../dil/sozluk';

export const DUNYA_TURLERI = ['mekan', 'kurum', 'kavram', 'olay', 'nesne'] as const;
export type DunyaTuru = (typeof DUNYA_TURLERI)[number];

export const VARSAYILAN_DUNYA_TURU: DunyaTuru = 'mekan';

export interface Dunya {
  id: string;
  ad: string;
  tur: DunyaTuru;
  aciklama: string;
  notlar: string;
  /** Bağlı karakter kimlikleri — `model/karakter.ts`teki `Karakter.id`. */
  bagliKarakterler: string[];
  /** Bağlı lokasyon kimlikleri — `model/lokasyon.ts`teki `Lokasyon.id`. */
  bagliLokasyonlar: string[];
}

/** Ad bu uzunluğu aşarsa listede okunmaz hâle gelir — `KARAKTER_ADI_EN_UZUN` ile aynı gerekçe. */
export const DUNYA_ADI_EN_UZUN = 80;

/** Adı normalleştirir: NFC, kırpılmış, uzunluk sınırlı. Boş ad GEÇERSİZ — `adiDuzelt` (karakter) ile aynı gerekçe. */
export function dunyaAdiDuzelt(deger: unknown): string {
  if (typeof deger !== 'string') return '';
  return deger.normalize('NFC').trim().slice(0, DUNYA_ADI_EN_UZUN);
}

/** Bilinmeyen tür varsayılana düşer — belge elle kurcalanmış olabilir. */
export function dunyaTuruDuzelt(deger: unknown): DunyaTuru {
  return (DUNYA_TURLERI as readonly string[]).includes(deger as string)
    ? (deger as DunyaTuru)
    : VARSAYILAN_DUNYA_TURU;
}

/** Ad karşılaştırma anahtarı — `model/karakter.ts`teki `karakterAnahtari` ile TEK EV. */
export function dunyaAnahtari(ad: string): string {
  return sozlukAnahtari(ad);
}

export interface DunyaGecerlilik {
  gecerli: boolean;
  hata?: string;
}

/** `karakterAdiGecerliMi`nin dünya karşılığı — aynı gerekçe: sessiz çakışma yasak. */
export function dunyaAdiGecerliMi(
  ad: string,
  digerleri: readonly Dunya[],
  kendiId?: string,
): DunyaGecerlilik {
  const temiz = dunyaAdiDuzelt(ad);
  if (!temiz) return { gecerli: false, hata: 'Dünya adı boş olamaz.' };
  const anahtar = dunyaAnahtari(temiz);
  const cakisan = digerleri.find(
    (d) => d.id !== kendiId && dunyaAnahtari(d.ad) === anahtar,
  );
  if (cakisan) return { gecerli: false, hata: `"${cakisan.ad}" adıyla zaten bir dünya var.` };
  return { gecerli: true };
}

/**
 * Bir dünyanın karakter bağlarını GEÇERLİ olanlarla süzer.
 *
 * Bayat bağ (silinmiş bir karaktere işaret eden id) burada SÜZÜLÜR, dünya
 * kaydından hevesle SİLİNMEZ — `model/yerimi.ts`teki `siraliImler` ile AYNI
 * karar: silme bir geri-almayla yarışırsa (kullanıcı karakteri yanlışlıkla
 * silip Ctrl+Z basarsa) bağ saklanan dizide durduğu için anında geri gelir.
 * Eagerly temizleseydik geri alma bağı KURTARAMAZDI.
 */
export function gecerliKarakterBaglari(
  dunya: Pick<Dunya, 'bagliKarakterler'>,
  mevcutKarakterIdleri: ReadonlySet<string>,
): string[] {
  return dunya.bagliKarakterler.filter((id) => mevcutKarakterIdleri.has(id));
}

/** `gecerliKarakterBaglari`nin lokasyon karşılığı — aynı gerekçe. */
export function gecerliLokasyonBaglari(
  dunya: Pick<Dunya, 'bagliLokasyonlar'>,
  mevcutLokasyonIdleri: ReadonlySet<string>,
): string[] {
  return dunya.bagliLokasyonlar.filter((id) => mevcutLokasyonIdleri.has(id));
}

/** Dünya listesinde gösterilen sıralı görünüm — Türkçe alfabetik. */
export function dunyalariSirala(
  kayitlar: ReadonlyMap<string, Dunya> | Readonly<Record<string, Dunya>>,
): Dunya[] {
  const liste = kayitlar instanceof Map ? [...kayitlar.values()] : Object.values(kayitlar);
  return [...liste].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
