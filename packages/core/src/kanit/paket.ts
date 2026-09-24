import JSZip from 'jszip';
import dogrulayiciKaynak from './dogrula.mjs?raw';
import {
  halka,
  ozetHex,
  zincirBasligi,
  zincirCercevesi,
  type ZincirKaydi,
} from '../veri/zincir';
import type { KanitKabugu } from '../platform/types';

/**
 * KANIT PAKETİ — Auteur olmadan doğrulanabilen tek dosya.
 *
 * ## İçindekiler
 *
 * ```
 * OKUBENI.txt            ne kanıtlar, neyi KANITLAMAZ, openssl komutu
 * zincir.log             ham ikili zincir
 * zincir.json            aynı verinin insan/araç okunur dökümü (TÜREV)
 * muhurler/<zaman>.txt   mühürlenen metinler
 * damgalar/<zaman>.tsr   RFC 3161 jetonları (opak)
 * dogrula.mjs            bağımsız doğrulayıcı — Node 18+, sıfır bağımlılık
 * ```
 *
 * ## `zincir.log` neden yeniden kodlanıyor
 *
 * Kabuk kayıtları çözümlenmiş hâlde veriyor; paket onları aynı kodlayıcıyla
 * yeniden yazıyor. Kodlama BELİRLENİMCİ olduğu için sonuç bayt bayt aynı ve
 * kabuğa "ham baytları da ver" diye ikinci bir yol açmaya gerek kalmıyor.
 * (Yeniden kodlama bozulmuş bir dosyayı DÜZELTMİYOR: bozuk çerçeve zaten
 * çözümlenemez ve o kayıt pakete hiç girmez.)
 *
 * ## `dogrula.mjs` neden gerçek bir dosya
 *
 * Gömülü bir dizge olsaydı testi yalnız o dizgeyi doğrulardı — ölü koda
 * kefil olan yeşil test. Dosya olarak yaşıyor, pakete `?raw` ile giriyor ve
 * testi onu `node dogrula.mjs` ile GERÇEKTEN koşturuyor.
 */

export interface KanitPaketSecenekleri {
  kabuk: KanitKabugu;
  projeId: string;
  /** Projenin adı — OKUBENI'de ve dosya adında görünüyor. */
  projeAdi: string;
  kayitlar: readonly ZincirKaydi[];
}

export interface KanitPaketi {
  zip: Uint8Array;
  dosyalar: string[];
  okubeni: string;
}

const adI = (zaman: number) => String(Math.trunc(zaman));

function okubeniYaz(projeAdi: string, kayitlar: readonly ZincirKaydi[]): string {
  const muhur = kayitlar.filter((k) => k.tur === 'muhur').length;
  const damga = kayitlar.filter((k) => k.tur === 'damga').length;
  return [
    `AUTEUR KANIT PAKETİ — ${projeAdi}`,
    '',
    `Kayıt: ${kayitlar.length} (${muhur} mühür, ${damga} zaman damgası)`,
    '',
    'NASIL DOĞRULANIR',
    '  node dogrula.mjs',
    '',
    'Node 18 veya üstü yeterlidir. Betik hiçbir paket kurmaz ve ağa çıkmaz.',
    '',
    'NE KANITLAR',
    '  · zincir.log çerçeveleri bozulmamış (CRC-32).',
    '  · Her kayıt bir öncekine SHA-256 halkasıyla bağlı: aradan bir kayıt',
    '    çıkarmak, sıralarını değiştirmek ya da bir alanını (zaman, yazar,',
    '    etiket, özet) düzeltmek bağı KOPARIR.',
    '  · muhurler/ altındaki metinler kayıttaki özetle aynı — yani',
    '    mühürlendiği andaki metnin ta kendisi.',
    '',
    'NE KANITLAMAZ',
    '  · TARİHİ. zincir.log içindeki zamanlar mührü alan makinenin',
    '    saatidir. Tarihi ancak bağımsız bir zaman damgası kanıtlar.',
    '  · Zaman damgasının GEÇERLİLİĞİNİ. damgalar/*.tsr birer RFC 3161',
    '    jetonudur ve bu betik onları AÇMAZ. Doğrulamak için:',
    '      openssl ts -verify -data muhurler/<zaman>.txt \\',
    '        -in damgalar/<zaman>.tsr -CAfile <tsa-ca.pem>',
    '',
    'DOSYALAR',
    '  zincir.log   ham ikili kayıt — kanıtın kendisi.',
    '  zincir.json  aynı verinin okunur dökümü. TÜREVDİR; çelişkide',
    '               zincir.log geçerlidir.',
    '',
  ].join('\n');
}

async function jsonDokum(kayitlar: readonly ZincirKaydi[]): Promise<string> {
  const satirlar = [];
  for (let i = 0; i < kayitlar.length; i++) {
    const k = kayitlar[i];
    satirlar.push({
      sira: i,
      zaman: k.zaman,
      zamanISO: new Date(k.zaman).toISOString(),
      tur: k.tur,
      tetikleyici: k.tetikleyici,
      yazar: k.yazar,
      etiket: k.etiket,
      icerikBayt: k.icerikBayt,
      oncekiHalka: ozetHex(k.oncekiHalka),
      icerikOzeti: ozetHex(k.icerikOzeti),
      halka: ozetHex(await halka(k)),
    });
  }
  return JSON.stringify({ surum: 1, kayitlar: satirlar }, null, 2);
}

/** Kayıtları ham zincir dosyasına geri kodlar — belirlenimci. */
export function zinciriKodla(kayitlar: readonly ZincirKaydi[]): Uint8Array {
  const parcalar = [zincirBasligi(), ...kayitlar.map(zincirCercevesi)];
  const toplam = parcalar.reduce((n, p) => n + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) { cikti.set(p, k); k += p.length; }
  return cikti;
}

export async function kanitPaketiKur(s: KanitPaketSecenekleri): Promise<KanitPaketi> {
  const zip = new JSZip();
  const dosyalar: string[] = [];

  const okubeni = okubeniYaz(s.projeAdi, s.kayitlar);
  zip.file('OKUBENI.txt', okubeni);
  zip.file('zincir.log', zinciriKodla(s.kayitlar));
  zip.file('zincir.json', await jsonDokum(s.kayitlar));
  zip.file('dogrula.mjs', dogrulayiciKaynak);
  dosyalar.push('OKUBENI.txt', 'zincir.log', 'zincir.json', 'dogrula.mjs');

  for (const k of s.kayitlar) {
    const ad = adI(k.zaman);
    if (k.tur === 'muhur') {
      const metin = await s.kabuk.muhurMetni(s.projeId, k.zaman);
      /* METİN YOKSA SESSİZCE ATLANMIYOR: dosya pakete girmiyor ve
         doğrulayıcı onu "EKSIK" diye raporluyor. Sahte bir boş dosya
         koymak, kurcalanmış bir kanıt üretmek olurdu. */
      if (!metin) continue;
      zip.file(`muhurler/${ad}.txt`, metin);
      dosyalar.push(`muhurler/${ad}.txt`);
    } else {
      const jeton = await s.kabuk.damgaJetonu(s.projeId, k.zaman);
      if (!jeton) continue;
      zip.file(`damgalar/${ad}.tsr`, jeton);
      dosyalar.push(`damgalar/${ad}.tsr`);
    }
  }

  return { zip: await zip.generateAsync({ type: 'uint8array' }), dosyalar, okubeni };
}
