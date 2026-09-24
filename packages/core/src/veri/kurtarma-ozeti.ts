import type * as Y from 'yjs';
import { panelsArray, readScript } from '../doc/schema';
import { metinSayaclari } from '../format/ekran';

/**
 * Kurtarılacak değişikliğin ÖZETİ — §15.3 "Farkı gör".
 *
 * Tam bir metin farkı DEĞİL: satır satır karşılaştırma sürüm yönetiminin işi
 * (F3, "iki taslak yan yana"). Buradaki soru dar ve acil — "kurtarırsam ne
 * gelecek?" — ve kullanıcı bu kararı çökmeden hemen sonra, telaşlı bir anda
 * veriyor. Sayılar okunur; renkli bir diff okunmaz.
 *
 * Saf: iki `Y.Doc` alır, DOM ve dosya sistemi bilmez.
 */

export interface DurumOlcusu {
  panel: number;
  blok: number;
  sahne: number;
  kelime: number;
}

export interface KurtarmaOzeti {
  onceki: DurumOlcusu;
  sonraki: DurumOlcusu;
  /** Hiçbir ölçü değişmediyse `false` — kullanıcıya "değişiklik yok" denir. */
  degisti: boolean;
}

export function durumOlc(doc: Y.Doc): DurumOlcusu {
  const bloklar = readScript(doc).blocks;
  let kelime = 0;
  for (const b of bloklar) kelime += metinSayaclari(b.text).kelime;
  return {
    panel: panelsArray(doc).length,
    blok: bloklar.length,
    sahne: bloklar.filter((b) => b.type === 'scene').length,
    kelime,
  };
}

export function kurtarmaOzeti(onceki: Y.Doc, sonraki: Y.Doc): KurtarmaOzeti {
  const a = durumOlc(onceki);
  const b = durumOlc(sonraki);
  return {
    onceki: a,
    sonraki: b,
    degisti: a.panel !== b.panel || a.blok !== b.blok || a.sahne !== b.sahne || a.kelime !== b.kelime,
  };
}

/**
 * Kurtarılacak işin süresi, insan diliyle.
 *
 * Süre sıfır ama İŞ varsa "0 dakika" DENMEZ: kullanıcı o cümleyi okuyup
 * "demek ki bir şey yok" der ve yazdığını atar. Bir saniyelik iş de iştir.
 */
export function sureMetni(ms: number, uygulanan: number): string {
  if (uygulanan === 0) return 'kaydedilmemiş iş yok';
  const dakika = Math.floor(ms / 60_000);
  if (dakika >= 60) {
    const saat = Math.floor(dakika / 60);
    return `${saat} saat ${dakika % 60} dakikalık iş`;
  }
  if (dakika >= 1) return `${dakika} dakikalık iş`;
  return 'bir dakikadan kısa iş';
}
