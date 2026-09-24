import { describe, expect, it } from 'vitest';
import {
  DOKUMAN_TIPLERI,
  bloguUyarla,
  dokumanTipi,
  type DokumanTipiAdi,
} from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import { baglamMenusu } from '@storyboard/core/dil/menu';
import { sayfala } from '@storyboard/core/format/sayfala';
import { BLOK_ETIKETLERI } from '@storyboard/core/model/script';
import type { ScriptBlock } from '@storyboard/core/model/script';
import * as Y from 'yjs';
import * as M from '@storyboard/core/doc/mutations';
import { LOCAL_ORIGIN } from '@storyboard/core/doc/mutations';
import { docToProject, loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';

const TIPLER = Object.keys(DOKUMAN_TIPLERI) as DokumanTipiAdi[];

/* İki sütunlu belge (§6.6) TEK SÜTUNLU DEĞİL: birimi `ScriptBlockType`
   değil görüntü/ses çifti, sayfalayıcısı ayrı (`sayfalaIkiSutun`), blok
   menüsü yok. Aşağıdaki "her tipin blokları var / profili kurulur /
   sayfalanır" iddiaları TEK SÜTUNLU tipler hakkındadır; bu ayrım
   yapılmadan iki sütunlu tip eklenince beşi birden düşüyordu — testler
   "her belge tek sütunludur" varsayımını kodluyordu. */
const TEK_SUTUN = Object.values(DOKUMAN_TIPLERI).filter((t) => !t.ikiSutun);
const IKI_SUTUN_TIPLERI = Object.values(DOKUMAN_TIPLERI).filter((t) => t.ikiSutun);

const blok = (tip: ScriptBlock['type'], text = 'metin'): ScriptBlock =>
  ({ id: `b-${tip}`, fp: tip, type: tip, text, scene: '', sceneId: 'sc1' });

describe('kayıt defteri', () => {
  it('dokuz doküman tipi tanımlı — sekizi tek, biri iki sütunlu', () => {
    expect(TIPLER).toHaveLength(9);
    expect(TEK_SUTUN).toHaveLength(8);
    expect(IKI_SUTUN_TIPLERI).toHaveLength(1);
  });

  /* TÜRETİLEN TİP — "Yeni proje" penceresinde GÖRÜNMEZ (boş kabuk olarak
     seçilse kullanıcı bomboş bir belge alır). Bayrak tam olarak bunun
     için var; kaldıran bir mutant fon dosyasını o listeye düşürürdü. */
  it('yalnız fon başvuru dosyası türetilen tip', () => {
    const turetilenler = Object.values(DOKUMAN_TIPLERI).filter((t) => t.turetilen);
    expect(turetilenler.map((t) => t.id)).toEqual(['fon-dosyasi']);
  });

  /* Ad "Fransız (iki sütun)" — yalın "Fransız" DEĞİL. Fransa'da yazılan
     uzun metraj senaryosu tek sütunludur ve bununla ilgisi yoktur; §6.6
     bu ayrımı arayüzde açıkça istiyor. */
  /* AÇIKLAMA — yeni proje penceresindeki kartların altında değil, seçilenin
     altında tek satır olarak çiziliyor. Boş kalan bir açıklama o satırı
     sessizce boşaltır: kullanıcı "roman seçersem ne olur" sorusunu yine
     cevapsız bulur ve bu ekranda GÖRÜNMEYEN bir eksiktir. */
  it('her tipin açıklaması var, tekil ve adın tekrarı değil', () => {
    const aciklamalar = Object.values(DOKUMAN_TIPLERI).map((d) => d.aciklama);
    for (const d of Object.values(DOKUMAN_TIPLERI)) {
      expect(d.aciklama.trim().length, `${d.id} açıklaması boş`).toBeGreaterThan(20);
      expect(d.aciklama, `${d.id} açıklaması adın tekrarı`).not.toBe(d.ad);
    }
    expect(new Set(aciklamalar).size, 'açıklamalar tekil').toBe(aciklamalar.length);
  });

  it('iki sütunlu tipin adı yalın "Fransız" değil', () => {
    const t = IKI_SUTUN_TIPLERI[0];
    expect(t.ad).toContain('iki sütun');
    expect(t.ad).not.toBe('Fransız');
    /* `toContain` "…iki sütun…" geçen HER adı kabul ediyordu; tam ad
       arayüzde görünen dizgedir ve sessizce değişmemeli. */
    expect(t.ad).toBe('Fransız (iki sütun)');
    expect(t.id).toBe('goruntu-ses');
  });

  /* Sayfa=dakika bu yerleşimde GEÇERSİZ (§6.6): sayfa sayısı görüntü
     sütununun uzunluğuna da bağlı ve görüntü betimi ekranda zaman almaz. */
  it('iki sütunlu tipte sayfa=dakika geçersiz', () => {
    expect(IKI_SUTUN_TIPLERI[0].sayfaDakika).toBe(false);
  });

  /* Blok listesi AMERİKAN ÇEKİRDEĞİNİN AYNISI (kullanıcı kararı):
     "Amerikan formattaki presetler burada da olsun". Değişen şey blok
     tipleri değil, yerleşim — hangi sütuna düşecekleri. */
  it('iki sütunlu tip Amerikan çekirdeğinin AYNI bloklarını kullanıyor', () => {
    expect([...IKI_SUTUN_TIPLERI[0].bloklar].sort())
      .toEqual([...DOKUMAN_TIPLERI.senaryo.bloklar].sort());
  });

  /* `ad.length > 0` HİÇBİR ŞEY ÖLÇMÜYORDU: iki tipin adını takas eden ya da
     hepsini "x" yapan bir mutant da geçerdi — üstelik ad ile yapı birimi
     arayüzde YAN YANA görünüyor ("Roman / Bölüm"), takas anında yanlış
     etiket demek. Kayıt defteri BİREBİR çivileniyor. */
  it('kayıt defteri BİREBİR — ad, yapı birimi ve kimlik takas edilemez', () => {
    expect(Object.entries(DOKUMAN_TIPLERI).map(([anahtar, t]) =>
      [anahtar, t.id, t.ad, t.yapiAdi])).toEqual([
      ['senaryo', 'senaryo', 'Senaryo', 'Sahne'],
      ['dizi', 'dizi', 'Dizi bölümü', 'Bölüm'],
      ['sahne-oyunu', 'sahne-oyunu', 'Sahne oyunu', 'Perde'],
      ['radyo-oyunu', 'radyo-oyunu', 'Radyo oyunu', 'Sahne'],
      ['roman', 'roman', 'Roman', 'Bölüm'],
      ['cizgi-roman', 'cizgi-roman', 'Çizgi roman', 'Sayfa'],
      ['duz-metin', 'duz-metin', 'Düz metin', 'Paragraf'],
      ['fon-dosyasi', 'fon-dosyasi', 'Fon başvuru dosyası', 'Bölüm'],
      ['goruntu-ses', 'goruntu-ses', 'Fransız (iki sütun)', 'Sahne'],
    ]);
  });

  /* Blok listeleri de TAM: `length > 0` bir bloğun düşmesini ya da yanlış
     tipe sızmasını göremezdi — oysa liste hem menüyü hem profili hem de
     `bloguUyarla`nın "izin verilen" kümesini belirliyor. */
  it('her tipin blok listesi TAM — sıra ve içerik çivili', () => {
    expect(Object.fromEntries(
      Object.values(DOKUMAN_TIPLERI).map((t) => [t.id, t.bloklar]),
    )).toEqual({
      senaryo: ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'],
      dizi: ['bolum', 'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'],
      'sahne-oyunu': ['bolum', 'scene', 'sahne-yonergesi', 'character', 'parenthetical', 'dialogue'],
      'radyo-oyunu': ['scene', 'ses', 'muzik', 'character', 'parenthetical', 'dialogue'],
      roman: ['bolum', 'paragraf', 'dialogue'],
      'cizgi-roman': ['sayfa', 'kare', 'altyazi', 'character', 'balon'],
      'duz-metin': ['paragraf'],
      'fon-dosyasi': ['bolum', 'paragraf'],
      'goruntu-ses': ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'],
    });
  });

  /* Varsayılan blok ve yapı bloğu da TAM: aşağıdaki `toContain` iddiaları
     yalnız "listede var mı" diyordu — ikisini birbiriyle takas eden bir
     mutant (yeni belge sahne başlığıyla açılır) hayatta kalıyordu. */
  it('varsayılan blok ve yapı bloğu tipe göre TAM DEĞERİYLE', () => {
    expect(Object.fromEntries(Object.values(DOKUMAN_TIPLERI)
      .map((t) => [t.id, [t.varsayilanBlok, t.yapiBlogu]]))).toEqual({
      senaryo: ['action', 'scene'],
      dizi: ['action', 'bolum'],
      'sahne-oyunu': ['sahne-yonergesi', 'bolum'],
      'radyo-oyunu': ['dialogue', 'scene'],
      roman: ['paragraf', 'bolum'],
      'cizgi-roman': ['kare', 'sayfa'],
      'duz-metin': ['paragraf', 'paragraf'],
      'fon-dosyasi': ['paragraf', 'bolum'],
      'goruntu-ses': ['action', 'scene'],
    });
  });

  /* Varsayılan blok listede olmasaydı yeni belge daha ilk satırında
     geçersiz bir blokla başlardı. */
  it('varsayılan blok ve yapı bloğu, izin verilen listede', () => {
    for (const t of TEK_SUTUN) {
      expect(t.bloklar, `${t.id} varsayılan`).toContain(t.varsayilanBlok);
      expect(t.bloklar, `${t.id} yapı`).toContain(t.yapiBlogu);
    }
  });

  /* `toBeTruthy()` etiketlerin İÇERİĞİNİ hiç ölçmüyordu: hepsini "?" yapan
     ya da "Diyalog" ile "Aksiyon"u takas eden bir mutant menüyü tamamen
     yanlış gösterip testi geçerdi. Tablo bütünüyle çivileniyor. */
  it('blok etiket tablosu BİREBİR — menüdeki her satırın metni çivili', () => {
    expect(BLOK_ETIKETLERI).toEqual({
      scene: 'Sahne başlığı', action: 'Aksiyon', character: 'Karakter',
      parenthetical: 'Parantez', dialogue: 'Diyalog', transition: 'Geçiş',
      bolum: 'Bölüm', paragraf: 'Paragraf', sayfa: 'Sayfa', kare: 'Kare',
      altyazi: 'Altyazı', balon: 'Balon', 'sahne-yonergesi': 'Sahne yönergesi',
      ses: 'Ses', muzik: 'Müzik',
    });
  });

  it('her tipin her bloğunun DOLU ve BENZERSİZ bir etiketi var', () => {
    for (const t of TEK_SUTUN) {
      const etiketler = t.bloklar.map((b) => BLOK_ETIKETLERI[b]);
      for (const [i, b] of t.bloklar.entries()) {
        expect(BLOK_ETIKETLERI[b], `${t.id}/${b}`).toBeTruthy();
        expect(typeof etiketler[i], `${t.id}/${b}`).toBe('string');
        expect(etiketler[i]!.trim(), `${t.id}/${b} boş etiket`).not.toBe('');
      }
      /* Aynı menüde İKİ AYNI etiket olamaz: kullanıcı hangisini seçtiğini
         bilemez ve `baglamMenusu` testi sıralı karşılaştırma yaptığı için
         yineleme oradan sızabilirdi. */
      expect(new Set(etiketler).size, `${t.id} yinelenen etiket`).toBe(t.bloklar.length);
    }
  });

  /* Sayfa=dakika sözleşmesi romanda ve düz metinde GEÇERSİZ: sayfa süreyi
     ölçmez ve göstermek yazara olmayan bir bilgi vermek olurdu. */
  it('sayfa=dakika yalnız zamansal tiplerde', () => {
    expect(DOKUMAN_TIPLERI.senaryo.sayfaDakika).toBe(true);
    expect(DOKUMAN_TIPLERI.dizi.sayfaDakika).toBe(true);
    expect(DOKUMAN_TIPLERI.roman.sayfaDakika).toBe(false);
    expect(DOKUMAN_TIPLERI['duz-metin'].sayfaDakika).toBe(false);
    expect(DOKUMAN_TIPLERI['cizgi-roman'].sayfaDakika).toBe(false);
  });

  it('bilinmeyen ad SESSİZCE senaryoya düşmüyor', () => {
    expect(dokumanTipi('roman')).toBe(DOKUMAN_TIPLERI.roman);
    expect(dokumanTipi('yokolan')).toBeNull();
    expect(dokumanTipi(42)).toBeNull();
    expect(dokumanTipi(undefined)).toBeNull();
    /* Ad BELGEDEN geliyor (`meta.dokumanTipi`), yani güven sınırı: boş
       dizge, boşluk, satır sonu ve büyük/küçük varyantları AYRI anahtardır
       ve hiçbiri sessizce eşlenmemeli. */
    for (const kotu of ['', '   ', 'Roman', 'ROMAN', 'roman ', 'roman\n', 'român',
      null, true, [], {}, 0, NaN]) {
      expect(dokumanTipi(kotu), JSON.stringify(kotu)).toBeNull();
    }
    // Sekiz geçerli anahtarın sekizi de KENDİ nesnesini veriyor.
    for (const [anahtar, t] of Object.entries(DOKUMAN_TIPLERI)) {
      expect(dokumanTipi(anahtar), anahtar).toBe(t);
    }
  });

  /* PROTOTİP ANAHTARLARI — bulunan ve DÜZELTİLEN hata.
     `DOKUMAN_TIPLERI` düz bir nesne ve arama `in` ile yapıldığı sürece
     `Object.prototype` zincirine de bakıyordu. `meta.dokumanTipi ===
     'constructor'` yazan (elle kurcalanmış ya da bozuk içe aktarılmış) bir
     belge `null` DEĞİL, `Object` işlevini alıyordu; `tipProfili` de
     "Bilinmeyen dokuman tipi" hatasını bu anahtarlarda ATMIYORDU.
     `meta.dokumanTipi` belgeden geldiği için burası bir güven sınırı;
     `hasOwnProperty` denetimiyle kapatıldı (`format/izgara.ts` ve
     `format/yazi.ts` ile aynı düzeltme). */
  it('prototip anahtarları null dönüyor ve profil FIRLATIYOR', () => {
    for (const sizan of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(dokumanTipi(sizan), sizan).toBeNull();
      expect(() => tipProfili(sizan, 'letter', 'tr'), sizan).toThrow();
    }
  });
});

describe('blok uyarlama — metin KAYBOLMUYOR', () => {
  /* Kullanıcı bir romanı senaryoya çevirdiğinde metnini kaybetmemeli:
     izin verilmeyen blok düşürülmüyor, varsayılana çevriliyor. */
  it('izin verilmeyen blok varsayılana çevriliyor', () => {
    expect(bloguUyarla(DOKUMAN_TIPLERI.roman, 'transition')).toBe('paragraf');
    expect(bloguUyarla(DOKUMAN_TIPLERI['duz-metin'], 'scene')).toBe('paragraf');
  });

  it('izin verilen blok AYNEN kalıyor', () => {
    expect(bloguUyarla(DOKUMAN_TIPLERI.senaryo, 'dialogue')).toBe('dialogue');
    expect(bloguUyarla(DOKUMAN_TIPLERI['cizgi-roman'], 'balon')).toBe('balon');
  });
});

describe('tip profilleri', () => {
  it('her tipin profili kuruluyor ve kendi bloklarını tanımlıyor', () => {
    /* İki sütunlu tipin profili de KURULUYOR (aşağıda ayrı test): ortak
       olan kağıt geometrisi ve dil. Blok iddiası yalnız tek sütunlulara
       ait — o tipin blok tablosu boş. */
    for (const t of Object.values(DOKUMAN_TIPLERI)) {
      expect(() => tipProfili(t.id, 'letter', 'tr'), t.id).not.toThrow();
    }
    for (const t of TEK_SUTUN) {
      const profil = tipProfili(t.id, 'letter', 'tr');
      for (const b of t.bloklar) {
        expect(profil.bloklar[b], `${t.id}/${b}`).toBeDefined();
      }
      /* `toBeDefined()` yalnız EKSİĞİ görüyordu, FAZLAYI değil: profile
         tipe ait olmayan bir blok sızarsa kullanıcı yanlış tipte yazdığını
         fark etmez (aşağıdaki "sayfalayıcıda AÇIKÇA fırlıyor" sözü de o
         bloklar için sessizce geçersizleşirdi). Küme TAM eşleşiyor. */
      expect(Object.keys(profil.bloklar).sort(), `${t.id} blok kümesi`)
        .toEqual([...t.bloklar].sort());
    }
  });

  /* Sessizce senaryoya düşseydi kullanıcı roman yazdığını sanıp senaryo
     girintileriyle basılmış bir dosya teslim ederdi. */
  it('bilinmeyen tip FIRLATIYOR', () => {
    expect(() => tipProfili('yokolan', 'letter', 'tr')).toThrow(/Bilinmeyen dokuman tipi/);
  });

  /* §6.3 kağıt geometrisi teslim standardı: roman da senaryo da aynı
     kağıda basılıyor. */
  it('geometri tipe göre DEĞİŞMİYOR', () => {
    const a = tipProfili('senaryo', 'letter', 'tr').geometri;
    const b = tipProfili('roman', 'letter', 'tr').geometri;
    expect(b).toEqual(a);
  });

  /* İki sütunlu belge `sayfala` ile DEĞİL `sayfalaIkiSutun` ile
     sayfalanıyor — ayrı motor, ayrı test (iki-sutun.test.ts). */
  it('tek sütunlu her tip kendi bloklarıyla SAYFALANIYOR', () => {
    for (const t of TEK_SUTUN) {
      const profil = tipProfili(t.id, 'letter', 'tr');
      const bloklar = t.bloklar.map((b) => blok(b, `${b} içeriği`));
      expect(() => sayfala(bloklar, profil), t.id).not.toThrow();
      /* `> 0` sayfa sayısını hiç ölçmüyordu; bu girdide (tip başına birer
         blok) sonuç HER tipte tam bir sayfadır. İki sayfa çıkarsa bir blok
         zorla yeni sayfa açıyor demektir ve o sessizce geçerdi. */
      const sayfalar = sayfala(bloklar, profil);
      expect(sayfalar.length, t.id).toBe(1);
      // Hiçbir blok DÜŞMÜYOR: her bloğun en az bir satırı sayfada.
      const gorulen = new Set(sayfalar.flatMap((s) => s.satirlar.map((r) => r.blockId)));
      expect(gorulen.size, `${t.id} kayıp blok`).toBe(bloklar.length);
    }
  });

  /* ÖLÇEK: tip başına birer blokla çalışan test, sayfa sınırına hiç
     dayanmıyordu. Beş yüz bloklu bir belgede de tipin bütün blokları
     sayfalanabilmeli ve TEK bir satır bile kaybolmamalı. */
  it('tek sütunlu her tip ÖLÇEKTE de sayfalanıyor — 500 blok, kayıp yok', () => {
    for (const t of TEK_SUTUN) {
      const profil = tipProfili(t.id, 'letter', 'tr');
      const bloklar = Array.from({ length: 500 }, (_, i) => {
        const tip = t.bloklar[i % t.bloklar.length]!;
        return { id: `b${i}`, fp: `${tip}${i}`, type: tip, text: `${tip} içeriği ${i}`,
          scene: '', sceneId: `sc${Math.floor(i / 10)}` } as ScriptBlock;
      });
      const sayfalar = sayfala(bloklar, profil);
      expect(sayfalar.length, `${t.id} sayfa sayısı`).toBeGreaterThan(1);
      const gorulen = new Set(sayfalar.flatMap((s) => s.satirlar.map((r) => r.blockId)));
      expect(gorulen.size, `${t.id} kayıp blok`).toBe(500);
      for (const s of sayfalar) {
        expect(s.satirlar.length, `${t.id} taşan sayfa`).toBeLessThanOrEqual(profil.satirSayisi);
      }
    }
  });

  /* Tanımsız blok SESSİZCE varsayılan bir stile düşmüyor: düşseydi
     kullanıcının yanlış tipte yazdığı gizlenirdi. */
  it('tipe ait olmayan blok sayfalayıcıda AÇIKÇA fırlıyor', () => {
    const profil = tipProfili('roman', 'letter', 'tr');
    expect(() => sayfala([blok('transition')], profil)).toThrow(/tanimsiz blok tipi/i);
  });
});

describe('tipler arası ayrım anlamlı', () => {
  it('dizi, senaryodan YALNIZ bölüm bloğuyla ayrılıyor', () => {
    expect(DOKUMAN_TIPLERI.dizi.bloklar).toContain('bolum');
    expect(DOKUMAN_TIPLERI.senaryo.bloklar).not.toContain('bolum');
    /* "İçeriyor / içermiyor" ikilisi, diziye BAŞKA blokların da eklenmesini
       ya da senaryodan blok düşmesini görmezdi. Fark TAM OLARAK bir eleman:
       iki tip arasındaki simetrik fark `['bolum']`. */
    const dizi = new Set(DOKUMAN_TIPLERI.dizi.bloklar);
    const senaryo = new Set(DOKUMAN_TIPLERI.senaryo.bloklar);
    expect([...dizi].filter((b) => !senaryo.has(b))).toEqual(['bolum']);
    expect([...senaryo].filter((b) => !dizi.has(b))).toEqual([]);
  });

  /* Tiyatroda yazılan şey kameranın gördüğü değil, oyuncuya verilen
     yönergedir. */
  it('sahne oyununda aksiyon yerine SAHNE YÖNERGESİ var', () => {
    const t = DOKUMAN_TIPLERI['sahne-oyunu'];
    expect(t.bloklar).toContain('sahne-yonergesi');
    expect(t.bloklar).not.toContain('action');
    /* Ayrım yalnız listede değil, VARSAYILANDA da olmalı: `action`ı listeden
       çıkarıp varsayılan olarak bırakan bir mutant yukarıdaki iki iddiayı
       geçer ve yeni belgeyi geçersiz bir blokla açardı. */
    expect(t.varsayilanBlok).toBe('sahne-yonergesi');
    expect(t.bloklar).not.toContain('transition');
  });

  it('sahne yönergesi İTALİK — söylenen sözden ayrılmalı', () => {
    const p = tipProfili('sahne-oyunu', 'letter', 'tr');
    expect(p.bloklar['sahne-yonergesi']!.italik).toBe(true);
  });

  /* Yayında teknik yönergenin seslendirilen metinle karışması pahalıdır. */
  it('radyo oyununda ses ve müzik BÜYÜK HARF', () => {
    const p = tipProfili('radyo-oyunu', 'letter', 'tr');
    expect(p.bloklar.ses!.buyukHarf).toBe(true);
    expect(p.bloklar.muzik!.buyukHarf).toBe(true);
  });

  /* Çizgi romanda sayfa ANLATI birimidir, yalnız kağıt değil. */
  it('çizgi romanda sayfa yeni sayfada başlıyor', () => {
    const p = tipProfili('cizgi-roman', 'letter', 'tr');
    expect(p.bloklar.sayfa!.yeniSayfada).toBe(true);
    expect(DOKUMAN_TIPLERI['cizgi-roman'].yapiBlogu).toBe('sayfa');
  });

  it('düz metin TEK blok tipiyle çalışıyor', () => {
    expect(DOKUMAN_TIPLERI['duz-metin'].bloklar).toEqual(['paragraf']);
  });
});

describe('tip belgede saklanıyor', () => {
  /* Tip PROJENİN özelliği, o oturumun tercihi değil: ortak çalışan da aynı
     tipi görmeli, yoksa iki kişi aynı belgeyi iki farklı formatta yazardı. */
  it('tip belgeye yazılıyor ve okunuyor', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    M.setDokumanTipi(doc, 'roman');
    expect(docToProject(doc).meta.dokumanTipi).toBe('roman');
  });

  /* Otomatik dönüştürme kullanıcının metnini haber vermeden yeniden
     biçimlendirmek olurdu ve geri alınca eski hâline dönmesi garanti
     edilemezdi. */
  it('tip değişimi BLOKLARI dönüştürmüyor', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    M.setScript(doc, { name: 's', blocks: [blok('scene', 'İÇ. ODA'), blok('action', 'Girer.')] });
    M.setDokumanTipi(doc, 'roman');
    expect(docToProject(doc).script.blocks.map((b) => b.type)).toEqual(['scene', 'action']);
  });

  it('tip değişimi GERİ ALINABİLİYOR', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    const undo = new Y.UndoManager([doc.getMap('meta')], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    M.setDokumanTipi(doc, 'roman');
    undo.undo();
    expect(docToProject(doc).meta.dokumanTipi).toBeUndefined();
  });

  /* F7'den önce her belge senaryoydu; varsayımı değiştirmek eski dosyaları
     başka bir formatta açardı. */
  it('eski projede alan YOK — okuyucu senaryo varsayıyor', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    expect(docToProject(doc).meta.dokumanTipi).toBeUndefined();
    expect(dokumanTipi(docToProject(doc).meta.dokumanTipi)).toBeNull();
  });
});

describe('tip menüyü ve süreyi belirliyor', () => {
  /* Menüde roman bloğu gören bir senaryo yazarı onu seçer ve profilde
     karşılığı olmadığı için sayfalayıcı fırlatır. */
  it('her tipin menüsü YALNIZ kendi bloklarını gösteriyor', () => {
    for (const t of Object.values(DOKUMAN_TIPLERI)) {
      const etiketler = baglamMenusu({
        secimVar: true, panoDolu: false, duzenlenebilir: true,
        seciliSatir: 1, bagliPanelVar: false, denetimVar: false,
        izinliBloklar: t.bloklar,
      }).flat().filter((x) => x.eylem.tur === 'blok-tipi').map((x) => x.etiket);

      expect(etiketler.sort(), t.id).toEqual(t.bloklar.map((b) => BLOK_ETIKETLERI[b]).sort());
    }
  });

  /* Romanda sayfa süreyi ölçmez; göstermek yazara olmayan bir bilgi
     vermek olurdu (§6.6 Fransız yerleşimi kararının aynısı). */
  it('süre sözleşmesi tipe göre — zamansal olmayanlarda YOK', () => {
    const zamansal = Object.values(DOKUMAN_TIPLERI).filter((t) => t.sayfaDakika).map((t) => t.id);
    expect(zamansal.sort()).toEqual(['dizi', 'radyo-oyunu', 'sahne-oyunu', 'senaryo']);
  });
});
