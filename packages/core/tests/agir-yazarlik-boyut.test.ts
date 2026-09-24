import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { birlestir, type YazarlikKaydi } from '@storyboard/core/veri/yazarlik';
// ponytail: apps/desktop kod, çekirdek paketten çağrılıyor — `yazarlik.ts` gibi
// Electron'a bağlı DEĞİL, ama sınır olağan dışı. `agir-cipa-boyut.test.ts` ile
// AYNI gerekçe: GERÇEK diski `yazarlikDeposu` üzerinden ölçmek "ölç" talebini
// "tahmin et"e çevirmemek için.
import { yazarlikDeposu } from '../../../apps/desktop/electron/yazarlik-deposu';

/**
 * AĞIR TEST — yazarlık günlüğünün GERÇEK disk maliyeti, birleştirmeYLE ve
 * birleştirmeSİZ (§ölçüm).
 *
 * Senaryo: 4000 bloklu bir proje, 10 EŞ ZAMANLI oturum (yazar). Her oturum
 * `yazici.ts`nin 1 saniyelik boşaltma döngüsüyle AYNI cadence'te 10 dakika
 * (600 tur) yazıyor; her blokta 10 saniye kalıp bir sonrakine geçiyor —
 * "bir paragrafı yazmak saniyeler sürer" tipik durumunu modelliyor.
 *
 * Birleştirme YAZICIDA (client tarafında, diske değmeden ÖNCE) olur — bu
 * yüzden her oturumun HAM (saniyede bir) dizisi kendi İÇİNDE `birlestir`den
 * geçiriliyor, sonra 10 oturum art arda ekleniyor. Ham taraf karşılaştırma
 * tabanı: "birleştirme hiç olmasaydı" sorusuna cevap.
 */

const OTURUM_SAYISI = 10;
const TUR_SANIYE = 600; // 10 dakika, saniyede bir tur — GUNLUK_ARALIK_MS ile aynı cadence.
const BLOK_DWELL_SANIYE = 10;
const BLOK_ARALIGI = 400; // 10 oturum × 400 = 4000 blok.

function oturumHamDizisi(oturum: number): YazarlikKaydi[] {
  const yazar = `Yazar-${oturum}`;
  const kayitlar: YazarlikKaydi[] = [];
  for (let t = 0; t < TUR_SANIYE; t++) {
    const blokIndeksi = oturum * BLOK_ARALIGI + Math.floor(t / BLOK_DWELL_SANIYE);
    kayitlar.push({ zaman: t * 1000, yazar, bloklar: [`sb_${blokIndeksi}`] });
  }
  return kayitlar;
}

const HAM: YazarlikKaydi[] = [];
const BIRLESMIS: YazarlikKaydi[] = [];
for (let o = 0; o < OTURUM_SAYISI; o++) {
  const oturum = oturumHamDizisi(o);
  HAM.push(...oturum);
  BIRLESMIS.push(...birlestir(oturum));
}

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-yazarlik-olcum-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

describe('yazarlık günlüğü — gerçek disk maliyeti, birleştirmeli/birleştirmesiz', () => {
  it(
    '4000 blok × 10 oturum × 10 dakika: birleştirme kayıt sayısını ve disk boyutunu küçültüyor',
    () => {
      const hamDepo = yazarlikDeposu(kok, 'ham');
      hamDepo.ekle(HAM);
      const hamBoyut = fs.statSync(path.join(hamDepo.dizin, 'yazarlik.log')).size;

      const birlesmisDepo = yazarlikDeposu(kok, 'birlesmis');
      birlesmisDepo.ekle(BIRLESMIS);
      const birlesmisBoyut = fs.statSync(path.join(birlesmisDepo.dizin, 'yazarlik.log')).size;

      expect(HAM).toHaveLength(OTURUM_SAYISI * TUR_SANIYE); // 6000 — sanity.
      expect(BIRLESMIS).toHaveLength(OTURUM_SAYISI * (TUR_SANIYE / BLOK_DWELL_SANIYE)); // 600 — sanity.

      // ---- Regresyon kapanı 1 — kayıt sayısı ORANI, sabit sayı DEĞİL ----
      // Teorik oran BLOK_DWELL_SANIYE'e bağlı (1/10 = %10); tavan cömert
      // tutuldu ki dwell süresi değişince test kırılgan olmasın, ama
      // birleştirme SESSİZCE devre dışı kalırsa (oran ~1.0'a çıkarsa) yakalar.
      const kayitOrani = BIRLESMIS.length / HAM.length;
      expect(kayitOrani, 'birleştirme kayıt sayısını beklenen ölçüde küçültmüyor').toBeLessThan(0.2);

      // ---- Regresyon kapanı 2 — disk boyutu ORANI, sabit bayt DEĞİL ----
      // `agir-cipa-boyut.test.ts` ile aynı yöntem: mutlak bayt sayısı yerine
      // birim maliyet oranı — biri diğerinin 3 katını aşarsa büyüme
      // beklenenin dışına çıkmış demektir.
      const boyutOrani = birlesmisBoyut / hamBoyut;
      expect(boyutOrani, 'birleşmiş günlük diskte beklenenden büyük').toBeLessThan(0.25);

      // ---- Regresyon kapanı 3 — kayıt başına bayt maliyeti KARESELLEŞMEDİ ----
      // Birleşmiş kayıtlar da (bu senaryoda) tek blok taşıyor; kayıt başına
      // çerçeve maliyeti ham ile birleşmiş arasında büyük farklılaşmamalı.
      const baytKayitHam = hamBoyut / HAM.length;
      const baytKayitBirlesmis = birlesmisBoyut / BIRLESMIS.length;
      const kayitBaytOrani = baytKayitBirlesmis / baytKayitHam;
      expect(kayitBaytOrani, 'kayıt başına bayt maliyeti ham/birleşmiş arasında kareselleşmiş görünüyor')
        .toBeGreaterThan(1 / 3);
      expect(kayitBaytOrani).toBeLessThan(3);

      // eslint-disable-next-line no-console -- ölçüm testinin ÇIKTISI bu.
      console.log(
        `\nyazarlık günlüğü (${OTURUM_SAYISI} oturum × ${TUR_SANIYE} sn):\n` +
        `  ham:       ${HAM.length} kayıt, ${(hamBoyut / 1024 / 1024).toFixed(2)} MB\n` +
        `  birleşmiş: ${BIRLESMIS.length} kayıt, ${(birlesmisBoyut / 1024 / 1024).toFixed(2)} MB\n` +
        `  kayıt oranı: ${(kayitOrani * 100).toFixed(1)}%  boyut oranı: ${(boyutOrani * 100).toFixed(1)}%\n`,
      );
    },
    60_000,
  );
});
