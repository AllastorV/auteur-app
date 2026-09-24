import type { SBObject } from '../model/types';
import { createCameraOverlay, createLine, createRect, createText } from '../model/objects';
import { cameraLabel, getCameraPreset } from './cameras';

export interface TemplateContext {
  frame: { width: number; height: number };
  layerId: string;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  category: 'diyalog' | 'aksiyon' | 'kurulus' | 'duzen';
  cameraPresetId?: string;
  build: (ctx: TemplateContext) => SBObject[];
}


function camera(ctx: TemplateContext, presetId: string): SBObject | null {
  const preset = getCameraPreset(presetId);
  if (!preset) return null;
  const w = ctx.frame.width * 0.86;
  return createCameraOverlay(
    { layerId: ctx.layerId, x: ctx.frame.width / 2, y: ctx.frame.height / 2 },
    {
      presetId,
      label: cameraLabel(preset),
      width: w,
      height: (w * ctx.frame.height) / ctx.frame.width,
      showArrow: preset.category === 'hareket',
    },
  );
}

function horizon(ctx: TemplateContext, ratio: number): SBObject {
  return createLine(
    { layerId: ctx.layerId, x: 0, y: ctx.frame.height * ratio, name: 'Ufuk' },
    { points: [0, 0, ctx.frame.width, 0], stroke: '#94a3b8', strokeWidth: 3 },
  );
}

const compact = (items: (SBObject | null)[]): SBObject[] => items.filter((o): o is SBObject => Boolean(o));

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'diyalog-ots',
    name: 'Diyalog — Omuz Üstü',
    description: 'Ön planda sırtı dönük figür, karşısında konuşan karakter.',
    category: 'diyalog',
    cameraPresetId: 'ots',
    build: (ctx) =>
      compact([
        horizon(ctx, 0.72),
        camera(ctx, 'ots'),
      ]),
  },
  {
    id: 'diyalog-ikili',
    name: 'Diyalog — İkili Plan',
    description: 'Karşılıklı iki karakter, orta plan.',
    category: 'diyalog',
    cameraPresetId: 'two-shot',
    build: (ctx) =>
      compact([
        horizon(ctx, 0.75),
        camera(ctx, 'two-shot'),
      ]),
  },
  {
    id: 'kurulus-genis',
    name: 'Kuruluş — Geniş Plan',
    description: 'Mekânı tanıtan uzak plan; küçük figür ve ufuk çizgisi.',
    category: 'kurulus',
    cameraPresetId: 'els',
    build: (ctx) =>
      compact([
        horizon(ctx, 0.66),
        camera(ctx, 'els'),
      ]),
  },
  {
    id: 'aksiyon-kovalamaca',
    name: 'Aksiyon — Kovalamaca',
    description: 'Koşan figür ve hareket yönü oku.',
    category: 'aksiyon',
    cameraPresetId: 'track',
    build: (ctx) =>
      compact([
        horizon(ctx, 0.78),
        camera(ctx, 'track'),
      ]),
  },
  {
    id: 'aksiyon-dovus',
    name: 'Aksiyon — Dövüş',
    description: 'Yumruk atan ve savunan iki figür.',
    category: 'aksiyon',
    cameraPresetId: 'ms',
    build: (ctx) =>
      compact([
        camera(ctx, 'ms'),
      ]),
  },
  {
    id: 'yakin-plan',
    name: 'Yakın Plan — Tepki',
    description: 'Tek figür, yüz yakın planı çerçevesi.',
    category: 'diyalog',
    cameraPresetId: 'cu',
    build: (ctx) =>
      compact([
        camera(ctx, 'cu'),
      ]),
  },
  {
    id: 'duzen-notlu',
    name: 'Düzen — Notlu Çerçeve',
    description: 'Alt şeritte aksiyon ve diyalog notu için yer.',
    category: 'duzen',
    build: (ctx) =>
      compact([
        createRect(
          { layerId: ctx.layerId, x: ctx.frame.width / 2, y: ctx.frame.height * 0.9, name: 'Not şeridi' },
          {
            width: ctx.frame.width * 0.94,
            height: ctx.frame.height * 0.14,
            fill: '#f1f5f9',
            stroke: '#94a3b8',
            strokeWidth: 2,
          },
        ),
        createText(
          { layerId: ctx.layerId, x: ctx.frame.width * 0.06, y: ctx.frame.height * 0.855, name: 'Aksiyon' },
          { text: 'AKSİYON: ', fontSize: Math.round(ctx.frame.height * 0.035), fill: '#0f172a' },
        ),
      ]),
  },
  {
    id: 'duzen-split',
    name: 'Düzen — Bölünmüş Ekran',
    description: 'Dikey olarak ikiye bölünmüş çerçeve.',
    category: 'duzen',
    build: (ctx) =>
      compact([
        createLine(
          { layerId: ctx.layerId, x: ctx.frame.width / 2, y: 0, name: 'Bölme' },
          { points: [0, 0, 0, ctx.frame.height], stroke: '#0f172a', strokeWidth: 6 },
        ),
      ]),
  },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function searchTemplates(query: string, category?: string): TemplateDef[] {
  const q = query.trim().toLocaleLowerCase('tr');
  return TEMPLATES.filter((t) => {
    if (category && category !== 'all' && t.category !== category) return false;
    if (!q) return true;
    return (
      t.name.toLocaleLowerCase('tr').includes(q) ||
      t.description.toLocaleLowerCase('tr').includes(q)
    );
  });
}
