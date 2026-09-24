import type { CreateSessionResponse, InviteResponse, JoinResponse } from './protocol';
import type { Role } from '../model/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Gövdesi olmayan isteklerde `content-type: application/json` gönderilmez;
  // Fastify boş gövdeyi bu başlıkla birlikte reddeder.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.body != null) headers['content-type'] = 'application/json';
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) throw new Error(body?.error ?? `Sunucu hatası (${res.status})`);
  return body as T;
}

/**
 * Hesap jetonu VARSA `Authorization` başlığı, yoksa hiç başlık.
 *
 * Boş bir `Bearer` göndermek hesapsız kullanımı kırardı: sunucu jetonu
 * çözemez, hesabı `null` sanmak yerine "geçersiz jeton" der.
 */
function hesapBasligi(hesapToken?: string): Record<string, string> {
  return hesapToken ? { authorization: `Bearer ${hesapToken}` } : {};
}

export const sessionApi = {
  create(
    serverUrl: string,
    payload: { projectName: string; ownerName: string },
    hesapToken?: string,
  ) {
    return request<CreateSessionResponse>(`${serverUrl}/api/sessions`, {
      method: 'POST',
      headers: hesapBasligi(hesapToken),
      body: JSON.stringify(payload),
    });
  },

  invite(
    serverUrl: string,
    roomId: string,
    ownerToken: string,
    payload: { role: Role; expiresInMinutes?: number; label?: string; kullanimSiniri?: number; eposta?: string },
  ) {
    return request<InviteResponse>(`${serverUrl}/api/sessions/${roomId}/invites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
  },

  listInvites(serverUrl: string, roomId: string, ownerToken: string) {
    return request<{ invites: (InviteResponse & { revoked: boolean; usedBy: string | null })[] }>(
      `${serverUrl}/api/sessions/${roomId}/invites`,
      { headers: { authorization: `Bearer ${ownerToken}` } },
    );
  },

  revokeInvite(serverUrl: string, roomId: string, ownerToken: string, tokenId: string) {
    return request<{ ok: true }>(`${serverUrl}/api/sessions/${roomId}/invites/${tokenId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
  },

  join(
    serverUrl: string,
    roomId: string,
    payload: { token: string; name: string },
    hesapToken?: string,
  ) {
    return request<JoinResponse>(`${serverUrl}/api/sessions/${roomId}/join`, {
      method: 'POST',
      headers: hesapBasligi(hesapToken),
      body: JSON.stringify(payload),
    });
  },

  joinByCode(
    serverUrl: string,
    payload: { code: string; token?: string; name: string },
    hesapToken?: string,
  ) {
    return request<JoinResponse>(`${serverUrl}/api/sessions/join-by-code`, {
      method: 'POST',
      headers: hesapBasligi(hesapToken),
      body: JSON.stringify(payload),
    });
  },

  participants(serverUrl: string, roomId: string, token: string) {
    return request<{ participants: { userId: string; name: string; role: Role; online: boolean }[] }>(
      `${serverUrl}/api/sessions/${roomId}/participants`,
      { headers: { authorization: `Bearer ${token}` } },
    );
  },

  setRole(
    serverUrl: string,
    roomId: string,
    ownerToken: string,
    payload: { userId: string; role: Role },
  ) {
    return request<{ ok: true }>(`${serverUrl}/api/sessions/${roomId}/roles`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
  },

  close(serverUrl: string, roomId: string, ownerToken: string) {
    return request<{ ok: true }>(`${serverUrl}/api/sessions/${roomId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
  },

  /** Oda oturum jetonunu tazeler — kısa ömürlü jeton ancak böyle kullanılabilir. */
  refresh(serverUrl: string, roomId: string, sessionToken: string) {
    return request<{ sessionToken: string; role: Role; expiresAt: number }>(
      `${serverUrl}/api/sessions/${roomId}/refresh`,
      { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } },
    );
  },
};

export interface HesapJetonlari {
  hesapId: string;
  eposta: string;
  ad: string;
  erisimToken: string;
  erisimBitis: number;
  yenilemeToken: string;
}

/**
 * Kullanıcı hesabı uçları.
 *
 * Parola YALNIZ bu üç çağrıda geçiyor ve hiçbir yerde saklanmıyor — çağıran
 * yalnız jetonları tutar. Erişim jetonu kısa ömürlü (15 dk); `yenile` ile
 * tazelenir ve yenileme jetonu her tazelemede DEĞİŞİR.
 */
export const hesapApi = {
  kayit(serverUrl: string, payload: { eposta: string; parola: string; ad?: string }) {
    return request<HesapJetonlari>(`${serverUrl}/api/hesap/kayit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  giris(serverUrl: string, payload: { eposta: string; parola: string }) {
    return request<HesapJetonlari>(`${serverUrl}/api/hesap/giris`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  yenile(serverUrl: string, yenilemeToken: string) {
    return request<HesapJetonlari>(`${serverUrl}/api/hesap/yenile`, {
      method: 'POST',
      body: JSON.stringify({ yenilemeToken }),
    });
  },

  ben(serverUrl: string, erisimToken: string) {
    return request<{ hesapId: string; eposta: string; ad: string }>(`${serverUrl}/api/hesap/ben`, {
      headers: { authorization: `Bearer ${erisimToken}` },
    });
  },
};
