import { describe, expect, it } from 'vitest';
import { presetUygula, profileUygula, type BlokPreseti } from '@storyboard/core/format/preset';
import { AMERIKAN_BLOKLAR, profilOlustur, sutunGenisligi } from '@storyboard/core/format/profil';
import { IZGARA, KARAKTER_MM } from '@storyboard/core/format/izgara';
import { sayfala } from '@storyboard/core/format/sayfala';
import { girintiSutun } from '@storyboard/core/format/ekran';
import type { ScriptBlock } from '@storyboard/core/model/script';

const taban = AMERIKAN_BLOKLAR.action!;
const uygula = (p: BlokPreseti) => presetUygula(taban, p);
const alanlar = (p: BlokPreseti) => uygula(p).redler.map((r) => r.alan);

describe('§16.3 — profilin zorunlu kıldığı ölçüler EZİLEMEZ', () => {
  it('yazı tipi, punto ve satır aralığı reddedilir', () => {
    expect(alanlar({ yaziTipi: 'Helvetica' })).toEqual(['yaziTipi']);
    expect(alanlar({ punto: 14 })).toEqual(['punto']);
    expect(alanlar({ satirAraligi: 1.5 })).toEqual(['satirAraligi']);
  });

  /* Sessizce yoksaymak, kullanıcının ayarı değiştirdiğini sanıp teslim ettiği
     dosyanın başka çıkmasına yol açardı. Her red GEREKÇESİYLE dönüyor. */
  it('her red okunabilir bir gerekçe taşır', () => {
    for (const red of uygula({ yaziTipi: 'X', punto: 8, satirAraligi: 2 }).redler) {
      expect(red.sebep.length).toBeGreaterThan(20);
    }
    expect(uygula({ punto: 8 }).redler[0].sebep).toMatch(/sayfa ≈ dakika|60 karakter/);
  });

  it('reddedilen alan stile HİÇ yansımaz', () => {
    const sonuc = uygula({ punto: 24, kalin: true });
    expect(sonuc.stil).toEqual({ ...taban, kalin: true });
    expect(Object.keys(sonuc.stil)).not.toContain('punto');
  });

  /* Alanlar tipte YER ALIYOR ki arayüz denetimi gösterebilsin ve reddi
     açıklayabilsin. Görünmez bir sınır, açıklanan bir sınırdan kötüdür. */
  it('ezilemez alanlar sunulabilir olmalı — tipten silinmiş değiller', () => {
    const hepsi: BlokPreseti = { yaziTipi: 'a', punto: 1, satirAraligi: 1 };
    expect(uygula(hepsi).redler).toHaveLength(3);
  });
});

describe('serbest alanlar uygulanır', () => {
  it('kalın, italik, büyük harf, hiza ve yeni sayfa geçer', () => {
    const sonuc = uygula({
      kalin: true, italik: true, buyukHarf: true, hiza: 'orta', yeniSayfada: true,
    });
    expect(sonuc.redler).toEqual([]);
    expect(sonuc.stil).toMatchObject({
      kalin: true, italik: true, buyukHarf: true, hiza: 'orta', yeniSayfada: true,
    });
  });

  it('boş preset tabanı aynen bırakır', () => {
    const sonuc = uygula({});
    expect(sonuc.stil).toEqual(taban);
    expect(sonuc.redler).toEqual([]);
  });
});

describe('ızgara sınırı', () => {
  it('tam karakter katı girinti kabul edilir', () => {
    const sonuc = uygula({ solMm: 5 * KARAKTER_MM });
    expect(sonuc.redler).toEqual([]);
    expect(girintiSutun(sonuc.stil).sol).toBe(5);
  });

  it('yarım karakterlik girinti reddedilir ve taban korunur', () => {
    const sonuc = uygula({ solMm: KARAKTER_MM / 2 });
    expect(sonuc.redler.map((r) => r.alan)).toEqual(['solMm']);
    expect(sonuc.stil.solMm).toBe(taban.solMm);
  });

  it('negatif girinti reddedilir', () => {
    expect(alanlar({ sagMm: -KARAKTER_MM })).toEqual(['sagMm']);
  });

  /* VERİ KAYBI YOLU: sıfır ya da negatif sütun `sarmala`'yı sonsuz döngüye
     sokar — uygulama donar ve kaydedilmemiş iş gider (§15). Girintiler ayrı
     ayrı geçerli olsa bile TOPLAM denetlenmek zorunda. */
  it('ayrı ayrı geçerli ama TOPLAMDA metin bloğunu yiyen girintiler reddedilir', () => {
    const yarim = (IZGARA.sutun / 2) * KARAKTER_MM;
    const sonuc = uygula({ solMm: yarim, sagMm: yarim });
    expect(sonuc.redler.map((r) => r.alan)).toContain('solMm');
    expect(sonuc.redler[0].sebep).toMatch(/metin bloğunu yiyor/);
    // Taban girintiler korunur — sayfalama hâlâ çalışır.
    expect(sonuc.stil.solMm).toBe(taban.solMm);
    expect(sutunGenisligi(sonuc.stil)).toBeGreaterThan(0);
  });

  it('tam bir sütun bırakan uç girinti KABUL edilir', () => {
    const sonuc = uygula({ solMm: (IZGARA.sutun - 1) * KARAKTER_MM, sagMm: 0 });
    expect(sonuc.redler).toEqual([]);
    expect(sutunGenisligi(sonuc.stil)).toBe(1);
  });

  it('kesirli ve negatif boş satır reddedilir', () => {
    expect(alanlar({ oncekiBosSatir: 1.5 })).toEqual(['oncekiBosSatir']);
    expect(alanlar({ oncekiBosSatir: -1 })).toEqual(['oncekiBosSatir']);
    expect(uygula({ oncekiBosSatir: 3 }).stil.oncekiBosSatir).toBe(3);
  });
});

describe('profile uygulama', () => {
  const p = () => profilOlustur('amerikan', 'letter', 'tr');

  it('yeni profil NESNESİ döner, tabanı değiştirmez', () => {
    const t = p();
    const oncekiKalin = t.bloklar.action!.kalin;
    const { profil } = profileUygula(t, { action: { kalin: true } });
    expect(profil.bloklar.action!.kalin).toBe(true);
    expect(t.bloklar.action!.kalin).toBe(oncekiKalin);
    expect(profil).not.toBe(t);
  });

  it('dokunulmayan blok tipleri aynen kalır', () => {
    const t = p();
    const { profil } = profileUygula(t, { action: { kalin: true } });
    expect(profil.bloklar.dialogue).toEqual(t.bloklar.dialogue);
  });

  it('redler blok tipine göre gruplanır', () => {
    const { redler } = profileUygula(p(), {
      action: { punto: 14 },
      dialogue: { kalin: true },
    });
    expect(redler.action?.map((r) => r.alan)).toEqual(['punto']);
    expect(redler.dialogue).toBeUndefined();
  });

  it('bilinmeyen blok tipi sessizce atlanır', () => {
    const { profil, redler } = profileUygula(p(), { yokBoyle: { kalin: true } } as never);
    expect(redler).toEqual({});
    expect(profil.bloklar).toEqual(p().bloklar);
  });

  /* Presetler sayfalamayı DEĞİŞTİREBİLİR (boş satır, yeni sayfa) ama asla
     kıramaz: her durumda sayfalanabilir bir profil çıkmalı. */
  it('preset uygulanmış profille sayfalama çalışmaya devam eder', () => {
    const { profil } = profileUygula(p(), {
      action: { oncekiBosSatir: 3 },
      scene: { yeniSayfada: true },
      dialogue: { solMm: 999, sagMm: 999 },
    });
    const bloklar: ScriptBlock[] = Array.from({ length: 40 }, (_, i) => ({
      id: `b${i}`, fp: '',
      type: (i % 3 === 0 ? 'scene' : i % 3 === 1 ? 'action' : 'dialogue') as ScriptBlock['type'],
      text: `Satır ${i} metin`, scene: '', sceneId: '',
    }));
    const sayfalar = sayfala(bloklar, profil);
    expect(sayfalar.length).toBeGreaterThan(1);
    // `yeniSayfada` gerçekten sayfa çeviriyor: sahne sayısı kadar sayfa olmalı.
    expect(sayfalar.length).toBeGreaterThanOrEqual(bloklar.filter((b) => b.type === 'scene').length);
  });
});

describe('girinti SAYI OLMAYAN değerler — donma yolu kapalı', () => {
  /* `NaN` her iki muhafızdan da geçebiliyordu: `NaN < 0` false,
     `Math.abs(NaN - Math.round(NaN)) > 1e-9` false, `NaN < 1` false.
     Sonuç `sarmala`'ya NaN sütun gitmesi — yani DONMA, yani kaydedilmemiş
     iş kaybı. Değer profil dosyasından/kullanıcı ayarından geliyor: güven sınırı. */
  it('NaN girinti REDDEDİLİYOR', () => {
    expect(alanlar({ solMm: NaN })).toContain('solMm');
    expect(Number.isFinite(uygula({ solMm: NaN }).stil.solMm)).toBe(true);
  });

  it('Infinity girinti REDDEDİLİYOR', () => {
    expect(alanlar({ sagMm: Infinity })).toContain('sagMm');
    expect(Number.isFinite(uygula({ sagMm: Infinity }).stil.sagMm)).toBe(true);
  });

  it('NaN sonrası sütun genişliği hâlâ POZİTİF — sarmala donmaz', () => {
    const stil = uygula({ solMm: NaN, sagMm: NaN }).stil;
    expect(sutunGenisligi(stil)).toBeGreaterThan(0);
  });
});
