import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { senaryoCiz, isaretlileriSuz, araligiUygula } from '@storyboard/core/disa/pdf';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import { RENK_ZEMINI, ustbilgiMetni, type Revizyon } from '@storyboard/core/model/revizyon';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { icerikAkisi, metinKonumlari } from './yardim/pdf-konum';

/**
 * REVİZYON BASIMI — renkli sayfa, üstbilgi, değişim yıldızı.
 *
 * "Bir PDF üretildi" demiyor: üretilen PDF'in içerik akışını okuyup zeminin
 * GERÇEKTEN boyandığını, yıldızın GERÇEKTEN sağ kenar boşluğuna düştüğünü
 * ve süzgecin sayfa BÖLÜNMESİNİ değiştirmediğini ölçüyor.
 *
 * Senaryo metni üretilmiştir.
 */

const gerek = createRequire(import.meta.url);
const fontBayt = new Uint8Array(
  fs.readFileSync(
    path.join(
      path.dirname(
        gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf'),
      ),
      'CourierPrime_400Regular.ttf',
    ),
  ),
);

const profil = () => profilOlustur('amerikan', 'letter', 'tr');

let n = 0;
const b = (type: ScriptBlock['type'], text: string, sceneId: string): ScriptBlock =>
  ({ id: `b${++n}`, fp: `f${n}`, type, text, scene: '', sceneId });

/** Birden çok sayfaya taşacak kadar uzun, üretilmiş senaryo. */
function senaryo(): ScriptBlock[] {
  n = 0;
  const bloklar: ScriptBlock[] = [];
  for (let i = 1; i <= 6; i++) {
    const sid = `sc${i}`;
    bloklar.push(b('scene', `İÇ. ATÖLYE ${i} — GECE`, sid));
    for (let j = 0; j < 12; j++) {
      bloklar.push(b('action', `Torna tezgâhı döner, ${i}-${j}. Demir parçaya bakar.`, sid));
    }
  }
  return bloklar;
}

const REV: Revizyon = { id: 'rev1', ad: '', renk: 'mavi', tarih: Date.UTC(2026, 2, 12, 12) };

async function ciz(
  bloklar: readonly ScriptBlock[],
  revizyon?: Parameters<typeof senaryoCiz>[2]['revizyon'],
  aralik?: Parameters<typeof senaryoCiz>[2]['aralik'],
) {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const duz = await belge.embedFont(fontBayt, { subset: true });
  const sayfaSayisi = senaryoCiz(belge, bloklar, {
    profil: profil(),
    fontlar: { duz, kalin: duz, italik: duz },
    revizyon,
    aralik,
  });
  const geri = await PDFDocument.load(await belge.save());
  return { belge: geri, sayfaSayisi };
}

/**
 * Zeminin GERÇEKTEN o renkle boyandığı yer — akıştaki karakter konumu, yoksa -1.
 *
 * `re` ARANMIYOR: pdf-lib dikdörtgeni `m`/`l`/`h` yolu olarak yazıyor
 * (ölçüldü), `re` kısayolunu kullanmıyor. `re` arayan bir sınama HİÇBİR
 * ZAMAN eşleşmez ve `indexOf(' re') < indexOf('Tj')` gibi bir karşılaştırma
 * -1 döndüğü için BOŞUNA GEÇERDİ — testin kendisi sessiz bir yalan olurdu.
 */
function zeminKonumu(ops: string, zemin: readonly [number, number, number]): number {
  const re = /([\d.]+) ([\d.]+) ([\d.]+) rg([\s\S]{0,240}?)\nf\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) {
    const bulunan = m;
    const yakin = [1, 2, 3].every(
      (i) => Math.abs(parseFloat(bulunan[i]) - zemin[i - 1]) < 0.002,
    );
    if (yakin) return bulunan.index;
  }
  return -1;
}

const zeminVar = (ops: string, zemin: readonly [number, number, number]) =>
  zeminKonumu(ops, zemin) >= 0;

describe('revizyon verilmediğinde çıktı DEĞİŞMİYOR', () => {
  it('zemin boyanmıyor', async () => {
    const { belge } = await ciz(senaryo());
    expect(zeminVar(icerikAkisi(belge, 0), RENK_ZEMINI.mavi)).toBe(false);
    expect(zeminVar(icerikAkisi(belge, 0), RENK_ZEMINI.beyaz)).toBe(false);
  });

  it('sayfa bölünmesi revizyonluyla AYNI — üstbilgi metni aşağı itmiyor', async () => {
    const bloklar = senaryo();
    const dz = await ciz(bloklar);
    const rv = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set<string>(),
    });
    expect(rv.sayfaSayisi).toBe(dz.sayfaSayisi);

    /* İşaret yoksa üstbilgi de yok; aynı gövde aynı konumlarda kalır. */
    expect(metinKonumlari(rv.belge, 0)).toEqual(metinKonumlari(dz.belge, 0));
  });
});

describe('revizyon basımı', () => {
  it('yalnız işaretli sayfa renkli; boş ve aralık dışı sayfalar renksiz', async () => {
    const bloklar = senaryo();
    const tum = sayfala(bloklar, profil(), false);
    expect(tum.length).toBeGreaterThan(1);
    const id = tum[0].satirlar[0].blockId;
    const revizyon = {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([id]),
      yalnizIsaretli: false,
    };
    const { belge } = await ciz(bloklar, revizyon);
    expect(zeminVar(icerikAkisi(belge, 0), RENK_ZEMINI.mavi)).toBe(true);
    expect(zeminVar(icerikAkisi(belge, 1), RENK_ZEMINI.mavi)).toBe(false);
    const bos = await ciz(bloklar, { ...revizyon, isaretler: new Set<string>() });
    expect(zeminVar(icerikAkisi(bos.belge, 0), RENK_ZEMINI.mavi)).toBe(false);
    expect(araligiUygula(tum, { ilk: 2, son: 2 })[0].no).toBe(2);
    const aralik = await ciz(bloklar, revizyon, { ilk: 2, son: 2 });
    expect(aralik.sayfaSayisi).toBe(1);
    expect(zeminVar(icerikAkisi(aralik.belge, 0), RENK_ZEMINI.mavi)).toBe(false);
  });
  it('işaret yoksa hiçbir sayfanın zemini boyanmıyor', async () => {
    const { belge, sayfaSayisi } = await ciz(senaryo(), {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set<string>(),
    });
    expect(sayfaSayisi).toBeGreaterThan(1);
    for (let i = 0; i < sayfaSayisi; i++) {
      expect(zeminVar(icerikAkisi(belge, i), RENK_ZEMINI.mavi)).toBe(false);
    }
  });

  it('zemin metinden ÖNCE çiziliyor — metni örtmüyor', async () => {
    const bloklar = senaryo();
    const { belge } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([bloklar[0].id]),
    });
    const ops = icerikAkisi(belge, 0);
    const zemin = zeminKonumu(ops, RENK_ZEMINI.mavi);
    expect(zemin).toBeGreaterThanOrEqual(0);
    expect(zemin).toBeLessThan(ops.indexOf('Tj'));
  });

  it('üstbilgi metin bloğunun ÜSTÜNDE duruyor', async () => {
    const g = profil().geometri;
    const bloklar = senaryo();
    const { belge } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([bloklar[0].id]),
    });
    const konumlar = metinKonumlari(belge, 0);
    const ustSinir = (g.sayfaYukseklikMm - g.ustMm) * (72 / 25.4);
    expect(konumlar[0].y).toBeGreaterThan(ustSinir);
    /* Gövdenin İLK satırı üst marjın altında kalmalı. */
    expect(konumlar[1].y).toBeLessThanOrEqual(ustSinir);
  });

  it('üstbilgi metni revizyonun adını ve tarihini taşıyor', () => {
    expect(ustbilgiMetni(REV)).toBe('MAVİ REVİZYON · 12.03.2026');
    expect(ustbilgiMetni({ ...REV, ad: 'Çekim öncesi' })).toBe(
      'ÇEKİM ÖNCESİ REVİZYON · 12.03.2026',
    );
  });

  it('tarihsiz revizyonda tarih BASILMIYOR — 1970 uydurulmuyor', () => {
    expect(ustbilgiMetni({ ...REV, tarih: 0 })).toBe('MAVİ REVİZYON');
  });
});

describe('değişim yıldızı', () => {
  const yildizX = () => {
    const g = profil().geometri;
    return (g.solMm + g.metinGenislikMm + 4) * (72 / 25.4);
  };

  const yildizlar = (belge: PDFDocument) => {
    const hedef = yildizX();
    return metinKonumlari(belge, 0).filter((k) => Math.abs(k.x - hedef) < 0.5);
  };

  it('tek satırlık işaretli blok TEK yıldız alıyor', async () => {
    const bloklar = senaryo();
    const { belge } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([bloklar[0].id]),
    });
    expect(yildizlar(belge)).toHaveLength(1);
  });

  it('SATIR BAŞINA bir yıldız — sarılan blok her satırında işaretleniyor', async () => {
    const bloklar = senaryo();
    const sayfalar = sayfala(bloklar, profil(), false);
    const hedefId = bloklar[2].id;
    const satirSayisi = sayfalar[0].satirlar.filter((s) => s.blockId === hedefId).length;
    expect(satirSayisi).toBeGreaterThan(1);

    const { belge } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([hedefId]),
    });
    /* Sektörde değişim işareti SATIRA konur, bloğa değil: iki satırlık bir
       repliğin yalnız ilk satırını işaretlemek, ikinci satırın değişmediğini
       söylerdi. */
    expect(yildizlar(belge)).toHaveLength(satirSayisi);
  });

  it('işaret yoksa hiç çizilmiyor', async () => {
    const { belge } = await ciz(senaryo(), {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set<string>(),
    });
    expect(yildizlar(belge)).toHaveLength(0);
  });

  it('yıldız metin bloğunun DIŞINDA — gövde satırlarını kısaltmıyor', async () => {
    const bloklar = senaryo();
    const isaretsiz = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([bloklar[0].id]),
    });
    const isaretli = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([bloklar[0].id, bloklar[2].id]),
    });
    expect(isaretli.sayfaSayisi).toBe(isaretsiz.sayfaSayisi);

    const hedef = yildizX();
    const govde = (belge: PDFDocument) =>
      metinKonumlari(belge, 0).filter((k) => Math.abs(k.x - hedef) >= 0.5);
    expect(govde(isaretli.belge)).toEqual(govde(isaretsiz.belge));
  });
});

describe('yalnız işaretli sayfalar', () => {
  const bloklar = senaryo();
  const tumSayfalar = sayfala(bloklar, profil(), false);

  it('işaretli blok taşımayan sayfa basılmıyor', async () => {
    const sonSayfa = tumSayfalar[tumSayfalar.length - 1];
    const isaret = new Set([sonSayfa.satirlar.find((s) => s.blockId)!.blockId]);

    const { sayfaSayisi } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: isaret,
      yalnizIsaretli: true,
    });
    expect(tumSayfalar.length).toBeGreaterThan(1);
    expect(sayfaSayisi).toBe(1);
  });

  it('süzgeç sayfa BÖLÜNMESİNİ değiştirmiyor — numaralar belgenin numaraları', () => {
    const isaret = new Set([tumSayfalar[tumSayfalar.length - 1].satirlar[0].blockId]);
    const suzulmus = isaretlileriSuz(tumSayfalar, isaret);
    expect(suzulmus).toHaveLength(1);
    expect(suzulmus[0].no).toBe(tumSayfalar.length);
  });

  it('hiç işaret yoksa hiçbir sayfa basılmıyor — sessizce tamamı basılmıyor', async () => {
    const { sayfaSayisi } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set<string>(),
      yalnizIsaretli: true,
    });
    expect(sayfaSayisi).toBe(0);
  });

  it('kapalıyken bütün sayfalar basılıyor', async () => {
    const { sayfaSayisi } = await ciz(bloklar, {
      zemin: RENK_ZEMINI.mavi,
      ustbilgi: ustbilgiMetni(REV),
      isaretler: new Set([bloklar[0].id]),
      yalnizIsaretli: false,
    });
    expect(sayfaSayisi).toBe(tumSayfalar.length);
  });
});

describe('palet — ölçüm paletle birlikte yaşamalı', () => {
  const parlaklik = ([r, g, bl]: readonly [number, number, number]) => {
    const c = [r, g, bl].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };

  it('her zemin siyah metinle en az 10:1 kontrast veriyor', () => {
    for (const [ad, zemin] of Object.entries(RENK_ZEMINI)) {
      const kontrast = (parlaklik(zemin) + 0.05) / 0.05;
      expect(kontrast, `${ad} kontrastı`).toBeGreaterThanOrEqual(10);
    }
  });

  it('hiçbir zemin sınırın dışına çıkmıyor', () => {
    for (const zemin of Object.values(RENK_ZEMINI)) {
      for (const kanal of zemin) {
        expect(kanal).toBeGreaterThanOrEqual(0);
        expect(kanal).toBeLessThanOrEqual(1);
      }
    }
  });
});
