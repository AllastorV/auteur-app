/**
 * Bir zaman damgasını insana göre söyler — "14 dakika önce", "1 saat 20
 * dakika önce". Panikteyken açılan bir kurtarma ekranında kesin saat
 * ("14:03:22") kullanıcının işine yaramaz; "20 dakika önce" yarar.
 *
 * Bileşik birim (saat + dakika) `Intl.RelativeTimeFormat` ile ifade
 * edilemiyor — o tek birim veriyor ("1 saat önce"). Bu yüzden elle.
 */
export function insanaGoreZaman(zamanMs: number, simdi: number = Date.now()): string {
  const farkSn = Math.max(0, Math.round((simdi - zamanMs) / 1000));
  if (farkSn < 60) return 'az önce';

  const dakika = Math.floor(farkSn / 60);
  if (dakika < 60) return `${dakika} dakika önce`;

  const saat = Math.floor(dakika / 60);
  const kalanDakika = dakika % 60;
  if (saat < 24) {
    return kalanDakika > 0 ? `${saat} saat ${kalanDakika} dakika önce` : `${saat} saat önce`;
  }

  const gun = Math.floor(saat / 24);
  const kalanSaat = saat % 24;
  return kalanSaat > 0 ? `${gun} gün ${kalanSaat} saat önce` : `${gun} gün önce`;
}
