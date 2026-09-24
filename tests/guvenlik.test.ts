import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, VARSAYILAN_HIZ, type RunningServer } from '../apps/server/src/server';
import { sign, verify } from '../apps/server/src/tokens';
import { hizSinirlayici, bagSinirlayici, istemciAdresi } from '../apps/server/src/guvenlik';
import { hesapApi, sessionApi } from '@storyboard/core/collab/api';
import { connectExpectingRejection, connectTestClient } from './helpers/wsClient';

/**
 * GÜVENLİK SERTLEŞTİRME — her iddia bir SALDIRIYLA ölçülüyor.
 *
 * "Hız sınırı eklendi" demek yetmez: sınırı AŞAN istemcinin gerçekten 429
 * aldığı, yetkisiz soketin oda verisinden TEK BAYT bile görmediği, sızmış
 * bir davetin ikinci kez işe yaramadığı ölçülüyor.
 */

const SIR = 'guvenlik-testi-sirri';
let server: RunningServer;

beforeAll(async () => {
  server = await startServer({ port: 0, secret: SIR, logger: false });
}, 30000);

afterAll(async () => {
  await server?.close();
});

const PAROLA = 'GuvenlikParola1';

/* ------------------------------ hız sınırı ----------------------------- */

describe('Hız sınırı — kaba kuvvet parola denemesi', () => {
  it('ÖN KOŞUL: üretim sınırı gerçekten dar', () => {
    // Sınır gevşetilirse aşağıdaki testler saldırıyı ölçmeyi bırakır.
    expect(VARSAYILAN_HIZ.giris.limit).toBeLessThanOrEqual(10);
  });

  it('SALDIRI: sınırı aşan parola denemesi 429 ile REDDEDİLİYOR', async () => {
    const s = await startServer({ port: 0, secret: SIR, logger: false });
    try {
      await hesapApi.kayit(s.url, { eposta: 'hedef@ornek.com', parola: PAROLA });

      const limit = VARSAYILAN_HIZ.giris.limit;
      const durumlar: number[] = [];
      // Sınır kadar YANLIŞ deneme + bir tane daha.
      for (let i = 0; i < limit + 2; i++) {
        const res = await fetch(`${s.url}/api/hesap/giris`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eposta: 'hedef@ornek.com', parola: `Yanlis${i}Parola` }),
        });
        durumlar.push(res.status);
        if (res.status === 429) {
          // `retry-after` OLMADAN istemci ne zaman deneyeceğini bilemez.
          expect(res.headers.get('retry-after')).toBeTruthy();
        }
      }
      expect(durumlar.filter((d) => d === 429).length).toBeGreaterThan(0);

      /* En sert iddia: sınır dolduktan sonra DOĞRU parola bile geçmiyor.
         Sınır yalnız yanlış denemeleri sayıp doğruyu serbest bıraksaydı
         saldırgan parolayı bulduğu an içeri girerdi. */
      const dogru = await fetch(`${s.url}/api/hesap/giris`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eposta: 'hedef@ornek.com', parola: PAROLA }),
      });
      expect(dogru.status).toBe(429);
    } finally {
      await s.close();
    }
  }, 30000);

  it('sayaçlar UÇ BAŞINA ayrı — giriş kapanınca kayıt kapanmıyor', async () => {
    const s = await startServer({
      port: 0,
      secret: SIR,
      logger: false,
      hizSinirlari: { giris: { limit: 1, pencereMs: 60_000 } },
    });
    try {
      await hesapApi.kayit(s.url, { eposta: 'a@ornek.com', parola: PAROLA });
      await hesapApi.giris(s.url, { eposta: 'a@ornek.com', parola: PAROLA });
      await expect(hesapApi.giris(s.url, { eposta: 'a@ornek.com', parola: PAROLA })).rejects.toThrow(/deneme/i);
      // Kayıt ucu HÂLÂ açık: tek bir sayaç kullanılsaydı burası da kapanırdı.
      await expect(hesapApi.kayit(s.url, { eposta: 'b@ornek.com', parola: PAROLA })).resolves.toBeTruthy();
    } finally {
      await s.close();
    }
  }, 30000);

  it('kayan pencere: en eski damga düşünce hak geri geliyor', () => {
    const s = hizSinirlayici(2, 1000);
    expect(s.bak('x', 0).ok).toBe(true);
    expect(s.bak('x', 100).ok).toBe(true);
    expect(s.bak('x', 200).ok).toBe(false);
    // t=1001'de ilk damga (t=0) pencereden düştü.
    expect(s.bak('x', 1001).ok).toBe(true);
  });

  it('sayaç ADRES başına — bir istemcinin cezası ötekini bağlamıyor', () => {
    const s = hizSinirlayici(1, 1000);
    expect(s.bak('a', 0).ok).toBe(true);
    expect(s.bak('a', 1).ok).toBe(false);
    expect(s.bak('b', 1).ok).toBe(true);
  });

  it('`x-forwarded-for` VARSAYILAN OLARAK okunmuyor — sınır uydurma adresle atlanamaz', () => {
    const istek = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      socket: { remoteAddress: '10.0.0.9' },
    };
    expect(istemciAdresi(istek, false)).toBe('10.0.0.9');
    // Ters vekil arkasında AÇIKÇA açılırsa okunuyor.
    expect(istemciAdresi(istek, true)).toBe('1.2.3.4');
  });
});

/* --------------------------- güvenlik başlıkları ------------------------ */

describe('Güvenlik başlıkları', () => {
  it('HSTS, nosniff, Referrer-Policy ve frame-ancestors her yanıtta var', async () => {
    const res = await fetch(`${server.url}/api/health`);
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    /* Davet jetonu ADRESTE taşınıyor; `no-referrer` olmasaydı adres
       üçüncü taraflara Referer başlığıyla sızardı. */
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('HATA yanıtlarında da var — başlık yalnız mutlu yolda olmaz', async () => {
    const res = await fetch(`${server.url}/api/sessions/room_yok/participants`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

/* ------------------------- davet jetonu sızıntısı ----------------------- */

describe('Davet jetonu sızıntısı — tek kullanımlık', () => {
  it('SALDIRI: sızmış davet bağlantısı İKİNCİ kez çalışmıyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    const davet = await sessionApi.invite(server.url, oturum.roomId, oturum.ownerToken, { role: 'editor' });

    await expect(
      sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: 'Davetli' }),
    ).resolves.toBeTruthy();

    /* Tarayıcı geçmişinden ya da vekil günlüğünden aynı bağlantıyı bulan
       biri: aynı jeton, aynı oda — ve REDDEDİLİYOR. */
    await expect(
      sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: 'Saldırgan' }),
    ).rejects.toThrow(/kullanılmış/i);
  });

  it('sahip sınırı açıkça yükseltebiliyor — sınır kadar, bir fazlası değil', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    const davet = await sessionApi.invite(server.url, oturum.roomId, oturum.ownerToken, {
      role: 'viewer',
      kullanimSiniri: 3,
    });
    for (let i = 0; i < 3; i++) {
      await expect(
        sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: `K${i}` }),
      ).resolves.toBeTruthy();
    }
    await expect(
      sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: 'Fazlalık' }),
    ).rejects.toThrow(/kullanılmış/i);
  });

  it('SALDIRI: süresi dolmuş davet REDDEDİLİYOR', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    /* Jeton doğru SIR ile imzalanıyor ama süresi geçmiş; hem imza hem
       davet kaydı geçerli olsa da süre kapıyı kapatıyor. */
    const olu = sign(
      { jti: 'inv_olu', roomId: oturum.roomId, role: 'editor', kind: 'invite', exp: Date.now() - 1000 },
      SIR,
    );
    await expect(
      sessionApi.join(server.url, oturum.roomId, { token: olu, name: 'Geç' }),
    ).rejects.toThrow();
  });
});

/* ------------------------------- WebSocket ----------------------------- */

describe('WebSocket — kimliği doğrulanmamış soket oda verisine ULAŞAMIYOR', () => {
  it('ÖLÇÜM: yetkisiz soket TEK BAYT bile almıyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'Sır', ownerName: 'S' });
    // Odada gerçek içerik olsun ki "veri yoktu" savunması geçerli olmasın.
    const sahip = await connectTestClient(server.wsUrl, oturum.roomId, oturum.ownerToken);
    sahip.doc.getMap('meta').set('gizli', 'ODA-SIRRI');
    sahip.push();
    await new Promise((r) => setTimeout(r, 150));
    await sahip.close();

    const mesajlar: unknown[] = [];
    const durum = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${server.wsUrl}/${oturum.roomId}?token=sahte.jeton`);
      ws.on('message', (m) => mesajlar.push(m));
      ws.once('unexpected-response', (_q, res) => resolve(res.statusCode ?? 0));
      ws.once('error', () => resolve(0));
      ws.once('open', () => {
        ws.close();
        resolve(-1);
      });
    });

    expect(durum).not.toBe(-1); // el sıkışma HİÇ tamamlanmadı
    expect([0, 401]).toContain(durum);
    await new Promise((r) => setTimeout(r, 200));
    expect(mesajlar).toHaveLength(0);
  }, 20000);

  it('SALDIRI: süresi DOLMUŞ oturum jetonuyla soket açılamıyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    const olu = sign(
      {
        jti: 'ses_olu',
        roomId: oturum.roomId,
        role: 'owner',
        sub: oturum.ownerUserId,
        kind: 'session',
        exp: Date.now() - 1,
      },
      SIR,
    );
    expect([0, 401]).toContain(await connectExpectingRejection(server.wsUrl, oturum.roomId, olu));

    // Aynı jeton REST ucunda da geçmiyor — iki kapı ayrı ayrı ölçülüyor.
    const res = await fetch(`${server.url}/api/sessions/${oturum.roomId}/participants`, {
      headers: { authorization: `Bearer ${olu}` },
    });
    expect(res.status).toBe(401);
  });

  it('süresi dolmuş jeton TAZELENEMİYOR, geçerli jeton tazeleniyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    const davet = await sessionApi.invite(server.url, oturum.roomId, oturum.ownerToken, { role: 'editor' });
    const katildi = await sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: 'K' });

    const taze = await sessionApi.refresh(server.url, oturum.roomId, katildi.sessionToken);
    expect(taze.role).toBe('editor');
    const istemci = await connectTestClient(server.wsUrl, oturum.roomId, taze.sessionToken);
    expect(istemci.role).toBe('editor');
    await istemci.close();

    const olu = sign(
      { jti: 'ses_olu2', roomId: oturum.roomId, role: 'editor', sub: katildi.userId, kind: 'session', exp: Date.now() - 1 },
      SIR,
    );
    const res = await fetch(`${server.url}/api/sessions/${oturum.roomId}/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${olu}` },
    });
    expect(res.status).toBe(401);
  }, 20000);

  it('SALDIRI: tek istemci SINIRSIZ soket açamıyor', async () => {
    const s = await startServer({ port: 0, secret: SIR, logger: false, enCokBaglanti: 2 });
    try {
      const oturum = await sessionApi.create(s.url, { projectName: 'P', ownerName: 'S' });
      const acik = [
        await connectTestClient(s.wsUrl, oturum.roomId, oturum.ownerToken),
        await connectTestClient(s.wsUrl, oturum.roomId, oturum.ownerToken),
      ];
      try {
        // Jeton GEÇERLİ; reddin tek sebebi sınır.
        const durum = await connectExpectingRejection(s.wsUrl, oturum.roomId, oturum.ownerToken);
        expect([0, 429]).toContain(durum);

        // Bir soket kapanınca yer geri açılıyor — sayaç sızdırmıyor.
        await acik.pop()!.close();
        await new Promise((r) => setTimeout(r, 150));
        const yeni = await connectTestClient(s.wsUrl, oturum.roomId, oturum.ownerToken);
        await yeni.close();
      } finally {
        for (const c of acik) await c.close();
      }
    } finally {
      await s.close();
    }
  }, 30000);

  it('bağlantı sayacı birimi: sınır dolunca kapalı, düşünce açık', () => {
    const b = bagSinirlayici(2);
    expect(b.ac('a')).toBe(true);
    expect(b.ac('a')).toBe(true);
    expect(b.ac('a')).toBe(false);
    b.kapat('a');
    expect(b.ac('a')).toBe(true);
    expect(b.sayi('yok')).toBe(0);
  });
});

/* ---------------------------- girdi doğrulama --------------------------- */

describe('Girdi doğrulama — güven sınırı', () => {
  it('yanlış TÜRDE alan reddediliyor', async () => {
    const res = await fetch(`${server.url}/api/hesap/kayit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eposta: 'tur@ornek.com', parola: PAROLA, ad: { kotu: 1 } }),
    });
    expect(res.status).toBe(400);
  });

  /* ⚠ TAVAN, açıkça: bu testin ölçtüğü asıl güvence şema DEĞİL, işleyicinin
     gövdeyi hiç YAYMAMASI — davet kaydı alan alan kuruluyor. Şema
     (`additionalProperties: false`) derinlemesine savunma katmanı; tek
     başına sökülse bu test yine yeşil kalır ve mutasyon listesinde bu yüzden
     yok. Ölçülen şey uydurma alanın DAVET KAYDINA GEÇMEMESİ. */
  it('uydurma gövde alanı davet kaydına GEÇMİYOR', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    const res = await fetch(`${server.url}/api/sessions/${oturum.roomId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${oturum.ownerToken}` },
      body: JSON.stringify({ role: 'viewer', kullanim: 99, usedBy: 'saldirgan', revoked: false }),
    });
    expect(res.status).toBe(200);
    const govde = await res.json();
    /* `additionalProperties: false` + Fastify'ın varsayılan `removeAdditional`
       birlikte alanları SÜZÜYOR: uydurma `kullanim`/`revoked` değerleri
       davet kaydına hiç geçmiyor. Geçseydi saldırgan kendi davetini
       "sınırsız" ilan edebilirdi. */
    expect(govde.kullanimSiniri).toBe(1);
    expect(govde).not.toHaveProperty('usedBy');
    // Davet gerçekten TEK kullanımlık kaldı.
    await sessionApi.join(server.url, oturum.roomId, { token: govde.token, name: 'K' });
    await expect(
      sessionApi.join(server.url, oturum.roomId, { token: govde.token, name: 'K2' }),
    ).rejects.toThrow(/kullanılmış/i);
  });

  it('SALDIRI: yol parametresine kaçış dizgesi konamıyor', async () => {
    for (const kotu of ['../../etc/passwd', 'oda!kod', 'a'.repeat(90)]) {
      const res = await fetch(
        `${server.url}/api/sessions/${encodeURIComponent(kotu)}/participants`,
      );
      // 400 = desen reddi. Oda arama koduna bile DÜŞMEDEN kesiliyor.
      expect(res.status).toBe(400);
    }
    /* Çok uzun parametre yönlendiricinin kendi sınırına takılıyor (Fastify
       `maxParamLength`); hangi katmanın kestiği değişebilir, KESİLDİĞİ
       değişmez. */
    const cokUzun = await fetch(`${server.url}/api/sessions/${'a'.repeat(500)}/participants`);
    expect(cokUzun.status).toBeGreaterThanOrEqual(400);
  });

  it('SALDIRI: devasa gövde 413 ile kesiliyor — bellek şişirilemiyor', async () => {
    const res = await fetch(`${server.url}/api/hesap/kayit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eposta: 'x@ornek.com', parola: 'a'.repeat(400_000) }),
    });
    /* GÖVDEYİ İDDİAYA KATIYORUZ: bu test tam paket yükünde ARALIKLI olarak
       kırmızıya dönüyordu ve mesaj yalnız "413 bekleniyordu" diyordu — hangi
       katmanın kestiği (hız kapısı 429? şema 400? bağlantı sıfırlaması?)
       görünmüyordu ve teşhis her seferinde baştan başlıyordu. Bir aralıklı
       test, düştüğü ANDA kendini açıklamıyorsa borç üretir. */
    expect(res.status, `beklenmeyen yanıt: ${await res.text()}`).toBe(413);
  });

  it('geçersiz rol ve sınır dışı sayı reddediliyor', async () => {
    const oturum = await sessionApi.create(server.url, { projectName: 'P', ownerName: 'S' });
    const kotuRol = await fetch(`${server.url}/api/sessions/${oturum.roomId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${oturum.ownerToken}` },
      body: JSON.stringify({ role: 'kral' }),
    });
    expect(kotuRol.status).toBe(400);

    const kotuSayi = await fetch(`${server.url}/api/sessions/${oturum.roomId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${oturum.ownerToken}` },
      body: JSON.stringify({ role: 'editor', kullanimSiniri: 100000 }),
    });
    expect(kotuSayi.status).toBe(400);
  });
});

/* ------------------------------ günlük / sır --------------------------- */

const SUNUCU_KAYNAK = path.resolve(__dirname, '../apps/server/src');

function kaynaklar(): { ad: string; metin: string }[] {
  return fs
    .readdirSync(SUNUCU_KAYNAK)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ ad: f, metin: fs.readFileSync(path.join(SUNUCU_KAYNAK, f), 'utf8') }));
}

describe('Günlükte SIR yok', () => {
  it('hiçbir `console.*` çağrısı jeton/parola/sır taşımıyor — kaynak tarandı', () => {
    /* YAPISAL denetim: çalışma zamanı testi yalnız KOŞULAN yolları görür,
       kaynak taraması hiç tetiklenmeyen bir hata dalındaki sızıntıyı da
       yakalar. Tavanı da açık: dizgeyi başka bir değişkene atayıp yazan bir
       kod bu taramadan kaçar. */
    const yasak = /\b(token|parola|password|secret|sessionToken|ownerToken|erisimToken|yenilemeToken|hash|tuz)\b/i;
    const bulunanlar: string[] = [];
    for (const { ad, metin } of kaynaklar()) {
      for (const [i, satir] of metin.split('\n').entries()) {
        const kod = satir.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (/console\.(log|error|warn|info|debug)\s*\(/.test(kod) && yasak.test(kod)) {
          bulunanlar.push(`${ad}:${i + 1} → ${satir.trim()}`);
        }
      }
    }
    expect(bulunanlar).toEqual([]);
  });

  it('ÖLÇÜM: tam bir akışta konsola tek bir jeton bile düşmüyor', async () => {
    const yakalanan: string[] = [];
    const asil = { log: console.log, error: console.error, warn: console.warn };
    console.log = (...a: unknown[]) => void yakalanan.push(a.join(' '));
    console.error = (...a: unknown[]) => void yakalanan.push(a.join(' '));
    console.warn = (...a: unknown[]) => void yakalanan.push(a.join(' '));

    let kayit: Awaited<ReturnType<typeof hesapApi.kayit>>;
    let oturum: Awaited<ReturnType<typeof sessionApi.create>>;
    let davet: Awaited<ReturnType<typeof sessionApi.invite>>;
    try {
      kayit = await hesapApi.kayit(server.url, { eposta: 'gunluk@ornek.com', parola: 'GunlukParola1' });
      oturum = await sessionApi.create(server.url, { projectName: 'G', ownerName: 'S' });
      davet = await sessionApi.invite(server.url, oturum.roomId, oturum.ownerToken, { role: 'editor' });
      await sessionApi.join(server.url, oturum.roomId, { token: davet.token, name: 'K' });
      // Başarısız giriş de günlüğe parola yazmamalı.
      await hesapApi.giris(server.url, { eposta: 'gunluk@ornek.com', parola: 'YanlisParola1' }).catch(() => null);
    } finally {
      console.log = asil.log;
      console.error = asil.error;
      console.warn = asil.warn;
    }

    const hepsi = yakalanan.join('\n');
    for (const sir of [
      'GunlukParola1',
      'YanlisParola1',
      kayit.erisimToken,
      kayit.yenilemeToken,
      oturum.ownerToken,
      davet.token,
      SIR,
    ]) {
      expect(hepsi).not.toContain(sir);
    }
  }, 20000);
});

/* --------------------------- zamanlama saldırısı ------------------------ */

describe('Sabit zamanlı karşılaştırma', () => {
  it('parola ve jeton karşılaştırmaları `timingSafeEqual` kullanıyor', () => {
    const dosyalar = Object.fromEntries(kaynaklar().map((k) => [k.ad, k.metin]));
    /* YAPISAL denetim, gerekçesi açık: gerçek bir zamanlama ölçümü test
       makinesinin gürültüsünde güvenilir olmaz (çöp toplama, zamanlayıcı
       çözünürlüğü) ve kırılgan bir test güvenlikten çok yanlış güven üretir.
       Ölçülen şey KARŞILAŞTIRMANIN KENDİSİ: erken dönen bir karşılaştırmaya
       geçilirse bu test kırmızı döner. */
    expect(dosyalar['hesaplar.ts']).toContain('crypto.timingSafeEqual');
    expect(dosyalar['tokens.ts']).toContain('crypto.timingSafeEqual');
    // Parola türevi ASLA erken dönen bir karşılaştırmayla sınanmıyor.
    expect(dosyalar['hesaplar.ts']).not.toMatch(/hash\s*(===|!==|\.equals\()/);
  });

  it('jeton imzası tek bayt farkla bile kabul edilmiyor', () => {
    const jeton = sign({ jti: 'a', roomId: 'r', role: 'viewer', kind: 'session', exp: Date.now() + 60_000 }, SIR);
    expect(verify(jeton, SIR)).toBeTruthy();
    // Son bayt değişti — MAC tutmuyor.
    const bozuk = jeton.slice(0, -1) + (jeton.at(-1) === 'A' ? 'B' : 'A');
    expect(verify(bozuk, SIR)).toBeNull();
    // BAŞKA bir sırla imzalanmış jeton da geçmiyor.
    const yabanci = sign({ jti: 'a', roomId: 'r', role: 'owner', kind: 'session', exp: Date.now() + 60_000 }, 'baska-sir');
    expect(verify(yabanci, SIR)).toBeNull();
  });
});
