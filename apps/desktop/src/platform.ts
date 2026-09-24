import {
  DOKUMAN_TIPLERI,
  dokumanTipi,
  packProject,
  type AssetMap,
  type ExportProgress,
  type HistoryVersion,
  type PlatformAdapter,
  type DosyaKaydetIstegi,
  type PngExportRequest,
  type Project,
  type RecentProject,
  type SaveResult,
  type VideoExportRequest,
  type YazarlikKaydi,
} from '@storyboard/core';
import type { ZincirDurumu, ZincirKaydi } from '@storyboard/core/veri/zincir';

declare global {
  interface Window {
    storyboard?: {
      openProjectDialog(): Promise<{ path: string; data: Uint8Array } | null>;
      readProjectFile(path: string): Promise<Uint8Array>;
      saveProject(payload: unknown): Promise<SaveResult>;
      autosave(payload: unknown): Promise<{ path: string }>;
      listRecentProjects(): Promise<RecentProject[]>;
      listVersions(projectId: string): Promise<HistoryVersion[]>;
      restoreVersion(projectId: string, versionId: string): Promise<Uint8Array | null>;
      exportPngZip(payload: PngExportRequest): Promise<SaveResult>;
      dosyaKaydet(payload: DosyaKaydetIstegi): Promise<SaveResult>;
      exportVideo(payload: VideoExportRequest): Promise<SaveResult>;
      pushVideoFrame(payload: unknown): Promise<{ frames: number }>;
      discardVideoFrames(jobId: string): Promise<void>;
      cancelExport(jobId: string): Promise<void>;
      pickAudioFile(): Promise<string | null>;
      onExportProgress(cb: (p: ExportProgress) => void): () => void;
      gunlugeEkle(projeId: string, cerceveler: Uint8Array): Promise<void>;
      gunlukOku(projeId: string): Promise<Uint8Array | null>;
      cipaYazVeGunlugeKes(projeId: string, cipa: Uint8Array): Promise<void>;
      cipaHalkasi(projeId: string): Promise<{ id: string; zaman: number }[]>;
      cipaOku(projeId: string, id: string): Promise<Uint8Array>;
      eksikVarliklar(projeId: string, id: string): Promise<string[]>;
      gunluguArsivle(projeId: string): Promise<string | null>;
      serverUrl(): Promise<string>;
      onMenuAction(cb: (action: string) => void): () => void;
      onProjeDosyasiAc(cb: (yol: string) => void): () => void;
      setDirty(dirty: boolean): void;
      dosyaIliskilendir?(): Promise<{ ok: boolean; hata: string | null }>;
      baslangicAyarlariOku?(): Promise<{ otoBaslat: boolean; kucukBasla: boolean }>;
      baslangicAyarlariYaz?(ayarlar: { otoBaslat: boolean; kucukBasla: boolean }): Promise<void>;
      dil?: {
        denetimDilleri(): Promise<string[]>;
        denetimDilleriniAyarla(diller: string[]): Promise<void>;
        sozlugüYükle(kelimeler: string[]): Promise<void>;
        anahtarYaz(saglayici: string, anahtar: string): Promise<void>;
        anahtarOku(saglayici: string): Promise<string | null>;
      };
      yazarlik?: {
        ekle(projeId: string, kayitlar: YazarlikKaydi[]): Promise<void>;
        oku(projeId: string): Promise<YazarlikKaydi[]>;
      };
      kanit?: {
        muhurYaz(projeId: string, kayit: ZincirKaydi, metin: Uint8Array): Promise<void>;
        damgaYaz(projeId: string, kayit: ZincirKaydi, jeton: Uint8Array): Promise<void>;
        oku(projeId: string): Promise<{ kayitlar: ZincirKaydi[]; durum: ZincirDurumu }>;
        muhurMetni(projeId: string, zaman: number): Promise<Uint8Array | null>;
        damgaJetonu(projeId: string, zaman: number): Promise<Uint8Array | null>;
      };
    };
  }
}

let cachedServerUrl = 'http://localhost:5180';
void window.storyboard?.serverUrl().then((url) => {
  cachedServerUrl = url;
});

/** Electron ana süreci üzerinden çalışan masaüstü platform bağdaştırıcısı. */
/**
 * §15 katmanı. Köprü yoksa `null` — arayüz o zaman korumasız olduğunu
 * SÖYLEMEK zorunda; yarım uygulanmış bir katman sessizce korunuyormuş gibi
 * görünürdü.
 */
const veriGuvenligi: PlatformAdapter['veriGuvenligi'] = window.storyboard
  ? {
      gunlugeEkle: (projeId, cerceveler) => window.storyboard!.gunlugeEkle(projeId, cerceveler),
      gunlukOku: (projeId) => window.storyboard!.gunlukOku(projeId),
      cipaYazVeGunlugeKes: (projeId, cipa) =>
        window.storyboard!.cipaYazVeGunlugeKes(projeId, cipa),
      cipaHalkasi: (projeId) => window.storyboard!.cipaHalkasi(projeId),
      cipaOku: (projeId, id) => window.storyboard!.cipaOku(projeId, id),
      eksikVarliklar: (projeId, id) => window.storyboard!.eksikVarliklar(projeId, id),
      gunluguArsivle: (projeId) => window.storyboard!.gunluguArsivle(projeId),
    }
  : null;

/* §16.4 dil araçları. HEPSİ YA DA HİÇBİRİ: köprü eksikse `null` döner ve
   arayüz denetimin olmadığını söyler. */
const dil: PlatformAdapter['dil'] = window.storyboard?.dil
  ? {
      denetimDilleri: () => window.storyboard!.dil!.denetimDilleri(),
      denetimDilleriniAyarla: (d) => window.storyboard!.dil!.denetimDilleriniAyarla([...d]),
      sozlugüYükle: (k) => window.storyboard!.dil!.sozlugüYükle([...k]),
      anahtarYaz: (s, a) => window.storyboard!.dil!.anahtarYaz(s, a),
      anahtarOku: (s) => window.storyboard!.dil!.anahtarOku(s),
    }
  : null;

/* Başlangıç ayarları — HEPSİ YA DA HİÇBİRİ: köprü eksikse `null` döner ve
   arayüz Ayarlar diyaloğunda bu bölümün olmadığını söyleyebilir. */
/* İlişkilendirme yalnız kabuk desteklerse görünür — desteklemeyen bir
   sürümde Ayarlar'da çalışmayan bir düğme durmasın. */
const iliskilendirme: PlatformAdapter['iliskilendirme'] = window.storyboard?.dosyaIliskilendir
  ? { bagla: () => window.storyboard!.dosyaIliskilendir!() }
  : null;

const baslangic: PlatformAdapter['baslangic'] = window.storyboard?.baslangicAyarlariOku
  ? {
      oku: () => window.storyboard!.baslangicAyarlariOku!(),
      yaz: (ayarlar) => window.storyboard!.baslangicAyarlariYaz!(ayarlar),
    }
  : null;

/* Yazarlık günlüğü — HEPSİ YA DA HİÇBİRİ: köprü eksikse `null` döner ve
   arayüz "kim yazdı" sorgusunun bu sürümde yanıtsız kaldığını söyleyebilir. */
/* MÜHÜR ZİNCİRİ — yazarlıkla aynı "hepsi ya da hiçbiri" kuralı. Köprü
   eksikse `null`: yarım bir kanıt katmanı, kullanıcıya olmayan bir güvence
   vaat ederdi. */
const kanit: PlatformAdapter['kanit'] = window.storyboard?.kanit
  ? {
      muhurYaz: (projeId, kayit, metin) => window.storyboard!.kanit!.muhurYaz(projeId, kayit, metin),
      damgaYaz: (projeId, kayit, jeton) => window.storyboard!.kanit!.damgaYaz(projeId, kayit, jeton),
      oku: (projeId) => window.storyboard!.kanit!.oku(projeId),
      muhurMetni: (projeId, zaman) => window.storyboard!.kanit!.muhurMetni(projeId, zaman),
      damgaJetonu: (projeId, zaman) => window.storyboard!.kanit!.damgaJetonu(projeId, zaman),
    }
  : null;

const yazarlik: PlatformAdapter['yazarlik'] = window.storyboard?.yazarlik
  ? {
      ekle: (projeId, kayitlar) => window.storyboard!.yazarlik!.ekle(projeId, kayitlar),
      oku: (projeId) => window.storyboard!.yazarlik!.oku(projeId),
    }
  : null;

export const desktopPlatform: PlatformAdapter = {
  veriGuvenligi,
  dil,
  baslangic,
  iliskilendirme,
  yazarlik,
  kanit,
  kind: 'desktop',
  canSaveLocally: true,
  canExportVideo: true,

  setDirty(dirty: boolean) {
    window.storyboard?.setDirty(dirty);
  },

  async openProjectDialog() {
    return (await window.storyboard?.openProjectDialog()) ?? null;
  },

  async readProjectFile(path) {
    const data = await window.storyboard?.readProjectFile(path);
    if (!data) throw new Error('Dosya okunamadı.');
    return data;
  },

  async saveProject(project: Project, assets: AssetMap, opts) {
    const data = await packProject({ project, assets });
    const res = await window.storyboard?.saveProject({
      data,
      path: opts.path ?? null,
      saveAs: opts.saveAs ?? false,
      projectName: project.meta.name,
      projectId: project.meta.id,
      /* Tipin KİMLİĞİ gidiyor: kitaplık hem gösterilecek adı hem varsayılan
         kapağın ailesini ondan türetiyor. */
      projectType: (dokumanTipi(project.meta.dokumanTipi) ?? DOKUMAN_TIPLERI.senaryo).id,
    });
    return res ?? { path: null, cancelled: true };
  },

  async autosave(project, assets, path, savedBy) {
    const data = await packProject({ project, assets });
    await window.storyboard?.autosave({
      data,
      path,
      projectId: project.meta.id,
      projectName: project.meta.name,
      savedBy,
    });
  },

  async listRecentProjects() {
    return (await window.storyboard?.listRecentProjects()) ?? [];
  },

  async listVersions(projectId) {
    return (await window.storyboard?.listVersions(projectId)) ?? [];
  },

  async restoreVersion(projectId, versionId) {
    return (await window.storyboard?.restoreVersion(projectId, versionId)) ?? null;
  },

  async exportPngZip(req) {
    return (await window.storyboard?.exportPngZip(req)) ?? { path: null, cancelled: true };
  },

  async dosyaKaydet(req) {
    return (await window.storyboard?.dosyaKaydet(req)) ?? { path: null, cancelled: true };
  },

  async exportVideo(req) {
    return (await window.storyboard?.exportVideo(req)) ?? { path: null, cancelled: true };
  },

  async pushVideoFrame(chunk) {
    await window.storyboard?.pushVideoFrame(chunk);
  },

  async discardVideoFrames(jobId) {
    await window.storyboard?.discardVideoFrames(jobId);
  },

  async cancelExport(jobId) {
    await window.storyboard?.cancelExport(jobId);
  },

  onExportProgress(cb) {
    return window.storyboard?.onExportProgress(cb) ?? (() => {});
  },

  async pickAudioFile() {
    return (await window.storyboard?.pickAudioFile()) ?? null;
  },

  /* Çift tıklanan proje dosyası — ana süreçten gelen yol. */
  onProjeDosyasiAc(cb) {
    return window.storyboard?.onProjeDosyasiAc(cb) ?? (() => {});
  },
  onMenuAction(cb) {
    return window.storyboard?.onMenuAction((action) => cb(action as never)) ?? (() => {});
  },

  defaultServerUrl() {
    return cachedServerUrl;
  },
};
