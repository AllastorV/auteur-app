import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Electron yalnızca ana süreçte vardır; test ortamında modül yüklenemez.
function electronApp(): { getPath(name: string): string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('electron').app ?? null;
  } catch {
    return null;
  }
}

/** Paketlenmiş uygulamada asar dışına çıkarılan ikili dosyanın yolu. */
export function unpacked(p: string): string {
  return p.includes('app.asar') ? p.replace('app.asar', 'app.asar.unpacked') : p;
}

export function ffmpegPath(): string | null {
  try {
    // ffmpeg-static varsayılan dışa aktarımı ikili dosyanın mutlak yoludur.
    const mod = require('ffmpeg-static');
    const raw: string | null = typeof mod === 'string' ? mod : mod?.default ?? null;
    if (!raw) return null;
    const resolved = unpacked(raw);
    return fs.existsSync(resolved) ? resolved : fs.existsSync(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Kullanıcı verisinin kökü. DIŞA AÇIK çünkü testler burayı temizliyor ve
 * yolun İKİNCİ bir yazılışı olmamalı (Karar 2).
 *
 * Electron yokken — yani yalnızca testlerde ve yardımcı betiklerde — veri
 * ÇALIŞMA DİZİNİNE DEĞİL geçici dizine yazılıyor. Gerekçesi ölçüldü
 * (2026-08-31): proje bir bulut senkron klasörüne taşınınca senkron ajanı
 * yeni oluşan `.storyboard-data`yı indekslemek için açık tutuyor ve testin
 * `rmSync`i EPERM ile düşüyor. Hata ARALIKLI: yarışı kim kazanırsa. Test
 * çöpünün kullanıcının senkron kotasına yazılmasının da anlamı yoktu.
 */
export function userDataRoot(): string {
  const app = electronApp();
  return app ? app.getPath('userData') : path.join(os.tmpdir(), 'storyboard-test-verisi');
}

export function userDataDir(...parts: string[]): string {
  const dir = path.join(userDataRoot(), ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const RECENT_FILE = () => path.join(userDataRoot(), 'recent.json');
/** Başlangıç ayarları — "PC açılınca otomatik başlat" / "Küçültülmüş başla". */
export const STARTUP_FILE = () => path.join(userDataRoot(), 'baslangic.json');
export const HISTORY_DIR = (projectId: string) => userDataDir('history', projectId);
export const AUTOSAVE_DIR = () => userDataDir('autosave');
/**
 * §15 veri güvenliği kökü — uygulama verisinde, proje dosyasının yanında
 * DEĞİL. Gerekçe: proje henüz hiç kaydedilmemiş olabilir (yeni proje, "farklı
 * kaydet" yapılmamış), ama yazılanlar o andan itibaren korunmak zorunda.
 */
export const VERI_KOK = () => userDataDir('veri');
