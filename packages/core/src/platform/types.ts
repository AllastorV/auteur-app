import type { Project } from '../model/types';
import type { AssetMap } from '../model/project-io';
import type { ZincirDurumu, ZincirKaydi } from '../veri/zincir';

/** Masaüstü menüsündeki eylem kimlikleri. */
export type MenuActionId =
  | 'yeni'
  | 'ac'
  | 'kaydet'
  | 'farkli-kaydet'
  | 'son-projeler'
  | 'surum-gecmisi'
  | 'disa-aktar'
  | 'oturum'
  | 'geri-al'
  | 'ileri-al'
  | 'yeni-panel'
  | 'panel-cogalt'
  | 'grid-gorunum'
  | 'panelleri-gizle'
  | 'sigdir'
  | 'kisayollar'
  | 'yardim'
  | 'analiz'
  | 'ayarlar';

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
  /**
   * Belge tipinin KİMLİĞİ (`senaryo`, `roman`…), okunabilir adı değil.
   *
   * Kitaplık iki şeyi bundan türetiyor: kapakta yazan ad ve varsayılan
   * kapağın ailesi. Okunabilir adı saklasaydık aileyi bulmak için ada göre
   * geri arama gerekirdi — ad değişince sessizce kırılan bir bağ.
   *
   * İSTEĞE BAĞLI: bu alandan önce yazılmış kayıtlarda yok ve olmadığında
   * kitap yine çiziliyor.
   */
  tip?: string;
  /**
   * Kullanıcının kendi kapağı. Yoksa tipe göre çizilmiş varsayılan kapak
   * kullanılıyor — kitap hiçbir zaman boş cilt olarak durmuyor.
   */
  kapak?: string;
}

export interface HistoryVersion {
  id: string;
  savedAt: number;
  label: string;
  size: number;
  /** Bu sürümü kaydeden kişinin adı. Eş dosyası olmayan eski sürümlerde YOK. */
  savedBy?: string;
}

/**
 * Dil araçları kabuğu — §16.4.
 *
 * `veriGuvenligi` ile aynı kalıp: HEPSİ YA DA HİÇBİRİ tek nesnede. Web'de
 * `null` ve arayüz bunu SÖYLÜYOR; yarısı olan bir kabuk, kullanıcıya yarısı
 * çalışan bir yetenek vaat etmek olurdu.
 */
export interface DilKabugu {
  /** Kabuğun gerçekten desteklediği denetim dilleri (Chromium listesi). */
  denetimDilleri(): Promise<string[]>;
  /** Etkin denetim dillerini ayarlar. */
  denetimDilleriniAyarla(diller: readonly string[]): Promise<void>;
  /** Proje sözlüğünü kabuğun denetleyicisine yükler. */
  sozlugüYükle(kelimeler: readonly string[]): Promise<void>;
  /** Çeviri sağlayıcısının API anahtarını ŞİFRELİ saklar (safeStorage). */
  anahtarYaz(saglayici: string, anahtar: string): Promise<void>;
  anahtarOku(saglayici: string): Promise<string | null>;
}

export interface SaveResult {
  path: string | null;
  cancelled?: boolean;
}

/** "PC açılınca otomatik başlat" / "Küçültülmüş başla" — Ayarlar diyaloğu. */
export interface BaslangicAyarlari {
  otoBaslat: boolean;
  kucukBasla: boolean;
}

/**
 * Başlangıç ayarları kabuğu. `dil`/`veriGuvenligi` ile aynı kalıp: web'de
 * `null` — tarayıcının işletim sistemi başlangıcına erişimi yok, ve olmayan
 * bir yeteneği varmış gibi göstermek kullanıcıya yanlış vaat verirdi.
 */
/**
 * Dosya ilişkilendirmesi — YALNIZ masaüstü. Taşınabilir sürümde `.sbp`
 * uzantısını bu exe'ye bağlar (bkz. electron/dosya-iliskilendirme.ts).
 * Web'de yok: tarayıcı işletim sistemi kaydına yazamaz.
 */
export interface IliskilendirmeKabugu {
  bagla(): Promise<{ ok: boolean; hata: string | null }>;
}

export interface BaslangicKabugu {
  oku(): Promise<BaslangicAyarlari>;
  yaz(ayarlar: BaslangicAyarlari): Promise<void>;
}

/** Tek dosyalık dışa aktarım (senaryo PDF/Fountain/FDX, storyboard PDF). */
export interface DosyaKaydetIstegi {
  bytes: Uint8Array;
  /** Uzantısıyla birlikte önerilen ad. */
  dosyaAdi: string;
  /** Kayıt penceresi süzgeci için okunur ad, örn. "PDF belgesi". */
  turAdi: string;
  /** Süzgeç uzantıları, noktasız: `['pdf']`. */
  uzantilar: string[];
}

export interface PngExportRequest {
  /** panel sırasına göre PNG dataURL'leri */
  frames: { fileName: string; dataUrl: string }[];
  zipName: string;
}

/** Tek bir animatik karesi — üretildikçe kabuğa akıtılır. */
export interface VideoFrameChunk {
  jobId: string;
  index: number;
  dataUrl: string;
  duration: number;
}

export interface VideoExportRequest {
  jobId: string;
  fps: number;
  width: number;
  height: number;
  format: 'mp4' | 'webm';
  /**
   * Sabit kareler ve süreleri. `pushVideoFrame` ile akıtıldıysa boş gelir —
   * kabuk kareleri diskten okur.
   */
  segments: { dataUrl: string; duration: number }[];
  audioPath?: string | null;
  outputPath?: string | null;
  /** Beklenen toplam süre (doğrulama için) */
  expectedDuration: number;
}

export interface ExportProgress {
  jobId: string;
  phase: 'hazirlik' | 'kodlama' | 'tamamlandi' | 'iptal' | 'hata';
  percent: number;
  message: string;
}

/** Kuşak halkasındaki bir çıpa kaydı (§15.2). */
export interface CipaKaydi {
  id: string;
  zaman: number;
}

/**
 * §15 veri güvenliği katmanının kabuk yüzeyi.
 *
 * `PlatformAdapter` üzerinde AYRI bir nesne, gevşek metotlar değil: bütün
 * katman ya vardır ya yoktur. Metotlar tek tek isteğe bağlı olsaydı, yarısı
 * uygulanmış bir kabuk sessizce "günlük tutuluyor" sanılırdı — §15.4'ün
 * yasakladığı sessiz başarısızlığın kabuk düzeyindeki hâli.
 */
export interface VeriGuvenligiKabugu {
  /** 1. katman: çerçeveleri günlüğe EKLER. */
  gunlugeEkle(projeId: string, cerceveler: Uint8Array): Promise<void>;
  /** Açılışta günlüğün tamamı; hiç yoksa `null`. */
  gunlukOku(projeId: string): Promise<Uint8Array | null>;
  /** 2. katman: çıpayı ATOMİK yazar, SONRA günlüğü keser. Sıra sözleşmedir. */
  /**
   * Çıpa yazar ve günlüğü keser. `seyreltme = false` yalnız geri dönüş
   * yolunda: o çağrının hemen ardından eski bir nokta okunacak ve
   * seyreltme onu budayabilir.
   */
  cipaYazVeGunlugeKes(projeId: string, cipa: Uint8Array, seyreltme?: boolean): Promise<void>;
  /** 3. katman: kuşak halkası, yeniden eskiye. */
  cipaHalkasi(projeId: string): Promise<CipaKaydi[]>;
  cipaOku(projeId: string, id: string): Promise<Uint8Array>;
  /**
   * Çıpa PARÇALARI (varlıksız gövde + varlık baytları) — OPSİYONEL.
   * Günlük OYNATACAK okuma yolu bunu yeğler: geri koyma günlükten sonra
   * çekirdekte yapılır (yarış + dirilme; bkz. veri/kurtarma.ts). Kabuk
   * desteklemiyorsa `cipaOku`nun birleşik baytlarına düşülür.
   */
  cipaParcaliOku?(
    projeId: string,
    id: string,
  ): Promise<{
    govde: Uint8Array;
    varliklar: Record<string, string>;
    /** Zarf v2: cikarilan varligin ozgun oge kimligi [client, clock, len]. */
    ogeler?: Record<string, number[]>;
    eksik: string[];
  }>;
  /**
   * Çıpanın indeksinde olup varlık deposunda BULUNAMAYAN görsellerin
   * kimlikleri — OPSİYONEL.
   *
   * Çıpa artık görsellerin baytlarını taşımıyor (bkz. `varlik-deposu.ts`),
   * yani depodaki bir dosya elle silinirse o görsel geri gelmez. Belge yine
   * de AÇILIR — eksik bir görsel yüzünden bütün belgeyi açmamak kaybı
   * büyütürdü — ama durum §15.4 gereği SÖYLENİR. Desteklemeyen kabukta
   * (varlıkları hâlâ gömülü tutan web) `undefined`: sorulacak bir şey yok.
   */
  eksikVarliklar?(projeId: string, id: string): Promise<string[]>;
  /** §15.3: günlüğü SİLMEZ, `kurtarma/` altına taşır. */
  gunluguArsivle(projeId: string): Promise<string | null>;
}

/** Yazarlık günlüğünde saklanan tek kayıt — "bu satırı kim yazdı" sorusu. */
export interface YazarlikKaydi {
  /** ms epoch. */
  zaman: number;
  yazar: string;
  bloklar: string[];
}

/**
 * Yazarlık günlüğü kabuğu. `veriGuvenligi`/`dil`/`baslangic` ile AYNI kalıp:
 * HEPSİ YA DA HİÇBİRİ tek nesnede, web'de `null` — tarayıcı kabuğunda kalıcı
 * bir yazarlık günlüğü yoktur ve olmayan bir yeteneği varmış gibi göstermek
 * kullanıcıya yanlış vaat verirdi.
 */
export interface YazarlikKabugu {
  /** Kayıtları günlüğe EKLER (append), üzerine yazmaz. */
  ekle(projeId: string, kayitlar: YazarlikKaydi[]): Promise<void>;
  /** Günlüğün tamamı; hiç yoksa boş dizi. */
  oku(projeId: string): Promise<YazarlikKaydi[]>;
}

/**
 * MÜHÜR ZİNCİRİ kabuğu — "bu metin şu tarihte bendeydi".
 *
 * `yazarlik` ile aynı kalıp ama İKİ NEDENLE web'de `null`: tarayıcıda
 * append-only kalıcı bir dosya yok, ve RFC 3161 zaman damgası sunucuları
 * CORS başlığı göndermiyor — doğrudan çağrı zaten çalışmazdı. Yarım bir
 * yetenek göstermek kullanıcıya "kanıtım var" dedirtirdi.
 *
 * `yazarlik`ten AYRILAN yanı: buradaki hiçbir hata YUTULMAZ. Yazarlık
 * kaydının kaybı bir attribution kaydının kaybıdır (metin değil); mührün
 * kaybı, kullanıcıya verilmiş bir kanıt vaadinin kaybıdır.
 */
export interface KanitKabugu {
  /** Mühür kaydını zincire ekler ve mühürlenen metni saklar. Hata FIRLATIR. */
  muhurYaz(projeId: string, kayit: ZincirKaydi, metin: Uint8Array): Promise<void>;
  /** Damga kaydını ekler ve DER jetonunu saklar. Hata FIRLATIR. */
  damgaYaz(projeId: string, kayit: ZincirKaydi, jeton: Uint8Array): Promise<void>;
  /** Zincirin tamamı ve çözümleme durumu. */
  oku(projeId: string): Promise<{ kayitlar: ZincirKaydi[]; durum: ZincirDurumu }>;
  /** Mühürlenen metnin baytları; yoksa `null` — doğrulayıcı bunu bulgu yazar. */
  muhurMetni(projeId: string, zaman: number): Promise<Uint8Array | null>;
  /** Damga jetonu (DER); yoksa `null`. */
  damgaJetonu(projeId: string, zaman: number): Promise<Uint8Array | null>;
}

/**
 * Uygulama kabuğu (Electron ya da tarayıcı) tarafından sağlanan yetenekler.
 * `packages/core` doğrudan Node ya da Electron API'si çağırmaz.
 */
export interface PlatformAdapter {
  readonly kind: 'desktop' | 'web';
  readonly canSaveLocally: boolean;
  readonly canExportVideo: boolean;
  /**
   * §15 katmanı. `null` ise bu kabukta yerel çökme koruması YOKTUR ve
   * arayüz bunu kullanıcıya söylemek zorundadır — sessizce korunuyormuş gibi
   * davranmak §15.4 ihlalidir.
   */
  readonly veriGuvenligi: VeriGuvenligiKabugu | null;
  /** §16.4 dil araçları kabuğu; web'de `null`. */
  readonly dil: DilKabugu | null;
  /** Başlangıç ayarları kabuğu (Ayarlar diyaloğu); web'de `null`. */
  readonly baslangic: BaslangicKabugu | null;
  readonly iliskilendirme?: IliskilendirmeKabugu | null;
  /** Yazarlık günlüğü kabuğu — "bu satırı kim yazdı"; web'de `null`. */
  readonly yazarlik: YazarlikKabugu | null;
  /** Mühür zinciri kabuğu — "bu metin şu tarihte bendeydi"; web'de `null`. */
  readonly kanit: KanitKabugu | null;

  /* Proje dosyası */
  openProjectDialog(): Promise<{ path: string; data: Uint8Array } | null>;
  readProjectFile(path: string): Promise<Uint8Array>;
  saveProject(
    project: Project,
    assets: AssetMap,
    opts: { path?: string | null; saveAs?: boolean },
  ): Promise<SaveResult>;
  /** Sessiz otomatik kayıt — kullanıcıya dialog göstermez.
      `savedBy` boşsa (ör. oturum açılmamış tek başına kullanım) yazan bilgisi kaydedilmez. */
  autosave(project: Project, assets: AssetMap, path: string | null, savedBy?: string): Promise<void>;

  listRecentProjects(): Promise<RecentProject[]>;
  listVersions(projectId: string): Promise<HistoryVersion[]>;
  restoreVersion(projectId: string, versionId: string): Promise<Uint8Array | null>;

  /* Dışa aktarma */
  /**
   * Tek bir dosyayı bayt olarak kaydeder (PDF / Fountain / FDX).
   *
   * Tanımsızsa çağıran tarayıcı indirmesine düşer — web kabuğunda kayıt
   * yeri seçtirecek bir API yok ve olmayan yeteneği varmış gibi göstermek
   * kullanıcıya dosyanın nereye gittiğini yanlış anlatırdı.
   */
  dosyaKaydet?(req: DosyaKaydetIstegi): Promise<SaveResult>;
  exportPngZip(req: PngExportRequest): Promise<SaveResult>;
  exportVideo(req: VideoExportRequest): Promise<SaveResult>;
  /**
   * Kareyi üretildiği anda kabuğa akıtır (diske yazılır).
   * Tanımlıysa `exportVideo` çağrısında kare verisi taşınmaz — büyük
   * animatiklerde tek dev IPC mesajı ve çift bellek tüketimi önlenir.
   */
  pushVideoFrame?(chunk: VideoFrameChunk): Promise<void>;
  /** Yarıda kalan işin geçici karelerini siler. */
  discardVideoFrames?(jobId: string): Promise<void>;
  cancelExport(jobId: string): Promise<void>;
  onExportProgress(cb: (p: ExportProgress) => void): () => void;
  pickAudioFile?(): Promise<string | null>;

  /**
   * Uygulama menüsünden gelen eylemler (masaüstü). Döndürülen fonksiyon
   * aboneliği kaldırır. Web istemcisinde tanımlı değildir.
   */
  onMenuAction?(cb: (action: MenuActionId) => void): () => void;

  /**
   * İşletim sisteminden gelen "şu proje dosyasını aç" isteği.
   *
   * Kullanıcı bir `.mzn` dosyasına çift tıkladığında kabuk yolu buradan
   * bildiriyor. Web'de tanımsız — tarayıcının dosya ilişkilendirmesi yok.
   */
  onProjeDosyasiAc?(cb: (yol: string) => void): () => void;

  /**
   * Kaydedilmemiş değişiklik durumunu kabuğa bildirir (masaüstünde pencere
   * kapatma onayı için). Web'de `beforeunload` kullanıldığından tanımsızdır.
   */
  setDirty?(dirty: boolean): void;

  /* Ortak çalışma */
  defaultServerUrl(): string;
}
