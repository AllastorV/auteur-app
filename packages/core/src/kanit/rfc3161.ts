/**
 * RFC 3161 ZAMAN DAMGASI — üçüncü tarafın tanıklığı.
 *
 * ## Ne kanıtlar
 *
 * Yerel zincir metnin bu SIRAYLA var olduğunu kanıtlıyor; TARİHİ
 * kanıtlamıyor, çünkü saat bu makinenin. Zaman damgası bağımsız bir
 * otoritenin "bu özet şu tarihten önce vardı" imzasıdır. Kanıtın hukuki
 * ağırlığını veren yer burası.
 *
 * ## İstek neden ELLE DER kodlanıyor
 *
 * `TimeStampReq` sabit yapılı ve ~60 bayt: sürüm, özet algoritması, özet,
 * nonce, sertifika isteği. Karşılığında `pkijs`+`asn1js` ≈ 1 MB bağımlılık
 * ve yeni bir tedarik zinciri yüzeyi gelirdi. Merdiven açık: stdlib + kırk
 * satır.
 *
 * ## Yanıt neden OPAK saklanıyor
 *
 * CMS `SignedData` açmak, X.509 yol doğrulaması ve OCSP/CRL sorgusu ya
 * binlerce satır ya ağır bir bağımlılıktır. Daha kötüsü: YANLIŞ yazılmış
 * bir doğrulayıcı "geçerli" diyerek kullanıcıya kanıtı olmayan bir kanıt
 * vaat eder — sessiz başarısızlığın en pahalı türü. Jeton olduğu gibi
 * `.tsr` olarak saklanıyor ve doğrulama `openssl ts -verify`e devrediliyor;
 * kanıt paketindeki `OKUBENI.txt` komutu satır satır yazıyor.
 *
 * ## Ama tamamen KÖR değil
 *
 * Yanıtın `PKIStatusInfo.status` tam sayısı okunuyor. `granted`(0) ya da
 * `grantedWithMods`(1) değilse jeton KAYDEDİLMİYOR ve hata kullanıcıya
 * söyleniyor: reddedilmiş bir yanıtı "damga alındı" diye saklamak yalan
 * olurdu.
 */

/** Enjekte edilebilir `fetch` — ağa çıkmadan test edilebilsin diye. */
export type Getirici = typeof fetch;

/** FreeTSA — ücretsiz ve kayıt istemiyor. Ayarda değiştirilebilir. */
export const VARSAYILAN_TSA = 'https://freetsa.org/tsr';
export const TSA_ZAMAN_ASIMI_MS = 30_000;

export interface DamgaAyari {
  url?: string;
  getirici?: Getirici;
  zamanAsimiMs?: number;
  /** Testte sabitlenir; üretimde `crypto.getRandomValues`. */
  nonce?: Uint8Array;
}

/* ------------------------------------------------------------------ */
/* DER — yalnız gereken kadarı                                         */
/* ------------------------------------------------------------------ */

/** DER uzunluk kodlaması: 127'ye kadar kısa biçim, sonrası uzun biçim. */
function uzunluk(n: number): number[] {
  if (n < 0x80) return [n];
  const bayt: number[] = [];
  let k = n;
  while (k > 0) { bayt.unshift(k & 0xff); k >>>= 8; }
  return [0x80 | bayt.length, ...bayt];
}

function tlv(etiket: number, icerik: readonly number[]): number[] {
  return [etiket, ...uzunluk(icerik.length), ...icerik];
}

/**
 * Pozitif tam sayı — DER'de en anlamlı bit 1 ise başa 0x00 EKLENİR.
 * Eklenmezse sayı NEGATİF okunur ve sunucu nonce'u başka bir değer sanar.
 */
function pozitifTamsayi(bayt: Uint8Array): number[] {
  let i = 0;
  while (i < bayt.length - 1 && bayt[i] === 0) i++;
  const kirpik = [...bayt.subarray(i)];
  return tlv(0x02, kirpik[0] & 0x80 ? [0x00, ...kirpik] : kirpik);
}

/** `2.16.840.1.101.3.4.2.1` — SHA-256. */
const SHA256_OID = [0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01];

/**
 * RFC 3161 `TimeStampReq` (DER).
 *
 * ```
 * TimeStampReq ::= SEQUENCE {
 *   version        INTEGER { v1(1) },
 *   messageImprint MessageImprint,
 *   nonce          INTEGER OPTIONAL,
 *   certReq        BOOLEAN DEFAULT FALSE }
 * ```
 *
 * `certReq` TRUE isteniyor: sertifika jetonun içine gömülü gelsin ki
 * doğrulayan kişi ayrıca sertifika aramak zorunda kalmasın.
 */
export function zamanDamgasiIstegi(ozet: Uint8Array, nonce: Uint8Array): Uint8Array {
  if (ozet.length !== 32) throw new Error(`Zaman damgasi ozeti 32 bayt olmali: ${ozet.length}`);
  if (!nonce.length) throw new Error('Zaman damgasi nonce bos olamaz');

  const algoritma = tlv(0x30, [...SHA256_OID, 0x05, 0x00]);
  const damgaMetni = tlv(0x04, [...ozet]);
  const imprint = tlv(0x30, [...algoritma, ...damgaMetni]);
  const surum = tlv(0x02, [0x01]);
  const certReq = tlv(0x01, [0xff]);

  return new Uint8Array(tlv(0x30, [
    ...surum, ...imprint, ...pozitifTamsayi(nonce), ...certReq,
  ]));
}

/** Bir TLV'nin içerik aralığını döner. Bozuk yapıda `null`. */
function tlvOku(bayt: Uint8Array, konum: number): { etiket: number; bas: number; son: number } | null {
  if (konum + 2 > bayt.length) return null;
  const etiket = bayt[konum];
  let k = konum + 1;
  let uzun = bayt[k++];
  if (uzun & 0x80) {
    const sayi = uzun & 0x7f;
    if (sayi === 0 || sayi > 4 || k + sayi > bayt.length) return null;
    uzun = 0;
    for (let i = 0; i < sayi; i++) uzun = (uzun << 8) | bayt[k++];
  }
  if (k + uzun > bayt.length) return null;
  return { etiket, bas: k, son: k + uzun };
}

/**
 * Yanıtın `PKIStatusInfo.status` değeri.
 *
 * Okunamazsa **-1** dönüyor, 0 DEĞİL: "bilinmiyor" ile "granted" aynı
 * sayıya düşseydi bozuk bir yanıt geçerli sayılırdı.
 */
export function pkiDurumu(der: Uint8Array): number {
  const dis = tlvOku(der, 0);
  if (!dis || dis.etiket !== 0x30) return -1;
  const durumBlogu = tlvOku(der, dis.bas);
  if (!durumBlogu || durumBlogu.etiket !== 0x30) return -1;
  const tamsayi = tlvOku(der, durumBlogu.bas);
  if (!tamsayi || tamsayi.etiket !== 0x02) return -1;
  let n = 0;
  for (let i = tamsayi.bas; i < tamsayi.son; i++) n = (n << 8) | der[i];
  return n;
}

/** `granted` ve `grantedWithMods` — jetonu saklanabilir tek iki durum. */
const KABUL = new Set([0, 1]);

/**
 * Hata gövdesi 300 karaktere KIRPILIYOR: bir HTML hata sayfasının tamamını
 * bildirime basmak kullanıcıya hiçbir şey söylemez (`dil/saglayicilar.ts`
 * ile aynı karar).
 */
async function hataMesaji(yanit: Response): Promise<string> {
  let govde = '';
  try { govde = (await yanit.text()).slice(0, 300); } catch { govde = ''; }
  return `TSA ${yanit.status}${govde ? `: ${govde}` : ''}`;
}

export interface DamgaSonucu {
  /** DER `TimeStampResp` — OPAK saklanıyor. */
  jeton: Uint8Array;
  durum: number;
  url: string;
}

/**
 * Özeti damgalatır.
 *
 * SESSİZ BAŞARISIZLIK YOK: ağ hatası, HTTP hatası ve reddedilmiş durum —
 * üçü de FIRLATIYOR. Çağıran kullanıcıya söylemek zorunda.
 */
export async function zamanDamgasiAl(
  ozet: Uint8Array,
  ayar: DamgaAyari = {},
): Promise<DamgaSonucu> {
  const url = ayar.url?.trim() || VARSAYILAN_TSA;
  const getir = ayar.getirici ?? fetch;
  const nonce = ayar.nonce ?? globalThis.crypto.getRandomValues(new Uint8Array(8));
  const istek = zamanDamgasiIstegi(ozet, nonce);

  const yanit = await getir(url, {
    method: 'POST',
    headers: { 'content-type': 'application/timestamp-query' },
    body: istek as BodyInit,
    signal: AbortSignal.timeout(ayar.zamanAsimiMs ?? TSA_ZAMAN_ASIMI_MS),
  });
  if (!yanit.ok) throw new Error(await hataMesaji(yanit));

  const jeton = new Uint8Array(await yanit.arrayBuffer());
  const durum = pkiDurumu(jeton);
  if (!KABUL.has(durum)) {
    /* REDDEDİLEN YANIT SAKLANMIYOR: "damga alındı" diye kaydetmek, kullanıcıya
       olmayan bir tanıklığı varmış gibi göstermek olurdu. */
    throw new Error(`TSA damgayi vermedi (PKIStatus ${durum})`);
  }
  return { jeton, durum, url };
}
