import * as Y from 'yjs';
import { ilkSaglamKayit, type AdayKayit } from './anlik';

/**
 * Kontrol noktasına dönüş — §15.2.2.
 *
 * > "Geri dönmek mevcut durumu **silmez**: geri dönmeden hemen önce otomatik
 * > bir kontrol noktası daha yazılır, yani geri dönüşten de geri dönülebilir."
 *
 * Sıra sözleşmedir: **önce güvenlik noktası, sonra yükleme.** Ters sırada,
 * ikisi arasındaki bir çökme kullanıcıyı eski duruma kilitler ve aradaki
 * bütün iş yok olur — üstelik kullanıcı bunu kendi eliyle tetiklemiş olur.
 * Güvenlik noktası YAZILAMAZSA dönüş İPTAL edilir; "hedefi yükleyip riski
 * kullanıcıya bildirmek" burada kabul edilebilir değil, çünkü bildirimi
 * okuduğunda iş çoktan gitmiş olur.
 */

export interface GeriDonusKabugu {
  /** Mevcut durumu yeni bir kontrol noktası olarak yazar. */
  guvenlikNoktasiYaz(cipa: Uint8Array): Promise<void>;
  /** Hedef kontrol noktasının baytları. */
  noktaOku(id: string): Promise<Uint8Array>;
}

export interface GeriDonusSonucu {
  doc: Y.Doc;
  /** Dönüşten önce yazılan güvenlik noktasının baytları. */
  guvenlikNoktasi: Uint8Array;
}

/**
 * "Önce güvenlik noktası" kuralının TEK evi.
 *
 * Mevcut durumu yazar ve yazamazsa FIRLATIR — çağıran, geri döndüren işlemi
 * hiç başlatmaz. Kural burada duruyor çünkü mevcut durumun üstüne yazan iki
 * ayrı yol var (kontrol noktasına dönüş ve sürüm geçmişinden geri yükleme) ve
 * ikisi kuralı ayrı ayrı uygulasaydı biri onu unuttuğunda kimse fark etmezdi.
 * Bir kez unutuldu: sürüm geri yükleme yolu `replaceProject`'e doğrudan
 * gidiyordu, `undoManager.destroy()` çağrılıyordu ve geri dönüşten geri dönüş
 * kalmıyordu.
 */
export async function guvenlikNoktasiAl(
  mevcut: Y.Doc,
  yaz: (cipa: Uint8Array) => Promise<void>,
): Promise<Uint8Array> {
  const cipa = Y.encodeStateAsUpdate(mevcut);
  await yaz(cipa);
  return cipa;
}

export async function kontrolNoktasinaDon(
  mevcut: Y.Doc,
  hedefId: string,
  kabuk: GeriDonusKabugu,
): Promise<GeriDonusSonucu> {
  /* ÖNCE güvenlik noktası. Hata fırlarsa dönüş hiç başlamaz ve `mevcut`
     dokunulmadan kalır. */
  const guvenlikNoktasi = await guvenlikNoktasiAl(mevcut, (c) =>
    kabuk.guvenlikNoktasiYaz(c),
  );

  const bayt = await kabuk.noktaOku(hedefId);
  const secim = ilkSaglamKayit([{ id: hedefId, oku: () => bayt } as AdayKayit]);
  if (!secim.doc) {
    /* Hedef bozuksa dönüş yapılmaz. Güvenlik noktası zaten yazıldı; zararı
       yok, halkada bir kayıt fazla durur. */
    throw new Error(
      `Kontrol noktasi acilamadi (${secim.elenen[0]?.sebep ?? 'bilinmeyen'}): ${hedefId}`,
    );
  }
  return { doc: secim.doc, guvenlikNoktasi };
}
