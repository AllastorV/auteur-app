import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DiskSegment } from './video';

/**
 * Dışa aktarma karelerinin ana süreçteki geçici deposu.
 *
 * Kareler renderer'da üretildikçe tek tek gelir ve doğrudan diske yazılır;
 * böylece ne tek bir dev IPC mesajı oluşur ne de iki taraf tüm kare setini
 * bellekte tutar. Depo yalnızca dosya yollarını ve süreleri hatırlar.
 */

/** Tek bir dışa aktarma işi için üst sınırlar — disk tükenmesine karşı. */
export const MAX_FRAMES_PER_JOB = 20_000;
export const MAX_BYTES_PER_JOB = 8 * 1024 * 1024 * 1024;
export const MAX_FRAME_BYTES = 64 * 1024 * 1024;

interface Job {
  dir: string;
  segments: DiskSegment[];
  bytes: number;
}

const jobs = new Map<string, Job>();

/** İş kimliği ana sürecin dosya adı ürettiği yerdir — yol parçası içeremez. */
function assertSafeJobId(jobId: unknown): string {
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) {
    throw new Error('Geçersiz iş kimliği.');
  }
  return jobId;
}

function decodePngDataUrl(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Geçersiz kare verisi.');
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // Sınır çözmeden önce dize uzunluğundan kestirilir: aşırı büyük bir kare
  // için önce 64 MB'lık tampon ayırmak, reddedeceğimiz veriyi belleğe almak olur.
  if ((base64.length * 3) / 4 > MAX_FRAME_BYTES) throw new Error('Kare verisi çok büyük.');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('Boş kare verisi.');
  if (buffer.length > MAX_FRAME_BYTES) throw new Error('Kare verisi çok büyük.');
  return buffer;
}

/**
 * Bir kareyi diske yazar ve sırasını kaydeder.
 * Dosya adı yalnızca sıra numarasından üretilir — renderer'dan gelen bir dize
 * dosya yoluna girmez.
 */
export function pushFrame(payload: {
  jobId: unknown;
  index: unknown;
  dataUrl: unknown;
  duration: unknown;
}): { frames: number } {
  const jobId = assertSafeJobId(payload.jobId);
  const index = Number(payload.index);
  const duration = Number(payload.duration);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_FRAMES_PER_JOB) {
    throw new Error('Geçersiz kare sırası.');
  }
  if (!Number.isFinite(duration) || duration < 0) throw new Error('Geçersiz kare süresi.');

  const data = decodePngDataUrl(payload.dataUrl);

  let job = jobs.get(jobId);
  if (!job) {
    job = { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'sbframes-')), segments: [], bytes: 0 };
    jobs.set(jobId, job);
  }
  if (job.bytes + data.length > MAX_BYTES_PER_JOB) {
    discardFrames(jobId);
    throw new Error('Dışa aktarma için ayrılan disk sınırı aşıldı.');
  }

  const file = path.join(job.dir, `u${String(index).padStart(6, '0')}.png`);
  fs.writeFileSync(file, data);
  job.bytes += data.length;
  job.segments[index] = { file, duration };
  return { frames: job.segments.length };
}

/** İşin kareleri — sıra boşluğu varsa hata verir (eksik kare sessizce atlanmaz). */
export function takeFrames(jobId: string): DiskSegment[] | null {
  const job = jobs.get(assertSafeJobId(jobId));
  if (!job) return null;
  const missing = job.segments.findIndex((s) => !s);
  if (missing >= 0) throw new Error(`Kare ${missing} eksik — dışa aktarma tamamlanamadı.`);
  return job.segments;
}

/** Geçici kare klasörünü siler. */
export function discardFrames(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.delete(jobId);
  try {
    fs.rmSync(job.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* işletim sistemi geçici klasörü temizler */
  }
}

/** Açık kalmış tüm işleri temizler (uygulama kapanışı). */
export function discardAllFrames(): void {
  for (const jobId of [...jobs.keys()]) discardFrames(jobId);
}
