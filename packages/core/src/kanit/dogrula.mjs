#!/usr/bin/env node
/**
 * KANIT PAKETİ DOĞRULAYICISI — Auteur olmadan çalışır.
 *
 * Kullanım:  node dogrula.mjs [paket-dizini]
 *
 * Bu dosya BİLEREK hiçbir şey içe aktarmıyor (yalnız `node:` çekirdeği) ve
 * Auteur'ün kodundan HİÇBİR ŞEY paylaşmıyor. Sebebi kanıtın kendisi: eğer
 * doğrulayıcı, doğruladığı yazılımın kütüphanesine bel bağlasaydı, o
 * kütüphanedeki bir hata hem kaydı hem doğrulamayı aynı yönde bozardı.
 * Üçüncü taraf (avukat, bilirkişi) bu tek dosyayı okuyup Node 18+ ile
 * koşturabilir.
 *
 * NE DOĞRULAR
 *  - `zincir.log`un çerçeve bütünlüğünü (sihir, sürüm, uzunluk, CRC-32)
 *  - Halka bağını: her kaydın `oncekiHalka` alanı bir önceki kaydın
 *    SHA-256 halkasına eşit mi
 *  - Mühürlenen metinlerin özetini: `muhurler/<zaman>.txt` dosyasının
 *    SHA-256'sı kayıttaki özetle aynı mı
 *  - Damga kayıtlarının bir mühre dayanıp dayanmadığını ve `.tsr`
 *    dosyasının var olup olmadığını
 *
 * NE DOĞRULAMAZ
 *  - Zaman damgasının kendisini. `.tsr` dosyaları RFC 3161 jetonları ve
 *    imzalarını doğrulamak sertifika zinciri gerektirir. Komut:
 *      openssl ts -verify -data muhurler/<zaman>.txt \
 *        -in damgalar/<zaman>.tsr -CAfile <tsa-ca.pem>
 *  - YEREL SAATİ. Zincirdeki `zaman` alanları mührü alan makinenin
 *    saatidir; tarihin kanıtı yalnız zaman damgasıdır.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SIHIR = [0x4d, 0x5a, 0x5a, 0x4e]; // MZZN
const SURUM = 1;
const BASLIK = 6;
const CERCEVE_BASLIK = 8;
const OZET = 32;
const TURLER = ['muhur', 'damga'];
const TETIKLEYICILER = ['elle', 'surum', 'revizyon'];

/* CRC-32 (IEEE) — Auteur'ünkiyle aynı polinom, ayrı yazım. */
const TABLO = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bayt) {
  let c = 0xffffffff;
  for (let i = 0; i < bayt.length; i++) c = TABLO[(c ^ bayt[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const sha256 = (bayt) => new Uint8Array(crypto.createHash('sha256').update(bayt).digest());
const hex = (b) => Buffer.from(b).toString('hex');
const esit = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Gövdeyi kayda çevirir; bozuksa `null`. */
function govdeCoz(govde) {
  const g = new DataView(govde.buffer, govde.byteOffset, govde.byteLength);
  let k = 0;
  if (govde.length < 8 + 1 + 1 + OZET * 2 + 4 + 2) return null;
  const zaman = g.getFloat64(k, true); k += 8;
  const tur = TURLER[govde[k]]; k += 1;
  const tetikleyici = TETIKLEYICILER[govde[k]]; k += 1;
  if (!tur || !tetikleyici) return null;
  const oncekiHalka = govde.slice(k, k + OZET); k += OZET;
  const icerikOzeti = govde.slice(k, k + OZET); k += OZET;
  const icerikBayt = g.getUint32(k, true); k += 4;
  const yazarUzunluk = g.getUint16(k, true); k += 2;
  if (k + yazarUzunluk + 2 > govde.length) return null;
  const yazar = Buffer.from(govde.subarray(k, k + yazarUzunluk)).toString('utf8'); k += yazarUzunluk;
  const etiketUzunluk = g.getUint16(k, true); k += 2;
  if (k + etiketUzunluk > govde.length) return null;
  const etiket = Buffer.from(govde.subarray(k, k + etiketUzunluk)).toString('utf8');
  k += etiketUzunluk;
  if (k !== govde.length) return null;
  return { zaman, tur, tetikleyici, oncekiHalka, icerikOzeti, icerikBayt, yazar, etiket, govde };
}

function zinciriCoz(bayt) {
  if (bayt.length < BASLIK) return { kayitlar: [], durum: 'yabanci' };
  for (let i = 0; i < 4; i++) if (bayt[i] !== SIHIR[i]) return { kayitlar: [], durum: 'yabanci' };
  const g = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  if (g.getUint16(4, true) !== SURUM) return { kayitlar: [], durum: 'yabanci' };

  const kayitlar = [];
  let konum = BASLIK;
  for (;;) {
    if (konum === bayt.length) return { kayitlar, durum: 'tam' };
    if (konum + CERCEVE_BASLIK > bayt.length) return { kayitlar, durum: 'kirpik' };
    const uzunluk = g.getUint32(konum, true);
    const saglama = g.getUint32(konum + 4, true);
    if (uzunluk === 0 || konum + CERCEVE_BASLIK + uzunluk > bayt.length) {
      return { kayitlar, durum: 'bozuk' };
    }
    const govde = bayt.subarray(konum + CERCEVE_BASLIK, konum + CERCEVE_BASLIK + uzunluk);
    if (crc32(govde) !== saglama) return { kayitlar, durum: 'bozuk' };
    const kayit = govdeCoz(govde);
    if (!kayit) return { kayitlar, durum: 'bozuk' };
    kayitlar.push(kayit);
    konum += CERCEVE_BASLIK + uzunluk;
  }
}

const kok = process.argv[2] ?? '.';
const satirlar = [];
let hata = 0;
const ok = (s) => satirlar.push(`OK    ${s}`);
const kotu = (s) => { hata++; satirlar.push(`HATA  ${s}`); };

const zincirYolu = path.join(kok, 'zincir.log');
if (!fs.existsSync(zincirYolu)) {
  console.error(`HATA  zincir.log bulunamadi: ${zincirYolu}`);
  process.exit(1);
}

const { kayitlar, durum } = zinciriCoz(new Uint8Array(fs.readFileSync(zincirYolu)));
if (durum === 'tam') ok(`zincir.log cerceveleri saglam (${kayitlar.length} kayit)`);
else kotu(`zincir.log cozumleme durumu: ${durum} (${kayitlar.length} kayit okundu)`);

const halkalar = [];
for (let i = 0; i < kayitlar.length; i++) {
  const k = kayitlar[i];
  const beklenen = i === 0 ? new Uint8Array(OZET) : halkalar[i - 1];
  if (esit(k.oncekiHalka, beklenen)) ok(`[${i}] halka bagi`);
  else kotu(`[${i}] halka bagi KOPUK — beklenen ${hex(beklenen).slice(0, 16)}…, bulunan ${hex(k.oncekiHalka).slice(0, 16)}…`);
  halkalar.push(sha256(k.govde));

  const ad = String(Math.trunc(k.zaman));
  if (k.tur === 'muhur') {
    const metinYolu = path.join(kok, 'muhurler', `${ad}.txt`);
    if (!fs.existsSync(metinYolu)) {
      kotu(`[${i}] muhurlenen metin EKSIK: muhurler/${ad}.txt`);
    } else {
      const metin = new Uint8Array(fs.readFileSync(metinYolu));
      if (metin.length !== k.icerikBayt) {
        kotu(`[${i}] metin uzunlugu uyusmuyor: ${metin.length} != ${k.icerikBayt}`);
      } else if (esit(sha256(metin), k.icerikOzeti)) {
        ok(`[${i}] metin ozeti (${ad}.txt, ${metin.length} bayt)`);
      } else {
        kotu(`[${i}] metin ozeti UYUSMUYOR: muhurler/${ad}.txt degistirilmis`);
      }
    }
  } else {
    const dayanak = halkalar.slice(0, i).some((h) => esit(h, k.icerikOzeti));
    if (dayanak) ok(`[${i}] damga bir muhre dayaniyor`);
    else kotu(`[${i}] damga DAYANAKSIZ — hicbir muhrun halkasina baglanmiyor`);
    const tsr = path.join(kok, 'damgalar', `${ad}.tsr`);
    if (fs.existsSync(tsr)) ok(`[${i}] damga jetonu var (damgalar/${ad}.tsr)`);
    else kotu(`[${i}] damga jetonu EKSIK: damgalar/${ad}.tsr`);
  }
}

console.log(satirlar.join('\n'));
console.log('');
console.log(hata === 0
  ? `SONUC: zincir saglam (${kayitlar.length} kayit).`
  : `SONUC: ${hata} bulgu var.`);
console.log('NOT: Bu betik zaman damgasinin KENDISINI dogrulamaz.');
console.log('     openssl ts -verify -data muhurler/<zaman>.txt -in damgalar/<zaman>.tsr -CAfile <ca.pem>');
process.exit(hata === 0 ? 0 : 1);
