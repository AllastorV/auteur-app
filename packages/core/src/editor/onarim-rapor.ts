import type { Onarim } from './sema';

/**
 * Karar 10'un GÖRÜNMEYEN yarısı: onarım raporunun kullanıcıya ulaşması.
 *
 * `docToBloklar` bozuk kimliği onarıyor ve raporluyordu, ama raporu kimse
 * okumuyordu — yani belge sessizce onarılıp açılıyordu. Spec §12 F1c'nin
 * bitiş kriteri bunu açıkça yasaklıyor: "onarılmış belge kullanıcıya sessizce
 * AÇILMAZ".
 *
 * ## Neden bildirim (toast) DEĞİL, şerit
 *
 * Onarım OKUMA yolunda yapılıyor ve belgeye geri yazılmıyor: aynı bozuk
 * `Y.Doc` her okunduğunda aynı raporu yeniden üretir. Bildirim her tuş
 * vuruşunda yeniden patlardı. Şerit ise durumu anlatır ve kullanıcı
 * kapatana kadar durur.
 */

export interface OnarimOzeti {
  toplam: number;
  kimliksiz: number;
  yinelenen: number;
}

export function onarimOzeti(onarimlar: readonly Onarim[]): OnarimOzeti {
  let kimliksiz = 0;
  let yinelenen = 0;
  for (const o of onarimlar) {
    if (o.sebep === 'kimliksiz') kimliksiz++;
    else yinelenen++;
  }
  return { toplam: onarimlar.length, kimliksiz, yinelenen };
}

/**
 * Kullanıcıya gösterilecek metin. Sağlam belgede BOŞ dizge.
 *
 * Üç şeyi söylemek zorunda: ne olduğu, neyin kaybolmadığı, ne yapılacağı.
 * "Bir sorun oluştu" demek kullanıcıyı metninden şüphe ettirir; sorunun
 * metne DEĞİL kimliklere dokunduğunu söylemek onu rahatlatır.
 *
 * "Kaydettiğinde kalıcı olur" ÖLÇÜLDÜ, varsayılmadı: kayıt yolu
 * `docToProject` → `scriptDocu` → `readScript` üzerinden geçiyor, yani
 * dosyaya ONARILMIŞ kimlikler yazılıyor ve dosya yeniden açıldığında rapor
 * boş dönüyor (bkz. `tests/onarim-rapor.test.ts`).
 */
export function onarimMesaji(onarimlar: readonly Onarim[]): string {
  const o = onarimOzeti(onarimlar);
  if (o.toplam === 0) return '';
  const parcalar: string[] = [];
  if (o.yinelenen > 0) parcalar.push(`${o.yinelenen} yinelenen`);
  if (o.kimliksiz > 0) parcalar.push(`${o.kimliksiz} eksik`);
  return (
    `Belge açılırken ${o.toplam} blok kimliği onarıldı (${parcalar.join(', ')}). ` +
    `Metin kaybı yok — onarım yalnız kimliklere dokundu; panel bağları ` +
    `etkilenmiş olabilir. Kaydettiğinde onarım kalıcı olur.`
  );
}

/**
 * Şeridin kapatılma durumunu bağlayan kimlik.
 *
 * Rapor her okumada yeniden üretiliyor; dizi kimliğine (referansa) bakmak
 * şeridi her tuş vuruşunda geri getirirdi. İÇERİĞE bakılıyor: aynı bozukluk
 * = aynı anahtar = kapatılmış kalır, YENİ bir bozukluk = yeni anahtar =
 * şerit geri gelir. Kullanıcının bir kez kapattığı uyarı, ikinci bir
 * bozukluğu da gizleseydi §15.4'ün sessiz başarısızlık yasağını çiğnerdi.
 */
export function onarimAnahtari(onarimlar: readonly Onarim[]): string {
  return onarimlar.map((o) => `${o.indeks}:${o.sebep}:${o.atanan}`).join('|');
}
