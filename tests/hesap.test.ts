import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../apps/server/src/server';
import { sign } from '../apps/server/src/tokens';
import { hesapApi, sessionApi } from '@storyboard/core/collab/api';
import { connectExpectingRejection } from './helpers/wsClient';

/**
 * KULLANICI HESABI — kimlik artık "jetonu olan girer" değil.
 *
 * Her iddia bir SALDIRI olarak yazıldı: yanlış parola, var olmayan hesap,
 * süresi dolmuş jeton, çalınmış yenileme jetonu, başkasına gönderilmiş davet.
 * "Eklendi" demek yetmez — reddin GERÇEKTEN olduğu ölçülüyor.
 */

const SIR = 'hesap-testi-sirri';
let server: RunningServer;
/** Hesap zorunluluğu AÇIK ikinci sunucu — iki mod da aynı koşuda ölçülüyor. */
let zorunlu: RunningServer;

/* Hız sınırı BU dosyada gevşetiliyor: kimlik kurallarını ölçmek için onlarca
   hesap açmak gerekiyor ve üretim sınırı (15 dakikada 5 kayıt) bunu haklı
   olarak kesiyor. Sınırın KENDİSİ `guvenlik.test.ts`'te üretim değerleriyle
   ölçülüyor — burada gevşetmek onu ölçüsüz bırakmıyor. */
const GENIS = {
  kayit: { limit: 500, pencereMs: 60_000 },
  giris: { limit: 500, pencereMs: 60_000 },
};

beforeAll(async () => {
  server = await startServer({ port: 0, secret: SIR, logger: false, hizSinirlari: GENIS });
  zorunlu = await startServer({
    port: 0,
    secret: SIR,
    hesapZorunlu: true,
    logger: false,
    hizSinirlari: GENIS,
  });
}, 30000);

afterAll(async () => {
  await server?.close();
  await zorunlu?.close();
});

const PAROLA = 'CokGizliParola1';

async function yeniHesap(hedef: RunningServer, eposta: string, parola = PAROLA) {
  return hesapApi.kayit(hedef.url, { eposta, parola, ad: eposta.split('@')[0] });
}

describe('Hesap açma ve giriş', () => {
  it('kayıt olan kullanıcı aynı parolayla GİRİŞ yapabiliyor', async () => {
    const kayit = await yeniHesap(server, 'ayse@ornek.com');
    expect(kayit.hesapId).toMatch(/^hsp_/);

    const giris = await hesapApi.giris(server.url, { eposta: 'ayse@ornek.com', parola: PAROLA });
    expect(giris.hesapId).toBe(kayit.hesapId);

    const ben = await hesapApi.ben(server.url, giris.erisimToken);
    expect(ben.eposta).toBe('ayse@ornek.com');
  });

  it('e-posta BÜYÜK/küçük harften bağımsız — aynı hesap', async () => {
    await yeniHesap(server, 'buyuk@ornek.com');
    const giris = await hesapApi.giris(server.url, { eposta: '  BuYuK@Ornek.COM ', parola: PAROLA });
    expect(giris.eposta).toBe('buyuk@ornek.com');
  });

  it('SALDIRI: yanlış parola REDDEDİLİYOR', async () => {
    await yeniHesap(server, 'kurban@ornek.com');
    await expect(
      hesapApi.giris(server.url, { eposta: 'kurban@ornek.com', parola: 'YanlisParola1' }),
    ).rejects.toThrow(/hatalı/i);
  });

  it('SALDIRI: parolanın son harfini değiştirmek de yetmiyor', async () => {
    await yeniHesap(server, 'yakin@ornek.com');
    await expect(
      hesapApi.giris(server.url, { eposta: 'yakin@ornek.com', parola: PAROLA.slice(0, -1) + '2' }),
    ).rejects.toThrow(/hatalı/i);
  });

  it('var olmayan hesap ile yanlış parola AYNI mesajı veriyor — kullanıcı sayımı yok', async () => {
    await yeniHesap(server, 'var@ornek.com');
    const yok = await hesapApi
      .giris(server.url, { eposta: 'hicyok@ornek.com', parola: PAROLA })
      .catch((e) => (e as Error).message);
    const yanlis = await hesapApi
      .giris(server.url, { eposta: 'var@ornek.com', parola: 'BaskaParola1' })
      .catch((e) => (e as Error).message);
    /* Mesajlar ayrışsaydı saldırgan hangi e-postaların KAYITLI olduğunu tek
       tek çıkarabilirdi — hesap listesi başlı başına bir sızıntıdır. */
    expect(yok).toBe(yanlis);
  });

  it('aynı e-posta ile ikinci kayıt reddediliyor', async () => {
    await yeniHesap(server, 'tekrar@ornek.com');
    await expect(yeniHesap(server, 'tekrar@ornek.com')).rejects.toThrow();
  });

  it('kısa parola ve bozuk e-posta güven sınırında reddediliyor', async () => {
    await expect(hesapApi.kayit(server.url, { eposta: 'k@ornek.com', parola: 'kisa' })).rejects.toThrow();
    await expect(hesapApi.kayit(server.url, { eposta: 'nokta-yok@ornek', parola: PAROLA })).rejects.toThrow();
    await expect(hesapApi.kayit(server.url, { eposta: 'bosluk lu@ornek.com', parola: PAROLA })).rejects.toThrow();
  });
});

describe('Parola HİÇBİR YERDE düz durmuyor', () => {
  it('saklanan kayıtta düz parola YOK — kaydın tamamı tarandı', async () => {
    await yeniHesap(server, 'gizli@ornek.com', 'BenimGizliParolam9');
    const hesap = server.hesaplar.epostaylaBul('gizli@ornek.com')!;
    expect(hesap).toBeTruthy();

    /* Kaydın TAMAMI taranıyor — bir alanın adını bilmek gerekmiyor. İleride
       biri "kolaylık olsun" diye parolayı bir alana koyarsa bu test kırmızı
       döner. */
    const dokum = JSON.stringify(hesap, (_k, v) =>
      v && typeof v === 'object' && v.type === 'Buffer' ? undefined : v,
    );
    expect(dokum).not.toContain('BenimGizliParolam9');
    expect(Buffer.concat([hesap.hash, hesap.tuz]).toString('latin1')).not.toContain('BenimGizliParolam9');

    // Aynı parolayla iki hesabın türevi FARKLI — tuz gerçekten kullanılıyor.
    await yeniHesap(server, 'gizli2@ornek.com', 'BenimGizliParolam9');
    const ikinci = server.hesaplar.epostaylaBul('gizli2@ornek.com')!;
    expect(hesap.hash.equals(ikinci.hash)).toBe(false);
  });

  it('`/api/hesap/ben` parola türevini ve tuzu DIŞARI VERMİYOR', async () => {
    const k = await yeniHesap(server, 'sizinti@ornek.com');
    const res = await fetch(`${server.url}/api/hesap/ben`, {
      headers: { authorization: `Bearer ${k.erisimToken}` },
    });
    const govde = await res.text();
    expect(govde).not.toMatch(/hash|tuz|parola/i);
  });
});

describe('Oturum jetonu — kısa ömürlü ve yenilenebilir', () => {
  it('SALDIRI: süresi DOLMUŞ erişim jetonu reddediliyor', async () => {
    const hesap = await yeniHesap(server, 'suresi@ornek.com');
    /* Jeton doğru SIR ile imzalanıyor — yani imza geçerli. Reddin tek
       sebebi süre olmalı; sahte imzayla sınamak süre denetimini hiç
       ölçmezdi. */
    const olu = sign(
      { jti: 'ers_olu', sub: hesap.hesapId, kind: 'hesap', exp: Date.now() - 1000 },
      SIR,
    );
    await expect(hesapApi.ben(server.url, olu)).rejects.toThrow(/geçersiz|süresi/i);

    // Aynı sunucu, TAZE jeton: red sürenin sonucu, jeton biçiminin değil.
    await expect(hesapApi.ben(server.url, hesap.erisimToken)).resolves.toBeTruthy();
  });

  it('yenileme jetonu taze erişim jetonu üretiyor', async () => {
    const k = await yeniHesap(server, 'yenile@ornek.com');
    const taze = await hesapApi.yenile(server.url, k.yenilemeToken);
    expect(taze.hesapId).toBe(k.hesapId);
    await expect(hesapApi.ben(server.url, taze.erisimToken)).resolves.toBeTruthy();
  });

  it('SALDIRI: ÇALINMIŞ yenileme jetonu ikinci kez kullanılamıyor (döndürme)', async () => {
    const k = await yeniHesap(server, 'calinti@ornek.com');
    await hesapApi.yenile(server.url, k.yenilemeToken);
    await expect(hesapApi.yenile(server.url, k.yenilemeToken)).rejects.toThrow(/geçersiz|süresi/i);
  });

  it('SALDIRI: süresi dolmuş yenileme jetonu reddediliyor', async () => {
    const k = await yeniHesap(server, 'eskiyenile@ornek.com');
    const olu = sign({ jti: 'yen_olu', sub: k.hesapId, kind: 'yenileme', exp: Date.now() - 1 }, SIR);
    await expect(hesapApi.yenile(server.url, olu)).rejects.toThrow();
  });

  it('SALDIRI: erişim jetonu yenileme jetonu YERİNE geçmiyor (tür karışması)', async () => {
    const k = await yeniHesap(server, 'turkarisma@ornek.com');
    await expect(hesapApi.yenile(server.url, k.erisimToken)).rejects.toThrow();
  });
});

describe('Hesap jetonu ODA jetonu değildir', () => {
  it('SALDIRI: hesap jetonuyla oda uçlarına ve WebSocket’e girilemiyor', async () => {
    const k = await yeniHesap(server, 'sinir@ornek.com');
    const oturum = await sessionApi.create(server.url, { projectName: 'S', ownerName: 'S' });

    await expect(
      sessionApi.participants(server.url, oturum.roomId, k.erisimToken),
    ).rejects.toThrow(/yetkisiz/i);

    const durum = await connectExpectingRejection(server.wsUrl, oturum.roomId, k.erisimToken);
    expect([0, 401]).toContain(durum);
  });

  /* Yukarıdaki test `roomId` denetimini ölçüyor: hesap jetonunda oda alanı
     hiç yok. Aşağıdaki test İKİNCİ kapıyı, TÜR denetimini yalıtıyor —
     `roomId` TAŞIYAN ama türü `hesap` olan bir jeton kurup. Böyle bir jetonu
     sunucu bugün üretmiyor; kapı, ileride bir uç hesap jetonuna oda alanı
     eklerse yetki yükselmesin diye duruyor. Mutasyonla ölçüldü: kapı
     sökülünce bu test kırmızıya döner (M12). */
  it('SALDIRI: oda alanı TAŞIYAN hesap jetonu bile odayı açamıyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'S', ownerName: 'S' });
    const sahte = sign(
      {
        jti: 'ers_sahte',
        roomId: oturum.roomId,
        role: 'owner',
        sub: oturum.ownerUserId,
        kind: 'hesap',
        exp: Date.now() + 60_000,
      },
      SIR,
    );
    await expect(sessionApi.participants(server.url, oturum.roomId, sahte)).rejects.toThrow(/yetkisiz/i);
    expect([0, 401]).toContain(await connectExpectingRejection(server.wsUrl, oturum.roomId, sahte));
    // Katılma yolundaki tür kapısı da ayrı ayrı ölçülüyor.
    await expect(
      sessionApi.join(server.url, oturum.roomId, { token: sahte, name: 'Sahte' }),
    ).rejects.toThrow(/geçersiz/i);
  });

  it('SALDIRI: bir odanın oturum jetonu BAŞKA odada işe yaramıyor', async () => {
    const a = await sessionApi.create(server.url, { projectName: 'A', ownerName: 'A' });
    const b = await sessionApi.create(server.url, { projectName: 'B', ownerName: 'B' });
    const durum = await connectExpectingRejection(server.wsUrl, b.roomId, a.ownerToken);
    expect([0, 401]).toContain(durum);
  });
});

describe('Oda üyeliği KULLANICIYA bağlı (hesap zorunlu)', () => {
  it('hesapsız oda açılamıyor ve odaya katılınamıyor', async () => {
    await expect(
      sessionApi.create(zorunlu.url, { projectName: 'P', ownerName: 'X' }),
    ).rejects.toThrow(/giriş/i);
  });

  it('hesapla açılan odaya SAHİPLİK hesaba yapışıyor', async () => {
    const sahip = await yeniHesap(zorunlu, 'sahip@ornek.com');
    const oturum = await sessionApi.create(
      zorunlu.url,
      { projectName: 'P', ownerName: 'yok sayılır' },
      sahip.erisimToken,
    );
    const kat = await sessionApi.participants(zorunlu.url, oturum.roomId, oturum.ownerToken);
    expect(kat.participants[0].userId).toBe(sahip.hesapId);
    // Görünen ad hesaptan geliyor; gövdedeki ad DEĞİL.
    expect(kat.participants[0].name).toBe('sahip');
  });

  it('SALDIRI: geçerli davet jetonu tek başına YETMİYOR — hesap gerek', async () => {
    const sahip = await yeniHesap(zorunlu, 'sahip2@ornek.com');
    const oturum = await sessionApi.create(zorunlu.url, { projectName: 'P', ownerName: 'S' }, sahip.erisimToken);
    const davet = await sessionApi.invite(zorunlu.url, oturum.roomId, oturum.ownerToken, { role: 'editor' });

    await expect(
      sessionApi.join(zorunlu.url, oturum.roomId, { token: davet.token, name: 'Yabancı' }),
    ).rejects.toThrow(/giriş/i);

    const konuk = await yeniHesap(zorunlu, 'konuk@ornek.com');
    const katildi = await sessionApi.join(
      zorunlu.url,
      oturum.roomId,
      { token: davet.token, name: 'Yabancı' },
      konuk.erisimToken,
    );
    expect(katildi.userId).toBe(konuk.hesapId);
    expect(katildi.role).toBe('editor');
  });

  it('aynı hesap ikinci kez katılınca AYNI kullanıcı — rol yapışık kalıyor', async () => {
    const sahip = await yeniHesap(zorunlu, 'sahip3@ornek.com');
    const oturum = await sessionApi.create(zorunlu.url, { projectName: 'P', ownerName: 'S' }, sahip.erisimToken);
    const uye = await yeniHesap(zorunlu, 'uye@ornek.com');

    const d1 = await sessionApi.invite(zorunlu.url, oturum.roomId, oturum.ownerToken, { role: 'viewer' });
    const ilk = await sessionApi.join(zorunlu.url, oturum.roomId, { token: d1.token, name: 'Ü' }, uye.erisimToken);

    await sessionApi.setRole(zorunlu.url, oturum.roomId, oturum.ownerToken, {
      userId: uye.hesapId,
      role: 'editor',
    });

    const d2 = await sessionApi.invite(zorunlu.url, oturum.roomId, oturum.ownerToken, { role: 'viewer' });
    const ikinci = await sessionApi.join(zorunlu.url, oturum.roomId, { token: d2.token, name: 'Ü' }, uye.erisimToken);

    expect(ikinci.userId).toBe(ilk.userId);
    /* Sahibin verdiği rol KİŞİYE yapışık: yeni bir "viewer" daveti onu geri
       düşüremiyor. Aksi halde herkes kendine düşük rollü bir davet üretip
       rol tablosunu sıfırlayabilirdi. */
    expect(ikinci.role).toBe('editor');
  });

  it('SALDIRI: BAŞKASINA gönderilmiş davet ile girilemiyor', async () => {
    const sahip = await yeniHesap(zorunlu, 'sahip4@ornek.com');
    const oturum = await sessionApi.create(zorunlu.url, { projectName: 'P', ownerName: 'S' }, sahip.erisimToken);
    await yeniHesap(zorunlu, 'davetli@ornek.com');
    const davetsiz = await yeniHesap(zorunlu, 'davetsiz@ornek.com');

    const davet = await sessionApi.invite(zorunlu.url, oturum.roomId, oturum.ownerToken, {
      role: 'editor',
      eposta: 'davetli@ornek.com',
    });

    await expect(
      sessionApi.join(zorunlu.url, oturum.roomId, { token: davet.token, name: 'D' }, davetsiz.erisimToken),
    ).rejects.toThrow(/başka bir hesaba/i);

    const dogru = await hesapApi.giris(zorunlu.url, { eposta: 'davetli@ornek.com', parola: PAROLA });
    await expect(
      sessionApi.join(zorunlu.url, oturum.roomId, { token: davet.token, name: 'D' }, dogru.erisimToken),
    ).resolves.toBeTruthy();
  });
});

describe('Geriye dönük uyum — hesapsız kullanım kırılmıyor', () => {
  it('hesap zorunlu DEĞİLKEN eski akış aynen çalışıyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'Eski', ownerName: 'Sahip' });
    const davet = await sessionApi.invite(server.url, oturum.roomId, oturum.ownerToken, { role: 'editor' });
    const katildi = await sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: 'Konuk' });
    expect(katildi.role).toBe('editor');
    expect(katildi.userName).toBe('Konuk');
  });
});
