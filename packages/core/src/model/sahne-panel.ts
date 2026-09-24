import type { ScriptBlock } from './script';
import type { Panel } from './types';

/**
 * Sahne ↔ panel canlı bağı — F5.
 *
 * Bitiş ölçütü: **sahneyi taşı → kartı taşınıyor.** Yazar bir sahneyi
 * senaryoda yukarı aldığında o sahnenin planları da panoda yukarı gelmeli;
 * yoksa iki görünüm birbirinden ayrışır ve storyboard senaryoyu anlatmaz
 * hâle gelir.
 *
 * ## Bağsız paneller YERİNDE kalır
 *
 * Henüz hiçbir satıra bağlanmamış paneller (eskiz, kapak, deneme) sahne
 * sırasına göre sıralanamaz — sıralanmaya çalışılsaydı hepsi başa ya da sona
 * yığılır ve kullanıcının kendi düzeni yok olurdu. Bu kayıp geri alınabilir
 * ama kullanıcı ne olduğunu anlamaz.
 *
 * ## Sıra yalnız BAĞLI paneller arasında değişir
 *
 * Bağlı panellerin işgal ettiği KONUMLAR sabit kalıyor, o konumlara hangi
 * panelin oturduğu değişiyor. Böylece bağsız paneller komşularını koruyor.
 */

export interface PanelSirasi {
  /** Yeni sıradaki panel kimlikleri. */
  sira: string[];
  /** Değişen bir şey var mı — yoksa hiç yazım yapılmamalı. */
  degisti: boolean;
}

/**
 * Bir panelin bağlı olduğu EN ERKEN blok sırası.
 *
 * En erken, çünkü bir panel birden çok satıra bağlı olabilir ve o zaman
 * "hangi sahnenin planı" sorusunun cevabı ilk satırıdır. Ortalama alınsaydı
 * iki uzak satıra bağlı bir panel ikisinin de olmadığı bir yere düşerdi.
 */
function panelinCapasi(panel: Panel, blokSirasi: ReadonlyMap<string, number>): number | null {
  let enErken: number | null = null;
  for (const ref of panel.scriptRefs ?? []) {
    const sira = blokSirasi.get(ref);
    if (sira === undefined) continue;
    if (enErken === null || sira < enErken) enErken = sira;
  }
  return enErken;
}

/**
 * Senaryo sırasına göre panel sırasını hesaplar.
 *
 * Saf: hiçbir şey yazmaz, yeni sırayı döndürür. Yazma kararı çağıranın —
 * böylece "canlı bağ kapalı" gibi bir seçenek eklenebilir ve fonksiyon
 * testte gerçek belgesiz çalışır.
 */
export function panelSirasiHesapla(
  bloklar: readonly ScriptBlock[],
  paneller: readonly Panel[],
): PanelSirasi {
  const blokSirasi = new Map(bloklar.map((b, i) => [b.id, i]));

  /* Bağlı panellerin İŞGAL ETTİĞİ konumlar toplanıyor; bağsızlar bu listede
     yok, yani kendi konumlarında kalacaklar. */
  const bagliKonumlar: number[] = [];
  const bagliPaneller: { id: string; capa: number }[] = [];
  paneller.forEach((p, i) => {
    const capa = panelinCapasi(p, blokSirasi);
    if (capa === null) return;
    bagliKonumlar.push(i);
    bagliPaneller.push({ id: p.id, capa });
  });

  /* Sıralama ÇAPAYA göre, eşitlikte MEVCUT sıraya göre: aynı sahneye bağlı
     iki plan arasındaki sırayı kullanıcı elle kurmuş olabilir ve onu
     bozmamak gerekir (kararlı sıralama). */
  const mevcutSira = new Map(paneller.map((p, i) => [p.id, i]));
  const sirali = [...bagliPaneller].sort(
    (a, b) => a.capa - b.capa || mevcutSira.get(a.id)! - mevcutSira.get(b.id)!,
  );

  const sonuc = paneller.map((p) => p.id);
  bagliKonumlar.forEach((konum, i) => { sonuc[konum] = sirali[i].id; });

  const degisti = sonuc.some((id, i) => id !== paneller[i].id);
  return { sira: sonuc, degisti };
}

/**
 * Yeni sırayı `movePanel` çağrılarına çevirir.
 *
 * Tek tek taşıma, diziyi toptan yeniden yazmaktan yeğ: toptan yazım ortak
 * çalışmada başkasının aynı anda eklediği paneli SİLERDİ (Yjs dizi
 * değiştirme değil, ekleme/çıkarma üzerinden birleşir).
 */
export function siraylaTasimalar(
  mevcut: readonly string[],
  hedef: readonly string[],
): { panelId: string; toIndex: number }[] {
  const calisma = [...mevcut];
  const adimlar: { panelId: string; toIndex: number }[] = [];
  for (let i = 0; i < hedef.length; i++) {
    if (calisma[i] === hedef[i]) continue;
    const nerede = calisma.indexOf(hedef[i]);
    if (nerede < 0) continue;
    calisma.splice(nerede, 1);
    calisma.splice(i, 0, hedef[i]);
    adimlar.push({ panelId: hedef[i], toIndex: i });
  }
  return adimlar;
}
