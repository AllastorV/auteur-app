import { describe, expect, it } from 'vitest';
import type { ScriptBlockType } from '@storyboard/core/model/script';
import { AMERIKAN_BLOKLAR, profilOlustur, sutunGenisligi } from '@storyboard/core/format/profil';

const TIPLER: ScriptBlockType[] = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
];

/** Amerikan geometrisinde geçiş sağa dayalıdır, kalan beş blok sola (spec §6.4). */
const BEKLENEN_HIZA: Partial<Record<ScriptBlockType, string>> = {
  scene: 'sol', action: 'sol', character: 'sol',
  parenthetical: 'sol', dialogue: 'sol', transition: 'sag',
};

const BEKLENEN_ONCEKI_BOS_SATIR: Partial<Record<ScriptBlockType, number>> = {
  scene: 2, action: 1, character: 1, parenthetical: 0, dialogue: 0, transition: 1,
};

const BEKLENEN_SUTUN: Partial<Record<ScriptBlockType, number>> = {
  scene: 60, action: 60, character: 40, parenthetical: 30, dialogue: 35, transition: 55,
};

describe('Amerikan blok stilleri', () => {
  it('her blok tipi için stil tanımlıdır', () => {
    for (const t of TIPLER) expect(AMERIKAN_BLOKLAR[t]!).toBeDefined();
  });

  it('girintiler spec 6.4 ile birebir uyuşur', () => {
    expect(AMERIKAN_BLOKLAR.scene!.solMm).toBeCloseTo(0, 4);
    expect(AMERIKAN_BLOKLAR.action!.solMm).toBeCloseTo(0, 4);
    expect(AMERIKAN_BLOKLAR.character!.solMm).toBeCloseTo(50.8, 4);
    expect(AMERIKAN_BLOKLAR.parenthetical!.solMm).toBeCloseTo(38.1, 4);
    expect(AMERIKAN_BLOKLAR.dialogue!.solMm).toBeCloseTo(25.4, 4);
    expect(AMERIKAN_BLOKLAR.dialogue!.sagMm).toBeCloseTo(38.1, 4);
  });

  it('sahne başlığı, karakter ve geçiş büyük harf; diyalog ve aksiyon değil', () => {
    expect(AMERIKAN_BLOKLAR.scene!.buyukHarf).toBe(true);
    expect(AMERIKAN_BLOKLAR.character!.buyukHarf).toBe(true);
    expect(AMERIKAN_BLOKLAR.transition!.buyukHarf).toBe(true);
    expect(AMERIKAN_BLOKLAR.dialogue!.buyukHarf).toBe(false);
    expect(AMERIKAN_BLOKLAR.action!.buyukHarf).toBe(false);
  });

  /* KARAR DEĞİŞTİ (kullanıcı, 2026-08-26): sahne başlığı ve karakter KALIN.
     Önceki karar "klasik teslim formatı kalın yazmaz" diyordu ve doğruydu;
     ama kullanıcının kendi formatı bu ve programın kullanıcısı o.
     Sayfa sayısı etkilenmiyor: Courier kalın da eşgenişliklidir. */
  it('sahne başlığı ve karakter KALIN — kullanıcı kararı', () => {
    expect(AMERIKAN_BLOKLAR.scene!.kalin).toBe(true);
    expect(AMERIKAN_BLOKLAR.character!.kalin).toBe(true);
  });

  it('aksiyon ve diyalog kalın DEĞİL — ayrım korunuyor', () => {
    expect(AMERIKAN_BLOKLAR.action!.kalin).toBe(false);
    expect(AMERIKAN_BLOKLAR.dialogue!.kalin).toBe(false);
  });

  it('önce boş satır sayıları spec 6.4 ile uyuşur — altı tipin altısı', () => {
    for (const t of TIPLER) {
      expect(AMERIKAN_BLOKLAR[t]!.oncekiBosSatir).toBe(BEKLENEN_ONCEKI_BOS_SATIR[t]!);
    }
  });

  it('hiza altı tip için beklenen değerdedir — geçiş sağa dayalı', () => {
    for (const t of TIPLER) expect(AMERIKAN_BLOKLAR[t]!.hiza).toBe(BEKLENEN_HIZA[t]!);
    expect(AMERIKAN_BLOKLAR.transition!.hiza).toBe('sag');
  });

  it('varsayilan() tabanları korunur: hiçbir blok italik değil, hiçbiri yeni sayfada başlamaz', () => {
    for (const t of TIPLER) {
      expect(AMERIKAN_BLOKLAR[t]!.italik).toBe(false);
      expect(AMERIKAN_BLOKLAR[t]!.yeniSayfada).toBe(false);
    }
  });
});

describe('sutunGenisligi', () => {
  it('her blok tipi ızgaraya oturur — hizasızda FIRLATIR', () => {
    for (const t of TIPLER) {
      expect(() => sutunGenisligi(AMERIKAN_BLOKLAR[t]!)).not.toThrow();
      expect(sutunGenisligi(AMERIKAN_BLOKLAR[t]!)).toBeGreaterThan(0);
    }
  });

  it('ızgaraya oturmayan stil sessizce yuvarlanmaz — fırlatır', () => {
    // 152.4 - 25.4 - 38 = 89 mm; 89 / 2.54 = 35.039... — tam sayı değil.
    expect(() => sutunGenisligi({ ...AMERIKAN_BLOKLAR.dialogue!, sagMm: 38 }))
      .toThrow(/izgara/i);
  });

  it('tolerans keskindir — çok küçük sapma da fırlatır', () => {
    // 0.05 mm sapma = 0.0197 sütun: 1e-9'un çok üstünde ama gevşek bir
    // toleransın (örn. 0.03 sütun) yutacağı mertebede. Yutulmamalı.
    expect(() => sutunGenisligi({ ...AMERIKAN_BLOKLAR.dialogue!, sagMm: 38.1 + 0.05 }))
      .toThrow(/izgara/i);
  });

  it('SIFIR sütun üreten stil fırlatır — sonsuz döngü yolu kapalı', () => {
    // 152.4 - 76.2 - 76.2 = 0 mm → tam 0 sütun. Izgaraya OTURUYOR, yani
    // hiza kontrolü bunu geçirir; yakalayan yalnız pozitiflik kontrolüdür.
    // Sıfır sütun `sarmala`yı sonsuz döngüye sokar: uygulama donar ve
    // kullanıcının kaydedilmemiş işi gider (spec §15, veri kaybı yolu).
    expect(() => sutunGenisligi({ ...AMERIKAN_BLOKLAR.action!, solMm: 76.2, sagMm: 76.2 }))
      .toThrow(/pozitif/i);
    // Sınırın doğru yerde olduğunu kanıtla: bir sütunluk pay kalırsa geçer.
    expect(sutunGenisligi({ ...AMERIKAN_BLOKLAR.action!, solMm: 76.2, sagMm: 73.66 }))
      .toBe(1);
  });

  it('NEGATİF sütun üreten stil fırlatır', () => {
    // 152.4 - 101.6 - 76.2 = -25.4 mm → -10 sütun. Bu da ızgaraya oturur.
    expect(() => sutunGenisligi({ ...AMERIKAN_BLOKLAR.action!, solMm: 101.6, sagMm: 76.2 }))
      .toThrow(/pozitif/i);
  });

  it('bilinen sütun genişlikleri — altı tipin altısı', () => {
    for (const t of TIPLER) expect(sutunGenisligi(AMERIKAN_BLOKLAR[t]!)).toBe(BEKLENEN_SUTUN[t]);
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.action!)).toBe(60);
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.dialogue!)).toBe(35);
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.parenthetical!)).toBe(30);
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.character!)).toBe(40);
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.scene!)).toBe(60);
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.transition!)).toBe(55);
  });
});

describe('profilOlustur', () => {
  it('kağıt değişse de blok stilleri ve sütunlar aynı kalır', () => {
    const letter = profilOlustur('amerikan', 'letter', 'en');
    const a4 = profilOlustur('amerikan', 'a4', 'tr');
    for (const t of TIPLER) {
      expect(a4.bloklar[t]).toEqual(letter.bloklar[t]);
      expect(sutunGenisligi(a4.bloklar[t]!)).toBe(sutunGenisligi(letter.bloklar[t]!));
    }
  });

  it('kağıt yalnız geometriyi değiştirir', () => {
    const letter = profilOlustur('amerikan', 'letter', 'en');
    const a4 = profilOlustur('amerikan', 'a4', 'en');
    expect(a4.geometri.sagMm).not.toBeCloseTo(letter.geometri.sagMm, 2);
    expect(a4.geometri.metinGenislikMm).toBeCloseTo(letter.geometri.metinGenislikMm, 6);
  });

  it('dönen profil verilen argümanları yansıtır', () => {
    const p = profilOlustur('amerikan', 'a4', 'tr');
    expect(p.geometriAdi).toBe('amerikan');
    expect(p.kagit).toBe('a4');
    expect(p.dil).toBe('tr');
    expect(p.geometri.kagit).toBe('a4');

    const q = profilOlustur('amerikan', 'letter', 'en');
    expect(q.kagit).toBe('letter');
    expect(q.dil).toBe('en');
    expect(q.geometri.kagit).toBe('letter');
  });

  it('iki sütunlu Fransız yerleşimi sessizce Amerikan a düşmez — hata fırlatır', () => {
    // §6.6: ayrı bir motor ister (satır çifti sayfalaması), F1d de gelecek.
    expect(() => profilOlustur('fransiz', 'a4', 'tr')).toThrow(/tanimli degil|fransiz/i);
  });
});
