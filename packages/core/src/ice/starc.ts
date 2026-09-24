import type { ScriptBlock, ScriptBlockType } from '../model/script';
import { uid } from '../util/id';

/**
 * `.starc` içe aktarımı — STARC kullanıcısının ÇIKIŞ KAPISI (spec §7).
 *
 * "STARC kullanıcısının çıkış kapısı olmak, açık kaynak bir aracın en güçlü
 * sözüdür." Kapalı bir SQLite blob'una verilecek cevap budur.
 *
 * ## Biçim — STARC KAYNAĞINDAN okundu, tahmin edilmedi
 *
 * `data_layer/database.cpp` (`createTables`):
 * `documents(id INTEGER PK, uuid TEXT UNIQUE, type INTEGER, content BLOB,
 * synced_at TEXT)`. `content` SIKIŞTIRILMAMIŞ UTF-8 XML — STARC'ın kendi göç
 * kodu onu `.value("content").toString()` ile okuyor.
 *
 * `domain/document_object.h`: `ScreenplayText = 10104`.
 *
 * `templates/text_template.cpp` (`kAbstractParagraphTypeToString`): paragraf
 * tipi = ELEMENT ADI (`scene_heading`, `action`, `character`, …).
 *
 * `model/text/text_model_text_item.cpp`: metin `<v><![CDATA[…]]></v>` içinde
 * ve CDATA'ya konmadan ÖNCE HTML kaçışından geçiyor — okurken geri
 * çevrilmesi gerekiyor.
 *
 * ## Ağaç VARSAYILMIYOR, düz taranıyor
 *
 * Bloklar sahne/klasör/perde elemanlarına iç içe sarılı ve bu sarmalama
 * STARC sürümleri arasında değişebilir (spec §17'nin açık riski). Ayrıştırıcı
 * hiyerarşiye bel bağlamıyor: ağacı belge sırasında geziyor ve tanıdığı
 * paragraf elemanlarını topluyor. Beklenmedik bir sarmalayıcı, blokların
 * KAYBOLMASI yerine yalnız görmezden gelinmesi demek olur.
 */

/** `DocumentObjectType` — STARC `document_object.h`. */
export const STARC_TIP = {
  yapi: 1,
  senaryo: 10100,
  senaryoMetni: 10104,
} as const;

/**
 * STARC paragraf adı → bizim blok tipimiz.
 *
 * `null` = TAŞINMAZ: otomatik üretilen kapanış satırları. STARC onları
 * kullanıcı metni saymıyor, biz de saymıyoruz — ama raporluyoruz.
 *
 * Gevşek eşlemeler bilinçli: `lyrics` karakterin söylediğidir, `shot` ve
 * `beat_heading` aksiyon akışının parçasıdır. Bizde altı tip var, STARC'ta
 * otuzdan fazla; eşlenemeyeni DÜŞÜRMEK yerine en yakın tipe alıp raporlamak
 * kullanıcının metnini korur.
 */
const TIP_ESLEME: Record<string, ScriptBlockType | null> = {
  scene_heading: 'scene',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  /* Gevşek eşlemeler. */
  lyrics: 'dialogue',
  shot: 'action',
  beat_heading: 'action',
  scene_characters: 'action',
  inline_note: 'action',
  unformatted_text: 'action',
  act_heading: 'action',
  sequence_heading: 'action',
  part_heading: 'action',
  chapter_heading: 'action',
  description: 'action',
  sound: 'action',
  music: 'action',
  cue: 'action',
  text: 'action',
  /* Otomatik kapanışlar — kullanıcı metni değil. */
  act_footer: null,
  sequence_footer: null,
  part_footer: null,
  chapter_footer: null,
  page_splitter: null,
};

/** Kayıpsız olmayan her dönüşüm RAPORLANIR (Karar 10'un ruhu). */
export interface StarcUyarisi {
  starcTipi: string;
  sayi: number;
  sonuc: 'gevsek' | 'dusuruldu';
}

export interface StarcSenaryo {
  ad: string;
  bloklar: ScriptBlock[];
  uyarilar: StarcUyarisi[];
}

/** Birebir eşleşen tipler — bunlar gevşek sayılmaz. */
const BIREBIR = new Set([
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
]);

/**
 * CDATA'nın İÇİNDEKİ HTML kaçışını geri çevirir.
 *
 * STARC metni CDATA'ya koymadan ÖNCE `toHtmlEscaped`'ten geçiriyor, yani
 * CDATA içinde `&amp;` DİZGESİ duruyor. Geri çevrilmezse kullanıcının
 * "Ayşe & Ali" satırı içeri "Ayşe &amp; Ali" olarak girerdi.
 *
 * `&amp;` EN SONA bırakılıyor: önce çözülseydi `&amp;lt;` dizisi ikinci
 * turda `<` olur ve kullanıcının metni bozulurdu.
 */
function htmlCoz(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Paragrafın KENDİ `<v>` değeri — torunlarınki değil. */
function paragrafMetni(el: Element): string {
  for (const cocuk of Array.from(el.children)) {
    if (cocuk.tagName === 'v') return htmlCoz(cocuk.textContent ?? '');
  }
  return '';
}

/** En yakın sarmalayıcı sahnenin numarası (varsa). */
function sahneNumarasi(el: Element): string {
  for (let ata = el.parentElement; ata; ata = ata.parentElement) {
    if (ata.tagName !== 'scene') continue;
    for (const cocuk of Array.from(ata.children)) {
      if (cocuk.tagName === 'number') return cocuk.getAttribute('value') ?? '';
    }
    return '';
  }
  return '';
}

/** STARC senaryo metni XML'ini bloklara çevirir. SAF — SQLite gerektirmez. */
/**
 * SQLite `content` sütunu METNE çevrilir.
 *
 * Şema `content BLOB` diyor ve SQLite dinamik tipli: STARC bir `QString`
 * yazıyorsa değer TEXT afinitesiyle gelir ve sql.js JS dizgesi döndürür, ama
 * BLOB afinitesiyle yazılmışsa `Uint8Array` döner. `String(Uint8Array)`
 * `"60,63,120…"` üretir; `DOMParser` buna `parsererror` der ve kullanıcı
 * "XML bozuk" mesajı alır — oysa dosya sağlam, okuyucu yanlış tiptedir.
 */
export function metneCevir(deger: unknown): string {
  /* `instanceof` KULLANILMIYOR: sql.js'in wasm sarmalayıcısı ve test ortamı
     (jsdom ↔ node) farklı gerçeklerden gelebiliyor ve `x instanceof
     Uint8Array` orada sessizce `false` döner — tam da bu bulguyu üreten
     sessizlik. Yapı denetimi gerçekten bağımsızdır. */
  if (ArrayBuffer.isView(deger)) {
    const g = deger as ArrayBufferView;
    return new TextDecoder('utf-8').decode(
      new Uint8Array(g.buffer as ArrayBuffer, g.byteOffset, g.byteLength),
    );
  }
  if (typeof ArrayBuffer !== 'undefined' && Object.prototype.toString.call(deger) === '[object ArrayBuffer]') {
    return new TextDecoder('utf-8').decode(new Uint8Array(deger as ArrayBuffer));
  }
  return String(deger ?? '');
}

export function starcXmlToBloklar(xml: string): Omit<StarcSenaryo, 'ad'> {
  const belge = new DOMParser().parseFromString(xml, 'text/xml');
  if (belge.getElementsByTagName('parsererror').length > 0) {
    throw new Error('STARC belgesi çözümlenemedi: XML bozuk.');
  }

  const bloklar: ScriptBlock[] = [];
  const sayaclar = new Map<string, { sonuc: StarcUyarisi['sonuc']; sayi: number }>();
  const say = (tip: string, sonuc: StarcUyarisi['sonuc']) => {
    const v = sayaclar.get(tip) ?? { sonuc, sayi: 0 };
    v.sayi++;
    sayaclar.set(tip, v);
  };

  const gez = (el: Element): void => {
    const ad = el.tagName;
    if (ad in TIP_ESLEME) {
      const tip = TIP_ESLEME[ad];
      if (tip === null) {
        say(ad, 'dusuruldu');
      } else {
        const metin = paragrafMetni(el).trim();
        if (metin) {
          if (!BIREBIR.has(ad)) say(ad, 'gevsek');
          bloklar.push({
            id: uid('sb'),
            fp: '',
            type: tip,
            text: metin.normalize('NFC'),
            scene: tip === 'scene' ? sahneNumarasi(el) : '',
            sceneId: '',
          });
        }
      }
      /* Paragrafın içine İNİLMEZ: `<v>`, `<fms>`, `<rms>` onun kendi alt
         ağacıdır ve orada paragraf yoktur. */
      return;
    }
    for (const cocuk of Array.from(el.children)) gez(cocuk);
  };

  if (belge.documentElement) gez(belge.documentElement);

  const uyarilar: StarcUyarisi[] = [...sayaclar].map(([starcTipi, v]) => ({
    starcTipi,
    sayi: v.sayi,
    sonuc: v.sonuc,
  }));
  return { bloklar, uyarilar };
}

/**
 * `.starc` dosyasından senaryo metinlerini çıkarır.
 *
 * `sql.js` DİNAMİK yükleniyor: WASM ikilisi 658 KB ve `.starc` içe aktarımı
 * nadir bir işlem. Ana pakete koymak, hiç STARC dosyası açmayacak her
 * kullanıcıya bu bedeli ödetirdi.
 */
export async function starcOku(bytes: Uint8Array): Promise<StarcSenaryo[]> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    /* ÖLÇÜLDÜ: `vite build` sql.js'in JS tutkalını paketliyor ama `.wasm`
       dosyasını YAYINA ÇIKARMIYOR. `locateFile` verilmezse tutkal wasm'ı
       sayfa kökünden istiyor, 404 alıyor ve `.starc` içe aktarımı yalnız
       ÜRETİMDE kırılıyor — testlerde değil. `?url` içe aktarımı dosyayı
       varlık olarak yayına sokup adresini veriyor. */
    import('sql.js/dist/sql-wasm-browser.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  /* ÖLÇÜLDÜ: `new SQL.Database(bozukBaytlar)` FIRLATMIYOR. sql.js dosyayı
     tembel açıyor ve "file is not a database" ancak ilk sorguda çıkıyor.
     Yapıcıyı tek başına sarmalamak ölü koddu; kullanıcı Türkçe açıklama
     yerine ham İngilizce sql.js mesajı görürdü (testle yakalandı). */
  const db = new SQL.Database(bytes);

  try {
    /* Tablo yoksa bu bir `.starc` DEĞİLDİR. Sessizce boş liste döndürmek
       kullanıcıya "senaryo bulunamadı" der; asıl gerçek "yanlış dosya"dır. */
    const tablolar = calistir(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'",
    );
    if (tablolar.length === 0) {
      throw new Error('Bu bir STARC projesi değil: documents tablosu yok.');
    }

    const sonuc = calistir(
      db,
      `SELECT uuid, content FROM documents WHERE type = ${STARC_TIP.senaryoMetni} ORDER BY id`,
    );
    if (sonuc.length === 0) return [];

    return sonuc[0].values.map((satir, i) => {
      const { bloklar, uyarilar } = starcXmlToBloklar(metneCevir(satir[1]));
      return { ad: `STARC senaryosu ${i + 1}`, bloklar, uyarilar };
    });
  } finally {
    db.close();
  }
}

/**
 * Sorguyu çalıştırır, SQLite düzeyindeki hatayı okunur hâle getirir.
 *
 * Yalnız açma hatası çevriliyor; başka her şey OLDUĞU GİBİ yukarı gidiyor —
 * tanımadığımız bir hatayı "dosya bozuk" diye etiketlemek, gerçek nedeni
 * gizlemek olurdu.
 */
function calistir(db: import('sql.js').Database, sql: string) {
  try {
    return db.exec(sql);
  } catch (hata) {
    const mesaj = (hata as Error).message;
    if (/not a database|file is encrypted|malformed/i.test(mesaj)) {
      throw new Error(`Dosya SQLite değil ya da bozuk: ${mesaj}`);
    }
    throw hata;
  }
}
