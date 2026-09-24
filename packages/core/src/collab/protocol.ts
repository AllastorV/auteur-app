/**
 * İstemci ↔ sunucu WebSocket protokolü.
 *
 * 0 ve 1 y-websocket ile birebir aynıdır. Özel tipler 5'ten başlar: y-websocket
 * 2 (auth) ve 3'ü (queryAwareness) kendi protokolü için kullanır ve 3'ü
 * BroadcastChannel üzerinden de yayınlar — o aralığı kullanmak sekmeler arası
 * senkronu bozar.
 */
export const MSG = {
  /** y-protocols/sync */
  SYNC: 0,
  /** y-protocols/awareness */
  AWARENESS: 1,
  /** Sunucu → istemci: yazma reddedildi (varString: gerekçe) */
  DENIED: 5,
  /** Sunucu → istemci: rol bildirimi (varString: rol) */
  ROLE: 6,
} as const;

export interface JoinResponse {
  sessionToken: string;
  role: string;
  roomId: string;
  roomCode: string;
  projectName: string;
  userId: string;
  userName: string;
  wsUrl: string;
}

export interface CreateSessionResponse {
  roomId: string;
  roomCode: string;
  ownerToken: string;
  /** Sahibin oda içindeki kullanıcı kimliği (hesap varsa hesap kimliği). */
  ownerUserId: string;
  inviteUrl: string;
  wsUrl: string;
}

export interface InviteResponse {
  tokenId: string;
  token: string;
  inviteUrl: string;
  role: string;
  expiresAt: number;
  /** Bağlantının kaç kez kullanılabileceği. Varsayılan 1 (tek kullanımlık). */
  kullanimSiniri?: number;
  /** Davet bir hesaba bağlıysa o hesabın e-postası. */
  eposta?: string | null;
}
