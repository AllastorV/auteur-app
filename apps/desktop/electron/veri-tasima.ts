import fs from 'node:fs';
import path from 'node:path';

/**
 * Ürün adı değişince veri kökünün taşınması.
 *
 * ELECTRON'A BAĞLI DEĞİL: yollar ve taşıma işlevi dışarıdan verilir, böylece
 * gerçek klasörlerle birim testi yazılabilir. `main.ts` yalnızca
 * `app.getPath('userData')` sonucunu geçirir.
 *
 * Electron veri kökünü ürün adından türetir. Ad değişip kök taşınmazsa eski
 * kurulumun otomatik kayıtları, sürüm geçmişi ve §15 günlükleri yeni sürüm
 * için YOK SAYILIR — kullanıcı "başka klasörde duruyor" diye düşünmez,
 * "her şey kayboldu" görür.
 */
export interface TasimaSonucu {
  tasindi: boolean;
  /** Kullanıcıya gösterilecek hata; sorun yoksa `null`. */
  hata: string | null;
}

export function eskiKokuTasi(
  yeniKok: string,
  eskiAd: string,
  tasi: (a: string, b: string) => void = fs.renameSync,
  varMi: (p: string) => boolean = fs.existsSync,
): TasimaSonucu {
  const eskiKok = path.join(path.dirname(yeniKok), eskiAd);

  /* Yeni kök zaten varsa DOKUNULMAZ: taşımak, kullanıcının o an
     kullandığı veriyi eski sürümün verisiyle ezmek olurdu. */
  if (varMi(yeniKok) || !varMi(eskiKok)) return { tasindi: false, hata: null };

  try {
    tasi(eskiKok, yeniKok);
    return { tasindi: true, hata: null };
  } catch (err) {
    /* §15.4: sessiz geçilmez. Eski kök yerinde duruyor; kullanıcıya nerede
       olduğu ve ne yapabileceği söylenir. */
    return {
      tasindi: false,
      hata:
        'Eski sürümün verisi yeni konuma taşınamadı.\n\n' +
        `Eski konum: ${eskiKok}\nYeni konum: ${yeniKok}\n\n` +
        'Hiçbir şey silinmedi. Eski otomatik kayıtları ve sürüm geçmişini ' +
        'görmek için bu klasörü elle yeni konuma kopyalayabilirsiniz.\n\n' +
        `Sebep: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
