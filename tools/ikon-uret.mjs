/**
 * Mizansen ikonlarını üretir: uygulama ikonu ve .mzn belge ikonu.
 *
 * İşaret (kullanıcı seçimi, 2026-08-27, "V6"): karoya SIĞMAYAN bir A.
 * Harfin bacakları alttan taşıyor, yalnız apeksi ve çubuğu görünüyor —
 * kadraja sığmayan şey fikri işaretin kendisinde. Ad Auteur olunca ilk
 * turun "çizgili kart" işareti anlamsız kalmıştı.
 *
 * Taşma, kenar payı bırakmayarak DEĞİL, karonun kendi kenarıyla KESİLEREK
 * yapılıyor: pay bırakılsaydı harf yalnızca büyük görünürdü, sığmıyor
 * görünmezdi.
 *
 * Bağımlılık YOK: çizim elle, PNG `node:zlib` ile yazılıyor. Kenar
 * yumuşatma 4 kat büyük çizip küçülterek elde ediliyor.
 *
 *   node tools/ikon-uret.mjs
 */
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BOY = 512; // çıktı kenarı
const K = 4; // süperörnekleme katsayısı
const N = BOY * K;

const SIYAH = [0x10, 0x10, 0x13, 255];
const ACIK = [0xe9, 0xe5, 0xdf, 255];
/* Kabuğun kendi amberi. İlk turdaki parlak turuncu programın hiçbir
   yerinde geçmiyordu; ikon markanın rengini taşımalı. */
const AMBER = [0xe0, 0x93, 0x2f, 255];
/* Dosya sayfası BEYAZ DEĞİL (kullanıcı kararı): koyu gri kâğıt, amber
   harfin altında zemin olarak duruyor ve uygulama karosuyla karışmıyor. */
const SAYFA = [0x26, 0x29, 0x2e, 255];
const KIVRIM = [0x3a, 0x3e, 0x45, 255];

const bosTuval = () => new Uint8Array(N * N * 4);

function koy(buf, x, y, renk) {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 4;
  buf[i] = renk[0];
  buf[i + 1] = renk[1];
  buf[i + 2] = renk[2];
  buf[i + 3] = renk[3];
}

/** Köşeleri yuvarlatılmış dikdörtgen — koordinatlar 512 ölçeğinde. */
function kutu(buf, x0, y0, x1, y1, r, renk, maske) {
  const a = x0 * K;
  const b = y0 * K;
  const c = x1 * K;
  const d = y1 * K;
  const rr = r * K;
  for (let y = Math.floor(b); y < Math.ceil(d); y++) {
    for (let x = Math.floor(a); x < Math.ceil(c); x++) {
      const dx = x < a + rr ? a + rr - x : x > c - rr ? x - (c - rr) : 0;
      const dy = y < b + rr ? b + rr - y : y > d - rr ? y - (d - rr) : 0;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (maske && !maske(x, y)) continue;
      koy(buf, x, y, renk);
    }
  }
}

/**
 * Çokgen doldurma — çift/tek kuralıyla, kenarları süperörnekleme
 * yumuşatıyor. Harfin gövdesi düz kenarlardan oluştuğu için bir yol
 * çözümleyicisine gerek yok; köşe listesi yeterli.
 */
function cokgen(buf, noktalar, renk, maske) {
  const n = noktalar.map(([x, y]) => [x * K, y * K]);
  let enSol = Infinity;
  let enSag = -Infinity;
  let enUst = Infinity;
  let enAlt = -Infinity;
  for (const [x, y] of n) {
    if (x < enSol) enSol = x;
    if (x > enSag) enSag = x;
    if (y < enUst) enUst = y;
    if (y > enAlt) enAlt = y;
  }
  for (let y = Math.max(0, Math.floor(enUst)); y < Math.min(N, Math.ceil(enAlt)); y++) {
    for (let x = Math.max(0, Math.floor(enSol)); x < Math.min(N, Math.ceil(enSag)); x++) {
      let icinde = false;
      for (let i = 0, j = n.length - 1; i < n.length; j = i++) {
        const [xi, yi] = n[i];
        const [xj, yj] = n[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) icinde = !icinde;
      }
      if (!icinde) continue;
      if (maske && !maske(x, y)) continue;
      koy(buf, x, y, renk);
    }
  }
}

/** Yuvarlatılmış karonun içinde miyiz — taşan harfi kesen sınır. */
function karoMaskesi(x0, y0, x1, y1, r) {
  const [a, b, c, d, rr] = [x0 * K, y0 * K, x1 * K, y1 * K, r * K];
  return (x, y) => {
    if (x < a || y < b || x >= c || y >= d) return false;
    const dx = x < a + rr ? a + rr - x : x > c - rr ? x - (c - rr) : 0;
    const dy = y < b + rr ? b + rr - y : y > d - rr ? y - (d - rr) : 0;
    return dx * dx + dy * dy <= rr * rr;
  };
}

/** Yuvarlak uçlu yatay çizgi. */
const cizgi = (buf, x0, x1, y, kalinlik, renk) =>
  kutu(buf, x0, y - kalinlik / 2, x1, y + kalinlik / 2, kalinlik / 2, renk);

/**
 * Taşan A — köşeler 64'lük tasarım ızgarasından 512'ye ölçekleniyor.
 *
 * Apeks ortada, bacaklar dışarı açılıp alt kenarı GEÇİYOR; kesme işini
 * çağıranın verdiği maske yapıyor. Çubuk ayrı çiziliyor çünkü harften
 * farklı renkte: gövde amber, çubuk açık — harf iki elden çıkıyor.
 */
function tasanA(buf, ol, kaydir, maske) {
  const [dx, dy] = kaydir;
  const nk = ([x, y]) => [x * ol + dx, y * ol + dy];
  cokgen(
    buf,
    [[32, 6], [56, 64], [42.6, 64], [32, 36.4], [21.4, 64], [8, 64]].map(nk),
    AMBER,
    maske,
  );
  const [cx0, cy] = nk([22, 47]);
  const [cx1] = nk([42, 47]);
  kutu(buf, cx0, cy - 2.2 * ol, cx1, cy + 2.2 * ol, 2.2 * ol, ACIK, maske);
}

/**
 * Küçültme — kenar yumuşatma buradan geliyor.
 *
 * Hedef boyut parametreli: ikon 16 pikselde okunuyor mu sorusu ancak
 * GERÇEKTEN 16 piksele indirilerek yanıtlanır, 512'lik çizime bakarak
 * değil. Alfa ağırlıklı ortalama alınıyor — düz ortalama, saydam kenarda
 * siyaha çalan bir hale bırakır.
 */
function kucult(buf, cikBoy = BOY) {
  const F = N / cikBoy; // kaç kaynak piksel bir çıktı pikseline düşüyor
  const cik = new Uint8Array(cikBoy * cikBoy * 4);
  for (let y = 0; y < cikBoy; y++) {
    for (let x = 0; x < cikBoy; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < F; j++) {
        for (let i = 0; i < F; i++) {
          const p = (y * F + j) * N * 4 + (x * F + i) * 4;
          const al = buf[p + 3] / 255;
          r += buf[p] * al;
          g += buf[p + 1] * al;
          b += buf[p + 2] * al;
          a += buf[p + 3];
        }
      }
      const n = F * F;
      const o = (y * cikBoy + x) * 4;
      const ort = a / n / 255;
      cik[o] = ort ? Math.round(r / n / ort) : 0;
      cik[o + 1] = ort ? Math.round(g / n / ort) : 0;
      cik[o + 2] = ort ? Math.round(b / n / ort) : 0;
      cik[o + 3] = Math.round(a / n);
    }
  }
  return cik;
}

/* ------------------------------ PNG ------------------------------ */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const bayt of buf) c = CRC[(c ^ bayt) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function parca(tur, veri) {
  const uz = Buffer.alloc(4);
  uz.writeUInt32BE(veri.length);
  const govde = Buffer.concat([Buffer.from(tur, 'ascii'), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(govde));
  return Buffer.concat([uz, govde, crc]);
}

function png(rgba, boy = BOY) {
  const satirBayt = boy * 4;
  const ham = Buffer.alloc((satirBayt + 1) * boy);
  const kaynak = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  for (let y = 0; y < boy; y++) {
    ham[y * (satirBayt + 1)] = 0;
    kaynak.copy(ham, y * (satirBayt + 1) + 1, y * satirBayt, (y + 1) * satirBayt);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(boy, 0);
  ihdr.writeUInt32BE(boy, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', zlib.deflateSync(ham, { level: 9 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------- ikonlar --------------------------- */

function uygulamaIkonu(ham = false) {
  const buf = bosTuval();
  const OL = BOY / 64; // tasarım ızgarası 64, çıktı 512
  kutu(buf, 0, 0, BOY, BOY, 14 * OL, SIYAH);
  tasanA(buf, OL, [0, 0], karoMaskesi(0, 0, BOY, BOY, 14 * OL));
  return ham ? buf : kucult(buf);
}

function belgeIkonu(ham = false) {
  const buf = bosTuval();
  const OL = BOY / 64;
  const ol = ([x, y]) => [x * OL, y * OL];

  /* Sayfa TEK ÇOKGEN: gövde ve sağ üstteki pah aynı köşe listesinde.
     Önceki hâl yuvarlatılmış dikdörtgeni maskeyle kesiyordu ve maske
     köşegeni kaçırıp gövdeyi basamaklı bırakıyordu — kesiği tanımlayan
     şey zaten köşeler, ara bir maskeye gerek yok. */
  const SAYFA_KOSE = [[10, 5], [38, 5], [51, 18], [51, 62], [10, 62]];
  cokgen(buf, SAYFA_KOSE.map(ol), SAYFA);

  /* Harf sayfanın alt kenarını da geçiyor — karodakiyle aynı fikir. */
  const icerde = (x, y) =>
    x >= 10 * OL * K && x < 51 * OL * K && y >= 5 * OL * K && y < 62 * OL * K;
  /* Yatay ortalama HESAPLANIYOR, göz kararı değil: sayfa 10–51 arası,
     ortası 30,5; harfin apeksi kendi ızgarasında 32'de ve 0,78 ölçekte
     24,96'ya düşüyor. Kaydırma ikisinin farkı. */
  const OLCEK = 0.78;
  const dx = 30.5 - 32 * OLCEK;
  tasanA(buf, OL * OLCEK, [dx * OL, 16 * OL], icerde);

  /* Kıvrılan kapak EN ÜSTTE: harf oraya taşarsa altında kalmalı. */
  cokgen(buf, [[38, 5], [51, 18], [38, 18]].map(ol), KIVRIM);

  return ham ? buf : kucult(buf);
}

/**
 * Kontrol tabakası — iki ikon, Windows'un gerçekten kullandığı boyutlarda.
 *
 * Görev çubuğu 16-24, masaüstü 32-48, "büyük simgeler" 96-256. Karar bu
 * satırda verilir: 512'lik çizimde güzel duran bir detay 16'da lekeye
 * dönebiliyor.
 */
/* Yalnız iç çözünürlüğü (2048) TAM BÖLEN boyutlar: 48 ve 24 kesirli bir
   küçültme oranı verir, örnekleme kayar ve ikon çöpe döner. Windows 48'i
   96 ya da 32'den kendisi türetiyor. */
const TABAKA_BOYLARI = [256, 128, 64, 32, 16];

function tabaka() {
  const bosluk = 22;
  const enBuyuk = TABAKA_BOYLARI[0];
  const satirYuk = enBuyuk + bosluk * 2;
  const gen = TABAKA_BOYLARI.reduce((t, b) => t + b + bosluk, bosluk);
  const yuk = satirYuk * 2;
  const tuval = new Uint8Array(gen * yuk * 4);
  /* Zemin ikonun HİÇBİR tonuna yakın olmamalı. İlk hâli koyu griydi ve
     dosya sayfasının kıvrım tonuna (#3a3e45) neredeyse eşitti — kapak
     zeminle kaynaşıp sayfa kesik görünüyordu, yani tabaka olmayan bir
     hatayı gösteriyordu. */
  for (let i = 0; i < gen * yuk; i++) {
    tuval[i * 4] = 0x8b;
    tuval[i * 4 + 1] = 0x8f;
    tuval[i * 4 + 2] = 0x95;
    tuval[i * 4 + 3] = 255;
  }

  const yapistir = (kaynak, kb, sx, sy) => {
    for (let y = 0; y < kb; y++) {
      for (let x = 0; x < kb; x++) {
        const k = (y * kb + x) * 4;
        const al = kaynak[k + 3] / 255;
        if (al === 0) continue;
        const h = ((sy + y) * gen + sx + x) * 4;
        for (let c = 0; c < 3; c++) {
          tuval[h + c] = Math.round(kaynak[k + c] * al + tuval[h + c] * (1 - al));
        }
      }
    }
  };

  const cizimler = [uygulamaIkonu(true), belgeIkonu(true)];
  cizimler.forEach((ham, satir) => {
    let x = bosluk;
    for (const b of TABAKA_BOYLARI) {
      const kucuk = kucult(ham, b);
      /* Alt hizalı: farklı boyutlar aynı taban çizgisinde dursun. */
      yapistir(kucuk, b, x, satir * satirYuk + bosluk + (enBuyuk - b));
      x += b + bosluk;
    }
  });

  return { veri: tuval, gen, yuk };
}


/**
 * ICO üretimi — Windows'ta dosya ikonu için ZORUNLU.
 *
 * PNG yetmiyor: Explorer dosya türü ikonunu `.ico` bekliyor ve
 * electron-builder `fileAssociations.icon` alanında Windows için ICO
 * istiyor. PNG verilirse ilişkilendirme sessizce ikonsuz kalır — bu
 * oturumda kullanıcının gördüğü sorun tam olarak buydu.
 *
 * Biçim: 6 baytlık başlık + boy başına 16 baytlık dizin girdisi + gövdeler.
 * Gövdeler PNG olarak gömülüyor (Vista+ destekliyor); BMP kodlaması
 * yazmak, aynı sonucu üretmek için yüzlerce satır daha demek olurdu.
 */
function ico(ham) {
  /* Boyutlar büyükten küçüğe: Explorer ilk uyanı seçiyor. 256 dizinde 0
     ile gösteriliyor (tek bayt, 256 sığmıyor).

     YALNIZ 2048'i TAM BÖLEN boylar: 48 gibi kesirli bir oran örneklemeyi
     kaydırıyor ve ikon boşa çıkıyor (bu oturumda yan afişte ölçüldü —
     164 px istendi, BMP tamamen zemin rengi çıktı). Aynı tuzak `--tabaka`
     yorumunda da yazılı. */
  const boylar = [256, 128, 64, 32, 16];
  const govdeler = boylar.map((b) => png(kucult(ham, b), b));
  const baslik = Buffer.alloc(6);
  baslik.writeUInt16LE(0, 0);      // ayrılmış
  baslik.writeUInt16LE(1, 2);      // tür: 1 = ikon
  baslik.writeUInt16LE(boylar.length, 4);

  let ofset = 6 + boylar.length * 16;
  const dizin = boylar.map((b, i) => {
    const g = Buffer.alloc(16);
    g[0] = b >= 256 ? 0 : b;       // genişlik
    g[1] = b >= 256 ? 0 : b;       // yükseklik
    g[2] = 0;                      // palet yok
    g[3] = 0;                      // ayrılmış
    g.writeUInt16LE(1, 4);         // renk düzlemi
    g.writeUInt16LE(32, 6);        // bit/piksel
    g.writeUInt32LE(govdeler[i].length, 8);
    g.writeUInt32LE(ofset, 12);
    ofset += govdeler[i].length;
    return g;
  });
  return Buffer.concat([baslik, ...dizin, ...govdeler]);
}


/**
 * BMP üretimi — NSIS kurulum sihirbazının görselleri.
 *
 * NSIS yalnız BMP kabul ediyor (PNG/ICO değil) ve alfa kanalını yok
 * sayıyor, o yüzden zemin DÜZ renk olarak basılıyor — saydam bırakılsaydı
 * sihirbazın gri zemini üstünden görünürdü.
 *
 * 24-bit, alttan üste satır sırası (BMP'nin kendi sırası), satırlar 4
 * baytın katına yastıklanıyor — biçimin zorunlu kuralı.
 */
function bmp(rgba, gen, yuk, zemin = [0x11, 0x13, 0x17]) {
  const satirBayt = Math.ceil((gen * 3) / 4) * 4;
  const govde = Buffer.alloc(satirBayt * yuk);
  for (let y = 0; y < yuk; y++) {
    for (let x = 0; x < gen; x++) {
      const k = (y * gen + x) * 4;
      const a = rgba[k + 3] / 255;
      /* Alfa DÜZ zeminle karıştırılıyor; BMP saydamlık taşımıyor. */
      const kar = (i) => Math.round(rgba[k + i] * a + zemin[i] * (1 - a));
      /* BMP satırları ALTTAN üste ve renk sırası BGR. */
      const h = (yuk - 1 - y) * satirBayt + x * 3;
      govde[h] = kar(2);
      govde[h + 1] = kar(1);
      govde[h + 2] = kar(0);
    }
  }
  const baslik = Buffer.alloc(54);
  baslik.write('BM', 0);
  baslik.writeUInt32LE(54 + govde.length, 2);
  baslik.writeUInt32LE(54, 10);
  baslik.writeUInt32LE(40, 14);
  baslik.writeInt32LE(gen, 18);
  baslik.writeInt32LE(yuk, 22);
  baslik.writeUInt16LE(1, 26);
  baslik.writeUInt16LE(24, 28);
  baslik.writeUInt32LE(govde.length, 34);
  return Buffer.concat([baslik, govde]);
}

/**
 * Kurulum görselini çizer: koyu zemin, ortada uygulama işareti.
 *
 * İşaret ORANTILI ölçekleniyor: dikey afişte (164×314) ikon genişliğe
 * göre küçültülüp dikeyde ortalanıyor. Germek, karonun içindeki A'yı
 * bozardı — o işaretin bütün değeri oranında.
 */
function kurulumGorseli(gen, yuk) {
  /* İşaret boyu 2048'i TAM BÖLEN en büyük değer: kesirli oran örneklemeyi
     kaydırıp ikonu boşa çıkarıyor (ölçüldü). Kalan boşluk zeminle
     doluyor — germektense ortalamak doğru, karonun içindeki A'nın bütün
     değeri oranında. */
  const sinir = Math.min(gen, yuk) * 0.72;
  const kenar = [256, 128, 64, 32, 16].find((b) => b <= sinir) ?? 16;
  const ikon = kucult(uygulamaIkonu(true), kenar);
  const tuval = new Uint8Array(gen * yuk * 4); // saydam; bmp() zemini basacak
  const dx = Math.floor((gen - kenar) / 2);
  const dy = Math.floor((yuk - kenar) / 2);
  for (let y = 0; y < kenar; y++) {
    for (let x = 0; x < kenar; x++) {
      const k = (y * kenar + x) * 4;
      const h = ((y + dy) * gen + (x + dx)) * 4;
      for (let c = 0; c < 4; c++) tuval[h + c] = ikon[k + c];
    }
  }
  return bmp(tuval, gen, yuk);
}

function tabakaPng() {
  const { veri, gen, yuk } = tabaka();
  const satirBayt = gen * 4;
  const ham = Buffer.alloc((satirBayt + 1) * yuk);
  const kaynak = Buffer.from(veri.buffer, veri.byteOffset, veri.length);
  for (let y = 0; y < yuk; y++) {
    ham[y * (satirBayt + 1)] = 0;
    kaynak.copy(ham, y * (satirBayt + 1) + 1, y * satirBayt, (y + 1) * satirBayt);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(gen, 0);
  ihdr.writeUInt32BE(yuk, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', zlib.deflateSync(ham, { level: 9 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

const tabakaYolu = process.argv.indexOf('--tabaka');
if (tabakaYolu !== -1) {
  const cikti = process.argv[tabakaYolu + 1] ?? 'ikon-tabaka.png';
  writeFileSync(cikti, tabakaPng());
  console.log(`${cikti} yazıldı — ikonlar 256'dan 16'ya.`);
} else {
  const uygulama = uygulamaIkonu(true);
  const belge = belgeIkonu(true);
  writeFileSync('apps/desktop/build/icon.png', png(kucult(uygulama)));
  writeFileSync('apps/desktop/build/dosya.png', png(kucult(belge)));
  /* ICO'lar Windows için: exe simgesi ve DOSYA TÜRÜ simgesi. PNG yalnız
     macOS/Linux'ta yeterli. */
  writeFileSync('apps/desktop/build/icon.ico', ico(uygulama));
  writeFileSync('apps/desktop/build/dosya.ico', ico(belge));
  /* NSIS sihirbazı: yan afiş (164×314) ve başlık şeridi (150×57). */
  writeFileSync('apps/desktop/build/kurulum-yan.bmp', kurulumGorseli(164, 314));
  writeFileSync('apps/desktop/build/kurulum-ust.bmp', kurulumGorseli(150, 57));
  console.log('icon/dosya (png+ico) ve kurulum BMP’leri yazıldı (build/).');
}
