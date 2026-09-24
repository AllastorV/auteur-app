import { create } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import type { Participant, Role } from '../model/types';

export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'error';

export interface SessionInfo {
  roomId: string;
  roomCode: string;
  serverUrl: string;
  inviteUrl: string;
  projectName: string;
}

export interface CollabState {
  status: ConnectionStatus;
  session: SessionInfo | null;
  /** Bu istemcinin sunucu tarafından onaylanmış rolü */
  role: Role;
  userId: string;
  userName: string;
  clientId: number;
  participants: Participant[];
  /** Sunucunun reddettiği son yazma denemesi */
  lastDenial: { at: number; reason: string } | null;
  error: string | null;

  setStatus: (status: ConnectionStatus, error?: string | null) => void;
  setSession: (session: SessionInfo | null) => void;
  setRole: (role: Role) => void;
  setIdentity: (userId: string, userName: string) => void;
  setParticipants: (participants: Participant[]) => void;
  setCursor: (x: number, y: number, panelId: string) => void;
  denied: (reason: string) => void;
  reset: () => void;

  /** Awareness güncellemesi için collab istemcisi tarafından bağlanır. */
  publishCursor: ((cursor: { x: number; y: number; panelId: string }) => void) | null;

  /**
   * Bağlı oturumun awareness'ı — senaryo editörü imleç katmanını buradan alır.
   *
   * `activeConnection()` modül değişkeni okunarak da erişilebilirdi ama o
   * değer TEPKİSEL değil: React bileşeni odaya katıldığını hiç öğrenemez ve
   * imleçler ancak bir sonraki yeniden çizimde belirirdi. Varlık bilgisi
   * zaten bu mağazada (`participants`, `clientId`) — awareness da yanına.
   */
  awareness: Awareness | null;
}

export const useCollabStore = create<CollabState>((set, get) => ({
  status: 'offline',
  session: null,
  role: 'owner',
  userId: '',
  userName: '',
  clientId: 0,
  participants: [],
  lastDenial: null,
  error: null,
  publishCursor: null,
  awareness: null,

  setStatus: (status, error = null) => set({ status, error }),
  setSession: (session) => set({ session }),
  setRole: (role) => set({ role }),
  setIdentity: (userId, userName) => set({ userId, userName }),
  setParticipants: (participants) => set({ participants }),
  setCursor: (x, y, panelId) => {
    get().publishCursor?.({ x, y, panelId });
  },
  denied: (reason) => set({ lastDenial: { at: Date.now(), reason } }),
  reset: () =>
    set({
      status: 'offline',
      session: null,
      participants: [],
      lastDenial: null,
      error: null,
      publishCursor: null,
      awareness: null,
    }),
}));
