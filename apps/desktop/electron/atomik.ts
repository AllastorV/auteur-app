import fs from 'node:fs';
import path from 'node:path';

/**
 * Atomik dosya yazımı — §15.2'nin 2. katmanı.
 *
 * ELECTRON'A BAĞLI DEĞİL, kasten. Bu, ürünün en ağır kısıtının (§15) taşıyıcı
 * ilkesidir ve §15.5 "yazma sırasında çökme dosyayı bozmuyor" testi bunu
 * GERÇEK bir alt süreçte, gerçek `SIGKILL` ile sınamak zorunda. Electron
 * içeri girseydi alt süreç modülü hiç yükleyemez, test ya kopyayı sınar ya
 * hiç koşmazdı — ikisi de kanıt değildir.
 */

/** Geçici dosya ön eki; artık kalanları temizlemek buna bakar. */
export const GECICI_ONEK = '.mzn-tmp-';

/**
 * Önce yan dosyaya yazar, sonra yerine taşır.
 *
 * `rename()` hem NTFS'te hem POSIX'te atomiktir: dosya ya eski ya yeni olur,
 * asla yarım. Doğrudan üzerine yazmak (`writeFileSync(target, ...)`) yazma
 * ortasındaki bir çökmede hem yeni hem ESKİ hâli birlikte götürür — §15.1'in
 * "en kötü ve en sinsi" dediği senaryo budur, çünkü kullanıcı kaydettiğini
 * sanır.
 *
 * `fsync` KASTEN yok: `rename` sonrası veriyi diske zorlamak her yazımda
 * onlarca ms ekler ve günlük (1. katman) zaten saniyelik koruma sağlar.
 * ponytail: güç kesintisinde işletim sistemi önbelleğindeki son yazım
 * kaybolabilir; günlük onu geri getirir. Tek başına dursaydı `fsync` şart
 * olurdu.
 */
export function writeFileAtomic(target: string, data: Buffer | Uint8Array): void {
  const dizin = path.dirname(target);
  const tmp = path.join(dizin, `${GECICI_ONEK}${path.basename(target)}.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* yoksay — asıl hata aşağıda fırlatılıyor */
    }
    throw err;
  }
}

/**
 * Çökmeden artakalan geçici dosyaları siler.
 *
 * Çökme `catch` bloğunu çalıştırmaz; yan dosya diskte kalır. Temizlenmezse
 * her çökme bir kopya daha bırakır ve büyük projelerde disk sessizce dolar —
 * §15.4'e göre disk dolması engelleyici bir hataya dönüşür. Açılışta bir kez
 * çağrılır.
 */
export function geciciDosyalariTemizle(dizin: string): number {
  let silinen = 0;
  let girisler: string[];
  try {
    girisler = fs.readdirSync(dizin);
  } catch {
    return 0;
  }
  for (const ad of girisler) {
    if (!ad.startsWith(GECICI_ONEK)) continue;
    try {
      fs.rmSync(path.join(dizin, ad), { force: true });
      silinen++;
    } catch {
      /* kilitli olabilir — bir sonraki açılışta yeniden denenir */
    }
  }
  return silinen;
}
