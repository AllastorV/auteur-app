import fs from 'node:fs';
import path from 'node:path';
import { HISTORY_DIR, RECENT_FILE, STARTUP_FILE } from './paths';
/* Atomik yazma kendi modülünde yaşıyor: §15.5'in çökme testi onu Electron'suz
   bir alt süreçte yüklemek zorunda (bkz. `atomik.ts` başlığı). */
import { writeFileAtomic } from './atomik';

export { writeFileAtomic } from './atomik';

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
  /** Belge tipinin okunabilir adı — kitaplıktaki kapağın alt satırı.
      İsteğe bağlı: bu alandan önce yazılmış kayıtlarda yok. */
  tip?: string;
}

const MAX_RECENT = 20;
export const MAX_VERSIONS = 10;

/**
 * Son açılan projeler — DİSKTE OLMAYANLAR SÜZÜLÜR.
 *
 * Kullanıcı hatası (2026-08-27): "projeyi pcden silmeme rağmen kitaplıkta
 * hâlâ duruyor." Liste yalnız bir kayıttı; dosyanın hâlâ var olup
 * olmadığına hiç bakılmıyordu. Kullanıcı tıklayınca "açılamadı" hatası
 * alıyordu — kitaplık, olmayan bir şeyi varmış gibi gösteriyordu.
 *
 * Süzme DİSKE GERİ YAZILMIYOR: ağ sürücüsü ya da çıkarılabilir disk
 * geçici olarak erişilemez olabilir ve o an listeyi kalıcı budamak,
 * kullanıcının projesini kendi elimizle unutmak olurdu. Dosya geri
 * geldiğinde kayıt da geri gelir.
 */
export function readRecent(): RecentProject[] {
  return readRecentRaw().filter((r) => {
    try {
      return fs.existsSync(r.path);
    } catch {
      /* Erişim hatası (izin, kopmuş ağ yolu): kayıt KORUNUYOR ama
         gösterilmiyor — var olduğunu da yok olduğunu da bilmiyoruz. */
      return false;
    }
  });
}

/** Ham kayıt — süzmesiz. Yazma yolu bunu kullanır ki süzme kalıcı olmasın. */
function readRecentRaw(): RecentProject[] {
  try {
    const raw = fs.readFileSync(RECENT_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentProject): void {
  /* HAM liste: süzülmüş listeyle yazmak, o an erişilemeyen projeleri
     kalıcı olarak silerdi. */
  const list = readRecentRaw().filter((r) => r.path !== entry.path);
  list.unshift(entry);
  try {
    writeFileAtomic(RECENT_FILE(), Buffer.from(JSON.stringify(list.slice(0, MAX_RECENT), null, 2)));
  } catch {
    /* yazılamadı — kritik değil */
  }
}

export interface HistoryVersion {
  id: string;
  savedAt: number;
  label: string;
  size: number;
  /** Bu sürümü kaydeden kişinin adı. Eş dosyası olmayan eski sürümlerde YOK. */
  savedBy?: string;
}

const MAX_SAVED_BY_LEN = 100;

/**
 * Renderer'dan gelen yazan adını güvenli hale getirir — renderer güvenilmez
 * bir kaynak (bkz. `safePath.ts` başlığı). Kontrol/satır sonu karakterleri
 * temizlenir, uzunluk sınırlanır. Bu değer DOSYA ADI olarak KULLANILMIYOR —
 * yalnız eş JSON dosyasının içeriğinde saklanıyor; yol sınırı zaten
 * `safeHistoryId`'de.
 */
function temizSavedBy(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const temiz = value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_SAVED_BY_LEN);
  return temiz || null;
}

/** Bir `.sbp` sürüm dosyasının yanındaki "kim kaydetti" eş dosyasının adı. */
const yazanDosyasi = (sbpId: string) => sbpId.replace(/\.sbp$/, '.json');

/** Otomatik kayıt sürümünü geçmişe yazar ve en eskileri budar. */
export function writeVersion(
  projectId: string,
  projectName: string,
  data: Uint8Array,
  savedBy?: unknown,
): void {
  const dir = HISTORY_DIR(projectId);
  const id = `${Date.now()}.sbp`;
  writeFileAtomic(path.join(dir, id), data);

  const yazan = temizSavedBy(savedBy);
  if (yazan) {
    try {
      writeFileAtomic(path.join(dir, yazanDosyasi(id)), Buffer.from(JSON.stringify({ savedBy: yazan })));
    } catch {
      /* yoksay — sürüm zaten yazıldı, yazan bilgisi eksik kalabilir */
    }
  }

  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sbp'))
    .sort()
    .reverse();
  for (const stale of entries.slice(MAX_VERSIONS)) {
    try {
      fs.unlinkSync(path.join(dir, stale));
    } catch {
      /* yoksay */
    }
    try {
      fs.unlinkSync(path.join(dir, yazanDosyasi(stale)));
    } catch {
      /* eş dosya hiç yazılmamış olabilir — yoksay */
    }
  }

  try {
    writeFileAtomic(path.join(dir, 'meta.json'), Buffer.from(JSON.stringify({ projectName }, null, 2)));
  } catch {
    /* yoksay */
  }
}

export function listVersions(projectId: string): HistoryVersion[] {
  const dir = HISTORY_DIR(projectId);
  let label = 'Otomatik kayıt';
  try {
    label = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).projectName ?? label;
  } catch {
    /* meta yok */
  }
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sbp'))
      .map((f) => {
        const savedAt = Number(f.replace('.sbp', '')) || 0;
        const size = fs.statSync(path.join(dir, f)).size;
        let savedBy: string | undefined;
        try {
          const esDosya = JSON.parse(fs.readFileSync(path.join(dir, yazanDosyasi(f)), 'utf8'));
          savedBy = temizSavedBy(esDosya.savedBy) ?? undefined;
        } catch {
          /* eş dosya yok — eski sürüm ya da yazan adı boş kaydedilmiş */
        }
        return { id: f, savedAt, label: `${label} — otomatik kayıt`, size, savedBy };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Doğrulanmış tam yoldan sürüm okur (bkz. `safePath.safeVersionPath`). */
export function readVersion(versionPath: string): Buffer | null {
  try {
    return fs.readFileSync(versionPath);
  } catch {
    return null;
  }
}

/** "PC açılınca otomatik başlat" / "Küçültülmüş başla" tercihi. */
export interface StartupSettings {
  /**
   * `openAtLogin` işletim sisteminden okunur (bkz. `main.ts`), ama
   * login-item'ın `args`'ı platformlar arası güvenilir GERİ OKUNAMIYOR —
   * bu yüzden yalnız bu bayrak burada saklanıyor.
   */
  kucukBasla: boolean;
}

export function readStartupSettings(): StartupSettings {
  try {
    const raw = fs.readFileSync(STARTUP_FILE(), 'utf8');
    return { kucukBasla: Boolean(JSON.parse(raw)?.kucukBasla) };
  } catch {
    return { kucukBasla: false };
  }
}

export function writeStartupSettings(settings: StartupSettings): void {
  try {
    writeFileAtomic(STARTUP_FILE(), Buffer.from(JSON.stringify(settings, null, 2)));
  } catch {
    /* yazılamadı — kritik değil, ayarlar diyaloğu tekrar denenebilir */
  }
}
