// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * PDF yazı tipi getirici — TESLİM EDİLEN dosyadaki sessiz kayıp yolu.
 *
 * `ğ Ğ ş Ş ı İ` Latin-1'in dışında; base-14 Courier ile taşınamazlar. Modülün
 * üç davranışının üçü de iddiasızdı: `!yanit.ok` fırlatması silinse bozuk
 * font sessizce gömülür, hata sonrası önbellek temizliği silinse geçici bir
 * ağ hatası TÜM OTURUM boyunca PDF üretimini kilitler.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function modul() {
  vi.resetModules();
  return import('@storyboard/core/disa/yazitipi');
}

const yanit = (ok: boolean, bayt = new Uint8Array([1, 2, 3])) =>
  ({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () => bayt.buffer,
  }) as unknown as Response;

describe('yazı tipi getirme', () => {
  it('başarılı yanıtta TTF baytları dönüyor', async () => {
    const getir = vi.fn(async (_adres: string) => yanit(true));
    vi.stubGlobal('fetch', getir);
    const { pdfYaziTipleri } = await modul();
    const t = await pdfYaziTipleri();
    expect(t.duz).toEqual(new Uint8Array([1, 2, 3]));
    /* Kalın ve italik de GELİYOR: gerekçe ("hiçbir blok kalın değil")
       F1b-4'te geçersizleşti, Yazım sekmesi her blok tipi için Kalın/İtalik
       sunuyor ve eksik font sessizce `duz`'a düşerdi.

       `toBeDefined()` BU MUTASYONU ÖLDÜRMÜYORDU: `kalin: duz` yazan bir
       düşürme de tanımlıdır ve testi geçerdi — tam da korkulan sessiz
       kayıp. Baytlar ve ADRESLERİN AYRILIĞI ayrı ayrı çivileniyor. */
    expect(t.kalin).toEqual(new Uint8Array([1, 2, 3]));
    expect(t.italik).toEqual(new Uint8Array([1, 2, 3]));
    // Üç AYRI istek: bir ağırlık düşerse sayı ikiye iner.
    expect(getir.mock.calls.length).toBe(3);
    const adresler = getir.mock.calls.map((c) => String(c[0]));
    expect(new Set(adresler).size, 'üç ağırlık ÜÇ AYRI dosyadan geliyor').toBe(3);
  });

  /* Aynı ağırlığın baytları AYNI nesne olmamalı: `duz` PDF'e gömülüp
     değiştirilirse kalın da bozulurdu. */
  it('üç ağırlık AYRI tampon — biri ötekinin takma adı değil', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => yanit(true)));
    const { pdfYaziTipleri } = await modul();
    const t = await pdfYaziTipleri();
    expect(t.kalin).not.toBe(t.duz);
    expect(t.italik).not.toBe(t.duz);
    expect(t.italik).not.toBe(t.kalin);
  });

  /* Önbellek YAZI BAŞINA (kaynak notunun sözü): tek önbellek olsaydı bir
     romanı bastıktan sonra açılan senaryo Tinos gömülü PDF üretirdi. */
  it('önbellek YAZI BAŞINA — Tinos, Courier"in önbelleğinden servis edilmiyor', async () => {
    const getir = vi.fn(async (_adres: string) => yanit(true));
    vi.stubGlobal('fetch', getir);
    const { pdfYaziTipleri } = await modul();
    await pdfYaziTipleri('courier-prime');
    const courierAdresleri = getir.mock.calls.map((c) => String(c[0]));
    expect(courierAdresleri).toHaveLength(3);

    await pdfYaziTipleri('tinos');
    const tinosAdresleri = getir.mock.calls.map((c) => String(c[0])).slice(3);
    expect(tinosAdresleri, 'Tinos KENDİ üç dosyasını indiriyor').toHaveLength(3);
    for (const a of tinosAdresleri) expect(courierAdresleri).not.toContain(a);

    // İkisi de artık önbellekte: hiçbir yeni istek çıkmıyor.
    await pdfYaziTipleri('courier-prime');
    await pdfYaziTipleri('tinos');
    expect(getir.mock.calls.length).toBe(6);
  });

  /* Aynı anda iki dışa aktarım başlarsa TEK indirme olmalı: önbellek
     çözülmüş sonucu değil, UÇUŞTAKİ sözü tutuyor. */
  it('eşzamanlı çağrılar tek indirmeyi paylaşıyor', async () => {
    const getir = vi.fn(async () => yanit(true));
    vi.stubGlobal('fetch', getir);
    const { pdfYaziTipleri } = await modul();
    const [a, b, c] = await Promise.all([pdfYaziTipleri(), pdfYaziTipleri(), pdfYaziTipleri()]);
    expect(getir.mock.calls.length).toBe(3);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  /* Sessizce base-14'e düşmek YASAK: Türkçe harfler kaybolur ve kullanıcı
     bunu ancak dosyayı TESLİM ETTİKTEN sonra fark eder. */
  it('başarısız yanıtta FIRLIYOR — sessizce boş font dönmüyor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => yanit(false)));
    const { pdfYaziTipleri } = await modul();
    await expect(pdfYaziTipleri()).rejects.toThrow(/Yazı tipi yüklenemedi/);
  });

  it('durum kodu hata mesajında — tanılanabilir olsun', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => yanit(false)));
    const { pdfYaziTipleri } = await modul();
    await expect(pdfYaziTipleri()).rejects.toThrow(/404/);
  });

  it('başarı ÖNBELLEKLENİYOR — her dışa aktarımda yeniden indirilmiyor', async () => {
    const getir = vi.fn(async () => yanit(true));
    vi.stubGlobal('fetch', getir);
    const { pdfYaziTipleri } = await modul();
    const ilk = await pdfYaziTipleri();
    const ilkTur = getir.mock.calls.length;
    // İlk tur TAM ÜÇ istek — `ilkTur` değişkeni kendisi de çivileniyor.
    expect(ilkTur).toBe(3);
    const ikinci = await pdfYaziTipleri();
    // İkinci çağrı HİÇ ağ isteği yapmıyor ve AYNI nesneyi veriyor.
    expect(getir.mock.calls.length).toBe(ilkTur);
    expect(ikinci).toBe(ilk);
    // Ondan sonraki elli çağrı da ağa çıkmıyor.
    for (let i = 0; i < 50; i++) await pdfYaziTipleri();
    expect(getir.mock.calls.length).toBe(3);
  });

  /* Başarısızlık önbelleklenseydi geçici bir ağ hatası tüm oturum boyunca
     PDF üretimini kilitlerdi. */
  it('BAŞARISIZLIK önbelleklenmiyor — sonraki deneme yeniden istiyor', async () => {
    let basarili = false;
    const getir = vi.fn(async () => yanit(basarili));
    vi.stubGlobal('fetch', getir);
    const { pdfYaziTipleri } = await modul();

    await expect(pdfYaziTipleri()).rejects.toThrow();
    const hatadanSonra = getir.mock.calls.length;
    expect(hatadanSonra).toBe(3);
    basarili = true;
    const t = await pdfYaziTipleri();
    /* `length > 0` boş olmayan HER şeyi kabul ediyordu — hatalı tampon
       döndüren bir mutant da geçerdi. Baytların kendisi çivileniyor. */
    expect(t.duz).toEqual(new Uint8Array([1, 2, 3]));
    expect(t.kalin).toEqual(new Uint8Array([1, 2, 3]));
    expect(t.italik).toEqual(new Uint8Array([1, 2, 3]));
    /* Yeniden denendi: başarısızlık önbelleklenmedi. `>` yalnız "en az bir
       istek daha" diyordu; ÜÇÜ DE yeniden istenmeli, yoksa bir ağırlık
       eski hatalı sözden servis edilir. */
    expect(getir.mock.calls.length).toBe(hatadanSonra + 3);
  });

  /* İkinci deneme de başarısızsa yine önbelleğe yazılmamalı: bir kez
     silinip bir daha silinmeyen bir kapı, ikinci hatadan sonra oturumu
     kilitlerdi. */
  it('ARKA ARKAYA hatalar da önbelleklenmiyor', async () => {
    let basarili = false;
    const getir = vi.fn(async () => yanit(basarili));
    vi.stubGlobal('fetch', getir);
    const { pdfYaziTipleri } = await modul();

    for (let i = 1; i <= 3; i++) {
      await expect(pdfYaziTipleri()).rejects.toThrow(/Yazı tipi yüklenemedi/);
      expect(getir.mock.calls.length, `${i}. deneme`).toBe(i * 3);
    }
    basarili = true;
    expect((await pdfYaziTipleri()).duz).toEqual(new Uint8Array([1, 2, 3]));
    expect(getir.mock.calls.length).toBe(12);
  });

  /* TEK ağırlık düşse bile TÜMÜ fırlamalı: kalın gelmezse PDF sessizce
     düze düşer ve kullanıcı kalın yazdığı başlığı teslimden sonra fark eder. */
  it('ağırlıklardan YALNIZ BİRİ başarısızsa da fırlıyor', async () => {
    for (const dusen of [0, 1, 2]) {
      vi.resetModules();
      let n = 0;
      vi.stubGlobal('fetch', vi.fn(async () => yanit(n++ !== dusen)));
      const { pdfYaziTipleri } = await modul();
      await expect(pdfYaziTipleri(), `${dusen}. ağırlık düştü`)
        .rejects.toThrow(/Yazı tipi yüklenemedi/);
    }
  });
});
