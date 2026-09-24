import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDoc } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createText } from '@storyboard/core/model/objects';
import { protectedProjection } from '@storyboard/core/model/projection';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { checkUpdatePermission } from '../apps/server/src/sync';
import type { Room } from '../apps/server/src/rooms';

interface Kurulum {
  room: Room;
  panelId: string;
  katmanId: string;
}

function kur(blokSayisi = 0): Kurulum {
  const doc = createDoc(createProject({ panels: [createPanel()] }));
  if (blokSayisi) {
    M.setScript(doc, {
      name: 'x',
      blocks: Array.from({ length: blokSayisi }, (_, i) => ({
        id: `sb_${i}`,
        fp: '',
        type: 'action' as const,
        text: `Satir ${i} - biraz metin, biraz daha metin burada.`,
        scene: '',
        sceneId: '',
      })),
    });
  }
  const pm = doc.getArray('panels').get(0) as Y.Map<unknown>;
  const panelId = pm.get('id') as string;
  const katmanlar = (pm.get('layers') as Y.Array<unknown>).toJSON() as { kind: string; id: string }[];
  const katmanId = katmanlar.find((l) => l.kind === 'annotation')!.id;
  return { room: { doc } as Room, panelId, katmanId };
}

/** Odanın güncel durumunu taşıyan taze bir istemci kopyası. */
function istemci(room: Room): Y.Doc {
  const k = new Y.Doc();
  Y.applyUpdate(k, Y.encodeStateAsUpdate(room.doc));
  return k;
}

/** `yaz` içinde yapılan değişikliği tek bir güncelleme paketine çevirir. */
function paket(kaynak: Y.Doc, yaz: (d: Y.Doc) => void): Uint8Array {
  const sv = Y.encodeStateVector(kaynak);
  yaz(kaynak);
  return Y.encodeStateAsUpdate(kaynak, sv);
}

describe('Yorumcu denetimi — oda başına gölge ve izdüşüm önbelleği (Ö-2)', () => {
  it('gölge ODANIN yazımlarını izler: bayat gölge yasak yazımı SERBEST bırakırdı', () => {
    const { room, panelId, katmanId } = kur();

    // Gölge TEMBEL kurulur; sahip yazımından ÖNCE kurulsun ki bayatlama
    // ihtimali gerçekten doğsun. Bunun için izinli bir yazım yeterli.
    const ilk = paket(istemci(room), (d) =>
      M.addObject(d, panelId, createText({ layerId: katmanId, x: 0, y: 0 }, { text: 'not' })),
    );
    expect(checkUpdatePermission(room, 'commenter', ilk).allowed).toBe(true);

    // Sahip odaya YENİ bir panel ekler — gölgede henüz olmayan bir durum.
    const sahip = istemci(room);
    Y.applyUpdate(room.doc, paket(sahip, (d) => M.addPanel(d)));

    // Yorumcu, YENİ panelin korumalı alanına yazıyor.
    const yorumcu = istemci(room);
    const yeniPanelId = (yorumcu.getArray('panels').get(1) as Y.Map<unknown>).get('id') as string;
    const yasak = paket(yorumcu, (d) => M.updatePanelMeta(d, yeniPanelId, { sound: 'izinsiz' }));

    /* Gölge sahip yazımını almasaydı bu paket gölgede BEKLEYEN güncelleme
       olarak kalır, hiç uygulanmaz, izdüşüm değişmez ve denetim "değişiklik
       yok" diye SERBEST bırakırdı — yorumcu korumalı alana yazmış olurdu. */
    expect(checkUpdatePermission(room, 'commenter', yasak).allowed).toBe(false);
  });

  it('sahip yazımından sonra yorumcunun İZİNLİ yazımı hâlâ kabul edilir', () => {
    const { room, panelId, katmanId } = kur();

    // Önbelleği doldur: ilk izinli yazım.
    const ilk = paket(istemci(room), (d) =>
      M.addObject(d, panelId, createText({ layerId: katmanId, x: 0, y: 0 }, { text: 'a' })),
    );
    expect(checkUpdatePermission(room, 'commenter', ilk).allowed).toBe(true);

    // Sahip odayı değiştirir — gölge bunu alır, ÖNBELLEK BAYATLAR.
    Y.applyUpdate(room.doc, paket(istemci(room), (d) => M.addPanel(d)));

    /* Önbellek geçersizleştirilmezse `before` sahip yazımından ÖNCEKİ izdüşüm
       kalır, `after` yeni paneli içerir ve ikisi tutmaz: yorumcunun tamamen
       MEŞRU işaretleme yazımı reddedilir. Bayat önbellek burada güvenlik değil
       KULLANILAMAZLIK üretir — yorumcu odada yazamaz hâle gelir. */
    const izinli = paket(istemci(room), (d) =>
      M.addObject(d, panelId, createText({ layerId: katmanId, x: 5, y: 5 }, { text: 'b' })),
    );
    expect(checkUpdatePermission(room, 'commenter', izinli).allowed).toBe(true);
  });

  it('REDDEDİLEN güncelleme gölgede kalmaz: aynı paket ikinci kez de reddedilir', () => {
    const { room } = kur();
    const yasak = paket(istemci(room), (d) => d.getMap('meta').set('title', 'kotu'));

    expect(checkUpdatePermission(room, 'commenter', yasak).allowed).toBe(false);
    /* Gölge yeniden kurulmasaydı ikinci gönderim gölgede NO-OP olurdu
       (aynı güncelleme zaten orada), izdüşüm değişmez ve paket SERBEST geçerdi. */
    expect(checkUpdatePermission(room, 'commenter', yasak).allowed).toBe(false);
  });

  it('izinli işaretleme yazımı ret sonrasında da geçer', () => {
    const { room, panelId, katmanId } = kur();
    const yasak = paket(istemci(room), (d) => d.getMap('meta').set('title', 'kotu'));
    expect(checkUpdatePermission(room, 'commenter', yasak).allowed).toBe(false);

    const izinli = paket(istemci(room), (d) =>
      M.addObject(d, panelId, createText({ layerId: katmanId, x: 1, y: 1 }, { text: 'not' })),
    );
    expect(checkUpdatePermission(room, 'commenter', izinli).allowed).toBe(true);
  });

  it('YARIM uygulanıp fırlatan yük gölgeyi kirletmez', () => {
    const { room } = kur();
    const yasak = paket(istemci(room), (d) => d.getMap('meta').set('title', 'kotu'));

    /* Son baytı kırpılmış paket: `applyUpdate` geçerli kısmı UYGULAR, sonra
       fırlatır — ölçüldü (kuyruğa çöp EKLEMEK fırlatmaz, kırpmak fırlatır).
       Yani `catch` yolu gölgeyi yarım değişmiş bırakır. */
    const kirpik = yasak.slice(0, yasak.length - 1);
    const karar = checkUpdatePermission(room, 'commenter', kirpik);
    expect(karar.allowed).toBe(false);
    expect(karar.allowed === false && karar.reason).toMatch(/çözümlenemedi/);

    /* Gölge `catch` içinde yeniden kurulmasaydı, yasak değişiklik orada kalırdı
       ve SAĞLAM paket no-op olarak geçerdi: yorumcu, önce kırpık sonra tam
       paket göndererek korumalı alana yazardı. */
    expect(checkUpdatePermission(room, 'commenter', yasak).allowed).toBe(false);
  });

  it('çözümlenemeyen yükten sonra izinli yazım hâlâ kabul edilir', () => {
    const { room, panelId, katmanId } = kur();
    const bozuk = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(checkUpdatePermission(room, 'commenter', bozuk).allowed).toBe(false);

    const izinli = paket(istemci(room), (d) =>
      M.addObject(d, panelId, createText({ layerId: katmanId, x: 2, y: 2 }, { text: 'not' })),
    );
    expect(checkUpdatePermission(room, 'commenter', izinli).allowed).toBe(true);
  });

  it('izinli yol mesaj başına TEK izdüşüm öder — önbelleksiz maliyetin yarısından az', () => {
    const { room, panelId, katmanId } = kur(5000);
    const TUR = 12;

    // Her tur FARKLI paket — aynısını tekrarlamak Yjs'te no-op olur ve ölçümü
    // yalancı yapardı (ilk denemede bu tuzağa düşüldü, ölçüldü).
    const ayna = istemci(room);
    const paketler = Array.from({ length: TUR + 3 }, (_, i) =>
      paket(ayna, (d) =>
        M.addObject(d, panelId, createText({ layerId: katmanId, x: i, y: 0 }, { text: `n${i}` })),
      ),
    );

    /* SUNUCUNUN AKIŞI: izin verilen paket odaya UYGULANIR (`sync.ts`, ws
       işleyicisi). Bunu atlayan bir ölçüm önbelleğin nerede tutulduğunu
       ayırt edemez — ölçüldü: oda dokümanı üzerinden geçersizleştiren mutant,
       uygulama adımı olmadan hayatta kalıyordu. */
    const denetle = (u: Uint8Array) => {
      const karar = checkUpdatePermission(room, 'commenter', u);
      if (karar.allowed) Y.applyUpdate(room.doc, u);
      return karar;
    };

    let k = 0;
    for (let i = 0; i < 3; i++) expect(denetle(paketler[k++]).allowed).toBe(true);
    const t1 = performance.now();
    for (let i = 0; i < TUR; i++) denetle(paketler[k++]);
    const onbellekli = (performance.now() - t1) / TUR;

    /* ÖN KOŞUL — ham maliyet ÖLÇÜLÜR, varsayılmaz (F1b-1 dersi #1): eşiğin
       altında kalan bir "iyileştirme" iddiası, ham işin zaten ucuz olduğu bir
       makinede kendiliğinden geçerdi. Aşağıdaki döngü Ö-2 öncesi yoldur:
       mesaj başına gölge kopya + İKİ izdüşüm. */
    const t2 = performance.now();
    for (let i = 0; i < TUR; i++) {
      const golge = new Y.Doc();
      Y.applyUpdate(golge, Y.encodeStateAsUpdate(room.doc));
      const once = protectedProjection(golge);
      Y.applyUpdate(golge, paketler[0]);
      const sonra = protectedProjection(golge);
      void (once === sonra);
      golge.destroy();
    }
    const onbelleksiz = (performance.now() - t2) / TUR;

    expect(onbelleksiz).toBeGreaterThan(10);
    expect(onbellekli).toBeLessThan(onbelleksiz / 2);
  }, 120000);
});

describe('Yorumcu denetimi — hızlı yol: yalnızca işaretleme değişince tam izdüşüm HESAPLANMIYOR (§17)', () => {
  it('mevcut işaretleme objesinin alanını değiştirmek İZİNLİ kalır', () => {
    const { room, panelId, katmanId } = kur();
    const yazici = istemci(room);
    const objId = M.addObject(yazici, panelId, createText({ layerId: katmanId, x: 0, y: 0 }, { text: 'n' }))!;
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(yazici, Y.encodeStateVector(room.doc)));

    const surukle = paket(istemci(room), (d) => M.updateObject(d, panelId, objId, { x: 10, y: 10 }));
    expect(checkUpdatePermission(room, 'commenter', surukle).allowed).toBe(true);
  });

  /* Hızlı yol `layerId` değişimini AÇIKÇA dışlıyor — obje kapsam DIŞINA
     taşınmış olabilir ve bunu ucuza kanıtlamanın yolu yok. Bu test hem
     davranışı hem de mutant öldürücü olarak duruyor: `anahtarlar.has('layerId')`
     denetimi kaldırılırsa katman değiştirerek yetki yükseltme sessizce
     SERBEST kalırdı. */
  it('işaretleme objesinin KATMANINI değiştirmek hâlâ tam denetimden geçer ve REDDEDİLİR', () => {
    const { room, panelId, katmanId } = kur();
    const pm = room.doc.getArray('panels').get(0) as Y.Map<unknown>;
    const katmanlar = (pm.get('layers') as Y.Array<unknown>).toJSON() as { kind: string; id: string }[];
    const anaKatmanId = katmanlar.find((l) => l.kind !== 'annotation')!.id;

    const yazici = istemci(room);
    const objId = M.addObject(yazici, panelId, createText({ layerId: katmanId, x: 0, y: 0 }, { text: 'n' }))!;
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(yazici, Y.encodeStateVector(room.doc)));

    const kacir = paket(istemci(room), (d) => M.updateObject(d, panelId, objId, { layerId: anaKatmanId }));
    expect(checkUpdatePermission(room, 'commenter', kacir).allowed).toBe(false);
  });

  /* Hızlı yol, obje MEVCUT KATMANINA bakarak karar veriyor. `main` katmandaki
     (işaretleme OLMAYAN) bir objenin alanını değiştirmek hâlâ tam denetimden
     geçip REDDEDİLMELİ — aksi hâlde `panelAnnotationLayerIds(...).has(layerId)`
     denetimi kaldırılsa da bu test hayatta kalmaz (mutant öldürücü). */
  /* Asıl tehlikeli yön: ANA katmandaki (korumalı) bir objeyi işaretleme
     katmanına TAŞIMAK. Taşıma bitince obje işaretleme katmanında olduğu için
     `panelAnnotationLayerIds(...).has(yeniLayerId)` TEK BAŞINA `true` döner —
     `layerId` anahtarının değiştiğini AYRICA denetlemezsen korumalı bir obje
     "işaretlemeye taşındı" diyerek izdüşümden GİZLENİR ve hızlı yol bunu
     SERBEST bırakır. Yukarıdaki test (ana katmana geri taşıma) bu mutantı
     YAKALAMIYOR çünkü orada varış katmanı zaten ana katman — bu test asıl
     yönü kapatıyor. */
  it('ANA katmandaki objeyi İŞARETLEMEYE TAŞIMAK hâlâ tam denetimden geçer ve REDDEDİLİR', () => {
    const { room, panelId, katmanId } = kur();
    const pm = room.doc.getArray('panels').get(0) as Y.Map<unknown>;
    const katmanlar = (pm.get('layers') as Y.Array<unknown>).toJSON() as { kind: string; id: string }[];
    const anaKatmanId = katmanlar.find((l) => l.kind === 'main')!.id;

    const yazici = istemci(room);
    const objId = M.addObject(yazici, panelId, createText({ layerId: anaKatmanId, x: 0, y: 0 }, { text: 'n' }))!;
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(yazici, Y.encodeStateVector(room.doc)));

    const kacir = paket(istemci(room), (d) => M.updateObject(d, panelId, objId, { layerId: katmanId }));
    expect(checkUpdatePermission(room, 'commenter', kacir).allowed).toBe(false);
  });

  it('ANA katmandaki objeyi değiştirmek hâlâ tam denetimden geçer ve REDDEDİLİR', () => {
    const { room, panelId } = kur();
    const pm = room.doc.getArray('panels').get(0) as Y.Map<unknown>;
    const katmanlar = (pm.get('layers') as Y.Array<unknown>).toJSON() as { kind: string; id: string }[];
    const anaKatmanId = katmanlar.find((l) => l.kind === 'main')!.id;

    const yazici = istemci(room);
    const objId = M.addObject(yazici, panelId, createText({ layerId: anaKatmanId, x: 0, y: 0 }, { text: 'n' }))!;
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(yazici, Y.encodeStateVector(room.doc)));

    const yasak = paket(istemci(room), (d) => M.updateObject(d, panelId, objId, { x: 10 }));
    expect(checkUpdatePermission(room, 'commenter', yasak).allowed).toBe(false);
  });

  it('bir işaretleme objesini SÜRÜKLEMEK mesaj başına tam izdüşüm ödemiyor — ÖLÇÜLDÜ', () => {
    const { room, panelId, katmanId } = kur(5000);
    const TUR = 30;

    const yazici = istemci(room);
    const objId = M.addObject(yazici, panelId, createText({ layerId: katmanId, x: 0, y: 0 }, { text: 'n' }))!;
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(yazici, Y.encodeStateVector(room.doc)));

    // Her tur FARKLI konum — no-op paket ölçümü yalancı yapardı.
    const ayna = istemci(room);
    const paketler = Array.from({ length: TUR + 3 }, (_, i) =>
      paket(ayna, (d) => M.updateObject(d, panelId, objId, { x: i, y: i })),
    );

    const denetle = (u: Uint8Array) => {
      const karar = checkUpdatePermission(room, 'commenter', u);
      if (karar.allowed) Y.applyUpdate(room.doc, u);
      return karar;
    };

    let k = 0;
    for (let i = 0; i < 3; i++) expect(denetle(paketler[k++]).allowed).toBe(true);
    const t1 = performance.now();
    for (let i = 0; i < TUR; i++) denetle(paketler[k++]);
    const hizliYol = (performance.now() - t1) / TUR;

    /* ÖN KOŞUL: aynı sürükleme, hızlı yol OLMADAN (F1b-3 ölçümünün aynı
       şekli) — mesaj başına gölge kopyalanmadan, doğrudan `protectedProjection`
       çift hesabı. Bu, `checkUpdatePermission`'ın hızlı-yoldan ÖNCEki
       davranışını taklit ediyor. */
    const t2 = performance.now();
    for (let i = 0; i < TUR; i++) {
      const once = protectedProjection(room.doc);
      const golge = new Y.Doc();
      Y.applyUpdate(golge, Y.encodeStateAsUpdate(room.doc));
      Y.applyUpdate(golge, paketler[0]);
      const sonra = protectedProjection(golge);
      void (once === sonra);
      golge.destroy();
    }
    const hizliYolsuz = (performance.now() - t2) / TUR;

    console.log(`ÖLÇÜLDÜ (5000 blok, sürükleme): hızlı-yolsuz ${hizliYolsuz.toFixed(2)} ms/mesaj, hızlı-yollu ${hizliYol.toFixed(2)} ms/mesaj`);
    expect(hizliYolsuz).toBeGreaterThan(5);
    expect(hizliYol).toBeLessThan(hizliYolsuz / 4);
  }, 120000);
});
