import { arayuzDili } from '../dil/arayuz';
export type CameraCategory = 'olcek' | 'konum' | 'aci' | 'hareket';

export const CAMERA_CATEGORIES: { id: CameraCategory; label: string }[] = [
  { id: 'olcek', label: 'Ölçek' },
  { id: 'konum', label: 'Konum' },
  { id: 'aci', label: 'Açı' },
  { id: 'hareket', label: 'Hareket' },
];

export type MovementArrow =
  | 'none'
  | 'panLeft' | 'panRight'
  | 'tiltUp' | 'tiltDown'
  | 'dollyIn' | 'dollyOut'
  | 'trackLeft' | 'trackRight'
  | 'zoomIn' | 'zoomOut'
  | 'craneUp' | 'craneDown'
  | 'handheld';

export interface CameraPreset {
  id: string;
  /** Sektörde kullanılan İngilizce adı */
  name: string;
  /** Türkçe karşılığı */
  nameTr: string;
  short: string;
  category: CameraCategory;
  description: string;
  tags: string[];
  /** Öznenin çerçeve içindeki tahmini yükseklik oranı (0..1) — rehber çizimi için */
  subjectFill: number;
  /** Varsayılan 3D kamera parametreleri */
  fov: number;
  /** Kamera yüksekliği (metre, özne ayak hizası 0) */
  cameraHeight: number;
  /** Özneye mesafe (metre) */
  distance: number;
  /** Eğim açısı (derece, + yukarı bakar) */
  tilt: number;
  /** Dutch angle — kamera roll (derece) */
  roll: number;
  arrow: MovementArrow;
}

const S = (
  id: string, name: string, nameTr: string, short: string,
  description: string, subjectFill: number, fov: number,
  cameraHeight: number, distance: number, tilt: number,
): CameraPreset => ({
  id, name, nameTr, short, category: 'olcek', description,
  tags: [name.toLowerCase(), short.toLowerCase()],
  subjectFill, fov, cameraHeight, distance, tilt, roll: 0, arrow: 'none',
});

export const CAMERA_PRESETS: CameraPreset[] = [
  /* ------------------------------ ÖLÇEK ------------------------------ */
  S('els', 'Extreme Long Shot', 'Çok Uzak Plan', 'ELS',
    'Özne çevrenin içinde çok küçük kalır; mekânı tanıtır.', 0.12, 28, 1.6, 40, -1),
  S('ls', 'Long Shot', 'Uzak Plan', 'LS',
    'Özne tam görünür, çevre baskın. Genel kuruluş çekimi.', 0.45, 32, 1.6, 14, 0),
  S('fs', 'Full Shot', 'Boy Plan', 'FS',
    'Özne baştan ayağa çerçeveyi doldurur.', 0.85, 35, 1.5, 7, 0),
  S('mls', 'Medium Long Shot', 'Amerikan Plan', 'MLS',
    'Diz üstünden yukarısı — "cowboy shot".', 1.35, 40, 1.5, 5.2, 0),
  S('ms', 'Medium Shot', 'Orta Plan', 'MS',
    'Belden yukarısı; diyalog için standart.', 2.0, 45, 1.55, 3.6, 0),
  S('mcu', 'Medium Close-Up', 'Yakın Orta Plan', 'MCU',
    'Göğüsten yukarısı; röportaj çerçevesi.', 3.0, 50, 1.6, 2.4, 0),
  S('cu', 'Close-Up', 'Yakın Plan', 'CU',
    'Yüz çerçeveyi doldurur; duygu aktarımı.', 5.0, 55, 1.62, 1.4, 0),
  S('ecu', 'Extreme Close-Up', 'Çok Yakın Plan', 'ECU',
    'Göz, ağız ya da bir detay. Yoğun gerilim.', 9.0, 65, 1.63, 0.7, 0),

  /* ------------------------------ KONUM ------------------------------ */
  {
    id: 'ots', name: 'Over-the-Shoulder', nameTr: 'Omuz Üstü', short: 'OTS', category: 'konum',
    description: 'Ön plandaki kişinin omzu üzerinden karşıdakine bakış.',
    tags: ['over the shoulder', 'ots', 'diyalog'],
    subjectFill: 2.4, fov: 45, cameraHeight: 1.65, distance: 2.2, tilt: -2, roll: 0, arrow: 'none',
  },
  {
    id: 'pov', name: 'POV', nameTr: 'Öznel Bakış', short: 'POV', category: 'konum',
    description: 'Kamera karakterin gözü olur; izleyici onun yerine bakar.',
    tags: ['point of view', 'öznel', 'subjektif'],
    subjectFill: 1.0, fov: 50, cameraHeight: 1.7, distance: 3, tilt: 0, roll: 0, arrow: 'none',
  },
  {
    id: 'two-shot', name: 'Two-Shot', nameTr: 'İkili Plan', short: '2S', category: 'konum',
    description: 'İki karakter aynı çerçevede; ilişkiyi kurar.',
    tags: ['two shot', 'ikili'],
    subjectFill: 1.6, fov: 40, cameraHeight: 1.6, distance: 4.4, tilt: 0, roll: 0, arrow: 'none',
  },
  {
    id: 'three-shot', name: 'Three-Shot', nameTr: 'Üçlü Plan', short: '3S', category: 'konum',
    description: 'Üç karakter aynı çerçevede.',
    tags: ['three shot', 'üçlü'],
    subjectFill: 1.3, fov: 38, cameraHeight: 1.6, distance: 5.4, tilt: 0, roll: 0, arrow: 'none',
  },
  {
    id: 'insert', name: 'Insert', nameTr: 'Ara Kesme / Detay', short: 'INS', category: 'konum',
    description: 'Nesne ya da detayın araya giren yakın çekimi.',
    tags: ['insert', 'detay', 'cutaway'],
    subjectFill: 7.0, fov: 55, cameraHeight: 1.1, distance: 0.6, tilt: -25, roll: 0, arrow: 'none',
  },

  /* -------------------------------- AÇI ------------------------------- */
  {
    id: 'eye-level', name: 'Eye Level', nameTr: 'Göz Hizası', short: 'EL', category: 'aci',
    description: 'Nötr, tarafsız bakış. Kamera özne göz hizasında.',
    tags: ['eye level', 'nötr'],
    subjectFill: 2.0, fov: 45, cameraHeight: 1.65, distance: 3.6, tilt: 0, roll: 0, arrow: 'none',
  },
  {
    id: 'low-angle', name: 'Low Angle', nameTr: 'Alt Açı', short: 'LA', category: 'aci',
    description: 'Aşağıdan yukarı bakış; özneyi güçlü ve heybetli gösterir.',
    tags: ['low angle', 'alt açı', 'güç'],
    subjectFill: 2.0, fov: 42, cameraHeight: 0.5, distance: 3.2, tilt: 22, roll: 0, arrow: 'none',
  },
  {
    id: 'high-angle', name: 'High Angle', nameTr: 'Üst Açı', short: 'HA', category: 'aci',
    description: 'Yukarıdan aşağı bakış; özneyi küçük ve savunmasız gösterir.',
    tags: ['high angle', 'üst açı', 'zayıf'],
    subjectFill: 1.8, fov: 42, cameraHeight: 3.0, distance: 3.4, tilt: -25, roll: 0, arrow: 'none',
  },
  {
    id: 'birds-eye', name: "Bird's Eye", nameTr: 'Kuşbakışı', short: 'BE', category: 'aci',
    description: 'Tam tepeden bakış; olayı harita gibi gösterir.',
    tags: ['birds eye', 'kuşbakışı', 'top down'],
    subjectFill: 1.2, fov: 40, cameraHeight: 12, distance: 12, tilt: -85, roll: 0, arrow: 'none',
  },
  {
    id: 'worms-eye', name: "Worm's Eye", nameTr: 'Solucan Bakışı', short: 'WE', category: 'aci',
    description: 'Yerden tavana bakış; aşırı heybet ve tedirginlik.',
    tags: ['worms eye', 'solucan', 'yerden'],
    subjectFill: 2.2, fov: 50, cameraHeight: 0.08, distance: 2.0, tilt: 60, roll: 0, arrow: 'none',
  },
  {
    id: 'dutch', name: 'Dutch Angle', nameTr: 'Eğik Açı', short: 'DA', category: 'aci',
    description: 'Kamera yana yatar; huzursuzluk ve dengesizlik hissi.',
    tags: ['dutch', 'eğik', 'canted'],
    subjectFill: 2.0, fov: 45, cameraHeight: 1.6, distance: 3.2, tilt: 0, roll: 15, arrow: 'none',
  },

  /* ----------------------------- HAREKET ------------------------------ */
  {
    id: 'pan-right', name: 'Pan Right', nameTr: 'Sağa Çevrinme', short: 'PAN→', category: 'hareket',
    description: 'Kamera sabit, gövde yatayda sağa döner.',
    tags: ['pan', 'çevrinme'],
    subjectFill: 1.6, fov: 40, cameraHeight: 1.6, distance: 5, tilt: 0, roll: 0, arrow: 'panRight',
  },
  {
    id: 'pan-left', name: 'Pan Left', nameTr: 'Sola Çevrinme', short: '←PAN', category: 'hareket',
    description: 'Kamera sabit, gövde yatayda sola döner.',
    tags: ['pan', 'çevrinme'],
    subjectFill: 1.6, fov: 40, cameraHeight: 1.6, distance: 5, tilt: 0, roll: 0, arrow: 'panLeft',
  },
  {
    id: 'tilt-up', name: 'Tilt Up', nameTr: 'Yukarı Eğinme', short: 'TILT↑', category: 'hareket',
    description: 'Kamera sabit, dikeyde yukarı döner.',
    tags: ['tilt', 'eğinme'],
    subjectFill: 1.6, fov: 40, cameraHeight: 1.4, distance: 4, tilt: 10, roll: 0, arrow: 'tiltUp',
  },
  {
    id: 'tilt-down', name: 'Tilt Down', nameTr: 'Aşağı Eğinme', short: 'TILT↓', category: 'hareket',
    description: 'Kamera sabit, dikeyde aşağı döner.',
    tags: ['tilt', 'eğinme'],
    subjectFill: 1.6, fov: 40, cameraHeight: 2.4, distance: 4, tilt: -10, roll: 0, arrow: 'tiltDown',
  },
  {
    id: 'dolly-in', name: 'Dolly In', nameTr: 'Kaydırarak Yaklaşma', short: 'DOLLY IN', category: 'hareket',
    description: 'Kamera fiziksel olarak özneye yaklaşır; perspektif değişir.',
    tags: ['dolly', 'kaydırma', 'yaklaşma'],
    subjectFill: 2.2, fov: 42, cameraHeight: 1.6, distance: 3.0, tilt: 0, roll: 0, arrow: 'dollyIn',
  },
  {
    id: 'dolly-out', name: 'Dolly Out', nameTr: 'Kaydırarak Uzaklaşma', short: 'DOLLY OUT', category: 'hareket',
    description: 'Kamera özneden uzaklaşır; yalnızlık ve açığa çıkarma.',
    tags: ['dolly', 'kaydırma', 'uzaklaşma'],
    subjectFill: 1.2, fov: 42, cameraHeight: 1.6, distance: 6.5, tilt: 0, roll: 0, arrow: 'dollyOut',
  },
  {
    id: 'track', name: 'Track', nameTr: 'Takip (Tracking)', short: 'TRACK', category: 'hareket',
    description: 'Kamera özneye paralel hareket ederek onu takip eder.',
    tags: ['track', 'takip', 'travelling'],
    subjectFill: 1.6, fov: 40, cameraHeight: 1.6, distance: 4.0, tilt: 0, roll: 0, arrow: 'trackRight',
  },
  {
    id: 'zoom-in', name: 'Zoom In', nameTr: 'Optik Yakınlaşma', short: 'ZOOM IN', category: 'hareket',
    description: 'Odak uzaklığı artar; kamera yerinde kalır, perspektif sıkışır.',
    tags: ['zoom', 'yakınlaşma'],
    subjectFill: 3.0, fov: 24, cameraHeight: 1.6, distance: 6, tilt: 0, roll: 0, arrow: 'zoomIn',
  },
  {
    id: 'zoom-out', name: 'Zoom Out', nameTr: 'Optik Uzaklaşma', short: 'ZOOM OUT', category: 'hareket',
    description: 'Odak uzaklığı azalır; çerçeve genişler.',
    tags: ['zoom', 'uzaklaşma'],
    subjectFill: 1.0, fov: 65, cameraHeight: 1.6, distance: 6, tilt: 0, roll: 0, arrow: 'zoomOut',
  },
  {
    id: 'crane-up', name: 'Crane Up', nameTr: 'Vinç Yükselme', short: 'CRANE↑', category: 'hareket',
    description: 'Kamera dikey olarak yükselir; final ve açığa çıkarma hissi.',
    tags: ['crane', 'jib', 'vinç'],
    subjectFill: 1.2, fov: 40, cameraHeight: 5.0, distance: 6, tilt: -20, roll: 0, arrow: 'craneUp',
  },
  {
    id: 'crane-down', name: 'Crane Down', nameTr: 'Vinç Alçalma', short: 'CRANE↓', category: 'hareket',
    description: 'Kamera yukarıdan aşağı iner; sahneye giriş.',
    tags: ['crane', 'jib', 'vinç'],
    subjectFill: 1.6, fov: 40, cameraHeight: 2.0, distance: 5, tilt: -6, roll: 0, arrow: 'craneDown',
  },
  {
    id: 'handheld', name: 'Handheld', nameTr: 'Omuz Kamerası', short: 'HH', category: 'hareket',
    description: 'Elde çekim; titrek, belgesel gerçekçiliği.',
    tags: ['handheld', 'elde', 'shaky'],
    subjectFill: 1.8, fov: 45, cameraHeight: 1.62, distance: 3.4, tilt: 0, roll: 3, arrow: 'handheld',
  },
];

const INDEX = new Map(CAMERA_PRESETS.map((c) => [c.id, c]));

export function getCameraPreset(id: string): CameraPreset | undefined {
  return INDEX.get(id);
}

export function searchCameraPresets(
  query: string,
  category?: CameraCategory | 'all',
): CameraPreset[] {
  const q = query.trim().toLocaleLowerCase('tr');
  return CAMERA_PRESETS.filter((c) => {
    if (category && category !== 'all' && c.category !== category) return false;
    if (!q) return true;
    return (
      c.name.toLocaleLowerCase('tr').includes(q) ||
      c.nameTr.toLocaleLowerCase('tr').includes(q) ||
      c.short.toLocaleLowerCase('tr').includes(q) ||
      c.tags.some((t) => t.includes(q))
    );
  });
}

/** Preset etiketini panel meta verisine yazılacak biçimde döndürür. */
export function cameraLabel(preset: CameraPreset): string {
  return `${preset.short} — ${preset.nameTr}`;
}

/**
 * Presetin arayüz dilindeki adı.
 *
 * Kamera verisi zaten iki dilli (`name` İngilizce, `nameTr` Türkçe) —
 * burada `t()` gerekmiyor, seçim yeter. Fonksiyon çünkü ÇAĞRILDIĞI ANDA
 * dili okumalı: modül seviyesinde bir sabit olsaydı dil değişince eskirdi.
 */
export function kameraAdi(p: { name: string; nameTr: string }): string {
  return arayuzDili() === 'tr' ? p.nameTr : p.name;
}
