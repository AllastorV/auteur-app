import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { duzYaz } from '@storyboard/core/disa/duz';
import { docxYaz } from '@storyboard/core/disa/docx';
import { tipProfili } from '@storyboard/core/format/profil';
import { TINOS } from '@storyboard/core/format/yazi';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * §16.2 BORCU: DOCX, Markdown ve düz metin YOKTU.
 *
 * Listede sayılıyorlardı ama yalnız PDF, Fountain ve FDX yazılmıştı. Roman
 * yazarının istediği çıktı tam olarak bunlar: Fountain senaryo işaretlemesi
 * taşıyor, FDX ikili bir sektör biçimi — ikisi de bir romanı başka bir
 * editöre taşımaz.
 */

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '', sceneId: '' });

const SENARYO = [
  blok('b1', 'scene', 'İÇ. MUTFAK - GECE'),
  blok('b2', 'action', 'Ayşe pencereyi açar.'),
  blok('b3', 'character', 'AYŞE'),
  blok('b4', 'parenthetical', '(fısıltıyla)'),
  blok('b5', 'dialogue', 'Kimse yok mu?'),
];

describe('düz metin', () => {
  it('bütün blokların metni çıktıda — TAM DOSYA, parça değil', () => {
    const m = duzYaz(SENARYO);
    for (const b of SENARYO) expect(m).toContain(b.text);
    /* `toContain` döngüsü SIRAYI, AYRACI ve FAZLALIĞI hiç ölçmüyordu:
       blokları ters basan, araya çöp ekleyen ya da her bloğu iki kez yazan
       bir mutant beş iddiayı da geçerdi. Dosyanın tamamı çivileniyor. */
    expect(m).toBe(
      'İÇ. MUTFAK - GECE\n\nAyşe pencereyi açar.\n\nAYŞE\n\n(fısıltıyla)\n\nKimse yok mu?\n',
    );
  });

  it('bloklar boş satırla ayrılıyor', () => {
    expect(duzYaz([blok('a', 'action', 'bir'), blok('b', 'action', 'iki')]))
      .toBe('bir\n\niki\n');
  });

  it('sonda tek satır sonu var — POSIX metin sözleşmesi', () => {
    expect(duzYaz([blok('a', 'action', 'x')])).toMatch(/[^\n]\n$/u);
    // Desen "sonda tek \n" diyordu; tek bloklu dosyanın TAMAMI zaten budur.
    expect(duzYaz([blok('a', 'action', 'x')])).toBe('x\n');
  });

  /* DÜZELTİLDİ (Karar 11): 0/1/2 boş blok ÜÇ FARKLI dosya üretmeli — yazarın
     bilerek bıraktığı boşluk dışa aktarımda sessizce silinmemeli. Önceki
     `\n{3,}` kollapsı bunu yutuyordu; kaldırıldı (bkz. `duzYaz` gerekçesi). */
  it('boş blok İZ BIRAKIYOR — 0/1/2 boş blok üç farklı dosya', () => {
    const hicBos = duzYaz([blok('a', 'action', 'bir'), blok('c', 'action', 'iki')]);
    const birBos = duzYaz([blok('a', 'action', 'bir'), blok('b', 'action', ''), blok('c', 'action', 'iki')]);
    const ikiBos = duzYaz([
      blok('a', 'action', 'bir'), blok('b', 'action', ''),
      blok('c', 'action', ''), blok('d', 'action', 'iki'),
    ]);
    expect(hicBos).toBe('bir\n\niki\n');
    expect(birBos).toBe('bir\n\n\n\niki\n');
    expect(ikiBos).toBe('bir\n\n\n\n\n\niki\n');
    // Üçü de birbirinden AYRI — hiçbiri diğerinin dosyasıyla aynı değil.
    expect(new Set([hicBos, birBos, ikiBos]).size).toBe(3);
  });

  it('tip etiketi istenirse yazılıyor', () => {
    expect(duzYaz([blok('a', 'character', 'AYŞE')], { tipEtiketi: true }))
      .toContain('[Karakter] AYŞE');
    // Etiket ÖNE geliyor ve başka hiçbir şey eklenmiyor — dosyanın tamamı.
    expect(duzYaz([blok('a', 'character', 'AYŞE')], { tipEtiketi: true }))
      .toBe('[Karakter] AYŞE\n');
    /* Etiket her blokta ve DOĞRU tiple: hepsine aynı etiketi basan bir
       mutant tek bloklu iddiayı geçerdi. */
    expect(duzYaz(SENARYO, { tipEtiketi: true })).toBe(
      '[Sahne başlığı] İÇ. MUTFAK - GECE\n\n[Aksiyon] Ayşe pencereyi açar.\n\n'
      + '[Karakter] AYŞE\n\n[Parantez] (fısıltıyla)\n\n[Diyalog] Kimse yok mu?\n',
    );
  });

  /* BÜYÜK HARF profilden geliyor, tipten değil: kuralı burada tekrarlamak
     ekranla dosyayı ıraksatırdı (Karar 2). */
  it('profil verilince büyük harf uygulanıyor — TÜRKÇE i/ı kuralıyla', () => {
    const profil = tipProfili('senaryo', 'letter', 'tr');
    expect(duzYaz([blok('a', 'scene', 'iç. mutfak')], { profil })).toContain('İÇ. MUTFAK');
    expect(duzYaz([blok('a', 'scene', 'iç. mutfak')], { profil })).toBe('İÇ. MUTFAK\n');
    /* `toContain` İngilizce `toUpperCase()` kullanan mutantı öldürmüyordu —
       o da "İÇ. MUTFAK" üretir. Ayrım `ışık`ta ortaya çıkıyor: Türkçe
       kuralda `IŞIK`, İngilizce kuralda `IŞIK` değil `IŞIK`... asıl fark
       `i → İ` ve `ı → I`. İkisi birden çivileniyor. */
    expect(duzYaz([blok('a', 'scene', 'ışıklı iç oda')], { profil })).toBe('IŞIKLI İÇ ODA\n');
  });

  it('profil verilmezse metne DOKUNULMUYOR', () => {
    expect(duzYaz([blok('a', 'scene', 'iç. mutfak')])).toContain('iç. mutfak');
    // Tek harf bile değişmiyor: boşluk ve büyük/küçük aynen.
    expect(duzYaz([blok('a', 'scene', 'iç. mutfak')])).toBe('iç. mutfak\n');
    expect(duzYaz([blok('a', 'action', '  boşluklu  ')])).toBe('  boşluklu  \n');
  });

  /* UÇ DURUMLAR: bu girdilerin hiçbiri iddia edilmiyordu ve hepsi editörde
     gerçekten yazılabiliyor. */
  it('çok satırlı blok metni satır sonlarıyla KORUNUYOR', () => {
    expect(duzYaz([blok('a', 'action', 'bir\niki')])).toBe('bir\niki\n');
    expect(duzYaz([blok('a', 'action', 'bir\r\niki')])).toBe('bir\r\niki\n');
  });

  /* NFD girdi NFC"ye normalize ediliyor: dosya görünüşte doğru ama kod
     birimi olarak farklı olsaydı, geri okunduğunda karakter sayısı ve
     sıralama ıraksardı (§6.5, Karar 23). */
  it('NFD girdi NFC yazılıyor, emoji bozulmuyor', () => {
    const nfd = 'Ayşe'.normalize('NFD');
    expect(nfd).not.toBe('Ayşe'.normalize('NFC'));
    expect(duzYaz([blok('a', 'action', nfd)])).toBe(`${'Ayşe'.normalize('NFC')}\n`);
    expect(duzYaz([blok('a', 'action', nfd)])).not.toBe(`${nfd}\n`);
    expect(duzYaz([blok('a', 'action', '👨‍👩‍👧 aile')])).toBe('👨‍👩‍👧 aile\n');
  });

  it('ÖLÇEK: beş bin blok tam ve sırayla yazılıyor', () => {
    const bloklar = Array.from({ length: 5000 }, (_, i) => blok(`b${i}`, 'action', `satır ${i}`));
    const m = duzYaz(bloklar);
    expect(m).toHaveLength(58889);
    // Boş satır ayracıyla 5000 blok → 9999 satır + sondaki \n.
    expect(m.split('\n')).toHaveLength(10000);
    expect(m.startsWith('satır 0\n\nsatır 1\n\n')).toBe(true);
    expect(m.endsWith('satır 4998\n\nsatır 4999\n')).toBe(true);
    // Sıra bozulmuyor: her satır numarası bir öncekinden büyük.
    const numaralar = m.split('\n\n').map((s) => Number(s.trim().replace('satır ', '')));
    expect(numaralar).toEqual(Array.from({ length: 5000 }, (_, i) => i));
  });
});

describe('markdown', () => {
  it('sahne başlığı ve karakter yapıyı taşıyor — TAM DOSYA', () => {
    const m = duzYaz(SENARYO, { markdown: true });
    expect(m).toContain('## İÇ. MUTFAK - GECE');
    expect(m).toContain('**AYŞE**');
    expect(m).toContain('> Kimse yok mu?');
    /* Üç parça iddiası, PARANTEZİN ve AKSİYONUN nasıl süslendiğini hiç
       ölçmüyordu: parantezi kalın basan ya da aksiyonu başlığa çeviren bir
       mutant geçerdi. Dosyanın tamamı çivileniyor. */
    expect(m).toBe(
      '## İÇ. MUTFAK - GECE\n\nAyşe pencereyi açar.\n\n**AYŞE**\n\n'
      + '*(fısıltıyla)*\n\n> Kimse yok mu?\n',
    );
  });

  /* KAÇIRMA VERİ KAYBINI ÖNLÜYOR: `*yıldızlı*` yazan bir yazarın metni
     Markdown'da italik olur ve dosya geri okunduğunda yıldızlar KAYBOLURDU. */
  it('Markdown işaretleri kaçırılıyor', () => {
    const m = duzYaz([blok('a', 'action', 'yıldız * ve _alt_ çizgi')], { markdown: true });
    expect(m).toContain('\\*');
    expect(m).toContain('\\_');
    /* İki `toContain` "en az bir tane kaçırıldı" diyordu; ÜÇ alt çizginin
       ikisini kaçırıp birini atlayan bir mutant da geçerdi. Tam çıktı. */
    expect(m).toBe('yıldız \\* ve \\_alt\\_ çizgi\n');
  });

  /* Emoji ve NFD, kaçırma yolundan geçerken bozulmamalı: kaçırma karakter
     karakter gezen bir dizge işlemi ve vekil çiftleri yarım kesebilir. */
  it('kaçırma emoji ve NFD metni bozmuyor', () => {
    expect(duzYaz([blok('a', 'action', '👨‍👩‍👧 aile *yıldız*')], { markdown: true }))
      .toBe('👨‍👩‍👧 aile \\*yıldız\\*\n');
    const nfd = 'Ayşe'.normalize('NFD');
    // Kaçırma NFC normalizasyonunu BOZMUYOR: iki dönüşüm birlikte doğru.
    expect(duzYaz([blok('a', 'action', `${nfd} _x_`)], { markdown: true }))
      .toBe(`${'Ayşe'.normalize('NFC')} \\_x\\_\n`);
  });

  it('kaçırılan metin geri okunduğunda AYNI', () => {
    const ham = 'a * b _c_ [d](e) # f';
    const m = duzYaz([blok('a', 'action', ham)], { markdown: true });
    expect(m.replace(/\\(.)/gu, '$1').trim()).toBe(ham);
  });

  it('boş blok süslenmiyor — yalnız işaretten oluşan satır çıkmıyor', () => {
    const m = duzYaz([blok('a', 'dialogue', '')], { markdown: true });
    expect(m.trim()).toBe('');
  });
});

describe('docx', () => {
  const profil = tipProfili('roman', 'letter', 'tr', TINOS);
  const ROMAN = [
    blok('b1', 'bolum', 'Birinci Bölüm'),
    blok('b2', 'paragraf', 'Kar yağıyordu.'),
    blok('b3', 'dialogue', 'Üşüdün mü?'),
  ];

  async function belge(bloklar = ROMAN) {
    const bayt = await docxYaz(bloklar, profil, { baslik: 'Kar', yazar: 'Ayşe' });
    const zip = await JSZip.loadAsync(bayt);
    return {
      zip,
      document: await zip.file('word/document.xml')!.async('string'),
      core: await zip.file('docProps/core.xml')!.async('string'),
    };
  }

  it('geçerli bir DOCX paketi — parça listesi TAM', async () => {
    const { zip } = await belge();
    for (const yol of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
      expect(zip.file(yol), yol).not.toBeNull();
    }
    /* `not.toBeNull()` yalnız EKSİĞİ görüyordu; paketin içeriği tam olarak
       bu yedi girdi. Fazladan bir parça (ör. yanlışlıkla gömülen bir kopya)
       ya da `docProps/core.xml`in düşmesi de yakalanmalı. */
    expect(Object.keys(zip.files).sort()).toEqual([
      '[Content_Types].xml', '_rels/', '_rels/.rels',
      'docProps/', 'docProps/core.xml', 'word/', 'word/document.xml',
    ]);
  });

  it('bütün blokların metni belgede', async () => {
    const { document } = await belge();
    /* `bolum` stili BÜYÜK HARF — profil öyle diyor ve dosya profili
       izlemeli. İlk yazışımda ham metni bekliyordum; doğru olan profilin
       uyguladığı biçim. */
    expect(document).toContain('BİRİNCİ BÖLÜM');
    expect(document).toContain('Kar yağıyordu.');
    expect(document).toContain('Üşüdün mü?');
  });

  /* XML'de anlam taşıyan karakterler kaçırılmazsa dosya HİÇ AÇILMAZ. */
  it('XML karakterleri kaçırılıyor', async () => {
    const { document } = await belge([blok('x', 'paragraf', 'a & b < c > d "e" \'f\'')]);
    expect(document).toContain('a &amp; b &lt; c &gt; d');
    expect(document).not.toMatch(/<w:t[^>]*>a & b/u);
  });

  /* Word varsayılan olarak baştaki/sondaki boşlukları ATAR; hizalama için
     bırakılmış boşluk sessizce kaybolurdu. */
  it('boşluk koruma bayrağı her metin çalıştırmasında', async () => {
    const { document } = await belge();
    const calisma = document.match(/<w:t[^>]*>/gu) ?? [];
    expect(calisma.length).toBeGreaterThan(0);
    for (const c of calisma) expect(c).toContain('xml:space="preserve"');
    /* `> 0` metin çalıştırmalarının SAYISINI ölçmüyordu: üç bloğu tek
       çalıştırmada birleştiren (ya da bir bloğu düşüren) bir mutant, hem
       bu iddiayı hem "bütün blokların metni belgede" iddiasını geçerdi —
       ikincisi `toContain` olduğu için birleşmeyi göremez. Blok başına bir
       çalıştırma: üç blok, üç `<w:t>`. */
    expect(calisma).toHaveLength(3);
    // Bayrağın gerçekten işe yaradığı durum: baştaki/sondaki boşluk KORUNUYOR.
    const bosluklu = await belge([blok('x', 'paragraf', '   girintili satır   ')]);
    expect(bosluklu.document).toContain('>   girintili satır   <');
  });

  it('yazı tipi ve punto PROFİLDEN', async () => {
    const { document } = await belge();
    expect(document).toContain('w:ascii="Tinos"');
    expect(document).toContain('w:sz w:val="24"'); // 12pt = 24 yarım punto
  });

  it('kağıt ölçüsü profilden — Letter twip karşılığı', async () => {
    const { document } = await belge();
    /* 215.9 mm = 8.5 in = 12240 twip. */
    expect(document).toContain('w:w="12240"');
  });

  it('bölüm YENİ SAYFADA başlıyor — YALNIZ bölüm', async () => {
    const { document } = await belge();
    expect(document).toContain('<w:pageBreakBefore/>');
    /* `toContain` "en az bir tane var" diyordu; HER paragrafa sayfa sonu
       koyan bir mutant (üç sayfalık bir roman satırı) da geçerdi. Belgede
       tek `bolum` bloğu var → tam BİR sayfa sonu. */
    expect(document.match(/<w:pageBreakBefore\/>/gu)).toHaveLength(1);
    // Bölümsüz belgede HİÇ sayfa sonu yok.
    const bolumsuz = await belge([blok('p', 'paragraf', 'Kar yağıyordu.')]);
    expect(bolumsuz.document).not.toContain('<w:pageBreakBefore/>');
  });

  /* DÜZELTİLDİ: çok satırlı blok metni artık `<w:br/>` üretiyor — Word ham
     `\n`i beyaz boşluk saydığı için bu etiket olmadan satır kırılması
     GÖSTERMEZDİ (sessiz biçim kaybı). Satır sayısı kadar DEĞİL, satır
     ARALARI kadar `<w:br/>`: N satır → N-1 kırılma. Parçalar SIRAYLA
     duruyor mu da jszip ile açılan gerçek `document.xml`den ölçülüyor. */
  it('çok satırlı metin DOCX"te <w:br/> ÜRETİYOR — satır sayısı kadar, sırayla', async () => {
    const { document } = await belge([blok('x', 'paragraf', 'bir\niki\nüç')]);
    // Ham `\n` artık metinde YOK — her satır kendi `<w:t>`sinde.
    expect(document).not.toContain('bir\niki');
    // 3 satır → 2 `<w:br/>`.
    expect(document.match(/<w:br\/>/gu) ?? [], 'satır kırma etiketi eksik').toHaveLength(2);
    // Parçalar SIRAYLA: "bir" önce, "iki" ondan önce "üç"ten önce geliyor.
    const birIndeks = document.indexOf('>bir<');
    const ikiIndeks = document.indexOf('>iki<');
    const ucIndeks = document.indexOf('>üç<');
    expect(birIndeks).toBeGreaterThan(-1);
    expect(ikiIndeks).toBeGreaterThan(birIndeks);
    expect(ucIndeks).toBeGreaterThan(ikiIndeks);
    // Her satır kendi boşluk koruma bayrağını taşıyor.
    expect(document.match(/<w:t xml:space="preserve">bir<\/w:t>/u)).not.toBeNull();
    expect(document.match(/<w:t xml:space="preserve">iki<\/w:t>/u)).not.toBeNull();
    expect(document.match(/<w:t xml:space="preserve">üç<\/w:t>/u)).not.toBeNull();
    // CRLF de aynı şekilde kırılıyor.
    const crlf = await belge([blok('y', 'paragraf', 'bir\r\niki')]);
    expect(crlf.document.match(/<w:br\/>/gu) ?? []).toHaveLength(1);
  });

  it('NFC normalize ediliyor ve emoji bozulmuyor', async () => {
    /* NFD gelen metin NFC"ye çevriliyor: aksi hâlde Word"de görünüşte doğru
       ama kod birimi olarak farklı bir dosya teslim edilirdi (Karar 23). */
    const nfd = await belge([blok('x', 'paragraf', 'Ayşe'.normalize('NFD'))]);
    expect(nfd.document).toContain('Ayşe'.normalize('NFC'));
    expect(nfd.document).not.toContain('Ayşe'.normalize('NFD'));
    const emoji = await belge([blok('x', 'paragraf', '👨‍👩‍👧 aile')]);
    expect(emoji.document).toContain('👨‍👩‍👧 aile');
  });

  it('başlık ve yazar belge özelliklerinde — XML kaçırmasıyla', async () => {
    const { core } = await belge();
    expect(core).toContain('<dc:title>Kar</dc:title>');
    expect(core).toContain('<dc:creator>Ayşe</dc:creator>');
    /* Üstveri de KULLANICI metni: `&` içeren bir başlık kaçırılmazsa
       `docProps/core.xml` bozulur ve dosya HİÇ AÇILMAZ. Bu yol hiç
       sınanmamıştı — `document.xml` için sınanan tuzağın aynısı. */
    const bayt = await docxYaz([blok('a', 'paragraf', 'x')], profil,
      { baslik: 'Kar & Buz <1>', yazar: 'A & B' });
    const zip = await JSZip.loadAsync(bayt);
    const xml = await zip.file('docProps/core.xml')!.async('string');
    expect(xml).toContain('<dc:title>Kar &amp; Buz &lt;1&gt;</dc:title>');
    expect(xml).toContain('<dc:creator>A &amp; B</dc:creator>');
    expect(xml).not.toMatch(/<dc:title>Kar & /u);
  });

  /* `sayfala` ile aynı kapı: sessizce atlansaydı kullanıcı eksik bir dosya
     teslim eder ve bunu ancak karşı taraf fark ederdi. */
  it('profilde tanımsız blok tipi FIRLATIYOR', async () => {
    await expect(docxYaz([blok('x', 'transition', 'KES')], profil)).rejects.toThrow(/tanimsiz/u);
  });

  it('büyük harf profilden uygulanıyor', async () => {
    const senaryoProfil = tipProfili('senaryo', 'letter', 'tr');
    const bayt = await docxYaz([blok('a', 'scene', 'iç. mutfak')], senaryoProfil);
    const zip = await JSZip.loadAsync(bayt);
    expect(await zip.file('word/document.xml')!.async('string')).toContain('İÇ. MUTFAK');
  });
});

describe('yazı ailesi etiketten AYRI', () => {
  /* Etiket kullanıcıya, aile Word'e. İlk yazışımda DOCX'e etiket yazılıyordu
     ("Tinos (Times uyumlu)") ve Word öyle bir yazı bulamayıp belgeyi başka
     bir yazıyla açardı — teslim dosyasında sessiz format kaybı. */
  it('DOCX gerçek aile adını yazıyor, etiketi değil', async () => {
    const bayt = await docxYaz([blok('a', 'paragraf', 'x')], tipProfili('roman', 'letter', 'tr', TINOS));
    const xml = await (await JSZip.loadAsync(bayt)).file('word/document.xml')!.async('string');
    expect(xml).toContain('w:ascii="Tinos"');
    expect(xml).not.toContain('Times uyumlu');
  });
});
