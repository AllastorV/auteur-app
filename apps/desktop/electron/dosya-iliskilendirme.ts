import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * `.sbp` DOSYA İLİŞKİLENDİRMESİ — taşınabilir sürüm için.
 *
 * Kullanıcı hatası (2026-08-27): "kaydedilen dosyalarda ikon sorunu var,
 * bizim dosya ikonu gözükmüyor."
 *
 * ## Neden kurulum paketi değil
 *
 * `electron-builder`ın NSIS hedefi bu makinede üretilemiyor: `makensis.exe`
 * imzasız ve Windows Smart App Control onu başlatmayı reddediyor
 * (`spawn UNKNOWN`). Taşınabilir exe ise Windows'a hiçbir kayıt YAZMAZ —
 * dolayısıyla ikon da ilişkilendirme de oluşmuyordu.
 *
 * Taşınabilir dağıtım için bu zaten daha doğru: kullanıcı exe'yi nereye
 * koyarsa ilişkilendirme oraya bağlanıyor, kuruluma gerek kalmıyor.
 *
 * ## HKCU — yönetici YETKİSİ İSTEMİYOR
 *
 * Kayıtlar `HKEY_CURRENT_USER\Software\Classes` altına yazılıyor. Makine
 * geneli (`HKLM`) yükseltme isterdi ve taşınabilir bir programın kullanıcıdan
 * yönetici hakkı istemesi kabul edilemez.
 *
 * ## KULLANICI İSTEMEDEN YAZILMIYOR
 *
 * Sistem ayarını değiştirmek kullanıcının kararı: bu modül yalnız Ayarlar
 * penceresindeki düğmeden çağrılıyor. Açılışta sessizce yazmak, programın
 * izinsiz sistem değişikliği yapması olurdu.
 */

/** Kayıt sınıfının adı — `appId` ile aynı ailede, çakışmayacak kadar özgün. */
const SINIF = 'Auteur.Proje';
const UZANTI = '.sbp';

export interface IliskilendirmeSonucu {
  ok: boolean;
  /** Başarısızsa kullanıcıya gösterilecek sebep. Sessiz hata YOK (§15.4). */
  hata: string | null;
}

/**
 * Kayıt yazıcısı DIŞARIDAN veriliyor: gerçek `reg.exe` çağrısı olmadan
 * birim testi yazılabilsin. Üretimde `regYaz` kullanılıyor.
 */
export type RegYazici = (yol: string, ad: string, deger: string) => void;

/** Yazılacak kayıtların TAM listesi — tek ev, test bunu okuyor. */
export function kayitlar(exeYolu: string, ikonYolu: string): [string, string, string][] {
  const komut = `"${exeYolu}" "%1"`;
  return [
    /* Uzantı → sınıf. `Software\\Classes` altındaki kayıt, makine geneli
       kaydı EZMEDEN yalnız bu kullanıcı için geçerli olur. */
    [`HKCU\\Software\\Classes\\${UZANTI}`, '', SINIF],
    [`HKCU\\Software\\Classes\\${SINIF}`, '', 'Auteur Projesi'],
    /* İkon: exe'nin yanındaki .ico. Exe'nin İÇİNDEKİ ikon (`,0`) uygulama
       ikonu olurdu — dosya ikonu AYRI çizim (belge sayfası) ve kullanıcı
       ikisini karıştırmamalı. */
    [`HKCU\\Software\\Classes\\${SINIF}\\DefaultIcon`, '', ikonYolu],
    [`HKCU\\Software\\Classes\\${SINIF}\\shell\\open\\command`, '', komut],
  ];
}

/** `reg.exe` ile tek bir değer yazar. */
function regYaz(yol: string, ad: string, deger: string): void {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  const arg = ['add', yol, '/ve', '/t', 'REG_SZ', '/d', deger, '/f'];
  if (ad) { arg.splice(2, 1, '/v', ad); }
  execFileSync('reg.exe', arg, { windowsHide: true });
}

/**
 * Dosya ikonunun yolu.
 *
 * Paketli sürümde `resources/` altında (extraResources), geliştirmede
 * depodaki `build/` klasöründe. Bulunamazsa `null` — ikonsuz bir
 * ilişkilendirme yazmak, kullanıcıya "ikon geldi" izlenimi verip yine
 * boş bir kare göstermek olurdu.
 */
export function ikonYolunuBul(): string | null {
  const adaylar = [
    path.join(process.resourcesPath ?? '', 'dosya.ico'),
    path.join(app.getAppPath(), '..', 'dosya.ico'),
    path.join(app.getAppPath(), 'build', 'dosya.ico'),
    path.join(app.getAppPath(), '..', '..', 'build', 'dosya.ico'),
  ];
  return adaylar.find((y) => y && fs.existsSync(y)) ?? null;
}

/**
 * `.sbp` uzantısını bu uygulamaya bağlar.
 *
 * Yalnız Windows'ta anlamlı; başka platformda `ok: false` ve sebebiyle
 * döner — sessizce başarılı gibi davranmak yasak.
 */
export function iliskilendir(
  yaz: RegYazici = regYaz,
  exeYolu: string = process.execPath,
  ikon: string | null = ikonYolunuBul(),
): IliskilendirmeSonucu {
  if (process.platform !== 'win32') {
    return { ok: false, hata: 'Dosya ilişkilendirmesi yalnız Windows’ta yapılabiliyor.' };
  }
  if (!ikon) {
    return { ok: false, hata: 'Dosya simgesi (dosya.ico) bulunamadı; ilişkilendirme yazılmadı.' };
  }
  try {
    for (const [yol, ad, deger] of kayitlar(exeYolu, ikon)) yaz(yol, ad, deger);
    return { ok: true, hata: null };
  } catch (err) {
    return { ok: false, hata: err instanceof Error ? err.message : String(err) };
  }
}
