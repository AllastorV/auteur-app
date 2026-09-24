import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { WebSocket } from 'ws';
import { protectedProjection, sadeceIsaretlemeDegisti } from '@storyboard/core/model/projection';
import { can } from '@storyboard/core/model/permissions';
import type { Role } from '@storyboard/core/model/types';
import { MSG } from '@storyboard/core/collab/protocol';
import { touchRoomActivity, type Connection, type Room } from './rooms';

// Tek kaynak: istemci ile sunucu aynı sabitleri paylaşır.
export { MSG } from '@storyboard/core/collab/protocol';

const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

function send(socket: WebSocket, data: Uint8Array) {
  if (socket.readyState === socket.OPEN) {
    socket.send(data, { binary: true });
  }
}

function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG.SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

function encodeSyncStep2(doc: Y.Doc, stateVector?: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG.SYNC);
  syncProtocol.writeSyncStep2(encoder, doc, stateVector);
  return encoding.toUint8Array(encoder);
}

function encodeUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG.SYNC);
  encoding.writeVarUint(encoder, SYNC_UPDATE);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

function encodeString(type: number, value: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  encoding.writeVarString(encoder, value);
  return encoding.toUint8Array(encoder);
}

export function encodeDenied(reason: string): Uint8Array {
  return encodeString(MSG.DENIED, reason);
}

export function encodeRole(role: Role): Uint8Array {
  return encodeString(MSG.ROLE, role);
}

/**
 * Bir güncellemenin verilen rol tarafından yapılmasına izin var mı?
 *
 * - Sahip / Editör: her şey.
 * - Yorumcu: yalnızca `annotation` türü katmanlardaki objeler. Kontrol,
 *   güncellemeyi bir kopya dokümana uygulayıp "korumalı izdüşüm"ün değişip
 *   değişmediğine bakarak yapılır — istemcinin ne iddia ettiğine değil,
 *   dokümanın gerçekte nasıl değiştiğine bakar.
 * - İzleyici: hiçbir şey.
 */
interface Denetci {
  /** Oda dokümanının canlı kopyası — aday güncelleme önce buna uygulanır. */
  golge: Y.Doc;
  /** `golge`'nin korumalı izdüşümü. `null` ise bayat, yeniden hesaplanacak. */
  izdusum: string | null;
}

/**
 * Oda başına denetim durumu (§17, Ö-2).
 *
 * `WeakMap` çünkü bu durum ODANIN sözleşmesine ait değil, DENETİM
 * mekanizmasına ait: `Room` arayüzüne alan eklemek, gölge dokümanı odayı
 * kullanan her koda görünür kılardı. Anahtar odanın kendisi olduğu için
 * oda düştüğünde giriş de düşer.
 *
 * TEMBEL kurulur: yorumcusu olmayan odalar hiçbir bedel ödemez — ilk yorumcu
 * mesajına kadar ne gölge doküman ne dinleyici vardır.
 */
const denetciler = new WeakMap<Room, Denetci>();

/** Gölgeyi odadan yeniden kurar ve kendi geçersizleştiricisini bağlar. */
function golgeKur(room: Room, d: Denetci): void {
  const eski = d.golge as Y.Doc | undefined;
  const golge = new Y.Doc();
  Y.applyUpdate(golge, Y.encodeStateAsUpdate(room.doc));
  /* Geçersizleştirme ODA dokümanını değil GÖLGEYİ dinler. Yjs zaten
     uygulanmış bir güncellemeyi yeniden uygulayınca olay ÜRETMEZ; oda
     dinlenseydi, yorumcunun az önce kabul edilip gölgeye uygulanan yazımı
     oda dokümanına düştüğünde önbelleği boşuna düşürürdü ve kabul yolu yine
     mesaj başına İKİ izdüşüm öderdi. */
  golge.on('update', () => { d.izdusum = null; });
  d.golge = golge;
  d.izdusum = null;
  eski?.destroy();
}

function denetci(room: Room): Denetci {
  const mevcut = denetciler.get(room);
  if (mevcut) return mevcut;
  const d = { golge: undefined as unknown as Y.Doc, izdusum: null } as Denetci;
  golgeKur(room, d);
  /* Odaya BAŞKA yazarlardan (sahip/editör) gelen değişiklikler gölgeye
     yansımazsa önbellek bayatlar: yorumcunun izinli yazımı, artık var olmayan
     bir duruma göre karşılaştırılıp REDDEDİLİR. */
  room.doc.on('update', (u: Uint8Array) => { Y.applyUpdate(d.golge, u); });
  room.doc.on('destroy', () => {
    d.golge.destroy();
    denetciler.delete(room);
  });
  denetciler.set(room, d);
  return d;
}

export function checkUpdatePermission(
  room: Room,
  role: Role,
  update: Uint8Array,
): { allowed: true } | { allowed: false; reason: string } {
  if (can(role, 'edit')) return { allowed: true };
  if (!can(role, 'annotate')) {
    return { allowed: false, reason: 'İzleyici rolü değişiklik yapamaz.' };
  }

  const d = denetci(room);
  try {
    const before = d.izdusum ?? (d.izdusum = protectedProjection(d.golge));

    /* Uygulanan transaction'ı yakala — yalnız BU çağrının ürettiği transaction,
       `golgeKur`'daki geçersizleştirme dinleyicisi de aynı 'update' olayını
       dinliyor ama transaction'ı SAKLAMIYOR. */
    let islenenTx: Y.Transaction | null = null;
    const yakala = (_u: Uint8Array, _o: unknown, _doc: Y.Doc, t: Y.Transaction) => { islenenTx = t; };
    d.golge.on('update', yakala);
    try {
      Y.applyUpdate(d.golge, update);
    } finally {
      d.golge.off('update', yakala);
    }

    /* HIZLI YOL (§17): transaction'ın değiştirdiği HER ŞEY kanıtlanabilir
       şekilde işaretleme kapsamındaysa korumalı içerik DEĞİŞEMEMİŞTİR —
       ikinci bir tam `protectedProjection` hesabına (O(belge)) gerek yok.
       `before` hâlâ geçerli değer; `golgeKur`'un dinleyicisi onu az önce
       `null`'a düşürdü, burada AÇIKÇA geri kuruluyor. */
    if (islenenTx && sadeceIsaretlemeDegisti(d.golge, islenenTx)) {
      d.izdusum = before;
      return { allowed: true };
    }

    const after = protectedProjection(d.golge);
    if (before !== after) {
      /* Reddedilen güncelleme gölgede KALDI — gölge artık odayı temsil
         etmiyor. Kurulmazsa bir sonraki denetim kirli tabana göre karşılaştırma
         yapar ve İZİNLİ bir yazımı reddeder. Yeniden kurmak pahalı ama ret
         olağan yol değildir. */
      golgeKur(room, d);
      return {
        allowed: false,
        reason: 'Yorumcu rolü yalnızca işaretleme katmanına yazabilir.',
      };
    }
    d.izdusum = after;
    return { allowed: true };
  } catch (err) {
    // Yarım uygulanmış olabilir; kirli gölgeyle devam edilmez.
    golgeKur(room, d);
    /* KARAR 11 — güven sınırında derinlemesine savunma.
       Bu blok istemciden gelen HAM baytları çözümlüyor: `applyUpdate` de
       `protectedProjection` de hazırlanmış bir güncellemede fırlatabilir.
       Yakalanmazsa istisna ws 'message' geri çağrısından çıkar ve SÜRECİ
       düşürür — yetkisiz bir istemci böylece bütün odaları indirebilirdi.
       Çözümlenemeyen güncelleme güvenilemez: reddet, süreci ayakta tut. */
    return {
      allowed: false,
      reason: `Güncelleme çözümlenemedi: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Odadaki diğer istemcilere yayınlar. */
function broadcast(room: Room, data: Uint8Array, except?: Connection) {
  for (const conn of room.connections) {
    if (conn === except) continue;
    send(conn.socket, data);
  }
}

export interface HandlerHooks {
  onDenied?: (conn: Connection, reason: string) => void;
  onApplied?: (conn: Connection, byteLength: number) => void;
}

/**
 * Bir bağlantının arka arkaya kaç reddi görülür.
 *
 * Her ret gölgenin YENİDEN KURULMASINI gerektiriyor
 * (`encodeStateAsUpdate` + `applyUpdate`, doküman boyutunda O(n)) ve bu iş
 * Node'un tek iş parçacığında dönüyor. Sınırsız bırakılsaydı yorumcu
 * yetkisiyle bağlanan biri döngüde çöp güncelleme göndererek yalnız kendi
 * odasını değil SUNUCUDAKİ BÜTÜN ODALARI durdurabilirdi. Sınır bağlantı
 * başına: dürüst bir istemcinin arka arkaya bu kadar reddi olmaz — reddi alan
 * istemci `SYNC_STEP2` ile zaten düzeltiliyor.
 */
export const ARDA_ARDA_RET_SINIRI = 20;

export function setupConnection(room: Room, conn: Connection, hooks: HandlerHooks = {}) {
  room.connections.add(conn);
  touchRoomActivity(room);

  /* Ret sayacı BAĞLANTIYA ait, odaya değil: bir kötü istemci yüzünden aynı
     odadaki dürüst istemciler cezalandırılmaz. */
  let ardArdaRet = 0;
  const reddet = (reason: string) => {
    send(conn.socket, encodeDenied(reason));
    // İstemcinin sapmış durumunu düzeltmesi için yetkili durumu gönder.
    send(conn.socket, encodeSyncStep2(room.doc));
    hooks.onDenied?.(conn, reason);
    if (++ardArdaRet >= ARDA_ARDA_RET_SINIRI) {
      conn.socket.close(1008, 'Arka arkaya çok fazla reddedilen güncelleme.');
    }
  };

  // İlk el sıkışma: rol bildirimi + senkron adımları.
  send(conn.socket, encodeRole(conn.role));
  send(conn.socket, encodeSyncStep1(room.doc));

  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG.AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...awarenessStates.keys()]),
    );
    send(conn.socket, encoding.toUint8Array(encoder));
  }

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Kaynağı olan bağlantıya geri göndermeye gerek yok.
    broadcast(room, encodeUpdate(update), origin instanceof Object ? (origin as Connection) : undefined);
  };
  room.doc.on('update', onDocUpdate);

  const onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changed = [...added, ...updated, ...removed];
    if (!changed.length) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG.AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed),
    );
    broadcast(room, encoding.toUint8Array(encoder), origin instanceof Object ? (origin as Connection) : undefined);
  };
  room.awareness.on('update', onAwarenessUpdate);

  conn.socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const bytes =
      raw instanceof Buffer
        ? new Uint8Array(raw)
        : Array.isArray(raw)
          ? new Uint8Array(Buffer.concat(raw))
          : new Uint8Array(raw as ArrayBuffer);

    let decoder: decoding.Decoder;
    try {
      decoder = decoding.createDecoder(bytes);
    } catch {
      return;
    }

    let messageType: number;
    try {
      messageType = decoding.readVarUint(decoder);
    } catch {
      return;
    }

    if (messageType === MSG.SYNC) {
      let syncType: number;
      try {
        syncType = decoding.readVarUint(decoder);
      } catch {
        return;
      }

      if (syncType === SYNC_STEP1) {
        try {
          const stateVector = decoding.readVarUint8Array(decoder);
          send(conn.socket, encodeSyncStep2(room.doc, stateVector));
        } catch {
          conn.socket.close(1007, 'Geçersiz eşitleme başlangıcı.');
        }
        return;
      }

      if (syncType === SYNC_STEP2 || syncType === SYNC_UPDATE) {
        let update: Uint8Array;
        try {
          update = decoding.readVarUint8Array(decoder);
        } catch {
          return;
        }
        if (update.length === 0) return;

        /* KARAR 11, ikinci katman: izin denetimi TEMİZ dönse bile asıl
           `applyUpdate` (ve onu izleyen gözlemciler) fırlatabilir. Tek bir
           istemcinin bozuk paketi hiçbir koşulda süreci düşürmemeli. */
        try {
          const verdict = checkUpdatePermission(room, conn.role, update);
          if (!verdict.allowed) {
            reddet(verdict.reason);
            return;
          }

          Y.applyUpdate(room.doc, update, conn);
          // Kabul edilen yazım sayacı sıfırlar: sınır ARKA ARKAYA reddi ölçer.
          ardArdaRet = 0;
          // Kaynak bağlantı dışındaki herkese `doc.on('update')` üzerinden yayılır.
          hooks.onApplied?.(conn, update.length);
        } catch (err) {
          reddet(`Güncelleme uygulanamadı: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
      return;
    }

    if (messageType === MSG.AWARENESS) {
      // İmleç ve kimlik bilgisi her rol için serbesttir (salt okunur izleyici dahil).
      try {
        const payload = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(room.awareness, payload, conn);
      } catch {
        /* bozuk paket — yoksay */
      }
    }
  });

  let cleanedUp = false;
  const cleanup = () => {
    // 'close' ve 'error' birlikte tetiklenebilir; iki kez çalışmamalı.
    if (cleanedUp) return;
    cleanedUp = true;
    room.connections.delete(conn);
    touchRoomActivity(room);
    room.doc.off('update', onDocUpdate);
    room.awareness.off('update', onAwarenessUpdate);
    const user = room.users.get(conn.userId);
    if (user && ![...room.connections].some((c) => c.userId === conn.userId)) {
      user.online = false;
    }
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [...room.awareness.getStates().keys()].filter((clientId) => {
        const state = room.awareness.getStates().get(clientId) as any;
        return state?.user?.id === conn.userId && !hasOtherConnection(room, conn);
      }),
      'disconnect',
    );
  };

  conn.socket.on('close', cleanup);
  conn.socket.on('error', cleanup);

  return cleanup;
}

function hasOtherConnection(room: Room, conn: Connection): boolean {
  for (const other of room.connections) {
    if (other !== conn && other.userId === conn.userId) return true;
  }
  return false;
}

/** Bir kullanıcının rolünü çalışırken değiştirir ve açık bağlantılara bildirir. */
export function applyRoleChange(room: Room, userId: string, role: Role): boolean {
  const user = room.users.get(userId);
  if (!user) return false;
  user.role = role;
  for (const conn of room.connections) {
    if (conn.userId === userId) {
      conn.role = role;
      send(conn.socket, encodeRole(role));
    }
  }
  return true;
}
