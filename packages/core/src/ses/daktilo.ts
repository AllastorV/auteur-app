/**
 * DAKTİLO SESİ — yazarken tuş sesi, açılıp kapanabilir.
 *
 * Ses bir DOSYA DEĞİL, sentezleniyor: Web Audio ile gürültü patlaması +
 * alçak bir "tok" + satır sonunda zil. Gerekçe ladder'ın üçüncü basamağı —
 * platformun kendi özelliği hazır dururken depoya ikili ses dosyası koymak,
 * lisans, boyut ve paketleme derdi getirirdi. Sentez ayrıca her vuruşu
 * hafifçe değiştirebiliyor; tek bir örneklem döngüsü metronom gibi duyulur.
 *
 * SES YALNIZ SENİN TUŞUNDA ÇIKAR. Kaynak `keydown` olayı, belge değişimi
 * değil: ortak çalışmada karşı tarafın yazması ya da geri alma ile gelen
 * değişiklikler ses çıkarmaz. Belge değişimini dinleseydik iki kişilik bir
 * oturum sürekli takırdardı.
 */

const ANAHTAR = 'mizansen.ses.v1';

export type SesTuru = 'tus' | 'satir' | 'sil';

/** `KeyboardEvent`'in yalnız karar için gereken alanları — DOM'suz sınanır. */
export interface TusOlayi {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Odak gerçekten senaryo yüzeyinde mi. */
  senaryoAlaninda: boolean;
}

/**
 * Bu tuş ses çıkarmalı mı, çıkaracaksa hangisini.
 *
 * Ayrı ve saf bir işlev, çünkü asıl iş burada: yanlış kapı bir arama
 * kutusunda ya da kısayol basarken takırdayan bir program demek.
 */
export function tusSesi(olay: TusOlayi): SesTuru | null {
  if (!olay.senaryoAlaninda) return null;
  /* Kısayol yazmak değildir. Alt da dahil: §7 kabuğunun kısayolları Alt'lı. */
  if (olay.ctrlKey || olay.metaKey || olay.altKey) return null;

  if (olay.key === 'Enter') return 'satir';
  if (olay.key === 'Backspace' || olay.key === 'Delete') return 'sil';
  if (olay.key === 'Tab' || olay.key === ' ') return 'tus';

  /* Basılabilir tek karakter — Türkçe harfler dahil. `length === 1` ölçütü
     Shift/Escape/ArrowLeft/F5 gibi ad taşıyan tuşları kendiliğinden eler. */
  return olay.key.length === 1 ? 'tus' : null;
}

/* ----------------------------- tercih ----------------------------- */

/**
 * `localStorage` bazı bağlamlarda ERİŞİLDİĞİ ANDA fırlatır (gizli pencere,
 * site verisi engelli). `format/tercih.ts` ile aynı korumalı erişim.
 */
function depo(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Ses açık mı. Varsayılan KAPALI: davetsiz ses çıkaran bir program,
 * kullanıcının kulaklığında ya da toplantısında ilk izlenimini yakar.
 */
export function sesAcikMi(): boolean {
  try {
    return depo()?.getItem(ANAHTAR) === 'acik';
  } catch {
    /* Okuma da fırlatabilir; ses susar, program değil. */
    return false;
  }
}

export function sesiAyarla(acik: boolean): void {
  try {
    depo()?.setItem(ANAHTAR, acik ? 'acik' : 'kapali');
  } catch {
    /* Yazılamadıysa ayar bu oturumda geçerli, kalıcı değil. Metin değil,
       bir onay kutusu kaybı — §15'in koruduğu şey buraya uğramıyor. */
  }
}

/* ------------------------------ sentez ------------------------------ */

/**
 * SES ÖLÇÜLEREK KURULDU — tahminle değil.
 *
 * Dört gerçek daktilo kaydı ölçüldü (`design/ses/ornekler/`) ve üç şey
 * çıktı; üçü de önceki sentezin neden "sentetik" duyulduğunu açıklıyor:
 *
 *  1. SPEKTRUM NEREDEYSE DÜZ. Gerçek vuruşta 120 Hz – 8 kHz arası ±3 dB
 *     içinde. Önceki sürüm rezonatör yığınıydı ve aralarındaki ÇUKURLARI
 *     kulak hemen "yapay" diye okuyor. Artık gürültü sekiz banda ayrılıp
 *     her bant ölçülen seviyeyle toplanıyor: çukur kalmıyor.
 *  2. SÖNÜM UZUN — −40 dB'ye 364 ms. Öncesi 35–90 ms'ti, yani makine hiç
 *     çınlamıyordu; kütle çınlamasız duyulmaz.
 *  3. ZİNCİRİN SON OLAYI 100 ms'te ve −13 dB. Çubuğun yerine dönüşü.
 *     Önceki sürümde 40–60 ms'te ve neredeyse duyulmazdı — "çalışan
 *     makine" hissi büyük ölçüde o geç olaydan geliyor.
 *
 * Değerler kullanıcının seçtiği varyanttan (yumuşak) ve sertliği giderilmiş
 * hâlinden geliyor: escapement'ın tiz kuyruğu kesildi (kulağı yoran şey
 * oydu), atak yuvarlatıldı, tepe `tanh` ile yumuşatıldı.
 *
 * ÖRNEK DOSYA YOK, hâlâ sentez: kayıtlar yalnız ÖLÇÜLDÜ, hiçbiri pakete
 * girmedi. Lisans ve boyut derdi olmadan ölçülmüş bir sesin faydası burada.
 */

/** Sekiz bant — ölçüm de bu sınırlarla yapıldı. */
const BANT: readonly (readonly [number, number])[] = [
  [40, 120], [120, 250], [250, 500], [500, 1000],
  [1000, 2000], [2000, 4000], [4000, 8000], [8000, 15000],
];

/** Bant başına çınlama süresi — alçak uzun, tiz kısa. */
const T60 = [0.34, 0.30, 0.26, 0.21, 0.17, 0.13, 0.095, 0.055];

/**
 * Bant seviyeleri (dB). Ölçülen hedefe OTURTULMUŞ değerler: üretilen ses
 * yeniden ölçülüp fark eğriye eklendi (beş geçiş). Elle ayarlanmadı.
 */
const EGRI = [-14.48, 1.77, -3.96, -8.62, 7.82, 7.33, 6.21, -24.54];

/** Atak yuvarlaması. 1 = basamak; kulak basamağı "pat" duyar. */
const ATAK_KAT = 7;
/** Escapement tiz kesimi (Hz) — sertliğin ana kaynağı buydu. */
const ESC_TEPE = 5500;
const ESC_SEV = 0.26;
/** `tanh` yumuşatma miktarı: tepeyi yuvarlar, gövdeye dokunmaz. */
const KIRPMA = 0.32;

/**
 * ARKADAN GELEN SES (kullanıcı kararı 2026-08-31: "sesini kıs, programda
 * arkadan gelsin hafifçe, çok dikkat çekmesin"). Yazarken saatlerce
 * duyulacak bir ses öne çıkmamalı — burası tek kapı.
 */
const SES_SEVIYESI = 0.16;

type Suzgec = 'lp' | 'hp' | 'bp';

/** RBJ biquad — tek kademe. Saf: dizi girer, dizi çıkar. */
export function biquad(x: Float32Array, tip: Suzgec, f0: number, Q: number, hiz: number): Float32Array {
  const w0 = (2 * Math.PI * Math.min(f0, hiz * 0.45)) / hiz;
  const cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Q);
  let b0: number, b1: number, b2: number;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  if (tip === 'bp') { b0 = alpha; b1 = 0; b2 = -alpha; }
  else if (tip === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * BANT AĞIRLIKLI DARBE — sentezin omurgası.
 *
 * Geniş bantlı gürültü sekiz banda ayrılıyor, her bant kendi seviyesi ve
 * kendi sönümüyle toplanıyor. Rezonatör SEÇİLMİYOR; ölçülen eğriye doğrudan
 * oturuyor ve "çukur yok" garantisi buradan geliyor.
 */
export function darbe(hiz: number, dbEgri: readonly number[], sureKat: number): Float32Array {
  const n = Math.round(0.5 * hiz);
  const ham = new Float32Array(n);
  for (let i = 0; i < n; i++) ham[i] = Math.random() * 2 - 1;
  const cikti = new Float32Array(n);
  for (let k = 0; k < BANT.length; k++) {
    const [lo, hi] = BANT[k];
    const merkez = Math.sqrt(lo * hi);
    const dal = biquad(ham, 'bp', merkez, Math.max(0.7, merkez / (hi - lo)), hiz);
    const kaz = 10 ** (dbEgri[k] / 20);
    const kk = Math.log(1000) / (T60[k] * sureKat);
    const atak = Math.max(1, hiz * (0.0006 * ATAK_KAT + 0.004 / (1 + k)));
    for (let i = 0; i < n; i++) {
      const zarf = Math.min(1, i / atak) * Math.exp(-kk * (i / hiz));
      if (zarf < 1e-5 && i > atak) break;
      cikti[i] += dal[i] * kaz * zarf;
    }
  }
  return cikti;
}

function ekle(hedef: Float32Array, kaynak: Float32Array, ms: number, hiz: number, kaz = 1): void {
  const off = Math.round((ms / 1000) * hiz);
  for (let i = 0; i < kaynak.length; i++) {
    const j = off + i;
    if (j >= 0 && j < hedef.length) hedef[j] += kaynak[i] * kaz;
  }
}

/** Tepeyi yuvarlar — preamp'ın doğal olarak yaptığı şey. */
function yumusat(x: Float32Array): Float32Array {
  const g = 1 + KIRPMA * 6;
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * g) / g;
  return x;
}

const ESC_EGRI = [-30, -26, -20, -12, -6, -1, 0, -12];
const rastgele = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * TEK VURUŞ. Ölçülen zincir: 0 ms @ 0 dB · 15 ms @ −13 · 19 ms @ −16 ·
 * 100 ms @ −13, artı escapement (arabayı bir karakter ilerleten mandal).
 */
export function tusOrnegi(hiz: number, kayma = 0): Float32Array {
  const n = Math.round(0.6 * hiz);
  const buf = new Float32Array(n);
  const egri = EGRI.map((d) => d + kayma);
  ekle(buf, darbe(hiz, egri, 1), 0, hiz);
  ekle(buf, darbe(hiz, egri.map((d) => d + 4), 0.35), 15, hiz, 10 ** (-13 / 20));
  ekle(buf, darbe(hiz, egri.map((d) => d + 6), 0.25), 19, hiz, 10 ** (-16 / 20));
  ekle(buf, darbe(hiz, egri.map((d, i) => d + (i > 4 ? 3 : -2)), 0.5), 100, hiz, 10 ** (-13 / 20));
  ekle(buf, biquad(biquad(darbe(hiz, ESC_EGRI, 0.10), 'hp', 2200, 0.7, hiz), 'lp', ESC_TEPE, 0.8, hiz),
    rastgele(20, 27), hiz, ESC_SEV);
  return yumusat(buf);
}

/** Silme — aynı makine, daha kısık ve karanlık. */
export function silOrnegi(hiz: number): Float32Array {
  return tusOrnegi(hiz, -4);
}

/**
 * SATIR SONU — zil, arabanın DİŞLİ tırmığı, durdurucuya çarpma.
 * Tırmık süzülmüş gürültü DEĞİL: ayrı ayrı sayılabilen tıklar, çünkü
 * gerçekte öyle. Tek bir tık üretilip kaydırılarak çoğaltılıyor.
 */
export function satirOrnegi(hiz: number): Float32Array {
  const n = Math.round(1.7 * hiz);
  const buf = new Float32Array(n);

  /* SİNÜS YALNIZ BURADA: zil gerçekten perdelidir. Kısmiler inharmonik,
     yoksa org borusu duyulur. */
  const zilT60 = 0.9;
  [1, 2.71, 5.15, 8.4].forEach((r, i) => {
    const f = 1240 * r;
    if (f > hiz * 0.45) return;
    const k = Math.log(1000) / (zilT60 / (1 + i * 0.75));
    const faz = Math.random() * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      const t = j / hiz;
      const g = Math.exp(-k * t);
      if (g < 1e-5) break;
      buf[j] += (Math.sin(2 * Math.PI * f * t + faz) * g) / (1 + i * 1.3) * 0.10;
    }
  });

  const tik = biquad(darbe(hiz, [-28, -22, -14, -7, -2, 0, -2, -9], 0.13), 'hp', 1200, 0.7, hiz);
  const ADET = 26, TIRMIK_MS = 250, BAS = 95;
  for (let i = 0; i < ADET; i++) {
    const u = i / (ADET - 1);
    const hizlanma = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.55;
    ekle(buf, tik, BAS + TIRMIK_MS * u ** 1.22, hiz,
      0.26 * (0.5 + 0.5 * hizlanma) * rastgele(0.7, 1.2));
  }
  const son = BAS + TIRMIK_MS + rastgele(8, 16);
  ekle(buf, darbe(hiz, EGRI.map((d, i) => d + (i < 3 ? 4 : -2)), 1.9), son, hiz, 0.9);
  ekle(buf, biquad(biquad(darbe(hiz, ESC_EGRI, 0.12), 'hp', 2000, 0.7, hiz), 'lp', ESC_TEPE, 0.8, hiz),
    son + rastgele(34, 48), hiz, ESC_SEV * 1.4);
  return yumusat(buf);
}

/* ------------------------------ motor ------------------------------ */


export interface SesMotoru {
  cal(tur: SesTuru): void;
  kapat(): void;
}

/**
 * Ses motoru. `AudioContext` İLK VURUŞTA kuruluyor: tarayıcılar kullanıcı
 * hareketi olmadan ses bağlamını askıya alır.
 *
 * ÖRNEKLER BİR KEZ ÜRETİLİP TAMPONDA TUTULUYOR. Her vuruşta sekiz süzgeç
 * kurmak yazarken ana iş parçacığını yer; sentez bir kez koşuyor, çalmak
 * yalnız bir `BufferSource`. Tuş için DÖRT varyant var: tek örneklem üst
 * üste metronom duyulur, dördü rastgele seçilince duyulmaz.
 */
export function sesMotoru(): SesMotoru {
  let ctx: AudioContext | null = null;
  let ana: GainNode | null = null;
  let tusVar: AudioBuffer[] = [];
  let silVar: AudioBuffer[] = [];
  let satirVar: AudioBuffer | null = null;

  function tampon(c: AudioContext, veri: Float32Array): AudioBuffer {
    const b = c.createBuffer(1, veri.length, c.sampleRate);
    b.getChannelData(0).set(veri);
    return b;
  }

  function bag(): AudioContext | null {
    if (ctx) return ctx;
    const Yapici =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Yapici) return null;
    ctx = new Yapici();
    ana = ctx.createGain();
    ana.gain.value = SES_SEVIYESI;
    ana.connect(ctx.destination);
    const hiz = ctx.sampleRate;
    tusVar = [0, 0, 0, 0].map(() => tampon(ctx!, tusOrnegi(hiz)));
    silVar = [0, 0].map(() => tampon(ctx!, silOrnegi(hiz)));
    satirVar = tampon(ctx, satirOrnegi(hiz));
    return ctx;
  }

  function cal(c: AudioContext, b: AudioBuffer, kaz: number): void {
    const kaynak = c.createBufferSource();
    kaynak.buffer = b;
    /* Hafif perde sapması — aynı dört örneklem bile birebir tekrarlanınca
       makine değil döngü duyulur. */
    kaynak.playbackRate.value = rastgele(0.96, 1.04);
    const g = c.createGain();
    g.gain.value = kaz * rastgele(0.85, 1.15);
    kaynak.connect(g).connect(ana!);
    kaynak.start();
  }

  const sec = <T,>(d: T[]): T => d[(Math.random() * d.length) | 0];

  return {
    cal(tur) {
      const c = bag();
      if (!c) return;
      if (c.state === 'suspended') void c.resume();
      if (tur === 'sil') { cal(c, sec(silVar), 0.7); return; }
      cal(c, sec(tusVar), 1);
      if (tur === 'satir' && satirVar) cal(c, satirVar, 0.9);
    },
    kapat() {
      void ctx?.close();
      ctx = null; ana = null; tusVar = []; silVar = []; satirVar = null;
    },
  };
}
