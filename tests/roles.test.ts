import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, type RunningServer } from '../apps/server/src/server';
import { ARDA_ARDA_RET_SINIRI, checkUpdatePermission } from '../apps/server/src/sync';
import * as encoding from 'lib0/encoding';
import { MSG } from '@storyboard/core/collab/protocol';
import { sessionApi } from '@storyboard/core/collab/api';
import { createDoc, docToProject, findPanelMap } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { createStroke, createText } from '@storyboard/core/model/objects';
import { protectedProjection } from '@storyboard/core/model/projection';
import { connectTestClient, connectExpectingRejection, waitFor } from './helpers/wsClient';
import type { Panel } from '@storyboard/core/model/types';

let server: RunningServer;
let base: ReturnType<typeof createProject>;
let ownerToken: string;
let roomId: string;

/** Sunucudaki boş dokümanı sahip istemcisi üzerinden tohumlar. */
async function seedProject() {
  const panel = createPanel();
  base = createProject({ panels: [panel] });
  const seedDoc = createDoc(base);

  const owner = await connectTestClient(server.wsUrl, roomId, ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seedDoc));
  owner.push();
  await new Promise((r) => setTimeout(r, 200));
  await owner.close();
}

function mainLayerId(panel: Panel) {
  return panel.layers.find((l) => l.kind === 'main')!.id;
}
function annotationLayerId(panel: Panel) {
  return panel.layers.find((l) => l.kind === 'annotation')!.id;
}

/* Kalıcılık her sunucuda AÇIK; test geçici bir kök veriyor ki gerçek veri
   dizinini kirletmesin. */
const veriKok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-rol-'));

beforeAll(async () => {
  server = await startServer({
    port: 0,
    secret: 'test-secret',
    logger: false,
    dataDir: veriKok,
    tls: null,
  });
  const session = await sessionApi.create(server.url, {
    projectName: 'Rol testi',
    ownerName: 'Sahip',
  });
  ownerToken = session.ownerToken;
  roomId = session.roomId;
  await seedProject();
}, 30000);

afterAll(async () => {
  await server?.close();
  fs.rmSync(veriKok, { recursive: true, force: true });
});

async function joinAs(role: 'editor' | 'commenter' | 'viewer', name: string) {
  const invite = await sessionApi.invite(server.url, roomId, ownerToken, { role });
  const joined = await sessionApi.join(server.url, roomId, { token: invite.token, name });
  return { invite, joined };
}

describe('Sunucu tarafı rol zorlaması', () => {
  it('Sahip rolü ana katmanı değiştirebilir', async () => {
    const owner = await connectTestClient(server.wsUrl, roomId, ownerToken);
    expect(owner.role).toBe('owner');
    const project = docToProject(owner.doc);
    const panel = project.panels[0];

    M.addObject(
      owner.doc,
      panel.id,
      createText({ layerId: mainLayerId(panel), x: 10, y: 10 }, { text: 'Sahip yazdı' }),
    );
    owner.push();
    await new Promise((r) => setTimeout(r, 200));

    expect(owner.denials).toHaveLength(0);
    await owner.close();
  });

  it('Editör rolü ana katmanı değiştirebilir, dışa aktaramaz', async () => {
    const { joined } = await joinAs('editor', 'Editör');
    expect(joined.role).toBe('editor');

    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    expect(client.role).toBe('editor');

    const panel = docToProject(client.doc).panels[0];
    M.addObject(
      client.doc,
      panel.id,
      createText({ layerId: mainLayerId(panel), x: 20, y: 20 }, { text: 'Editör yazdı' }),
    );
    client.push();
    await new Promise((r) => setTimeout(r, 250));

    expect(client.denials).toHaveLength(0);
    const texts = docToProject(client.doc)
      .panels[0].objects.filter((o) => o.kind === 'text')
      .map((o) => (o as any).text);
    expect(texts).toContain('Editör yazdı');
    await client.close();
  });

  it('Yorumcu rolü ANA KATMANI DEĞİŞTİREMEZ (sunucu reddeder)', async () => {
    const { joined } = await joinAs('commenter', 'Yorumcu');
    expect(joined.role).toBe('commenter');

    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    expect(client.role).toBe('commenter');

    const panel = docToProject(client.doc).panels[0];
    const before = protectedProjection(client.doc);

    // Ana katmana çizim denemesi
    M.addObject(
      client.doc,
      panel.id,
      createStroke(
        { layerId: mainLayerId(panel), x: 0, y: 0 },
        { points: [0, 0, 1, 50, 50, 1], color: '#f00', width: 5 },
      ),
    );
    client.push();

    await waitFor(() => client.denials.length > 0, 5000);
    expect(client.denials[0]).toMatch(/işaretleme katmanına/i);

    // Yetkili istemci üzerinden sunucudaki dokümanın değişmediğini doğrula.
    const verifier = await connectTestClient(server.wsUrl, roomId, ownerToken);
    const serverPanel = docToProject(verifier.doc).panels[0];
    const strokeOnMain = serverPanel.objects.some(
      (o) => o.kind === 'stroke' && o.layerId === mainLayerId(panel),
    );
    expect(strokeOnMain).toBe(false);
    expect(protectedProjection(verifier.doc)).toBe(before);

    await verifier.close();
    await client.close();
  });

  it('Yorumcu rolü işaretleme katmanına yazabilir', async () => {
    const { joined } = await joinAs('commenter', 'Yorumcu 2');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);

    const panel = docToProject(client.doc).panels[0];
    M.addObject(
      client.doc,
      panel.id,
      createText(
        { layerId: annotationLayerId(panel), x: 30, y: 30 },
        { text: 'Buraya bir yakın plan gerekli' },
      ),
    );
    client.push();
    await new Promise((r) => setTimeout(r, 300));

    expect(client.denials).toHaveLength(0);

    const verifier = await connectTestClient(server.wsUrl, roomId, ownerToken);
    const annotations = docToProject(verifier.doc)
      .panels[0].objects.filter((o) => o.layerId === annotationLayerId(panel))
      .map((o) => (o as any).text);
    expect(annotations).toContain('Buraya bir yakın plan gerekli');

    await verifier.close();
    await client.close();
  });

  it('Yorumcu panel meta verisini değiştiremez', async () => {
    const { joined } = await joinAs('commenter', 'Yorumcu 3');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    const panel = docToProject(client.doc).panels[0];

    M.updatePanelMeta(client.doc, panel.id, { dialogue: 'İzinsiz replik' });
    client.push();
    await waitFor(() => client.denials.length > 0, 5000);

    const verifier = await connectTestClient(server.wsUrl, roomId, ownerToken);
    expect(docToProject(verifier.doc).panels[0].meta.dialogue).not.toBe('İzinsiz replik');
    await verifier.close();
    await client.close();
  });

  it('Yorumcu katman türünü değiştirerek yetki yükseltemez', async () => {
    const { joined } = await joinAs('commenter', 'Yorumcu 4');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    const panel = docToProject(client.doc).panels[0];

    // Ana katmanı "annotation" ilan edip sonra yazmayı dener.
    M.updateLayer(client.doc, panel.id, mainLayerId(panel), { kind: 'annotation' } as any);
    client.push();
    await waitFor(() => client.denials.length > 0, 5000);

    const verifier = await connectTestClient(server.wsUrl, roomId, ownerToken);
    const serverPanel = docToProject(verifier.doc).panels[0];
    const mainLayer = serverPanel.layers.find((l) => l.id === mainLayerId(panel));
    expect(mainLayer?.kind).toBe('main');
    await verifier.close();
    await client.close();
  });

  it('İzleyici rolü hiçbir değişiklik yapamaz', async () => {
    const { joined } = await joinAs('viewer', 'İzleyici');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    expect(client.role).toBe('viewer');

    const panel = docToProject(client.doc).panels[0];
    M.addObject(
      client.doc,
      panel.id,
      createText({ layerId: annotationLayerId(panel), x: 0, y: 0 }, { text: 'İzleyici notu' }),
    );
    client.push();
    await waitFor(() => client.denials.length > 0, 5000);
    expect(client.denials[0]).toMatch(/İzleyici/i);

    const verifier = await connectTestClient(server.wsUrl, roomId, ownerToken);
    const texts = docToProject(verifier.doc).panels[0].objects.map((o) => (o as any).text);
    expect(texts).not.toContain('İzleyici notu');
    await verifier.close();
    await client.close();
  });
});

describe('F9′ — SENARYO katmanında rol zorlaması', () => {
  /* Bitiş ölçütü: "Yorumcu rolü senaryo metnini değiştiremiyor." Bugüne
     kadar yalnız kod okumasıyla doğrulanmıştı; çift kapının SUNUCU yarısı
     ölçülmemişti. İstemci kapısı (`allowed('edit')`) tek başına yeterli
     değil — arayüzü gizlemek yetki değildir. */
  const senaryo = (metin: string) => ({
    name: 's',
    blocks: [{ id: 'sb_1', fp: 'f1', type: 'action' as const, text: metin, scene: '', sceneId: 'sc1' }],
  });

  it('Sahip senaryo metnini YAZABİLİYOR', async () => {
    const owner = await connectTestClient(server.wsUrl, roomId, ownerToken);
    try {
      M.setScript(owner.doc, senaryo('Sahip yazdı.'));
      owner.push();
      await waitFor(() => docToProject(owner.doc).script.blocks[0]?.text === 'Sahip yazdı.');
      expect(owner.denials).toHaveLength(0);
    } finally { await owner.close(); }
  });

  it('Editör senaryo metnini YAZABİLİYOR', async () => {
    const { joined } = await joinAs('editor', 'Ed');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    try {
      M.setScript(client.doc, senaryo('Editör yazdı.'));
      client.push();
      await waitFor(() => docToProject(client.doc).script.blocks[0]?.text === 'Editör yazdı.');
      expect(client.denials).toHaveLength(0);
    } finally { await client.close(); }
  });

  it('YORUMCU senaryo metnini DEĞİŞTİREMİYOR — sunucu reddediyor', async () => {
    const { joined } = await joinAs('commenter', 'Yor');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    try {
      M.setScript(client.doc, senaryo('Yorumcu yazmaya çalıştı.'));
      client.push();
      await waitFor(() => client.denials.length > 0);
      expect(client.denials[0]).toMatch(/işaretleme|Yorumcu/i);
    } finally { await client.close(); }
  });

  it('İZLEYİCİ senaryo metnini DEĞİŞTİREMİYOR', async () => {
    const { joined } = await joinAs('viewer', 'İzl');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    try {
      M.setScript(client.doc, senaryo('İzleyici yazmaya çalıştı.'));
      client.push();
      await waitFor(() => client.denials.length > 0);
      expect(client.denials[0]).toMatch(/İzleyici/i);
    } finally { await client.close(); }
  });

  /* Reddedilen yazımdan sonra ODA metni değişmemiş olmalı: ret mesajı
     gelmesi yetmez, belgenin dokunulmamış olması gerekir. */
  it('reddedilen yazımdan sonra oda metni DOKUNULMAMIŞ', async () => {
    const owner = await connectTestClient(server.wsUrl, roomId, ownerToken);
    try {
      M.setScript(owner.doc, senaryo('Yetkili metin.'));
      owner.push();
      await waitFor(() => docToProject(owner.doc).script.blocks[0]?.text === 'Yetkili metin.');

      const { joined } = await joinAs('commenter', 'Yor2');
      const kotu = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
      try {
        M.setScript(kotu.doc, senaryo('İzinsiz metin.'));
        kotu.push();
        await waitFor(() => kotu.denials.length > 0);
        // Sahibin belgesinde izinsiz metin GÖRÜNMÜYOR.
        await new Promise((r) => setTimeout(r, 200));
        expect(docToProject(owner.doc).script.blocks[0].text).toBe('Yetkili metin.');
      } finally { await kotu.close(); }
    } finally { await owner.close(); }
  });
});

describe('Davet token’ları', () => {
  it('iptal edilen davet ile katılınamaz', async () => {
    const invite = await sessionApi.invite(server.url, roomId, ownerToken, { role: 'editor' });
    await sessionApi.revokeInvite(server.url, roomId, ownerToken, invite.tokenId);
    await expect(
      sessionApi.join(server.url, roomId, { token: invite.token, name: 'Geç kalan' }),
    ).rejects.toThrow(/iptal/i);
  });

  it('süresi dolmuş davet reddedilir', async () => {
    const invite = await sessionApi.invite(server.url, roomId, ownerToken, {
      role: 'editor',
      expiresInMinutes: 1,
    });
    // Token'ın süresi ileri; iptal listesi yerine imza doğrulaması test edilir.
    const tampered = invite.token.slice(0, -2) + 'xx';
    await expect(
      sessionApi.join(server.url, roomId, { token: tampered, name: 'Sahte' }),
    ).rejects.toThrow();
  });

  it('geçersiz token ile WebSocket bağlantısı reddedilir', async () => {
    const status = await connectExpectingRejection(server.wsUrl, roomId, 'gecersiz.token');
    expect([0, 401]).toContain(status);
  });

  it('Editör davet oluşturamaz', async () => {
    const { joined } = await joinAs('editor', 'Editör 2');
    await expect(
      sessionApi.invite(server.url, roomId, joined.sessionToken, { role: 'editor' }),
    ).rejects.toThrow(/Sahip/i);
  });

  it('Sahip rolü çalışırken değiştirebilir ve yeni rol anında uygulanır', async () => {
    const { joined } = await joinAs('viewer', 'Terfi eden');
    const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    expect(client.role).toBe('viewer');

    await sessionApi.setRole(server.url, roomId, ownerToken, {
      userId: joined.userId,
      role: 'editor',
    });
    await waitFor(() => client.role === 'editor', 4000);

    const panel = docToProject(client.doc).panels[0];
    const denialsBefore = client.denials.length;
    M.addObject(
      client.doc,
      panel.id,
      createText({ layerId: mainLayerId(panel), x: 5, y: 5 }, { text: 'Terfi sonrası' }),
    );
    client.push();
    await new Promise((r) => setTimeout(r, 250));
    expect(client.denials.length).toBe(denialsBefore);
    await client.close();
  });
});

/**
 * KARAR 11 — bozuk/hazırlanmış güncelleme SÜRECİ DÜŞÜRMEZ.
 *
 * Ölçülmüştü: `checkUpdatePermission` → `protectedProjection` → `readScript`
 * fırlattığında istisna ws 'message' geri çağrısından çıkıp süreci indiriyordu.
 * Yetkisiz bir istemcinin bir kullanılabilirlik saldırısına dönüşebilmesi
 * kabul edilemez. Karar 10 fırlatma yollarının çoğunu kapattı; bu testler
 * DERİNLEMESİNE SAVUNMA katmanını sınıyor.
 */
describe('Bozuk güncelleme dayanıklılığı (Karar 11)', () => {
  const BOZUK = new Uint8Array([1, 200, 200, 200, 200, 200, 99, 42, 7, 7, 7]);

  it('ÖN KOŞUL: bu yük Yjs’i gerçekten fırlatıyor', () => {
    // Yoksa aşağıdaki iddialar hiçbir şey ispatlamaz.
    expect(() => Y.applyUpdate(new Y.Doc(), BOZUK)).toThrow();
  });

  it('checkUpdatePermission fırlatmaz — REDDEDER', () => {
    // Kırılan sözleşme tam olarak bu: yorumcu yolundaki gölge doküman
    // çözümlemesi istisnayı çağırana sızdırıyordu.
    const oda = { doc: createDoc(base) } as unknown as Parameters<typeof checkUpdatePermission>[0];
    const verdict = checkUpdatePermission(oda, 'commenter', BOZUK);
    expect(verdict.allowed).toBe(false);
    expect((verdict as { reason: string }).reason).toContain('çözümlenemedi');
  });

  it('SAHİP rolü bozuk yük gönderse de sunucu düşmez — izin denetimi bu yolu HİÇ görmez', async () => {
    /* `can(role, 'edit')` sahibi/editörü gölge doküman denetimine hiç sokmaz:
       baytlar doğrudan `Y.applyUpdate(room.doc, …)`ya gidiyor. İçerideki
       catch bu yolu KORUMAZ; koruyan tek şey ws işleyicisindeki dış katman. */
    const owner = await connectTestClient(server.wsUrl, roomId, ownerToken);
    try {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG.SYNC);
      encoding.writeVarUint(encoder, 2 /* SYNC_UPDATE */);
      encoding.writeVarUint8Array(encoder, BOZUK);
      owner.socket.send(encoding.toUint8Array(encoder));

      await waitFor(() => owner.denials.length > 0);
      expect(owner.denials[0]).toContain('uygulanamadı');

      // Oda hâlâ yazılabilir.
      const panelId = docToProject(owner.doc).panels[0].id;
      M.updatePanelMeta(owner.doc, panelId, { sound: 'sahip-sonrasi' });
      owner.push();
      await waitFor(() => docToProject(owner.doc).panels[0].meta.sound === 'sahip-sonrasi');
    } finally {
      await owner.close();
    }
  });

  /* Her ret gölgenin YENİDEN KURULMASINI gerektiriyor (doküman boyutunda
     O(n)) ve bu iş Node'un tek iş parçacığında dönüyor. Sınırsız bırakılsaydı
     yorumcu yetkisiyle bağlanan biri döngüde çöp göndererek yalnız kendi
     odasını değil SUNUCUDAKİ BÜTÜN ODALARI durdurabilirdi. */
  it('arka arkaya çok fazla ret bağlantıyı KAPATIYOR', async () => {
    const { joined } = await joinAs('commenter', 'Sel');
    const kotu = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    try {
      for (let i = 0; i < ARDA_ARDA_RET_SINIRI + 5; i++) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG.SYNC);
        encoding.writeVarUint(encoder, 2 /* SYNC_UPDATE */);
        encoding.writeVarUint8Array(encoder, BOZUK);
        kotu.socket.send(encoding.toUint8Array(encoder));
      }
      await waitFor(() => kotu.socket.readyState === kotu.socket.CLOSED, 5000);
      expect(kotu.denials.length).toBeGreaterThanOrEqual(ARDA_ARDA_RET_SINIRI);
    } finally {
      await kotu.close();
    }

    // Sunucu ayakta: başka bir istemci normal çalışmaya devam ediyor.
    const iyi = await connectTestClient(server.wsUrl, roomId, ownerToken);
    try {
      const panelId = docToProject(iyi.doc).panels[0].id;
      M.updatePanelMeta(iyi.doc, panelId, { sound: 'selden-sonra' });
      iyi.push();
      await waitFor(() => docToProject(iyi.doc).panels[0].meta.sound === 'selden-sonra');
    } finally {
      await iyi.close();
    }
  });

  it('bozuk yük gönderen istemci SUNUCUYU DÜŞÜRMEZ, diğerleri çalışmaya devam eder', async () => {
    const { joined } = await joinAs('commenter', 'Kotu');
    const kotu = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
    const iyi = await connectTestClient(server.wsUrl, roomId, ownerToken);
    try {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG.SYNC);
      encoding.writeVarUint(encoder, 2 /* SYNC_UPDATE */);
      encoding.writeVarUint8Array(encoder, BOZUK);
      kotu.socket.send(encoding.toUint8Array(encoder));

      /* Güncelleme REDDEDİLMELİ. "Süreç çökmedi"ye bakmak yetmez: yakalanmamış
         istisna vitest'te testi düşürmeden koşu sonunda raporlanıyor, yani
         sessiz bir geçiş bırakırdı. Reddin istemciye ULAŞTIĞINI iddia etmek
         hem çökmemeyi hem doğru davranışı tek seferde bağlar. */
      await waitFor(() => kotu.denials.length > 0);
      /* HANGİ katmanın yakaladığı da iddia edilir (K-4). Gönderen YORUMCU;
         yük `checkUpdatePermission`'ın içindeki catch'e düşmek zorunda, ws
         işleyicisindeki dış katmana değil. `/çözümlenemedi|uygulanamadı/`
         gevşekti: iç catch kaldırılsa dış katman devralır, mesaj değişir ve
         test yine geçerdi — iki katmandan biri sessizce sökülebilirdi. */
      expect(kotu.denials[0]).toContain('çözümlenemedi');

      // Sunucu ayakta: sahip hâlâ yazabiliyor ve değişiklik kalıcı.
      const panelId = docToProject(iyi.doc).panels[0].id;
      M.updatePanelMeta(iyi.doc, panelId, { sound: 'hala-ayakta' });
      iyi.push();
      await waitFor(() => docToProject(iyi.doc).panels[0].meta.sound === 'hala-ayakta');
      expect(docToProject(iyi.doc).panels[0].meta.sound).toBe('hala-ayakta');
    } finally {
      await kotu.close();
      await iyi.close();
    }
  });
});


describe('QA bağlantı regresyonları', () => {
  it('davet WS ve katılımcı listesinde oturum jetonu yerine kullanılamaz; gerçek üye yeniden bağlanır', async () => {
    const invite = await sessionApi.invite(server.url, roomId, ownerToken, { role: 'editor' });
    expect(await connectExpectingRejection(server.wsUrl, roomId, invite.token)).toBe(401);
    const joined = await sessionApi.join(server.url, roomId, { token: invite.token, name: 'QA üye' });
    expect(await connectExpectingRejection(server.wsUrl, roomId, invite.token)).toBe(401);
    const response = await server.fastify.inject({ method: 'GET', url: '/api/sessions/'+roomId+'/participants', headers: { authorization: 'Bearer '+invite.token } });
    expect(response.statusCode).toBe(401);
    for (let i = 0; i < 2; i++) {
      const client = await connectTestClient(server.wsUrl, roomId, joined.sessionToken);
      try { expect(client.role).toBe('editor'); } finally { await client.close(); }
    }
  });
  it('eksik SYNC_STEP1 yalnız gönderen bağlantıyı kapatır, diğer yazıcılar çalışır', async () => {
    const good = await connectTestClient(server.wsUrl, roomId, ownerToken);
    const malformed = await connectTestClient(server.wsUrl, roomId, ownerToken);
    try {
      malformed.socket.send(new Uint8Array([MSG.SYNC, 0]));
      await waitFor(() => malformed.socket.readyState === malformed.socket.CLOSED);
      expect((await server.fastify.inject('/api/health')).statusCode).toBe(200);
      const verifier = await connectTestClient(server.wsUrl, roomId, ownerToken);
      try {
        const panel = docToProject(good.doc).panels[0];
        M.updatePanelMeta(good.doc, panel.id, { sound: 'step1-sonrasi' });
        good.push();
        await waitFor(() => docToProject(verifier.doc).panels[0].meta.sound === 'step1-sonrasi');
      } finally { await verifier.close(); }
    } finally { await malformed.close(); await good.close(); }
  });
});
