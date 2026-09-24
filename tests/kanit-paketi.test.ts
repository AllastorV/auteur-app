import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import { kanitPaketiKur } from '@storyboard/core/kanit/paket';
import { muhurle, damgala } from '@storyboard/core/kanit/muhur';
import type { KanitKabugu } from '@storyboard/core/platform/types';
import type { ZincirDurumu, ZincirKaydi } from '@storyboard/core/veri/zincir';

/**
 * KANIT PAKETİ — bağımsız doğrulayıcı GERÇEKTEN koşuyor.
 *
 * `node dogrula.mjs` alt süreçte çalıştırılıyor ve çıkış kodu okunuyor.
 * Doğrulayıcıyı gömülü bir dizge olarak sınamak, yalnız dizgeyi doğrulamak
 * olurdu — bu depoda üç kez yaşanmış "yeşil test, ölü kod" hatası.
 */

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-kanit-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

const METIN_BIR = new TextEncoder().encode('İÇ. MUTFAK - GECE\n\nAyşe masaya oturur.\n');
const METIN_IKI = new TextEncoder().encode('DIŞ. SOKAK - GÜN\n\nYağmur başlar.\n');
const bayt = (h: string) => new Uint8Array(h.match(/../gu)!.map((x) => parseInt(x, 16)));
const granted = (async () =>
  new Response(bayt('30053003020100') as BodyInit, { status: 200 })) as unknown as typeof fetch;

function sahteKabuk() {
  const kayitlar: ZincirKaydi[] = [];
  const metinler = new Map<number, Uint8Array>();
  const jetonlar = new Map<number, Uint8Array>();
  const kabuk: KanitKabugu = {
    async muhurYaz(_p, kayit, metin) { kayitlar.push(kayit); metinler.set(kayit.zaman, metin); },
    async damgaYaz(_p, kayit, jeton) { kayitlar.push(kayit); jetonlar.set(kayit.zaman, jeton); },
    async oku() { return { kayitlar: [...kayitlar], durum: 'tam' as ZincirDurumu }; },
    async muhurMetni(_p, zaman) { return metinler.get(zaman) ?? null; },
    async damgaJetonu(_p, zaman) { return jetonlar.get(zaman) ?? null; },
  };
  return { kabuk, kayitlar };
}

/** İki mühür + bir damga taşıyan gerçek bir zincir kurar. */
async function zincirKur() {
  const { kabuk, kayitlar } = sahteKabuk();
  const dec = new TextDecoder();
  const bir = await muhurle(kabuk, {
    projeId: 'p1', metin: dec.decode(METIN_BIR), yazar: 'Alp Cavas',
    etiket: 'ilk taslak', tetikleyici: 'elle', simdi: () => 1_700_000_000_000,
  });
  await damgala(kabuk, 'p1', bir, {
    getirici: granted, nonce: new Uint8Array([1]), simdi: () => 1_700_000_001_000,
  });
  await muhurle(kabuk, {
    projeId: 'p1', metin: dec.decode(METIN_IKI), yazar: 'Alp Cavas',
    etiket: 'ikinci taslak', tetikleyici: 'surum', simdi: () => 1_700_000_060_000,
  });
  return { kabuk, kayitlar };
}

let sayac = 0;
/** Paketi kurup diske açar; doğrulayıcının koşacağı dizini döner. */
async function paketiAc(): Promise<string> {
  const { kabuk, kayitlar } = await zincirKur();
  const paket = await kanitPaketiKur({ kabuk, projeId: 'p1', projeAdi: 'Bavul', kayitlar });
  const dizin = path.join(kok, `paket-${sayac++}`);
  fs.mkdirSync(dizin, { recursive: true });
  const zip = await JSZip.loadAsync(paket.zip);
  for (const ad of Object.keys(zip.files)) {
    const dosya = zip.files[ad];
    if (dosya.dir) continue;
    const yol = path.join(dizin, ad);
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    fs.writeFileSync(yol, Buffer.from(await dosya.async('uint8array')));
  }
  return dizin;
}

/** `node dogrula.mjs` — çıkış kodu ve çıktı. */
function dogrula(dizin: string): { kod: number; cikti: string } {
  try {
    const cikti = execFileSync(process.execPath, ['dogrula.mjs'], {
      cwd: dizin, encoding: 'utf8',
    });
    return { kod: 0, cikti };
  } catch (e) {
    const hata = e as { status?: number; stdout?: string };
    return { kod: hata.status ?? 1, cikti: hata.stdout ?? '' };
  }
}

describe('paketin içeriği', () => {
  it('beklenen dosyalar var', async () => {
    const dizin = await paketiAc();
    for (const ad of ['OKUBENI.txt', 'zincir.log', 'zincir.json', 'dogrula.mjs']) {
      expect(fs.existsSync(path.join(dizin, ad)), ad).toBe(true);
    }
    expect(fs.existsSync(path.join(dizin, 'muhurler', '1700000000000.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dizin, 'damgalar', '1700000001000.tsr'))).toBe(true);
  });

  /* OKUBENI NE KANITLAMADIĞINI da yazmak zorunda: yalnız "ne kanıtlar"
     yazan bir belge, okuyanı yerel saatin kanıt olduğuna inandırırdı. */
  it('OKUBENI neyi kanıtlamadığını da söylüyor', async () => {
    const dizin = await paketiAc();
    const metin = fs.readFileSync(path.join(dizin, 'OKUBENI.txt'), 'utf8');
    expect(metin).toContain('NE KANITLAMAZ');
    expect(metin).toContain('TARİHİ');
    expect(metin).toContain('openssl ts -verify');
  });

  it('zincir.json türev olduğunu söylüyor', async () => {
    const dizin = await paketiAc();
    expect(fs.readFileSync(path.join(dizin, 'OKUBENI.txt'), 'utf8')).toContain('TÜREVDİR');
  });
});

describe('bağımsız doğrulayıcı — gerçekten koşuyor', () => {
  it('sağlam pakette çıkış kodu 0', async () => {
    const { kod, cikti } = dogrula(await paketiAc());
    expect(cikti).toContain('zincir saglam');
    expect(kod).toBe(0);
  }, 30_000);

  /* Mühürlenen metinde TEK KARAKTER değişince yakalanıyor. */
  it('metin değiştirilince yakalıyor', async () => {
    const dizin = await paketiAc();
    const yol = path.join(dizin, 'muhurler', '1700000000000.txt');
    const metin = fs.readFileSync(yol, 'utf8');
    fs.writeFileSync(yol, metin.replace('Ayşe', 'Ayşa'));
    const { kod, cikti } = dogrula(dizin);
    expect(cikti).toContain('UYUSMUYOR');
    expect(kod).toBe(1);
  }, 30_000);

  /* Zincirden bir kayıt SİLİNİNCE bağ kopuyor — kanıtın asıl özelliği. */
  it('ortadaki kayıt silinince halka kopuyor', async () => {
    const dizin = await paketiAc();
    const ham = fs.readFileSync(path.join(dizin, 'zincir.log'));
    /* İlk çerçeveyi at: başlık(6) + uzunluk(4)+crc(4)+gövde. */
    const uzunluk = ham.readUInt32LE(6);
    const kirpik = Buffer.concat([ham.subarray(0, 6), ham.subarray(6 + 8 + uzunluk)]);
    fs.writeFileSync(path.join(dizin, 'zincir.log'), kirpik);
    const { kod, cikti } = dogrula(dizin);
    expect(cikti).toContain('KOPUK');
    expect(kod).toBe(1);
  }, 30_000);

  it('damga jetonu silinince yakalıyor', async () => {
    const dizin = await paketiAc();
    fs.rmSync(path.join(dizin, 'damgalar', '1700000001000.tsr'));
    const { kod, cikti } = dogrula(dizin);
    expect(cikti).toContain('EKSIK');
    expect(kod).toBe(1);
  }, 30_000);

  /* Zincirdeki bir kaydın ZAMANINI değiştirmek de bağı kopardığı için
     yakalanıyor: halka kaydın bütün alanlarını kapsıyor. */
  it('kayıt zamanı kurcalanınca yakalıyor', async () => {
    const dizin = await paketiAc();
    const yol = path.join(dizin, 'zincir.log');
    const ham = fs.readFileSync(yol);
    /* İlk kaydın gövdesi 6+8'de başlıyor; ilk 8 bayt zaman (f64 LE). */
    ham.writeDoubleLE(1_600_000_000_000, 6 + 8);
    fs.writeFileSync(yol, ham);
    const { kod, cikti } = dogrula(dizin);
    /* CRC de düşüyor: kurcalama iki ayrı kapıdan birden yakalanıyor. */
    expect(cikti).toMatch(/bozuk|KOPUK/u);
    expect(kod).toBe(1);
  }, 30_000);
});
