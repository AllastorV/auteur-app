import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { yazarlikDeposu } from '../apps/desktop/electron/yazarlik-deposu';
import { GUN_MS } from '@storyboard/core/veri/kontrol-noktalari';
import type { YazarlikKaydi } from '@storyboard/core/veri/yazarlik';

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-yazarlik-depo-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

let sayac = 0;
const depo = () => yazarlikDeposu(kok, `proje-${sayac++}`);
const kayit = (zaman: number, yazar: string, ...bloklar: string[]): YazarlikKaydi => ({
  zaman, yazar, bloklar,
});

describe('yazarlik günlüğü dosyası', () => {
  it('ilk yazımda başlıkla kurulur ve eklenerek büyür', () => {
    const d = depo();
    d.ekle([kayit(1000, 'Ayşe', 'sb_1')]);
    d.ekle([kayit(2000, 'Deniz', 'sb_2', 'sb_3')]);

    expect(d.oku()).toEqual([
      kayit(1000, 'Ayşe', 'sb_1'),
      kayit(2000, 'Deniz', 'sb_2', 'sb_3'),
    ]);
  });

  it('hiç günlük yoksa oku boş dizi döner', () => {
    expect(depo().oku()).toEqual([]);
  });

  it('boş kayıt listesiyle ekle çağrısı dosya YARATMAZ', () => {
    const d = depo();
    d.ekle([]);
    expect(fs.existsSync(d.dizin)).toBe(false);
  });

  it('birden çok kayıt TEK ekle çağrısında da doğru sırayla yazılır', () => {
    const d = depo();
    d.ekle([kayit(1000, 'Ayşe', 'sb_1'), kayit(1500, 'Ayşe', 'sb_2')]);
    expect(d.oku()).toEqual([kayit(1000, 'Ayşe', 'sb_1'), kayit(1500, 'Ayşe', 'sb_2')]);
  });

  it('üzerine yazma YOK — art arda ekle çağrıları önceki kayıtları korur', () => {
    const d = depo();
    for (let i = 0; i < 5; i++) d.ekle([kayit(i * 100, 'Ayşe', `sb_${i}`)]);
    expect(d.oku()).toHaveLength(5);
  });
});

describe('budama — 30 günden eski kayıtları atar', () => {
  it('genç kayıtlar duruyor, eski kayıtlar gidiyor', () => {
    const d = depo();
    const simdi = 100 * GUN_MS;
    d.ekle([
      kayit(simdi - 45 * GUN_MS, 'Ayşe', 'sb_eski'),
      kayit(simdi - 5 * GUN_MS, 'Ayşe', 'sb_genc'),
      kayit(simdi - 1000, 'Ayşe', 'sb_taze'),
    ]);
    d.buda(simdi);
    const kalan = d.oku();
    expect(kalan.map((k) => k.bloklar[0])).toEqual(['sb_genc', 'sb_taze']);
  });

  it('silinecek yoksa dosya bozulmadan (aynı içerikle) kalır', () => {
    const d = depo();
    const simdi = Date.now();
    d.ekle([kayit(simdi, 'Ayşe', 'sb_1')]);
    d.buda(simdi);
    expect(d.oku()).toEqual([kayit(simdi, 'Ayşe', 'sb_1')]);
  });

  it('hiç günlük yokken budama sessizce hiçbir şey yapmaz', () => {
    expect(() => depo().buda(Date.now())).not.toThrow();
  });

  it('hepsi eskiyse günlük boşalır ama dosya bozulmaz', () => {
    const d = depo();
    const simdi = 100 * GUN_MS;
    d.ekle([kayit(simdi - 60 * GUN_MS, 'Ayşe', 'sb_1')]);
    d.buda(simdi);
    expect(d.oku()).toEqual([]);
    // Budanmış dosya hâlâ okunabilir olmalı — sonraki bir ekle çağrısı için.
    d.ekle([kayit(simdi, 'Deniz', 'sb_2')]);
    expect(d.oku()).toEqual([kayit(simdi, 'Deniz', 'sb_2')]);
  });
});

describe('projeId YOL SINIRI — gunluk-deposu.ts ile AYNI denetim', () => {
  it('`..` içeren kimlik reddediliyor', () => {
    expect(() => yazarlikDeposu(kok, '../../kacis')).toThrow(/proje kimligi/i);
    expect(() => yazarlikDeposu(kok, '..')).toThrow(/proje kimligi/i);
  });

  it('yol ayracı içeren kimlik reddediliyor', () => {
    expect(() => yazarlikDeposu(kok, 'a/b')).toThrow(/proje kimligi/i);
    expect(() => yazarlikDeposu(kok, String.raw`a\b`)).toThrow(/proje kimligi/i);
  });

  it('nokta ve boş kimlik reddediliyor', () => {
    expect(() => yazarlikDeposu(kok, '.')).toThrow(/proje kimligi/i);
    expect(() => yazarlikDeposu(kok, '')).toThrow(/proje kimligi/i);
  });

  it('DİZİN kökün altında kalıyor', () => {
    const d = yazarlikDeposu(kok, 'prj_abc123');
    expect(path.dirname(path.resolve(d.dizin))).toBe(path.resolve(kok));
  });
});
