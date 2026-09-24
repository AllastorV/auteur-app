import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { bloklarToDoc, senaryoSemasi } from '@storyboard/core/editor/sema';
import { sayfaDurumu, sayfaEklentisi, secimSayaclari } from '@storyboard/core/editor/sayfa';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

const profil = (kagit: 'letter' | 'a4' = 'letter') => profilOlustur('amerikan', kagit, 'tr');

const blok = (i: number, type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${i}`, fp: '', type, text, scene: '', sceneId: '',
});

function durumla(bloklar: ScriptBlock[], p = profil()): EditorState {
  return EditorState.create({
    schema: senaryoSemasi,
    doc: bloklarToDoc(bloklar),
    plugins: [sayfaEklentisi(p)],
  });
}

const cokBlok = (n: number, tip: ScriptBlockType = 'action') =>
  Array.from({ length: n }, (_, i) => blok(i, tip, `Satir ${i} - bir miktar metin burada.`));

describe('sayfaEklentisi', () => {
  it('kurulumda sayfa durumunu üretir ve sayfa sayısı motorunkiyle aynıdır', () => {
    const bloklar = cokBlok(90);
    const state = durumla(bloklar);
    const d = sayfaDurumu(state)!;
    expect(d.sayfalar).toHaveLength(sayfala(bloklar, profil()).length);
    expect(d.sayaclar.sayfa).toBe(d.sayfalar.length);
    expect(d.sinirlar).toHaveLength(d.sayfalar.length - 1);
  });

  /* Belge değiştiğinde yeniden hesaplanmazsa sayaç ve sınırlar bayatlar:
     kullanıcı yazmaya devam eder, sayfa sayısı olduğu yerde kalır ve
     "1 sayfa ≈ 1 dakika" sözleşmesi ekranda yalan söyler. */
  it('belge değişince sayfa durumu tazelenir', () => {
    let state = durumla(cokBlok(50));
    const once = sayfaDurumu(state)!.sayaclar;
    const uzun = Array.from({ length: 300 }, (_, i) => `kelime${i}`).join(' ');
    state = state.apply(state.tr.insertText(uzun, 1));
    const sonra = sayfaDurumu(state)!.sayaclar;
    expect(sonra.kelime).toBeGreaterThan(once.kelime);
    expect(sonra.sayfa).toBeGreaterThan(once.sayfa);
  });

  /* Seçim ve imleç hareketi sayfa sayısını DEĞİŞTİRMEZ; her ok tuşunda tam
     sayfalama yapmak uzun senaryoda editörü kilitlerdi. Aynı nesnenin
     döndüğünü iddia etmek, yeniden hesaplanmadığını kanıtlar. */
  it('yalnız imleç hareket eden işlemde yeniden hesaplamaz', () => {
    const state = durumla(cokBlok(40));
    const once = sayfaDurumu(state)!;
    const tasinmis = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 5)),
    );
    expect(sayfaDurumu(tasinmis)).toBe(once);
  });

  it('kağıt değişse de ızgara sabit olduğu için sayfa sayısı kaymaz (§6.3)', () => {
    const bloklar = cokBlok(120);
    expect(sayfaDurumu(durumla(bloklar, profil('letter')))!.sayaclar.sayfa)
      .toBe(sayfaDurumu(durumla(bloklar, profil('a4')))!.sayaclar.sayfa);
  });
});

describe('sayfa başı işaretlemesi', () => {
  it('sayfayı BAŞLATAN blok işaretlenir, ortasında bölünen blok işaretlenmez', () => {
    // Sahne başlıkları dul kalmaz: sayfa başı bloklar hep blok sınırındadır.
    const bloklar = Array.from({ length: 200 }, (_, i) =>
      i % 6 === 0
        ? blok(i, 'scene', `IC. MEKAN ${i} - GECE`)
        : blok(i, 'dialogue', `Replik ${i} ve devami burada surer.`),
    );
    const d = sayfaDurumu(durumla(bloklar))!;
    for (const s of d.sinirlar) {
      expect(d.sayfaBasi.has(s.blockId)).toBe(s.satirIndex === 0);
    }
    expect(d.sayfaBasi.size).toBeGreaterThan(0);
  });

  /* Blok ORTASINDA bölünen sayfa, bloğu sayfa başı SAYMAZ: o bloğun önündeki
     boş satırlar önceki sayfada yer kaplamıştır. İşaretlenirse ekranda o
     boşluk düşer, DOM motordan bir-iki satır yukarı kayar ve sonraki bütün
     sınır çizgileri yanlış yere oturur. */
  it('tek dev bloğun ortasında bölünen sayfa hiçbir bloğu sayfa başı yapmaz', () => {
    const uzun = blok(0, 'action', Array.from({ length: 400 }, (_, i) => `kelime${i}`).join(' '));
    const d = sayfaDurumu(durumla([uzun]))!;
    expect(d.sinirlar.length).toBeGreaterThan(0);
    expect(d.sinirlar.every((s) => s.satirIndex > 0)).toBe(true);
    expect(d.sayfaBasi.size).toBe(0);
  });

  it('işaretlenen her blok için dekorasyon üretilir', () => {
    const bloklar = cokBlok(200);
    const state = durumla(bloklar);
    const d = sayfaDurumu(state)!;
    const dekorlar = d.dekorasyonlar.find();
    expect(dekorlar).toHaveLength(d.sayfaBasi.size);
    expect(d.sayfaBasi.size).toBeGreaterThan(0);
    for (const dek of dekorlar) {
      const dugum = state.doc.nodeAt(dek.from)!;
      expect(d.sayfaBasi.has(dugum.attrs.id as string)).toBe(true);
    }
  });
});

describe('secimSayaclari (§16.1)', () => {
  it('seçim yokken null döner — "seçili 0" seçim varmış gibi okunur', () => {
    const state = durumla([blok(0, 'action', 'bir iki üç')]);
    expect(secimSayaclari(state)).toBeNull();
  });

  it('seçili metnin kelime ve karakter sayısını verir', () => {
    const state = durumla([blok(0, 'action', 'bir iki üç dört')]);
    const secili = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1, 8)),
    );
    expect(secimSayaclari(secili)).toEqual({ kelime: 2, karakter: 7 });
  });

  /* Bloklar arası ayırıcı BOŞLUK olmalı: varsayılan boş dizge iki bloğun son
     ve ilk kelimesini birleştirir ve seçim bir kelime EKSİK sayılır. */
  it('blok sınırını aşan seçimde kelimeler birleşmez', () => {
    const state = durumla([blok(0, 'action', 'bir'), blok(1, 'action', 'iki')]);
    const hepsi = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size)),
    );
    expect(secimSayaclari(hepsi)!.kelime).toBe(2);
  });
});
