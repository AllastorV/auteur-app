import { describe, expect, it } from 'vitest';
import { IZGARA, KARAKTER_MM, SATIR_MM, kagitGeometrisi } from '@storyboard/core/format/izgara';

describe('Courier sabitleri', () => {
  it('yatayda 10 karakter/inç, dikeyde 6 satır/inç', () => {
    expect(KARAKTER_MM).toBeCloseTo(2.54, 6);
    expect(SATIR_MM).toBeCloseTo(25.4 / 6, 6);
  });

  it('ızgara 60 sütun × 55 satır', () => {
    expect(IZGARA.sutun).toBe(60);
    expect(IZGARA.satir).toBe(55);
  });
});

describe('kagitGeometrisi', () => {
  it('Letter türetimi sektör marjlarını birebir üretir', () => {
    const g = kagitGeometrisi('letter');
    expect(g.solMm).toBeCloseTo(38.1, 4);    // 1.5 in — cilt payı
    expect(g.sagMm).toBeCloseTo(25.4, 4);    // 1.0 in
    expect(g.ustMm).toBeCloseTo(25.4, 4);    // 1.0 in
    expect(g.altMm).toBeCloseTo(21.1667, 3); // 0.833 in — TÜRETİLİR
  });

  it('marjlar simetrik DEĞİLDİR — 55 satır alttan yer yer', () => {
    const g = kagitGeometrisi('letter');
    expect(g.altMm).toBeLessThan(g.ustMm);
    /* "Alt < üst" iddiası ALT MARJI SABİTE ÇEVİREN mutantı öldürmüyordu:
       21,1667 yerine 20 yazan bir kod da bu testi geçerdi. Fark TÜRETİMİN
       kendisidir — 25,4 − 21,1667 = 4,2333 mm — ve ancak sayıyla çivilenir. */
    expect(g.ustMm - g.altMm).toBeCloseTo(4.23333, 4);
  });

  it('A4 marjları esner ama metin bloğu Letter ile birebir aynıdır', () => {
    const letter = kagitGeometrisi('letter');
    const a4 = kagitGeometrisi('a4');
    expect(a4.metinGenislikMm).toBeCloseTo(letter.metinGenislikMm, 6);
    expect(a4.metinYukseklikMm).toBeCloseTo(letter.metinYukseklikMm, 6);
    expect(a4.solMm).toBeCloseTo(38.1, 4);
    expect(a4.sagMm).toBeCloseTo(19.5, 4);
    expect(a4.ustMm).toBeCloseTo(25.4, 4);
    expect(a4.altMm).toBeCloseTo(38.7667, 3);
  });

  it('metin bloğu tam olarak ızgara kadardır', () => {
    for (const k of ['letter', 'a4'] as const) {
      const g = kagitGeometrisi(k);
      expect(g.metinGenislikMm).toBeCloseTo(IZGARA.sutun * KARAKTER_MM, 6);
      expect(g.metinYukseklikMm).toBeCloseTo(IZGARA.satir * SATIR_MM, 6);
    }
  });

  /* `> 0` HİÇBİR MUTASYONU ÖLDÜRMÜYORDU: sağ marjı 1 mm, alt marjı 3 mm
     yapan bir türetme hatası da pozitif kalır ve testi geçerdi. Marjlar
     TAM DEĞERİYLE çivileniyor. */
  it('marjlar sayfaya sığar — DÖRT MARJ DA tam değeriyle', () => {
    const beklenen = {
      letter: { sol: 38.1, sag: 25.4, ust: 25.4, alt: 21.16667 },
      a4: { sol: 38.1, sag: 19.5, ust: 25.4, alt: 38.76667 },
    } as const;
    for (const k of ['letter', 'a4'] as const) {
      const g = kagitGeometrisi(k);
      expect(g.solMm, `${k} sol`).toBeCloseTo(beklenen[k].sol, 4);
      expect(g.sagMm, `${k} sağ`).toBeCloseTo(beklenen[k].sag, 4);
      expect(g.ustMm, `${k} üst`).toBeCloseTo(beklenen[k].ust, 4);
      expect(g.altMm, `${k} alt`).toBeCloseTo(beklenen[k].alt, 4);
      expect(g.solMm).toBeGreaterThan(0);
      expect(g.sagMm).toBeGreaterThan(0);
      expect(g.ustMm).toBeGreaterThan(0);
      expect(g.altMm).toBeGreaterThan(0);
    }
  });

  /* Marj + metin + marj = SAYFA. Bu kapanış iddiası, tek tek doğru görünen
     ama toplamı tutmayan (ör. sol marjı ölçüye katmayan) bir türetmeyi
     yakalar — sayısal tabloya bakan testler bunu göremez. */
  it('marj + metin + marj = sayfa — iki eksende de kapanıyor', () => {
    for (const k of ['letter', 'a4'] as const) {
      const g = kagitGeometrisi(k);
      expect(g.solMm + g.metinGenislikMm + g.sagMm, `${k} yatay`)
        .toBeCloseTo(g.sayfaGenislikMm, 6);
      expect(g.ustMm + g.metinYukseklikMm + g.altMm, `${k} dikey`)
        .toBeCloseTo(g.sayfaYukseklikMm, 6);
    }
  });

  /* Geometri SAF: aynı girdi her çağrıda birebir aynı nesneyi vermeli.
     Modül düzeyinde önbellek/mutasyon girse (ör. `sagMm` bir kez hesaplanıp
     ikinci kağıda taşınsa) ölçekte ıraksardı. */
  it('binlerce çağrıda değerler ıraksamıyor — türetme saf', () => {
    const ilkLetter = kagitGeometrisi('letter');
    const ilkA4 = kagitGeometrisi('a4');
    for (let i = 0; i < 2000; i++) {
      expect(kagitGeometrisi(i % 2 ? 'a4' : 'letter')).toEqual(i % 2 ? ilkA4 : ilkLetter);
    }
    // Dönen nesne PAYLAŞILMIYOR: çağıran onu değiştirirse sonraki çağrı bozulmaz.
    expect(kagitGeometrisi('letter')).not.toBe(ilkLetter);
  });

  it('bilinmeyen kağıt adında TANILAYAN hata verir', () => {
    // Ad neredeyse her zaman dışarıdan gelir (profil dosyası, içe aktarım).
    // Kontrol yoksa destructure `undefined`'dan okur ve "Cannot destructure
    // property 'g' of ..." gibi kaynağı göstermeyen bir TypeError düşer.
    expect(() => kagitGeometrisi('legal' as 'letter')).toThrow(/kagit/i);
    expect(() => kagitGeometrisi('legal' as 'letter')).toThrow(/legal/);
    /* Desen eşleşmesi mesajın SIRASINI ve biçimini serbest bırakıyordu;
       tam mesaj, tanılamayı bozan bir yeniden yazımı da yakalar. */
    expect(() => kagitGeometrisi('legal' as 'letter'))
      .toThrow('Bilinmeyen kagit: legal');
  });

  /* Ad DIŞARIDAN geliyor (profil dosyası, içe aktarım): dizge olmayan ya da
     tuzaklı her değer aynı tanılayan kapıdan geçmeli. `'letter'`in Türkçe
     büyük/küçük varyantları da AYRI anahtarlardır — sessizce eşlenmemeli. */
  it('bozuk kağıt adlarının HEPSİ fırlatıyor — sessiz varsayılan yok', () => {
    for (const kotu of ['', '   ', 'LETTER', 'Letter', 'a4 ', 'ı4', 'A4',
      null, undefined, 42, {}, [], 'letter\n']) {
      expect(() => kagitGeometrisi(kotu as 'letter'), String(kotu)).toThrow(/Bilinmeyen kagit/);
    }
  });

  /* PROTOTİP ANAHTARLARI — bulunan ve DÜZELTİLEN hata.
     `KAGIT` düz bir nesne sabiti; muhafız `if (!olcu)` diye baktığı sürece
     `Object.prototype` üzerinden gelen anahtarlar (`__proto__`,
     `constructor`, `toString`, `hasOwnProperty`, `valueOf`) o kontrolden
     DOĞRU sayılıp geçiyordu: hata hiç atılmıyor, destructure `undefined`
     veriyor, `sagMm`/`altMm` NaN çıkıyordu. İkinci muhafız da (`sagMm < 0`)
     NaN'da yanlış olduğu için açılıyordu — `pdf.ts` sayfayı NaN mm marjla
     açardı. Kağıt adı profil dosyasından/içe aktarımdan geldiği için bu bir
     güven sınırı. `hasOwnProperty` denetimiyle kapatıldı. */
  it('prototip anahtarları da fırlatıyor — NaN geometri sızmıyor', () => {
    for (const sizan of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(() => kagitGeometrisi(sizan as 'letter'), sizan).toThrow(/Bilinmeyen kagit/);
    }
  });

  it('kağıt kimliği ve sayfa kutusu doğru döner', () => {
    const beklenen = {
      letter: { g: 215.9, y: 279.4 },
      a4: { g: 210, y: 297 },
    } as const;
    for (const k of ['letter', 'a4'] as const) {
      const g = kagitGeometrisi(k);
      expect(g.kagit).toBe(k);
      expect(g.sayfaGenislikMm).toBeCloseTo(beklenen[k].g, 6);
      expect(g.sayfaYukseklikMm).toBeCloseTo(beklenen[k].y, 6);
    }
  });
});

describe('türetilen marjlar POZİTİF — metin kağıdın dışına çizilmez', () => {
  /* Sol ve üst marj kağıttan bağımsız SABİT; sağ ve alt onlardan türüyor.
     Kağıt metin bloğunu taşımıyorsa `sagMm` negatif çıkar ve `pdf.ts` sayfayı
     o genişlikte açıp metni dışarı çizer — hata yok, uyarı yok. A5 (148 mm)
     eklendiği an `sagMm = -42.5`. */
  /* `>= 0` sıfır marjı da geçirirdi — metin tam kenara dayanan bir sayfa
     baskıda kesilir. Marjlar KESİN olarak pozitif ve bilinen değerinde. */
  it('desteklenen kağıtlarda marjlar pozitif VE bilinen değerinde', () => {
    for (const kagit of ['letter', 'a4'] as const) {
      const g = kagitGeometrisi(kagit);
      expect(g.sagMm).toBeGreaterThan(0);
      expect(g.altMm).toBeGreaterThan(0);
    }
    expect(kagitGeometrisi('letter').sagMm).toBeCloseTo(25.4, 4);
    expect(kagitGeometrisi('a4').sagMm).toBeCloseTo(19.5, 4);
  });

  it('metin bloğu sığmayan kağıt FIRLATIYOR — sessizce dışarı çizilmiyor', () => {
    // A5 genişliği: 148 mm < 38,1 + 152,4. Tabloya eklenirse hemen patlamalı.
    const dar = { ...kagitGeometrisi('letter'), sayfaGenislikMm: 148 };
    const gereken = dar.solMm + dar.metinGenislikMm;
    /* `> 148` yalnız "biraz taşıyor" diyordu; taşma TAM 42,5 mm ve bu sayı
       kaynaktaki `sagMm = -42.5` uyarısının aynısı. Metin bloğu ya da sol
       marj değişirse bu sayı da değişmeli — gevşek eşitsizlik onu gizlerdi. */
    expect(gereken).toBeCloseTo(190.5, 6);
    expect(gereken - 148).toBeCloseTo(42.5, 6);
    expect(gereken).toBeGreaterThan(148);
  });
});
