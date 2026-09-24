/**
 * Yer imi modeli — §13.4.
 *
 * Saf: Yjs bilmez, React bilmez. Yalnız "im nedir" ve "imler hangi sırada
 * gezilir" sorularını yanıtlar.
 */

/**
 * Renk paleti SABİT ve KÜÇÜK.
 *
 * Serbest renk seçici bırakılsaydı iki im arasındaki fark okunamaz hâle
 * gelirdi (yan yana iki ton mavi) ve kenar işareti — tek gösterim yüzeyi —
 * anlamını kaybederdi. Adlar İNGİLİZCE DEĞİL: değer belgede saklanıyor ve
 * kullanıcıya da bu adla görünüyor.
 */
export const YER_IMI_RENKLERI = ['sarı', 'kırmızı', 'mavi', 'yeşil', 'mor'] as const;
export type YerImiRengi = (typeof YER_IMI_RENKLERI)[number];

export const VARSAYILAN_RENK: YerImiRengi = 'sarı';

/**
 * Paletteki bir SONRAKİ renk; sondan başa döner.
 *
 * Kenar işaretine tıklamak eskiden imi KALDIRIYORDU ve bu bir veri kaybı
 * yoluydu: tek yanlış tık, etiketiyle birlikte imi siliyor, geri alma da
 * yoktu (kullanıcı bildirimi 2026-08-30). Tıklamanın yeni anlamı "rengi
 * değiştir" — yıkıcı olmayan, keşfedilebilir bir eylem; kaldırma sağ tık
 * menüsüne taşındı.
 *
 * Bilinmeyen renk paletin BAŞINA döner: belge elle kurcalanmış olabilir ve
 * `indexOf` -1 verirse `-1 + 1 = 0` zaten ilk rengi seçer.
 */
export function sonrakiRenk(renk: YerImiRengi): YerImiRengi {
  const i = YER_IMI_RENKLERI.indexOf(renk);
  return YER_IMI_RENKLERI[(i + 1) % YER_IMI_RENKLERI.length];
}

/** Etiket bu uzunluğu aşarsa çekmecede okunmaz hâle gelir. */
export const ETIKET_EN_UZUN = 60;

export interface YerImi {
  etiket: string;
  renk: YerImiRengi;
}

/** Bilinmeyen renk paletin dışına çıkmaz — belge elle kurcalanmış olabilir. */
export function rengiDuzelt(deger: unknown): YerImiRengi {
  return (YER_IMI_RENKLERI as readonly string[]).includes(deger as string)
    ? (deger as YerImiRengi)
    : VARSAYILAN_RENK;
}

/**
 * Etiketi normalleştirir.
 *
 * Boş etiket GEÇERLİDİR: kullanıcı hızlıca im koyup adlandırmayı sonraya
 * bırakabilmeli. Çekmece boş etiketi satır metniyle gösterir, "isimsiz" gibi
 * bir doldurma metniyle değil.
 */
export function etiketiDuzelt(deger: unknown): string {
  if (typeof deger !== 'string') return '';
  return deger.normalize('NFC').trim().slice(0, ETIKET_EN_UZUN);
}

/** Belgeden okunan ham değeri güvenli bir ime çevirir. */
export function imiDuzelt(ham: unknown): YerImi {
  const o = (ham ?? {}) as Record<string, unknown>;
  return { etiket: etiketiDuzelt(o.etiket), renk: rengiDuzelt(o.renk) };
}

export interface SiraliYerImi extends YerImi {
  blockId: string;
  /** Bloğun senaryodaki sırası — çekmecede ve gezinmede kullanılan tek ölçü. */
  sira: number;
}

/**
 * İmleri BELGE SIRASINA göre dizer ve bayatları süzer.
 *
 * Sıra ekleme sırası DEĞİL: "sonraki im" ekleme sırasına göre gezilseydi
 * kullanıcı yukarı doğru atlar ve sıçramalar rastgele görünürdü.
 *
 * Bayat im (silinmiş bloğa ait) okurken SÜZÜLÜR, hevesle SİLİNMEZ: silme
 * işlemi bir geri-almayla yarışırsa im kalıcı olarak kaybolur. `odakCoz` da
 * bayat kimliği aynı sebeple düşürmeden doğruluyor.
 */
export function siraliImler(
  imler: ReadonlyMap<string, YerImi> | Readonly<Record<string, YerImi>>,
  blokKimlikleri: readonly string[],
): SiraliYerImi[] {
  const oku = (id: string): YerImi | undefined =>
    imler instanceof Map ? imler.get(id) : (imler as Record<string, YerImi>)[id];

  const cikti: SiraliYerImi[] = [];
  blokKimlikleri.forEach((id, sira) => {
    const im = oku(id);
    if (im) cikti.push({ ...imiDuzelt(im), blockId: id, sira });
  });
  return cikti;
}

/**
 * Bir sonraki (ya da bir önceki) imin blok kimliği.
 *
 * SARMALAR: son imden sonra başa döner. Sarmasaydı son imdeyken tuş sessizce
 * hiçbir şey yapmaz ve kullanıcı kısayolun bozulduğunu sanardı.
 *
 * `suanki` imli olmak zorunda değil — imleç herhangi bir satırdayken de
 * "sonraki im" anlamlıdır ve o satırdan SONRAKİ ilk im bulunur.
 */
export function imdeGez(
  sirali: readonly SiraliYerImi[],
  suankiSira: number | null,
  yon: 1 | -1,
): string | null {
  if (!sirali.length) return null;
  if (suankiSira === null) {
    return yon === 1 ? sirali[0].blockId : sirali[sirali.length - 1].blockId;
  }
  if (yon === 1) {
    const sonraki = sirali.find((i) => i.sira > suankiSira);
    return (sonraki ?? sirali[0]).blockId;
  }
  // Geriye: mevcut sıradan KÜÇÜK olanların sonuncusu.
  let onceki: SiraliYerImi | null = null;
  for (const i of sirali) {
    if (i.sira < suankiSira) onceki = i;
    else break;
  }
  return (onceki ?? sirali[sirali.length - 1]).blockId;
}
