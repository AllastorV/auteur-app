/**
 * Geri dönüşüm kutusu modeli — §13.2 (`recyclebin`, F8), §15'in ruhu.
 *
 * Saf: Yjs bilmez, React bilmez. "Silinen bir öğe eskimiş mi", "hangi
 * sırada gösterilir" ve "hangileri otomatik temizlikte gider" sorularını
 * yanıtlar. Desen `model/karakter.ts`/`model/lokasyon.ts` ile aynı ruhta:
 * belgeden okunan ham değeri güvenli bir kayda çeviren saf fonksiyonlar.
 *
 * §15: "Bir senaryo, aylarca süren emeğin tek kopyasıdır; kaybı yalnızca
 * can sıkıcı değil, maddi zarardır." Bu modül panel ve senaryo bloğu
 * silmenin GERİ ALINABİLİR olmasını sağlıyor — `doc/mutations.ts`teki
 * `removePanel` ve `setScript` bu modülün üstüne YÖNLENDİRİLİYOR, ikinci
 * bir silme yolu açılmıyor (Karar 2).
 */

import type { Panel } from './types';
import type { ScriptBlock } from './script';

export type CopTuru = 'panel' | 'blok';

export interface CopOgesi {
  id: string;
  tur: CopTuru;
  /** Silinen andaki TAM kayıt — geri getirme bunu aynen yeniden yazar. */
  veri: Panel | ScriptBlock;
  silinmeTarihi: number;
  /** Bugün doldurulmuyor (bkz. `doc/mutations.ts` `copaEkle`) — hesap kimliği
   *  mutasyon çağrı noktasına henüz ulaşmıyor (bkz. `collab/client.ts`
   *  awareness). Alan şemada duruyor, bağlandığında buraya akacak. */
  silenKullanici: string;
  /**
   * Silinme anında kendisinden HEMEN ÖNCE duran öğenin kimliği — `null` ise
   * ilk sıradaydı. Geri getirme SONA değil buraya (komşuluğuna) koyar:
   * sona atmak kullanıcının düzenini bozar.
   */
  oncekiKomsu: string | null;
}

/** Otomatik temizlik eşiği — §15: "Otomatik temizlik: 30 günden eski kayıtlar." */
export const COP_SAKLAMA_GUNU = 30;
const GUN_MS = 24 * 60 * 60 * 1000;

/** Öğe saklama süresini AŞTI mı. */
export function copOgesiEskimisMi(
  oge: Pick<CopOgesi, 'silinmeTarihi'>,
  simdi: number = Date.now(),
): boolean {
  return simdi - oge.silinmeTarihi > COP_SAKLAMA_GUNU * GUN_MS;
}

/**
 * Öğeleri eskimiş/kalan olarak ikiye ayırır — otomatik temizliğin girdisi.
 *
 * Temizlik SESSİZ olmasın (proje kuralı): bu fonksiyon SİLMEZ, yalnız
 * AYIRIR — çağıran (`doc/mutations.ts` `copTemizle`) kaç kaydın gideceğini
 * bu ayrımdan sayıp kullanıcıya göstermek ZORUNDA.
 */
export function copEskimisleriAyir(
  ogeler: readonly CopOgesi[],
  simdi: number = Date.now(),
): { kalan: CopOgesi[]; silinecek: CopOgesi[] } {
  const kalan: CopOgesi[] = [];
  const silinecek: CopOgesi[] = [];
  for (const oge of ogeler) (copOgesiEskimisMi(oge, simdi) ? silinecek : kalan).push(oge);
  return { kalan, silinecek };
}

/**
 * Çekmecede gösterim sırası — EN YENİ silinen ÖNCE.
 *
 * `siraliImler`in belge-sırası kararının TERSİ gibi görünür ama gerekçe
 * aynı ilkeden gelir: kullanıcı burada "az önce ne kaybettim"i arıyor,
 * belgedeki konumu değil.
 */
export function copSirali(ogeler: readonly CopOgesi[]): CopOgesi[] {
  return [...ogeler].sort((a, b) => b.silinmeTarihi - a.silinmeTarihi);
}
