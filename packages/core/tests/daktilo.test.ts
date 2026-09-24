import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sesAcikMi, sesiAyarla, tusSesi,
  tusOrnegi, silOrnegi, satirOrnegi,
  type TusOlayi,
} from '../src/ses/daktilo';

/**
 * Daktilo sesinin KAPISI.
 *
 * Motorun kendisi (Web Audio) burada ölçülmüyor — ölçülebilir ve yanlış
 * gidebilecek olan, sesin NE ZAMAN çıktığı. Yanlış kapı, arama kutusuna
 * yazarken ya da Ctrl+S basarken takırdayan bir program demek.
 */

function olay(kismi: Partial<TusOlayi>): TusOlayi {
  return {
    key: 'a',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    senaryoAlaninda: true,
    ...kismi,
  };
}

describe('tusSesi kapısı', () => {
  it('senaryo yüzeyinin DIŞINDA hiç ses çıkarmaz', () => {
    /* Aynı tuşlar, tek fark odak. Yalnız harf denenseydi, Enter'ın
       kapıdan kaçtığı görülmezdi. */
    for (const key of ['a', 'ş', 'Enter', 'Backspace', ' ', 'Tab']) {
      expect(tusSesi(olay({ key, senaryoAlaninda: false }))).toBeNull();
      expect(tusSesi(olay({ key, senaryoAlaninda: true }))).not.toBeNull();
    }
  });

  it('kısayollar sessiz — Ctrl, Meta ve Alt', () => {
    expect(tusSesi(olay({ key: 's', ctrlKey: true }))).toBeNull();
    expect(tusSesi(olay({ key: 's', metaKey: true }))).toBeNull();
    /* Alt da sessiz: §7 kabuğunun kısayolları Alt'lı. */
    expect(tusSesi(olay({ key: '1', altKey: true }))).toBeNull();
    /* Shift kısayol değil, büyük harf yazmaktır — o ses çıkarır. */
    expect(tusSesi(olay({ key: 'A' }))).toBe('tus');
  });

  it('ad taşıyan tuşlar (imleç, işlev, kilit) ses çıkarmaz', () => {
    for (const key of [
      'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape',
      'ArrowLeft', 'ArrowUp', 'Home', 'End', 'PageDown', 'F5',
    ]) {
      expect(tusSesi(olay({ key }))).toBeNull();
    }
  });

  it('satır sonu, silme ve yazma birbirinden AYRI seslerdir', () => {
    expect(tusSesi(olay({ key: 'Enter' }))).toBe('satir');
    expect(tusSesi(olay({ key: 'Backspace' }))).toBe('sil');
    expect(tusSesi(olay({ key: 'Delete' }))).toBe('sil');
    expect(tusSesi(olay({ key: ' ' }))).toBe('tus');
    expect(tusSesi(olay({ key: 'Tab' }))).toBe('tus');
    expect(tusSesi(olay({ key: 'ğ' }))).toBe('tus');
  });
});

/**
 * Bellek içi `Storage`. Bu kurulumda jsdom `localStorage` VERMİYOR —
 * `tercih.test.ts` bunu ölçüp aynı sahte depoyu kuruyor; aynı gerekçe.
 */
function sahteDepo(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  } as Storage;
}

describe('ses tercihi', () => {
  beforeEach(() => { (globalThis as any).localStorage = sahteDepo(); });
  afterEach(() => { delete (globalThis as any).localStorage; });

  it('varsayılan KAPALI — davetsiz ses çıkarmaz', () => {
    expect(sesAcikMi()).toBe(false);
  });

  it('açılıp kapanıyor ve kalıcı yazılıyor', () => {
    sesiAyarla(true);
    expect(sesAcikMi()).toBe(true);
    sesiAyarla(false);
    expect(sesAcikMi()).toBe(false);
  });

  it('bozuk değer açık sayılmaz', () => {
    localStorage.setItem('mizansen.ses.v1', 'evet');
    expect(sesAcikMi()).toBe(false);
  });
});

/**
 * SESİN KENDİSİ — ölçülen hedefe oturuyor mu.
 *
 * Kapı mantığı (yukarısı) sesin DOĞRU ANDA çıkmasını ölçüyordu; bu blok
 * DOĞRU SESİN çıkmasını ölçüyor. İkisi ayrı: sentez sessizce bozulsa
 * (bant düşse, eğri kaysa) yukarıdaki testlerin hiçbiri kımıldamazdı.
 *
 * Hedef eğri dört gerçek daktilo kaydından ölçüldü; sentez ona
 * oturtuldu. Sayılar `daktilo.ts`teki `EGRI` ile aynı kaynaktan.
 */
describe('sentez — ölçülen daktiloya oturuyor', () => {
  const HIZ = 48000;
  const BANT: [number, number][] = [
    [40, 120], [120, 250], [250, 500], [500, 1000],
    [1000, 2000], [2000, 4000], [4000, 8000], [8000, 15000],
  ];
  /** Referans kaydın tek vuruşundan ölçülen bant dağılımı (dB). */
  const HEDEF = [-6.0, 0.0, -3.2, -5.7, -0.4, -1.0, -2.2, -13.6];

  /** Kaba DFT ile bant enerjileri — en yüksek banda göre dB. */
  function bantlar(x: Float32Array): number[] {
    const N = 8192;
    const p = new Float64Array(N);
    for (let i = 0; i < N; i++) p[i] = (x[i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const g = BANT.map(([lo, hi]) => {
      let top = 0, adet = 0;
      const adim = Math.max(5, (hi - lo) / 24);
      for (let f = lo; f < hi; f += adim) {
        const w = (2 * Math.PI * f) / HIZ;
        let re = 0, im = 0;
        for (let i = 0; i < N; i++) { re += p[i] * Math.cos(w * i); im -= p[i] * Math.sin(w * i); }
        top += re * re + im * im; adet++;
      }
      return top / adet;
    });
    const enB = Math.max(...g);
    return g.map((v) => 10 * Math.log10(Math.max(1e-15, v / enB)));
  }

  it('tuş vuruşu SESSİZ DEĞİL ve taşmıyor', () => {
    const x = tusOrnegi(HIZ);
    expect(x.length).toBeGreaterThan(HIZ * 0.5);
    let tepe = 0;
    for (const v of x) tepe = Math.max(tepe, Math.abs(v));
    expect(tepe, 'ses üretilmiş olmalı').toBeGreaterThan(0.01);
    expect(tepe, 'tampon taşmamalı — kırpma tepeyi tutuyor').toBeLessThan(1);
  });

  it('bant dağılımı ölçülen kayda oturuyor', () => {
    const olculen = bantlar(tusOrnegi(HIZ));
    /* 40-120 Hz ve 8-15 kHz uçları DIŞARIDA: uçlarda rastgelelik ve
       süzgeç etekleri birkaç dB oynatıyor, orta altı bant sesin
       karakterini taşıyan yer. */
    for (let k = 1; k < 7; k++) {
      expect(Math.abs(olculen[k] - HEDEF[k]),
        `bant ${BANT[k][0]}-${BANT[k][1]} Hz: ölçülen ${olculen[k].toFixed(1)} dB, hedef ${HEDEF[k]} dB`)
        .toBeLessThan(6);
    }
  });

  it('ÇUKUR YOK — komşu bantlar arasında uçurum olmamalı', () => {
    /* "Sentetik" duyulmasının ana sebebi buydu: rezonatör yığınının
       aralarındaki boşlukları kulak hemen yakalıyor. */
    const olculen = bantlar(tusOrnegi(HIZ));
    for (let k = 2; k < 7; k++) {
      expect(Math.abs(olculen[k] - olculen[k - 1]),
        `bant ${k - 1} → ${k} arasında ${Math.abs(olculen[k] - olculen[k - 1]).toFixed(1)} dB uçurum`)
        .toBeLessThan(12);
    }
  });

  it('satır sonu tuştan UZUN ve ayrı bir ses', () => {
    const t = tusOrnegi(HIZ);
    const l = satirOrnegi(HIZ);
    expect(l.length).toBeGreaterThan(t.length * 2);
    let enerji = 0;
    for (let i = Math.round(0.3 * HIZ); i < Math.round(0.5 * HIZ); i++) enerji += l[i] * l[i];
    expect(enerji, 'tırmık ve durdurucu 300-500 ms arasında duyulmalı').toBeGreaterThan(1e-4);
  });

  it('silme tuştan DAHA KISIK', () => {
    const tepe = (x: Float32Array) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };
    /* Rastgelelik var; ortalama alınıyor ki test kararlı olsun. */
    const ort = (f: () => Float32Array) =>
      [0, 0, 0, 0, 0].reduce((a) => a + tepe(f()), 0) / 5;
    expect(ort(() => silOrnegi(HIZ))).toBeLessThan(ort(() => tusOrnegi(HIZ)));
  });
});
