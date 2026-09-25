import {
  packProject,
  type AssetMap,
  type ExportProgress,
  type HistoryVersion,
  type PlatformAdapter,
  type PngExportRequest,
  type Project,
  type RecentProject,
  type SaveResult,
} from '@storyboard/core';
import { t } from '@storyboard/core/dil/arayuz';

const RECENT_KEY = 'storyboard:recent';
const HISTORY_KEY = (projectId: string) => `storyboard:history:${projectId}`;
const FILE_KEY = (projectId: string) => `storyboard:file:${projectId}`;
const MAX_VERSIONS = 10;

/** Kota dolduğunda en eski sürümleri atarak yazmayı dener. */
function writeWithQuotaRetry(
  key: string,
  list: { id: string; savedAt: number; data: string; size: number }[],
): void {
  let attempt = list.slice(0, MAX_VERSIONS);
  for (;;) {
    try {
      localStorage.setItem(key, JSON.stringify(attempt));
      return;
    } catch (err) {
      if (attempt.length <= 1) throw err;
      attempt = attempt.slice(0, attempt.length - 1);
    }
  }
}

/** Yalnızca http/https adreslerine izin verilir. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** `?sunucu=` parametresi sayfanın kendi kaynağından farklı bir sunucuyu gösteriyor mu? */
export function serverUrlFromQueryIsForeign(): boolean {
  const fromQuery = new URLSearchParams(location.search).get('sunucu');
  if (!fromQuery || !isHttpUrl(fromQuery)) return false;
  try {
    return new URL(fromQuery).origin !== location.origin;
  } catch {
    return true;
  }
}

function download(bytes: Uint8Array, name: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Tarayıcı platformu.
 *
 * Web istemcisi ortak çalışma için tasarlanmıştır: proje dosyası indirilebilir,
 * otomatik kayıt tarayıcı deposuna yazılır, video dışa aktarma yalnızca
 * masaüstünde (gömülü ffmpeg ile) yapılır.
 */
export const webPlatform: PlatformAdapter = {
  /* Tarayıcıda dosya sistemine ekleme yapılamaz; §15'in disk katmanları
     masaüstüne aittir. Web'in güvenliği ortak çalışma sunucusundadır ve bu
     boşluk §17'ye yazılı. `null` bilinçli: arayüz korumasız olduğunu
     söyleyebilsin. */
  veriGuvenligi: null,
  /* §16.4: tarayıcıda `setSpellCheckerLanguages` ve `safeStorage` yok.
     `null`, arayüzün "bu sürümde yazım denetimi yok" diyebilmesi için —
     yarısı çalışan bir kabuk vaadi, hiç olmayandan kötüdür. */
  dil: null,
  /* Tarayıcının işletim sistemi başlangıcına erişimi yok. */
  baslangic: null,
  /* Tarayıcıda kalıcı yazarlık günlüğü yok — §15'in disk katmanları gibi
     masaüstüne ait. */
  yazarlik: null,
  /* Tarayıcıda append-only kalıcı dosya yok ve RFC 3161 sunucuları CORS
     başlığı göndermiyor — doğrudan çağrı zaten çalışmazdı. Yarım bir kanıt
     katmanı göstermek kullanıcıya "kanıtım var" dedirtirdi. */
  kanit: null,
  kind: 'web',
  canSaveLocally: true,
  canExportVideo: false,

  async openProjectDialog() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sbp,application/zip';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const buffer = new Uint8Array(await file.arrayBuffer());
        resolve({ path: file.name, data: buffer });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  },

  async readProjectFile(path: string) {
    const raw = localStorage.getItem(FILE_KEY(path)) ?? localStorage.getItem(`storyboard:file:${path}`);
    if (!raw) throw new Error(t('Bu dosya tarayıcı deposunda bulunamadı.'));
    return fromBase64(raw);
  },

  async saveProject(project: Project, assets: AssetMap): Promise<SaveResult> {
    const data = await packProject({ project, assets });
    const name = `${project.meta.name || 'storyboard'}.sbp`;
    download(data, name, 'application/x-storyboard-project');
    pushRecent({ path: project.meta.id, name: project.meta.name, openedAt: Date.now() });
    return { path: name };
  },

  async autosave(project, assets) {
    const data = await packProject({ project, assets });
    const key = HISTORY_KEY(project.meta.id);
    const encoded = toBase64(data);
    try {
      const list: { id: string; savedAt: number; data: string; size: number }[] = JSON.parse(
        localStorage.getItem(key) ?? '[]',
      );
      list.unshift({ id: String(Date.now()), savedAt: Date.now(), data: encoded, size: data.length });
      // Kota dolduğunda en eski sürümleri atarak yeniden dene; hiç yer yoksa
      // hata yukarı verilir — sessizce yutulursa kullanıcı otomatik kaydın
      // çalıştığını sanır.
      writeWithQuotaRetry(key, list);
      // Dosya anahtarı proje KİMLİĞİne bağlıdır: ada bağlamak aynı adlı iki
      // projenin birbirini ezmesine yol açıyordu.
      localStorage.setItem(FILE_KEY(project.meta.id), encoded);
    } catch (err) {
      throw new Error(
        t('Tarayıcı deposu dolu — otomatik kayıt yapılamadı. Projeyi dosya olarak kaydedin.'),
      );
    }
  },

  async listRecentProjects(): Promise<RecentProject[]> {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    } catch {
      return [];
    }
  },

  async listVersions(projectId: string): Promise<HistoryVersion[]> {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY(projectId)) ?? '[]');
      return list.map((v: any) => ({
        id: v.id,
        savedAt: v.savedAt,
        label: t('Tarayıcı otomatik kaydı'),
        size: v.size ?? 0,
      }));
    } catch {
      return [];
    }
  },

  async restoreVersion(projectId: string, versionId: string) {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY(projectId)) ?? '[]');
      const found = list.find((v: any) => v.id === versionId);
      return found ? fromBase64(found.data) : null;
    } catch {
      return null;
    }
  },

  async exportPngZip(_req: PngExportRequest): Promise<SaveResult> {
    // Web'de ZIP paketleme ve indirme dışa aktarma diyaloğunda yapılır.
    return { path: null, cancelled: false };
  },

  async exportVideo(): Promise<SaveResult> {
    throw new Error(
      t('Animatik video dışa aktarma yalnızca masaüstü uygulamasında kullanılabilir (gömülü ffmpeg).'),
    );
  },

  async cancelExport() {
    /* web'de kuyruk yok */
  },

  onExportProgress(_cb: (p: ExportProgress) => void) {
    return () => {};
  },

  defaultServerUrl() {
    // `?sunucu=` yalnızca http(s) olabilir. Doğrulanmadan kullanılırsa
    // hazırlanmış bir davet linki istemciyi saldırganın sunucusuna bağlar
    // ve davet token'ı ile proje dokümanı oraya gider.
    const fromQuery = new URLSearchParams(location.search).get('sunucu');
    if (fromQuery && isHttpUrl(fromQuery)) return fromQuery;
    const env = (import.meta as any).env?.VITE_SERVER_URL;
    return env ?? `${location.protocol}//${location.hostname}:5180`;
  },
};

function pushRecent(entry: RecentProject) {
  try {
    const list: RecentProject[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([entry, ...list.filter((r) => r.path !== entry.path)].slice(0, 20)),
    );
  } catch {
    /* kota — yoksay */
  }
}
