import fs from 'node:fs';

/**
 * TLS malzemesi — HTTPS/WSS.
 *
 * Ortak çalışma trafiği senaryonun TAMAMINI taşır: her tuş vuruşu, her sahne,
 * davet jetonları ve oturum jetonları düz HTTP'de ağdaki herkese açıktır.
 * Kurumsal kurulumda bu kabul edilemez.
 *
 * ## İki geçerli dağıtım biçimi
 *
 * 1. **Sunucu kendi TLS'ini sonlandırır** — `STORYBOARD_TLS_CERT` ve
 *    `STORYBOARD_TLS_KEY` verilir. Fastify HTTPS dinler, WebSocket yükseltmesi
 *    aynı soket üzerinden WSS olur.
 * 2. **Ters vekil sonlandırır** (nginx, Traefik, IIS) — sunucu düz HTTP dinler,
 *    vekil `x-forwarded-proto: https` gönderir. Bu ZATEN destekleniyordu ve
 *    bozulmadı.
 */
export interface TlsMalzemesi {
  cert: Buffer;
  key: Buffer;
}

/**
 * Ortamdan TLS malzemesini okur.
 *
 * - İkisi de yoksa `null` — düz HTTP, çağıran UYARIR.
 * - Yalnız biri verilmişse FIRLATIR. Sessizce HTTP'ye düşmek, TLS istediğini
 *   sanan bir yöneticiyi şifresiz yayına gönderirdi; bu §15.4'ün yasakladığı
 *   sessiz başarısızlığın güvenlik hâlidir.
 * - Dosya okunamıyorsa FIRLATIR. Aynı gerekçe: "sertifikayı verdim ama yanlış
 *   yol yazdım" durumunda sunucu şifresiz açılmamalı.
 */
export function tlsMalzemesi(env: NodeJS.ProcessEnv = process.env): TlsMalzemesi | null {
  const certYol = env.STORYBOARD_TLS_CERT?.trim();
  const keyYol = env.STORYBOARD_TLS_KEY?.trim();
  if (!certYol && !keyYol) return null;
  if (!certYol || !keyYol) {
    throw new Error(
      'TLS yarım yapılandırılmış: STORYBOARD_TLS_CERT ve STORYBOARD_TLS_KEY ' +
        'BİRLİKTE verilmelidir. Sunucu şifresiz açılmayacak.',
    );
  }
  const oku = (yol: string, ad: string): Buffer => {
    try {
      return fs.readFileSync(yol);
    } catch (err) {
      throw new Error(
        `TLS ${ad} okunamadı (${yol}): ${err instanceof Error ? err.message : String(err)}. ` +
          'Sunucu şifresiz açılmayacak.',
      );
    }
  };
  return { cert: oku(certYol, 'sertifikası'), key: oku(keyYol, 'anahtarı') };
}

/** Açılışta TLS yoksa gösterilen uyarı. */
export const TLS_YOK_UYARISI =
  '[sunucu] ⚠ TLS YOK — trafik ŞİFRELENMİYOR. Senaryo metni ve oturum jetonları ' +
  'ağda açık gidiyor. STORYBOARD_TLS_CERT / STORYBOARD_TLS_KEY verin ya da ' +
  'sunucuyu TLS sonlandıran bir ters vekilin arkasına alın (ters vekil ' +
  'arkasındaysanız bu uyarı beklenen durumdur).';
