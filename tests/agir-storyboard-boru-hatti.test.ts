import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import ffmpegStatic from 'ffmpeg-static';

import { buildPngSequence, dataUrlToUint8, zipFrames, type PngFrame } from '@storyboard/core/export/png';
import { planAnimatic, planDuration, segmentsDuration, type AnimaticSegment } from '@storyboard/core/export/animatic';
import { buildTimeline, totalDuration } from '@storyboard/core/model/timeline';
import { createPanel, createProject, defaultLayers } from '@storyboard/core/model/factory';
import {
  createCameraOverlay,
  createEllipse,
  createPolygon,
  createRect,
  createStroke,
  createText,
} from '@storyboard/core/model/objects';
import { parseScript, scriptLinkIndex } from '@storyboard/core/model/script';
import { panelSirasiHesapla } from '@storyboard/core/model/sahne-panel';
import { CAMERA_PRESETS } from '@storyboard/core/data/cameras';
import type { Panel, Project, TextObject, TransitionKind } from '@storyboard/core/model/types';
import { frameCounts, renderVideo, setFfmpegPath } from '../apps/desktop/electron/video';
import { discardFrames, pushFrame, takeFrames } from '../apps/desktop/electron/frameStore';

/**
 * AĞIR TEST 6 — 50 panellik storyboard'un TAM dışa aktarım boru hattı.
 *
 * Kapsam: proje kurulumu → senaryo bağı → PNG dizisi → ZIP → animatik video.
 * Her adımın çıktısı VARSAYILMIYOR, çözülüp doğrulanıyor: PNG imzası/IHDR/CRC,
 * ZIP giriş adları ve baytları, ffprobe akış bilgisi ve gerçek kod çözme.
 *
 * Tarayıcıya bağlı olan `renderPanel.tsx` (Konva/WebGL) ve `buildAnimatic`'in
 * canvas kompozisyonu Node'da KOŞMAZ; bu yüzden panel render'ı testte gerçek
 * PNG üreten bir fonksiyonla, geçiş kareleri ise `planAnimatic` + diske akış
 * yoluyla karşılanır. Ölçülen şey boru hattının kendisidir, çizim değil.
 */

const execFileAsync = promisify(execFile);
const FFMPEG = (ffmpegStatic as unknown as string) ?? '';
const FFPROBE = 'ffprobe';

const PANEL_SAYISI = 50;
const GENISLIK = 1280;
const YUKSEKLIK = 720;
const FPS = 24;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agir-sb-'));
const ciktiDir = path.resolve(__dirname, '..', 'test-results', 'agir-storyboard');

/** Ölçümler tek yerde birikir; sonda hem konsola hem dosyaya yazılır. */
const olcumler: Record<string, unknown> = {};

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(ciktiDir, { recursive: true });
  fs.writeFileSync(path.join(ciktiDir, 'olcumler.json'), JSON.stringify(olcumler, null, 2));
});

/* ------------------------------------------------------------------ */
/* PNG kodlayıcı / çözücü — ek bağımlılık YOK, yalnız Node zlib         */
/* ------------------------------------------------------------------ */

function crc32(veri: Buffer): number {
  let c = 0xffffffff;
  for (const bayt of veri) {
    c ^= bayt;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function parca(tip: string, veri: Buffer): Buffer {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length, 0);
  const govde = Buffer.concat([Buffer.from(tip, 'ascii'), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(govde), 0);
  return Buffer.concat([uzunluk, govde, crc]);
}

const PNG_IMZA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Tek renkli gerçek PNG (truecolour, 8 bit, filtre yok). */
function pngUret(gen: number, yuk: number, rgb: [number, number, number]): string {
  const satirBayt = 1 + gen * 3;
  const ham = Buffer.alloc(satirBayt * yuk);
  for (let y = 0; y < yuk; y++) {
    const bas = y * satirBayt;
    ham[bas] = 0; // filtre: none
    for (let x = 0; x < gen; x++) {
      ham[bas + 1 + x * 3] = rgb[0];
      ham[bas + 2 + x * 3] = rgb[1];
      ham[bas + 3 + x * 3] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(gen, 0);
  ihdr.writeUInt32BE(yuk, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // renk tipi: truecolour
  const png = Buffer.concat([
    PNG_IMZA,
    parca('IHDR', ihdr),
    parca('IDAT', zlib.deflateSync(ham)),
    parca('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

interface CozulmusPng {
  gen: number;
  yuk: number;
  bitDerinligi: number;
  renkTipi: number;
  iendVar: boolean;
  /** Sol üst pikselin RGB'si — kare kimliği buradan okunur. */
  ilkPiksel: [number, number, number];
}

/**
 * PNG'yi baytından çözer.
 *
 * Sahte/boş bir dataURL burada AYAKTA KALAMAZ: imza, her chunk'ın CRC'si,
 * IHDR alanları ve IDAT'ın gerçekten açılabilmesi tek tek sınanır.
 */
function pngCoz(bayt: Uint8Array): CozulmusPng {
  const buf = Buffer.from(bayt);
  if (!buf.subarray(0, 8).equals(PNG_IMZA)) throw new Error('PNG imzası yok.');

  let ofs = 8;
  let ihdr: Buffer | null = null;
  let iendVar = false;
  const idat: Buffer[] = [];

  while (ofs + 8 <= buf.length) {
    const uzunluk = buf.readUInt32BE(ofs);
    const tip = buf.toString('ascii', ofs + 4, ofs + 8);
    const veri = buf.subarray(ofs + 8, ofs + 8 + uzunluk);
    const beklenen = buf.readUInt32BE(ofs + 8 + uzunluk);
    if (crc32(buf.subarray(ofs + 4, ofs + 8 + uzunluk)) !== beklenen) {
      throw new Error(`${tip} chunk CRC uyuşmuyor.`);
    }
    if (tip === 'IHDR') ihdr = Buffer.from(veri);
    if (tip === 'IDAT') idat.push(Buffer.from(veri));
    if (tip === 'IEND') iendVar = true;
    ofs += 12 + uzunluk;
  }
  if (!ihdr) throw new Error('IHDR yok.');

  const gen = ihdr.readUInt32BE(0);
  const yuk = ihdr.readUInt32BE(4);
  const ham = zlib.inflateSync(Buffer.concat(idat));
  if (ham[0] !== 0) throw new Error('Beklenmeyen satır filtresi.');

  return {
    gen,
    yuk,
    bitDerinligi: ihdr[8],
    renkTipi: ihdr[9],
    iendVar,
    ilkPiksel: [ham[1], ham[2], ham[3]],
  };
}

/* ------------------------------------------------------------------ */
/* Panel kimliğini renge gömen palet                                    */
/* ------------------------------------------------------------------ */

/**
 * 4×4×4 kaba ızgara: 50 panelin hepsi benzersiz ve komşular arası en küçük
 * uzaklık 64. Bu boşluk, videonun yuv420p dönüşümünden sonra bile hangi
 * panelin karesine baktığımızı tereddütsüz okumaya yetiyor.
 */
const IZGARA = [20, 84, 148, 212];
function panelRengi(i: number): [number, number, number] {
  return [IZGARA[i % 4], IZGARA[Math.floor(i / 4) % 4], IZGARA[Math.floor(i / 16) % 4]];
}

/** Renkten panel indeksini geri okur (en yakın palet girdisi). */
function renktenIndeks(rgb: [number, number, number]): number {
  let en = -1;
  let enUzak = Infinity;
  for (let i = 0; i < PANEL_SAYISI; i++) {
    const p = panelRengi(i);
    const d = (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2;
    if (d < enUzak) {
      enUzak = d;
      en = i;
    }
  }
  return en;
}

/**
 * Panelin İÇERİĞİNDEN indeksini okur.
 *
 * Renk paneli dışarıdan verilen bir sayaçtan değil, panelin kendi metin
 * objesinden türüyor: boru hattı yanlış paneli render ettirirse renk de
 * yanlış çıkar ve karışıklık ölçülebilir olur.
 */
function panelIndeksi(panel: Panel): number {
  const etiket = panel.objects.find(
    (o): o is TextObject => o.kind === 'text' && o.text.startsWith('PANEL '),
  );
  if (!etiket) throw new Error(`Panel etiketi bulunamadı: ${panel.id}`);
  return Number(etiket.text.slice('PANEL '.length));
}

let renderSayaci = 0;
async function renderPanel(panel: Panel): Promise<string> {
  renderSayaci++;
  return pngUret(GENISLIK, YUKSEKLIK, panelRengi(panelIndeksi(panel)));
}

/* ------------------------------------------------------------------ */
/* 50 panellik proje                                                    */
/* ------------------------------------------------------------------ */

const SAHNE_SAYISI = 17;

function senaryoKaynagi(): string {
  const satirlar: string[] = [];
  for (let s = 0; s < SAHNE_SAYISI; s++) {
    satirlar.push(`İÇ. ODA ${s + 1} - GECE`, '', `Ayşe ${s + 1}. odada kapıyı iter.`, '', 'AYŞE', `Replik ${s + 1}.`, '');
  }
  return satirlar.join('\n');
}

function panelKur(i: number, sahneNo: string, cekimNo: string, refs: string[]): Panel {
  const katmanlar = defaultLayers();
  const arka = katmanlar[0].id;
  const cizim = katmanlar[1].id;
  const isaret = katmanlar[2].id;

  // Basınçlı serbest çizgi — objelerin en ağır olanı, 40 nokta.
  const noktalar: number[] = [];
  for (let n = 0; n < 40; n++) {
    noktalar.push(20 + n * 6, 40 + Math.sin((n + i) / 3) * 25, 0.4 + (n % 5) / 10);
  }

  const preset = CAMERA_PRESETS[i % CAMERA_PRESETS.length];

  const gecisler: TransitionKind[] = ['dissolve', 'cut', 'wipe', 'fadeOut'];

  return createPanel({
    layers: katmanlar,
    objects: [
      createRect({ layerId: arka, x: 0, y: 0 }, { width: GENISLIK, height: YUKSEKLIK, fill: '#e5e7eb' }),
      createStroke({ layerId: cizim, x: 0, y: 0 }, { points: noktalar, color: '#111827', width: 3, brush: true }),
      createEllipse({ layerId: cizim, x: 120 + i, y: 70 }, { radiusX: 30, radiusY: 22 }),
      createPolygon({ layerId: cizim, x: 200, y: 90 }, { points: [0, 0, 40, 0, 20, 35], closed: true, fill: '#94a3b8' }),
      createCameraOverlay(
        { layerId: isaret, x: 0, y: 0 },
        { presetId: preset.id, label: preset.short, width: GENISLIK, height: YUKSEKLIK },
      ),
      // Bu metin panelin kimliğidir — render'ı ona bağlar (bkz. panelIndeksi).
      createText({ layerId: isaret, x: 8, y: 8 }, { text: `PANEL ${i}`, fontSize: 18 }),
      createText({ layerId: isaret, x: 8, y: 150 }, { text: `Replik ${i}: kapıyı iter.`, fontSize: 14 }),
    ],
    // Süre ve geçiş desenleri zaman çizelgesini tek düze olmaktan çıkarır.
    meta: { scene: sahneNo, shot: cekimNo, duration: 0.5 + (i % 4) * 0.25, dialogue: `Replik ${i}` },
    transition: i === PANEL_SAYISI - 1 ? 'fadeOut' : gecisler[i % gecisler.length],
    transitionDuration: 0.25,
    scriptRefs: refs,
  });
}

let proje: Project;

beforeAll(() => {
  const script = parseScript('senaryo.fountain', senaryoKaynagi());
  const sahneBloklari = script.blocks.filter((b) => b.type === 'scene');
  const aksiyonBloklari = script.blocks.filter((b) => b.type === 'action');

  const paneller: Panel[] = [];
  for (let i = 0; i < PANEL_SAYISI; i++) {
    const s = Math.min(Math.floor(i / 3), SAHNE_SAYISI - 1);
    /* 20 ve 21. paneller 1. sahnenin 1. çekimini TEKRAR eder: dosya adı
       çakışması (`_2`, `_3`) ancak böyle zorlanabilir. */
    const sahneNo = i === 20 || i === 21 ? '1' : String(s + 1);
    const cekimNo = i === 20 || i === 21 ? '1' : String((i % 3) + 1);
    paneller.push(panelKur(i, sahneNo, cekimNo, [sahneBloklari[s].id, aksiyonBloklari[s].id]));
  }

  proje = createProject({ meta: { name: 'Ağır Boru Hattı' }, settings: { fps: FPS }, panels: paneller, script });
});

/* ------------------------------------------------------------------ */

describe('AĞIR 6 — 50 panellik storyboard, tam dışa aktarım boru hattı', () => {
  it('proje senaryoya bağlı 50 panelle kuruluyor', () => {
    expect(proje.panels).toHaveLength(PANEL_SAYISI);

    const objeSayisi = proje.panels.reduce((t, p) => t + p.objects.length, 0);
    const turler = new Set(proje.panels.flatMap((p) => p.objects.map((o) => o.kind)));
    expect(turler).toEqual(new Set(['rect', 'stroke', 'ellipse', 'polygon', 'cameraOverlay', 'text']));

    // Her scriptRef gerçekten var olan bir bloğu göstermeli — kopuk bağ sessizce geçmesin.
    const blokKimlikleri = new Set(proje.script.blocks.map((b) => b.id));
    const index = scriptLinkIndex(proje.panels);
    for (const ref of index.keys()) expect(blokKimlikleri.has(ref)).toBe(true);
    expect(index.size).toBe(SAHNE_SAYISI * 2);

    // Panel sırası zaten senaryo sırasıyla uyumlu: canlı bağ hiçbir şey taşımamalı.
    expect(panelSirasiHesapla(proje.script.blocks, proje.panels).degisti).toBe(false);

    const sure = totalDuration(proje.panels);
    olcumler.kurulum = {
      panel: PANEL_SAYISI,
      obje: objeSayisi,
      katman: proje.panels.reduce((t, p) => t + p.layers.length, 0),
      senaryoBlok: proje.script.blocks.length,
      bagliBlok: index.size,
      toplamSureSn: Number(sure.toFixed(3)),
    };
    console.log('[AĞIR6] kurulum:', olcumler.kurulum);
  });

  /* ---------------------------- PNG dizisi ---------------------------- */

  let kareler: PngFrame[] = [];

  it('PNG dizisi üretiliyor ve her kare GERÇEK bir PNG', async () => {
    const oncekiHeap = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const ilerleme: number[] = [];

    kareler = await buildPngSequence(proje, {
      renderPanel,
      onProgress: (done) => ilerleme.push(done),
    });

    const sure = performance.now() - t0;
    const heapDelta = process.memoryUsage().heapUsed - oncekiHeap;

    expect(kareler).toHaveLength(PANEL_SAYISI);
    expect(ilerleme).toEqual(Array.from({ length: PANEL_SAYISI }, (_, i) => i + 1));
    expect(renderSayaci).toBe(PANEL_SAYISI);

    let toplamBayt = 0;
    kareler.forEach((kare, i) => {
      const bayt = dataUrlToUint8(kare.dataUrl);
      toplamBayt += bayt.length;
      const png = pngCoz(bayt);
      expect(png.gen).toBe(GENISLIK);
      expect(png.yuk).toBe(YUKSEKLIK);
      expect(png.bitDerinligi).toBe(8);
      expect(png.renkTipi).toBe(2);
      expect(png.iendVar).toBe(true);
      // Kare i, panel i'nin rengini taşımalı: boru hattı sırayı bozmadı.
      expect(renktenIndeks(png.ilkPiksel)).toBe(i);
    });

    olcumler.pngDizisi = {
      kare: kareler.length,
      sureMs: Number(sure.toFixed(1)),
      toplamBayt,
      ortalamaKareBayt: Math.round(toplamBayt / kareler.length),
      heapDeltaMb: Number((heapDelta / 1024 / 1024).toFixed(2)),
    };
    console.log('[AĞIR6] PNG dizisi:', olcumler.pngDizisi);
  }, 120000);

  it('aynı sahne/çekim numaraları dosya adında çakışmıyor', () => {
    const adlar = kareler.map((k) => k.fileName);
    expect(new Set(adlar).size).toBe(adlar.length);
    // 0., 20. ve 21. paneller aynı S1_C1 adını istiyor.
    expect(adlar[0]).toBe('S1_C1.png');
    expect(adlar[20]).toBe('S1_C1_2.png');
    expect(adlar[21]).toBe('S1_C1_3.png');
  });

  it('sahne/çekim numarasındaki yol karakteri dosya adına SIZMIYOR', async () => {
    /* Sahne ve çekim numarası kullanıcı metnidir; şablona ham geçerse ZIP
       girdisi `../../` içerir (zip-slip) ya da alt klasöre düşer. Ad üretimi
       bir güven sınırıdır, temizlik orada yapılmalı. */
    const kotu = createProject({
      meta: { name: 'Kaçış' },
      panels: [panelKur(0, '../../kacis', 'C:1*?', [])],
    });
    const [kare] = await buildPngSequence(kotu, { renderPanel });
    expect(kare.fileName).not.toMatch(/[\\/:*?"<>|]/);
    // Ad TEK bir dosya adı olmalı; hiçbir yol parçası taşımamalı.
    expect(path.basename(kare.fileName)).toBe(kare.fileName);
    expect(kare.fileName).toMatch(/\.png$/i);
  });

  /* ------------------------------- ZIP -------------------------------- */

  it('ZIP gerçekten açılıyor; adlar ve baytlar birebir', async () => {
    const t0 = performance.now();
    const zipBayt = await zipFrames(kareler, `${proje.meta.name} — ${kareler.length} panel`);
    const sure = performance.now() - t0;

    expect(zipBayt.length).toBeGreaterThan(0);
    // PK imzası — gerçekten ZIP.
    expect([zipBayt[0], zipBayt[1]]).toEqual([0x50, 0x4b]);

    const zip = await JSZip.loadAsync(zipBayt);
    const girdiler = Object.keys(zip.files);
    expect(girdiler.sort()).toEqual([...kareler.map((k) => k.fileName), 'OKUBENI.txt'].sort());

    // Her girdinin İÇERİĞİ çözülüp kaynağıyla karşılaştırılır.
    for (let i = 0; i < kareler.length; i++) {
      const icerik = await zip.file(kareler[i].fileName)!.async('uint8array');
      expect(Buffer.from(icerik).equals(Buffer.from(dataUrlToUint8(kareler[i].dataUrl)))).toBe(true);
      expect(renktenIndeks(pngCoz(icerik).ilkPiksel)).toBe(i);
    }
    expect(await zip.file('OKUBENI.txt')!.async('string')).toContain('50 panel');

    fs.mkdirSync(ciktiDir, { recursive: true });
    fs.writeFileSync(path.join(ciktiDir, 'ornek-kare.png'), dataUrlToUint8(kareler[0].dataUrl));

    olcumler.zip = {
      sureMs: Number(sure.toFixed(1)),
      zipBayt: zipBayt.length,
      girdi: girdiler.length,
      sikistirmaOrani: Number(
        (zipBayt.length / kareler.reduce((t, k) => t + dataUrlToUint8(k.dataUrl).length, 0)).toFixed(3),
      ),
    };
    console.log('[AĞIR6] ZIP:', olcumler.zip);
  }, 120000);

  /* --------------------------- Animatik video -------------------------- */

  it.skipIf(!FFMPEG || !fs.existsSync(FFMPEG))(
    'animatik video ffmpeg ile üretiliyor ve ffprobe ile doğrulanıyor',
    async () => {
      setFfmpegPath(FFMPEG);

      const plan = planAnimatic(proje.panels, FPS);
      const beklenen = totalDuration(proje.panels);
      expect(planDuration(plan)).toBeCloseTo(beklenen, 6);

      /* Geçiş kareleri tarayıcı canvas'ında besteleniyor (compositeTransition);
         Node'da o yol yok. Boru hattının ölçülen kısmı kare planı → disk →
         ffmpeg zinciri olduğu için geçiş adımları kaynak panelin karesiyle
         doldurulur. */
      const segmentler: AnimaticSegment[] = plan.map((adim) => ({
        dataUrl: kareler[adim.panelIndex].dataUrl,
        duration: adim.duration,
      }));
      expect(segmentsDuration(segmentler)).toBeCloseTo(beklenen, 6);

      const jobId = 'agir6';
      const tYaz = performance.now();
      segmentler.forEach((seg, index) => pushFrame({ jobId, index, dataUrl: seg.dataUrl, duration: seg.duration }));
      const diskSegments = takeFrames(jobId)!;
      const yazmaMs = performance.now() - tYaz;
      expect(diskSegments).toHaveLength(plan.length);

      const beklenenKare = frameCounts(segmentler, FPS).reduce((a, b) => a + b, 0);
      const cikti = path.join(tmpDir, 'animatik.mp4');
      const asamalar: string[] = [];

      const t0 = performance.now();
      const oncekiHeap = process.memoryUsage().heapUsed;
      await renderVideo(
        {
          jobId,
          fps: FPS,
          width: GENISLIK,
          height: YUKSEKLIK,
          format: 'mp4',
          diskSegments,
          outputPath: cikti,
          expectedDuration: beklenen,
        },
        (p) => asamalar.push(p.phase),
      );
      const kodlamaMs = performance.now() - t0;
      const heapDelta = process.memoryUsage().heapUsed - oncekiHeap;
      discardFrames(jobId);

      expect(asamalar).toContain('hazirlik');
      expect(asamalar).toContain('tamamlandi');
      expect(fs.existsSync(cikti)).toBe(true);
      const boyut = fs.statSync(cikti).size;
      expect(boyut).toBeGreaterThan(0);

      /* --- ffprobe: akış gerçekten var mı, ne içeriyor --- */
      const { stdout } = await execFileAsync(FFPROBE, [
        '-v', 'error', '-show_streams', '-show_format', '-of', 'json', cikti,
      ]);
      const bilgi = JSON.parse(stdout as string) as {
        streams: { codec_type: string; codec_name: string; width: number; height: number; nb_frames?: string }[];
        format: { duration: string; format_name: string };
      };
      const video = bilgi.streams.find((s) => s.codec_type === 'video')!;
      expect(video.codec_name).toBe('h264');
      expect(video.width).toBe(GENISLIK);
      expect(video.height).toBe(YUKSEKLIK);
      expect(Number(video.nb_frames)).toBe(beklenenKare);

      const gercekSure = Number(bilgi.format.duration);
      expect(Math.abs(gercekSure - beklenen)).toBeLessThanOrEqual(1 / FPS);

      /* --- gerçekten çözülebiliyor mu --- */
      await expect(
        execFileAsync(FFMPEG, ['-v', 'error', '-i', cikti, '-f', 'null', '-']),
      ).resolves.toBeTruthy();

      /* --- kareler karışmış mı: tutma ortalarından piksel oku --- */
      const zaman = buildTimeline(proje.panels);
      const ornekler = [0, 7, 19, 20, 33, 49];
      for (const i of ornekler) {
        const seg = zaman[i];
        const t = seg.start + seg.hold / 2;
        const { stdout: ham } = (await execFileAsync(
          FFMPEG,
          [
            '-v', 'error', '-ss', t.toFixed(3), '-i', cikti,
            '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
          ],
          { encoding: 'buffer', maxBuffer: 1 << 20 },
        )) as unknown as { stdout: Buffer };
        expect(ham.length).toBe(3);
        expect(renktenIndeks([ham[0], ham[1], ham[2]])).toBe(i);
      }

      fs.mkdirSync(ciktiDir, { recursive: true });
      fs.copyFileSync(cikti, path.join(ciktiDir, 'animatik.mp4'));

      olcumler.video = {
        planAdimi: plan.length,
        ciktiKare: beklenenKare,
        beklenenSureSn: Number(beklenen.toFixed(3)),
        olculenSureSn: gercekSure,
        sapmaSn: Number(Math.abs(gercekSure - beklenen).toFixed(4)),
        kareYazmaMs: Number(yazmaMs.toFixed(1)),
        kodlamaMs: Number(kodlamaMs.toFixed(1)),
        dosyaBayt: boyut,
        dosyaMb: Number((boyut / 1024 / 1024).toFixed(3)),
        heapDeltaMb: Number((heapDelta / 1024 / 1024).toFixed(2)),
        codec: video.codec_name,
        cozuldu: true,
      };
      console.log('[AĞIR6] video:', olcumler.video);
    },
    600000,
  );
});
