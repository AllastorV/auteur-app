import zlib from 'node:zlib';

/**
 * Test için tek renkli PNG üretir.
 *
 * Sahte bir dataURL yetmez: `pdf-lib` görüntüyü gerçekten çözümlüyor ve
 * hücreye sığdırma matematiği gerçek `width`/`height` değerlerine dayanıyor.
 * Farklı oranlarda görüntü üretebilmek testin asıl gereği.
 */
export function pngUret(gen: number, yuk: number): string {
  const ham = Buffer.alloc((gen * 4 + 1) * yuk);
  for (let y = 0; y < yuk; y++) {
    const satirBas = y * (gen * 4 + 1);
    ham[satirBas] = 0; // filtre: none
    for (let x = 0; x < gen; x++) {
      const p = satirBas + 1 + x * 4;
      ham[p] = 90; ham[p + 1] = 120; ham[p + 2] = 200; ham[p + 3] = 255;
    }
  }

  const parca = (tip: string, veri: Buffer) => {
    const uzunluk = Buffer.alloc(4);
    uzunluk.writeUInt32BE(veri.length, 0);
    const govde = Buffer.concat([Buffer.from(tip, 'ascii'), veri]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(govde) : crc32(govde), 0);
    return Buffer.concat([uzunluk, govde, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(gen, 0);
  ihdr.writeUInt32BE(yuk, 4);
  ihdr[8] = 8;   // bit derinliği
  ihdr[9] = 6;   // renk tipi: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', zlib.deflateSync(ham)),
    parca('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}

/** Node sürümü `zlib.crc32` sunmuyorsa elle. */
function crc32(veri: Buffer): number {
  let c = 0xffffffff;
  for (const bayt of veri) {
    c ^= bayt;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
