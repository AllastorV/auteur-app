import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { senaryoyuCevir, parcalaraBol, type CeviriSaglayici } from '@storyboard/core/dil/ceviri';
import {
  deeplSaglayici,
  googleSaglayici,
  htmlVarligiCoz,
} from '@storyboard/core/dil/saglayicilar';
import { loadProjectIntoDoc, readScript } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

/**
 * AĞIR TEST 8 — çeviri sağlayıcıları, GERÇEK BİR SUNUCUYLA.
 *
 * ## Neden sahte `fetch` yetmiyordu
 *
 * Mevcut testler `fetch`i bir fonksiyonla değiştiriyor; o fonksiyon her
 * zaman eksiksiz bir gövde döndürüyor. Gerçek ağda olan şey bu değil:
 * bağlantı yarıda kopar, gövde yarım gelir, JSON bozuk çıkar, sunucu hiç
 * yanıt vermez. Bu dosya GERÇEK bir `node:http` sunucusu kurup asıl `fetch`
 * ile konuşuyor — istek biçimi tel üzerinde doğrulanıyor, yanıt çözümü de
 * gerçek `Response.json()` üzerinden geçiyor.
 *
 * ## API anahtarı YOK ve İSTENMİYOR
 *
 * Sunucu DeepL ve Google'ın yanıt biçimini taklit ediyor. Ölçülen şey
 * "DeepL iyi çeviriyor mu" değil (o bizim işimiz değil), "sağlayıcı
 * katmanımız doğru soruyor ve doğru okuyor mu".
 *
 * ## KRİTİK İDDİA (§16.4)
 *
 * "Çeviri belgeye YARIM girmiyor — sağlayıcı hata verince belge dokunulmadan
 * kalıyor." Her hata senaryosunda `Y.Doc`un KODLANMIŞ BAYTLARI önce/sonra
 * karşılaştırılıyor. Metin karşılaştırması yetmez: `updatedAt` damgası ya da
 * bir çöp kaydı değişse metin aynı görünür ama belge değişmiş olurdu.
 */

/* ------------------------------------------------------------------ */
/* Sahte ama GERÇEK bir HTTP sunucusu                                  */
/* ------------------------------------------------------------------ */

type Davranis =
  | { tur: 'normal' }
  | { tur: 'eksik-parca'; kacEksik: number }
  | { tur: 'fazla-parca' }
  | { tur: 'bozuk-json' }
  | { tur: 'yarim-govde' }
  | { tur: 'hic-yanit-yok' }
  | { tur: 'http-hata'; kod: number; govde: string }
  | { tur: 'nci-istekte-duser'; n: number }
  | { tur: 'html-varlikli' }
  | { tur: 'bos-dizge' }
  | { tur: 'alan-eksik' };

let sunucu: http.Server;
let taban = '';
let davranis: Davranis = { tur: 'normal' };
/** Sunucuya ULAŞAN istekler — tel üzerindeki biçimi doğrulamak için. */
let istekler: { yol: string; ustbilgi: http.IncomingHttpHeaders; govde: unknown }[] = [];
let istekSayaci = 0;
/** Yanıtsız bırakılan soketler; testin asılı kalmaması için sonda kapatılır. */
let asiliYanitlar: http.ServerResponse[] = [];

function govdeOku(req: http.IncomingMessage): Promise<string> {
  return new Promise((coz) => {
    let veri = '';
    req.on('data', (p) => {
      veri += p;
    });
    req.on('end', () => coz(veri));
  });
}

/** DeepL biçiminde yanıt gövdesi. */
const deeplGovde = (metinler: string[]) =>
  JSON.stringify({ translations: metinler.map((t) => ({ text: t })) });

/** Google biçiminde yanıt gövdesi. */
const googleGovde = (metinler: string[]) =>
  JSON.stringify({ data: { translations: metinler.map((t) => ({ translatedText: t })) } });

beforeAll(async () => {
  sunucu = http.createServer(async (req, res) => {
    const ham = await govdeOku(req);
    let govde: Record<string, unknown> = {};
    try {
      govde = JSON.parse(ham) as Record<string, unknown>;
    } catch {
      /* Biçimsiz istek de kayda geçsin; test onu da görebilmeli. */
    }
    istekler.push({ yol: req.url ?? '', ustbilgi: req.headers, govde });
    istekSayaci += 1;

    /* Sağlayıcı GÖVDEDEN ayırt ediliyor: Google `q`, DeepL `text` gönderiyor.
       Adrese bakmak yanıltıcı olurdu — konak yerel sunucuya çevrildiği için
       yolda "google" geçmiyor. */
    const google = Array.isArray(govde.q);
    const parcalar = (google ? govde.q : govde.text) as string[] | undefined;
    const girdi = parcalar ?? [];
    /* Çeviri taklidi: metni köşeli parantezle sarıyor. Deterministik olması
       şart — çıktı girdiden türemezse "sıra korundu mu" ölçülemez. */
    const cevrilen = girdi.map((p) => `<${p}>`);
    const yaz = (m: string[]) => (google ? googleGovde(m) : deeplGovde(m));

    switch (davranis.tur) {
      case 'hic-yanit-yok':
        /* Üstbilgi bile yazılmıyor: `fetch` sonsuza kadar bekler. */
        asiliYanitlar.push(res);
        return;

      case 'yarim-govde': {
        /* Gövdenin YARISI yazılıp soket koparılıyor: `Content-Length` tam
           uzunluğu vaat ettiği için istemci "terminated" ile düşer. */
        const tam = yaz(cevrilen);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(tam)),
        });
        res.write(tam.slice(0, Math.floor(tam.length / 2)));
        res.socket?.destroy();
        return;
      }

      case 'bozuk-json':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"translations": [{"text": "yarim"');
        return;

      case 'http-hata':
        res.writeHead(davranis.kod, { 'Content-Type': 'text/plain' });
        res.end(davranis.govde);
        return;

      case 'eksik-parca':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(yaz(cevrilen.slice(davranis.kacEksik)));
        return;

      case 'fazla-parca':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(yaz([...cevrilen, '<fazladan>']));
        return;

      case 'nci-istekte-duser':
        if (istekSayaci === davranis.n) {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('gecici hata');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(yaz(cevrilen));
        return;

      case 'html-varlikli':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(yaz(girdi.map(() => 'Arzu&#39;nun &quot;çantası&quot; &amp; şapkası')));
        return;

      case 'bos-dizge':
        /* Sağlayıcı boş dizge dönerse: geçerli bir `string`, uzunluk denetimi
           geçer, ama BLOĞUN METNİNİ SİLER. */
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(yaz(girdi.map(() => '')));
        return;

      case 'alan-eksik':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          google
            ? JSON.stringify({ data: { translations: girdi.map(() => ({})) } })
            : JSON.stringify({ translations: girdi.map(() => ({})) }),
        );
        return;

      default:
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(yaz(cevrilen));
    }
  });

  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const adres = sunucu.address() as AddressInfo;
  taban = `http://127.0.0.1:${adres.port}`;
});

afterAll(async () => {
  for (const r of asiliYanitlar) r.destroy();
  await new Promise<void>((coz) => sunucu.close(() => coz()));
});

function sifirla(d: Davranis = { tur: 'normal' }) {
  davranis = d;
  istekler = [];
  istekSayaci = 0;
}

/**
 * Sağlayıcıyı gerçek sunucuya yönlendiren `fetch` sarmalayıcısı.
 *
 * Sağlayıcı kendi adresini kendi kuruyor (DeepL `:fx` ayrımı gibi kararlar
 * orada); burada YALNIZ konak değiştiriliyor, yol ve gövde sağlayıcının
 * ürettiği gibi kalıyor — tam da ölçmek istediğimiz şey o.
 */
function yerelGetirici(): typeof fetch {
  return (async (adres: string | URL | Request, secenekler?: RequestInit) => {
    const url = new URL(String(adres));
    return fetch(`${taban}${url.pathname}${url.search}`, secenekler);
  }) as unknown as typeof fetch;
}

/* ------------------------------------------------------------------ */
/* Senaryo ve belge yardımcıları                                       */
/* ------------------------------------------------------------------ */

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`,
  fp: `fp_${sayac}`,
  type,
  text,
  scene: '',
  sceneId: 'sc1',
});

function senaryoKur(n: number): ScriptBlock[] {
  const bloklar: ScriptBlock[] = [b('scene', 'İÇ. ESKİ APARTMAN - GECE')];
  for (let i = 0; i < n; i++) {
    bloklar.push(b('action', `Ayşe kapıyı iter. Satır ${i}.`));
    bloklar.push(b('character', 'AYŞE'));
    bloklar.push(b('dialogue', `Kimse yok mu? ${i}`));
  }
  return bloklar;
}

function belgeKur(bloklar: ScriptBlock[]) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  setScript(doc, { name: 'test', blocks: bloklar });
  return doc;
}

/** Belgenin TAM durumu — metin değil, kodlanmış baytlar. */
const parmakIzi = (doc: Y.Doc) => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');

/**
 * Çeviriyi ekranın yaptığı gibi uygular: BAŞARILIYSA yazar, hata varsa
 * belgeye dokunmaz. `CeviriDialog` ile aynı sözleşme.
 */
async function belgeyeCevir(
  doc: Y.Doc,
  saglayici: CeviriSaglayici,
  hedef = 'en',
): Promise<{ yazildi: boolean; hata?: string }> {
  const bloklar = readScript(doc).blocks;
  try {
    const sonuc = await senaryoyuCevir(bloklar, saglayici, {
      hedefDil: hedef,
      kaynakProfilDili: 'tr',
      hedefProfilDili: 'en',
    });
    setScript(doc, { name: readScript(doc).name, blocks: sonuc });
    return { yazildi: true };
  } catch (err) {
    return { yazildi: false, hata: err instanceof Error ? err.message : String(err) };
  }
}

const deepl = () => deeplSaglayici({ apiAnahtari: 'test-anahtar:fx', getirici: yerelGetirici() });
const google = () => googleSaglayici({ apiAnahtari: 'test-anahtar', getirici: yerelGetirici() });

/* ------------------------------------------------------------------ */
/* 1. İstek biçimi TEL ÜZERİNDE doğru mu                               */
/* ------------------------------------------------------------------ */

describe('istek biçimi — sunucunun GERÇEKTEN gördüğü şey', () => {
  it('DeepL: yol, üstbilgi ve gövde beklendiği gibi', async () => {
    sifirla();
    const sonuc = await deepl().cevir(['bir', 'iki'], 'en', 'tr');
    expect(sonuc).toEqual(['<bir>', '<iki>']);

    const istek = istekler[0];
    expect(istek.yol).toBe('/v2/translate');
    expect(istek.ustbilgi.authorization).toBe('DeepL-Auth-Key test-anahtar:fx');
    expect(istek.ustbilgi['content-type']).toContain('application/json');
    expect(istek.govde).toEqual({ text: ['bir', 'iki'], target_lang: 'EN', source_lang: 'TR' });
  });

  it('Google: yol, üstbilgi ve gövde beklendiği gibi', async () => {
    sifirla();
    const sonuc = await google().cevir(['bir'], 'de');
    expect(sonuc).toEqual(['<bir>']);

    const istek = istekler[0];
    expect(istek.yol).toBe('/language/translate/v2');
    expect(istek.ustbilgi['x-goog-api-key']).toBe('test-anahtar');
    expect(istek.govde).toEqual({ q: ['bir'], target: 'de', format: 'text' });
  });

  /* Anahtar adres satırına düşseydi ara sunucu ve TLS denetimi günlüklerine
     DÜZ METİN olarak yazılırdı. Sunucu tarafında ölçülüyor: gördüğü yolda
     anahtar yok. */
  it('anahtar SUNUCUNUN GÖRDÜĞÜ adreste yok — yalnız üstbilgide', async () => {
    sifirla();
    await deepl().cevir(['x'], 'en');
    await google().cevir(['x'], 'en');
    for (const i of istekler) {
      expect(i.yol).not.toContain('test-anahtar');
      expect(i.yol).not.toContain('key=');
    }
  });

  /* Türkçe/emoji/NFD gövdede BOZULMADAN gidip gelmeli: JSON kaçışı ve
     UTF-8 kodlaması boru hattının sessiz veri kaybı noktalarından biri. */
  it('Türkçe, emoji ve NFD metin bozulmadan gidiyor ve dönüyor', async () => {
    sifirla();
    const zor = ['Şişli’de ığdırlı Ayşe', '😀 kapı 🚪', 'Ayşe'.normalize('NFD'), '"tırnak" & <etiket>'];
    const sonuc = await deepl().cevir(zor, 'en');
    expect((istekler[0].govde as { text: string[] }).text).toEqual(zor);
    expect(sonuc).toEqual(zor.map((z) => `<${z}>`));
  });
});

/* ------------------------------------------------------------------ */
/* 2. Uçtan uca — belge gerçekten çevriliyor                           */
/* ------------------------------------------------------------------ */

describe('uçtan uca: gerçek sunucu → belge', () => {
  it('başarılı çeviri belgeye yazılıyor, sahne başlığı terimleri KORUNUYOR', async () => {
    sifirla();
    const doc = belgeKur(senaryoKur(2));
    const sonuc = await belgeyeCevir(doc, deepl());
    expect(sonuc.yazildi).toBe(true);

    const bloklar = readScript(doc).blocks;
    // Sahne başlığı hedef dilin TERİMLERİYLE yeniden kuruldu, makineden değil.
    expect(bloklar[0].text).toBe('INT. <ESKİ APARTMAN> - NIGHT');
    expect(bloklar[1].text).toBe('<Ayşe kapıyı iter. Satır 0.>');
    // Sağlayıcıya `İÇ.`/`GECE` HİÇ gitmedi.
    const gidenler = istekler.flatMap((i) => (i.govde as { text: string[] }).text);
    expect(gidenler.join(' ')).not.toContain('İÇ.');
    expect(gidenler).toContain('ESKİ APARTMAN');
  });

  it('Google yolunda HTML varlıkları ÇÖZÜLMÜŞ hâlde belgeye giriyor', async () => {
    sifirla({ tur: 'html-varlikli' });
    const doc = belgeKur([b('action', 'metin')]);
    expect((await belgeyeCevir(doc, google())).yazildi).toBe(true);
    expect(readScript(doc).blocks[0].text).toBe('Arzu\'nun "çantası" & şapkası');
  });

  /* 400 bloklu bir senaryo Google'ın 128 parça sınırıyla en az dört isteğe
     bölünmeli; ölçüm hem bölmenin çalıştığını hem süresini gösteriyor. */
  it('400 bloklu senaryo parçalanarak çevriliyor — hiçbir satır kaybolmuyor', async () => {
    sifirla();
    const bloklar = senaryoKur(133); // 1 + 399 = 400 blok
    expect(bloklar).toHaveLength(400);
    const doc = belgeKur(bloklar);

    const t0 = performance.now();
    const sonuc = await belgeyeCevir(doc, google());
    const sure = performance.now() - t0;

    expect(sonuc.yazildi).toBe(true);
    const cikti = readScript(doc).blocks;
    expect(cikti).toHaveLength(400);
    // Kimlikler korundu: panel bağları kopmadı.
    expect(cikti.map((x) => x.id)).toEqual(bloklar.map((x) => x.id));
    // Her blok gerçekten çevrildi (sahne başlığı hariç sarmalanmış).
    expect(cikti.slice(1).every((x) => x.text.includes('<'))).toBe(true);
    expect(istekSayaci).toBeGreaterThanOrEqual(4);

    // ÖLÇÜM: sayı raporlanabilsin diye yazılıyor.
    console.log(
      `[ÖLÇÜM] 400 blok / ${istekSayaci} istek / ${sure.toFixed(1)} ms ` +
        `(${(sure / 400).toFixed(2)} ms/blok)`,
    );
    expect(sure).toBeLessThan(20_000);
  }, 30_000);

  /* İlerleme geri çağrısı GERÇEK sayıları vermeli: kullanıcı "412/1200" görüp
     ilerlemediğini sanmamalı. */
  it('ilerleme monoton artıyor ve toplamla bitiyor', async () => {
    sifirla();
    const bloklar = senaryoKur(30);
    const adimlar: number[] = [];
    let toplam = 0;
    await senaryoyuCevir(bloklar, google(), {
      hedefDil: 'en',
      onIlerleme: (biten, t) => {
        adimlar.push(biten);
        toplam = t;
      },
    });
    expect(adimlar.length).toBeGreaterThan(0);
    for (let i = 1; i < adimlar.length; i++) expect(adimlar[i]).toBeGreaterThan(adimlar[i - 1]);
    expect(adimlar.at(-1)).toBe(toplam);
    expect(toplam).toBe(bloklar.length);
  });
});

/* ------------------------------------------------------------------ */
/* 3. KRİTİK İDDİA — hata hâlinde belge DOKUNULMADAN kalıyor           */
/* ------------------------------------------------------------------ */

describe('belge bütünlüğü: her hata yolunda baytlar AYNI', () => {
  const SENARYOLAR: { ad: string; davranis: Davranis; mesajDeseni: RegExp }[] = [
    {
      ad: 'yarıda kesilen yanıt (soket koptu)',
      davranis: { tur: 'yarim-govde' },
      mesajDeseni: /./,
    },
    { ad: 'bozuk JSON', davranis: { tur: 'bozuk-json' }, mesajDeseni: /./ },
    {
      ad: 'HTTP 429 kota',
      davranis: { tur: 'http-hata', kod: 429, govde: 'Too many requests' },
      mesajDeseni: /429/,
    },
    {
      ad: 'HTTP 403 anahtar',
      davranis: { tur: 'http-hata', kod: 403, govde: 'Forbidden' },
      mesajDeseni: /403/,
    },
    {
      ad: 'HTTP 500 sunucu',
      davranis: { tur: 'http-hata', kod: 500, govde: 'boom' },
      mesajDeseni: /500/,
    },
    { ad: 'eksik parça (kaydırma tuzağı)', davranis: { tur: 'eksik-parca', kacEksik: 1 }, mesajDeseni: /yanıt geldi/ },
    { ad: 'fazla parça', davranis: { tur: 'fazla-parca' }, mesajDeseni: /yanıt geldi/ },
    { ad: 'eksik alan (text yok)', davranis: { tur: 'alan-eksik' }, mesajDeseni: /beklenmeyen yanıt/ },
  ];

  for (const s of SENARYOLAR) {
    it(`${s.ad}: belge BİT BİTİNE aynı kalıyor`, async () => {
      sifirla(s.davranis);
      const bloklar = senaryoKur(5);
      const doc = belgeKur(bloklar);
      const once = parmakIzi(doc);

      const sonuc = await belgeyeCevir(doc, deepl());

      expect(sonuc.yazildi).toBe(false);
      expect(sonuc.hata).toMatch(s.mesajDeseni);
      // Metin değil, KODLANMIŞ DURUM karşılaştırılıyor.
      expect(parmakIzi(doc)).toBe(once);
      expect(readScript(doc).blocks.map((x) => x.text)).toEqual(bloklar.map((x) => x.text));
    });
  }

  /* KISMİ BAŞARI en sinsi durum: ilk istek başarılı, ikincisi düşüyor.
     Naif bir uygulama ilk grubu yazar ve senaryo YARISI İngilizce yarısı
     Türkçe kalırdı — "karışık dilde belge" tam olarak yasaklanan şey. */
  it('kısmi başarı: ilk grup geldi, ikincisi düştü → belge KARIŞIK DİLDE kalmıyor', async () => {
    sifirla({ tur: 'nci-istekte-duser', n: 2 });
    const bloklar = senaryoKur(40); // 121 blok → DeepL'in 50'lik sınırıyla 3 istek
    const doc = belgeKur(bloklar);
    const once = parmakIzi(doc);

    const sonuc = await belgeyeCevir(doc, deepl());

    expect(sonuc.yazildi).toBe(false);
    expect(istekSayaci).toBe(2); // ilk istek başarılıydı, ikincide durdu
    expect(parmakIzi(doc)).toBe(once);
    // Tek bir blok bile çevrilmiş olmamalı.
    expect(readScript(doc).blocks.every((x) => !x.text.includes('<'))).toBe(true);
  });

  /* DÜZELTİLDİ: sağlayıcı BOŞ DİZGE (ya da yalnız boşluk) dönerse artık
     "eksik/biçimsiz yanıt" hata yoluna düşüyor — blok ÇEVRİLMEMİŞ sayılıyor,
     metni SİLİNMİYOR. Belge BAYT BAYT dokunulmadan kalıyor (parmakIzi). */
  it('boş dizge yanıt: metin SİLİNMİYOR — belge dokunulmadan kalıyor', async () => {
    sifirla({ tur: 'bos-dizge' });
    const doc = belgeKur([b('action', 'Silinmemesi gereken satır')]);
    const once = parmakIzi(doc);
    const sonuc = await belgeyeCevir(doc, deepl());
    expect(sonuc.yazildi).toBe(false);
    expect(sonuc.hata).toContain('boş çeviri yanıtı');
    expect(parmakIzi(doc)).toBe(once);
    expect(readScript(doc).blocks[0].text).toBe('Silinmemesi gereken satır');
  });

  /* Aynı belgeye ÜST ÜSTE başarısız çeviri denemeleri de birikimli bir iz
     bırakmamalı: her denemede baytlar başlangıçtakiyle aynı. */
  it('üst üste beş başarısız deneme bile belgeyi kirletmiyor', async () => {
    const doc = belgeKur(senaryoKur(3));
    const once = parmakIzi(doc);
    for (const d of [
      { tur: 'bozuk-json' } as Davranis,
      { tur: 'yarim-govde' } as Davranis,
      { tur: 'http-hata', kod: 500, govde: 'x' } as Davranis,
      { tur: 'eksik-parca', kacEksik: 2 } as Davranis,
      { tur: 'alan-eksik' } as Davranis,
    ]) {
      sifirla(d);
      expect((await belgeyeCevir(doc, deepl())).yazildi).toBe(false);
      expect(parmakIzi(doc)).toBe(once);
    }
  });

  /* Başarılı çeviri TEK geri alma adımı olmalı: yanlış dil seçmek ucuz
     olsun diye. `setScript` tek transaction açıyor. */
  it('başarılı çeviri TEK transaction — geri alma tek adım', async () => {
    sifirla();
    const doc = belgeKur(senaryoKur(20));
    const oncekiMetinler = readScript(doc).blocks.map((x) => x.text);
    let islem = 0;
    doc.on('afterTransaction', () => {
      islem += 1;
    });
    expect((await belgeyeCevir(doc, deepl())).yazildi).toBe(true);
    expect(islem).toBe(1);
    expect(readScript(doc).blocks.map((x) => x.text)).not.toEqual(oncekiMetinler);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Hata mesajları — kullanıcı NE olduğunu anlayabiliyor mu          */
/* ------------------------------------------------------------------ */

describe('hata mesajı kullanıcıya bir şey SÖYLÜYOR mu', () => {
  it('HTTP hatası sağlayıcı adını, kodu ve gövdeyi taşıyor', async () => {
    sifirla({ tur: 'http-hata', kod: 456, govde: 'Quota exceeded for project' });
    const sonuc = await belgeyeCevir(belgeKur(senaryoKur(1)), deepl());
    expect(sonuc.hata).toContain('DeepL');
    expect(sonuc.hata).toContain('456');
    expect(sonuc.hata).toContain('Quota exceeded');
  });

  it('biçim hatası "Çeviri uygulanmadı" diyor — kullanıcı belgeye güvenebilsin', async () => {
    sifirla({ tur: 'alan-eksik' });
    const sonuc = await belgeyeCevir(belgeKur(senaryoKur(1)), google());
    expect(sonuc.hata).toContain('Google Translate');
    expect(sonuc.hata).toContain('Çeviri uygulanmadı');
  });

  /* BİLİNEN AÇIK: gövde ayrıştırılamadığında hata `Response.json()`ın ham
     mesajı olarak çıkıyor ("Unexpected end of JSON input" / "terminated") —
     sağlayıcı adı da, "Çeviri uygulanmadı" güvencesi de YOK. Belge güvende
     ama kullanıcı bunu mesajdan ANLAYAMIYOR. Ölçülüyor ki iyileştirilirse
     test kırılsın ve bilinçli olsun. */
  it('bozuk JSON: belge güvende ama mesaj sağlayıcı adı TAŞIMIYOR — bilinen açık', async () => {
    sifirla({ tur: 'bozuk-json' });
    const sonuc = await belgeyeCevir(belgeKur(senaryoKur(1)), deepl());
    expect(sonuc.yazildi).toBe(false);
    expect(sonuc.hata).not.toContain('Çeviri uygulanmadı');
  });
});

/* ------------------------------------------------------------------ */
/* 5. Zaman aşımı — yanıtsız sunucu                                    */
/* ------------------------------------------------------------------ */

describe('yanıt vermeyen sunucu', () => {
  /**
   * Sunucu üstbilgi bile yazmıyor. Zaman aşımı olmasaydı çeviri penceresi
   * SONSUZA kadar "Çevriliyor…" derdi ve İptal düğmesi de işe yaramazdı
   * (`iptal` yalnız gruplar ARASINDA yoklanıyor, istek içinde değil).
   */
  it('zaman aşımı devreye giriyor — sonsuza kadar asılı kalmıyor', async () => {
    sifirla({ tur: 'hic-yanit-yok' });
    const s = deeplSaglayici({
      apiAnahtari: 'k:fx',
      getirici: yerelGetirici(),
      zamanAsimiMs: 400,
    });
    const doc = belgeKur(senaryoKur(1));
    const once = parmakIzi(doc);

    const t0 = performance.now();
    const sonuc = await belgeyeCevir(doc, s);
    const sure = performance.now() - t0;

    expect(sonuc.yazildi).toBe(false);
    expect(sure).toBeLessThan(5000);
    expect(sure).toBeGreaterThanOrEqual(300);
    expect(parmakIzi(doc)).toBe(once);
    console.log(`[ÖLÇÜM] zaman aşımı ${sure.toFixed(0)} ms sonra hata verdi`);
  }, 15_000);

  /* BİLİNEN SINIR: iptal bayrağı yalnız gruplar ARASINDA yoklanıyor.
     Uçuştaki istek kesilemiyor; kullanıcı İptal'e bassa bile o istek
     bitene (ya da zaman aşımına) kadar bekliyor. Belge yine güvende. */
  it('iptal uçuştaki isteği KESMİYOR — gruplar arasında yoklanıyor', async () => {
    sifirla();
    const iptal = { cancelled: false };
    const bloklar = senaryoKur(40); // DeepL 50'lik sınırıyla birden çok grup
    let ilkGrupBitti = false;

    const sonuc = senaryoyuCevir(bloklar, deepl(), {
      hedefDil: 'en',
      iptal,
      onIlerleme: () => {
        if (!ilkGrupBitti) {
          ilkGrupBitti = true;
          iptal.cancelled = true; // ilk grup dönünce iptal
        }
      },
    });
    await expect(sonuc).rejects.toThrow(/iptal edildi.*dokunulmadı/s);
    // İlk grup ağa GİTTİ; iptal onu geri alamıyor, yalnız belgeyi koruyor.
    expect(istekSayaci).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 6. HTML varlık çözümü — bozuk girdi ÇÖKERTMEMELİ                    */
/* ------------------------------------------------------------------ */

describe('htmlVarligiCoz: geçersiz varlıklar çeviriyi ÇÖKERTMİYOR', () => {
  it('astral düzlem emoji varlığı çözülüyor', () => {
    expect(htmlVarligiCoz('&#128512;')).toBe('😀');
    expect(htmlVarligiCoz('&#x1F600;')).toBe('😀');
  });

  /* Unicode'un üst sınırını aşan bir sayı `String.fromCodePoint`i FIRLATIR
     (RangeError). Tek bozuk varlık yüzünden 400 bloklu bir çevirinin tamamı
     anlaşılmaz bir yığın izi ile çökmemeli. */
  it('sınırı aşan sayısal varlık FIRLATMIYOR, olduğu gibi kalıyor', () => {
    expect(() => htmlVarligiCoz('a&#1114112;b')).not.toThrow();
    expect(htmlVarligiCoz('a&#1114112;b')).toBe('a&#1114112;b');
  });

  it('devasa onaltılık varlık FIRLATMIYOR', () => {
    expect(() => htmlVarligiCoz('&#xFFFFFFFF;')).not.toThrow();
    expect(htmlVarligiCoz('&#xFFFFFFFF;')).toBe('&#xFFFFFFFF;');
  });

  /* Yalnız vekil (surrogate) kod noktası geçerli bir metin üretmez; belgeye
     girerse JSON/UTF-8 serileştirmesini bozar. */
  it('yalnız vekil kod noktası metne SOKULMUYOR', () => {
    const cikti = htmlVarligiCoz('a&#xD800;b');
    expect(cikti).toBe('a&#xD800;b');
    expect(JSON.parse(JSON.stringify(cikti))).toBe(cikti);
  });

  it('geçerli sınır değerleri hâlâ çözülüyor', () => {
    expect(htmlVarligiCoz('&#x10FFFF;')).toBe(String.fromCodePoint(0x10ffff));
    expect(htmlVarligiCoz('&#65;')).toBe('A');
  });

  it('çift çözme olmuyor ve karışık girdi bozulmuyor', () => {
    expect(htmlVarligiCoz('&amp;lt;div&amp;gt; &#39;x&#39;')).toBe("&lt;div&gt; 'x'");
  });

  it('Türkçe metne ve emojiye dokunmuyor', () => {
    expect(htmlVarligiCoz('Şişli’de ığdır 😀')).toBe('Şişli’de ığdır 😀');
  });
});

/* ------------------------------------------------------------------ */
/* 7. Parçalama — gerçek sağlayıcı sınırlarıyla, uç girdilerde         */
/* ------------------------------------------------------------------ */

describe('parçalama uç girdilerde', () => {
  it('tek öğe tek grup', () => {
    expect(parcalaraBol(['a'], 10, 5)).toEqual([['a']]);
  });

  it('tam sınırda bölünme — kapalı aralık doğru', () => {
    // 5 + 5 = 10, sınır 10 → tek grupta kalmalı (aşmıyor).
    expect(parcalaraBol(['aaaaa', 'bbbbb'], 10, 50)).toEqual([['aaaaa', 'bbbbb']]);
    // 5 + 6 = 11 > 10 → bölünmeli.
    expect(parcalaraBol(['aaaaa', 'bbbbbb'], 10, 50)).toEqual([['aaaaa'], ['bbbbbb']]);
  });

  it('boş dizgeler grubu şişirmiyor ama kaybolmuyor', () => {
    expect(parcalaraBol(['', '', ''], 10, 2)).toEqual([['', ''], ['']]);
  });

  /* Emoji UTF-16'da iki kod birimi. Sağlayıcı sınırı da kod birimi sayıyor
     olduğundan bu YÖN GÜVENLİ (fazla sayar, az değil). */
  it('emoji iki kod birimi sayılıyor — sınır ihtiyatlı tarafta', () => {
    expect(parcalaraBol(['😀😀😀'], 5, 50)).toEqual([['😀😀😀']]); // 6 birim, tek başına aşıyor
    expect(parcalaraBol(['😀', '😀', '😀'], 4, 50)).toEqual([['😀', '😀'], ['😀']]);
  });

  /* 10.000 parçalık girdi: parçalayıcı her çeviride çalışıyor, karesel
     olmamalı. */
  it('10.000 parça hızlıca bölünüyor ve tam korunuyor', () => {
    const girdi = Array.from({ length: 10_000 }, (_, i) => `satır ${i}`);
    const t0 = performance.now();
    const gruplar = parcalaraBol(girdi, 30_000, 128);
    const sure = performance.now() - t0;
    expect(gruplar.flat()).toEqual(girdi);
    expect(gruplar.length).toBeGreaterThanOrEqual(Math.ceil(10_000 / 128));
    for (const g of gruplar) {
      expect(g.length).toBeLessThanOrEqual(128);
    }
    console.log(`[ÖLÇÜM] 10.000 parça → ${gruplar.length} grup / ${sure.toFixed(1)} ms`);
    expect(sure).toBeLessThan(500);
  });

  /* Sınırı tek başına aşan DEV bir blok (uzun bir aksiyon paragrafı) kendi
     isteğinde gitmeli — bölünürse cümle ortadan kesilir. */
  it('tek başına sınırı aşan dev blok bölünmüyor', () => {
    const dev = 'x'.repeat(200_000);
    const gruplar = parcalaraBol(['a', dev, 'b'], 30_000, 128);
    expect(gruplar).toEqual([['a'], [dev], ['b']]);
    expect(gruplar[1][0]).toHaveLength(200_000);
  });
});
