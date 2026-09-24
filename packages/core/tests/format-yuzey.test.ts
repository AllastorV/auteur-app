import { describe, expect, it } from 'vitest';
// DERİN YOL DEĞİL, BARREL. Diğer format testleri
// `@storyboard/core/format/<modul>` üzerinden import ettiği için
// `format/index.ts`'ten bir satır silinse hiçbiri kızarmıyordu — yüzeyin
// dörtte biri sessizce kaybolabiliyordu. Bu dosya yalnız barrel'ı tüketir.
import * as yuzey from '@storyboard/core/format';

// SINIR — bu test tip dışa aktarımlarını KORUMAZ. `type` dışa aktarımları
// çalışma zamanında gözlemlenemez ve Karar 8 gereği test dosyaları
// `tsc -b` kapsamında değildir; yani `format/index.ts`'ten bir `type`
// satırı silinse burası yeşil kalır. Karar 8'in tsconfig işi yapılana
// kadar açık kalan bilinen boşluk.

describe('format barrel — değer dışa aktarımları', () => {
  const fonksiyonlar = [
    'kagitGeometrisi', 'profilOlustur', 'sutunGenisligi',
    'sahneBasligiAyristir', 'sahneBasligiBicimle', 'buyut',
    'sarmala', 'sayfala',
    'girintiSutun', 'sayfaDegiskenleri', 'blokKurallari', 'sayfaSinirlari',
    'metinSayaclari', 'sayaclar', 'presetUygula', 'profileUygula',
  ] as const;

  it.each(fonksiyonlar)('%s barrel\'dan fonksiyon olarak çıkar', (ad) => {
    expect(typeof (yuzey as Record<string, unknown>)[ad]).toBe('function');
  });

  // Sabitler için `toBeDefined()` yetmez: yanlış modülden gelen bir nesne de
  // tanımlıdır. İçerikten ucuz bir alan da çivilenir.
  it('IZGARA barrel\'dan gerçek ızgara değerleriyle çıkar', () => {
    expect(yuzey.IZGARA.sutun).toBe(60);
    expect(yuzey.IZGARA.satir).toBe(55);
  });

  it('KARAKTER_MM ve SATIR_MM Courier 12pt ölçüleridir', () => {
    expect(yuzey.KARAKTER_MM).toBeCloseTo(25.4 / 10, 10);
    expect(yuzey.SATIR_MM).toBeCloseTo(25.4 / 6, 10);
  });

  it('AMERIKAN_BLOKLAR barrel\'dan blok stilleriyle çıkar', () => {
    expect(yuzey.AMERIKAN_BLOKLAR.scene!.buyukHarf).toBe(true);
    expect(yuzey.AMERIKAN_BLOKLAR.action!.buyukHarf).toBe(false);
  });

  it('TERIMLER barrel\'dan iki dilin tablosuyla çıkar', () => {
    expect(yuzey.TERIMLER.tr.mekan.ic).toBe('İÇ');
    expect(yuzey.TERIMLER.en.mekan.ic).toBe('INT.');
  });

  // Fonksiyon olması yetmez — barrel yanlış modülü yeniden dışa aktarsa da
  // `typeof === 'function'` geçerdi. Her fonksiyondan bir çağrı sonucu da alınır.
  it('barrel\'dan gelen fonksiyonlar beklenen işi yapar', () => {
    expect(yuzey.kagitGeometrisi('a4').kagit).toBe('a4');
    expect(yuzey.sutunGenisligi(yuzey.AMERIKAN_BLOKLAR.action!)).toBe(60);
    expect(yuzey.profilOlustur('amerikan', 'a4', 'tr').dil).toBe('tr');
    expect(yuzey.sahneBasligiAyristir('İÇ. MUTFAK - GECE', 'tr').zaman).toBe('gece');
    expect(yuzey.sahneBasligiBicimle({ mekan: 'ic', yer: 'MUTFAK', ayirac: '-' }, 'tr')).toBe('İÇ - MUTFAK');
    expect(yuzey.buyut('işıl', 'tr')).toBe('İŞIL');
    expect(yuzey.sarmala('kısa satır', 60)).toEqual(['kısa satır']);
    expect(yuzey.sayfala([], yuzey.profilOlustur('amerikan', 'a4', 'tr'))).toHaveLength(1);
    expect(yuzey.girintiSutun(yuzey.AMERIKAN_BLOKLAR.dialogue!)).toEqual({ sol: 10, sag: 15 });
    expect(yuzey.sayfaDegiskenleri(yuzey.profilOlustur('amerikan', 'a4', 'tr'), 1)['--sutun'])
      .toBe('60ch');
    expect(yuzey.blokKurallari(yuzey.profilOlustur('amerikan', 'a4', 'tr')))
      .toContain('--girinti-dialogue');
    expect(yuzey.sayfaSinirlari([{ no: 1, satirlar: [] }], 55)).toEqual([]);
    expect(yuzey.metinSayaclari('bir iki').kelime).toBe(2);
    expect(yuzey.sayaclar([], yuzey.profilOlustur('amerikan', 'a4', 'tr')).sayfa).toBe(1);
    expect(yuzey.presetUygula(yuzey.AMERIKAN_BLOKLAR.action!, { punto: 14 }).redler)
      .toHaveLength(1);
    expect(
      yuzey.profileUygula(yuzey.profilOlustur('amerikan', 'a4', 'tr'), { action: { kalin: true } })
        .profil.bloklar.action!.kalin,
    ).toBe(true);
  });

  it('SABIT_SAYFA_CSS ve Courier metrikleri barreldan çıkar', () => {
    expect(yuzey.SABIT_SAYFA_CSS).toContain('.senaryo-kagit');
    expect(yuzey.COURIER_EN_ORANI).toBeCloseTo(0.6, 10);
    expect(yuzey.YAZI_MM).toBeCloseTo(25.4 / 6, 10);
  });
});
