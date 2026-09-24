import { describe, expect, it } from 'vitest';
import { BLOK_TIPLERI, type ScriptBlock } from '@storyboard/core/model/script';
import { bloklarToDoc, docToBloklar, senaryoSemasi } from '@storyboard/core/editor/sema';
import type { ScriptBlockType } from '@storyboard/core/model/script';

/** Onarım kanalını görmezden gelen kısayol — yalnız SAĞLAM belgelerde kullanılır. */
const bloklariniAl = (d: Parameters<typeof docToBloklar>[0]) => {
  const { bloklar, onarimlar } = docToBloklar(d);
  expect(onarimlar).toEqual([]);
  return bloklar;
};

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '1', sceneId: 'sc_1' });

const ORNEK: ScriptBlock[] = [
  blok('sb_1', 'scene', 'İÇ. MUTFAK - GECE'),
  blok('sb_2', 'action', 'Ayşe pencereyi açar.'),
  blok('sb_3', 'character', 'AYŞE'),
  blok('sb_4', 'dialogue', 'Hava soğumuş.'),
];

describe('senaryoSemasi', () => {
  it("tek bir blok düğümü tanımlar; tip attribute'tur", () => {
    expect(senaryoSemasi.nodes.blok).toBeDefined();
    expect(senaryoSemasi.nodes.blok.spec.attrs?.tip).toBeDefined();
    expect(senaryoSemasi.nodes.blok.spec.attrs?.id).toBeDefined();
  });

  it('id de tip de ZORUNLUDUR — varsayılanları yoktur (Karar 6)', () => {
    expect(senaryoSemasi.nodes.blok.spec.attrs?.id.default).toBeUndefined();
    expect(senaryoSemasi.nodes.blok.spec.attrs?.tip.default).toBeUndefined();
    expect(() => senaryoSemasi.node('blok', { id: 'sb_z' }, senaryoSemasi.text('metin')))
      .toThrow('No value supplied for attribute tip');
    expect(() => senaryoSemasi.node('blok', { tip: 'action' }, senaryoSemasi.text('metin')))
      .toThrow('No value supplied for attribute id');
  });

  it("toDOM data-id ve data-tip'i DOĞRU attribute'lara bağlar", () => {
    const dugum = senaryoSemasi.node('blok', { id: 'sb_1', tip: 'scene' }, senaryoSemasi.text('m'));
    const cikti = senaryoSemasi.nodes.blok.spec.toDOM!(dugum) as unknown as
      [string, Record<string, string>, number];
    expect(cikti[0]).toBe('p');
    expect(cikti[1]).toEqual({ 'data-id': 'sb_1', 'data-tip': 'scene' });
  });

  /* Küme `ScriptBlockType` birliğine `satisfies` ile bağlı; F7'de doküman
     tipleri eklenince birlik büyüdü ve küme onunla birlikte büyüdü. Test
     SAYI değil KAPSAM ölçüyor: senaryo çekirdeğinin altısı hâlâ içeride ve
     şemada her tipin bir düğümü var — biri eksik kalsaydı o tipte yazılan
     metin ProseMirror'a hiç giremezdi. */
  it('senaryo çekirdeğinin altısı BLOK_TIPLERI içinde', () => {
    for (const tip of ['action', 'character', 'dialogue', 'parenthetical', 'scene', 'transition']) {
      expect(BLOK_TIPLERI.has(tip)).toBe(true);
    }
  });

  it('F7 doküman tipi blokları da kümede', () => {
    for (const tip of ['bolum', 'paragraf', 'sayfa', 'kare', 'altyazi', 'balon', 'ses', 'muzik']) {
      expect(BLOK_TIPLERI.has(tip)).toBe(true);
    }
  });

  /* Şema tip başına DÜĞÜM tutmuyor; tek `blok` düğümü ve `tip` özniteliği
     var. Bu yüzden yeni bir doküman tipi şema değişikliği istemiyor —
     ama round-trip'in gerçekten kayıpsız olduğu ölçülmeli. */
  it('HER blok tipi şemadan kayıpsız geçiyor', () => {
    const bloklar = [...BLOK_TIPLERI].map((tip, i) => ({
      id: `b${i}`, fp: `f${i}`, type: tip as ScriptBlockType,
      text: `${tip} metni`, scene: '', sceneId: 'sc1',
    }));
    const geri = bloklariniAl(bloklarToDoc(bloklar));
    expect(geri.map((b) => b.type)).toEqual(bloklar.map((b) => b.type));
    expect(geri.map((b) => b.text)).toEqual(bloklar.map((b) => b.text));
  });
});

describe('gidiş-dönüş', () => {
  it('bloklar → doc → bloklar KAYIPSIZ', () => {
    const geri = bloklariniAl(bloklarToDoc(ORNEK));
    expect(geri.map((b) => [b.id, b.type, b.text, b.scene, b.sceneId]))
      .toEqual(ORNEK.map((b) => [b.id, b.type, b.text, b.scene, b.sceneId]));
  });

  it("KİMLİK düğüm attribute'unda taşınır — gidiş dönüşte değişmez", () => {
    const pmDoc = bloklarToDoc(ORNEK);
    const idler: string[] = [];
    pmDoc.forEach((n) => idler.push(n.attrs.id));
    expect(idler).toEqual(['sb_1', 'sb_2', 'sb_3', 'sb_4']);
  });

  it('fp DAİMA boş döner — parmak izi bu katmanın işi değil (Karar 2)', () => {
    expect(bloklariniAl(bloklarToDoc(ORNEK)).map((b) => b.fp)).toEqual(['', '', '', '']);
  });

  it('boş metinli blok kaybolmaz', () => {
    const geri = bloklariniAl(bloklarToDoc([blok('sb_b', 'action', '')]));
    expect(geri).toHaveLength(1);
    expect(geri[0].text).toBe('');
    expect(geri[0].id).toBe('sb_b');
  });

  it('TEK KARAKTERLİK metin kaybolmaz — sınırın kendisi', () => {
    const geri = bloklariniAl(bloklarToDoc([blok('sb_1k', 'action', '?')]));
    expect(geri).toHaveLength(1);
    expect(geri[0].text).toBe('?');
    expect(geri[0].id).toBe('sb_1k');
  });

  it('boş senaryo geçerli bir belge verir', () => {
    expect(bloklariniAl(bloklarToDoc([]))).toEqual([]);
  });

  it('Türkçe metin NFC olarak korunur', () => {
    const nfd = 'İÇ. MUTFAK'.normalize('NFD');
    const geri = bloklariniAl(bloklarToDoc([blok('sb_t', 'scene', nfd)]));
    expect(geri[0].text).toBe(geri[0].text.normalize('NFC'));
    expect(geri[0].text).toBe('İÇ. MUTFAK');
  });

  it('depoya NFC yazılır — normalizasyon GİRİŞ tarafında da yapılır', () => {
    const pmDoc = bloklarToDoc([blok('sb_t', 'scene', 'İÇ. MUTFAK'.normalize('NFD'))]);
    expect(pmDoc.firstChild?.textContent).toBe('İÇ. MUTFAK');
  });

  it('DEPODAN gelen NFD metin NFC olarak okunur — çıkış tarafı', () => {
    const nfd = 'İÇ. MUTFAK'.normalize('NFD');
    /* `bloklarToDoc`'tan GEÇMEDEN, doğrudan şemayla kur: depoyu başka bir istemci
       yazmış olabilir ve metni NFC'ye çevirmemiş olabilir. Sınıra dayanmak için
       belgenin gerçekten NFD taşıdığını da iddia et. */
    const depodan = senaryoSemasi.node('doc', null, [
      senaryoSemasi.node('blok', { id: 'sb_d', tip: 'scene' }, senaryoSemasi.text(nfd)),
    ]);
    expect(depodan.firstChild?.textContent).toBe(nfd);
    expect(depodan.firstChild?.textContent).not.toBe('İÇ. MUTFAK');
    expect(bloklariniAl(depodan)[0].text).toBe('İÇ. MUTFAK');
  });

  it('altı blok tipinin altısı da gidiş-dönüşten geçer', () => {
    const hepsi: ScriptBlock[] = ([
      'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
    ] as ScriptBlock['type'][]).map((t, i) => blok(`sb_${i}`, t, `metin ${i}`));
    expect(bloklariniAl(bloklarToDoc(hepsi)).map((b) => b.type))
      .toEqual(hepsi.map((b) => b.type));
  });

  it("tanınmayan tip taşıyan düğüm action'a düşer — sessizce yutulmaz", () => {
    const bozuk = senaryoSemasi.node('doc', null, [
      senaryoSemasi.node('blok', { id: 'sb_x', tip: 'SAÇMA', scene: '1', sceneId: 'sc_1' },
        senaryoSemasi.text('metin')),
    ]);
    const geri = bloklariniAl(bozuk);
    expect(geri[0].type).toBe('action');
    expect(geri[0].text).toBe('metin');
  });
});

describe('kimlik güven sınırı — ONARIR, reddetmez (Karar 10)', () => {
  const dugum = (id: unknown, metin = 'metin') =>
    senaryoSemasi.node('blok', { id, tip: 'action' }, senaryoSemasi.text(metin));

  it('YİNELENEN kimlikte İLK blok sahiptir, ikinci taze kimlik alır — metin KAYBOLMAZ', () => {
    const bozuk = senaryoSemasi.node('doc', null, [
      dugum('sb_1', 'birinci'), dugum('sb_1', 'ikinci'),
    ]);
    const { bloklar, onarimlar } = docToBloklar(bozuk);
    expect(bloklar[0].id).toBe('sb_1');            // ilk görülen sahiptir
    expect(bloklar[1].id).toBe('sb_1__2');
    expect(bloklar.map((b) => b.text)).toEqual(['birinci', 'ikinci']); // hiçbir metin kaybolmadı
    expect(onarimlar).toHaveLength(1);
    expect(onarimlar[0]).toMatchObject({ indeks: 1, bulunan: 'sb_1', atanan: 'sb_1__2', sebep: 'yinelenen' });
  });

  it('onarım kimliği TÜRETİLMİŞTİR, rastgele değil — iki okuyucu aynı sonuca varır', () => {
    /* `uid()` kullanılsaydı iki istemci aynı bozuk belgeden farklı kimlik
       üretir, panel bağı istemciden istemciye farklı satıra otururdu. */
    const bozuk = senaryoSemasi.node('doc', null, [dugum('sb_1'), dugum('sb_1')]);
    expect(docToBloklar(bozuk).bloklar.map((b) => b.id))
      .toEqual(docToBloklar(bozuk).bloklar.map((b) => b.id));
  });

  it('ÜÇ kez yinelenen kimlik üç ayrı kimliğe açılır', () => {
    const bozuk = senaryoSemasi.node('doc', null, [dugum('sb_1'), dugum('sb_1'), dugum('sb_1')]);
    const { bloklar } = docToBloklar(bozuk);
    expect(bloklar.map((b) => b.id)).toEqual(['sb_1', 'sb_1__2', 'sb_1__3']);
    expect(new Set(bloklar.map((b) => b.id)).size).toBe(3);
  });

  it('onarılmış kimlik BAŞKA bir gerçek kimlikle çakışmaz', () => {
    // Depoda zaten `sb_1__2` varsa onarım onu ezmemeli.
    const bozuk = senaryoSemasi.node('doc', null, [
      dugum('sb_1'), dugum('sb_1__2'), dugum('sb_1'),
    ]);
    const { bloklar } = docToBloklar(bozuk);
    expect(bloklar.map((b) => b.id)).toEqual(['sb_1', 'sb_1__2', 'sb_1__3']);
  });

  it('BOŞ kimlik onarılır ve raporlanır', () => {
    const bozuk = senaryoSemasi.node('doc', null, [dugum('sb_1'), dugum('')]);
    const { bloklar, onarimlar } = docToBloklar(bozuk);
    expect(bloklar[1].id).toBe('sb_onarilmis_1__2');
    expect(onarimlar[0]).toMatchObject({ indeks: 1, bulunan: '', sebep: 'kimliksiz' });
  });

  it('DİZGİ OLMAYAN kimlik de onarılır ve raporlanır', () => {
    const bozuk = senaryoSemasi.node('doc', null, [dugum(123)]);
    const { bloklar, onarimlar } = docToBloklar(bozuk);
    expect(bloklar[0].id).toBe('sb_onarilmis_0__2');
    expect(onarimlar[0]).toMatchObject({ indeks: 0, bulunan: 123, sebep: 'kimliksiz' });
  });

  it('scene/sceneId dizgi değilse boş dizgeye normalize edilir (Karar 7)', () => {
    /* Şema varsayılanı yalnız attribute HİÇ verilmediğinde devreye girer; açıkça
       `null` verilirse girmez — bu yüzden düşüşler ölü kod değil. */
    const bozuk = senaryoSemasi.node('doc', null, [
      senaryoSemasi.node('blok', { id: 'sb_n', tip: 'action', scene: null, sceneId: null },
        senaryoSemasi.text('metin')),
    ]);
    expect(bozuk.firstChild?.attrs.scene).toBeNull();
    const geri = bloklariniAl(bozuk);
    expect(geri[0].scene).toBe('');
    expect(geri[0].sceneId).toBe('');
    expect(geri[0].id).toBe('sb_n');
  });

  it('sağlam belgede onarım listesi BOŞTUR — yanlış alarm yok', () => {
    const { bloklar, onarimlar } = docToBloklar(bloklarToDoc(ORNEK));
    expect(bloklar).toHaveLength(4);
    expect(onarimlar).toEqual([]);
  });
});
