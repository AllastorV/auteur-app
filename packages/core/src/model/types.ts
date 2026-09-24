/**
 * Auteur — paylaşılan veri modeli.
 *
 * Bu tipler hem masaüstü (Electron) hem de web istemcisi tarafından kullanılır ve
 * `.sbp` proje dosyasının `project.json` şemasını tanımlar.
 */

import type { ScriptDoc } from './script';
import type { DilAdi } from '../format/profil';

export type { ScriptDoc, ScriptBlock, ScriptBlockType } from './script';
export type { ScriptScene } from './scenes';

/** 2: senaryo bağlama (`Project.script`, `Panel.scriptRefs`) eklendi. */
/** 3: blok `fp` (içerik parmak izi) ve `sceneId` (kalıcı sahne kimliği) eklendi. */
export const PROJECT_SCHEMA_VERSION = 3;

/* ------------------------------------------------------------------ */
/* Temel yardımcı tipler                                               */
/* ------------------------------------------------------------------ */

export interface Vec2 {
  x: number;
  y: number;
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'difference';

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Çarpım' },
  { value: 'screen', label: 'Ekran' },
  { value: 'overlay', label: 'Kaplama' },
  { value: 'darken', label: 'Koyulaştır' },
  { value: 'lighten', label: 'Açıklaştır' },
  { value: 'difference', label: 'Fark' },
];

/* ------------------------------------------------------------------ */
/* Aspect ratio / çerçeve rehberi                                      */
/* ------------------------------------------------------------------ */

export type AspectRatioId = '2.39:1' | '1.85:1' | '16:9' | '4:3' | '1:1' | '9:16';

export interface FrameGuideSettings {
  aspect: AspectRatioId;
  /** Üçler kuralı ızgarası */
  thirds: boolean;
  /** Aksiyon güvenli alanı (%90) */
  actionSafe: boolean;
  /** Başlık güvenli alanı (%80) */
  titleSafe: boolean;
  /** Merkez çapraz işareti */
  centerCross: boolean;
  /** Rehberlerin tümünü aç/kapa */
  enabled: boolean;

  /* --- kompozisyon kuralları ---------------------------------------
     HEPSİ İSTEĞE BAĞLI: bu alanlardan önce kaydedilmiş panellerde yoklar
     ve okuyucu `false` sayıyor. Zorunlu yapmak eski projeleri, kullanıcının
     hiç açmadığı rehberlerle açardı. */

  /** Altın oran ızgarası — 0,382 ve 0,618 çizgileri. */
  altinOran?: boolean;
  /** Altın spiral (Fibonacci). */
  altinSpiral?: boolean;
  /** Çapraz yöntem — köşelerden 45°. */
  capraz?: boolean;
  /** Harmonik üçgenler — ana köşegen + ona dik iki çizgi. */
  harmonik?: boolean;
  /** Simetri ekseni — tam boy dikey ve yatay orta çizgi. */
  simetri?: boolean;

  /**
   * Rehber çizgilerinin rengi ve opaklığı.
   *
   * TEK renk hepsini yönetiyor. Öncesinde üç renk KODA GÖMÜLÜYDÜ (gök
   * mavisi, sarı, pembe) — üçü de paletin dışındaydı ve kullanıcı hiçbirini
   * değiştiremiyordu. Güvenli alanlar renkten değil, çizgi deseninden
   * ayrılıyor.
   */
  renk?: string;
  opaklik?: number;
}

/** Rehber rengi/opaklığı verilmemişse kullanılan değerler. */
export const REHBER_RENK = '#7dd3fc';
export const REHBER_OPAKLIK = 0.55;

export const DEFAULT_FRAME_GUIDES: FrameGuideSettings = {
  aspect: '16:9',
  thirds: true,
  actionSafe: false,
  titleSafe: false,
  centerCross: false,
  enabled: true,
  altinOran: false,
  altinSpiral: false,
  capraz: false,
  harmonik: false,
  simetri: false,
  renk: REHBER_RENK,
  opaklik: REHBER_OPAKLIK,
};

/* ------------------------------------------------------------------ */
/* Katmanlar                                                           */
/* ------------------------------------------------------------------ */

/** `annotation` katmanı Yorumcu rolünün yazabildiği tek katman türüdür. */
export type LayerKind = 'main' | 'annotation';

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Küçükten büyüğe: 0 en altta */
  order: number;
}

/* ------------------------------------------------------------------ */
/* Sahne objeleri                                                      */
/* ------------------------------------------------------------------ */

export type ObjectKind =
  | 'stroke'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'text'
  | 'image'
  | 'cameraOverlay';

export interface BaseObject {
  id: string;
  kind: ObjectKind;
  layerId: string;
  name: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  /** Katman içi çizim sırası; küçükten büyüğe */
  z: number;
}

export interface StrokeObject extends BaseObject {
  kind: 'stroke';
  /** Yeni kalem/fırça geometrisi. Yoksa eski belgenin çizimi aynen korunur. */
  geometryVersion?: 2;
  /** [x0,y0,p0, x1,y1,p1, ...] — p basınç (0..1) */
  points: number[];
  color: string;
  width: number;
  /** Silgi modunda destination-out ile çizilir */
  eraser: boolean;
  smoothing: number;
  /** Fırça = kenarları yumuşak, kalem = keskin */
  brush: boolean;
}

export interface RectObject extends BaseObject {
  kind: 'rect';
  width: number;
  height: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
}

export interface EllipseObject extends BaseObject {
  kind: 'ellipse';
  radiusX: number;
  radiusY: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
}

export interface LineObject extends BaseObject {
  kind: 'line' | 'arrow';
  points: number[];
  stroke: string;
  strokeWidth: number;
  dash: number[] | null;
}

export interface PolygonObject extends BaseObject {
  kind: 'polygon';
  points: number[];
  closed: boolean;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextObject extends BaseObject {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  align: TextAlign;
  fill: string;
  stroke: string | null;
  strokeWidth: number;
  width: number;
  lineHeight: number;
}

export interface ImageObject extends BaseObject {
  kind: 'image';
  /** `assets/` içindeki dosya adı (proje dosyasına gömülür) */
  assetId: string;
  width: number;
  height: number;
}

/* -------------------- 2D silüet -------------------- */

/* -------------------- Kamera overlay -------------------- */

export interface CameraOverlayObject extends BaseObject {
  kind: 'cameraOverlay';
  presetId: string;
  /** Hareket oku çizilecek mi */
  showArrow: boolean;
  color: string;
  width: number;
  height: number;
  label: string;
}

export type SBObject =
  | StrokeObject
  | RectObject
  | EllipseObject
  | LineObject
  | PolygonObject
  | TextObject
  | ImageObject
  | CameraOverlayObject;

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export type TransitionKind = 'cut' | 'dissolve' | 'fadeIn' | 'fadeOut' | 'wipe';

export const TRANSITIONS: { value: TransitionKind; label: string }[] = [
  { value: 'cut', label: 'Kesme (Cut)' },
  { value: 'dissolve', label: 'Çözülme (Dissolve)' },
  { value: 'fadeIn', label: 'Açılma (Fade In)' },
  { value: 'fadeOut', label: 'Kararma (Fade Out)' },
  { value: 'wipe', label: 'Silme (Wipe)' },
];

export interface PanelMeta {
  /** Sahne numarası */
  scene: string;
  /** Çekim numarası */
  shot: string;
  /** Saniye cinsinden süre */
  duration: number;
  dialogue: string;
  action: string;
  /** Ses / efekt notu */
  sound: string;
  /** Kamera preset etiketi — preset seçilince otomatik dolar */
  cameraLabel: string;
}

export interface Panel {
  id: string;
  meta: PanelMeta;
  layers: Layer[];
  objects: SBObject[];
  guides: FrameGuideSettings;
  /** Panelden sonraki geçiş */
  transition: TransitionKind;
  /** Geçiş süresi (sn) */
  transitionDuration: number;
  /** Arka plan rengi */
  background: string;
  /** Bu panelin karşıladığı senaryo bloklarının kimlikleri */
  scriptRefs: string[];
  /** Küçük resim önbelleği (dataURL) — dosyaya yazılmaz */
  thumbnail?: string;
}

/* ------------------------------------------------------------------ */
/* Proje                                                               */
/* ------------------------------------------------------------------ */

export interface ProjectSettings {
  aspect: AspectRatioId;
  fps: 24 | 25 | 30;
  /** Sayfa başına panel (grid görünümü) */
  panelsPerPage: 1 | 2 | 4 | 6 | 9;
  defaultPanelDuration: number;
  guides: FrameGuideSettings;
  /**
   * Fon başvuru şablonunun kimliği — YALNIZ `fon-dosyasi` belgelerinde
   * anlamlı (`fon/sablon.ts`).
   *
   * Neden ayarlarda ve neden düz bir dizgi: şablon seçimi belge başına
   * BİR KEZ yapılıyor ve nadiren değişiyor; bir CRDT kökü açmak, son
   * yazanın kazandığı tek bir skaler için bütün bir eşzamanlılık
   * makinesi kurmak olurdu. Bölüm METİNLERİ ise belgenin kendisinde
   * (`bolum`/`paragraf` blokları) yaşıyor — kayıp riski orada yok.
   */
  fonSablonu?: string;
  /**
   * Belgenin KENDİ dili — kullanıcı tercihini EZER.
   *
   * ÖLÇÜLDÜ (2026-09-01, gerçek Electron penceresi): dil yalnız kullanıcı
   * tercihinden (`ui.scriptLang`) okunuyordu ve Eurimages fon dosyasının
   * İngilizce başlıkları TÜRKÇE büyütme kuralıyla basıldı —
   * `SYNOPSİS — ENGLİSH`, `SCRİPT — ORİGİNAL`. Türkçede `i → İ`.
   *
   * Kağıt ve dil normalde YAZARIN tercihidir (bkz. `format/tercih.ts`) ve
   * o karar duruyor. Ama fon dosyasında dil KURUMUN şartıdır, yazarın
   * değil: Eurimages dosyası İngilizce çıkmak zorunda, kullanıcı Auteur'ü
   * Türkçe kurmuş olsa bile. Alan yalnız o durumda yazılıyor; boşsa eski
   * davranış birebir korunuyor.
   */
  belgeDili?: DilAdi;
  /**
   * Fon dosyasının TÜRETİLDİĞİ senaryo — "tazele" düğmesinin tek girdisi.
   *
   * Fon belgesi anlık kopyadır ve senaryo değişince eskir (bilinen tavan).
   * Kullanıcıdan bunu her seferinde dosya seçtirerek çözmek, ürünün
   * yapması gereken işi kullanıcıya yıkmak olurdu: kaynak zaten
   * biliniyordu, saklanmıyordu. `yol` kaydedilmemiş senaryoda `null`
   * olabiliyor — o hâlde arayüz bir kez dosya sorup yolu yazıyor ve bir
   * daha sormuyor.
   *
   * `projeId` YOLLA BİRLİKTE tutuluyor: yol taşınabilir ve başka bir
   * projeyle değiştirilmiş olabilir. Tazeleme, açtığı dosyanın kimliği
   * tutmuyorsa sessizce devam etmiyor — sorup onay alıyor.
   */
  fonKaynak?: {
    projeId: string;
    ad: string;
    yol: string | null;
    turetildi: number;
  };
}

export interface ProjectMeta {
  id: string;
  /**
   * Doküman tipi (§13.2 / F7). Eski projelerde YOK — okuyucu `senaryo`
   * varsayıyor, çünkü F7'den önce her belge senaryoydu ve varsayımı
   * değiştirmek eski dosyaları başka bir formatta açardı.
   */
  dokumanTipi?: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  author: string;
  description: string;
}

export interface Project {
  schemaVersion: number;
  meta: ProjectMeta;
  settings: ProjectSettings;
  panels: Panel[];
  /** "Benim Pozlarım" kütüphanesi */
  /** İçe aktarılmış senaryo — paneller bloklarına bağlanır */
  script: ScriptDoc;
  /**
   * Belgenin ÖTEKİ kökleri — sözlük, karakterler, çekim dökümü, başlık
   * sayfası, iki sütunlu belgenin çiftleri, revizyonlar... (`BelgeKokleri`).
   *
   * İSTEĞE BAĞLI ve YALNIZ KAYIT anında doldurulur: store'un her karede
   * okuduğu anlık görüntüye girseydi canvas'ın sıcak yolu on bir kökün
   * `toJSON()` maliyetini öderdi. Alan yoksa yükleyici köklere DOKUNMAZ.
   */
  belge?: import('../doc/schema').BelgeKokleri;
}

/* ------------------------------------------------------------------ */
/* Ortak çalışma                                                       */
/* ------------------------------------------------------------------ */

export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Sahip',
  editor: 'Editör',
  commenter: 'Yorumcu',
  viewer: 'İzleyici',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Her şey + dışa aktarma + davet + rol değiştirme',
  editor: 'Tam düzenleme, dışa aktarma yok',
  commenter: 'Yalnızca yorum ve işaretleme katmanı',
  viewer: 'Salt okunur',
};

export interface Participant {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  role: Role;
  /** Şu an düzenlediği panel */
  activePanelId: string | null;
  cursor: Vec2 | null;
  lastSeen: number;
}
