import { describe, expect, it } from 'vitest';
import {
  deeplSaglayici,
  deeplSunucu,
  googleSaglayici,
  htmlVarligiCoz,
  saglayiciKur,
} from '@storyboard/core/dil/saglayicilar';

/** Çağrıyı kaydeden, verilen gövdeyi dönen sahte `fetch`. */
function sahteGetirici(
  govde: unknown,
  opts: { ok?: boolean; status?: number; metin?: string } = {},
) {
  const cagrilar: { adres: string; secenekler: RequestInit }[] = [];
  const getirici = (async (adres: string, secenekler: RequestInit) => {
    cagrilar.push({ adres, secenekler });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: opts.status === 403 ? 'Forbidden' : 'OK',
      json: async () => govde,
      text: async () => opts.metin ?? JSON.stringify(govde),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { getirici, cagrilar };
}

const govdesi = (c: { secenekler: RequestInit }) => JSON.parse(String(c.secenekler.body));

describe('DeepL — ücretsiz anahtar BAŞKA sunucuya gider', () => {
  /* Yanlış sunucuya gitmek 403 verir ve kullanıcı bunu "anahtarım geçersiz"
     diye okur. Anahtarın kendisi hangi sunucu olduğunu zaten söylüyor. */
  it(':fx ile biten anahtar ücretsiz sunucuya', () => {
    expect(deeplSunucu('abc-123:fx')).toContain('api-free.deepl.com');
  });

  it('normal anahtar ücretli sunucuya', () => {
    expect(deeplSunucu('abc-123')).toBe('https://api.deepl.com/v2/translate');
  });

  it('anahtardaki boşluk kararı bozmuyor', () => {
    expect(deeplSunucu('  abc:fx  ')).toContain('api-free');
  });
});

describe('DeepL sağlayıcısı', () => {
  it('metinleri gönderiyor ve sırayla geri veriyor', async () => {
    const { getirici, cagrilar } = sahteGetirici({
      translations: [{ text: 'one' }, { text: 'two' }],
    });
    const s = deeplSaglayici({ apiAnahtari: 'k:fx', getirici });
    expect(await s.cevir(['bir', 'iki'], 'en', 'tr')).toEqual(['one', 'two']);

    const g = govdesi(cagrilar[0]);
    expect(g.text).toEqual(['bir', 'iki']);
    expect(g.target_lang).toBe('EN');
    expect(g.source_lang).toBe('TR');
  });

  it('kaynak dil verilmezse gönderilmiyor — DeepL kendi tespit eder', async () => {
    const { getirici, cagrilar } = sahteGetirici({ translations: [{ text: 'x' }] });
    await deeplSaglayici({ apiAnahtari: 'k', getirici }).cevir(['y'], 'en');
    expect(govdesi(cagrilar[0])).not.toHaveProperty('source_lang');
  });

  it('anahtar Authorization üstbilgisinde, ADRESTE DEĞİL', async () => {
    const { getirici, cagrilar } = sahteGetirici({ translations: [{ text: 'x' }] });
    await deeplSaglayici({ apiAnahtari: 'gizli:fx', getirici }).cevir(['y'], 'en');
    const h = cagrilar[0].secenekler.headers as Record<string, string>;
    expect(h.Authorization).toBe('DeepL-Auth-Key gizli:fx');
    // Adreste görünseydi günlüklere ve proxy kayıtlarına düşerdi.
    expect(cagrilar[0].adres).not.toContain('gizli');
  });

  it('HTTP hatası okunabilir mesajla fırlıyor', async () => {
    const { getirici } = sahteGetirici({}, { ok: false, status: 403, metin: 'kota bitti' });
    await expect(
      deeplSaglayici({ apiAnahtari: 'k', getirici }).cevir(['a'], 'en'),
    ).rejects.toThrow(/DeepL: 403.*kota bitti/s);
  });

  it('beklenmeyen yanıt biçimi fırlıyor', async () => {
    const { getirici } = sahteGetirici({ baska: true });
    await expect(
      deeplSaglayici({ apiAnahtari: 'k', getirici }).cevir(['a'], 'en'),
    ).rejects.toThrow(/beklenmeyen yanıt/);
  });

  it('eksik `text` alanı FIRLIYOR — boş çeviri belgeye yazılmıyor', async () => {
    const { getirici } = sahteGetirici({ translations: [{}, { text: 'two' }] });
    await expect(
      deeplSaglayici({ apiAnahtari: 'k', getirici }).cevir(['bir', 'iki'], 'en'),
    ).rejects.toThrow(/beklenmeyen yanıt/);
  });
});

describe('Google — HTML varlıkları ÇÖZÜLÜYOR', () => {
  /* ÖLÇÜLDÜ: `format: 'text'` verilse bile kesme işareti `&#39;` gelir.
     Çözülmezse `Arzu&#39;nun` belgeye girer ve kullanıcı bunu çeviri hatası
     sanar. */
  it('sayısal varlık çözülüyor', () => {
    expect(htmlVarligiCoz('Arzu&#39;nun')).toBe("Arzu'nun");
  });

  it('onaltılık varlık çözülüyor', () => {
    expect(htmlVarligiCoz('Arzu&#x27;nun')).toBe("Arzu'nun");
  });

  it('adlandırılmış varlıklar çözülüyor', () => {
    expect(htmlVarligiCoz('a &lt;b&gt; &quot;c&quot; &amp; d')).toBe('a <b> "c" & d');
  });

  /* `&amp;` önce çözülseydi `&amp;lt;` ikinci turda `<` olurdu ve
     kullanıcının gerçekten yazdığı `&lt;` bozulurdu. */
  it('ÇİFT çözme olmuyor', () => {
    expect(htmlVarligiCoz('&amp;lt;div&amp;gt;')).toBe('&lt;div&gt;');
  });

  it('varlık olmayan metne dokunmuyor', () => {
    expect(htmlVarligiCoz('Şişli’de ığdır')).toBe('Şişli’de ığdır');
  });
});

describe('Google sağlayıcısı', () => {
  it('metinleri gönderiyor, çözülmüş hâlde geri veriyor', async () => {
    const { getirici, cagrilar } = sahteGetirici({
      data: { translations: [{ translatedText: 'Arzu&#39;s bag' }] },
    });
    const s = googleSaglayici({ apiAnahtari: 'K', getirici });
    expect(await s.cevir(["Arzu'nun çantası"], 'en', 'tr')).toEqual(["Arzu's bag"]);

    const g = govdesi(cagrilar[0]);
    expect(g.q).toEqual(["Arzu'nun çantası"]);
    expect(g.target).toBe('en');
    expect(g.format).toBe('text');
  });

  /* Sorgu dizesindeki anahtar DevTools ağ panelinde görünür,
     `performance.getEntries()` ile sayfa içi koddan okunabilir ve proxy /
     kurumsal TLS denetimi günlüklerine düz metin düşer. */
  it('anahtar ÜSTBİLGİDE, adreste DEĞİL', async () => {
    const { getirici, cagrilar } = sahteGetirici({
      data: { translations: [{ translatedText: 'x' }] },
    });
    await googleSaglayici({ apiAnahtari: 'gizli-anahtar', getirici }).cevir(['y'], 'en');
    const h = cagrilar[0].secenekler.headers as Record<string, string>;
    expect(h['X-goog-api-key']).toBe('gizli-anahtar');
    expect(cagrilar[0].adres).not.toContain('gizli-anahtar');
    expect(cagrilar[0].adres).not.toContain('key=');
  });

  /* Eksik alanlı öğe BOŞ dizgeye düşüyordu ve boş dizge geçerli bir `string`
     olduğu için `ceviri.ts`'in "hepsi ya da hiçbiri" savunmasından geçip
     bloğun metnini BELGEYE BOŞ yazardı. */
  it('eksik alanlı çeviri öğesi FIRLATIYOR — sessizce boş dönmüyor', async () => {
    const { getirici } = sahteGetirici({
      data: { translations: [{}, { translatedText: 'b' }] },
    });
    await expect(
      googleSaglayici({ apiAnahtari: 'K', getirici }).cevir(['a', 'b'], 'en'),
    ).rejects.toThrow(/beklenmeyen yanıt/);
  });

  it('HTTP hatası okunabilir mesajla fırlıyor', async () => {
    const { getirici } = sahteGetirici({}, { ok: false, status: 403, metin: 'API key not valid' });
    await expect(
      googleSaglayici({ apiAnahtari: 'K', getirici }).cevir(['a'], 'en'),
    ).rejects.toThrow(/Google Translate: 403.*API key not valid/s);
  });

  it('beklenmeyen yanıt biçimi fırlıyor', async () => {
    const { getirici } = sahteGetirici({ data: {} });
    await expect(
      googleSaglayici({ apiAnahtari: 'K', getirici }).cevir(['a'], 'en'),
    ).rejects.toThrow(/beklenmeyen yanıt/);
  });
});

describe('sağlayıcı sınırları GERÇEK API sınırlarına göre', () => {
  it('DeepL istek başına 50 parça', () => {
    expect(deeplSaglayici({ apiAnahtari: 'k' }).azamiParca).toBe(50);
  });

  it('Google istek başına 128 parça', () => {
    expect(googleSaglayici({ apiAnahtari: 'k' }).azamiParca).toBe(128);
  });

  /* `> 1000` neredeyse hiçbir mutasyonu öldürmüyordu: sınır 1001'e de
     düşürülse, 10 milyona da çıkarılsa test geçerdi. Oysa yanlış sınır
     GERÇEK bir hataya çıkar — düşükse gereksiz istek, yüksekse sağlayıcının
     reddettiği bir gövde. Belgelenmiş değerler sabitleniyor. */
  it('karakter sınırları API belgelerindeki DEĞERLER', () => {
    // DeepL: ~128 KiB gövde sınırının altında tutulmuş (JSON kaçışı payı).
    expect(deeplSaglayici({ apiAnahtari: 'k' }).azamiKarakter).toBe(100_000);
    // Google Cloud Translation v2: ~30k karakter.
    expect(googleSaglayici({ apiAnahtari: 'k' }).azamiKarakter).toBe(30_000);
  });

  /* Ad da sözleşmenin parçası: hata mesajları ve kullanıcıya gösterilen
     etiket bu dizeden geliyor. */
  it('sağlayıcı adları sabit', () => {
    expect(deeplSaglayici({ apiAnahtari: 'k' }).ad).toBe('DeepL');
    expect(googleSaglayici({ apiAnahtari: 'k' }).ad).toBe('Google Translate');
  });

  it('kurucu doğru sağlayıcıyı veriyor', () => {
    expect(saglayiciKur('deepl', { apiAnahtari: 'k' }).ad).toBe('DeepL');
    expect(saglayiciKur('google', { apiAnahtari: 'k' }).ad).toBe('Google Translate');
  });
});
