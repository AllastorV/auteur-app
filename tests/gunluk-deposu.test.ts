import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunlukDeposu } from '../apps/desktop/electron/gunluk-deposu';
import { GUN_MS, SAAT_MS } from '@storyboard/core/veri/kontrol-noktalari';
import { cerceve, gunlukBasligi, gunlukCozumle } from '@storyboard/core/veri/gunluk';
import { ilkSaglamKayit, oturumuKurtar } from '@storyboard/core/veri/anlik';
import { durumOzdes } from '@storyboard/core/veri/kurtarma';
import * as Y from 'yjs';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-depo-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

let sayac = 0;
const depo = () => gunlukDeposu(kok, `proje-${sayac++}`);
const yuk = (n: number, tohum = 1) =>
  Uint8Array.from({ length: n }, (_, i) => (i * 7 + tohum) % 251);

describe('günlük dosyası', () => {
  it('ilk yazımda başlıkla kurulur ve eklenerek büyür', () => {
    const d = depo();
    d.ekle(cerceve(yuk(20, 1), 1000), gunlukBasligi());
    d.ekle(cerceve(yuk(30, 2), 2000), gunlukBasligi());

    const okuma = gunlukCozumle(d.oku()!);
    expect(okuma.durum).toBe('tam');
    expect(okuma.guncellemeler).toEqual([yuk(20, 1), yuk(30, 2)]);
    // Başlık BİR KEZ yazılır; her eklemede yazılsaydı çözümleme bozulurdu.
    expect(okuma.zamanlar).toEqual([1000, 2000]);
  });

  it('hiç günlük yoksa null döner', () => {
    expect(depo().oku()).toBeNull();
  });

  it('çıpa yazımı günlüğü keser', () => {
    const d = depo();
    d.ekle(cerceve(yuk(20), 1000), gunlukBasligi());
    d.cipaYazVeKes(yuk(64, 9), 5000);
    expect(d.oku()).toBeNull();
    expect(d.halka()).toHaveLength(1);
  });

  /* SIRA SÖZLEŞMESİ, gözlemlenebilir hâle getirilmiş: çıpa yazımı BAŞARISIZ
     olursa günlük duruyor olmalı. Kesme önce gelseydi, yazılamayan çıpayla
     birlikte o aralıktaki bütün iş giderdi — §15'in en pahalı hatası. */
  it('çıpa YAZILAMAZSA günlük kesilmez', () => {
    const d = depo();
    d.ekle(cerceve(yuk(20), 1000), gunlukBasligi());
    // Çıpanın yazılacağı adı DİZİN yaparak yazımı imkânsız kıl.
    fs.mkdirSync(path.join(d.dizin, 'cipa-5000.yjs'), { recursive: true });

    expect(() => d.cipaYazVeKes(yuk(64), 5000)).toThrow();
    expect(d.oku()).not.toBeNull();
    expect(gunlukCozumle(d.oku()!).guncellemeler).toHaveLength(1);
  });
});

describe('kuşak halkası', () => {
  /* §15.2.2 SEYRELME: sabit sayı değil, seyrelen zaman ölçeği. Sabit üç
     kayıt, beş dakikalık çıpa aralığıyla ~15 dakikalık bir geri dönüş
     penceresi demekti; bir hatayı ertesi gün fark eden kullanıcının dönecek
     noktası kalmıyordu. */
  it('son bir saatteki HER çıpa tutuluyor', () => {
    const d = depo();
    const t0 = 10 * GUN_MS;
    for (let i = 1; i <= 6; i++) d.cipaYazVeKes(yuk(16, i), t0 + i * 60_000);
    const halka = d.halka();
    expect(halka).toHaveLength(6);
    // Yeniden eskiye sıralı.
    expect(halka[0].zaman).toBeGreaterThan(halka[5].zaman);
    expect(d.cipaOku(halka[0].id)).toEqual(yuk(16, 6));
  });

  it('bir saatten eski çıpalar SAATLİK seyreliyor', () => {
    const d = depo();
    const t0 = 10 * GUN_MS;
    // Aynı saat kovasında iki çıpa + çok daha yeni bir çıpa.
    d.cipaYazVeKes(yuk(16, 1), t0);
    d.cipaYazVeKes(yuk(16, 2), t0 + 10 * 60_000);
    d.cipaYazVeKes(yuk(16, 3), t0 + 5 * SAAT_MS);
    const zamanlar = d.halka().map((c) => c.zaman);
    expect(zamanlar).toContain(t0 + 5 * SAAT_MS);
    // Eski kovadan yalnız EN YENİSİ kalır: o penceredeki en güncel durum.
    expect(zamanlar).toContain(t0 + 10 * 60_000);
    expect(zamanlar).not.toContain(t0);
  });

  /* Uygulama 40 gün sonra açılırsa bütün noktalar 30 günden eskidir; guard
     olmasaydı politika HEPSİNİ silerdi ve projenin tek yedeği yok olurdu. */
  it('en yeni çıpa yaşı ne olursa olsun SİLİNMİYOR', () => {
    const d = depo();
    d.cipaYazVeKes(yuk(16, 1), 1000);
    d.cipaYazVeKes(yuk(16, 2), 2000);
    // İkinci yazım 40 gün sonra: ilk çıpa çok eski, ama halka boş kalmamalı.
    d.cipaYazVeKes(yuk(16, 3), 40 * GUN_MS);
    const halka = d.halka();
    expect(halka.length).toBeGreaterThan(0);
    expect(halka[0].zaman).toBe(40 * GUN_MS);
  });

  /* Damgası okunamayan dosya SIFIR sayılsaydı en eski görünür ve budamada
     sağlam bir çıpanın önüne geçebilirdi. */
  it('adı bozuk çıpa dosyası halkaya girmez', () => {
    const d = depo();
    d.cipaYazVeKes(yuk(16, 1), 1000);
    fs.writeFileSync(path.join(d.dizin, 'cipa-bozukad.yjs'), 'x');
    fs.writeFileSync(path.join(d.dizin, 'cipa-.yjs'), 'x');
    expect(d.halka().map((c) => c.zaman)).toEqual([1000]);
  });

  it('dizin yokken halka boş döner', () => {
    expect(gunlukDeposu(kok, 'hic-olmayan').halka()).toEqual([]);
  });

  it('dizin dışına çıkan çıpa adı reddedilir', () => {
    const d = depo();
    expect(() => d.cipaOku('../../gizli')).toThrow(/Gecersiz/);
    expect(() => d.cipaOku('alt/dizin')).toThrow(/Gecersiz/);
  });
});

describe('§15.3 — yoksayılan günlük SİLİNMEZ, arşivlenir', () => {
  it('arşivleme günlüğü kurtarma dizinine taşır', () => {
    const d = depo();
    d.ekle(cerceve(yuk(20), 1000), gunlukBasligi());
    const hedef = d.arsivle(777)!;

    expect(d.oku()).toBeNull();
    expect(fs.existsSync(hedef)).toBe(true);
    // Taşınan dosya hâlâ çözümlenebilir — kullanıcı sonradan geri isteyebilir.
    expect(gunlukCozumle(new Uint8Array(fs.readFileSync(hedef))).guncellemeler).toHaveLength(1);
  });

  it('günlük yoksa arşivleme null döner', () => {
    expect(depo().arsivle(1)).toBeNull();
  });
});

describe('uçtan uca — çökme sonrası kurtarma', () => {
  it('çıpa + günlük diskten okunup durum birebir geri geliyor', () => {
    const d = depo();
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1000);

    // Çıpadan sonraki düzenlemeler günlüğe düşer.
    let zaman = 2000;
    doc.on('update', (u: Uint8Array) => {
      d.ekle(cerceve(u, (zaman += 100)), gunlukBasligi());
    });
    doc.getMap('meta').set('title', 'çökmeden önce');

    // ÇÖKME — süreç öldü. Yeniden açılış:
    const halka = d.halka();
    const sonuc = oturumuKurtar(
      halka.map((c) => ({ id: c.id, oku: () => d.cipaOku(c.id) })),
      d.oku()!,
    );
    expect(sonuc.cipa).toBe(halka[0].id);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });

  it('en yeni çıpa BOZUKSA bir öncekine düşülür', () => {
    const d = depo();
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    doc.getMap('meta').set('title', 'sağlam çıpa');
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1000);
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 2000);

    // En yeni çıpayı boz (yarım yazılmış gibi).
    const halka = d.halka();
    fs.writeFileSync(path.join(d.dizin, halka[0].id), Buffer.alloc(0));

    const secim = ilkSaglamKayit(halka.map((c) => ({ id: c.id, oku: () => d.cipaOku(c.id) })));
    expect(secim.kullanilan).toBe(halka[1].id);
    /* Sıfır uzunluklu dosyada Yjs "Unexpected end of array" fırlatıyor
       (ölçüldü), yani eleme sebebi `cozumlenemedi`. `projesiz` sebebi
       ÇÖZÜMLENEN ama boş kalan kayıtlar için — ikisi ayrı bozulma biçimi. */
    expect(secim.elenen).toEqual([{ id: halka[0].id, sebep: 'cozumlenemedi' }]);
  });
});

describe('projeId YOL SINIRI — dizin dışına çıkış engelleniyor', () => {
  /* `meta.id` açılan `.sbp` dosyasından olduğu gibi geliyor; başka birinden
     gelen bir proje `../..` taşıyabilir. Denetlenmeseydi `cipaYazVeKes` veri
     kökünün DIŞINDAKİ bir `oturum.log`'u silerdi. */
  it('`..` içeren kimlik reddediliyor', () => {
    expect(() => gunlukDeposu(kok, '../../kacis')).toThrow(/proje kimligi/i);
    expect(() => gunlukDeposu(kok, '..')).toThrow(/proje kimligi/i);
  });

  it('yol ayracı içeren kimlik reddediliyor', () => {
    expect(() => gunlukDeposu(kok, 'a/b')).toThrow(/proje kimligi/i);
    /* Ters ayraç POSIX'te ayraç sayılmaz ama `.sbp` Windows'ta yazılmış
       olabilir — sınır her iki platformda da aynı yerde durmalı. */
    expect(() => gunlukDeposu(kok, String.raw`a\b`)).toThrow(/proje kimligi/i);
  });

  it('nokta ve boş kimlik reddediliyor', () => {
    expect(() => gunlukDeposu(kok, '.')).toThrow(/proje kimligi/i);
    expect(() => gunlukDeposu(kok, '')).toThrow(/proje kimligi/i);
  });

  it('DİZİN kökün altında kalıyor — kimlik kabul edilse bile', () => {
    const d = gunlukDeposu(kok, 'prj_abc123');
    expect(path.dirname(path.resolve(d.dizin))).toBe(path.resolve(kok));
  });

  it('normal kimlik geçiyor — denetim işi engellemiyor', () => {
    expect(() => gunlukDeposu(kok, 'prj_abc123')).not.toThrow();
  });
});

describe('SOY denetimi — başka projenin çıpası eleniyor', () => {
  /* `Y.applyUpdate` yabancı soyda FIRLATMAZ: üst öğesi bulunamayan
     güncellemeyi bekleyen yapı olarak saklar ya da köke iliştirir. Yani
     `uygulanamayan` sayacı bu durumu hiç görmüyordu ve kullanıcıya
     "0 uygulanamadı" diye yeşil rapor veriliyordu — oysa belge çiftlenmişti.
     Denetim bu yüzden ÇIPA SEÇİMİNDE yapılıyor. */
  const cipaliDoc = (id: string) => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    doc.getMap('meta').set('id', id);
    return doc;
  };

  it('kimliği tutmayan çıpa `baska-proje` diye eleniyor', () => {
    const d = depo();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(cipaliDoc('prj_yabanci')), 1000);
    const halka = d.halka();
    const secim = ilkSaglamKayit(
      halka.map((c) => ({ id: c.id, oku: () => d.cipaOku(c.id) })),
      'prj_bizim',
    );
    expect(secim.doc).toBeNull();
    expect(secim.elenen).toEqual([{ id: halka[0].id, sebep: 'baska-proje' }]);
  });

  it('kimliği tutan çıpa kabul ediliyor', () => {
    const d = depo();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(cipaliDoc('prj_bizim')), 1000);
    const halka = d.halka();
    const secim = ilkSaglamKayit(
      halka.map((c) => ({ id: c.id, oku: () => d.cipaOku(c.id) })),
      'prj_bizim',
    );
    expect(secim.doc).not.toBeNull();
    expect(secim.elenen).toEqual([]);
  });

  it('kimlik VERİLMEZSE eleme yapılmıyor — geriye dönük uyum', () => {
    const d = depo();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(cipaliDoc('prj_herhangi')), 1000);
    const halka = d.halka();
    const secim = ilkSaglamKayit(halka.map((c) => ({ id: c.id, oku: () => d.cipaOku(c.id) })));
    expect(secim.doc).not.toBeNull();
  });

  it('yabancı çıpa elenince BİR ÖNCEKİ sağlam kayda düşülüyor', () => {
    const d = depo();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(cipaliDoc('prj_bizim')), 1000);
    d.cipaYazVeKes(Y.encodeStateAsUpdate(cipaliDoc('prj_yabanci')), 2000);
    const halka = d.halka();
    const secim = ilkSaglamKayit(
      halka.map((c) => ({ id: c.id, oku: () => d.cipaOku(c.id) })),
      'prj_bizim',
    );
    expect(secim.kullanilan).toBe(halka[1].id);
  });
});

describe('seyreltme kapatılabiliyor — geri dönüş yarışı', () => {
  /* Yarış GERÇEK ve kullanıcının kendi eliyle tetikleniyordu: geri dönüş
     önce bir güvenlik noktası yazıyor, sonra hedefi okuyor. Yazım seyreltme
     yaptığı için, hedef 30 günü aşmışsa AYNI çağrı onu budayabiliyordu —
     yani dönmek istediğin an, dönmeye kalktığın anda siliniyordu. */
  const eskiNokta = (d: ReturnType<typeof depo>, yasGun: number) => {
    const zaman = Date.now() - yasGun * GUN_MS;
    d.cipaYazVeKes(yuk(32, yasGun), zaman);
    return `cipa-${zaman}.yjs`;
  };

  it('seyreltme AÇIKKEN 30 günü aşmış nokta budanıyor', () => {
    const d = depo();
    const hedef = eskiNokta(d, 45);
    /* Yeni bir çıpa daha: en yeni nokta her zaman tutulduğu için, hedefin
       budanabilmesi ancak ondan sonra gelen bir yazımla mümkün. */
    d.cipaYazVeKes(yuk(32, 2), Date.now());
    expect(d.halka().some((c) => c.id === hedef)).toBe(false);
  });

  it('seyreltme KAPALIYKEN aynı nokta duruyor', () => {
    const d = depo();
    const hedef = eskiNokta(d, 45);
    d.cipaYazVeKes(yuk(32, 2), Date.now(), false);
    expect(d.halka().some((c) => c.id === hedef)).toBe(true);
    /* Ve gerçekten okunabiliyor — halkada görünüp dosyası olmayan bir
       kayıt, sorunu bir adım öteye taşımaktan başka işe yaramazdı. */
    expect(d.cipaOku(hedef).length).toBe(32);
  });

  it('kapatmak sonraki normal yazımın seyreltmesini engellemiyor', () => {
    /* Bir turluk atlama, politikayı KALICI olarak devre dışı bırakmamalı:
       aksi halde halka sınırsız büyürdü. */
    const d = depo();
    const hedef = eskiNokta(d, 45);
    d.cipaYazVeKes(yuk(32, 2), Date.now(), false);
    d.cipaYazVeKes(yuk(32, 3), Date.now());
    expect(d.halka().some((c) => c.id === hedef)).toBe(false);
  });
});

describe('kurtarma arşivi budanıyor', () => {
  /* §15.3 "sil değil taşı" doğru karar, ama taşınan yere hiç dokunulmazsa
     her yoksayma bir dosya bırakır ve orada sonsuza kadar durur. Politika
     KASITEN cömert: yaş birincil ölçüt, üstüne "en yeni birkaçı her zaman
     tutulur" güvencesi. */
  const arsivDosyalari = (d: ReturnType<typeof depo>) =>
    fs.readdirSync(path.join(d.dizin, 'kurtarma')).sort();

  /** Verilen zamana ait bir arşiv kaydı üretir (günlük yaz -> arşivle). */
  const arsivle = (d: ReturnType<typeof depo>, zaman: number) => {
    d.ekle(cerceve(yuk(16, zaman % 200), zaman), gunlukBasligi());
    return d.arsivle(zaman);
  };

  it('30 günden genç arşivler duruyor', () => {
    const d = depo();
    const simdi = Date.now();
    for (const gun of [1, 5, 20]) arsivle(d, simdi - gun * GUN_MS);
    expect(arsivDosyalari(d)).toHaveLength(3);
  });

  it('30 günü aşan arşivler budanıyor', () => {
    const d = depo();
    const simdi = Date.now();
    /* Önce eskiler, sonra 6 tane taze: taze sayısı "en yeni 5" güvencesini
       aşmalı, yoksa eskiler o kural yüzünden tutulur ve test budamayı değil
       güvenceyi ölçerdi. */
    const eski = arsivle(d, simdi - 200 * GUN_MS);
    for (let i = 0; i < 6; i++) arsivle(d, simdi - i * SAAT_MS);
    expect(arsivDosyalari(d).some((a) => a === path.basename(eski!))).toBe(false);
  });

  it('hepsi eskiyse bile EN YENİ birkaçı korunuyor', () => {
    /* Altı ay sonra dönen kullanıcı boş arşiv bulmamalı — `seyrelt`'in
       "en yeni nokta her zaman tutulur" kuralıyla aynı gerekçe. */
    const d = depo();
    const simdi = Date.now();
    for (let i = 0; i < 8; i++) arsivle(d, simdi - (200 + i) * GUN_MS);
    /* Budama arşivlemenin İÇİNDE, o çağrının zamanına göre çalışıyor;
       hepsi geçmişe yazıldığı için birbirlerine göre "genç" kalıyorlar.
       Süpürmeyi ancak BUGÜNE ait bir arşivleme tetikliyor. */
    arsivle(d, simdi);
    const kalan = arsivDosyalari(d).length;
    expect(kalan).toBeGreaterThanOrEqual(5);
    expect(kalan).toBeLessThan(9);
  });
});
