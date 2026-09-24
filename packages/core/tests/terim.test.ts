import { describe, expect, it } from 'vitest';
import { TERIMLER, sahneBasligiAyristir, sahneBasligiBicimle } from '@storyboard/core/format/terim';

describe('terim tabloları', () => {
  /* `toBeTruthy()` HİÇBİR MUTASYONU ÖLDÜRMÜYORDU: `ic`/`dis`'i takas eden
     ya da hepsini "X" yapan bir tablo da geçerdi — üstelik bu tablo hem
     ayrıştırmanın hem biçimlemenin TEK kaynağı, yani takas anında bütün
     senaryolar yanlış mekânla okunurdu. Tablo BÜTÜNÜYLE çivileniyor:
     fazladan bir dil ya da düşen bir zaman terimi de yakalanır. */
  it('terim tablosu BİREBİR — iki dil, iki mekân, dört zaman', () => {
    expect(TERIMLER).toEqual({
      tr: {
        mekan: { ic: 'İÇ', dis: 'DIŞ' },
        zaman: { gunduz: 'GÜN', gece: 'GECE', safak: 'ŞAFAK VAKTİ', aksam: 'AKŞAM' },
        /* Döküm etiketleri de tabloda: dışa aktarılan CSV/Markdown BELGE
           dilini konuşuyor (karar 2026-08-31) ve bu tablo onun da tek
           kaynağı. Buraya çivilenmezse bir etiket düşerse kimse görmez. */
        dokum: {
          sahne: 'Sahne', baslik: 'Başlık', icDis: 'İç/Dış', mekan: 'Mekân',
          zaman: 'Zaman', karakterler: 'Karakterler',
          sure: 'Süre tahmini', sureDk: 'Süre tahmini (dk)', dakikaKisa: 'dk',
          ozelEsya: 'Özel eşya', kostum: 'Kostüm', efekt: 'Efekt', notlar: 'Notlar',
          otomatik: 'Otomatik toplanan', elle: 'Elle girilen', yok: 'yok',
        },
        /* Fon başvuru dosyasının türetilmiş bölümlerindeki etiketler de
           BELGE dilinde: dosya kuruma gidiyor. Dökümle aynı gerekçe. */
        fon: {
          kunye: 'Künye', yazar: 'Yazan', tarih: 'Tarih', toplamSayfa: 'Toplam sayfa',
          sure: 'Süre (tahmini)',
          sureOlculemez: 'Bu belge tipinde sayfa süreyi ölçmez; süre yazılmıyor.',
          sahneListesi: 'Sahne listesi', neOluyor: '[bu sahnede ne oluyor?]',
          karakterDosyasi: 'Karakterler', replik: 'replik', kelime: 'kelime',
          sahneAraligi: 'sahne', mekanListesi: 'Mekânlar', sahneSayisi: 'sahne',
          butceSinyalleri: 'Bütçe sinyalleri',
          butceUyarisi: 'Bu liste bütçe DEĞİLDİR; bütçeyi etkileyen, senaryodan ölçülmüş sinyallerdir.',
          toplamMekan: 'Toplam mekân', icDisDagilimi: 'İç / Dış',
          geceKumesi: 'Gece kümesi',
        },
      },
      en: {
        mekan: { ic: 'INT.', dis: 'EXT.' },
        zaman: { gunduz: 'DAY', gece: 'NIGHT', safak: 'DAWN', aksam: 'DUSK' },
        dokum: {
          sahne: 'Scene', baslik: 'Heading', icDis: 'Int/Ext', mekan: 'Location',
          zaman: 'Time', karakterler: 'Characters',
          sure: 'Estimated time', sureDk: 'Estimated time (min)', dakikaKisa: 'min',
          ozelEsya: 'Props', kostum: 'Costume', efekt: 'Effects', notlar: 'Notes',
          otomatik: 'Collected automatically', elle: 'Entered manually', yok: 'none',
        },
        fon: {
          kunye: 'Project details', yazar: 'Written by', tarih: 'Date',
          toplamSayfa: 'Total pages', sure: 'Running time (estimated)',
          sureOlculemez: 'Pages do not measure time in this document type; no running time is given.',
          sahneListesi: 'Scene list', neOluyor: '[what happens in this scene?]',
          karakterDosyasi: 'Characters', replik: 'lines', kelime: 'words',
          sahneAraligi: 'scenes', mekanListesi: 'Locations', sahneSayisi: 'scenes',
          butceSinyalleri: 'Budget signals',
          butceUyarisi: 'This is NOT a budget; these are measured signals from the script that drive one.',
          toplamMekan: 'Locations in total', icDisDagilimi: 'Int / Ext',
          geceKumesi: 'Night clusters',
        },
      },
    });
  });

  /* Tablonun tamamı NFC: `NFD girdide mekân ve zaman KAYBOLMAZ` testi bu
     varsayıma dayanıyor ve varsayım hiçbir yerde iddia edilmemişti. Bir
     terim NFD yazılırsa o test sessizce anlamsızlaşır. */
  it('bütün terimler NFC — karşılaştırmanın dayandığı varsayım', () => {
    for (const dil of ['tr', 'en'] as const) {
      for (const grup of ['mekan', 'zaman', 'dokum', 'fon'] as const) {
        for (const [k, v] of Object.entries(TERIMLER[dil][grup])) {
          expect(v, `${dil}.${grup}.${k}`).toBe((v as string).normalize('NFC'));
          expect((v as string).trim(), `${dil}.${grup}.${k} kırpılmamış`).toBe(v);
        }
      }
    }
  });

  it('Türkçe terimler kaynaklı hâliyle yazılır', () => {
    /* NOKTA YOK — kullanıcı düzeltmesi. İngilizcede INT./EXT. birer
       KISALTMADIR (interior/exterior) ve nokta kısaltmanın işaretidir;
       Türkçe İÇ ve DIŞ tam kelimelerdir. Üstelik nokta orada ayraç gibi
       okunup başlığın gerisi `-` ile devam ediyordu: tek başlıkta iki
       ayrı ayraç. */
    expect(TERIMLER.tr.mekan.ic).toBe('İÇ');
    expect(TERIMLER.tr.mekan.dis).toBe('DIŞ');
    expect(TERIMLER.en.mekan.ic).toBe('INT.');
    expect(TERIMLER.tr.zaman.gunduz).toBe('GÜN');
    expect(TERIMLER.tr.zaman.gece).toBe('GECE');
    expect(TERIMLER.tr.zaman.safak).toBe('ŞAFAK VAKTİ');
  });

  // Karar 8: test dosyaları tip denetlenmiyor. Tablonun `Record<DilAdi, ...>`
  // tipi bekçi değil belgeleyicidir; her alan çalışma zamanında sınanır.
  it('kalan Türkçe alan da kaynaklı hâliyle yazılır', () => {
    expect(TERIMLER.tr.zaman.aksam).toBe('AKŞAM');
  });

  it('İngilizce terimler sektör yazımıyla yazılır', () => {
    expect(TERIMLER.en.mekan.ic).toBe('INT.');
    expect(TERIMLER.en.mekan.dis).toBe('EXT.');
    expect(TERIMLER.en.zaman.gunduz).toBe('DAY');
    expect(TERIMLER.en.zaman.gece).toBe('NIGHT');
    expect(TERIMLER.en.zaman.safak).toBe('DAWN');
    expect(TERIMLER.en.zaman.aksam).toBe('DUSK');
  });
});

describe('sahneBasligiAyristir', () => {
  it('İngilizce sahne başlığını parçalar', () => {
    const p = sahneBasligiAyristir('INT. KITCHEN - DAY', 'en');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('KITCHEN');
    expect(p.zaman).toBe('gunduz');
  });

  it('Türkçe sahne başlığını parçalar', () => {
    const p = sahneBasligiAyristir('DIŞ - SOKAK - GECE', 'tr');
    expect(p.mekan).toBe('dis');
    expect(p.yer).toBe('SOKAK');
    expect(p.zaman).toBe('gece');
  });

  it('küçük harfli Türkçe girdiyi de tanır — i/İ tuzağı', () => {
    const p = sahneBasligiAyristir('iç. mutfak - gece', 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.zaman).toBe('gece');
  });

  it('tanınmayan girdiyi YUTMAZ — ham metni yer alanında korur', () => {
    const p = sahneBasligiAyristir('BİR YERDE, BİR ZAMAN', 'tr');
    expect(p.mekan).toBeUndefined();
    expect(p.zaman).toBeUndefined();
    expect(p.yer).toBe('BİR YERDE, BİR ZAMAN');
  });

  it('zamanı olmayan başlığı kabul eder', () => {
    const p = sahneBasligiAyristir('İÇ - MUTFAK', 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('MUTFAK');
    expect(p.zaman).toBeUndefined();
  });

  it('yer adındaki tireyi zaman ayıracıyla karıştırmaz', () => {
    const p = sahneBasligiAyristir('İÇ - KAFE - MERKEZ - GECE', 'tr');
    expect(p.yer).toBe('KAFE - MERKEZ');
    expect(p.zaman).toBe('gece');
  });

  // K-1: yutmama ilkesinin ZAMAN dalı. Kuyruk hiçbir zaman terimiyle
  // eşleşmediğinde `yer` bölünmez — 'MERKEZ' sessizce düşemez.
  it('zaman eşleşmeyince tireli yer adını YUTMAZ', () => {
    const p = sahneBasligiAyristir('İÇ - KAFE - MERKEZ', 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('KAFE - MERKEZ');
    expect(p.zaman).toBeUndefined();
  });

  // Ö-1: kuyruk karşılaştırması TAM EŞİTLİKTİR; boş kuyruk zaman uydurmaz.
  it('boş kuyruktan zaman uydurmaz', () => {
    const p = sahneBasligiAyristir('İÇ - MUTFAK -', 'tr');
    expect(p.zaman).toBeUndefined();
    expect(p.yer).toBe('MUTFAK -');
  });

  // Ö-2: mekân terimi BAŞTA olmalı; ortada geçen terim başlığı tanınmış saymaz.
  it('mekân terimi başta değilse başlığı tanımaz', () => {
    const p = sahneBasligiAyristir('BUGÜN İÇ - MUTFAK - GECE', 'tr');
    expect(p.mekan).toBeUndefined();
    expect(p.zaman).toBeUndefined();
    expect(p.yer).toBe('BUGÜN İÇ - MUTFAK - GECE');
  });

  // Ö-3 / Karar 11: yer adı boş olan başlıkta zaman AYRIŞTIRILMAZ; kalan metin
  // `yer` alanında aynen korunur. Boş `yer` üretmek yerine yutmama tercih edilir.
  /* Karar 11: yer adı boş kalacaksa zaman AYRIŞTIRILMAZ; kalan metin
     `yer` alanında aynen korunur. Yutmama ilkesi boş `yer` üretmeye ağır
     basar.

     Noktanın kalkması bir belirsizlik getirdi ve bu onun yüzü:
     `İÇ - GECE`'de tek bir parça var ve onun yer mi zaman mı olduğu
     ayrılamaz — nokta varken `İÇ.` ön ek olduğunu kendisi söylüyordu.
     Metni yutmak yerine yer sayıyoruz; yazar `İÇ - <yer> - GECE` yazdığı
     anda belirsizlik kalkıyor. */
  it('tek parça kalırsa zaman uydurulmuyor, metin korunuyor (Karar 11)', () => {
    const p = sahneBasligiAyristir('İÇ - GECE', 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('GECE');
    expect(p.zaman).toBeUndefined();
  });

  it('baştaki ve sondaki boşluğu kırpar', () => {
    const p = sahneBasligiAyristir('   DIŞ - PLAJ - AKŞAM   ', 'tr');
    expect(p.mekan).toBe('dis');
    expect(p.yer).toBe('PLAJ');
    expect(p.zaman).toBe('aksam');
  });

  it('tanınmayan girdide de boşluğu kırpar', () => {
    const p = sahneBasligiAyristir('   BİR YERDE   ', 'tr');
    expect(p.yer).toBe('BİR YERDE');
  });
});

describe('dil çevrimi', () => {
  it('bir dilde ayrıştırılan başlık başka dilde biçimlenir', () => {
    const p = sahneBasligiAyristir('INT. KITCHEN - NIGHT', 'en');
    expect(sahneBasligiBicimle(p, 'tr')).toBe('İÇ - KITCHEN - GECE');
  });

  it('gidiş-dönüş kayıpsızdır', () => {
    const ham = 'DIŞ - ORMAN - ŞAFAK VAKTİ';
    expect(sahneBasligiBicimle(sahneBasligiAyristir(ham, 'tr'), 'tr')).toBe(ham);
  });

  it('tanınmayan başlık biçimlemede de aynen korunur', () => {
    const ham = 'BİR YERDE, BİR ZAMAN';
    expect(sahneBasligiBicimle(sahneBasligiAyristir(ham, 'tr'), 'en')).toBe(ham);
  });

  it('Türkçe başlık İngilizce biçimlenir', () => {
    const p = sahneBasligiAyristir('DIŞ - PLAJ - AKŞAM', 'tr');
    expect(sahneBasligiBicimle(p, 'en')).toBe('EXT. PLAJ - DUSK');
  });

  it('zamansız başlık zaman uydurmadan biçimlenir', () => {
    const p = sahneBasligiAyristir('İÇ - MUTFAK', 'tr');
    expect(sahneBasligiBicimle(p, 'en')).toBe('INT. MUTFAK');
    expect(sahneBasligiBicimle(p, 'tr')).toBe('İÇ - MUTFAK');
  });

  // k-1: mekânsız parçada zaman KASITLI olarak düşer — ham metin korunur,
  // uydurma mekân terimi üretilmez. Tip değil, bu iddia bekçidir.
  it('mekânsız parçada zaman kasıtlı olarak düşer', () => {
    expect(sahneBasligiBicimle({ yer: 'X', zaman: 'gece' }, 'tr')).toBe('X');
  });

  it('gidiş-dönüş İngilizce tarafta da kayıpsızdır', () => {
    const ham = 'INT. KITCHEN - DAWN';
    expect(sahneBasligiBicimle(sahneBasligiAyristir(ham, 'en'), 'en')).toBe(ham);
  });

  /* --- NFC normalizasyonu (K-2): sessiz yanlış ayrıştırma --- */

  it('NFD gelen başlıkta mekân ve zaman KAYBOLMAZ', () => {
    // `TERIMLER`'in tamamı NFC (tarandı). NFD girdide karşılaştırma tutmaz ve
    // ayrıştırma HATA ATMADAN yarıda kalır: `mekan` ve `zaman` sessizce düşer,
    // kullanıcı sahne listesinde neden boş satır gördüğünü anlayamaz.
    // Metin sınıra dayanıyor: her üç alan da (`İÇ.` mekân öneki, `MUTFAK` yer,
    // `ŞAFAK VAKTİ` zaman kuyruğu) NFD'de bozulan harf içeriyor.
    const ham = 'İÇ. MUTFAK - ŞAFAK VAKTİ';
    expect(ham.normalize('NFD')).not.toBe(ham.normalize('NFC'));
    const nfd = sahneBasligiAyristir(ham.normalize('NFD'), 'tr');
    // Üç alan da AYRI AYRI iddia ediliyor — biri düşse yakalanır.
    expect(nfd.mekan).toBe('ic');
    expect(nfd.zaman).toBe('safak');
    expect(nfd.yer).toBe('MUTFAK');
    // NFD ve NFC girdi birebir aynı parçayı vermeli.
    expect(nfd).toEqual(sahneBasligiAyristir(ham.normalize('NFC'), 'tr'));
  });

  it('NFD girdide gidiş-dönüş NFC çıktı verir', () => {
    // `yer` alanı ham metinden diliniyor; normalize edilmezse NFD sızar ve
    // biçimlenen başlık görünüşte doğru ama kod birimi olarak farklı olur —
    // sayfalamaya giren metin de o olurdu (§6.5, Karar 23).
    const ham = 'DIŞ - İSTİKLAL CADDESİ - AKŞAM';
    const bicimli = sahneBasligiBicimle(
      sahneBasligiAyristir(ham.normalize('NFD'), 'tr'), 'tr');
    expect(bicimli).toBe(ham.normalize('NFC'));
    // Sadece eşitlik yetmez: çıktının FİİLEN NFC olduğunu da çivile.
    expect(bicimli).toBe(bicimli.normalize('NFC'));
    expect(bicimli).not.toBe(ham.normalize('NFD'));
  });
});


describe('ayraç TUTARLI — kullanıcı kuralı', () => {
  /* "Neyle başlarsan onunla devam etmen zorunludur." Önceki hâli
     `İÇ. MUTFAK - GECE` üretiyordu: nokta ile başlayıp tire ile devam
     eden, kendi içinde tutarsız bir başlık. */
  it('Türkçe başlık tek ayraçla kuruluyor', () => {
    expect(sahneBasligiBicimle(
      { mekan: 'ic', yer: 'MUTFAK', zaman: 'gece', ayirac: '-' }, 'tr',
    )).toBe('İÇ - MUTFAK - GECE');
  });

  /* Yazarın ayracı KORUNUYOR: `/` ile yazan birinin başlığı çeviride ya da
     yeniden biçimlemede sessizce `-`'ye dönmemeli. */
  it('eğik çizgi tespit ediliyor ve korunuyor', () => {
    const p = sahneBasligiAyristir('İÇ / MUTFAK / GECE', 'tr');
    expect(p.ayirac).toBe('/');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('MUTFAK');
    expect(p.zaman).toBe('gece');
    expect(sahneBasligiBicimle(p, 'tr')).toBe('İÇ / MUTFAK / GECE');
  });

  /* İngilizce BUNDAN MUAF: `INT.` bir kısaltmadır, oradaki nokta ayraç
     değildir ve `INT. KITCHEN - DAY` sektörün yerleşik yazımıdır. */
  it('İngilizce kısaltma kendi noktasını koruyor', () => {
    expect(sahneBasligiBicimle(
      { mekan: 'ic', yer: 'KITCHEN', zaman: 'gunduz', ayirac: '-' }, 'en',
    )).toBe('INT. KITCHEN - DAY');
  });

  /* Eski belgelerde `İÇ.` yazılı ve o metin YUTULMAMALI — yazarken artık
     üretilmiyor ama okunuyor. */
  it('noktalı eski yazım hâlâ okunuyor', () => {
    const p = sahneBasligiAyristir('İÇ. MUTFAK - GECE', 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('MUTFAK');
    expect(p.zaman).toBe('gece');
  });

  /* `İÇERİDE` sahne başlığı DEĞİLDİR: terimle başlıyor diye öyle
     sayılırsa yazarın cümlesi başlığa dönüşür. */
  it('terimle başlayan sıradan kelime sahne sayılmıyor', () => {
    const p = sahneBasligiAyristir('İÇERİDE KİMSE YOK', 'tr');
    expect(p.mekan).toBeUndefined();
    expect(p.yer).toBe('İÇERİDE KİMSE YOK');
  });
});

describe('gerçek senaryolardan çıkan kurallar', () => {
  /* ÖLÇÜLDÜ (2001: A Space Odyssey — 14 başlık): gerçek senaryolar sahne
     başlığında UZUN TİRE kullanıyor. Yalnız `-` arasaydık o başlıkların
     zamanı sessizce ayrıştırılamaz, üstveri kaybolurdu.
     Okuma esnek, yazma katı — `İÇ.` yazımındaki kararın aynısı. */
  it('uzun tire ayraç olarak OKUNUYOR', () => {
    const p = sahneBasligiAyristir('EXT. THE STREAM – DAY', 'en');
    expect(p.mekan).toBe('dis');
    expect(p.yer).toBe('THE STREAM');
    expect(p.zaman).toBe('gunduz');
  });

  /* `INT. / EXT. CAVES – MOONWATCHER`: `/` mekân teriminin İÇİNDE geçiyor
     ve zaman ayracı ondan sonraki. İlk ayracı almak `/` seçip yanlış
     yerden bölerdi. */
  it('ayraç SON geçen — mekân terimindeki eğik çizgi yanıltmıyor', () => {
    const p = sahneBasligiAyristir('EXT. CAVES – NIGHT', 'en');
    expect(p.ayirac).toBe('–');
    expect(p.zaman).toBe('gece');
  });

  /* Yazarın ayracı KORUNUYOR: kendi belgesi elinde başka bir şeye
     dönüşmemeli. */
  it('okunan ayraç yeniden biçimlemede korunuyor', () => {
    const p = sahneBasligiAyristir('DIŞ / PLAJ / AKŞAM', 'tr');
    expect(sahneBasligiBicimle(p, 'tr')).toBe('DIŞ / PLAJ / AKŞAM');
  });
});

describe('Türkçe yaygın yazım — MEKÂN İÇ/DIŞ ZAMAN', () => {
  /* ÖLÇÜLDÜ (Küçük Kıyamet, Doğu Yücel — çekilmiş uzun metraj):
     83 sahne başlığının 83'ü bu sırada ve neredeyse hiçbirinde ayraç yok.
     Ayrıştırıcı yalnız BAŞTA duran terimi arıyordu; 83'ün 83'ü kaçıyor,
     hepsi `character` tipleniyordu — içe aktarımda senaryonun bütün yapısı
     bozuluyordu.

     Program bu sırayı YAZMIYOR (kullanıcının yazımı öndeki terim); ama
     yazılmış belgeyi anlıyor. Okuma esnek, yazma katı. */
  it('mekân önde, terim ortada, zaman sonda', () => {
    for (const [metin, yer, zaman] of [
      ['SALON İÇ GÜN', 'SALON', 'gunduz'],
      ['EV ÖNÜ DIŞ GÜNDÜZ', 'EV ÖNÜ', 'gunduz'],
      ['ORMAN DIŞ GÜN', 'ORMAN', 'gunduz'],
      ['EV ÜST KAT İÇ AKŞAMÜSTÜ', 'EV ÜST KAT', 'aksam'],
    ] as const) {
      const p = sahneBasligiAyristir(metin, 'tr');
      expect(p.yer, metin).toBe(yer);
      expect(p.zaman, metin).toBe(zaman);
      /* Mekân da AYRIŞMALI: ölçülen 83 başlığın hepsi `character` olarak
         tipleniyordu ve hata tam olarak `mekan`ın düşmesiydi — o alan
         iddia edilmeden bu testin ölçtüğü şey eksik kalıyordu. */
      expect(p.mekan, metin).toBe(metin.includes(' DIŞ ') ? 'dis' : 'ic');
    }
  });

  /* `YOL ARABA İÇ DIŞ GÜN`: ikisi de var, zamanı belirleyen SONUNCUSU. */
  it('iki terim varsa sondaki geçerli', () => {
    const p = sahneBasligiAyristir('YOL ARABA İÇ DIŞ GÜN', 'tr');
    expect(p.mekan).toBe('dis');
    expect(p.yer).toBe('YOL ARABA İÇ');
  });

  /* Zaman terimi niteleyiciyle sürebilir; düzeltme işareti ve kırılmaz
     boşluk PDF'ten gelen gerçek metinde VAR ve eşleşmeyi sessizce
     düşürüyordu (83'ün 23'ü bu yüzden kaçıyordu). */
  it('niteleyici, düzeltme işareti ve kırılmaz boşluk eşleşmeyi bozmuyor', () => {
    expect(sahneBasligiAyristir('SALON İÇ GECE KARANLIK', 'tr').zaman).toBe('gece');
    expect(sahneBasligiAyristir('SALON İÇ GECE*', 'tr').zaman).toBe('gece');
    expect(sahneBasligiAyristir('BALKON DIŞ GÜN BATIMI', 'tr').zaman).toBe('aksam');
  });

  /* YANLIŞ POZİTİF KORUMASI: zaman koşulu olmasa "içmek" fiili geçen her
     cümle sahne başlığına dönerdi. */
  it('zamanla bitmeyen cümle sahne başlığı DEĞİL — metin de YUTULMUYOR', () => {
    for (const t of ['İÇ ŞUNU', 'DIŞARIDA YAĞMUR VAR', 'ZEKİ İÇ GEÇİRDİ']) {
      const p = sahneBasligiAyristir(t, 'tr');
      expect(p.mekan, t).toBeUndefined();
      /* Yalnız `mekan`ın boş olması yetmiyordu: metni `yer`e koymayan ya da
         yarısını kesen bir mutant (Karar 11 ihlali) hayatta kalıyordu.
         Yutmama ilkesi HER dalda ayrı ayrı iddia ediliyor. */
      expect(p.zaman, t).toBeUndefined();
      expect(p.yer, t).toBe(t);
    }
  });

  /* Kuyruk zaman terimiyle BAŞLAMALI, içermesi yetmez: `İÇ ÇEKTİ VE GÜN
     BATIMINA BAKTI` içerir ama başlık değildir. Bu sınır yüzünden
     `ENKAZ ALTI İÇ KARANLIK AMA "GÜN"` gibi serbest yazılmış başlıklar
     tanınmıyor — bilinçli takas: yanlış tanımaktansa tanımamak. */
  it('zaman terimi kuyruğun İÇİNDE ise başlık sayılmıyor', () => {
    const p = sahneBasligiAyristir('İÇ ÇEKTİ VE GÜN BATIMINA BAKTI', 'tr');
    expect(p.mekan).toBeUndefined();
    // Cümle AYNEN korunuyor — yakalanmayan başlık yutulmuş sayılmaz.
    expect(p.zaman).toBeUndefined();
    expect(p.yer).toBe('İÇ ÇEKTİ VE GÜN BATIMINA BAKTI');
  });

  /* Yaygın yazım dalı da NFD"ye dayanıklı olmalı: `SALON İÇ GÜN` PDF"ten
     kopyalandığında NFD gelebilir ve `İÇ` ile `GÜN` ikisi de NFD"de bozulan
     harf taşıyor. Bu dal için NFC testi hiç yoktu — `İÇ. MUTFAK - ŞAFAK
     VAKTİ` testi yalnız ÖNDEKİ terim yolunu ölçüyordu. */
  it('NFD gelen YAYGIN YAZIM da doğru ayrışıyor', () => {
    for (const ham of ['SALON İÇ GÜN', 'EV ÖNÜ DIŞ GÜNDÜZ', 'EV ÜST KAT İÇ AKŞAMÜSTÜ']) {
      expect(ham.normalize('NFD'), ham).not.toBe(ham.normalize('NFC'));
      expect(sahneBasligiAyristir(ham.normalize('NFD'), 'tr'), ham)
        .toEqual(sahneBasligiAyristir(ham.normalize('NFC'), 'tr'));
    }
  });
});

describe('ayrıştırıcı UÇ DURUMLARI — girdi doğrudan editörden geliyor', () => {
  /* Bu girdilerin hiçbiri için iddia yoktu; hepsi editörde YAZILABİLİR
     (yapıştırma, boş satır, emoji, uzun başlık) ve ayrıştırıcı çökerse
     sahne listesi tamamen kaybolur. */
  it('boş ve yalnız boşluktan ibaret başlık çökmüyor, boş yer veriyor', () => {
    for (const bos of ['', '   ', '\t', '\n', '\r\n']) {
      const p = sahneBasligiAyristir(bos, 'tr');
      expect(p.yer, JSON.stringify(bos)).toBe('');
      expect(p.mekan, JSON.stringify(bos)).toBeUndefined();
      expect(p.zaman, JSON.stringify(bos)).toBeUndefined();
      expect(sahneBasligiBicimle(p, 'tr'), JSON.stringify(bos)).toBe('');
    }
  });

  it('satır sonu KIRPILIYOR ama İÇ satır sonu yutulmuyor', () => {
    // Sondaki CRLF baştaki/sondaki boşluk kırpmasına dahil.
    expect(sahneBasligiAyristir('İÇ. MUTFAK - GECE\r\n', 'tr'))
      .toEqual(sahneBasligiAyristir('İÇ. MUTFAK - GECE', 'tr'));
    // Ortadaki satır sonu METNİN PARÇASI: yutulmadan `yer`de kalıyor.
    const p = sahneBasligiAyristir('İÇ. MUTFAK\nDIŞ. SOKAK', 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.yer).toBe('MUTFAK\nDIŞ. SOKAK');
  });

  it('emoji ve ZWJ birleşimi yer adında KORUNUYOR', () => {
    const p = sahneBasligiAyristir('İÇ. 😀 ODA - GECE', 'tr');
    expect(p).toEqual({ mekan: 'ic', yer: '😀 ODA', zaman: 'gece', ayirac: '-' });
    // Astral düzlem yarım kesilmiyor: gidiş-dönüş kayıpsız.
    expect(sahneBasligiBicimle(p, 'tr')).toBe('İÇ - 😀 ODA - GECE');
    const aile = sahneBasligiAyristir('DIŞ - 👨‍👩‍👧 PARKI - GÜN', 'tr');
    expect(aile.yer).toBe('👨‍👩‍👧 PARKI');
    expect(aile.zaman).toBe('gunduz');
  });

  it('çok uzun başlık kırpılmadan ayrışıyor — sessiz kesme yok', () => {
    const yer = 'A'.repeat(5000);
    const p = sahneBasligiAyristir(`İÇ - ${yer} - GECE`, 'tr');
    expect(p.mekan).toBe('ic');
    expect(p.zaman).toBe('gece');
    expect(p.yer).toHaveLength(5000);
    expect(sahneBasligiBicimle(p, 'tr')).toBe(`İÇ - ${yer} - GECE`);
  });

  it('ÖLÇEK: beş bin başlık gidiş-dönüşte kayıpsız', () => {
    for (let i = 0; i < 5000; i++) {
      const ham = `${i % 2 ? 'İÇ' : 'DIŞ'} - MEKÂN ${i} - ${
        ['GÜN', 'GECE', 'ŞAFAK VAKTİ', 'AKŞAM'][i % 4]}`;
      expect(sahneBasligiBicimle(sahneBasligiAyristir(ham, 'tr'), 'tr'), ham).toBe(ham);
    }
  });
});
