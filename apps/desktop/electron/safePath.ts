import path from 'node:path';
import { AUTOSAVE_DIR, HISTORY_DIR } from './paths';
import { readRecent } from './store';

/**
 * Renderer'dan gelen dosya yollarının doğrulanması.
 *
 * Renderer güvenilir bir kaynak değildir (içeriği ortak çalışma oturumundan
 * beslenir). Doğrulanmamış bir yol IPC üzerinden keyfi dosya okuma/yazmaya
 * dönüşür; bu yüzden yol hem uzantı hem de izin verilen kök dizin bakımından
 * denetlenir.
 */

/**
 * Dışarıya yalnızca http/https açılır — şema denetlenmezse renderer
 * `file:`/`javascript:`/UNC yollarıyla işletim sisteminde keyfi hedef açtırabilir.
 */
export function isExternalHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Kullanıcının dialog ile açtığı/kaydettiği yollar oturum boyunca hatırlanır. */
const allowedFiles = new Set<string>();

export function allowFile(filePath: string): string {
  allowedFiles.add(path.resolve(filePath));
  return filePath;
}

function isInside(dir: string, target: string): boolean {
  const rel = path.relative(path.resolve(dir), target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Proje dosyası yolunu doğrular: yalnızca `.sbp`, ve yalnızca kullanıcının
 * bu oturumda dialog ile seçtiği dosyalar ya da uygulamanın kendi
 * otomatik kayıt / sürüm geçmişi klasörleri.
 */
export function safeProjectPath(filePath: unknown): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Geçersiz dosya yolu.');
  }
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLowerCase() !== '.sbp') {
    throw new Error('Yalnızca .sbp dosyaları açılabilir.');
  }
  if (allowedFiles.has(resolved)) return resolved;
  if (isInside(AUTOSAVE_DIR(), resolved)) return resolved;
  // "Son projeler" listesi kullanıcının daha önce dialog ile seçtiği
  // dosyalardan oluşur ve uygulamanın kendisi tarafından yazılır.
  if (readRecent().some((r) => path.resolve(r.path) === resolved)) return resolved;
  throw new Error('Bu konuma erişim izni yok.');
}

/**
 * Kullanıcının BU oturumda dialog ile seçtiği bir yolu doğrular — video
 * çıktısı ve ses girdisi gibi proje-dışı medya dosyaları için.
 *
 * Tarama bulgusu 3 (2026-08-27): `export:video` renderer'ın verdiği
 * `outputPath`i denetimsiz kullanıyordu — ffmpeg çıktısıyla diskte KEYFİ
 * bir dosyanın üstüne yazılabilirdi (ör. `oturum.log`), `audioPath` ile de
 * keyfi dosya okunabilirdi. Renderer güvenilir değil (içeriği ortak
 * çalışma oturumundan beslenebilir); `safeProjectPath` tam bu yüzden var,
 * bu uçlar onu atlıyordu. Buradaki kural aynı: yalnız dialog'dan geçmiş
 * (`allowFile`) yollar, yalnız beklenen uzantılar.
 */
export function safeChosenMediaPath(
  filePath: unknown,
  uzantilar: readonly string[],
  etiket: string,
): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(`Geçersiz ${etiket} yolu.`);
  }
  const resolved = path.resolve(filePath);
  const uzanti = path.extname(resolved).toLowerCase().replace(/^\./, '');
  if (!uzantilar.includes(uzanti)) {
    throw new Error(`Geçersiz ${etiket} uzantısı: ${uzanti || '(yok)'}`);
  }
  if (!allowedFiles.has(resolved)) {
    throw new Error(`Bu ${etiket} konumuna erişim izni yok.`);
  }
  return resolved;
}

/** Sürüm geçmişi kimliklerini doğrular — yol ayracı ya da `..` kabul etmez. */
export function safeHistoryId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Geçersiz ${label}.`);
  }
  if (value !== path.basename(value) || value === '.' || value === '..') {
    throw new Error(`Geçersiz ${label}.`);
  }
  return value;
}

/** Sürüm dosyasının gerçekten proje geçmişi klasöründe kaldığını doğrular. */
export function safeVersionPath(projectId: string, versionId: string): string {
  const id = safeHistoryId(projectId, 'proje kimliği');
  const version = safeHistoryId(versionId, 'sürüm kimliği');
  if (path.extname(version).toLowerCase() !== '.sbp') {
    throw new Error('Geçersiz sürüm kimliği.');
  }
  const dir = HISTORY_DIR(id);
  const target = path.resolve(dir, version);
  if (!isInside(dir, target)) throw new Error('Geçersiz sürüm kimliği.');
  return target;
}
