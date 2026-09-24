import type { ScriptBlock } from '../model/script';
import type { FormatProfili } from '../format/profil';
import { duzYaz } from '../disa/duz';
import type { KanitKabugu } from '../platform/types';
import { zamanDamgasiAl, type DamgaAyari } from './rfc3161';
import {
  halka,
  sifirHalka,
  type MuhurTetikleyici,
  type ZincirKaydi,
} from '../veri/zincir';

/**
 * MÜHÜRLEME — zincire kayıt düşmenin TEK yolu.
 *
 * ## Kanonik metin neden `duzYaz`
 *
 * Mühürlenen şey belgenin GÖRÜNEN metni olmalı: kullanıcı "bu metin
 * bendeydi" diyor, "bu Yjs güncelleme akışı bendeydi" demiyor. `duzYaz`
 * zaten ekranla aynı büyük-harf kurallarını profilden okuyor, yani ikinci
 * bir "hash için serileştirme" yazılmadı (Karar 2).
 *
 * Biçim sürümü bağımlılığı YOK: hash'lenen baytların KENDİSİ saklanıyor ve
 * doğrulayıcı hash'i o dosyadan yeniden hesaplıyor. `duzYaz` yarın
 * değişirse eski mühürler doğrulanmaya devam eder.
 *
 * ## Hiçbir hata yutulmuyor
 *
 * `veri/yazici.ts`teki yazarlık yolu hataları bilerek yutuyor ve o karar
 * DOĞRU: kaybolan şey bir attribution kaydı, metin değil. Kanıt yolu onun
 * TERSİ ve ayrı bir kod yolu: "mühürlendi" dedikten sonra sessizce
 * kaybolan bir kayıt, hiç mühür olmamasından kötüdür — kullanıcı ona
 * güvenip başka bir kanıt aramaz.
 */

export interface MuhurGirdisi {
  projeId: string;
  /** Mühürlenen KANONİK metin. `kanonikMetin` ile üretilir. */
  metin: string;
  yazar: string;
  etiket: string;
  tetikleyici: MuhurTetikleyici;
  /** Testte sabitlenir; üretimde `Date.now`. */
  simdi?: () => number;
}

/** Belgenin mühürlenecek hâli — ekranda görünen metnin düz karşılığı. */
export function kanonikMetin(bloklar: readonly ScriptBlock[], profil: FormatProfili): string {
  return duzYaz(bloklar, { profil });
}

async function sha256(bayt: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bayt as BufferSource));
}

/**
 * Metni mühürler ve zincire ekler.
 *
 * Zincirin son halkası DOSYADAN okunuyor, bellekte tutulan bir sayaçtan
 * değil: iki pencere aynı projeyi açtıysa ya da kullanıcı arada dosyayı
 * elle kopyaladıysa bellekteki sayaç yalan söylerdi.
 */
export async function muhurle(kabuk: KanitKabugu, girdi: MuhurGirdisi): Promise<ZincirKaydi> {
  const bayt = new TextEncoder().encode(girdi.metin);
  const { kayitlar } = await kabuk.oku(girdi.projeId);
  const son = kayitlar[kayitlar.length - 1];
  const kayit: ZincirKaydi = {
    zaman: (girdi.simdi ?? Date.now)(),
    tur: 'muhur',
    tetikleyici: girdi.tetikleyici,
    oncekiHalka: son ? await halka(son) : sifirHalka(),
    icerikOzeti: await sha256(bayt),
    icerikBayt: bayt.length,
    yazar: girdi.yazar,
    etiket: girdi.etiket,
  };
  await kabuk.muhurYaz(girdi.projeId, kayit, bayt);
  return kayit;
}

/**
 * Kayıttan sonra otomatik mühür.
 *
 * ## Neden her çıpada DEĞİL
 *
 * Beş dakikada bir kayıt = yılda 105 120 kayıt ≈ 13,7 MB budanamaz dosya —
 * ve makinenin KENDİ saatiyle atılmış 105 bin yerel kayıt hiçbir şey
 * kanıtlamaz. Kaydetme kullanıcının kendi işaretlediği andır; zincire
 * girmeye değer olan da odur.
 *
 * ## Neden TSA çağrılmıyor
 *
 * Kullanıcının haberi olmadan dış bir sunucuya belge özeti göndermek kabul
 * edilemez ve ücretsiz damga sunucularını hız sınırına çarptırırdı. Zaman
 * damgası yalnız ELLE mühürde, ayarda açıksa alınıyor.
 *
 * ## `kabuk` yoksa ne oluyor
 *
 * Web kabuğunda `kanit` `null`. Bu bir HATA DEĞİL, olmayan bir yetenek:
 * `null` dönüyor ve çağıran kullanıcıyı rahatsız etmiyor. Arayüz zaten
 * kanıt katmanının bu kabukta bulunmadığını ayrıca söylüyor.
 */
export async function kayitSonrasiMuhurle(
  kabuk: KanitKabugu | null,
  girdi: Omit<MuhurGirdisi, 'tetikleyici'>,
): Promise<ZincirKaydi | null> {
  if (!kabuk) return null;
  return muhurle(kabuk, { ...girdi, tetikleyici: 'surum' });
}

/**
 * Bir mührü zaman damgasıyla TANIKLATIR.
 *
 * Damgalanan şey metnin özeti değil MÜHRÜN HALKASI: halka kaydın bütün
 * alanlarını (zaman, yazar, etiket, içerik özeti) kapsıyor, yani otoritenin
 * imzaladığı şey "bu metin" değil "bu kayıt" oluyor. Metnin özetini
 * damgalasaydık, aynı metni ikinci kez mühürleyen biri o damgayı kendi
 * kaydına iliştirebilirdi.
 *
 * Append-only dosyada MÜHÜR GÜNCELLENMİYOR: damga İKİNCİ bir kayıt olarak
 * giriyor ve `icerikOzeti` alanında dayandığı mührün halkasını taşıyor.
 *
 * Hata YUTULMUYOR ve zincire kayıt DÜŞMÜYOR: damga alınamadıysa mühür
 * damgasız kalır ve arayüz bunu rozetle söyler. "Alındı" diye kaydetmek
 * olmayan bir tanıklığı varmış gibi göstermek olurdu.
 */
export async function damgala(
  kabuk: KanitKabugu,
  projeId: string,
  muhur: ZincirKaydi,
  ayar: DamgaAyari & { simdi?: () => number } = {},
): Promise<ZincirKaydi> {
  const dayanak = await halka(muhur);
  const { jeton, url } = await zamanDamgasiAl(dayanak, ayar);
  const { kayitlar } = await kabuk.oku(projeId);
  const son = kayitlar[kayitlar.length - 1];
  const kayit: ZincirKaydi = {
    zaman: (ayar.simdi ?? Date.now)(),
    tur: 'damga',
    tetikleyici: muhur.tetikleyici,
    oncekiHalka: son ? await halka(son) : sifirHalka(),
    icerikOzeti: dayanak,
    icerikBayt: jeton.length,
    yazar: muhur.yazar,
    etiket: url,
  };
  await kabuk.damgaYaz(projeId, kayit, jeton);
  return kayit;
}
