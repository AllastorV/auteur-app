import { describe, expect, it } from 'vitest';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { profilOlustur, sutunGenisligi } from '@storyboard/core/format/profil';
import { IZGARA } from '@storyboard/core/format/izgara';
import {
  SARMA_ONBELLEK_TAVANI, sarmaOnbelleginiTemizle, sarmala, sayfala,
} from '@storyboard/core/format/sayfala';

const profil = profilOlustur('amerikan', 'a4', 'tr');

/**
 * `AMERIKAN_BLOKLAR` Readonly'dir; `yeniSayfada` kuralini sinamak icin
 * profili genisleten duz bir nesne literali kuruyoruz (Karar 12).
 */
const zorlayanProfil = (tip: ScriptBlock['type']) => ({
  ...profil,
  bloklar: { ...profil.bloklar, [tip]: { ...profil.bloklar[tip], yeniSayfada: true } },
});

const blok = (
  id: string, type: ScriptBlock['type'], text: string,
): ScriptBlock => ({ id, fp: id, type, text, scene: '1', sceneId: 'sc_1' });

describe('sarmala', () => {
  it('sütuna sığan metni bölmez', () => {
    expect(sarmala('kısa satır', 60)).toEqual(['kısa satır']);
  });

  it('kelime sınırında sarar', () => {
    expect(sarmala('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('sütuna sığmayan tek kelimeyi böler — taşırmaz', () => {
    const satirlar = sarmala('aaaaaaaaaa', 4);
    expect(satirlar).toEqual(['aaaa', 'aaaa', 'aa']);
  });

  it('boş metin bir boş satır verir — blok kaybolmaz', () => {
    expect(sarmala('', 60)).toEqual(['']);
  });

  it('hiçbir satır sütunu aşmaz', () => {
    const uzun = 'kelime '.repeat(50).trim();
    for (const s of sarmala(uzun, 35)) expect(s.length).toBeLessThanOrEqual(35);
  });

  /* --- ek korumalar: birleştirme dalını ve bölme sırasını çivile --- */

  it('birleştirmede aradaki boşluğu sayar — sınırda taşırmaz', () => {
    // 3 + 1 + 3 = 7 > 6 → birleşemez. Boşluk sayılmazsa 7 karakterlik satır çıkar.
    expect(sarmala('aaa bbb', 6)).toEqual(['aaa', 'bbb']);
    expect(sarmala('aaa bbb', 7)).toEqual(['aaa bbb']);
  });

  it('uzun kelimeyi bölmeden önce biriken satırı yazar — sıra bozulmaz', () => {
    expect(sarmala('aa bbbbbb', 4)).toEqual(['aa', 'bbbb', 'bb']);
  });

  it('yalnızca boşluktan oluşan metin de bir satır verir — blok kaybolmaz', () => {
    expect(sarmala('   ', 60)).toEqual(['']);
  });

  /* BU TEST ESKİDEN HATAYI ÇİVİLİYORDU. `['aaa bbb']` bekliyordu, yani
     motorun ardışık boşlukları tek boşluğa indirmesini DOĞRU sayıyordu.
     Ölçüldü (e2e, gerçek Chromium): tarayıcı `pre-wrap` ile boşlukları
     koruyor ve aynı metni bir satır FAZLA çiziyor; sayfa sınırı her böyle
     blokta kayıyor ve kayma birikimli (§17 borcu). */
  it('ardışık boşluk genişliğe SAYILIYOR — tarayıcıyla aynı', () => {
    // 'aaa' + 4 boşluk = 7 sütunu tam doldurur; 'bbb' sığmaz.
    expect(sarmala('aaa    bbb', 7)).toEqual(['aaa', 'bbb']);
  });

  it('satır sonundaki boşluklar SARKAR — erken kırmaz', () => {
    /* Beş boşluk sütunu aşıyor ama satırı kırmıyor: CSS bunu "hanging white
       space" diye adlandırır. Sarkma olmasaydı satır sonuna basılan her
       boşluk satırı kırar, yazarken imleç bir alt satıra zıplardı. */
    expect(sarmala('aaa     ', 5)).toEqual(['aaa']);
  });

  it('kırılan satırın başına boşluk taşınmıyor', () => {
    expect(sarmala('aaa   bbb', 4)).toEqual(['aaa', 'bbb']);
  });

  /* --- ön koşul muhafızı (Karar 25): kamusal sınırda argüman doğrulaması --- */

  it('kullanılamaz sütunla FIRLATIR — sonsuz döngü yerine hata', () => {
    // `sarmala` barrel'dan dışa aktarılıyor, yani kamusal sınır. Muhafız
    // yoksa sutun <= 0 sonsuz döngü üretir: uygulama donar ve kullanıcının
    // kaydedilmemiş işi gider. `expect(...).toThrow()` sarmalayıcısı olmadan
    // bu çağrılar süitin kendisini asardı.
    expect(() => sarmala('kelime kelime', 0)).toThrow(/tam sayi ve en az 1/);
    expect(() => sarmala('kelime kelime', -3)).toThrow(/tam sayi ve en az 1/);
    // Kesirli sütun sonsuz döngü ÜRETMEZ ama ızgara dışıdır — sessizce
    // kabul edilirse satır genişliği ızgaraya oturmaz.
    expect(() => sarmala('kelime kelime', 2.5)).toThrow(/tam sayi ve en az 1/);
    // Mesaj tanılayıcı: reddedilen değeri taşır.
    expect(() => sarmala('x', -3)).toThrow(/-3/);
    // Sınırın doğru yerde olduğunu kanıtla: 1 sütun geçerlidir ve çalışır.
    expect(sarmala('ab', 1)).toEqual(['a', 'b']);
  });

  /* --- NFC normalizasyonu (K-1): iki AYRI kusur, ayrı ayrı sınanır --- */

  it('NFD Türkçe harf TEK karakter sayılır — sütun sınırında taşmaz', () => {
    // Kusur (a): genişlik UTF-16 kod birimiyle ölçülüyordu. Sınıra fiilen
    // DAYANIYORUZ: 60 'ş' NFC'de tam 60 kod birimi = aksiyon sütununun
    // TAMAMI, tek satır. NFD'de aynı metin 120 kod birimi eder ve normalize
    // edilmezse İKİ satıra bölünür — bir satırlık sapma sayfa sınırını kaydırır.
    const tamSutun = 'ş'.repeat(60);
    expect(tamSutun).toHaveLength(IZGARA.sutun);
    expect(tamSutun.normalize('NFD')).toHaveLength(IZGARA.sutun * 2);
    expect(sarmala(tamSutun.normalize('NFD'), IZGARA.sutun)).toEqual([tamSutun]);
    // Bir karakter fazlası gerçekten taşar: sınırın doğru yerde olduğunu kanıtlar.
    expect(sarmala(`${tamSutun}ş`.normalize('NFD'), IZGARA.sutun)).toHaveLength(2);
  });

  it('sarma birleşik işareti taban harfinden KOPARMAZ', () => {
    // Kusur (b): normalize edilmezse 35. kod birimi taban 's' oluyor ve
    // ikinci satır yalnız birleşik sedille (U+0327) başlıyordu.
    const satirlar = sarmala('ş'.repeat(40).normalize('NFD'), 35);
    expect(satirlar).toEqual(['ş'.repeat(35), 'ş'.repeat(5)]);
    // Hiçbir satır birleşik işaretle başlamaz — bozuk karakter sızmaz.
    for (const s of satirlar) expect(s).not.toMatch(/^\p{M}/u);
  });
});

describe('sayfala', () => {
  it('boş senaryo tek boş sayfa verir', () => {
    const sayfalar = sayfala([], profil);
    expect(sayfalar).toHaveLength(1);
    expect(sayfalar[0].satirlar).toHaveLength(0);
  });

  it('hiçbir sayfa ızgara satır sayısını aşmaz — iç muhafız fiilen tetiklenir', () => {
    // Tek satırlık bloklar `gerekli` kontrolüyle 55'e oturuyor ve döngü içindeki
    // muhafızı hiç görmüyordu. 8 satırlık diyalog blokları sayfayı blok
    // ORTASINDA doldurur; taşımayı yalnız iç muhafız engeller.
    const uzun = 'kelime '.repeat(40).trim();
    const bloklar = Array.from({ length: 30 }, (_, i) => blok(`b${i}`, 'dialogue', uzun));
    const sayfalar = sayfala(bloklar, profil);
    for (const s of sayfalar) {
      expect(s.satirlar.length).toBeLessThanOrEqual(IZGARA.satir);
    }
    // Muhafızın gerçekten koştuğunu kanıtla: dolu bir sayfa blok ortasında bitiyor.
    const bolunmus = sayfalar.some((s, i) => {
      const son = s.satirlar[s.satirlar.length - 1];
      return s.satirlar.length === IZGARA.satir && i + 1 < sayfalar.length
        && sayfalar[i + 1].satirlar[0].blockId === son.blockId;
    });
    expect(bolunmus).toBe(true);
  });

  it('AYNI SENARYO İKİ KAĞITTA AYNI SAYFA SAYISINI VERİR', () => {
    // Dolgu, boş satır üretmeyen TEK satırlık diyalog: sayfa kadansı 1 satıra
    // iner, böylece ızgaradaki TEK satırlık bir sapma bile sayfa sınırını
    // kaydırır. Karışık dolguda kadans 2 olduğu için 54/55 farkı hiç bağlayıcı
    // olmuyordu — STARC'ın hatası (Letter 60x54, A4 61x59) tam buradan sızar.
    // 385 = 55 x 7: taban tam 7 sayfa; 54 satırlık bir kağıt 8 sayfa verir.
    //
    // SÜTUN ekseni de kağıttan bağımsızdır (STARC: Letter 60x54, A4 *61*x59).
    // Kısa dolgu 60 mü 61 mi olduğunu göremez; sona SÜTUN SINIRINA oturan bir
    // blok ekliyoruz: 30+1+30 = 61 karakter → 60 sütunda 2 satır, 61'de 1.
    const sinir = `${'a'.repeat(30)} ${'b'.repeat(30)}`;
    const bloklar = [
      ...Array.from({ length: IZGARA.satir * 7 }, (_, i) =>
        blok(`b${i}`, 'dialogue', `Replik ${i} burada.`)),
      blok('sb_sinir', 'action', sinir),
    ];
    expect(sinir).toHaveLength(IZGARA.sutun + 1);
    const letter = sayfala(bloklar, profilOlustur('amerikan', 'letter', 'en'));
    const a4 = sayfala(bloklar, profilOlustur('amerikan', 'a4', 'tr'));
    expect(letter).toHaveLength(8);
    expect(a4).toHaveLength(letter.length);
    for (const s of letter.slice(0, 7)) expect(s.satirlar).toHaveLength(IZGARA.satir);
    // Sınır bloğu son sayfada 2 satır eder — 61 sütunluk bir kağıtta 1 ederdi.
    expect(letter[7].satirlar.map((r) => r.metin)).toEqual(['a'.repeat(30), 'b'.repeat(30)]);
    // Sayfa SAYISI yetmez: satır sayısı sapması sayfa sayısını koruyup sayfa
    // sınırını kaydırabilir (56'ya karşı 55 böyledir). Döküm de aynı olmalı.
    expect(a4).toEqual(letter);
  });

  it('diyalog dar sütuna göre sarılır — tam genişlik kullanılmaz', () => {
    const uzun = 'kelime '.repeat(30).trim();
    const [sayfa] = sayfala([blok('sb_d', 'dialogue', uzun)], profil);
    for (const s of sayfa.satirlar) expect(s.metin.length).toBeLessThanOrEqual(35);
    expect(sayfa.satirlar.length).toBeGreaterThan(
      Math.ceil(uzun.length / IZGARA.sutun));
  });

  it('her satır kaynak bloğunu taşır — panel bağı sayfada da izlenebilir', () => {
    const [sayfa] = sayfala([blok('sb_1', 'action', 'Tek satir.')], profil);
    expect(sayfa.satirlar[0].blockId).toBe('sb_1');
  });

  it('büyük harf kuralı satır metnine uygulanır', () => {
    const [sayfa] = sayfala([blok('sb_1', 'character', 'ayşe')], profil);
    expect(sayfa.satirlar[0].metin).toBe('AYŞE');
  });

  it('sahne başlığı sayfanın son satırı olmaz — belgenin son bloğu hariç', () => {
    // Dolgu, sahne bloğu geldiğinde sayfada 52 satır bırakacak biçimde
    // ayarlandı: dul kuralı olmadan (2 boş + 1 başlık) tam 55'e oturur ve
    // başlık sayfanın son satırı olur. Brief'in 53'lük dolgusu kuralı hiç
    // tetiklemiyordu (Adım 5b'nin izin verdiği ayar).
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 54; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_ayar', 'dialogue', 'Ayar.'));
    bloklar.push(blok('sb_sahne', 'scene', 'İÇ. MUTFAK - GECE'));
    bloklar.push(blok('sb_son', 'action', 'Devam.'));
    const sayfalar = sayfala(bloklar, profil);
    for (const s of sayfalar) {
      const son = s.satirlar[s.satirlar.length - 1];
      if (son) expect(son.tip).not.toBe('scene');
    }
    // Dolgunun gerçekten sınıra dayandığını kanıtla: kural olmasa sığardı.
    const sahneSayfa = sayfalar.findIndex(
      (s) => s.satirlar.some((r) => r.blockId === 'sb_sahne'));
    expect(sayfalar[sahneSayfa].satirlar[0].blockId).toBe('sb_sahne');
    expect(sayfalar[sahneSayfa - 1].satirlar).toHaveLength(52);
  });

  it('ÇOK SATIRLI sahne başlığı sayfanın son satırı olmaz (son blok hariç) — bütünüyle taşınır', () => {
    // Tek satırlık başlıkta `govde.length === 1` olduğu için dul kuralındaki
    // `govde.length` çarpanı ölçülmüyordu. 67 karakterlik başlık 60 sütunda
    // İKİ satıra sarar; dolgu ÖLÇÜLEREK seçildi (54 → sayfa 51 satırda):
    // taban gerekli = 2 boş + 2 gövde + 1 = 5 → 56 > 55, sayfa çevrilir.
    // Çarpan 1'e düşerse gerekli 4 olur, 51+4 = 55 tam oturur ve başlığın
    // ikinci satırı sayfanın son satırı olur.
    const baslik = `İÇ. ${'KORIDOR '.repeat(8).trim()}`;
    // Kaynak BÜYÜK HARFE ÇEVRİLMİŞ metni sarar; iddia da onun üzerinde olmalı.
    expect(sarmala(baslik.toLocaleUpperCase(profil.dil),
      sutunGenisligi(profil.bloklar.scene!))).toHaveLength(2);
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 54; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_s', 'scene', baslik));
    bloklar.push(blok('sb_son', 'action', 'Devam.'));
    const sayfalar = sayfala(bloklar, profil);
    for (const s of sayfalar) {
      const son = s.satirlar[s.satirlar.length - 1];
      if (son) expect(son.tip).not.toBe('scene');
    }
    const idx = sayfalar.findIndex((s) => s.satirlar.some((r) => r.blockId === 'sb_s'));
    expect(sayfalar[idx - 1].satirlar).toHaveLength(51);
    // Başlık yeni sayfada BÜTÜN olarak başlar: iki gövde satırı da burada.
    expect(sayfalar[idx].satirlar.slice(0, 2).map((r) => [r.blockId, r.satirIndex])).toEqual([
      ['sb_s', 0], ['sb_s', 1],
    ]);
  });

  it('karakter adı sayfanın son satırı olmaz — belgenin son bloğu hariç', () => {
    // Dolgu, karakter bloğu geldiğinde sayfada 53 satır bırakır: dul kuralı
    // olmadan (1 boş + 1 ad) tam 55'e oturur.
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 55; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_k', 'character', 'AYŞE'));
    bloklar.push(blok('sb_d', 'dialogue', 'Merhaba.'));
    const sayfalar = sayfala(bloklar, profil);
    for (const s of sayfalar) {
      const son = s.satirlar[s.satirlar.length - 1];
      if (son) expect(son.tip).not.toBe('character');
    }
    const kSayfa = sayfalar.findIndex(
      (s) => s.satirlar.some((r) => r.blockId === 'sb_k'));
    expect(sayfalar[kSayfa].satirlar[0].blockId).toBe('sb_k');
    expect(sayfalar[kSayfa - 1].satirlar).toHaveLength(53);
  });

  it('ÇOK SATIRLI karakter adı sayfanın son satırı olmaz (son blok hariç) — bütünüyle taşınır', () => {
    // Sahne ikizinin karakter tarafı: karakter sütunu 40, 45 karakterlik ad
    // iki satır sarar. Dolgu ÖLÇÜLEREK seçildi (54 aksiyon + 1 diyalog parite
    // kaydırıcısı → sayfa 52 satır): taban gerekli = 1 boş + 2 gövde + 1 = 4
    // → 56 > 55, sayfa çevrilir. Çarpan 1'e düşerse gerekli 3 olur, 52+3 = 55
    // tam oturur ve adın ikinci satırı sayfanın son satırı olur.
    const ad = 'AYŞE (TELEFONDAN, UZAKTAN VE BOĞUK BİR SESLE)';
    expect(sarmala(ad.toLocaleUpperCase(profil.dil),
      sutunGenisligi(profil.bloklar.character!))).toHaveLength(2);
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 54; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_ayar', 'dialogue', 'Ayar.'));
    bloklar.push(blok('sb_k2', 'character', ad));
    bloklar.push(blok('sb_d2', 'dialogue', 'Merhaba.'));
    const sayfalar = sayfala(bloklar, profil);
    for (const s of sayfalar) {
      const son = s.satirlar[s.satirlar.length - 1];
      if (son) expect(son.tip).not.toBe('character');
    }
    const idx = sayfalar.findIndex((s) => s.satirlar.some((r) => r.blockId === 'sb_k2'));
    expect(sayfalar[idx - 1].satirlar).toHaveLength(52);
    expect(sayfalar[idx].satirlar.slice(0, 2).map((r) => [r.blockId, r.satirIndex])).toEqual([
      ['sb_k2', 0], ['sb_k2', 1],
    ]);
  });

  it('sayfa boş satırla başlamaz', () => {
    const bloklar = Array.from({ length: 200 }, (_, i) =>
      blok(`b${i}`, 'action', `Satir ${i}.`));
    for (const s of sayfala(bloklar, profil)) {
      if (s.satirlar.length) expect(s.satirlar[0].metin).not.toBe('');
    }
  });

  it('saf fonksiyondur — aynı girdi aynı çıktı', () => {
    const bloklar = [blok('sb_1', 'action', 'Tek satir.')];
    expect(sayfala(bloklar, profil)).toEqual(sayfala(bloklar, profil));
  });

  /* --- ek korumalar --- */

  it('sayfa içinde boş ayırıcı satır üretilir ve negatif satirIndex taşır', () => {
    const sayfalar = sayfala(
      [blok('sb_1', 'action', 'Bir.'), blok('sb_2', 'action', 'Iki.')], profil);
    expect(sayfalar).toHaveLength(1);
    expect(sayfalar[0].satirlar).toEqual([
      { blockId: 'sb_1', tip: 'action', satirIndex: 0, metin: 'Bir.' },
      { blockId: 'sb_2', tip: 'action', satirIndex: -1, metin: '' },
      { blockId: 'sb_2', tip: 'action', satirIndex: 0, metin: 'Iki.' },
    ]);
  });

  it('sahne başlığından önce iki boş satır bırakılır', () => {
    const sayfalar = sayfala(
      [blok('sb_1', 'action', 'Bir.'), blok('sb_s', 'scene', 'İÇ. EV - GÜN')], profil);
    expect(sayfalar[0].satirlar.map((s) => [s.satirIndex, s.metin])).toEqual([
      [0, 'Bir.'], [-1, ''], [-2, ''], [0, 'İÇ. EV - GÜN'],
    ]);
  });

  it('sayfa numaraları 1den başlar ve ardışıktır', () => {
    const bloklar = Array.from({ length: 200 }, (_, i) =>
      blok(`b${i}`, 'action', `Satir ${i}.`));
    const sayfalar = sayfala(bloklar, profil);
    expect(sayfalar.length).toBeGreaterThan(1);
    expect(sayfalar.map((s) => s.no)).toEqual(sayfalar.map((_, i) => i + 1));
  });

  it('çok satırlı blok sayfa sınırında bölünür — bütünüyle sonraki sayfaya atılmaz', () => {
    const bloklar = [
      blok('sb_dolgu', 'action', 'Dolgu.'),
      blok('sb_uzun', 'action', 'kelime '.repeat(800).trim()),
    ];
    const sayfalar = sayfala(bloklar, profil);
    expect(sayfalar[0].satirlar).toHaveLength(IZGARA.satir);
    expect(sayfalar[0].satirlar[0].blockId).toBe('sb_dolgu');
    expect(sayfalar[0].satirlar[IZGARA.satir - 1].blockId).toBe('sb_uzun');
    expect(sayfalar[1].satirlar[0].blockId).toBe('sb_uzun');
    expect(sayfalar[1].satirlar[0].satirIndex).toBeGreaterThan(0);
  });

  it('boş olmayan senaryoda boş sayfa üretmez', () => {
    const sayfalar = sayfala(
      [blok('sb_s', 'scene', 'kelime '.repeat(800).trim())], profil);
    expect(sayfalar.length).toBeGreaterThan(1);
    for (const s of sayfalar) expect(s.satirlar.length).toBeGreaterThan(0);
  });

  it('büyük harf kuralı olmayan blokta metin aynen kalır', () => {
    const [sayfa] = sayfala([blok('sb_1', 'action', 'Ayşe içeri girer.')], profil);
    expect(sayfa.satirlar[0].metin).toBe('Ayşe içeri girer.');
  });

  it('geçiş satırı boşlukla doldurulmaz — hiza render katmanının işi', () => {
    const [sayfa] = sayfala([blok('sb_g', 'transition', 'kes:')], profil);
    expect(sayfa.satirlar).toHaveLength(1);
    expect(sayfa.satirlar[0].metin).toBe('KES:');
  });

  it('diyalog sütunu tam 35 karakter — daha dar değil', () => {
    const [sayfa] = sayfala([blok('sb_d', 'dialogue', 'a'.repeat(35))], profil);
    expect(sayfa.satirlar.map((s) => s.metin)).toEqual(['a'.repeat(35)]);
  });

  it('karakter sütunu tam 40, parantez 30, geçiş 55 karakter', () => {
    // Büyük harf kuralı olan tiplerle karışmasın diye girdi zaten büyük.
    const tam = (tip: ScriptBlock['type'], n: number) =>
      sayfala([blok('sb_x', tip, 'A'.repeat(n))], profil)[0].satirlar.map((s) => s.metin);
    expect(tam('character', 40)).toEqual(['A'.repeat(40)]);
    expect(tam('parenthetical', 30)).toEqual(['A'.repeat(30)]);
    expect(tam('transition', 55)).toEqual(['A'.repeat(55)]);
    expect(tam('action', 60)).toEqual(['A'.repeat(60)]);
  });

  it('boş metinli blok bir satır üretir — blok sayfadan silinmez', () => {
    const [sayfa] = sayfala([blok('sb_bos', 'action', '')], profil);
    expect(sayfa.satirlar).toEqual([
      { blockId: 'sb_bos', tip: 'action', satirIndex: 0, metin: '' },
    ]);
  });

  it('girdi bloklarını değiştirmez', () => {
    const bloklar = [blok('sb_1', 'character', 'ayşe')];
    const kopya = JSON.parse(JSON.stringify(bloklar));
    sayfala(bloklar, profil);
    expect(bloklar).toEqual(kopya);
  });

  it('yeniSayfada blok her zaman yeni sayfanın ilk satırında başlar', () => {
    const bloklar = [
      blok('sb_a', 'action', 'Bir.'),
      blok('sb_b', 'action', 'Iki.'),
      blok('sb_g', 'transition', 'kes:'),
      blok('sb_c', 'action', 'Uc.'),
    ];
    const sayfalar = sayfala(bloklar, zorlayanProfil('transition'));
    expect(sayfalar).toHaveLength(2);
    // Onceki sayfa erken kapandi: 55 degil 3 satir.
    expect(sayfalar[0].satirlar).toHaveLength(3);
    expect(sayfalar[0].satirlar[2].blockId).toBe('sb_b');
    expect(sayfalar[1].satirlar[0]).toEqual(
      { blockId: 'sb_g', tip: 'transition', satirIndex: 0, metin: 'KES:' });
    // Bayraksiz profille aynı bloklar tek sayfada kalır — sayfayı çeviren bayraktır.
    expect(sayfala(bloklar, profil)).toHaveLength(1);
  });

  it('yeniSayfada blok senaryonun başındaysa boş sayfa üretmez', () => {
    const sayfalar = sayfala([blok('sb_g', 'transition', 'kes:')], zorlayanProfil('transition'));
    expect(sayfalar).toHaveLength(1);
    expect(sayfalar[0].satirlar).toHaveLength(1);
    expect(sayfalar[0].no).toBe(1);
  });

  it('yeniSayfada blok arka arkaya gelirse boş sayfa üretmez', () => {
    const sayfalar = sayfala(
      [blok('sb_g1', 'transition', 'kes:'), blok('sb_g2', 'transition', 'son:')],
      zorlayanProfil('transition'));
    expect(sayfalar).toHaveLength(2);
    for (const s of sayfalar) expect(s.satirlar).toHaveLength(1);
  });

  it('büyük harf çevrimi profilin diline uyar — TR i → İ', () => {
    const bloklar = [blok('sb_k', 'character', 'işıl')];
    const tr = sayfala(bloklar, profilOlustur('amerikan', 'a4', 'tr'));
    const en = sayfala(bloklar, profilOlustur('amerikan', 'letter', 'en'));
    expect(tr[0].satirlar[0].metin).toBe('İŞIL');
    expect(en[0].satirlar[0].metin).toBe('IŞIL');
  });

  it('hiçbir sayfa boş satırla bitmez', () => {
    // "sayfa boş satırla başlamaz" kuralının ikizi: `gerekli` hesabındaki +1,
    // boş satırların ardından EN AZ bir gövde satırının da sığmasını şart
    // koşar. +1 düşerse sayfa boş satırla biter.
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 27; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_ayar', 'dialogue', 'Replik.'));
    bloklar.push(blok('sb_son', 'action', 'Devam.'));
    const sayfalar = sayfala(bloklar, profil);
    expect(sayfalar.length).toBeGreaterThan(1);
    for (const s of sayfalar) {
      const son = s.satirlar[s.satirlar.length - 1];
      if (son) expect(son.metin).not.toBe('');
    }
  });

  it('diyalog sayfa sınırında bölünür — bütünüyle sonraki sayfaya atlamaz', () => {
    // `YALNIZ_KALMAZ` yukarıdan da sınırlı olmalı: diyalog bölünmez sayılırsa
    // uzun replikler sonraki sayfaya atlar ve sayfa sayısı şişer.
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 27; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_d', 'dialogue', 'kelime '.repeat(50).trim()));
    const sayfalar = sayfala(bloklar, profil);
    expect(sayfalar[0].satirlar).toHaveLength(IZGARA.satir);
    expect(sayfalar[0].satirlar[IZGARA.satir - 1].blockId).toBe('sb_d');
    expect(sayfalar[1].satirlar[0].blockId).toBe('sb_d');
    expect(sayfalar[1].satirlar[0].satirIndex).toBeGreaterThan(0);
  });

  it('NFD gelen TÜRKÇE metin NFC ile AYNI sayfa sayısını verir', () => {
    // K-1'in sayfa ekseni: aynı senaryo görünüşte aynıyken NFD'de %50 daha
    // fazla sayfa veriyordu (4 yerine 6) — sayfa≈dakika sözleşmesi çökerdi.
    // Metin ölçülerek seçildi: NFC 55 kod birimi (60 sütuna SIĞAR, 1 satır),
    // NFD 68 kod birimi (60 sütunu AŞAR, 2 satır). Sınır tam ortada.
    const ham = 'Şişli köşesinde güneş düşüyor ve Ayşe iğneyi görüyor xx';
    expect(ham.normalize('NFC')).toHaveLength(55);
    expect(ham.normalize('NFD')).toHaveLength(68);
    const yap = (t: string) => Array.from({ length: 100 }, (_, i) =>
      blok(`b${i}`, 'action', t));
    const nfc = sayfala(yap(ham.normalize('NFC')), profil);
    const nfd = sayfala(yap(ham.normalize('NFD')), profil);
    // Sayfa sayısı çivilenir: dolgu bir gün kayarsa test sessizce
    // anlamsızlaşmaz, patlar.
    expect(nfc).toHaveLength(4);
    // Sayfa SAYISI yetmez — döküm de birebir aynı olmalı (satır metni dahil).
    expect(nfd).toEqual(nfc);
  });

  /* ÖLÇÜLEN hata: sabit `+1` yalnız bir satır rezerve ediyordu, oysa sahne
     başlığından sonra gelen blokların hepsinin `oncekiBosSatir`'ı 1 — yani
     ayırıcısıyla birlikte İKİ satır ister. Başlık sayfanın son satırında
     kalıyor, altındaki satır boş duruyor ve aksiyon öbür sayfaya geçiyordu:
     `YALNIZ_KALMAZ`'ın önlemek için var olduğu durumun ta kendisi. */
  it('sahne başlığı, altındaki aksiyonun AYIRICISI da sığmıyorsa yalnız kalmıyor', () => {
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 26; i++) bloklar.push(blok(`a${i}`, 'action', `Satir ${i}.`));
    bloklar.push(blok('sb_s', 'scene', 'İÇ. MUTFAK - GECE'));
    bloklar.push(blok('sb_a', 'action', 'Ahmet girer.'));

    const sayfalar = sayfala(bloklar, profil);
    const sonSatir = sayfalar[0].satirlar.at(-1)!;
    // Başlık ilk sayfanın son satırı OLMAMALI.
    expect(sonSatir.tip).not.toBe('scene');

    // Başlık ile onu izleyen aksiyon AYNI sayfada.
    const basliginSayfasi = sayfalar.findIndex((sy) =>
      sy.satirlar.some((l) => l.blockId === 'sb_s'));
    const aksiyonunSayfasi = sayfalar.findIndex((sy) =>
      sy.satirlar.some((l) => l.blockId === 'sb_a' && l.satirIndex >= 0));
    expect(basliginSayfasi).toBe(aksiyonunSayfasi);
  });

  it('belgenin SON bloğu sahne/karakterse dul kuralı işlemez — istisna', () => {
    // Dul kuralı "altında en az bir satır kalsın" der; belgenin son bloğunda
    // altında satır YOKTUR, kural tanım gereği karşılanamaz. Yukarıdaki dört
    // dul testi bu istisnayı dışarıda bırakır; burada çivileniyor.
    // Kural artık SONRAKİ bloğun ilk görünür satırına bakıyor; son blokta
    // sonraki blok yok, dolayısıyla sayfa erken kapanmıyor ve başlık son
    // sayfanın son satırı olarak kalıyor. Eskiden sabit `+1` yüzünden sayfa
    // gereksiz yere çevriliyor, iki ayırıcı satır sayfa başında yutuluyordu.
    const ortak: ScriptBlock[] = [];
    for (let i = 0; i < 54; i++) ortak.push(blok(`a${i}`, 'action', `Satir ${i}.`));

    const sahneli = sayfala(
      [...ortak, blok('sb_ayar', 'dialogue', 'Ayar.'),
        blok('sb_sahne', 'scene', 'İÇ. MUTFAK - GECE')], profil);
    expect(sahneli.map((s) => s.satirlar.length)).toEqual([IZGARA.satir, IZGARA.satir]);
    expect(sahneli[1].satirlar.at(-1)!.tip).toBe('scene');

    const karakterli = sayfala(
      [...ortak, blok('a54', 'action', 'Satir 54.'),
        blok('sb_k', 'character', 'AYŞE')], profil);
    expect(karakterli[1].satirlar.at(-1)!.tip).toBe('character');
    expect(karakterli).toHaveLength(2);
  });

  it('profilde tanımsız blok tipinde TANILAYAN hata verir', () => {
    // `kagitGeometrisi`'ndeki bilinmeyen-anahtar muhafızının kardeşi: aynı
    // güven sınırı (profil verisi / içe aktarım), aynı gerekçe. Muhafız
    // olmazsa `stil.yeniSayfada` "Cannot read properties of undefined" der.
    const yabanci = blok('sb_x', 'panel' as ScriptBlock['type'], 'Metin.');
    expect(() => sayfala([yabanci], profil)).toThrow(/tanimsiz blok tipi/i);
    // Mesaj TANILAYICI: hem tipi hem blok kimliğini taşır.
    expect(() => sayfala([yabanci], profil)).toThrow(/panel/);
    expect(() => sayfala([yabanci], profil)).toThrow(/sb_x/);
    // Sınır doğru yerde: tanımlı tip aynı çağrıda sorunsuz geçer.
    expect(sayfala([blok('sb_ok', 'action', 'Metin.')], profil)).toHaveLength(1);
  });

  it('iki kağıtta satır satır aynı sayfa dökümünü verir', () => {
    const bloklar = Array.from({ length: 120 }, (_, i) =>
      blok(`b${i}`, i % 4 === 0 ? 'scene' : i % 4 === 1 ? 'character' : 'dialogue',
        `Metin ${i} burada duruyor.`));
    const letter = sayfala(bloklar, profilOlustur('amerikan', 'letter', 'tr'));
    const a4 = sayfala(bloklar, profilOlustur('amerikan', 'a4', 'tr'));
    expect(a4).toEqual(letter);
  });
});

/**
 * SARMA ÖNBELLEĞİ — ölçümle açılan bir eniyileme (bkz. `sayfala.ts`).
 *
 * Önbellek DAVRANIŞI değiştirmemeli. Bu blok tam olarak onu çiviliyor: bir
 * eniyileme "hızlı ama bazen yanlış" olduğunda hata SESSİZDİR ve ancak
 * kullanıcı yanlış sayfa sayısını gördüğünde ortaya çıkar.
 */
describe('sarmala önbelleği', () => {
  it('ikinci çağrı aynı sonucu verir ama AYNI diziyi vermez', () => {
    sarmaOnbelleginiTemizle();
    const a = sarmala('bir iki üç dört beş altı yedi sekiz', 12);
    const b = sarmala('bir iki üç dört beş altı yedi sekiz', 12);
    expect(b).toEqual(a);
    /* Aynı dizi dönseydi çağıran onu değiştirdiğinde SONRAKİ çağrı bozulurdu
       ve "saf fonksiyon" sözleşmesi sessizce çürürdü. */
    expect(b).not.toBe(a);
  });

  it('dönen dizi değiştirilse bile sonraki çağrı etkilenmiyor', () => {
    sarmaOnbelleginiTemizle();
    /* İLK çağrı ıskadır ve zaten kopya döner; ÖNBELLEK İSABETİNİN dönüşünü
       kirletmek gerekiyor. Yalnız ilk çağrıyı bozmak, "isabette önbellekteki
       diziyi doğrudan ver" mutantını HAYATTA BIRAKIYORDU (ölçüldü). */
    sarmala('aaa bbb ccc', 7);
    const isabet = sarmala('aaa bbb ccc', 7);
    isabet[0] = 'BOZULDU';
    isabet.push('FAZLADAN');
    expect(sarmala('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('aynı metin FARKLI sütunda farklı sarılıyor — anahtarlar çakışmıyor', () => {
    sarmaOnbelleginiTemizle();
    expect(sarmala('aaa bbb', 7)).toEqual(['aaa bbb']);
    expect(sarmala('aaa bbb', 6)).toEqual(['aaa', 'bbb']);
    // Ters sırada da: ilk çağrının sonucu ikinciye sızmıyor.
    expect(sarmala('aaa bbb', 7)).toEqual(['aaa bbb']);
  });

  it('önbellek temizlense de sonuç değişmiyor', () => {
    const once = sarmala('kelime '.repeat(30).trim(), 35);
    sarmaOnbelleginiTemizle();
    expect(sarmala('kelime '.repeat(30).trim(), 35)).toEqual(once);
  });

  it('tavan aşılınca boşalıyor ve BAYAT sonuç dönmüyor', () => {
    sarmaOnbelleginiTemizle();
    /* Tavanı aşacak kadar farklı metin yazılıyor: dolan harita `clear()` ile
       boşalıyor. Boşalmadan sonra hesap yeniden yapılıyor — tavan mantığı
       yanlış bir girdiyi tutup dönseydi bu iddia kırmızıya dönerdi. */
    const hedef = sarmala('sinir metni burada', 9);
    for (let i = 0; i <= SARMA_ONBELLEK_TAVANI; i++) sarmala(`m${i} n${i}`, 9);
    expect(sarmala('sinir metni burada', 9)).toEqual(hedef);
  });
});
