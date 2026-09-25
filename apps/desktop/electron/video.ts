import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { ffmpegPath } from './paths';
import { at } from './metin';

/**
 * ffmpeg ikili yolu dışarıdan verilebilir; Electron dışında (testlerde)
 * `ffmpeg-static` yolu doğrudan geçirilir, uygulamada asar dışına çıkarılmış
 * gömülü ikili kullanılır.
 */
let ffmpegOverride: string | null = null;

export function setFfmpegPath(path: string | null): void {
  ffmpegOverride = path;
}

function resolveFfmpeg(): string | null {
  return ffmpegOverride ?? ffmpegPath();
}

export interface VideoSegment {
  dataUrl: string;
  duration: number;
}

/** Diske önceden yazılmış benzersiz kare. */
export interface DiskSegment {
  /** PNG dosyasının tam yolu */
  file: string;
  duration: number;
}

export interface VideoJob {
  jobId: string;
  fps: number;
  width: number;
  height: number;
  format: 'mp4' | 'webm';
  /** Bellekten geçen kareler (küçük işler / testler) */
  segments?: VideoSegment[];
  /**
   * Renderer tarafından üretildikçe diske akıtılmış kareler. Büyük işlerde
   * tercih edilir: ne renderer ne de ana süreç tüm kare setini bellekte tutar.
   */
  diskSegments?: DiskSegment[];
  audioPath?: string | null;
  outputPath: string;
  expectedDuration: number;
}

export interface ProgressEvent {
  jobId: string;
  phase: 'hazirlik' | 'kodlama' | 'tamamlandi' | 'iptal' | 'hata';
  percent: number;
  message: string;
}

const running = new Map<string, { command: ffmpeg.FfmpegCommand | null; cancelled: boolean; dir: string }>();

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/**
 * Kare listesini ffmpeg'in okuyacağı numaralı bir PNG dizisine açar.
 *
 * `concat` demuxer, listedeki SON girişin `duration` yönergesini güvenilir
 * biçimde uygulamaz (sürüme göre son kareyi bir önceki sürede tutar), bu da
 * animatiğin sonuna saniyeler ekleyebilir. Bunun yerine her çıktı karesi
 * açıkça üretilir: toplam süre = kare sayısı / FPS, yani kare hassasiyetinde
 * kesindir. Tekrar eden kareler diskte kopyalanmaz — sabit bağ (hard link)
 * kullanılır, mümkün değilse kopyalanır.
 */
export function frameCounts(segments: { duration: number }[], fps: number): number[] {
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  const target = Math.max(1, Math.round(total * fps));
  const counts = segments.map((s) => Math.max(1, Math.round(s.duration * fps)));

  // Segment başına yuvarlama farkını en uzun segmentlerde telafi et; böylece
  // toplam kare sayısı zaman çizelgesinin karşılığıyla birebir eşleşir.
  let diff = target - counts.reduce((a, b) => a + b, 0);
  let guard = counts.length * 4 + Math.abs(diff) + 8;
  while (diff !== 0 && guard-- > 0) {
    const step = Math.sign(diff);
    let best = -1;
    for (let i = 0; i < counts.length; i++) {
      if (step < 0 && counts[i] <= 1) continue;
      if (best === -1 || counts[i] > counts[best]) best = i;
    }
    if (best === -1) break;
    counts[best] += step;
    diff -= step;
  }
  return counts;
}

interface FrameSequence {
  pattern: string;
  count: number;
}

/**
 * Benzersiz kare dosyalarını, her segmentin süresi kadar tekrarlayan numaralı
 * bir diziye açar. Tekrar eden kareler kopyalanmaz — sabit bağ kullanılır.
 */
function buildSequence(dir: string, sources: string[], counts: number[]): FrameSequence {
  const seqDir = path.join(dir, 'seq');
  fs.mkdirSync(seqDir, { recursive: true });

  let frame = 0;
  sources.forEach((source, i) => {
    for (let k = 0; k < counts[i]; k++) {
      const dest = path.join(seqDir, `f${String(frame).padStart(6, '0')}.png`);
      try {
        fs.linkSync(source, dest);
      } catch {
        fs.copyFileSync(source, dest);
      }
      frame++;
    }
  });

  return { pattern: path.join(seqDir, 'f%06d.png'), count: frame };
}

/** dataURL kareleri önce diske yazılır, sonra diziye açılır. */
function writeFrameSequence(dir: string, segments: VideoSegment[], fps: number): FrameSequence {
  const uniqueDir = path.join(dir, 'img');
  fs.mkdirSync(uniqueDir, { recursive: true });

  const sources = segments.map((seg, i) => {
    const source = path.join(uniqueDir, `u${String(i).padStart(6, '0')}.png`);
    fs.writeFileSync(source, dataUrlToBuffer(seg.dataUrl));
    return source;
  });

  return buildSequence(dir, sources, frameCounts(segments, fps));
}

/** Zaten diskte olan kareler yalnızca diziye açılır — yeniden yazılmaz. */
function linkFrameSequence(dir: string, segments: DiskSegment[], fps: number): FrameSequence {
  for (const seg of segments) {
    if (!fs.existsSync(seg.file)) {
      throw new Error(at('Kare dosyası bulunamadı — dışa aktarma yarıda kalmış olabilir.'));
    }
  }
  return buildSequence(dir, segments.map((s) => s.file), frameCounts(segments, fps));
}

export function cancelVideo(jobId: string): void {
  const job = running.get(jobId);
  if (!job) return;
  job.cancelled = true;
  try {
    job.command?.kill('SIGKILL');
  } catch {
    /* zaten bitmiş olabilir */
  }
}

export async function renderVideo(
  job: VideoJob,
  onProgress: (p: ProgressEvent) => void,
): Promise<string> {
  const bin = resolveFfmpeg();
  if (!bin) throw new Error(at('Gömülü ffmpeg bulunamadı.'));
  ffmpeg.setFfmpegPath(bin);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbstudio-'));
  running.set(job.jobId, { command: null, cancelled: false, dir });

  try {
    onProgress({ jobId: job.jobId, phase: 'hazirlik', percent: 5, message: at('Kareler hazırlanıyor…') });
    const sequence = job.diskSegments?.length
      ? linkFrameSequence(dir, job.diskSegments, job.fps)
      : writeFrameSequence(dir, job.segments ?? [], job.fps);
    if (sequence.count === 0) throw new Error(at('Dışa aktarılacak kare yok.'));
    if (running.get(job.jobId)?.cancelled) throw new Error('İptal edildi');

    const total = sequence.count / job.fps;

    /* Geçici ad UZANTIYI KORUR: ffmpeg çıktı biçimini uzantıdan seçiyor,
       `.mp4.tmp-123` bozuk bir muxer seçimine yol açardı. */
    const ciktiUzanti = path.extname(job.outputPath);
    const geciciCikti = path.join(
      path.dirname(job.outputPath),
      `.${path.basename(job.outputPath, ciktiUzanti)}.tmp-${process.pid}${ciktiUzanti}`,
    );
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg()
        .input(sequence.pattern)
        .inputOptions([`-framerate ${job.fps}`, '-start_number 0'])
        .outputOptions([
          `-r ${job.fps}`,
          '-fps_mode cfr',
          `-vf scale=${job.width}:${job.height}:flags=lanczos`,
          '-pix_fmt yuv420p',
        ]);

      if (job.audioPath && fs.existsSync(job.audioPath)) {
        // Ses videodan kısaysa sessizlikle doldurulur, uzunsa kırpılır; her iki
        // durumda da çıktı süresi zaman çizelgesiyle aynı kalır.
        command = command
          .input(job.audioPath)
          .outputOptions(['-af apad', `-t ${total.toFixed(6)}`, `-c:a ${job.format === 'webm' ? 'libopus' : 'aac'}`, '-b:a 192k']);
      }

      command =
        job.format === 'webm'
          ? command.outputOptions(['-c:v libvpx-vp9', '-b:v 0', '-crf 32', '-row-mt 1'])
          : command.outputOptions(['-c:v libx264', '-preset medium', '-crf 20', '-movflags +faststart']);

      running.set(job.jobId, { ...running.get(job.jobId)!, command });

      command
        .on('progress', (p: { timemark?: string; percent?: number }) => {
          const seconds = parseTimemark(p.timemark);
          const raw = total > 0 ? Math.min(99, (seconds / total) * 100) : (p.percent ?? 0);
          const percent = Number.isFinite(raw) ? raw : 0;
          onProgress({
            jobId: job.jobId,
            phase: 'kodlama',
            percent: Math.max(5, percent),
            message: at('Kodlanıyor… %s%', percent.toFixed(0)),
          });
        })
        .on('error', (err: Error) => {
          // Hata da olsa yarım dosya diskte kalmaz; hedef hiç dokunulmadı.
          fs.rmSync(geciciCikti, { force: true });
          if (running.get(job.jobId)?.cancelled) resolve();
          else reject(err);
        })
        .on('end', () => resolve())
        /* Geçici ada yazılır, başarıyla bitince taşınır (aşağıda). ffmpeg'i
           doğrudan hedefe yazdırmak yerinde yazmadır: kullanıcı teslim ettiği
           dosyanın üstüne yeni bir render alırken iptal ederse ya da uygulama
           çökerse hem eskisi hem yenisi giderdi (§15.2). */
        .save(geciciCikti);
    });

    if (running.get(job.jobId)?.cancelled) {
      // Yarım dosya hedefe HİÇ ulaşmaz; geçici dosya temizlenir.
      fs.rmSync(geciciCikti, { force: true });
      onProgress({ jobId: job.jobId, phase: 'iptal', percent: 0, message: at('İptal edildi.') });
      throw new Error('İptal edildi');
    }

    // Tamamlanan render tek adımda yerine geçer.
    fs.renameSync(geciciCikti, job.outputPath);

    onProgress({
      jobId: job.jobId,
      phase: 'tamamlandi',
      percent: 100,
      message: at('Tamamlandı — hedef süre %s sn', job.expectedDuration.toFixed(2)),
    });
    return job.outputPath;
  } finally {
    running.delete(job.jobId);
    // Windows'ta ffmpeg dosya tanıtıcılarını hemen bırakmayabilir; buradaki
    // EBUSY asıl hatayı maskelememeli.
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* geçici klasör kalabilir — işletim sistemi temizler */
    }
  }
}

function parseTimemark(mark?: string): number {
  if (!mark) return 0;
  // ffmpeg 'N/A' ya da eksik alan gönderebilir; NaN ilerleme çubuğunu bozar.
  const [h, m, s] = mark.split(':');
  const seconds = Number(h) * 3600 + Number(m) * 60 + parseFloat(s ?? '0');
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
}
