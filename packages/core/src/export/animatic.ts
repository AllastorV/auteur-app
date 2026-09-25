import type { Panel, Project, TransitionKind } from '../model/types';
import { buildTimeline } from '../model/timeline';
import { t } from '../dil/arayuz';

export interface AnimaticSegment {
  /** PNG dataURL */
  dataUrl: string;
  /** Bu karenin ekranda kalacağı süre (sn) */
  duration: number;
}

/**
 * Animatik kare listesi.
 *
 * Sabit paneller tek bir kare + süre olarak ifade edilir; geçişler ise
 * FPS'e göre ara karelere açılır. ffmpeg tarafında `concat` demuxer bu
 * listeyi birebir uygular, böylece toplam süre zaman çizelgesiyle
 * kare hassasiyetinde (±1/FPS) eşleşir.
 */
export interface BuildAnimaticOptions {
  fps: number;
  width: number;
  height: number;
  /** Panel görüntülerini üreten fonksiyon */
  renderPanel: (panel: Panel) => Promise<string>;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
  /**
   * Verilirse her kare üretildiği anda buraya aktarılır ve bellekte tutulmaz;
   * dönen listede yalnızca süre bilgisi kalır (`dataUrl` boş dize olur).
   *
   * Büyük animatiklerde tüm kare setini bellekte biriktirmek hem renderer'ı
   * hem de tek IPC mesajını şişirir.
   */
  onSegment?: (segment: AnimaticSegment, index: number) => Promise<void> | void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('Kare yüklenemedi.')));
    img.src = src;
  });
}

/** İki kare arasındaki geçişin `t` (0..1) anındaki bileşimini çizer. */
export function compositeTransition(
  ctx: CanvasRenderingContext2D,
  from: HTMLImageElement | null,
  to: HTMLImageElement | null,
  kind: TransitionKind,
  t: number,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  switch (kind) {
    case 'dissolve': {
      if (from) ctx.drawImage(from, 0, 0, width, height);
      if (to) {
        ctx.globalAlpha = t;
        ctx.drawImage(to, 0, 0, width, height);
      }
      break;
    }
    case 'fadeOut': {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      if (from) {
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(from, 0, 0, width, height);
      }
      break;
    }
    case 'fadeIn': {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      if (to) {
        ctx.globalAlpha = t;
        ctx.drawImage(to, 0, 0, width, height);
      }
      break;
    }
    case 'wipe': {
      if (from) ctx.drawImage(from, 0, 0, width, height);
      if (to) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width * t, height);
        ctx.clip();
        ctx.drawImage(to, 0, 0, width, height);
        ctx.restore();
      }
      break;
    }
    case 'cut':
    default: {
      const img = t < 0.5 ? from : to;
      if (img) ctx.drawImage(img, 0, 0, width, height);
      break;
    }
  }
  ctx.restore();
}

export interface PlannedSegment {
  panelIndex: number;
  kind: 'hold' | 'transition';
  /** Geçiş kareleri için 0..1 arası ilerleme */
  t: number;
  duration: number;
}

/**
 * Kare planını görüntü üretmeden hesaplar.
 *
 * Dışa aktarma süresinin zaman çizelgesiyle eşleştiği burada garanti altına
 * alınır; `buildAnimatic` yalnızca bu planı görüntülerle doldurur.
 */
export function planAnimatic(panels: Panel[], fps: number): PlannedSegment[] {
  const segments = buildTimeline(panels);
  const frameDuration = 1 / fps;
  const out: PlannedSegment[] = [];

  for (const seg of segments) {
    if (seg.hold > 0) {
      out.push({ panelIndex: seg.index, kind: 'hold', t: 0, duration: seg.hold });
    }
    if (seg.transitionDuration > 0) {
      const frames = Math.max(1, Math.round(seg.transitionDuration * fps));
      for (let f = 0; f < frames; f++) {
        out.push({
          panelIndex: seg.index,
          kind: 'transition',
          t: (f + 1) / frames,
          // Son kare yuvarlama farkını üstlenir; toplam süre birebir korunur.
          duration:
            f === frames - 1
              ? seg.transitionDuration - frameDuration * (frames - 1)
              : frameDuration,
        });
      }
    }
  }
  return out;
}

/** Planın toplam süresi. */
export function planDuration(plan: PlannedSegment[]): number {
  return plan.reduce((sum, s) => sum + s.duration, 0);
}

export async function buildAnimatic(
  project: Project,
  opts: BuildAnimaticOptions,
): Promise<AnimaticSegment[]> {
  const { fps, width, height } = opts;
  const segments = buildTimeline(project.panels);
  const plan = planAnimatic(project.panels, fps);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('2D bağlam oluşturulamadı.'));

  /**
   * Panel görüntüleri kayan pencerede tutulur.
   *
   * Plan panel sırasına göre ilerlediği için herhangi bir anda yalnızca
   * geçerli panel ve geçişin hedefi gerekir; tüm panelleri baştan üretip
   * bellekte tutmak 4K'da yüzlerce megabayt demekti.
   */
  const cache = new Map<number, { dataUrl: string; image: HTMLImageElement }>();
  let rendered = 0;

  const ensurePanel = async (index: number) => {
    if (index < 0 || index >= project.panels.length) return null;
    const hit = cache.get(index);
    if (hit) return hit;
    const dataUrl = await opts.renderPanel(project.panels[index]);
    const image = await loadImage(dataUrl);
    const entry = { dataUrl, image };
    cache.set(index, entry);
    rendered++;
    opts.onProgress?.(Math.min(rendered, project.panels.length), project.panels.length);
    return entry;
  };

  const evictBefore = (index: number) => {
    for (const key of [...cache.keys()]) {
      if (key < index) cache.delete(key);
    }
  };

  const out: AnimaticSegment[] = [];
  const emit = async (segment: AnimaticSegment) => {
    if (opts.onSegment) {
      await opts.onSegment(segment, out.length);
      // Kare kabuğa geçti; burada tutmaya gerek yok.
      out.push({ dataUrl: '', duration: segment.duration });
      return;
    }
    out.push(segment);
  };

  for (const step of plan) {
    if (opts.signal?.cancelled) return [];
    evictBefore(step.panelIndex);

    const current = await ensurePanel(step.panelIndex);
    if (!current) continue;

    if (step.kind === 'hold') {
      await emit({ dataUrl: current.dataUrl, duration: step.duration });
      continue;
    }

    const next = await ensurePanel(step.panelIndex + 1);
    const seg = segments[step.panelIndex];
    compositeTransition(
      ctx,
      current.image,
      next?.image ?? null,
      seg.transition,
      step.t,
      width,
      height,
    );
    await emit({ dataUrl: canvas.toDataURL('image/png'), duration: step.duration });
  }

  return out;
}

/** Kare listesinin toplam süresi — dışa aktarma doğrulaması için. */
export function segmentsDuration(segments: AnimaticSegment[]): number {
  return segments.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Kare listesinin yaklaşık bellek boyutu (bayt).
 *
 * Aynı dataURL birden çok segmentte paylaşıldığı için (sabit paneller) her
 * benzersiz kare bir kez sayılır.
 */
export function segmentsByteSize(segments: AnimaticSegment[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const s of segments) {
    if (seen.has(s.dataUrl)) continue;
    seen.add(s.dataUrl);
    // base64 → yaklaşık 3/4 ikili boyut; IPC'de dize olarak taşındığı için
    // dizenin kendi uzunluğu ölçüt alınır.
    total += s.dataUrl.length;
  }
  return total;
}

/**
 * Tek bir IPC mesajında taşınabilecek üst sınır.
 *
 * ponytail: kareler tek seferde aktarılıyor; sınır aşıldığında kullanıcıya
 * net hata verilir. Kalıcı çözüm kareleri üretildikçe diske akıtmaktır
 * (renderer → ana süreç akışı), bu da her iki tarafta belleği sabit tutar.
 */
export const MAX_TRANSFER_BYTES = 512 * 1024 * 1024;
