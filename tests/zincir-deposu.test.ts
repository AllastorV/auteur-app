import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { zincirDeposu } from '../apps/desktop/electron/zincir-deposu';
import {
  halka,
  ozetEsit,
  sifirHalka,
  zinciriDogrula,
  type ZincirKaydi,
} from '@storyboard/core/veri/zincir';

/**
 * MÜHÜR ZİNCİRİNİN DİSK KATMANI.
 *
 * Gerçek dosyalarla koşuyor. Kök `os.tmpdir()` altında: proje bir bulut
 * senkron klasöründe duruyor ve senkron ajanı yeni oluşan dizini açık
 * tutunca `rmSync` EPERM ile düşüyor (2026-08-31'de ölçüldü). Test çöpünün
 * kullanıcının senkron kotasına yazılmasının da anlamı yok.
 */

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-zincir-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

let sayac = 0;
const depo = () => zincirDeposu(kok, `proje-${sayac++}`);

const METIN = new TextEncoder().encode('İÇ. MUTFAK - GECE\n\nAyşe masaya oturur.\n');

async function muhur(oncekiHalka = sifirHalka(), zaman = 1_700_000_000_000): Promise<ZincirKaydi> {
  const ozet = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', METIN as BufferSource),
  );
  return {
    zaman,
    tur: 'muhur',
    tetikleyici: 'elle',
    oncekiHalka,
    icerikOzeti: ozet,
    icerikBayt: METIN.length,
    yazar: 'Alp Cavas',
    etiket: 'ilk taslak',
  };
}

describe('yaz–oku', () => {
  it('boş depo bozuk demiyor — henüz mühür alınmamış demektir', () => {
    const d = depo();
    expect(d.oku()).toEqual({ kayitlar: [], durum: 'tam' });
  });

  it('mühür kaydı ve metni geri okunuyor', async () => {
    const d = depo();
    const k = await muhur();
    d.muhurYaz(k, METIN);

    const okuma = d.oku();
    expect(okuma.durum).toBe('tam');
    expect(okuma.kayitlar).toHaveLength(1);
    expect(okuma.kayitlar[0].etiket).toBe('ilk taslak');
    expect(ozetEsit(okuma.kayitlar[0].icerikOzeti, k.icerikOzeti)).toBe(true);

    const metin = d.muhurMetni(k.zaman);
    expect(metin).not.toBeNull();
    expect(new TextDecoder().decode(metin!)).toBe(new TextDecoder().decode(METIN));
  });

  /* EKLEME, üzerine yazma DEĞİL: ikinci mühür birincisini götürmemeli. */
  it('ikinci mühür birincisini ezmiyor ve zincir doğrulanıyor', async () => {
    const d = depo();
    const bir = await muhur();
    d.muhurYaz(bir, METIN);
    const iki = await muhur(await halka(bir), 1_700_000_060_000);
    d.muhurYaz(iki, METIN);

    const okuma = d.oku();
    expect(okuma.kayitlar).toHaveLength(2);
    expect((await zinciriDogrula(okuma.kayitlar)).saglam).toBe(true);
  });

  it('damga jetonu geri okunuyor ve zincire dayanıyor', async () => {
    const d = depo();
    const m = await muhur();
    d.muhurYaz(m, METIN);
    const jeton = new Uint8Array([0x30, 0x82, 0x01, 0x02, 0x03]);
    const damga: ZincirKaydi = {
      ...m,
      zaman: m.zaman + 1000,
      tur: 'damga',
      tetikleyici: 'elle',
      oncekiHalka: await halka(m),
      icerikOzeti: await halka(m),
      etiket: 'https://freetsa.org/tsr',
    };
    d.damgaYaz(damga, jeton);

    const okuma = d.oku();
    expect(okuma.kayitlar.map((k) => k.tur)).toEqual(['muhur', 'damga']);
    expect((await zinciriDogrula(okuma.kayitlar)).saglam).toBe(true);
    expect([...(d.damgaJetonu(damga.zaman) ?? [])]).toEqual([...jeton]);
  });

  it('olmayan metin ve jeton null dönüyor', () => {
    const d = depo();
    expect(d.muhurMetni(1)).toBeNull();
    expect(d.damgaJetonu(1)).toBeNull();
  });
});

describe('güven sınırı', () => {
  /* `projeId` renderer'dan geliyor: `meta.id` `../..` taşıyabilir.
     `gunluk-deposu.ts` ve `yazarlik-deposu.ts` ile BİREBİR aynı denetim. */
  it.each(['../kacis', 'a/b', 'a\\b', '..', '.', ''])(
    'yol sınırını aşan proje kimliği reddediliyor: %s',
    (id) => { expect(() => zincirDeposu(kok, id)).toThrow(); },
  );

  /* Dosyanın sonuna çöp eklenirse çözümleme bozulmanın BAŞLADIĞI yerde
     duruyor ve öncesi KURTARILIYOR — sağlam kayıtları da atmak, kurcalamayı
     cezalandırırken kanıtı yok etmek olurdu. */
  it('dosyaya çöp eklenince bozuk, önceki kayıtlar duruyor', async () => {
    const d = depo();
    d.muhurYaz(await muhur(), METIN);
    fs.appendFileSync(path.join(d.dizin, 'zincir.log'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));

    const okuma = d.oku();
    expect(okuma.kayitlar).toHaveLength(1);
    expect(okuma.durum).not.toBe('tam');
  });

  /* BUDAMA YOK: `yazarlikDepo`nun `buda()`sı burada YOK ve olmamalı.
     Yeniden yazılan bir dosyada hash zinciri yaşayamaz; kırık zincir
     kurcalanmış zincirden ayırt edilemez. Bu test o kapının açılmasını
     yakalıyor. */
  it('depoda budama yöntemi YOK', () => {
    expect('buda' in depo()).toBe(false);
  });
});
