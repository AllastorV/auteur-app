import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import * as Y from 'yjs';
import { startServer, publicWebUrl, publicWsUrl, type RunningServer } from '../apps/server/src/server';
import {
  dizinKur,
  KalicilikTuru,
  odaDeposu,
  odaKaydiCikar,
  varsayilanVeriDizini,
  veriDiziniSina,
  KUSAK_SAYISI,
} from '../apps/server/src/kalicilik';
import {
  closeRoom,
  createRoom,
  getRoom,
  getRoomByCode,
  kalicilikKur,
  listRooms,
  odayiYaz,
  sweepRooms,
} from '../apps/server/src/rooms';
import { tlsMalzemesi } from '../apps/server/src/tls';
import { GECICI_ONEK } from '../apps/desktop/electron/atomik';
import { durumOzdes } from '@storyboard/core/veri/kurtarma';
import { createDoc, docToProject } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { createText } from '@storyboard/core/model/objects';
import { sessionApi } from '@storyboard/core/collab/api';
import { connectTestClient, waitFor } from './helpers/wsClient';

/**
 * SUNUCU KALICILIĞI VE TLS.
 *
 * Kullanıcının bağlayıcı cümlesi: "sunucu yeniden başlarsa tekrar program
 * açılması sıkıntı değil, ÖNEMLİ OLAN DOSYALARIN KAYBOLMAMASI. HTTPS/WSS
 * olsun."
 *
 * Odalar YALNIZCA bellekteydi; bu dosyadaki her iddia o boşluğun kapandığını
 * ve kapanışın SESSİZ bir şekilde geri açılamayacağını sınıyor.
 */

const koklar: string[] = [];
const sunucular: RunningServer[] = [];

function gecici(): string {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-kal-'));
  koklar.push(k);
  return k;
}

afterEach(async () => {
  for (const s of sunucular.splice(0)) await s.close().catch(() => {});
  for (const r of listRooms()) closeRoom(r.id);
  kalicilikKur(null, null);
  for (const k of koklar.splice(0)) fs.rmSync(k, { recursive: true, force: true });
});

/** Gerçekçi bir proje belgesi — panel + metin. */
function projeBelgesi(metin: string): Y.Doc {
  const panel = createPanel();
  const proje = createProject({ panels: [panel] });
  const doc = createDoc(proje);
  const katman = panel.layers.find((l) => l.kind === 'main')!.id;
  M.addObject(doc, panel.id, createText({ layerId: katman, x: 10, y: 10 }, { text: metin }));
  return doc;
}

/** Sunucudaki odanın belgesinde metin görünene kadar bekler. */
async function sunucudaBekle(roomId: string, metin: string): Promise<void> {
  await waitFor(() => {
    const room = getRoom(roomId);
    if (!room) return false;
    const paneller = docToProject(room.doc).panels;
    return paneller.some((p) => p.objects.some((o) => (o as any).text === metin));
  }, 8000);
}

/** Bellekte bir oda kurup belgesini tohumlar; kalıcılık BAĞLI değil. */
function odaKur(kok: string, metin: string) {
  const depo = odaDeposu(kok);
  const tur = new KalicilikTuru(depo, listRooms);
  kalicilikKur(depo, tur);
  const room = createRoom('Deneme projesi', 'tok_1');
  Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(projeBelgesi(metin)));
  tur.odaYaz(room, true);
  return { depo, tur, room };
}

describe('oda deposu — yaz / oku', () => {
  it('yazılan oda AYNEN geri okunuyor (belge + kod + roller)', () => {
    const kok = gecici();
    const { depo, room } = odaKur(kok, 'Sahne 1 — dış / gündüz');
    room.users.set('u1', { userId: 'u1', name: 'Editör', role: 'editor', online: true });
    depo.yaz(odaKaydiCikar(room), Y.encodeStateAsUpdate(room.doc));

    const okuma = depo.oku(room.id)!;
    expect(okuma).not.toBeNull();
    expect(okuma.kayit.code).toBe(room.code);
    expect(okuma.kayit.projectName).toBe('Deneme projesi');
    expect(okuma.kayit.users.find((u) => u.userId === 'u1')?.role).toBe('editor');
    /* Çevrimiçi bayrağı DİSKE yazılmaz: yeniden başlatmadan sonra hiç
       bağlanmamış kişiyi çevrimiçi göstermek yalan olurdu. */
    expect(okuma.kayit.users.every((u) => u.online === false)).toBe(true);
    expect(durumOzdes(okuma.doc!, room.doc)).toBe(true);
  });

  it('kuşak halkası BOZUK kayıtta bir öncekine düşüyor (§15.5)', () => {
    const kok = gecici();
    const { depo, tur, room } = odaKur(kok, 'ilk hâl');

    // İkinci kuşak: belge büyüdü.
    const panel = docToProject(room.doc).panels[0];
    M.addObject(
      room.doc,
      panel.id,
      createText(
        { layerId: panel.layers.find((l) => l.kind === 'main')!.id, x: 40, y: 40 },
        { text: 'ikinci hâl' },
      ),
    );
    tur.odaYaz(room, true);

    const dizin = path.join(kok, 'odalar', room.id);
    const cipalar = fs
      .readdirSync(dizin)
      .filter((a) => a.startsWith('cipa-'))
      .sort();
    expect(cipalar.length).toBe(2);

    // EN YENİ çıpayı boz — disk hasarı taklidi.
    fs.writeFileSync(path.join(dizin, cipalar[cipalar.length - 1]), Buffer.from([9, 9, 9, 9, 9]));

    const okuma = depo.oku(room.id)!;
    expect(okuma.doc).not.toBeNull();
    expect(okuma.elenen.length).toBeGreaterThan(0);
    const metinler = docToProject(okuma.doc!).panels[0].objects.map((o) => (o as any).text);
    // Bir kuşak geriye düşüldü: ilk hâl DURUYOR, ikinci hâl kayıp.
    expect(metinler).toContain('ilk hâl');
    expect(metinler).not.toContain('ikinci hâl');
  });

  it(`halka ${KUSAK_SAYISI} kuşakta budanıyor — disk sınırsız büyümüyor`, () => {
    const kok = gecici();
    const { room, tur } = odaKur(kok, 'tohum');
    const panel = docToProject(room.doc).panels[0];
    const katman = panel.layers.find((l) => l.kind === 'main')!.id;
    for (let i = 0; i < 6; i++) {
      M.addObject(room.doc, panel.id, createText({ layerId: katman, x: i, y: i }, { text: `y${i}` }));
      tur.odaYaz(room, true);
    }
    const cipalar = fs
      .readdirSync(path.join(kok, 'odalar', room.id))
      .filter((a) => a.startsWith('cipa-'));
    expect(cipalar.length).toBe(KUSAK_SAYISI);
  });

  it('YERİNDE YAZMA YOK — her dosya rename ile yerine geçiyor (§15.2)', () => {
    const kok = gecici();
    const casus = vi.spyOn(fs, 'renameSync');
    try {
      odaKur(kok, 'atomik olmalı');
      /* İki dosya da (çıpa + kayıt) yan dosyadan RENAME ile yerine geçmeli.
         Doğrudan `writeFileSync(hedef, ...)` yazma ortasındaki bir çökmede
         hem yeni hem ESKİ hâli birlikte götürür — §15.1'in "en kötü ve en
         sinsi" dediği senaryo. */
      const hedefler = casus.mock.calls.map((c) => String(c[1]));
      expect(hedefler.some((h) => h.endsWith('oda.json'))).toBe(true);
      expect(hedefler.some((h) => h.includes('cipa-'))).toBe(true);
    } finally {
      casus.mockRestore();
    }
  });

  it('çökmeden artakalan geçici dosya okumada TEMİZLENİYOR', () => {
    const kok = gecici();
    const { depo, room } = odaKur(kok, 'metin');
    const dizin = path.join(kok, 'odalar', room.id);
    fs.writeFileSync(path.join(dizin, `${GECICI_ONEK}artik.yjs`), 'yarım');

    depo.oku(room.id);

    expect(fs.readdirSync(dizin).filter((a) => a.startsWith(GECICI_ONEK))).toHaveLength(0);
  });

  it('YAZMA HATASI SESSİZ GEÇMİYOR — ikinci hatada engelleyici (§15.4)', () => {
    const kok = gecici();
    /* `odalar` yerine DOSYA koyuluyor: altına dizin açılamaz, her yazım
       başarısız olur. Disk dolu / izin reddi senaryosunun taşınabilir
       taklidi. */
    fs.writeFileSync(path.join(kok, 'odalar'), 'bu bir dizin değil');
    const depo = odaDeposu(kok);

    expect(depo.durum().sonHata).toBeNull();

    const kayit = {
      id: 'room_x',
      code: 'ABC123',
      projectName: 'P',
      ownerTokenId: 't',
      createdAt: 1,
      users: [],
      invites: [],
    };
    depo.yaz(kayit, new Uint8Array([1, 2, 3]));
    expect(depo.durum().sonHata).not.toBeNull();
    // İlk hata uyarı; engelleyici DEĞİL.
    expect(depo.durum().engelleyici).toBe(false);

    depo.yaz(kayit, new Uint8Array([1, 2, 3]));
    expect(depo.durum().ardArdaHata).toBe(2);
    expect(depo.durum().engelleyici).toBe(true);
  });

  it('veri dizini yazılabilir değilse SINAMA fırlatıyor', () => {
    const kok = gecici();
    fs.writeFileSync(path.join(kok, 'odalar'), 'dosya');
    expect(() => veriDiziniSina(kok)).toThrow();
  });

  it('varsayılan veri dizini ortam değişkeninden geliyor', () => {
    expect(varsayilanVeriDizini({ STORYBOARD_DATA_DIR: 'C:/veri' } as any)).toBe('C:/veri');
    expect(varsayilanVeriDizini({} as any)).toContain('.mizansen-sunucu');
  });
});

describe('kalıcılık turu', () => {
  it('DEĞİŞMEYEN oda yeniden yazılmıyor — disk dövülmüyor', () => {
    const kok = gecici();
    const { room, tur } = odaKur(kok, 'metin');
    expect(tur.tur()).toBe(0); // `odaKur` zaten yazdı, değişiklik yok

    const panel = docToProject(room.doc).panels[0];
    M.addObject(
      room.doc,
      panel.id,
      createText(
        { layerId: panel.layers.find((l) => l.kind === 'main')!.id, x: 1, y: 1 },
        { text: 'yeni' },
      ),
    );
    expect(tur.tur()).toBe(1);
    expect(tur.tur()).toBe(0);
  });

  it('yalnız ÜSTVERİ değişse de yazılıyor (rol/davet belge güncellemesi üretmez)', () => {
    const kok = gecici();
    const { room, tur } = odaKur(kok, 'metin');
    expect(tur.tur()).toBe(0);
    room.users.set('u9', { userId: 'u9', name: 'Yeni', role: 'commenter', online: false });
    expect(tur.tur()).toBe(1);
  });
});

describe('sunucu yeniden başlıyor', () => {
  it('ODA İÇERİĞİ VE KODU YENİDEN BAŞLATMADAN SONRA DURUYOR', async () => {
    const kok = gecici();
    const bir = await startServer({ port: 0, secret: 's', logger: false, dataDir: kok, tls: null });
    sunucular.push(bir);

    const oturum = await sessionApi.create(bir.url, {
      projectName: 'Kayıp olmayacak',
      ownerName: 'Sahip',
    });
    const istemci = await connectTestClient(bir.wsUrl, oturum.roomId, oturum.ownerToken);
    Y.applyUpdate(istemci.doc, Y.encodeStateAsUpdate(projeBelgesi('BU METİN KAYBOLMAMALI')));
    istemci.push();
    /* Sabit `setTimeout` DEĞİL: disk/CPU çekişmesinde 250 ms yetmeyebilir ve
       test "kayıt çalışmıyor" diye kırmızıya döner — veri güvenliği paketinde
       oynak bir kırmızı, gerçek kırmızıyı görünmez yapar. Koşul sunucunun
       güncellemeyi UYGULADIĞI an. */
    await sunucudaBekle(oturum.roomId, 'BU METİN KAYBOLMAMALI');
    await istemci.close();

    await bir.close();
    sunucular.length = 0;

    const iki = await startServer({ port: 0, secret: 's', logger: false, dataDir: kok, tls: null });
    sunucular.push(iki);

    const geri = getRoomByCode(oturum.roomCode);
    expect(geri, 'oda kodu yeniden başlatmadan sonra da çözülmeli').toBeTruthy();
    expect(geri!.id).toBe(oturum.roomId);
    expect(geri!.projectName).toBe('Kayıp olmayacak');
    const metinler = docToProject(geri!.doc).panels[0].objects.map((o) => (o as any).text);
    expect(metinler).toContain('BU METİN KAYBOLMAMALI');
  }, 30000);

  it('boşta kalma temizliği DOSYALARI SİLMİYOR, oda geri diriliyor', () => {
    const kok = gecici();
    const { room } = odaKur(kok, 'altı saat sonra da burada');
    const kod = room.code;
    const id = room.id;

    room.idleSince = Date.now() - 1000 * 60 * 60 * 24;
    expect(sweepRooms(1000 * 60 * 60)).toBe(1);
    expect(listRooms().some((r) => r.id === id)).toBe(false);

    const geri = getRoomByCode(kod);
    expect(geri, 'boşaltılan oda kodundan geri diriltilmeli').toBeTruthy();
    const metinler = docToProject(geri!.doc).panels[0].objects.map((o) => (o as any).text);
    expect(metinler).toContain('altı saat sonra da burada');
  });

  it('sahibin oturumu kapatması SİLMİYOR, arşivliyor (§15.3)', async () => {
    const kok = gecici();
    const sunucu = await startServer({ port: 0, secret: 's', logger: false, dataDir: kok, tls: null });
    sunucular.push(sunucu);

    const oturum = await sessionApi.create(sunucu.url, {
      projectName: 'Yanlış tuş',
      ownerName: 'Sahip',
    });
    const istemci = await connectTestClient(sunucu.wsUrl, oturum.roomId, oturum.ownerToken);
    Y.applyUpdate(istemci.doc, Y.encodeStateAsUpdate(projeBelgesi('yanlış tuşa basıldı')));
    istemci.push();
    await sunucudaBekle(oturum.roomId, 'yanlış tuşa basıldı');
    await istemci.close();
    odayiYaz(getRoom(oturum.roomId)!);

    const id = oturum.roomId;
    /* GERÇEK yol: sahibin "oturumu kapat" düğmesi bu uca gidiyor. Doğrudan
       `closeRoom(id, 'arsivle')` çağırsaydık ucun hangi niyeti geçirdiği
       sınanmamış kalırdı (mutasyon M12 böyle hayatta kalmıştı). */
    const silme = await fetch(`${sunucu.url}/api/sessions/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${oturum.ownerToken}` },
    });
    expect(silme.status).toBe(200);

    expect(fs.existsSync(path.join(kok, 'odalar', id))).toBe(false);
    const arsiv = fs.readdirSync(path.join(kok, 'silinen'));
    expect(arsiv.some((a) => a.startsWith(id))).toBe(true);
    // Arşivdeki belge OKUNABİLİR halde: elle kurtarılabilir.
    const arsivDizini = path.join(kok, 'silinen', arsiv.find((a) => a.startsWith(id))!);
    expect(fs.readdirSync(arsivDizini).some((a) => a.startsWith('cipa-'))).toBe(true);
  }, 30000);

  it('açılış dizini diskteki odaları buluyor', () => {
    const kok = gecici();
    const { room } = odaKur(kok, 'metin');
    const kod = room.code;
    closeRoom(room.id);
    kalicilikKur(null, null);

    const yeni = odaDeposu(kok);
    expect(dizinKur(yeni)).toBe(1);
    expect(yeni.dizin().get(kod)).toBe(room.id);
  });

  it('KALICILIK ARIZASI /api/health ile 503 oluyor — sunucunun engelleyici şeridi', async () => {
    const kok = gecici();
    const sunucu = await startServer({
      port: 0,
      secret: 's',
      logger: false,
      dataDir: kok,
      /* Tur devre dışı bırakılamaz; aralığı uzun tutup yazımları ELLE
         tetikliyoruz ki sayaç deterministik olsun. */
      kayitAralikMs: 30_000,
      tls: null,
    });
    sunucular.push(sunucu);

    const oturum = await sessionApi.create(sunucu.url, {
      projectName: 'Sağlık',
      ownerName: 'Sahip',
    });
    expect((await fetch(`${sunucu.url}/api/health`)).status).toBe(200);

    // Disk arızası: veri kökü artık yazılamaz.
    fs.rmSync(path.join(kok, 'odalar'), { recursive: true, force: true });
    fs.writeFileSync(path.join(kok, 'odalar'), 'artık dizin değil');

    const room = getRoom(oturum.roomId)!;
    odayiYaz(room);
    odayiYaz(room);

    const yanit = await fetch(`${sunucu.url}/api/health`);
    expect(yanit.status).toBe(503);
    const govde = await yanit.json();
    expect(govde.ok).toBe(false);
    expect(govde.kalicilik.engelleyici).toBe(true);
    expect(govde.kalicilik.sonHata).toBeTruthy();
  }, 30000);

  it('veri dizini yazılabilir değilse SUNUCU AÇILMIYOR', async () => {
    const kok = gecici();
    fs.writeFileSync(path.join(kok, 'odalar'), 'dosya');
    await expect(
      startServer({ port: 0, secret: 's', logger: false, dataDir: kok, tls: null }),
    ).rejects.toThrow(/Veri dizini yazılabilir değil/u);
  });
});

/* --------------------------------- TLS --------------------------------- */

const TLS_DIZINI = path.join(__dirname, 'yardim', 'tls');
const CERT_YOLU = path.join(TLS_DIZINI, 'test-sunucu.crt');
const KEY_YOLU = path.join(TLS_DIZINI, 'test-sunucu.key');

/** Kendinden imzalı sertifikayı tanıtarak HTTPS isteği atar. */
function httpsIste(url: string, govde?: unknown): Promise<{ kod: number; govde: any }> {
  return new Promise((coz, hata) => {
    const u = new URL(url);
    const veri = govde === undefined ? null : JSON.stringify(govde);
    const istek = https.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: veri ? 'POST' : 'GET',
        ca: fs.readFileSync(CERT_YOLU),
        headers: veri ? { 'content-type': 'application/json' } : {},
      },
      (yanit) => {
        let metin = '';
        yanit.on('data', (p) => (metin += p));
        yanit.on('end', () => {
          try {
            coz({ kod: yanit.statusCode ?? 0, govde: metin ? JSON.parse(metin) : null });
          } catch (e) {
            hata(e);
          }
        });
      },
    );
    istek.on('error', hata);
    if (veri) istek.write(veri);
    istek.end();
  });
}

describe('TLS yapılandırması', () => {
  it('ikisi de yoksa null — düz HTTP', () => {
    expect(tlsMalzemesi({} as any)).toBeNull();
  });

  it('YALNIZ BİRİ verilmişse FIRLIYOR — sessizce şifresiz açılmıyor', () => {
    expect(() => tlsMalzemesi({ STORYBOARD_TLS_CERT: CERT_YOLU } as any)).toThrow(/BİRLİKTE/u);
    expect(() => tlsMalzemesi({ STORYBOARD_TLS_KEY: KEY_YOLU } as any)).toThrow(/BİRLİKTE/u);
  });

  it('dosya okunamıyorsa FIRLIYOR — yanlış yol şifresiz yayına dönüşmüyor', () => {
    expect(() =>
      tlsMalzemesi({
        STORYBOARD_TLS_CERT: path.join(TLS_DIZINI, 'yok.crt'),
        STORYBOARD_TLS_KEY: KEY_YOLU,
      } as any),
    ).toThrow(/okunamadı/u);
  });

  it('ikisi de verilmişse malzeme okunuyor', () => {
    const m = tlsMalzemesi({ STORYBOARD_TLS_CERT: CERT_YOLU, STORYBOARD_TLS_KEY: KEY_YOLU } as any);
    expect(m?.cert.length).toBeGreaterThan(0);
    expect(m?.key.length).toBeGreaterThan(0);
  });
});

describe('adres şeması', () => {
  const istek = (host: string, proto?: string) =>
    ({ headers: { host, ...(proto ? { 'x-forwarded-proto': proto } : {}) } });

  it('sunucu TLS sonlandırıyorsa https / wss üretiliyor', () => {
    expect(publicWebUrl(istek('10.0.0.5:5180'), undefined, 5174, true)).toBe('https://10.0.0.5:5174');
    expect(publicWsUrl(istek('10.0.0.5:5180'), 5180, true)).toBe('wss://10.0.0.5:5180');
  });

  it('TERS VEKİL yolu bozulmadı — x-forwarded-proto hâlâ geçerli', () => {
    expect(publicWebUrl(istek('mizansen.example', 'https'), undefined, 5174, false)).toBe(
      'https://mizansen.example:5174',
    );
    expect(publicWsUrl(istek('mizansen.example', 'https'), 5180, false)).toBe(
      'wss://mizansen.example',
    );
  });

  it('TLS yokken düz http / ws', () => {
    expect(publicWebUrl(istek('10.0.0.5:5180'), undefined, 5174)).toBe('http://10.0.0.5:5174');
    expect(publicWsUrl(istek('10.0.0.5:5180'), 5180)).toBe('ws://10.0.0.5:5180');
  });
});

describe('HTTPS / WSS gerçekten dinliyor', () => {
  it('sertifika verilince REST https, WebSocket wss üzerinden çalışıyor', async () => {
    const kok = gecici();
    const sunucu = await startServer({
      port: 0,
      secret: 's',
      logger: false,
      dataDir: kok,
      tls: {
        cert: fs.readFileSync(CERT_YOLU),
        key: fs.readFileSync(KEY_YOLU),
      },
    });
    sunucular.push(sunucu);

    expect(sunucu.tls).toBe(true);
    expect(sunucu.url.startsWith('https://')).toBe(true);
    expect(sunucu.wsUrl.startsWith('wss://')).toBe(true);

    const saglik = await httpsIste(`${sunucu.url}/api/health`);
    expect(saglik.kod).toBe(200);
    expect(saglik.govde.tls).toBe(true);

    const oturum = await httpsIste(`${sunucu.url}/api/sessions`, {
      projectName: 'TLS',
      ownerName: 'Sahip',
    });
    expect(oturum.kod).toBe(200);
    /* Davet ve WS adresleri de ŞİFRELİ şema üretmeli; `ws://` üretilseydi
       tarayıcı karışık içerik diye engeller ve ortak çalışma hiç kurulmazdı. */
    expect(oturum.govde.wsUrl.startsWith('wss://')).toBe(true);
    expect(oturum.govde.inviteUrl.startsWith('https://')).toBe(true);

    const istemci = await connectTestClient(
      sunucu.wsUrl,
      oturum.govde.roomId,
      oturum.govde.ownerToken,
      { ca: fs.readFileSync(CERT_YOLU) },
    );
    await istemci.waitForSync();
    expect(istemci.role).toBe('owner');
    await istemci.close();
  }, 30000);
});

describe('ÖLÇÜM — yazma turunun maliyeti', () => {
  it('200 panellik belgede tur maliyeti 2 sn aralığın yanında gürültü', () => {
    const kok = gecici();
    const depo = odaDeposu(kok);
    const tur = new KalicilikTuru(depo, listRooms);
    kalicilikKur(depo, tur);
    const room = createRoom('Ölçüm', 'tok_o');

    const paneller = Array.from({ length: 200 }, () => createPanel());
    const proje = createProject({ panels: paneller });
    const kaynak = createDoc(proje);
    for (const p of paneller) {
      M.addObject(
        kaynak,
        p.id,
        createText(
          { layerId: p.layers.find((l) => l.kind === 'main')!.id, x: 0, y: 0 },
          { text: 'Sahnenin repliği burada duruyor ve makul uzunlukta.' },
        ),
      );
    }
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(kaynak));

    const boyut = Y.encodeStateAsUpdate(room.doc).length;
    const sureler: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t = performance.now();
      tur.odaYaz(room, true);
      sureler.push(performance.now() - t);
    }
    sureler.sort((a, b) => a - b);
    const ortalama = sureler.reduce((t, s) => t + s, 0) / sureler.length;
    // eslint-disable-next-line no-console
    console.log(
      `[ölçüm] çıpa ${(boyut / 1024).toFixed(0)} KB — ortalama ${ortalama.toFixed(2)} ms, ` +
        `medyan ${sureler[15].toFixed(2)} ms, en kötü ${sureler[29].toFixed(2)} ms`,
    );

    /* Tavan GENİŞ tutuldu: bu bir başarım yarışı değil, "eşiğin gerekçesi
       hâlâ geçerli mi" nöbeti. Bütün paket paralel koşarken, yani disk
       çekişmesi altında ortalama 45 ms görüldü; tavan onun on katı. Dar bir
       tavan burada oynak kırmızı üretirdi ve veri güvenliği paketinde oynak
       bir kırmızı, gerçek kırmızıyı görünmez yapar. 2000 ms aralıkta 500
       ms'lik bir tur %25 meşguliyet demek — o zaman eşik GERÇEKTEN yeniden
       ölçülmeli. */
    expect(ortalama).toBeLessThan(500);
  }, 30000);
});
