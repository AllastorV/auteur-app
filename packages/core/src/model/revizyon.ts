/**
 * REVİZYON — dağıtılmış sürüm ve elle konan değişiklik işaretleri.
 *
 * ## Neden ELLE, neden otomatik fark değil
 *
 * Otomatik fark motoru "hangi sayfa değişti" sorusunu ancak sayfalama
 * KİLİTLİYSE doğru cevaplar: bir sahneye üç satır eklendiğinde sonraki bütün
 * sayfalar kayar ve naif karşılaştırma hepsini revize sayar. Kilitli
 * sayfalama (A-sayfası sistemi) hatası pahalı ve ayıklaması zor bir
 * mekanizmadır.
 *
 * Elle işaretlemede bu sorun YOKTUR çünkü sayfa KİMLİĞİ iddia edilmiyor:
 * işaret bloğa asılır, hangi sayfaya düştüğü basma anında sayfalayıcıya
 * sorulur. Sektörün elle çalışan yazarları da tam olarak bunu yapar.
 *
 * ## Renk TEK BAŞINA tanımlayıcı değildir
 *
 * Kâğıt renkleri, okunabilir kalmak için açık bantta durmak zorunda ve o
 * bantta hepsini birbirinden net ayırmak fiziksel olarak mümkün değil
 * (ölçüldü: en yakın çift ΔE≈6). Bu yüzden renk İKİNCİL ipucudur; her revize
 * sayfa üstünde revizyonun ADINI ve TARİHİNİ yazılı taşır.
 *
 * Bu dosya SAF: ProseMirror, React, Yjs bilmiyor.
 */

/** Sektör sırası — sonraki her revizyon listedeki bir sonraki rengi alır. */
export const REVIZYON_RENKLERI = [
  'beyaz',
  'mavi',
  'pembe',
  'sari',
  'yesil',
  'altin',
  'devetuyu',
  'somon',
  'visne',
  'tan',
] as const;

export type RevizyonRengi = (typeof REVIZYON_RENKLERI)[number];

export const VARSAYILAN_RENK: RevizyonRengi = 'beyaz';

/**
 * Sözlük anahtarları. Metin BURADA Türkçe kalıyor ve gösterildiği yerde
 * `t()` ile çevriliyor — modül seviyesinde `t()` dili dondururdu.
 */
export const RENK_ADLARI: Record<RevizyonRengi, string> = {
  beyaz: 'Beyaz',
  mavi: 'Mavi',
  pembe: 'Pembe',
  sari: 'Sarı',
  yesil: 'Yeşil',
  altin: 'Altın Sarısı',
  devetuyu: 'Devetüyü (Buff)',
  somon: 'Somon',
  visne: 'Kiraz',
  tan: 'Açık Kahverengi (Tan)',
};

/**
 * Sayfa zemini — sRGB, 0..1 aralığında.
 *
 * Değerler GÖZ KARARI DEĞİL, ölçülerek seçildi: her biri siyah metinle en az
 * 10:1 kontrast veriyor (WCAG AAA gövde eşiği 7:1). Ayrım ölçümü de yapıldı;
 * en yakın çift ΔE≈5,5 (OKLab×100) — dokuz rengin hepsini okunabilir açık
 * bantta tutup birbirinden 8+ ΔE ayırmak fiziksel olarak mümkün değil. Bu
 * yüzden renk tek başına tanımlayıcı sayılmıyor: sayfa üstbilgisi
 * revizyonun ADINI ve TARİHİNİ yazılı taşıyor.
 *
 * Ölçüm betiği bu paletle birlikte yaşamalı — renk değiştirilirse kontrast
 * ve ayrım YENİDEN ölçülmeli, `revizyon-palet` testi bunu zorunlu kılıyor.
 */
export const RENK_ZEMINI: Record<RevizyonRengi, readonly [number, number, number]> = {
  beyaz: [1, 1, 1],
  mavi: [0.722, 0.831, 0.933],
  pembe: [0.969, 0.776, 0.847],
  sari: [0.953, 0.918, 0.561],
  yesil: [0.745, 0.875, 0.714],
  altin: [0.941, 0.808, 0.420],
  devetuyu: [0.910, 0.859, 0.706],
  somon: [0.961, 0.745, 0.604],
  visne: [0.875, 0.639, 0.714],
  tan: [0.851, 0.753, 0.639],
};

const GECERLI_RENK = new Set<string>(REVIZYON_RENKLERI);

/** Ham değeri renge çevirir — GÜVEN SINIRI, fırlatmaz. */
export function renkCoz(ham: unknown): RevizyonRengi {
  return typeof ham === 'string' && GECERLI_RENK.has(ham)
    ? (ham as RevizyonRengi)
    : VARSAYILAN_RENK;
}

export interface Revizyon {
  id: string;
  /** Yazarın verdiği ad. Boşsa arayüz rengin adını gösterir. */
  ad: string;
  renk: RevizyonRengi;
  /** Dağıtım tarihi — sayfa üstbilgisinde basılır. */
  tarih: number;
}

/**
 * Ham kaydı revizyona çevirir — GÜVEN SINIRI.
 *
 * Kimliksiz kayıt `null` döner ve ÇAĞIRAN onu atar: kimliksiz bir revizyona
 * işaret bağlanamaz, yani böyle bir kayıt zaten hiçbir şeyi göstermez.
 * Diğer alanların bozukluğu kaydı DÜŞÜRMEZ — ad boş kalır, renk varsayılana
 * düşer, tarih sıfırlanır. Bir alan yüzünden revizyonu atmak, o revizyona
 * bağlı bütün işaretleri sahipsiz bırakırdı.
 */
export function revizyonCoz(ham: unknown): Revizyon | null {
  if (typeof ham !== 'object' || ham === null) return null;
  const r = ham as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    ad: typeof r.ad === 'string' ? r.ad : '',
    renk: renkCoz(r.renk),
    tarih: typeof r.tarih === 'number' && Number.isFinite(r.tarih) ? r.tarih : 0,
  };
}

/**
 * Sıradaki rengi verir — kaçıncı revizyon olduğuna göre.
 *
 * On renk bittiğinde başa döner; revizyon sayısı belgeyi açmayı engellemez.
 */
export function siradakiRenk(mevcutSayi: number): RevizyonRengi {
  const n = Number.isFinite(mevcutSayi) && mevcutSayi > 0 ? Math.floor(mevcutSayi) : 0;
  return REVIZYON_RENKLERI[n % REVIZYON_RENKLERI.length];
}

/** Revizyonun görünen adı — yazar ad vermediyse rengin adı. */
export function revizyonAdi(r: Revizyon): string {
  return r.ad.trim() || RENK_ADLARI[r.renk];
}

/**
 * İşaretli blokların hangi sayfalara düştüğü.
 *
 * Sayfa KİMLİĞİ üretmiyor, sayfalayıcının verdiği eşlemeyi SORUYOR — bu
 * yüzden araya satır eklenip sayfalar kaysa bile sonuç doğru kalır.
 * Sayfa numarası TEK sayfalayıcıdan gelir (Karar 34); burada yeniden
 * hesaplanmaz.
 */
export function isaretliSayfalar(
  isaretler: ReadonlyMap<string, string>,
  blokSayfasi: ReadonlyMap<string, number>,
  revizyonId?: string,
): number[] {
  const sayfalar = new Set<number>();
  for (const [blockId, rev] of isaretler) {
    if (revizyonId !== undefined && rev !== revizyonId) continue;
    const sayfa = blokSayfasi.get(blockId);
    if (sayfa !== undefined) sayfalar.add(sayfa);
  }
  return [...sayfalar].sort((a, b) => a - b);
}

/** Sayfalayıcının her satırına bakar: iki sayfaya taşan blok ikisini de işaretler. */
export function isaretliSayfaNumaralari(
  sayfalar: readonly { no: number; satirlar: readonly { blockId: string }[] }[],
  isaretler: ReadonlyMap<string, string>,
  revizyonId: string,
): Set<number> {
  return new Set(sayfalar
    .filter((sayfa) => sayfa.satirlar.some((satir) => isaretler.get(satir.blockId) === revizyonId))
    .map((sayfa) => sayfa.no));
}

/**
 * Sayfalardan blok → sayfa numarası haritası.
 *
 * Şekil YAPISAL olarak alınıyor (`format/sayfala`'dan tip alınmıyor): bu
 * dosyanın saflığı sözleşme. Bir bloğun İLK düştüğü sayfa kazanır — sayfa
 * sınırına taşan bir blok iki sayfaya birden yayılır ve işaret, bloğun
 * başladığı sayfayı işaretlemelidir.
 */
export function sayfalardanBlokHaritasi(
  sayfalar: readonly { no: number; satirlar: readonly { blockId: string }[] }[],
): Map<string, number> {
  const harita = new Map<string, number>();
  for (const sayfa of sayfalar) {
    for (const satir of sayfa.satirlar) {
      if (satir.blockId && !harita.has(satir.blockId)) harita.set(satir.blockId, sayfa.no);
    }
  }
  return harita;
}

/**
 * Revizyonun sayfa üstbilgisi — "MAVİ REVİZYON · 12.03.2026".
 *
 * `sozcuk` dışarıdan geliyor çünkü bu metin BELGE dilindedir, arayüz
 * dilinde değil: Türkçe senaryo yazan biri arayüzü İngilizce kullanabilir
 * ve çıktıda "BLUE REVISION" görmemeli (`format/terim.ts` ile aynı ayrım).
 *
 * Tarihsiz revizyonda tarih BASILMAZ, "01.01.1970" basılmaz: bozuk bir
 * alanı doğruymuş gibi göstermek, ekibin yanlış sürümü dağıtmasına yol açar.
 */
export function ustbilgiMetni(r: Revizyon, sozcuk = 'REVİZYON'): string {
  const baslik = `${revizyonAdi(r).toLocaleUpperCase('tr')} ${sozcuk}`;
  if (!r.tarih) return baslik;
  const d = new Date(r.tarih);
  const ikiHane = (n: number) => String(n).padStart(2, '0');
  return `${baslik} · ${ikiHane(d.getDate())}.${ikiHane(d.getMonth() + 1)}.${d.getFullYear()}`;
}
