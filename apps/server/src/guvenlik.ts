import type { IncomingMessage } from 'node:http';

/**
 * Sunucunun güvenlik ilkeleri — hız sınırı, bağlantı sınırı, başlıklar.
 *
 * Hepsi TEK EVDE (Karar 2): aynı sayaç mantığı üç uçta ayrı ayrı yazılsaydı
 * biri düzeltilip öteki unutulurdu ve unutulan uç sessizce sınırsız kalırdı.
 * Saf ve zamanı dışarıdan alıyorlar; testte gerçek saat beklemeye gerek yok.
 */

/* ------------------------------ hız sınırı ----------------------------- */

export interface HizKarari {
  /** İsteğe izin var mı? */
  ok: boolean;
  /** Reddedildiyse tekrar denemeden önce beklenecek süre (saniye). */
  yenidenDeneSn: number;
}

export interface HizSinirlayici {
  bak(anahtar: string, simdi?: number): HizKarari;
  /** Süresi geçmiş kayıtları atar — sınırsız anahtar birikmesin. */
  temizle(simdi?: number): void;
}

/**
 * Kayan pencere sayacı.
 *
 * ## Neden kayan pencere, sabit kova değil
 *
 * Sabit kovada saldırgan pencerenin son anıyla yeni pencerenin ilk anını
 * birleştirip sınırın İKİ KATINI tek saniyede harcayabilir. Kayan pencere
 * damgaları tuttuğu için bu delik yok. Bedeli anahtar başına en çok `limit`
 * kadar sayı — parola denemesi için 5, önemsiz.
 *
 * ⚠ TAVAN: sayaç BELLEKTE ve süreç başına. Birden çok sunucu örneği arkasında
 * her örnek kendi sınırını uygular; dağıtık sınır ortak bir depo ister
 * (Redis vb.) — bugünkü dağıtım tek süreç.
 */
export function hizSinirlayici(limit: number, pencereMs: number): HizSinirlayici {
  const kayitlar = new Map<string, number[]>();

  return {
    bak(anahtar, simdi = Date.now()) {
      const esik = simdi - pencereMs;
      const damgalar = (kayitlar.get(anahtar) ?? []).filter((t) => t > esik);
      if (damgalar.length >= limit) {
        kayitlar.set(anahtar, damgalar);
        // En eski damga pencereden düşünce yeniden hak doğar.
        const bosalma = damgalar[0] + pencereMs - simdi;
        return { ok: false, yenidenDeneSn: Math.max(1, Math.ceil(bosalma / 1000)) };
      }
      damgalar.push(simdi);
      kayitlar.set(anahtar, damgalar);
      return { ok: true, yenidenDeneSn: 0 };
    },

    temizle(simdi = Date.now()) {
      const esik = simdi - pencereMs;
      for (const [anahtar, damgalar] of kayitlar) {
        const kalan = damgalar.filter((t) => t > esik);
        if (kalan.length === 0) kayitlar.delete(anahtar);
        else kayitlar.set(anahtar, kalan);
      }
    },
  };
}

/* --------------------------- bağlantı sınırı --------------------------- */

export interface BagSinirlayici {
  /** Yer varsa açar ve `true` döner. */
  ac(anahtar: string): boolean;
  kapat(anahtar: string): void;
  sayi(anahtar: string): number;
}

/**
 * İstemci başına açık WebSocket sayısı.
 *
 * NEDEN: her soket bir `Connection` kaydı, bir doküman dinleyicisi ve bir
 * awareness dinleyicisi demek. Sınırsız bırakılırsa tek bir istemci döngüde
 * bağlanarak sunucunun belleğini ve yayın maliyetini şişirir — odaya hiç
 * yazmadan, yalnız bağlanarak. Yetki denetimi bu saldırıyı GÖRMEZ, çünkü
 * saldırganın geçerli bir daveti olabilir.
 */
export function bagSinirlayici(enCok: number): BagSinirlayici {
  const sayaclar = new Map<string, number>();
  return {
    ac(anahtar) {
      const n = sayaclar.get(anahtar) ?? 0;
      if (n >= enCok) return false;
      sayaclar.set(anahtar, n + 1);
      return true;
    },
    kapat(anahtar) {
      const n = (sayaclar.get(anahtar) ?? 0) - 1;
      if (n <= 0) sayaclar.delete(anahtar);
      else sayaclar.set(anahtar, n);
    },
    sayi: (anahtar) => sayaclar.get(anahtar) ?? 0,
  };
}

/* -------------------------------- kimlik ------------------------------- */

/**
 * İsteğin geldiği istemci adresi — hız ve bağlantı sınırının anahtarı.
 *
 * `X-Forwarded-For` VARSAYILAN OLARAK OKUNMUYOR. Başlığı istemci yazar;
 * güvenilseydi saldırgan her istekte başka bir adres uydurup hız sınırını
 * tümüyle atlardı. Yalnız ters vekil arkasında ve AÇIKÇA
 * (`STORYBOARD_VEKIL_GUVENILIR=1`) açıldığında okunuyor.
 */
export function istemciAdresi(
  req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } } | IncomingMessage,
  vekilGuvenilir: boolean,
): string {
  const r = req as { headers: Record<string, unknown>; socket?: { remoteAddress?: string } };
  if (vekilGuvenilir) {
    const xff = r.headers?.['x-forwarded-for'];
    const ilk = (Array.isArray(xff) ? xff[0] : xff) as string | undefined;
    if (ilk) return ilk.split(',')[0].trim();
  }
  return r.socket?.remoteAddress ?? 'bilinmiyor';
}

/* ------------------------------- başlıklar ----------------------------- */

/**
 * Her yanıta eklenen güvenlik başlıkları.
 *
 * - `Strict-Transport-Security`: TLS'e bir kez ulaşan tarayıcı bir daha düz
 *   HTTP denemez; ağdaki bir saldırganın bağlantıyı aşağı çekmesini kapatır.
 *   ⚠ Yalnız HTTPS üzerinden anlamlı — düz HTTP'de tarayıcı yok sayar.
 * - `X-Content-Type-Options: nosniff`: tarayıcı içerik tipini TAHMİN ETMEZ.
 *   Bir JSON yanıtının HTML sanılıp çalıştırılması bu başlıkla imkânsızlaşır.
 * - `Referrer-Policy: no-referrer`: davet jetonu ADRESTE taşınıyor; sayfadan
 *   dışarı bir istek gittiğinde adres Referer başlığıyla ÜÇÜNCÜ TARAFA
 *   sızardı. Jeton sızıntısının en sessiz yolu buydu.
 * - `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options`:
 *   sayfa başka bir sitenin çerçevesine konamaz (tıklama hırsızlığı).
 *   İkisi birlikte veriliyor çünkü eski tarayıcılar `frame-ancestors` bilmez.
 * - `Cross-Origin-Resource-Policy: same-origin`: yanıtı başka bir kaynağın
 *   sayfası doğrudan alamaz.
 */
export const GUVENLIK_BASLIKLARI: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};
