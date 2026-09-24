import type { AssetMap } from '../model/project-io';

/**
 * Gömülü varlıkların bellek (dataURL) ↔ dosya (ikili) dönüşümü.
 *
 * Canvas ve React tarafı görselleri dataURL olarak tutar; `.sbp` dosyası ise
 * `assets/` altında ham ikili saklar. Bu modül saf olduğu için tarayıcı
 * dışında da test edilebilir.
 */

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export function mimeForAsset(assetId: string): string {
  const ext = assetId.split('.').pop()?.toLowerCase() ?? 'png';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  // Node ortamı (testler, sunucu tarafı araçlar)
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Geçersiz dataURL.');
  return decodeBase64(dataUrl.slice(comma + 1));
}

export function bytesToDataUrl(assetId: string, bytes: Uint8Array): string {
  return `data:${mimeForAsset(assetId)};base64,${encodeBase64(bytes)}`;
}

/** Bellekteki dataURL'leri kaydedilebilir ikili veriye çevirir. */
export function collectAssets(assetUrls: Record<string, string>): AssetMap {
  const out: AssetMap = {};
  for (const [id, url] of Object.entries(assetUrls)) {
    if (!url.startsWith('data:')) continue;
    try {
      out[id] = dataUrlToBytes(url);
    } catch {
      // Bozuk dataURL kaydı engellememeli.
    }
  }
  return out;
}

/** `.sbp` içinden okunan varlıkları canvas'ın kullanabileceği URL'lere çevirir. */
export function assetUrlsFrom(assets: AssetMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, bytes] of Object.entries(assets)) out[id] = bytesToDataUrl(id, bytes);
  return out;
}
