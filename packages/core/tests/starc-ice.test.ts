// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { metneCevir, starcOku, starcXmlToBloklar, STARC_TIP } from '@storyboard/core/ice/starc';
import { importScriptFile } from '@storyboard/core/store/script';
import { useProjectStore } from '@storyboard/core/store/project';

/*
 * FİKSTÜR STARC'IN KENDİ KAYNAĞINDAN kuruluyor, hayalden değil:
 * - DDL birebir `data_layer/database.cpp` → `createTables`
 * - tip numarası `domain/document_object.h` → `ScreenplayText = 10104`
 * - XML biçimi `model/text/text_model_text_item.cpp` → `<tip><v><![CDATA[…]]></v></tip>`
 * - eleman adları `templates/text_template.cpp` → `kAbstractParagraphTypeToString`
 *
 * SINIRI AÇIKÇA: bu, STARC'ın ÜRETTİĞİ gerçek bir dosya DEĞİL. Şema
 * kaynaktan alınmış olsa da gerçek bir `.starc` altın örneği olmadan
 * doğrulama tam değildir — spec §17'de kayıtlı.
 */

const SQL = await initSqlJs();

/** STARC'ın `createTables`'ından birebir DDL. */
function starcDosyasi(
  belgeler: { uuid: string; type: number; content: string }[],
): Uint8Array {
  const db = new SQL.Database();
  db.run(
    'CREATE TABLE documents (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'uuid TEXT UNIQUE NOT NULL, ' +
      'type INTEGER NOT NULL DEFAULT(0), ' +
      'content BLOB DEFAULT(NULL), ' +
      'synced_at TEXT DEFAULT(NULL))',
  );
  const ekle = db.prepare('INSERT INTO documents (uuid, type, content) VALUES (?, ?, ?)');
  for (const b of belgeler) ekle.run([b.uuid, b.type, b.content]);
  ekle.free();
  const bytes = db.export();
  db.close();
  return bytes;
}

const p = (tip: string, metin: string) => `<${tip}><v><![CDATA[${metin}]]></v></${tip}>`;

const SAHNE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<document mime-type="application/x-starc/screenplay/text" version="1.0">' +
  '<scene uuid="s1"><number value="12"/><content>' +
  p('scene_heading', 'İÇ. ESKİ APARTMAN - KORİDOR - GECE') +
  p('action', 'Ayşe kapıyı yavaşça iter.') +
  p('character', 'AYŞE') +
  p('parenthetical', '(fısıltıyla)') +
  p('dialogue', 'Kimse yok, emin misin?') +
  p('transition', 'KES') +
  '</content></scene></document>';

describe('STARC XML → bloklar', () => {
  it('altı temel tip birebir geçiyor, sırası korunuyor', () => {
    const { bloklar } = starcXmlToBloklar(SAHNE_XML);
    expect(bloklar.map((b) => b.type)).toEqual([
      'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
    ]);
    expect(bloklar[0].text).toBe('İÇ. ESKİ APARTMAN - KORİDOR - GECE');
    expect(bloklar[4].text).toBe('Kimse yok, emin misin?');
  });

  it('sahne numarası sarmalayıcı <scene> elemanından alınıyor', () => {
    const { bloklar } = starcXmlToBloklar(SAHNE_XML);
    expect(bloklar[0].scene).toBe('12');
    // Numara YALNIZ sahne başlığına yazılır; aksiyona sızarsa yanlış olur.
    expect(bloklar[1].scene).toBe('');
  });

  it('her blok benzersiz kimlik alıyor', () => {
    const { bloklar } = starcXmlToBloklar(SAHNE_XML);
    expect(new Set(bloklar.map((b) => b.id)).size).toBe(bloklar.length);
  });

  /* Hiyerarşi STARC sürümleri arasında değişebiliyor (§17). Ayrıştırıcı
     ağaca bel bağlamıyor — beklenmedik sarmalayıcı blokları KAYBETTİRMEZ. */
  it('tanınmayan sarmalayıcıların içindeki bloklar da bulunuyor', () => {
    const xml =
      '<document><act uuid="a"><content><folder><content><scene><content>' +
      p('action', 'Derinde duran satır.') +
      '</content></scene></content></folder></content></act></document>';
    const { bloklar } = starcXmlToBloklar(xml);
    expect(bloklar).toHaveLength(1);
    expect(bloklar[0].text).toBe('Derinde duran satır.');
  });

  it('boş paragraf blok üretmiyor', () => {
    const { bloklar } = starcXmlToBloklar(`<document>${p('action', '   ')}</document>`);
    expect(bloklar).toHaveLength(0);
  });

  it('biçim ve yorum alt ağaçları blok üretmiyor', () => {
    const xml =
      '<document><action><v><![CDATA[Metin.]]></v>' +
      '<fms><fm from="0" length="5" bold="true"/></fms>' +
      '<rms><rm from="0" length="5"><c author="A"><![CDATA[not]]></c></rm></rms>' +
      '</action></document>';
    const { bloklar } = starcXmlToBloklar(xml);
    expect(bloklar).toHaveLength(1);
    expect(bloklar[0].text).toBe('Metin.');
  });
});

describe('kayıpsız olmayan dönüşüm RAPORLANIYOR', () => {
  /* Bizde altı tip var, STARC'ta otuzdan fazla. Eşlenemeyeni DÜŞÜRMEK
     kullanıcının metnini yok etmek olurdu; en yakın tipe alıp raporlamak
     onu korur (Karar 10'un ruhu). */
  it('gevşek eşlenen tipler en yakın tipe gidiyor ve sayılıyor', () => {
    const xml =
      '<document>' +
      p('lyrics', 'Bir şarkı söyler.') +
      p('shot', 'YAKIN PLAN') +
      p('beat_heading', 'Dönüş noktası') +
      '</document>';
    const { bloklar, uyarilar } = starcXmlToBloklar(xml);
    expect(bloklar.map((b) => b.type)).toEqual(['dialogue', 'action', 'action']);
    expect(uyarilar.filter((u) => u.sonuc === 'gevsek').map((u) => u.starcTipi).sort()).toEqual([
      'beat_heading', 'lyrics', 'shot',
    ]);
  });

  it('otomatik kapanışlar taşınmıyor ve düşürüldüğü söyleniyor', () => {
    const xml = `<document>${p('action', 'X')}${p('act_footer', 'PERDE SONU')}</document>`;
    const { bloklar, uyarilar } = starcXmlToBloklar(xml);
    expect(bloklar).toHaveLength(1);
    expect(uyarilar).toContainEqual({ starcTipi: 'act_footer', sayi: 1, sonuc: 'dusuruldu' });
  });

  it('birebir eşleşen tipler uyarı ÜRETMİYOR — gürültü yapılmaz', () => {
    expect(starcXmlToBloklar(SAHNE_XML).uyarilar).toEqual([]);
  });

  it('aynı tipin tekrarları tek satırda sayılıyor', () => {
    const xml = `<document>${p('shot', 'A')}${p('shot', 'B')}${p('shot', 'C')}</document>`;
    expect(starcXmlToBloklar(xml).uyarilar).toEqual([
      { starcTipi: 'shot', sayi: 3, sonuc: 'gevsek' },
    ]);
  });
});

describe('HTML kaçışı geri çevriliyor', () => {
  /* STARC metni CDATA'ya koymadan ÖNCE kaçırıyor: CDATA içinde `&amp;`
     DİZGESİ duruyor. Geri çevrilmezse kullanıcının metni bozuk girer. */
  it('kaçırılmış karakterler asıllarına dönüyor', () => {
    const { bloklar } = starcXmlToBloklar(
      `<document>${p('action', 'Ayşe &amp; Ali &lt;bakar&gt; &quot;dedi&quot;')}</document>`,
    );
    expect(bloklar[0].text).toBe('Ayşe & Ali <bakar> "dedi"');
  });

  /* `&amp;` önce çözülseydi `&amp;lt;` ikinci turda `<` olurdu — kullanıcı
     gerçekten `&lt;` yazmışsa metni bozulurdu. */
  it('ÇİFT çözme olmuyor', () => {
    const { bloklar } = starcXmlToBloklar(
      `<document>${p('action', 'kod: &amp;lt;div&amp;gt;')}</document>`,
    );
    expect(bloklar[0].text).toBe('kod: &lt;div&gt;');
  });

  it('Türkçe harfler bozulmadan geçiyor', () => {
    const metin = 'Şişli’de ığdır çöreği — ĞÜŞİÖÇ ğüşiöç';
    const { bloklar } = starcXmlToBloklar(`<document>${p('action', metin)}</document>`);
    expect(bloklar[0].text).toBe(metin);
  });
});

describe('.starc dosyası okuma', () => {
  it('senaryo metni belgesi bulunup çözümleniyor', async () => {
    const dosya = starcDosyasi([
      { uuid: 'yapi', type: STARC_TIP.yapi, content: '<document/>' },
      { uuid: 'sp', type: STARC_TIP.senaryo, content: '<document/>' },
      { uuid: 'metin', type: STARC_TIP.senaryoMetni, content: SAHNE_XML },
    ]);
    const senaryolar = await starcOku(dosya);
    expect(senaryolar).toHaveLength(1);
    expect(senaryolar[0].bloklar.map((b) => b.type)).toEqual([
      'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
    ]);
  });

  /* Senaryo metni DIŞINDAKİ belgeler (başlık sayfası, sinopsis, istatistik)
     senaryo sanılırsa çıktıya çöp girer. */
  it('yalnız 10104 tipindeki belgeler alınıyor', async () => {
    const dosya = starcDosyasi([
      { uuid: 'a', type: 10101, content: `<document>${p('action', 'BAŞLIK SAYFASI')}</document>` },
      { uuid: 'b', type: 10102, content: `<document>${p('action', 'SİNOPSİS')}</document>` },
      { uuid: 'c', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'Gerçek.')}</document>` },
    ]);
    const senaryolar = await starcOku(dosya);
    expect(senaryolar).toHaveLength(1);
    expect(senaryolar[0].bloklar[0].text).toBe('Gerçek.');
  });

  it('birden çok senaryo metni ayrı ayrı dönüyor', async () => {
    const dosya = starcDosyasi([
      { uuid: 'a', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'Bir.')}</document>` },
      { uuid: 'b', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'İki.')}</document>` },
    ]);
    const senaryolar = await starcOku(dosya);
    expect(senaryolar.map((s) => s.bloklar[0].text)).toEqual(['Bir.', 'İki.']);
  });

  it('senaryo metni yoksa boş liste — hata değil', async () => {
    const dosya = starcDosyasi([{ uuid: 'a', type: STARC_TIP.yapi, content: '<document/>' }]);
    expect(await starcOku(dosya)).toEqual([]);
  });

  /* "Senaryo bulunamadı" demek kullanıcıya YANLIŞ şeyi söyler: asıl gerçek
     yanlış dosyayı açtığıdır. */
  it('documents tablosu olmayan SQLite açıkça reddediliyor', async () => {
    const db = new SQL.Database();
    db.run('CREATE TABLE baska (x INTEGER)');
    const bytes = db.export();
    db.close();
    await expect(starcOku(bytes)).rejects.toThrow(/STARC projesi değil/);
  });

  it('SQLite olmayan dosya açıkça reddediliyor', async () => {
    const cop = new TextEncoder().encode('bu bir sqlite dosyası değil, düz metin');
    await expect(starcOku(cop)).rejects.toThrow(/SQLite değil|bozuk/);
  });
});

describe('ÜRETİM YOLU — `importScriptFile`', () => {
  /* Saf çekirdek (`starcOku`, `starcXmlToBloklar`) iyi test edilmişti ama
     onları gerçekten ÇAĞIRAN fonksiyon hiçbir testte geçmiyordu: uzantı
     dallanması `false` yapılsa `.starc` ikilisi `file.text()`'ten geçip çöp
     üretirdi ve hiçbir test kızarmazdı. */
  /* jsdom'un `File`'ında `arrayBuffer`/`text` yok; `importScriptFile`'ın
     kullandığı yüzey bu ikisi, o yüzden asgari bir dublör yeterli. */
  const dosyaYap = (ad: string, bayt: Uint8Array): File =>
    ({
      name: ad,
      arrayBuffer: async () => bayt.buffer.slice(bayt.byteOffset, bayt.byteOffset + bayt.byteLength),
      text: async () => new TextDecoder().decode(bayt),
    }) as unknown as File;

  it('`.starc` uzantısı İKİLİ yoldan okunuyor', async () => {
    const bayt = starcDosyasi([
      { uuid: 'm', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'Ahmet girer.')}</document>` },
    ]);
    const sonuc = await importScriptFile(dosyaYap('film.starc', bayt));
    expect(sonuc.satir).toBe(1);
    expect(useProjectStore.getState().project.script?.blocks[0].text).toBe('Ahmet girer.');
  });

  it('uzantı büyük harfli olsa da ikili yol seçiliyor', async () => {
    const bayt = starcDosyasi([
      { uuid: 'm', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'Büyük.')}</document>` },
    ]);
    const sonuc = await importScriptFile(dosyaYap('FILM.STARC', bayt));
    expect(sonuc.satir).toBe(1);
  });

  /* Sessizce ilkini alıp ötekileri yok saymak, kullanıcının eksik
     aktardığını hiç öğrenmemesi demekti. */
  it('birden çok senaryoda DÜŞÜRÜLEN sayısı bildiriliyor', async () => {
    const bayt = starcDosyasi([
      { uuid: 'a', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'Bir.')}</document>` },
      { uuid: 'b', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'İki.')}</document>` },
      { uuid: 'c', type: STARC_TIP.senaryoMetni, content: `<document>${p('action', 'Üç.')}</document>` },
    ]);
    const sonuc = await importScriptFile(dosyaYap('cok.starc', bayt));
    const dusen = sonuc.uyarilar.find((u) => u.sonuc === 'dusuruldu' && /senaryo/.test(u.starcTipi));
    expect(dusen?.sayi).toBe(2);
  });

  it('senaryo metni olmayan STARC projesi okunabilir hata veriyor', async () => {
    const bayt = starcDosyasi([{ uuid: 'y', type: STARC_TIP.yapi, content: '<document/>' }]);
    await expect(importScriptFile(dosyaYap('bos.starc', bayt))).rejects.toThrow(/senaryo metni yok/);
  });

  it('`.fountain` METİN yolundan okunuyor — dallanma gerçekten ayırıyor', async () => {
    const metin = new TextEncoder().encode(['İÇ. MUTFAK - GECE', '', 'Ahmet girer.'].join(String.fromCharCode(10)));
    const sonuc = await importScriptFile(dosyaYap('film.fountain', metin));
    expect(sonuc.satir).toBeGreaterThan(1);
    expect(useProjectStore.getState().project.script?.blocks[0].type).toBe('scene');
  });
});

describe('bozuk XML sessizce SIFIR blokla dönmüyor', () => {
  /* Fırlatma silinseydi bozuk bir `content` sessizce boş senaryo verirdi ve
     kullanıcı "senaryo boş" sanardı — dosya sağlamken. */
  it('kapanmamış etiket okunabilir hata veriyor', () => {
    expect(() => starcXmlToBloklar('<document><action><v><![CDATA[x]]></v>')).toThrow(/XML bozuk/);
  });

  it('düz çöp metin de fırlatıyor', () => {
    expect(() => starcXmlToBloklar('bu XML degil <<<')).toThrow(/XML bozuk/);
  });
});

describe('`content` BLOB olarak dönerse metin BOZULMUYOR', () => {
  /* Şema `content BLOB`; SQLite dinamik tipli. STARC `QString` yazıyorsa TEXT
     afinitesiyle gelir, ama BLOB afinitesiyle yazılmışsa sql.js `Uint8Array`
     döndürür. `String(Uint8Array)` "60,63,120…" üretir ve kullanıcı "XML
     bozuk" hatası alır — dosya sağlamken. */
  it('Uint8Array çözülüyor', () => {
    const xml = '<document/>';
    expect(metneCevir(new TextEncoder().encode(xml))).toBe(xml);
  });

  it('ArrayBuffer çözülüyor', () => {
    const bayt = new TextEncoder().encode('<document/>');
    expect(metneCevir(bayt.buffer.slice(0))).toBe('<document/>');
  });

  it('düz dizge aynen geçiyor', () => {
    expect(metneCevir('<document/>')).toBe('<document/>');
  });

  it('null ve undefined boş dizgeye düşüyor', () => {
    expect(metneCevir(null)).toBe('');
    expect(metneCevir(undefined)).toBe('');
  });

  it('Türkçe karakterler UTF-8 olarak çözülüyor', () => {
    const metin = 'İÇ. MUTFAK — ĞÜŞİÖÇ';
    expect(metneCevir(new TextEncoder().encode(metin))).toBe(metin);
  });
});
