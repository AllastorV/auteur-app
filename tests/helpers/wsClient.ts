import * as Y from 'yjs';
import WebSocket from 'ws';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';

import { MSG } from '@storyboard/core/collab/protocol';
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

export interface TestClient {
  doc: Y.Doc;
  socket: WebSocket;
  role: string | null;
  denials: string[];
  /** Yerel durumun tamamını sunucuya gönderir. */
  push(): void;
  waitForSync(): Promise<void>;
  waitFor(predicate: () => boolean, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

export function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('Zaman aşımı'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

/**
 * Testler için minimal y-websocket istemcisi.
 *
 * `secenekler` `ws`'in bağlantı seçeneklerine geçer; WSS testinde kendinden
 * imzalı sertifikayı `ca` ile tanıtmak için gerekiyor. Genel
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` yerine bu: doğrulamayı KAPATMAK, "WSS
 * gerçekten kuruldu mu" sorusunu yanıtsız bırakırdı.
 */
export async function connectTestClient(
  wsUrl: string,
  roomId: string,
  token: string,
  secenekler?: WebSocket.ClientOptions,
): Promise<TestClient> {
  const doc = new Y.Doc();
  const socket = new WebSocket(
    `${wsUrl}/${roomId}?token=${encodeURIComponent(token)}`,
    secenekler,
  );
  socket.binaryType = 'arraybuffer';

  const client: TestClient = {
    doc,
    socket,
    role: null,
    denials: [],
    push() {
      const update = Y.encodeStateAsUpdate(doc);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG.SYNC);
      encoding.writeVarUint(encoder, SYNC_UPDATE);
      encoding.writeVarUint8Array(encoder, update);
      socket.send(encoding.toUint8Array(encoder));
    },
    async waitForSync() {
      await waitFor(() => client.role !== null, 5000);
      await new Promise((r) => setTimeout(r, 150));
    },
    waitFor(predicate, timeoutMs = 4000) {
      return waitFor(predicate, timeoutMs);
    },
    async close() {
      socket.close();
      await new Promise((r) => setTimeout(r, 60));
    },
  };

  socket.on('message', (raw: ArrayBuffer | Buffer) => {
    const bytes = raw instanceof Buffer ? new Uint8Array(raw) : new Uint8Array(raw);
    const decoder = decoding.createDecoder(bytes);
    const type = decoding.readVarUint(decoder);

    if (type === MSG.ROLE) {
      client.role = decoding.readVarString(decoder);
      return;
    }
    if (type === MSG.DENIED) {
      client.denials.push(decoding.readVarString(decoder));
      return;
    }
    if (type === MSG.SYNC) {
      const syncType = decoding.readVarUint(decoder);
      if (syncType === SYNC_STEP1) {
        const sv = decoding.readVarUint8Array(decoder);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG.SYNC);
        syncProtocol.writeSyncStep2(encoder, doc, sv);
        socket.send(encoding.toUint8Array(encoder));

        const enc2 = encoding.createEncoder();
        encoding.writeVarUint(enc2, MSG.SYNC);
        syncProtocol.writeSyncStep1(enc2, doc);
        socket.send(encoding.toUint8Array(enc2));
        return;
      }
      if (syncType === SYNC_STEP2 || syncType === SYNC_UPDATE) {
        const update = decoding.readVarUint8Array(decoder);
        if (update.length) Y.applyUpdate(doc, update, 'server');
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
    socket.once('unexpected-response', (_req, res) =>
      reject(new Error(`HTTP ${res.statusCode}`)),
    );
  });

  await client.waitForSync();
  return client;
}

export function connectExpectingRejection(
  wsUrl: string,
  roomId: string,
  token: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${wsUrl}/${roomId}?token=${encodeURIComponent(token)}`);
    socket.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    socket.once('error', () => resolve(0));
    socket.once('open', () => {
      socket.close();
      reject(new Error('Bağlantı beklenmedik şekilde kabul edildi'));
    });
  });
}
