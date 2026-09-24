import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  MAX_FRAME_BYTES,
  discardAllFrames,
  discardFrames,
  pushFrame,
  takeFrames,
} from '../apps/desktop/electron/frameStore';

afterEach(() => discardAllFrames());

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 1×1 PNG dataURL. */
function tinyPng(): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

describe('Kare akış deposu', () => {
  it('kareleri diske yazar ve sırasını korur', () => {
    const png = tinyPng();
    pushFrame({ jobId: 'job_a', index: 0, dataUrl: png, duration: 1 });
    pushFrame({ jobId: 'job_a', index: 1, dataUrl: png, duration: 0.5 });

    const frames = takeFrames('job_a')!;
    expect(frames).toHaveLength(2);
    expect(frames[0].duration).toBe(1);
    expect(frames[1].duration).toBe(0.5);
    for (const f of frames) expect(fs.existsSync(f.file)).toBe(true);
  });

  it('sıra dışı gelen kareler doğru yere oturur', () => {
    const png = tinyPng();
    pushFrame({ jobId: 'job_b', index: 1, dataUrl: png, duration: 2 });
    pushFrame({ jobId: 'job_b', index: 0, dataUrl: png, duration: 1 });
    const frames = takeFrames('job_b')!;
    expect(frames.map((f) => f.duration)).toEqual([1, 2]);
  });

  it('eksik kareyi sessizce atlamaz', () => {
    const png = tinyPng();
    pushFrame({ jobId: 'job_c', index: 0, dataUrl: png, duration: 1 });
    pushFrame({ jobId: 'job_c', index: 2, dataUrl: png, duration: 1 });
    expect(() => takeFrames('job_c')).toThrow(/Kare 1 eksik/);
  });

  it('geçersiz girdiyi reddeder', () => {
    const png = tinyPng();
    expect(() => pushFrame({ jobId: '../kotu', index: 0, dataUrl: png, duration: 1 })).toThrow();
    expect(() => pushFrame({ jobId: 'job_d', index: -1, dataUrl: png, duration: 1 })).toThrow();
    expect(() => pushFrame({ jobId: 'job_d', index: 1.5, dataUrl: png, duration: 1 })).toThrow();
    expect(() => pushFrame({ jobId: 'job_d', index: 0, dataUrl: 'javascript:1', duration: 1 })).toThrow();
    expect(() => pushFrame({ jobId: 'job_d', index: 0, dataUrl: png, duration: -1 })).toThrow();
    // base64 çözüldüğünde 3/4 boyuta iner; sınırı aşmak için dize daha uzun olmalı.
    const tooLong = Math.ceil((MAX_FRAME_BYTES * 4) / 3) + 8;
    expect(() =>
      pushFrame({
        jobId: 'job_d',
        index: 0,
        dataUrl: 'data:image/png;base64,' + 'A'.repeat(tooLong),
        duration: 1,
      }),
    ).toThrow(/çok büyük/);
  });

  it('iş bitince geçici klasörü siler', () => {
    pushFrame({ jobId: 'job_e', index: 0, dataUrl: tinyPng(), duration: 1 });
    const dir = takeFrames('job_e')![0].file;
    expect(fs.existsSync(dir)).toBe(true);
    discardFrames('job_e');
    expect(fs.existsSync(dir)).toBe(false);
    expect(takeFrames('job_e')).toBeNull();
  });
});
