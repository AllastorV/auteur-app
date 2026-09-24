import crypto from 'node:crypto';
import type { Role } from '@storyboard/core';

/**
 * HMAC ile imzalanmış, süreli ve iptal edilebilir davet/oturum token'ları.
 *
 * Token'ın kendisi durum taşımaz; iptal edilebilirlik için `jti` sunucudaki
 * iptal listesiyle karşılaştırılır.
 */

export interface TokenPayload {
  /** token kimliği — iptal listesi anahtarı */
  jti: string;
  /** ODA jetonlarında zorunlu; hesap jetonları odaya bağlı DEĞİLDİR. */
  roomId?: string;
  role?: Role;
  /** oturum token'larında kullanıcı kimliği, hesap jetonlarında hesap kimliği */
  sub?: string;
  name?: string;
  /** epoch ms */
  exp: number;
  /**
   * - `invite`  : odaya davet
   * - `session` : odadaki oturum
   * - `hesap`   : hesabın KISA ÖMÜRLÜ erişim jetonu
   * - `yenileme`: erişim jetonunu tazeleyen uzun ömürlü jeton (döndürülür)
   */
  kind: 'invite' | 'session' | 'hesap' | 'yenileme';
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function sign(payload: TokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify(token: string, secret: string): TokenPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  // Zamanlama saldırılarına karşı sabit süreli karşılaştırma.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

export function roomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  const s = Array.from(bytes, (v) => A[v % A.length]).join('');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}
