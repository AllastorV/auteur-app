import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eskiKokuTasi } from '../apps/desktop/electron/veri-tasima';

/**
 * Ürün adı "Storyboard Stüdyo" → "Auteur" geçişinde veri kökünün taşınması.
 *
 * Burada ölçülen şey rahatlık değil VERİ KAYBI: taşıma yanlış davranırsa
 * kullanıcının otomatik kayıtları ve §15 günlükleri ya görünmez olur ya da
 * üzerine yazılır. Testler gerçek klasörlerle çalışıyor — sahte bir `fs`
 * mock'u, `existsSync`/`renameSync` sırasının yanlış olduğunu göremezdi.
 */

const ESKI = 'Storyboard Stüdyo';

function gecici(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-tasima-'));
}

/** Kökün içine, taşındığını kanıtlayacak bir iz bırakır. */
function izBirak(kok: string, ad: string): void {
  fs.mkdirSync(path.join(kok, 'autosave'), { recursive: true });
  fs.writeFileSync(path.join(kok, 'autosave', 'proje.sbp'), ad);
}

describe('eski veri kökünün taşınması', () => {
  it('eski kök varken ve yeni kök yokken taşır, içerik korunur', () => {
    const ana = gecici();
    const eskiKok = path.join(ana, ESKI);
    const yeniKok = path.join(ana, 'Auteur');
    izBirak(eskiKok, 'eski-icerik');

    const sonuc = eskiKokuTasi(yeniKok, ESKI);

    expect(sonuc).toEqual({ tasindi: true, hata: null });
    expect(fs.existsSync(eskiKok)).toBe(false);
    expect(fs.readFileSync(path.join(yeniKok, 'autosave', 'proje.sbp'), 'utf8')).toBe(
      'eski-icerik',
    );
  });

  it('yeni kök zaten varsa TAŞIMAZ — mevcut veriyi ezmek en kötü sonuç', () => {
    const ana = gecici();
    const eskiKok = path.join(ana, ESKI);
    const yeniKok = path.join(ana, 'Auteur');
    izBirak(eskiKok, 'eski-icerik');
    izBirak(yeniKok, 'GUNCEL-icerik');

    const sonuc = eskiKokuTasi(yeniKok, ESKI);

    expect(sonuc.tasindi).toBe(false);
    expect(sonuc.hata).toBeNull();
    /* Güncel veri olduğu gibi duruyor ve eski kök de silinmemiş. */
    expect(fs.readFileSync(path.join(yeniKok, 'autosave', 'proje.sbp'), 'utf8')).toBe(
      'GUNCEL-icerik',
    );
    expect(fs.existsSync(eskiKok)).toBe(true);
  });

  it('eski kök yoksa hiçbir şey yapmaz ve hata üretmez', () => {
    const ana = gecici();
    const yeniKok = path.join(ana, 'Auteur');

    const sonuc = eskiKokuTasi(yeniKok, ESKI);

    expect(sonuc).toEqual({ tasindi: false, hata: null });
    expect(fs.existsSync(yeniKok)).toBe(false);
  });

  it('taşıma başarısız olursa sessiz geçmez: iki yolu da içeren bir hata döner', () => {
    const ana = gecici();
    const eskiKok = path.join(ana, ESKI);
    const yeniKok = path.join(ana, 'Auteur');
    izBirak(eskiKok, 'eski-icerik');

    const patlat = () => {
      throw new Error('EPERM: dosya kilitli');
    };
    const sonuc = eskiKokuTasi(yeniKok, ESKI, patlat);

    expect(sonuc.tasindi).toBe(false);
    expect(sonuc.hata).toContain(eskiKok);
    expect(sonuc.hata).toContain(yeniKok);
    expect(sonuc.hata).toContain('EPERM: dosya kilitli');
    /* Kullanıcıya bir şeyin silinMEdiği açıkça söyleniyor. */
    expect(sonuc.hata).toContain('silinmedi');
    /* Ve gerçekten silinmemiş. */
    expect(fs.readFileSync(path.join(eskiKok, 'autosave', 'proje.sbp'), 'utf8')).toBe(
      'eski-icerik',
    );
  });
});
