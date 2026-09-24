import { uid } from '../util/id';
import { emptyScript } from './script';
import {
  DEFAULT_FRAME_GUIDES,
  PROJECT_SCHEMA_VERSION,
  type Layer,
  type Panel,
  type PanelMeta,
  type Project,
  type ProjectSettings,
} from './types';

export function createLayer(partial: Partial<Layer> = {}): Layer {
  return {
    id: partial.id ?? uid('lyr'),
    name: partial.name ?? 'Katman',
    kind: partial.kind ?? 'main',
    visible: partial.visible ?? true,
    locked: partial.locked ?? false,
    opacity: partial.opacity ?? 1,
    blendMode: partial.blendMode ?? 'normal',
    order: partial.order ?? 0,
  };
}

/** Her panel varsayılan olarak bir ana katman + bir işaretleme katmanı ile açılır. */
export function defaultLayers(): Layer[] {
  return [
    createLayer({ name: 'Arka Plan', kind: 'main', order: 0 }),
    createLayer({ name: 'Çizim', kind: 'main', order: 1 }),
    createLayer({ name: 'İşaretleme', kind: 'annotation', order: 2, opacity: 0.9 }),
  ];
}

export function createPanelMeta(partial: Partial<PanelMeta> = {}): PanelMeta {
  return {
    scene: partial.scene ?? '1',
    shot: partial.shot ?? '1',
    duration: partial.duration ?? 3,
    dialogue: partial.dialogue ?? '',
    action: partial.action ?? '',
    sound: partial.sound ?? '',
    cameraLabel: partial.cameraLabel ?? '',
  };
}

export function createPanel(
  partial: Partial<Omit<Panel, 'meta'>> & { meta?: Partial<PanelMeta> } = {},
): Panel {
  return {
    id: partial.id ?? uid('pnl'),
    meta: createPanelMeta(partial.meta),
    layers: partial.layers ?? defaultLayers(),
    objects: partial.objects ?? [],
    guides: partial.guides ?? { ...DEFAULT_FRAME_GUIDES },
    transition: partial.transition ?? 'cut',
    transitionDuration: partial.transitionDuration ?? 0.5,
    /* Uygulamada TEK kağıt var: senaryo sayfası da storyboard karesi de
       aynı kırık beyaz. Saf beyaz bir kare, odadaki tek ışığın kağıt olduğu
       tasarımı bozuyordu — iki farklı beyaz iki farklı kağıt demek. */
    background: partial.background ?? '#f7f5f0',
    scriptRefs: partial.scriptRefs ?? [],
  };
}

export function defaultSettings(partial: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    aspect: partial.aspect ?? '16:9',
    fps: partial.fps ?? 24,
    panelsPerPage: partial.panelsPerPage ?? 6,
    defaultPanelDuration: partial.defaultPanelDuration ?? 3,
    guides: partial.guides ?? { ...DEFAULT_FRAME_GUIDES },
    /* Alanlar burada TEK TEK yazıldığı için yeni bir ayarı buraya
       eklemeyi unutmak onu SESSİZCE düşürüyor — `dokumanTipi` bir kez
       tam olarak böyle kaybolmuştu (bkz. `createProject` yorumu) ve
       "yeni proje" penceresinde tür seçmek hiçbir zaman işe yaramamıştı.
       Fon şablonu da aynı yoldan geliyor: düşerse belge açılır ama
       kontrol listesi neyi eksik sayacağını bilemez. */
    fonSablonu: partial.fonSablonu,
    belgeDili: partial.belgeDili,
    fonKaynak: partial.fonKaynak,
  };
}

export function createProject(
  partial: Partial<Omit<Project, 'meta' | 'settings'>> & {
    meta?: Partial<Project['meta']>;
    settings?: Partial<ProjectSettings>;
  } = {},
): Project {
  const now = Date.now();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    meta: {
      id: partial.meta?.id ?? uid('prj'),
      name: partial.meta?.name ?? 'İsimsiz Proje',
      createdAt: partial.meta?.createdAt ?? now,
      updatedAt: partial.meta?.updatedAt ?? now,
      author: partial.meta?.author ?? '',
      description: partial.meta?.description ?? '',
      /* Doküman tipi ALANLARIN LİSTESİNDE DEĞİLDİ ve sessizce düşüyordu:
         "yeni proje" diyaloğunda tür seçmek hiçbir zaman işe yaramamış,
         her proje senaryo olarak açılmıştı. Meta alanları burada TEK TEK
         yazıldığı için yeni bir alan eklemek onu buraya da yazmayı
         gerektiriyor — bu düşüş sessiz olduğu için testle kapatıldı. */
      dokumanTipi: partial.meta?.dokumanTipi,
    },
    settings: defaultSettings(partial.settings),
    panels: partial.panels ?? [createPanel()],
    script: partial.script ?? emptyScript(),
  };
}

/** Yeni panelin sahne/çekim numarasını öncekinden türetir. */
export function nextPanelMeta(prev: Panel | undefined, defaultDuration: number): PanelMeta {
  if (!prev) return createPanelMeta({ duration: defaultDuration });
  const shotNum = parseInt(prev.meta.shot, 10);
  return createPanelMeta({
    scene: prev.meta.scene,
    shot: Number.isFinite(shotNum) ? String(shotNum + 1) : prev.meta.shot,
    duration: defaultDuration,
  });
}
