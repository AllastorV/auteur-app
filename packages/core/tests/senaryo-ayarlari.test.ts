import { describe, expect, it } from 'vitest';
import {
  blokNumaralari, sureHesapla, sureklilikTerimleri,
  VARSAYILAN_NUMARA, VARSAYILAN_SURE, type SureAyari,
} from '@storyboard/core/format/senaryo-ayarlari';
import { sayfala } from '@storyboard/core/format/sayfala';
import { profilOlustur } from '@storyboard/core/format/profil';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * SENARYO AYARLARI — STARC'ın senaryo modülü kutuları, paketlenmiş hâlde
 * (kullanıcı kararı 2026-08-27: "birleştirilebilen varsa tek ayar").
 */

const blok = (tip: ScriptBlock['type'], text: string, ek: Partial<ScriptBlock> = {}): ScriptBlock =>
  ({ id: `b_${text.slice(0, 6)}_${tip}`, fp: '', type: tip, text, scene: '', sceneId: '', ...ek });

describe('numaralandırma — STARC\'ın 2 kutusu tek pakette', () => {
  const bloklar = [
    blok('scene', 'İÇ. EV - GECE', { scene: '1' }),
    blok('character', 'AYŞE'),
    blok('dialogue', 'Gelmiş.'),
    blok('scene', 'DIŞ. SOKAK', { scene: '2' }),
    blok('character', 'ALİ'),
    blok('dialogue', 'Gitmiş.'),
  ];

  it('kapalıyken hiç numara yok', () => {
    expect(blokNumaralari(bloklar, VARSAYILAN_NUMARA).size).toBe(0);
  });

  it('sahne numarası BLOĞUN kendi alanından — yeniden sayılmıyor', () => {
    /* İçe aktarılmış bir senaryoda orijinal numaralar korunmalı; ikinci bir
       sayaç 1'den başlayıp onları ezerdi. */
    const n = blokNumaralari(bloklar, { sahne: 'sol', diyalog: false });
    expect(n.get(bloklar[0].id)).toBe('1');
    expect(n.get(bloklar[3].id)).toBe('2');
    expect(n.has(bloklar[2].id)).toBe(false);
  });

  it('sahne alanı BOŞSA numara verilmiyor — uydurma numara yok', () => {
    const n = blokNumaralari([blok('scene', 'İÇ. EV', { scene: '' })], { sahne: 'sag', diyalog: false });
    expect(n.size).toBe(0);
  });

  it('diyalog numarası SAYILIYOR — belgede saklanmıyor', () => {
    const n = blokNumaralari(bloklar, { sahne: 'kapali', diyalog: true });
    expect(n.get(bloklar[2].id)).toBe('1');
    expect(n.get(bloklar[5].id)).toBe('2');
    /* Sahne kapalıyken sahne bloğuna numara sızmamalı. */
    expect(n.has(bloklar[0].id)).toBe(false);
  });
});

describe('sayfa sonu sürekliliği — STARC\'ın 2 kutusu TEK davranış', () => {
  const profil = profilOlustur('amerikan', 'letter', 'tr');

  /** Sayfayı taşıracak kadar uzun tek bir diyalog. */
  const uzunDiyalog = () => [
    blok('scene', 'İÇ. EV - GECE', { scene: '1' }),
    blok('character', 'AYŞE'),
    blok('dialogue', 'Söz. '.repeat(400).trim()),
  ];

  it('KAPALIYKEN hiç süreklilik satırı yok — varsayılan davranış korunuyor', () => {
    const sayfalar = sayfala(uzunDiyalog(), profil);
    const hepsi = sayfalar.flatMap((s) => s.satirlar);
    expect(hepsi.some((l) => l.surekliligi)).toBe(false);
  });

  it('AÇIKKEN bölünen diyaloğa (DEVAMI VAR) ve (DEVAM) giriyor', () => {
    const sayfalar = sayfala(uzunDiyalog(), profil, true);
    expect(sayfalar.length).toBeGreaterThan(1);
    const ilkSonu = sayfalar[0].satirlar.at(-1)!;
    const ikinciBasi = sayfalar[1].satirlar[0];
    expect(ilkSonu.surekliligi).toBe('devami-var');
    expect(ilkSonu.metin).toBe('(DEVAMI VAR)');
    expect(ikinciBasi.surekliligi).toBe('devam');
    /* Konuşan yeni sayfada YENİDEN görünüyor — çekimde kimin konuştuğu
       sayfanın başında belli olmalı. */
    expect(ikinciBasi.metin).toBe('AYŞE (DEVAM)');
  });

  it('hiçbir METİN satırı kaybolmuyor — itilen satır sonraki sayfada', () => {
    const bloklar = uzunDiyalog();
    const kapali = sayfala(bloklar, profil);
    const acik = sayfala(bloklar, profil, true);
    const metin = (sayfalar: ReturnType<typeof sayfala>) =>
      sayfalar.flatMap((s) => s.satirlar)
        .filter((l) => !l.surekliligi && l.metin)
        .map((l) => l.metin).join('\n');
    /* Mutant: itilen satırı push etmeyen sürüm burada ölür — bir satırlık
       replik sessizce kaybolurdu. */
    expect(metin(acik)).toBe(metin(kapali));
  });

  it('İngilizce belgede (MORE)/(CONT\'D) — terim dile bağlı', () => {
    const en = profilOlustur('amerikan', 'letter', 'en');
    const sayfalar = sayfala(uzunDiyalog(), en, true);
    expect(sayfalar[0].satirlar.at(-1)!.metin).toBe('(MORE)');
    expect(sayfalar[1].satirlar[0].metin).toBe("AYŞE (CONT'D)");
    expect(sureklilikTerimleri('en').devam).toBe("(CONT'D)");
  });

  it('AKSİYON bölünmesinde süreklilik YOK — yalnız diyalog', () => {
    const bloklar = [
      blok('scene', 'İÇ. EV', { scene: '1' }),
      blok('action', 'Adım. '.repeat(2000).trim()),
    ];
    const sayfalar = sayfala(bloklar, profil, true);
    expect(sayfalar.length).toBeGreaterThan(1);
    expect(sayfalar.flatMap((s) => s.satirlar).some((l) => l.surekliligi)).toBe(false);
  });
});

describe('süre hesabı — üç yöntem, tek seçim', () => {
  const bloklar = [
    blok('scene', 'İÇ. EV', { scene: '1' }),
    blok('action', 'A'.repeat(100)),
    blok('dialogue', 'B'.repeat(200)),
  ];

  it('sayfa yöntemi: sayfa sayısı × saniye — ikinci formül yok', () => {
    expect(sureHesapla(bloklar, 10, VARSAYILAN_SURE)).toBe(600);
    expect(sureHesapla(bloklar, 10, { ...VARSAYILAN_SURE, sayfaSaniye: 55 })).toBe(550);
  });

  it('karakter yöntemi sayfadan BAĞIMSIZ', () => {
    const ayar: SureAyari = { ...VARSAYILAN_SURE, yontem: 'karakter' };
    /* 301 karakter / 1350 × 60 sn. Sayfa sayısı değişse de sonuç aynı. */
    const a = sureHesapla(bloklar, 10, ayar);
    const b = sureHesapla(bloklar, 99, ayar);
    expect(a).toBe(b);
    /* Karakter sayısı bloklardan TÜRETİLİYOR — testte elle sayılmıyor;
       elle yazılan bir sayı metin değişince sessizce bayatlardı. */
    const toplam = bloklar.reduce((t, x) => t + x.text.length, 0);
    expect(a).toBeCloseTo((toplam / 1350) * 60, 5);
  });

  it('bozuk karakter sayısı sıfıra bölmüyor', () => {
    const ayar: SureAyari = { ...VARSAYILAN_SURE, yontem: 'karakter', karakterSayisi: 0 };
    expect(sureHesapla(bloklar, 10, ayar)).toBe(0);
  });

  it('özel yöntem blok tipine göre topluyor', () => {
    const ayar: SureAyari = { ...VARSAYILAN_SURE, yontem: 'ozel' };
    /* sahne 2 + aksiyon 1 + diyalog 2 = 5 sn */
    expect(sureHesapla(bloklar, 10, ayar)).toBe(5);
  });

  it('STARC varsayılanları korunuyor — registry\'den okundu', () => {
    expect(VARSAYILAN_SURE.sayfaSaniye).toBe(60);
    expect(VARSAYILAN_SURE.karakterSayisi).toBe(1350);
    expect(VARSAYILAN_SURE.ozelDiyalog).toBe(2);
  });
});
