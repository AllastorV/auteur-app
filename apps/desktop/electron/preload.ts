import { contextBridge, ipcRenderer } from 'electron';

/**
 * Renderer'a açılan güvenli köprü. `packages/core` yalnızca bu arayüzü görür;
 * doğrudan Node API'sine erişimi yoktur.
 */
const api = {
  openProjectDialog: () => ipcRenderer.invoke('project:open-dialog'),
  readProjectFile: (path: string) => ipcRenderer.invoke('project:read', path),
  saveProject: (payload: unknown) => ipcRenderer.invoke('project:save', payload),
  autosave: (payload: unknown) => ipcRenderer.invoke('project:autosave', payload),
  listRecentProjects: () => ipcRenderer.invoke('project:recent'),
  listVersions: (projectId: string) => ipcRenderer.invoke('project:versions', projectId),
  restoreVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke('project:restore', projectId, versionId),

  exportPngZip: (payload: unknown) => ipcRenderer.invoke('export:png-zip', payload),
  dosyaKaydet: (payload: unknown) => ipcRenderer.invoke('export:dosya', payload),
  exportVideo: (payload: unknown) => ipcRenderer.invoke('export:video', payload),
  /** Tek bir animatik karesini ana sürece akıtır (diske yazılır). */
  pushVideoFrame: (payload: unknown) => ipcRenderer.invoke('export:video-frame', payload),
  discardVideoFrames: (jobId: string) => ipcRenderer.invoke('export:video-discard', jobId),
  cancelExport: (jobId: string) => ipcRenderer.invoke('export:cancel', jobId),
  pickAudioFile: () => ipcRenderer.invoke('export:pick-audio'),
  onExportProgress: (cb: (p: unknown) => void) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.off('export:progress', handler);
  },

  /* §15 veri güvenliği katmanı. */
  gunlugeEkle: (projeId: string, cerceveler: Uint8Array) =>
    ipcRenderer.invoke('veri:gunluge-ekle', projeId, cerceveler),
  gunlukOku: (projeId: string) => ipcRenderer.invoke('veri:gunluk-oku', projeId),
  cipaYazVeGunlugeKes: (projeId: string, cipa: Uint8Array, seyreltme?: boolean) =>
    ipcRenderer.invoke('veri:cipa-yaz', projeId, cipa, seyreltme),
  cipaHalkasi: (projeId: string) => ipcRenderer.invoke('veri:halka', projeId),
  cipaOku: (projeId: string, id: string) => ipcRenderer.invoke('veri:cipa-oku', projeId, id),
  cipaParcaliOku: (projeId: string, id: string) => ipcRenderer.invoke('veri:cipa-parcali-oku', projeId, id),
  arayuzDiliBildir: (dil: string) => ipcRenderer.send('dil:arayuz', dil),
  dosyaIliskilendir: () => ipcRenderer.invoke('dosya:iliskilendir'),
  eksikVarliklar: (projeId: string, id: string) =>
    ipcRenderer.invoke('veri:cipa-eksik-varliklar', projeId, id),
  gunluguArsivle: (projeId: string) => ipcRenderer.invoke('veri:gunluk-arsivle', projeId),

  /** Yazarlık günlüğü — "bu satırı kim yazdı" sorusu. */
  yazarlik: {
    ekle: (projeId: string, kayitlar: unknown[]): Promise<void> =>
      ipcRenderer.invoke('yazarlik:ekle', projeId, kayitlar),
    oku: (projeId: string): Promise<unknown[]> => ipcRenderer.invoke('yazarlik:oku', projeId),
  },

  kanit: {
    muhurYaz: (projeId: string, kayit: unknown, metin: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('kanit:muhur-yaz', projeId, kayit, metin),
    damgaYaz: (projeId: string, kayit: unknown, jeton: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('kanit:damga-yaz', projeId, kayit, jeton),
    oku: (projeId: string): Promise<unknown> => ipcRenderer.invoke('kanit:oku', projeId),
    muhurMetni: (projeId: string, zaman: number): Promise<Uint8Array | null> =>
      ipcRenderer.invoke('kanit:muhur-metni', projeId, zaman),
    damgaJetonu: (projeId: string, zaman: number): Promise<Uint8Array | null> =>
      ipcRenderer.invoke('kanit:damga-jetonu', projeId, zaman),
  },

  serverUrl: () => ipcRenderer.invoke('app:server-url'),

  /** Kaydedilmemiş değişiklik durumu — pencere kapatılırken uyarı için. */
  setDirty: (dirty: boolean) => ipcRenderer.send('app:dirty', Boolean(dirty)),

  /* §16.4 dil araçları. Tek nesnede toplanıyor: `veriGuvenligi` ile aynı
     "hepsi ya da hiçbiri" kuralı — yarısı olan bir kabuk, arayüze yarısı
     çalışan bir yetenek vaat ettirirdi. */
  dil: {
    denetimDilleri: (): Promise<string[]> => ipcRenderer.invoke('dil:diller'),
    denetimDilleriniAyarla: (diller: string[]): Promise<void> =>
      ipcRenderer.invoke('dil:dilleri-ayarla', diller),
    sozlugüYükle: (kelimeler: string[]): Promise<void> =>
      ipcRenderer.invoke('dil:sozluk', kelimeler),
    anahtarYaz: (saglayici: string, anahtar: string): Promise<void> =>
      ipcRenderer.invoke('dil:anahtar-yaz', saglayici, anahtar),
    anahtarOku: (saglayici: string): Promise<string | null> =>
      ipcRenderer.invoke('dil:anahtar-oku', saglayici),
  },

  /** Türkçe uygulama menüsünden gelen eylemler. */
  /* Çift tıklanan proje dosyası: ana süreç yolu gönderiyor, renderer açıyor.
     Açma mantığı renderer'da çünkü §15 kurtarma kapısı, geri alma ve mod
     kabuğu orada — ana süreçte açmak onları ikinci bir eve taşırdı. */
  onProjeDosyasiAc: (cb: (yol: string) => void) => {
    const h = (_o: unknown, yol: string) => cb(yol);
    ipcRenderer.on('proje-dosyasi-ac', h);
    return () => ipcRenderer.off('proje-dosyasi-ac', h);
  },
  onMenuAction: (cb: (action: string) => void) => {
    const handler = (_e: unknown, action: string) => cb(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.off('menu:action', handler);
  },

  /** "PC açılınca otomatik başlat" / "Küçültülmüş başla" — Ayarlar diyaloğu. */
  baslangicAyarlariOku: (): Promise<{ otoBaslat: boolean; kucukBasla: boolean }> =>
    ipcRenderer.invoke('baslangic:oku'),
  baslangicAyarlariYaz: (ayarlar: { otoBaslat: boolean; kucukBasla: boolean }): Promise<void> =>
    ipcRenderer.invoke('baslangic:yaz', ayarlar),
};

contextBridge.exposeInMainWorld('storyboard', api);

export type StoryboardBridge = typeof api;
