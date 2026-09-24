import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { profilOlustur } from '@storyboard/core/format/profil';
import { blokSatirOfsetleri, sayfaSinirlari } from '@storyboard/core/format/ekran';
import { sayfala } from '@storyboard/core/format/sayfala';
import { bloklarToDoc, docToBloklar, senaryoSemasi } from '@storyboard/core/editor/sema';
import { kimlikOnarimEklentisi } from '@storyboard/core/editor/bag';
import { sayfaDurumu, sayfaEklentisi } from '@storyboard/core/editor/sayfa';
import { bloklar } from './yardim/agir-senaryo';

/**
 * TEST 3 — SAYFA GEÇİŞİ CANLI YAZARKEN (kullanıcı isteği).
 *
 * > "Senaryo yazılırken sayfalar arası geçiş (kaydırma, sayfa sınırı hesabı,
 * > imleç) sıkıntı çıkarıyor mu. Uzun belgede imleç kayıyor mu, sınır çizgisi
 * > kayıyor mu."
 *
 * İki ayrı kayma türü ölçülüyor ve KARIŞTIRILMIYOR:
 *
 * 1. **İmleç kayması** — yazarken imlecin bulunduğu BLOK değişmemeli ve
 *    konumu yazılan karakter sayısı kadar, ne eksik ne fazla ilerlemeli.
 *    Yeniden sayfalama imleci taşımamalı: sayfalama bir GÖRÜNÜM hesabıdır,
 *    belgeye dokunmaz.
 * 2. **Sınır kayması** — sayfa sınırının satır ofseti, kendisinden önceki
 *    sayfaların satır sayılarının toplamına EŞİT olmak zorunda. Bu toplam
 *    birikimlidir; tek bir sayfada bir satırlık hata, ondan sonraki BÜTÜN
 *    sınırları kaydırır (`sayfala.ts`'in `pre-wrap` notu aynı hatanın DOM
 *    tarafındaki hâlini anlatıyor).
 *
 * Ölçek 200 sayfa: kayma BİRİKİMLİ olduğu için kısa belgede görünmez.
 */

const profil = profilOlustur('amerikan', 'a4', 'tr');
const BLOK_SAYFA = 21;

function durum(n: number): EditorState {
  return EditorState.create({
    schema: senaryoSemasi,
    doc: bloklarToDoc(bloklar(n)),
    /* Kimlik onarım eklentisi de KURULU: gerçek editörde o da her yazımda
       koşuyor ve yazarken blok kimliğini değiştirseydi sayfa sınırı başka
       bir bloğa çapalanır, panel bağı kopardı. */
    plugins: [sayfaEklentisi(profil), kimlikOnarimEklentisi()],
  });
}

/** Sınır ofsetleri FİZİKSEL sayfa tepesine (satirSayisi katı) oturuyor mu. */
function sinirlarTutarli(state: EditorState): void {
  const d = sayfaDurumu(state)!;
  const sinirlar = sayfaSinirlari(d.sayfalar, profil.satirSayisi);
  expect(d.sinirlar).toEqual(sinirlar);
  for (let i = 0; i < d.sayfalar.length - 1; i++) {
    expect(d.sinirlar[i].satirOfseti, `sınır ${i + 1} kaydı`)
      .toBe((i + 1) * profil.satirSayisi);
    expect(d.sinirlar[i].blockId).toBe(d.sayfalar[i + 1].satirlar[0].blockId);
    expect(d.sinirlar[i].satirIndex).toBe(d.sayfalar[i + 1].satirlar[0].satirIndex);
  }
}

describe('TEST 3a — imleç canlı yazarken KAYMIYOR', () => {
  it('200 sayfalık belgede 400 karakter yazımı: imleç tam yazılan kadar ilerliyor', () => {
    let st = durum(200 * BLOK_SAYFA);
    const bloklarOnce = docToBloklar(st.doc).bloklar;

    /* İmleç belgenin ORTASINDAKİ bir bloğun içine konuyor: baştaki bir blok
       sayfa sonlarını hiç zorlamaz, sondaki blok ise kendisinden sonra
       kaydırılacak bir şey bırakmaz. */
    const hedefIndeks = Math.floor(bloklarOnce.length / 2);
    let konum = 1;
    st.doc.forEach((dugum, offset, i) => { if (i === hedefIndeks) konum = offset + 1; });
    st = st.apply(st.tr.setSelection(TextSelection.create(st.doc, konum)));

    const hedefKimlik = bloklarOnce[hedefIndeks].id;
    const YAZIM = 400;
    for (let i = 0; i < YAZIM; i++) {
      const yeni = st.tr.insertText('ş', st.selection.from);
      st = st.apply(yeni);
      /* Her tuşta iddia: imleç bir karakter ilerledi. Sona toplu bakmak,
         yolun ortasında zıplayıp geri gelen bir imleci kaçırırdı. */
      expect(st.selection.from, `tuş ${i}`).toBe(konum + i + 1);
    }

    const bloklarSonra = docToBloklar(st.doc).bloklar;
    /* İmlecin bloğu AYNI blok — kimlik yazımda değişmiyor. */
    expect(bloklarSonra[hedefIndeks].id).toBe(hedefKimlik);
    expect(bloklarSonra).toHaveLength(bloklarOnce.length);
    /* Yalnız o blok değişti: yeniden sayfalama komşu blokların METNİNE
       dokunmuyor. */
    for (let i = 0; i < bloklarOnce.length; i++) {
      if (i === hedefIndeks) continue;
      expect(bloklarSonra[i].text, `blok ${i} metni değişti`).toBe(bloklarOnce[i].text);
      expect(bloklarSonra[i].id).toBe(bloklarOnce[i].id);
    }
    expect(bloklarSonra[hedefIndeks].text).toBe('ş'.repeat(YAZIM) + bloklarOnce[hedefIndeks].text);
  }, 600_000);

  it('yalnız imleç hareket eden işlem sayfa durumunu yeniden KURMUYOR', () => {
    /* Yeniden kurulsaydı ok tuşuna basmak 200 sayfalık belgeyi baştan
       sayfalardı; kimlik karşılaştırması bunu ölçer. */
    const st = durum(200 * BLOK_SAYFA);
    const once = sayfaDurumu(st)!;
    const tasinmis = st.apply(st.tr.setSelection(TextSelection.create(st.doc, 500)));
    expect(sayfaDurumu(tasinmis)).toBe(once);
  }, 600_000);
});

describe('TEST 3b — sayfa sınırı canlı yazarken KAYMIYOR', () => {
  it('yazım sayfa sayısını büyütürken sınır ofsetleri kümülatif toplamla tutuyor', () => {
    let st = durum(200 * BLOK_SAYFA);
    sinirlarTutarli(st);
    const oncekiSayfa = sayfaDurumu(st)!.sayfalar.length;

    /* Belgenin ortasına bir sayfadan UZUN metin yazılıyor: bu, kendinden
       sonraki bütün sayfa sınırlarını kaydırmak zorunda. Kaymanın DOĞRU
       olduğunu iddia ediyoruz, olmadığını değil. */
    let konum = 1;
    st.doc.forEach((dugum, offset, i) => { if (i === 2000) konum = offset + 1; });
    const uzun = Array.from({ length: 900 }, (_, i) => `kelime${i}`).join(' ');
    st = st.apply(st.tr.insertText(uzun, konum));

    sinirlarTutarli(st);
    expect(sayfaDurumu(st)!.sayfalar.length).toBeGreaterThan(oncekiSayfa);
  }, 600_000);

  it('sayfa BAŞI blokları sınır listesiyle birebir aynı kümeden geliyor', () => {
    const st = durum(200 * BLOK_SAYFA);
    const d = sayfaDurumu(st)!;
    const beklenen = new Set(
      d.sinirlar.filter((s) => s.satirIndex === 0).map((s) => s.blockId),
    );
    expect([...d.sayfaBasi].sort()).toEqual([...beklenen].sort());
    /* Sayfa ORTASINDA bölünen blok sayfa başı SAYILMAZ: sayılsaydı onun
       önündeki boş satır ekranda düşer ve o sayfadan sonrası bir satır
       yukarı kayardı. */
    for (const s of d.sinirlar) {
      if (s.satirIndex > 0) expect(d.sayfaBasi.has(s.blockId)).toBe(false);
    }
  }, 600_000);

  it('kaydırma hedefi (blok → satır ofseti) ARTAN ve sınırlarla uyumlu', () => {
    /* "Sayfalar arası geçiş" ekranda bu haritayla yapılıyor: bir bloğa
       gitmek, onun satır ofsetini piksele çevirmek demek. Harita azalırsa
       gezgin kullanıcıyı yukarı fırlatır. */
    const st = durum(200 * BLOK_SAYFA);
    const d = sayfaDurumu(st)!;
    const ofsetler = blokSatirOfsetleri(d.sayfalar, profil.satirSayisi);
    const bs = docToBloklar(st.doc).bloklar;

    let onceki = -1;
    for (const b of bs) {
      const o = ofsetler.get(b.id);
      expect(o, `blok ${b.id} haritada yok`).toBeDefined();
      expect(o!, `blok ${b.id} ofseti geriye gitti`).toBeGreaterThan(onceki);
      onceki = o!;
    }

    /* Sınırın bloğu, sınırın satır ofsetiyle AYNI sayfada olmalı: sınır
       ofseti ile blok ofseti ayrı formüllerden gelseydi ikisi birbirinden
       kopar ve çizgi yanlış satıra düşerdi. */
    for (const s of d.sinirlar) {
      const blokOfset = ofsetler.get(s.blockId)!;
      expect(s.satirOfseti - blokOfset).toBe(s.satirIndex);
    }
  }, 600_000);

  it('yazarken sayfa sayısı motorun saf hesabıyla HER ADIMDA aynı kalıyor', () => {
    /* Editörün sayfa durumu ile saf `sayfala` ıraksarsa ekrandaki sayfa
       numarası ile PDF'teki farklı çıkar (Karar 34'ün kırılması). Uzun
       belgede yazarken bunu adım adım ölçüyoruz. */
    let st = durum(120 * BLOK_SAYFA);
    let konum = 1;
    st.doc.forEach((dugum, offset, i) => { if (i === 1200) konum = offset + 1; });
    for (let i = 0; i < 40; i++) {
      st = st.apply(st.tr.insertText('kelime kelime kelime kelime ', konum));
      const saf = sayfala(docToBloklar(st.doc).bloklar, profil);
      const d = sayfaDurumu(st)!;
      expect(d.sayfalar.length, `adım ${i}`).toBe(saf.length);
      expect(d.sayaclar.sayfa).toBe(saf.length);
      expect(d.sayfalar[d.sayfalar.length - 1].satirlar.length).toBe(
        saf[saf.length - 1].satirlar.length,
      );
    }
  }, 600_000);
});
