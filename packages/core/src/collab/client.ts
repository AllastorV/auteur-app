import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as decoding from 'lib0/decoding';
import { MSG } from './protocol';
import { useCollabStore } from '../store/collab';
import { useProjectStore } from '../store/project';
import type { Participant, Role, Vec2 } from '../model/types';
import { colorForUser } from '../util/color';
import { sessionApi } from './api';
import { t } from '../dil/arayuz';

export interface ConnectOptions {
  serverUrl: string;
  roomId: string;
  sessionToken: string;
  userId: string;
  userName: string;
  doc: Y.Doc;
  /**
   * HTTP taban adresi — jeton tazeleme için. `serverUrl` WS adresi olduğu
   * için ayrı geçiliyor. Verilmezse tazeleme kapalı kalır (testler ve
   * masaüstü yerel kabuğu için).
   */
  apiUrl?: string;
  /** Yeni jeton üretildiğinde — istemci saklamak isteyebilir. */
  onJeton?: (jeton: string) => void;
}

export interface CollabConnection {
  provider: WebsocketProvider;
  disconnect(): void;
}

/**
 * TUVAL İMLECİNİN awareness alanı — `cursor` DEĞİL.
 *
 * `cursor` alanını `y-prosemirror`'ın `yCursorPlugin`'i sahipleniyor ve orada
 * göreli konum (`{anchor, head}`) bekliyor; alan adı pakette sabit
 * (`cursorStateField` yalnız yazma yolunu değiştiriyor, okuma yolu hâlâ
 * `aw.cursor` diyor). Pano imleci `{x, y}` yazdığı için ikisi aynı alanda
 * duramaz: eklenti `{x, y}`'yi göreli konum sanıp çözmeye çalışırdı.
 * Adı taşınabilen taraf bizimki.
 */
const TUVAL_IMLECI = 'tuvalImleci';

/**
 * JETON TAZELEME ARALIĞI.
 *
 * Oturum jetonunun ömrü sunucuda `oturumDakika` (varsayılan 12 saat) ve
 * jeton YALNIZ WebSocket yükseltmesinde denetleniyor: bağlantı açık kaldıkça
 * süre dolsa da sorun çıkmıyor. Isırdığı yer YENİDEN BAĞLANMA — ağ kesilip
 * geri geldiğinde ölü jetonla 401 alınıyor ve ortak çalışma sessizce
 * duruyor. Saatte bir tazelemek bu pencereyi kapatıyor ve maliyeti bir
 * istek.
 *
 * ponytail: sabit aralık; sunucunun döndürdüğü `expiresAt`e göre uyarlamak
 * daha zarif ama TTL 12 saatken kazancı yok. TTL kısalırsa oraya geçilir.
 */
const TAZELEME_MS = 60 * 60 * 1000;

let active: CollabConnection | null = null;

export function activeConnection(): CollabConnection | null {
  return active;
}

export function connectSession(opts: ConnectOptions): CollabConnection {
  disconnectSession();

  const collab = useCollabStore.getState();
  collab.setStatus('connecting');

  const provider = new WebsocketProvider(opts.serverUrl, opts.roomId, opts.doc, {
    params: { token: opts.sessionToken },
    connect: true,
  });

  const color = colorForUser(opts.userId);

  provider.awareness.setLocalStateField('user', {
    id: opts.userId,
    name: opts.userName,
    color,
  });

  // Sunucudan gelen özel mesaj türleri.
  const handlers = provider.messageHandlers as unknown as Array<
    (encoder: unknown, decoder: decoding.Decoder, p: WebsocketProvider, emit: boolean, type: number) => void
  >;
  handlers[MSG.DENIED] = (_encoder, decoder) => {
    let reason: string;
    try {
      reason = decoding.readVarString(decoder);
    } catch {
      return; // bozuk paket — yoksay
    }
    useCollabStore.getState().denied(reason);
    // Sunucu değişikliği reddetti: yerel doküman sunucudan sapmış durumda.
    // Yerel düzenlemeler LOCAL_ORIGIN ile izlendiği için son adımı geri almak
    // istemciyi yetkili duruma döndürür.
    const store = useProjectStore.getState();
    if (store.canUndo) store.undo();
  };
  handlers[MSG.ROLE] = (_encoder, decoder) => {
    let role: Role;
    try {
      role = decoding.readVarString(decoder) as Role;
    } catch {
      return;
    }
    useCollabStore.getState().setRole(role);
    useProjectStore.getState().setRole(role);
    const state = provider.awareness.getLocalState()?.user;
    provider.awareness.setLocalStateField('user', { ...(state ?? {}), role });
  };

  provider.on('status', ({ status }: { status: string }) => {
    useCollabStore
      .getState()
      .setStatus(status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'offline');
  });

  provider.on('connection-error', () => {
    useCollabStore.getState().setStatus('error', t('Sunucuya bağlanılamadı.'));
  });

  const syncParticipants = () => {
    const states = provider.awareness.getStates();
    const list: Participant[] = [];
    states.forEach((state, clientId) => {
      const user = (state as any)?.user;
      if (!user) return;
      list.push({
        clientId,
        userId: user.id ?? String(clientId),
        name: user.name ?? 'Konuk',
        color: user.color ?? colorForUser(user.id ?? String(clientId)),
        role: (user.role ?? 'viewer') as Role,
        activePanelId: (state as any)?.activePanelId ?? null,
        cursor: ((state as any)?.[TUVAL_IMLECI] as Vec2 | null) ?? null,
        lastSeen: Date.now(),
      });
    });
    useCollabStore.getState().setParticipants(list);
  };

  provider.awareness.on('change', syncParticipants);
  syncParticipants();

  useCollabStore.setState({
    clientId: provider.awareness.clientID,
    /* Awareness mağazaya konuyor: senaryo editörünün imleç katmanı buradan
       besleniyor ve odaya katılmak onu tepkisel olarak açıyor. */
    awareness: provider.awareness,
    publishCursor: throttle((cursor: { x: number; y: number; panelId: string }) => {
      provider.awareness.setLocalStateField(TUVAL_IMLECI, { x: cursor.x, y: cursor.y });
      provider.awareness.setLocalStateField('activePanelId', cursor.panelId);
    }, 60),
  });

  /* Jeton tazeleme. Hata YUTULUYOR ve bu bilinçli: tek bir başarısız
     tazeleme geçici bir ağ arızasıdır ve bir sonraki tur düzeltir. Jeton
     GERÇEKTEN reddedildiğinde kullanıcı zaten `MSG.DENIED` yolundan haber
     alıyor — ikinci bir uyarı aynı olayı iki kez bildirirdi. */
  let jeton = opts.sessionToken;
  const tazeleyici = opts.apiUrl
    ? setInterval(() => {
        void sessionApi
          .refresh(opts.apiUrl!, opts.roomId, jeton)
          .then((y) => {
            jeton = y.sessionToken;
            /* Provider `params`ı HER BAĞLANMADA yeniden okuyor; yerinde
               güncellemek yeniden bağlanmanın taze jetonu kullanmasını
               sağlıyor — tazelemenin bütün amacı bu. */
            (provider as unknown as { params: Record<string, string> }).params.token = jeton;
            opts.onJeton?.(jeton);
          })
          .catch(() => {});
      }, TAZELEME_MS)
    : null;

  active = {
    provider,
    disconnect() {
      if (tazeleyici !== null) clearInterval(tazeleyici);
      provider.awareness.off('change', syncParticipants);
      provider.awareness.setLocalState(null);
      provider.destroy();
      useCollabStore.getState().reset();
    },
  };
  return active;
}

export function disconnectSession() {
  active?.disconnect();
  active = null;
}

function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let last = 0;
  let pending: any[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function throttled(...args: any[]) {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else {
      pending = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          if (pending) fn(...pending);
          pending = null;
        }, ms - (now - last));
      }
    }
  } as T;
}
