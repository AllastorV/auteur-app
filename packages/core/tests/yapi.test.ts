import { describe, expect, it } from 'vitest';
import { yapiBirimleriniCikar, yapiIstatistigiCikar } from '@storyboard/core/model/yapi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * F7 AÇIK KALAN kısmı: tip başına yapı paneli ve istatistik.
 *
 * Senaryo tipi SAHNE sınırını `sceneId` ile çizer (§ senaryoyuCozumle'deki
 * kural), roman/çizgi roman/düz metin ise sınırı BLOK TİPİYLE çizer çünkü
 * o tiplerde `sceneId` hiç değişmez (`reconcileScript` yalnız `type ===
 * 'scene'`de yeni kimlik üretir).
 */

let sayac = 0;
const b = (
  tip: ScriptBlock['type'], text: string, sceneId = '',
): ScriptBlock => ({ id: `b${sayac++}`, fp: `${text}${sayac}`, type: tip, text, scene: '', sceneId });

const senaryoProfil = tipProfili('senaryo', 'a4', 'tr');
const romanProfil = tipProfili('roman', 'a4', 'tr');
const cizgiRomanProfil = tipProfili('cizgi-roman', 'a4', 'tr');
const duzMetinProfil = tipProfili('duz-metin', 'a4', 'tr');

describe('senaryo — sahne sınırı sceneId ile', () => {
  it('sceneId değişince yeni birim başlıyor, type=scene ile değil', () => {
    sayac = 0;
    const bloklar = [
      b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
      b('action', 'Ayşe oturur.', 'sc1'),
      b('scene', 'DIŞ. SOKAK - GÜNDÜZ', 'sc2'),
      b('action', 'Yağmur yağar.', 'sc2'),
    ];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    expect(birimler).toHaveLength(2);
    expect(birimler.map((u) => u.ad)).toEqual(['İÇ. MUTFAK - GECE', 'DIŞ. SOKAK - GÜNDÜZ']);
    expect(birimler[0].blokSayisi).toBe(2);
  });

  /* Tipe bakan bir bölme başlıksız açılışı bir önceki sahneye yapıştırırdı. */
  it('başlıksız açılış sahnesi de bir BİRİM', () => {
    sayac = 0;
    const bloklar = [b('action', 'Karanlık.', 'sc0'), b('scene', 'İÇ. ODA', 'sc1')];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    expect(birimler).toHaveLength(2);
    expect(birimler[0].ad).toBe('(başlıksız)');
  });

  it('her birim ilk bloğunu taşıyor — blogaGit buna dayanıyor', () => {
    sayac = 0;
    const bloklar = [
      b('scene', 'İÇ. A', 'sc1'), b('action', 'x', 'sc1'),
      b('scene', 'İÇ. B', 'sc2'), b('action', 'y', 'sc2'),
    ];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    expect(birimler[0].ilkBlokId).toBe(bloklar[0].id);
    expect(birimler[1].ilkBlokId).toBe(bloklar[2].id);
  });

  /* Sınırın GERÇEKTEN sceneId'ye baktığını (type'a değil) kanıtlayan durum:
     aynı sceneId'yi taşıyan İKİ 'scene' tipi blok (ör. başlık kullanıcı
     tarafından ikiye yazıldı ama sahne değişmedi) TEK birim kalmalı. Yalnız
     type=='scene'e bakan bir bölme burada YANLIŞLIKLA iki birim üretirdi. */
  it('aynı sceneId\'yi taşıyan iki "scene" bloğu TEK birim — sınır type değil sceneId', () => {
    sayac = 0;
    const bloklar = [
      b('scene', 'İÇ. ODA', 'sc1'),
      b('action', 'x', 'sc1'),
      b('scene', 'İÇ. ODA (DEVAM)', 'sc1'),
      b('action', 'y', 'sc1'),
    ];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    expect(birimler).toHaveLength(1);
    expect(birimler[0].blokSayisi).toBe(4);
  });

  it('birim kimliği sceneId — React key kalıcı olmalı', () => {
    sayac = 0;
    const bloklar = [b('scene', 'İÇ. A', 'sc1'), b('action', 'x', 'sc1')];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    expect(birimler[0].id).toBe('sc1');
  });
});

describe('roman — bölüm sınırı BLOK TİPİYLE (sceneId hiç değişmez)', () => {
  it('her "bolum" bloğu yeni birim başlatıyor', () => {
    sayac = 0;
    const bloklar = [
      b('bolum', 'Bölüm 1', ''),
      b('paragraf', 'Bir varmış bir yokmuş.', ''),
      b('paragraf', 'Devamı geldi.', ''),
      b('bolum', 'Bölüm 2', ''),
      b('paragraf', 'İkinci bölüm başladı.', ''),
    ];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.roman, romanProfil);
    expect(birimler).toHaveLength(2);
    expect(birimler.map((u) => u.ad)).toEqual(['Bölüm 1', 'Bölüm 2']);
    expect(birimler[0].blokSayisi).toBe(3);
    expect(birimler[1].blokSayisi).toBe(2);
  });

  it('ilk bölüm başlığından önceki paragraf da bir BİRİM', () => {
    sayac = 0;
    const bloklar = [
      b('paragraf', 'Bölümsüz açılış.', ''),
      b('bolum', 'Bölüm 1', ''),
      b('paragraf', 'x', ''),
    ];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.roman, romanProfil);
    expect(birimler).toHaveLength(2);
    expect(birimler[0].ad).toBe('(başlıksız)');
  });

  it('birim kimliği ilk bloğun id\'si — sceneId roman için anlamsız', () => {
    sayac = 0;
    const bloklar = [b('bolum', 'Bölüm 1', ''), b('paragraf', 'x', '')];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI.roman, romanProfil);
    expect(birimler[0].id).toBe(bloklar[0].id);
  });
});

describe('çizgi roman — sayfa sınırı', () => {
  it('her "sayfa" bloğu yeni birim başlatıyor', () => {
    sayac = 0;
    const bloklar = [
      b('sayfa', 'Sayfa 1', ''),
      b('kare', 'Kare metni.', ''),
      b('sayfa', 'Sayfa 2', ''),
      b('kare', 'Başka kare.', ''),
    ];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI['cizgi-roman'], cizgiRomanProfil);
    expect(birimler).toHaveLength(2);
    expect(birimler.map((u) => u.ad)).toEqual(['Sayfa 1', 'Sayfa 2']);
  });
});

describe('düz metin — paragraf sınırı', () => {
  it('her paragraf kendi birimi', () => {
    sayac = 0;
    const bloklar = [b('paragraf', 'İlk paragraf.', ''), b('paragraf', 'İkinci paragraf.', '')];
    const birimler = yapiBirimleriniCikar(bloklar, DOKUMAN_TIPLERI['duz-metin'], duzMetinProfil);
    expect(birimler).toHaveLength(2);
    expect(birimler[0].ad).toBe('İlk paragraf.');
  });

  it('hiç blok yoksa boş liste', () => {
    const birimler = yapiBirimleriniCikar([], DOKUMAN_TIPLERI['duz-metin'], duzMetinProfil);
    expect(birimler).toEqual([]);
  });
});

describe('istatistik', () => {
  it('toplam birim, kelime ve sayfa doğru toplanıyor', () => {
    sayac = 0;
    const bloklar = [
      b('bolum', 'Bölüm 1', ''),
      b('paragraf', 'bir iki üç', ''),
      b('bolum', 'Bölüm 2', ''),
      b('paragraf', 'dört beş', ''),
    ];
    const ist = yapiIstatistigiCikar(bloklar, DOKUMAN_TIPLERI.roman, romanProfil);
    expect(ist.toplamBirim).toBe(2);
    expect(ist.toplamKelime).toBe(2 + 3 + 2 + 2); // "Bölüm 1"(2) + "bir iki üç"(3) + "Bölüm 2"(2) + "dört beş"(2)
    /* `> 0` sayfa sayısını hiç ölçmüyordu; iki `bolum` bloğu YENİ SAYFADA
       başlıyor, yani bu belge TAM İKİ sayfa. Sayfa sonu kuralı düşse
       sonuç 1 olurdu ve `> 0` onu görmezdi. */
    expect(ist.toplamSayfa).toBe(2);
    expect(ist.ortalamaSayfa).toBe(1);
    // Birim dökümü de tam: kelime ve blok sayıları birim başına doğru.
    expect(ist.birimler.map((u) => [u.ad, u.sira, u.blokSayisi, u.kelime, u.sayfa]))
      .toEqual([['Bölüm 1', 0, 2, 5, 1], ['Bölüm 2', 1, 2, 4, 1]]);
  });

  it('en uzun ve en kısa birim doğru — sayfa büyüklüğüne göre', () => {
    sayac = 0;
    const uzunMetin = Array.from({ length: 2000 }, () => 'kelime').join(' ');
    const bloklar = [
      b('bolum', 'Kısa Bölüm', ''),
      b('paragraf', 'tek satır', ''),
      b('bolum', 'Uzun Bölüm', ''),
      b('paragraf', uzunMetin, ''),
    ];
    const ist = yapiIstatistigiCikar(bloklar, DOKUMAN_TIPLERI.roman, romanProfil);
    expect(ist.enUzun!.ad).toBe('Uzun Bölüm');
    expect(ist.enKisa!.ad).toBe('Kısa Bölüm');
    expect(ist.enUzun!.sayfa).toBeGreaterThan(ist.enKisa!.sayfa);
    /* `enUzun > enKisa` yalnız SIRALAMAYI ölçüyordu: sayfa hesabını
       tamamen bozup 50"ye 1 veren bir mutant da geçerdi. 2002 kelimelik
       bölüm A4"te beş sayfa; kısa bölüm bir. Kelime sayıları da çivili. */
    expect(ist.enUzun!.sayfa).toBe(5);
    expect(ist.enKisa!.sayfa).toBe(1);
    expect(ist.enUzun!.kelime).toBe(2002);
    expect(ist.enKisa!.kelime).toBe(4);
    expect(ist.toplamSayfa).toBe(6);
    expect(ist.ortalamaSayfa).toBe(3);
  });

  /* `0/0` NaN üretir ve panel sessizce bozuk sayı gösterirdi — AnalizPanosu'nda
     `pay` için not edilen tuzağın aynısı. */
  it('boş belgede 0/0 NaN üretmiyor', () => {
    const ist = yapiIstatistigiCikar([], DOKUMAN_TIPLERI.roman, romanProfil);
    expect(ist.toplamBirim).toBe(0);
    expect(ist.toplamSayfa).toBe(0);
    expect(ist.ortalamaSayfa).toBe(0);
    expect(Number.isNaN(ist.ortalamaSayfa)).toBe(false);
    expect(ist.enUzun).toBeNull();
    expect(ist.enKisa).toBeNull();
    expect(ist.birimler).toEqual([]);
  });

  it('tek birimli belgede ortalama o birimin sayfasına eşit', () => {
    sayac = 0;
    const bloklar = [b('bolum', 'Tek Bölüm', ''), b('paragraf', 'metin', '')];
    const ist = yapiIstatistigiCikar(bloklar, DOKUMAN_TIPLERI.roman, romanProfil);
    expect(ist.ortalamaSayfa).toBe(ist.toplamSayfa);
  });

  it('toplam sayfa BELGENİN gerçek sayfa sayısı — birim sayfalarının toplamı değil', () => {
    /* Her birim TEK BAŞINA sayfalandığında `sayfala` en az BİR sayfa döndürür
       (üç satırlık bir sahne bile "1 sayfa" sayılır); gerçek belgede sahneler
       ARDIŞIK aynı sayfaya doluşur ve bu yuvarlama birikmez. `scene` bloğu
       zorla yeni sayfa AÇMIYOR (Amerikan profilinde `yeniSayfada` yok) — çok
       sayıda kısa sahneyle fark ölçülebilir. */
    sayac = 0;
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 20; i++) {
      bloklar.push(b('scene', `İÇ. ODA ${i} - GÜNDÜZ`, `sc${i}`));
      bloklar.push(b('action', 'Kısa bir aksiyon satırı.', `sc${i}`));
    }
    const ist = yapiIstatistigiCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    const birimSayfaToplami = ist.birimler.reduce((t, u) => t + u.sayfa, 0);
    expect(ist.toplamSayfa).toBeLessThan(birimSayfaToplami);
    /* `<` yalnız yönü ölçüyordu: `toplamSayfa`yı sabit 1 yapan bir mutant
       da geçerdi. Yirmi kısa sahne A4"te TAM İKİ sayfa doldururken birim
       birim sayıldığında yirmi eder — aradaki fark yuvarlamanın kendisi. */
    expect(ist.toplamSayfa).toBe(2);
    expect(birimSayfaToplami).toBe(20);
    expect(ist.toplamBirim).toBe(20);
    // Her birim tek başına en az bir sayfa sayılıyor — farkın kaynağı bu.
    for (const u of ist.birimler) expect(u.sayfa, u.ad).toBe(1);
  });

  /* ÖLÇEK: yirmi sahnelik test sayfa sınırını ancak bir kez geçiyordu.
     Beş yüz sahnede toplam sayfa, kelime ve birim sayıları birlikte
     tutmalı; sayfa birikimi (yuvarlama) burada onlarca kez çalışıyor. */
  it('ÖLÇEK: 500 sahnede toplamlar tutuyor ve birim dökümü tam', () => {
    sayac = 0;
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 500; i++) {
      bloklar.push(b('scene', `İÇ. ODA ${i} - GÜNDÜZ`, `sc${i}`));
      bloklar.push(b('action', 'Kısa bir aksiyon satırı.', `sc${i}`));
    }
    const ist = yapiIstatistigiCikar(bloklar, DOKUMAN_TIPLERI.senaryo, senaryoProfil);
    expect(ist.toplamBirim).toBe(500);
    expect(ist.birimler).toHaveLength(500);
    // Sahne başına 5 ("İÇ. ODA n - GÜNDÜZ") + 4 = 9 kelime.
    expect(ist.toplamKelime).toBe(500 * 9);
    /* Belgenin GERÇEK sayfa sayısı 46; birim birim sayılsa 500 ederdi.
       Yuvarlama farkı ölçekte 454 sayfa — bu testin asıl konusu. */
    expect(ist.toplamSayfa).toBe(46);
    expect(ist.birimler.reduce((t, u) => t + u.sayfa, 0)).toBe(500);
    // `sira` alanı 0"dan 499"a kesintisiz — bir birim düşse boşluk açılırdı.
    expect(ist.birimler.map((u) => u.sira)).toEqual(Array.from({ length: 500 }, (_, i) => i));
    // Birim kimlikleri BENZERSİZ (React key sözleşmesi).
    expect(new Set(ist.birimler.map((u) => u.id)).size).toBe(500);
    // Ortalama gerçekten toplam/birim — NaN ya da sabit değil.
    expect(ist.ortalamaSayfa).toBeCloseTo(ist.toplamSayfa / ist.toplamBirim, 10);
  });
});
