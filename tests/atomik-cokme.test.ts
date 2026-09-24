import { afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GECICI_ONEK, geciciDosyalariTemizle, writeFileAtomic } from '../apps/desktop/electron/atomik';

const BURASI = path.dirname(fileURLToPath(import.meta.url));
const YAZAR = path.join(BURASI, 'yardim', 'atomik-yazar.mts');

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-cokme-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Yazarı başlatır, `ms` sonra ÖLDÜRÜR ve hedef dosyanın son hâlini döndürür.
 *
 * Öldürme `SIGKILL`: yakalanamaz, `finally` çalışmaz, temizlik yapılmaz.
 * `SIGTERM` olsaydı Node çıkış kancalarını çalıştırır ve test gerçek bir
 * çökmeyi değil düzgün bir kapanışı sınardı.
 */
async function yazVeOldur(
  hedef: string,
  boyut: number,
  ms: number,
): Promise<{ icerik: Buffer | null; tur: number }> {
  const cocuk = spawn(process.execPath, [YAZAR, hedef, String(boyut)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let hazir = false;
  let tur = 0;
  cocuk.stdout.on('data', (d) => {
    hazir = true;
    tur += String(d).split('t\n').length - 1;
  });
  let hata = '';
  cocuk.stderr.on('data', (d) => { hata += String(d); });

  const bitti = new Promise<void>((r) => cocuk.on('exit', () => r()));
  for (let i = 0; i < 200 && !hazir; i++) await uyu(10);
  if (!hazir) {
    cocuk.kill('SIGKILL');
    await bitti;
    throw new Error(`Yazar baslamadi: ${hata}`);
  }

  await uyu(ms);
  cocuk.kill('SIGKILL');
  await bitti;

  return { icerik: fs.existsSync(hedef) ? fs.readFileSync(hedef) : null, tur };
}

/** İçerik ya bütünüyle 'A' ya bütünüyle 'B' — asla karışık, asla eksik. */
function butunMu(icerik: Buffer, boyut: number): { tamam: boolean; neden: string } {
  if (icerik.length !== boyut) return { tamam: false, neden: `uzunluk ${icerik.length} != ${boyut}` };
  const ilk = icerik[0];
  if (ilk !== 0x41 && ilk !== 0x42) return { tamam: false, neden: `ilk bayt 0x${ilk.toString(16)}` };
  for (let i = 1; i < icerik.length; i++) {
    if (icerik[i] !== ilk) return { tamam: false, neden: `bayt ${i} ayrisiyor` };
  }
  return { tamam: true, neden: '' };
}

describe('§15.5 — yazma sırasında çökme dosyayı BOZMUYOR', () => {
  /* ÖN KOŞUL: yazar gerçekten defalarca yazıyor olmalı. Yazmıyorsa aşağıdaki
     "dosya bozulmadı" iddiaları hiçbir şey ispatlamaz — bu, F1b-1'de öğrenilen
     dersin (bkz. ders #1) aynısı. */
  it('ÖN KOŞUL: alt süreç öldürülene kadar hedefi tekrar tekrar yazıyor', async () => {
    const hedef = path.join(kok, 'onkosul.bin');
    const { icerik, tur } = await yazVeOldur(hedef, 256 * 1024, 120);
    expect(icerik).not.toBeNull();
    // Tur sayısı doğrudan ölçülür. Önceki sürüm "geçici dosya artığı kaldı mı"
    // diye bakıyordu; o iddia öldürmenin tam `writeFileSync` içine denk
    // gelmesine bağlıydı ve tam süit yükü altında düşüyordu.
    expect(tur).toBeGreaterThan(3);
  }, 60_000);

  it('on iki ayrı öldürmede dosya ya eski ya yeni — asla yarım', async () => {
    const boyut = 512 * 1024;
    for (let tur = 0; tur < 12; tur++) {
      const hedef = path.join(kok, `hedef-${tur}.bin`);
      // Öldürme anı taranır: yazımın her evresine denk gelsin.
      const { icerik } = await yazVeOldur(hedef, boyut, 25 + tur * 9);
      if (icerik === null) continue; // ilk `rename` daha olmadı — geçerli hâl
      const { tamam, neden } = butunMu(icerik, boyut);
      expect(tamam, `tur=${tur}: ${neden}`).toBe(true);
    }
  }, 180_000);
});

describe('geçici dosya artıkları', () => {
  it('çökmeden kalan yan dosyalar açılışta temizlenir', () => {
    const dizin = fs.mkdtempSync(path.join(kok, 'artik-'));
    fs.writeFileSync(path.join(dizin, `${GECICI_ONEK}a.bin.1.2`), 'x');
    fs.writeFileSync(path.join(dizin, `${GECICI_ONEK}b.bin.3.4`), 'y');
    fs.writeFileSync(path.join(dizin, 'proje.json'), 'korunmali');

    expect(geciciDosyalariTemizle(dizin)).toBe(2);
    expect(fs.readdirSync(dizin)).toEqual(['proje.json']);
  });

  it('olmayan dizinde çökmez', () => {
    expect(geciciDosyalariTemizle(path.join(kok, 'yok-boyle-bir-yer'))).toBe(0);
  });

  it('başarılı yazım yan dosya bırakmaz', () => {
    const dizin = fs.mkdtempSync(path.join(kok, 'temiz-'));
    writeFileAtomic(path.join(dizin, 'x.bin'), Buffer.from('merhaba'));
    expect(fs.readdirSync(dizin)).toEqual(['x.bin']);
  });
});
