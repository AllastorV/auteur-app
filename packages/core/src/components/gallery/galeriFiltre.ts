import type { Panel } from '../../model/types';
import type { ScriptFilter } from '../../store/ui';

/**
 * Galerideki panelleri süzer (F8 `imagesgallery`, §13.2).
 *
 * Üç filtre `ScriptNavigator`daki (Tümü/Bağlı/Bağsız) İLE AYNI TİP
 * (`ScriptFilter`) — yeni bir filtre kümesi tanımlamak Karar 2'yi ihlal
 * ederdi, iki yerde iki isim aynı üç seçeneği anlatırdı. Fark: gezginde
 * "bağlı" bir SENARYO SATIRININ paneli var mı sorusudur, burada bir
 * PANELİN senaryoya bağlı olup olmadığı — `linkIndex`'in tersi.
 *
 * Saf fonksiyon: bileşen kurulmadan test edilebilir.
 */
export function galeriPanelleriSuz(
  panels: Panel[],
  filtre: ScriptFilter,
  sahne: string | null,
): Panel[] {
  return panels.filter((p) => {
    if (sahne !== null && p.meta.scene !== sahne) return false;
    const bagli = p.scriptRefs.length > 0;
    if (filtre === 'linked') return bagli;
    if (filtre === 'unlinked') return !bagli;
    return true;
  });
}

/**
 * Galeride görünen sahne numaraları — BOŞ olmayan, TEKRARSIZ, belge
 * sırasında (alfabetik/sayısal sıralama "sahne 10"u "sahne 2"den önce
 * gösterirdi; panellerin kendi sırası zaten anlamlı).
 */
export function galeriSahneleri(panels: Panel[]): string[] {
  const gorulen = new Set<string>();
  const out: string[] = [];
  for (const p of panels) {
    const s = p.meta.scene;
    if (s && !gorulen.has(s)) {
      gorulen.add(s);
      out.push(s);
    }
  }
  return out;
}
