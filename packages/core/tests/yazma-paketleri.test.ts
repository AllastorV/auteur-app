import { describe, expect, it } from 'vitest';
import { duzeltmeUygula, DUZELTMELER } from '@storyboard/core/editor/akilli-duzeltme';
import {
  tercihiCoz, tercihiYaz, VARSAYILAN_TERCIH, OLCEK_EN_AZ, OLCEK_EN_COK,
} from '@storyboard/core/format/tercih';

/**
 * YAZMA PAKETLERİ — STARC'ın dağınık ayarları, birleştirilmiş hâlleriyle.
 *
 * Kullanıcı kararı (2026-08-27): "birleştirilebilen varsa tek ayar olarak
 * ekle." Bu dosya paketlerin DAVRANIŞINI sınıyor; hangi STARC kutusunun
 * hangi pakete girdiği kaynak dosyaların başında yazılı.
 */

describe('akıllı düzeltmeler — STARC\'ın 5 kutusu tek pakette', () => {
  /** `duzeltmeUygula` imlecin SOLUNDAKİ metni alır (yazılan karakter dahil). */
  const uygula = (sol: string) => duzeltmeUygula(sol)?.yeni ?? null;

  it('iki büyük harf düzeltiliyor — Türkçe küçültmeyle', () => {
    expect(uygula('MErhaba'.slice(0, 3))).toBe('Mer');
    /* `İ`nin küçüğü `i` (Türkçe) — `I` değil. Yanlış küçültme sözcüğü bozar. */
    expect(uygula('İIs')).toBe('İıs');
  });

  it('KISALTMALARA dokunmuyor — üçüncü harf büyükse kural işlemez', () => {
    expect(uygula('TSK')).toBeNull();
    expect(uygula('İÇ.')).toBeNull();
    /* Sahne başlığı tamamı büyük yazılır; kural onu bozmamalı. */
    expect(uygula('KORİDOR')).toBeNull();
  });

  it('üç nokta ve iki tire tek karaktere iniyor', () => {
    expect(uygula('bir...')).toBe('…');
    expect(uygula('bir--')).toBe('—');
  });

  it('kıvırcık tırnak YÖNÜ önceki karakterden', () => {
    /* Boşluktan sonra AÇILIŞ, harften sonra KAPANIŞ. Hepsini kapanış
       yapan bir mutant burada ölür. */
    expect(uygula('dedi "')).toBe(' “');
    expect(uygula('gel"')).toBe('”');
    expect(uygula("dedi '")).toBe(' ‘');
    expect(uygula("gel'")).toBe('’');
  });

  it('ikinci boşluk yutuluyor — ızgara kaymasın', () => {
    expect(uygula('abc  ')).toBe('c ');
    /* Tek boşluk dokunulmadan geçer. */
    expect(uygula('abc ')).toBeNull();
  });

  it('eşleşme yoksa null — olağan yazım hiç dokunulmadan geçiyor', () => {
    expect(duzeltmeUygula('merhaba')).toBeNull();
    expect(duzeltmeUygula('')).toBeNull();
  });

  it('kural tablosunda AÇILIŞ tırnağı kapanıştan ÖNCE', () => {
    /* Sıra bozulursa açılış hiç eşleşmez (kapanış her tırnağı yakalar) —
       tablo sırası bir DAVRANIŞ, düzen tercihi değil. */
    const desenler = DUZELTMELER.map((d) => d.desen.source);
    const acikCift = desenler.findIndex((d) => d.includes('"') && d.includes('\\s'));
    const kapaliCift = desenler.findIndex((d) => d === '"$');
    expect(acikCift).toBeGreaterThanOrEqual(0);
    expect(acikCift).toBeLessThan(kapaliCift);
  });
});

describe('paket ayarları kalıcı — güven sınırıyla', () => {
  it('yaz→çöz turu üç ayarı da koruyor', () => {
    const metin = tercihiYaz({
      ...VARSAYILAN_TERCIH,
      akilliDuzeltme: false,
      daktiloModu: true,
      arayuzOlcegi: 1.25,
    });
    const geri = tercihiCoz(metin);
    expect(geri.akilliDuzeltme).toBe(false);
    expect(geri.daktiloModu).toBe(true);
    expect(geri.arayuzOlcegi).toBe(1.25);
  });

  it('varsayılanlar: düzeltmeler AÇIK, daktilo KAPALI, ölçek 1', () => {
    expect(VARSAYILAN_TERCIH.akilliDuzeltme).toBe(true);
    expect(VARSAYILAN_TERCIH.daktiloModu).toBe(false);
    expect(VARSAYILAN_TERCIH.arayuzOlcegi).toBe(1);
  });

  it('aralık dışı ölçek KISKAÇLANIYOR — arayüz kullanılamaz hâle gelmesin', () => {
    const kucuk = tercihiCoz(tercihiYaz({ ...VARSAYILAN_TERCIH, arayuzOlcegi: 0.1 }));
    const buyuk = tercihiCoz(tercihiYaz({ ...VARSAYILAN_TERCIH, arayuzOlcegi: 9 }));
    expect(kucuk.arayuzOlcegi).toBe(OLCEK_EN_AZ);
    expect(buyuk.arayuzOlcegi).toBe(OLCEK_EN_COK);
  });

  it('bozuk değerler varsayılana düşüyor — depo kullanıcının elinde', () => {
    const bozuk = tercihiCoz('{"akilliDuzeltme":"evet","daktiloModu":3,"arayuzOlcegi":"iri"}');
    expect(bozuk.akilliDuzeltme).toBe(VARSAYILAN_TERCIH.akilliDuzeltme);
    expect(bozuk.daktiloModu).toBe(VARSAYILAN_TERCIH.daktiloModu);
    expect(bozuk.arayuzOlcegi).toBe(VARSAYILAN_TERCIH.arayuzOlcegi);
  });
});
