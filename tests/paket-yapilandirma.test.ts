import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SBP_EXTENSION } from '@storyboard/core/model/project-io';

/**
 * PAKET YAPILANDIRMASI — dosya ikonu ve ilişkilendirme.
 *
 * Kullanıcı hatası (2026-08-27): "kaydedilen dosyalarda ikon sorunu var,
 * bizim dosya ikonu gözükmüyor." ÜÇ ayrı kök neden vardı ve üçü de
 * sessizdi — hiçbir hata mesajı çıkmıyordu:
 *
 * 1. `fileAssociations` `.mzn` diyordu, program `.sbp` kaydediyor. Uzantı
 *    hiç eşleşmediği için ilişkilendirme boşa gidiyordu.
 * 2. İkon PNG'ydi; Windows dosya türü ikonu için ICO gerekiyor.
 * 3. Yalnız `portable` hedefi vardı ve portable exe Windows'a HİÇBİR
 *    kayıt yazmaz — ilişkilendirme ancak kurulumla (NSIS) oluşur.
 *
 * Bu testler üçünün de geri gelmesini engelliyor.
 */

const KOK = path.join(__dirname, '..');
const yapilandirma = JSON.parse(
  fs.readFileSync(path.join(KOK, 'apps/desktop/electron-builder.json'), 'utf8'),
) as {
  win: { target: string[]; icon: string };
  fileAssociations: { ext: string; icon: string }[];
  nsis?: Record<string, unknown>;
};

describe('dosya ilişkilendirmesi', () => {
  it('uzantı programın GERÇEKTEN kaydettiği uzantı', () => {
    /* Kaynak `SBP_EXTENSION` — elle yazılmış bir dizge değil. İkisi
       ayrışırsa test kırılır; ayrışma sessizce ikonsuz dosya demekti. */
    const beklenen = SBP_EXTENSION.replace(/^\./, '');
    expect(yapilandirma.fileAssociations.map((f) => f.ext)).toContain(beklenen);
  });

  it('dosya ikonu ICO — Windows PNG kabul etmiyor', () => {
    for (const f of yapilandirma.fileAssociations) {
      expect(f.icon.endsWith('.ico'), `${f.ext} ikonu ICO olmalı`).toBe(true);
      expect(fs.existsSync(path.join(KOK, 'apps/desktop', f.icon))).toBe(true);
    }
  });

  it('uygulama ikonu da ICO ve dosyada var', () => {
    expect(yapilandirma.win.icon.endsWith('.ico')).toBe(true);
    expect(fs.existsSync(path.join(KOK, 'apps/desktop', yapilandirma.win.icon))).toBe(true);
  });

  it('taşınabilir hedef var ve ikon kaynağı pakete giriyor', () => {
    /* NSIS bu makinede ÜRETİLEMİYOR: `makensis.exe` imzasız ve Smart App
       Control onu başlatmayı reddediyor (`spawn UNKNOWN`, ölçüldü). Bu
       yüzden ilişkilendirmeyi uygulama kendisi yazıyor
       (electron/dosya-iliskilendirme.ts) ve dosya simgesi pakete
       `extraResources` ile giriyor — girmezse ilişkilendirme simgeyi
       bulamaz ve sessizce boş kare gösterirdi. */
    expect(yapilandirma.win.target).toContain('portable');
    const kaynaklar = (yapilandirma as unknown as {
      extraResources?: { from: string; to: string }[];
    }).extraResources ?? [];
    expect(kaynaklar.some((k) => k.to === 'dosya.ico')).toBe(true);
  });
});

describe('ICO dosyaları geçerli', () => {
  const icoOku = (ad: string) => fs.readFileSync(path.join(KOK, 'apps/desktop/build', ad));

  it.each(['icon.ico', 'dosya.ico'])('%s doğru başlık ve çoklu boy taşıyor', (ad) => {
    const b = icoOku(ad);
    /* ICO başlığı: 0x0000 ayrılmış, 0x0001 tür=ikon. */
    expect(b.readUInt16LE(0)).toBe(0);
    expect(b.readUInt16LE(2)).toBe(1);
    const adet = b.readUInt16LE(4);
    /* Explorer küçük boyları küçük ikon yerlerinde kullanıyor; tek boy
       verilirse 16 px'te bulanık görünür. */
    expect(adet).toBeGreaterThanOrEqual(5);

    /* Her dizin girdisinin gövdesi dosyanın İÇİNDE olmalı — ofset/uzunluk
       hesabı bozulursa Windows ikonu sessizce çizmez. */
    for (let i = 0; i < adet; i++) {
      const g = 6 + i * 16;
      const uzunluk = b.readUInt32LE(g + 8);
      const ofset = b.readUInt32LE(g + 12);
      expect(uzunluk).toBeGreaterThan(0);
      expect(ofset + uzunluk).toBeLessThanOrEqual(b.length);
      /* Gövde PNG imzasıyla başlamalı (Vista+ gömülü PNG). */
      expect(b.subarray(ofset, ofset + 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });
});

/* ------------------------------------------------------------------ */

import { kayitlar } from '../apps/desktop/electron/dosya-iliskilendirme';

/**
 * TAŞINABİLİR sürümde ilişkilendirme uygulamanın kendi işi: NSIS bu
 * makinede üretilemiyor (makensis imzasız → Smart App Control engelliyor)
 * ve portable exe Windows'a hiçbir kayıt yazmıyor.
 */
describe('taşınabilir ilişkilendirme — HKCU kayıtları', () => {
  const k = kayitlar('C:\\A\\Auteur.exe', 'C:\\A\\dosya.ico');
  const yollar = k.map(([y]) => y);

  it('YALNIZ HKCU — yönetici yetkisi istemiyor', () => {
    /* HKLM yazmak yükseltme isterdi; taşınabilir bir program kullanıcıdan
       yönetici hakkı istememeli. */
    for (const y of yollar) expect(y.startsWith('HKCU\\Software\\Classes')).toBe(true);
  });

  it('programın GERÇEK uzantısını bağlıyor', () => {
    const beklenen = SBP_EXTENSION;
    expect(yollar.some((y) => y.endsWith(beklenen))).toBe(true);
  });

  it('komut %1 taşıyor — çift tıklanan dosya programa geçiyor', () => {
    const komut = k.find(([y]) => y.includes('shell\\open\\command'))![2];
    expect(komut).toContain('"%1"');
    expect(komut).toContain('Auteur.exe');
  });

  it('ikon DOSYA ikonu — exe içindeki uygulama ikonu DEĞİL', () => {
    /* `exe,0` yazılsaydı dosyalar uygulama simgesiyle görünürdü; belge
       simgesi ayrı bir çizim ve kullanıcı ikisini karıştırmamalı. */
    const ikon = k.find(([y]) => y.includes('DefaultIcon'))![2];
    expect(ikon.endsWith('dosya.ico')).toBe(true);
    expect(ikon).not.toContain('.exe');
  });
});
