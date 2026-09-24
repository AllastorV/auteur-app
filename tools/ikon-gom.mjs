/**
 * EXE'YE İKON VE SÜRÜM BİLGİSİ GÖMER.
 *
 * ## Neden ayrı bir adım
 *
 * Bunu normalde `electron-builder` yapar (`rcedit` ile), ama bu makinede
 * yapamıyor: `winCodeSign` paketini açarken macOS sembolik bağlarını
 * kuramıyor ("Cannot create symbolic link — gereken ayrıcalık istemci
 * tarafından sağlanmıyor") ve bütün düzenleme adımı düşüyor. Sonuç sessiz:
 * derleme "başarılı" diyor, exe Electron'un kendi simgesiyle çıkıyor ve
 * kısayolda Electron logosu görünüyor — kullanıcının bildirdiği hata buydu.
 *
 * `signAndEditExecutable: false` bunu ayrıca kapatıyordu; o bayrak yalnız
 * imzalamayı değil KAYNAK DÜZENLEMEYİ de kapatıyor.
 *
 * Bu betik `rcedit`i doğrudan çağırıyor — aynı ikili, aracı katman yok.
 *
 * ## Sürüm bilgisi de gömülüyor
 *
 * Yalnız ikon değil: dosya açıklaması, ürün adı ve sürüm de. Bunlar
 * gömülmezse Görev Yöneticisi'nde ve dosya özelliklerinde "Electron"
 * yazar — kullanıcı hangi programın çalıştığını göremez.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Yollar BETİĞİN KENDİ konumundan çözülüyor, çalışma dizininden değil:
   npm script'i `apps/desktop` içinde koşuyor ve göreli yol orada başka
   bir yere düşüyordu (ölçüldü — "Exe bulunamadı"). */
const DEPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KOK = path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache', 'winCodeSign');

/** Önbellekteki `rcedit-x64.exe` — sürüm klasörü değişebiliyor, aranıyor. */
function rceditBul() {
  if (!existsSync(KOK)) return null;
  for (const alt of readdirSync(KOK)) {
    const aday = path.join(KOK, alt, 'rcedit-x64.exe');
    if (existsSync(aday) && statSync(aday).isFile()) return aday;
  }
  return null;
}

const exe = process.argv[2]
  ?? path.join(DEPO, 'apps/desktop/release/win-unpacked/Auteur.exe');
const ikon = process.argv[3] ?? path.join(DEPO, 'apps/desktop/build/icon.ico');

if (!existsSync(exe)) {
  console.error(`Exe bulunamadı: ${exe} — önce paketleyin.`);
  process.exit(1);
}
const rcedit = rceditBul();
if (!rcedit) {
  /* SESSİZ GEÇMİYOR: ikonsuz bir exe üretip "tamam" demek, kullanıcıya
     Electron logosu göstermek demek. */
  console.error('rcedit bulunamadı (winCodeSign önbelleği yok). İkon GÖMÜLMEDİ.');
  process.exit(1);
}

execFileSync(rcedit, [
  exe,
  '--set-icon', ikon,
  '--set-version-string', 'CompanyName', 'Auteur',
  '--set-version-string', 'ProductName', 'Auteur',
  '--set-version-string', 'FileDescription', 'Auteur — senaryo ve storyboard',
  '--set-version-string', 'LegalCopyright', 'Auteur',
  '--set-version-string', 'OriginalFilename', 'Auteur.exe',
  '--set-file-version', '0.1.0.0',
  '--set-product-version', '0.1.0.0',
], { stdio: 'inherit' });

console.log(`İkon ve sürüm bilgisi gömüldü: ${exe}`);
