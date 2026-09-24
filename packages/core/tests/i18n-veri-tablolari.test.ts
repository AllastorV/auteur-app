import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EN } from '@storyboard/core/dil/arayuz';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '@storyboard/core/model/types';
import { KATMAN_ADLARI, ZAMAN_ADLARI } from '@storyboard/core/model/zaman-katmani';
import { EZILEMEZ_GEREKCE } from '@storyboard/core/format/preset';
import { SEKME_ADLARI } from '@storyboard/core/model/denetci-sekme';

/**
 * VERİ TABLOLARINDAN GELEN DİZGİLER — tarayıcının kör noktası.
 *
 * `i18n-kapsam` testi kaynakta DÜZ METİN arıyor. Ama arayüzdeki metnin bir
 * kısmı düz metin değil, bir tablodan geliyor:
 *
 *     {ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}
 *
 * Bu satırda Türkçe bir dizge YOK; Türkçe tablonun içinde. Tarayıcı temiz
 * rapor verirken İngilizce arayüzde rol açıklamaları Türkçe kalıyordu ve
 * bu gerçek bir kullanıcı şikâyetiydi (2026-08-29, web katılma ekranında
 * ölçüldü).
 *
 * Kural iki parçalı ve İKİSİ de gerekli:
 *  1. Tablodaki her değerin sözlükte İngilizce karşılığı olacak.
 *  2. Tabloyu KULLANAN her yer `t()` ile saracak — karşılık sözlükte
 *     dursa bile sarılmamış kullanım Türkçe basar.
 */

const KOK = path.join(__dirname, '..', '..', '..');

/** Ürün kaynağındaki bütün .ts/.tsx dosyaları — dist, node_modules, test hariç. */
function kaynaklar(dizin: string, biriken: string[] = []): string[] {
  for (const girdi of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, girdi.name);
    if (girdi.isDirectory()) {
      if (['node_modules', 'dist', 'tests', '.git', 'build', 'release'].includes(girdi.name)) continue;
      kaynaklar(tam, biriken);
    } else if (/\.tsx?$/.test(girdi.name) && !/\.test\.tsx?$/.test(girdi.name)) {
      biriken.push(tam);
    }
  }
  return biriken;
}

const DOSYALAR = [
  ...kaynaklar(path.join(KOK, 'packages', 'core', 'src')),
  ...kaynaklar(path.join(KOK, 'apps', 'web', 'src')),
];

/** Tablonun TANIMLANDIĞI dosyada sarılmamış kullanım beklenir — kaynak orası. */
const TANIM = new Set(['types.ts', 'zaman-katmani.ts', 'preset.ts', 'denetci-sekme.ts']);

const TABLOLAR: [string, Record<string, string>][] = [
  ['ROLE_LABELS', ROLE_LABELS],
  ['ROLE_DESCRIPTIONS', ROLE_DESCRIPTIONS],
  ['KATMAN_ADLARI', KATMAN_ADLARI],
  ['ZAMAN_ADLARI', ZAMAN_ADLARI],
  ['EZILEMEZ_GEREKCE', EZILEMEZ_GEREKCE],
  ['SEKME_ADLARI', SEKME_ADLARI],
];

describe('veri tablolarının İngilizce karşılığı var', () => {
  for (const [ad, tablo] of TABLOLAR) {
    it(`${ad} — her değer sözlükte`, () => {
      const eksik = Object.values(tablo).filter((v) => !(v in EN));
      expect(eksik, `sözlükte yok: ${eksik.join(' | ')}`).toEqual([]);
    });
  }
});

describe('veri tabloları KULLANILDIĞI yerde sarılıyor', () => {
  for (const [ad] of TABLOLAR) {
    it(`${ad} her kullanımda t() ile sarılı`, () => {
      const sarilmamis: string[] = [];
      for (const dosya of DOSYALAR) {
        if (TANIM.has(path.basename(dosya))) continue;
        const icerik = fs.readFileSync(dosya, 'utf8');
        /* Çeviricinin YEREL ADI dosyadan okunuyor: bazı dosyalar
           `t as ceviri` diye alıyor (yerel bir `t` ile çakışmasın diye) ve
           sabit `t(` aramak orada yanlış alarm üretirdi. */
        const takma = /import\s*\{[^}]*\bt\s+as\s+(\w+)/.exec(icerik)?.[1] ?? 't';
        const desen = new RegExp(`(${takma}\\(\\s*)?\\b${ad}\\[`, 'g');
        for (const m of icerik.matchAll(desen)) {
          if (!m[1]) sarilmamis.push(`${path.basename(dosya)}:${ad}`);
        }
      }
      expect(
        [...new Set(sarilmamis)],
        'sarılmamış kullanım İngilizce arayüzde Türkçe basar',
      ).toEqual([]);
    });
  }
});

/**
 * TABLONUN ADI GEÇMEDEN kullanılan değerler — tarayıcının ikinci kör noktası.
 *
 * `EZILEMEZ_GEREKCE` arayüze `PresetRed.sebep` alanı üzerinden ulaşıyor;
 * `AyarlarDialog` tablonun ADINI hiç yazmıyor. Yukarıdaki "kullanımda
 * sarılı" testi tablo adını arıyor, dolayısıyla bu satırı hiç görmedi ve
 * İngilizce arayüzde üç açıklama da Türkçe basıldı (gerçek Electron
 * penceresinde görüldü, 2026-08-30).
 *
 * Kural: bir tablonun değeri BAŞKA BİR ALAN ADIYLA taşınıyorsa, o alan adı
 * da taranmak zorunda.
 */
describe('tablo değeri başka bir alan adıyla taşınıyorsa da sarılı', () => {
  it('`red.sebep` her JSX kullanımında t() ile sarılı', () => {
    const sarilmamis: string[] = [];
    for (const dosya of DOSYALAR) {
      const metin = fs.readFileSync(dosya, 'utf8');
      /* `{red.sebep}` çıplak; `{t(red.sebep)}` sarılı. */
      if (/\{\s*red\.sebep\s*\}/.test(metin)) sarilmamis.push(path.basename(dosya));
    }
    expect(sarilmamis, `çıplak red.sebep: ${sarilmamis.join(' | ')}`).toEqual([]);
  });
});

/**
 * KISAYOL TABLOSU — dizi elemanı olan dizgiler tarayıcının üçüncü kör noktası.
 *
 * `ShortcutsDialog`taki `GROUPS` tablosunda dokuz açıklama `t()` ile
 * sarılmamıştı ("Seç", "Çizgi", "Ok", "Yeni panel", "Yazarken", "Odak modu
 * (yan panelleri gizle)"…) ve İngilizce arayüzde Türkçe basılıyordu —
 * gerçek Electron penceresinde görüldü (2026-08-30).
 *
 * `i18n-kapsam` bunları göremiyor: JSX metni değiller, dizi elemanı.
 * `arayuz-dili` de göremiyor: sarılmamış dizge sözlüğe hiç sorulmuyor.
 *
 * Kural YAPISAL: her satır `[tuş, açıklama]` ve AÇIKLAMA her zaman `t(`
 * ile başlar. Tuş etiketi sarılmayabilir (`Ctrl+Z`, `Space` çevrilmez);
 * içinde çevrilecek bir sözcük varsa o da sarılır (`Shift + tekerlek`).
 */
describe('kısayol tablosunun açıklamaları t() ile sarılı', () => {
  const KAYNAK = fs.readFileSync(
    path.join(KOK, 'packages', 'core', 'src', 'components', 'dialogs', 'ShortcutsDialog.tsx'),
    'utf8',
  );

  it('GROUPS tablosu bulunabiliyor', () => {
    /* Test kaynağın ŞEKLİNE dayanıyor; şekil değişirse sessizce boş
       tarama yapıp yeşil kalmasın. */
    expect(KAYNAK).toContain('const GROUPS');
  });

  it('her açıklama ve her başlık sarılı', () => {
    const tablo = KAYNAK.slice(KAYNAK.indexOf('const GROUPS'), KAYNAK.indexOf('\n];'));
    const ciplak: string[] = [];

    /* Açıklamalar: `[ ... , 'Türkçe' ]` — ikinci eleman `t(` ile başlamalı. */
    for (const m of tablo.matchAll(/\[[^[\]]*?,\s*('(?:[^'\\]|\\.)*')\s*\]/g)) {
      ciplak.push(m[1]);
    }
    /* Başlıklar: `title: 'Türkçe'`. */
    for (const m of tablo.matchAll(/title:\s*('(?:[^'\\]|\\.)*')/g)) {
      ciplak.push(m[1]);
    }
    expect(ciplak, `t() ile sarılmamış: ${ciplak.join(' | ')}`).toEqual([]);
  });
});
