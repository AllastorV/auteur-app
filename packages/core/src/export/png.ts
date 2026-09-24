import JSZip from 'jszip';
import type { Panel, Project } from '../model/types';
import { DEFAULT_FILENAME_TEMPLATE, renderFileNameTemplate, safeFileName } from '../model/project-io';

export interface PngSequenceOptions {
  fileNameTemplate?: string;
  transparent?: boolean;
  renderPanel: (panel: Panel) => Promise<string>;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

export interface PngFrame {
  fileName: string;
  dataUrl: string;
}

export async function buildPngSequence(
  project: Project,
  opts: PngSequenceOptions,
): Promise<PngFrame[]> {
  const template = opts.fileNameTemplate || DEFAULT_FILENAME_TEMPLATE;
  const out: PngFrame[] = [];
  const used = new Set<string>();

  for (let i = 0; i < project.panels.length; i++) {
    if (opts.signal?.cancelled) return out;
    const panel = project.panels[i];
    const dataUrl = await opts.renderPanel(panel);
    /* Sahne/çekim numarası ve şablonun kendisi kullanıcı metnidir. Ham
       geçirilirse üretilen ad yol ayracı içerebiliyordu: ZIP girdisi alt
       klasöre düşer ya da `../` ile arşivin dışına çıkar (zip-slip). Temizlik
       adın ÜRETİLDİĞİ yerde yapılır — her çağıranın ayrı ayrı yapması
       beklenemez. */
    let fileName = safeFileName(
      renderFileNameTemplate(template, {
        sahne: panel.meta.scene,
        cekim: panel.meta.shot,
        panel: i + 1,
        ad: safeFileName(project.meta.name),
      }),
    );
    if (!/\.png$/i.test(fileName)) fileName += '.png';
    // Aynı sahne/çekim numarası birden çok panelde kullanılabilir.
    if (used.has(fileName)) {
      const base = fileName.replace(/\.png$/i, '');
      let n = 2;
      while (used.has(`${base}_${n}.png`)) n++;
      fileName = `${base}_${n}.png`;
    }
    used.add(fileName);
    out.push({ fileName, dataUrl });
    opts.onProgress?.(i + 1, project.panels.length);
  }
  return out;
}

export function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Kareleri ZIP'e paketler (tarayıcı indirmesi ya da masaüstü kaydı için). */
export async function zipFrames(frames: PngFrame[], readme?: string): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of frames) zip.file(f.fileName, dataUrlToUint8(f.dataUrl));
  if (readme) zip.file('OKUBENI.txt', readme);
  return zip.generateAsync({ type: 'uint8array' });
}
