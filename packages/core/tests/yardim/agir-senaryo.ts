import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';
import type { FormatProfili } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import { sayfalaIkiSutun, type CiftGirdi } from '@storyboard/core/format/iki-sutun';

/**
 * AĞIR TESTLERİN ORTAK FİKSTÜRÜ — gerçekçi senaryo üreteci.
 *
 * NEDEN üreteç, elle yazılmış bir dosya değil: ağır testler 1000 sayfaya
 * kadar çıkıyor ve elle yazılmış bir fikstür ya çok küçük kalır ya depoya
 * megabaytlarca metin sokar. NEDEN tohumlu (deterministik): ölçüm ancak
 * girdi her koşuda AYNI ise karşılaştırılabilir; `Math.random()` ile bir
 * gerileme "bugün yavaş çıktı" diye açıklanır ve kaçırılır.
 *
 * NEDEN gerçekçi (kelime havuzu, sahne/aksiyon/diyalog dönüşümü): `'x'`
 * tekrarı sarma yolunun yalnız bir dalını yürütür (kelime sınırı hiç
 * denenmez), oysa sayfa sayısını belirleyen şey tam olarak o daldır.
 */

/** Tohumlu üreteç — `Math.random()` ölçümü karşılaştırılamaz kılardı. */
function rastgele(tohum: number): () => number {
  let s = tohum >>> 0;
  return () => {
    /* xorshift32: kısa, bağımlılıksız, tohumlanabilir. */
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

const MEKANLAR = [
  'ESKİ APARTMAN - KORİDOR', 'MUTFAK', 'SOKAK', 'OTOBÜS DURAĞI', 'HASTANE - BEKLEME',
  'ÇATI KATI', 'ARABA - İÇİ', 'DENİZ KIYISI', 'OKUL BAHÇESİ', 'MEYHANE',
  'İSTASYON - PERON', 'TERZİ DÜKKÂNI', 'BODRUM', 'PARK - BANK', 'FABRİKA - MONTAJ HATTI',
];
const ZAMANLAR = ['GECE', 'GÜNDÜZ', 'ŞAFAK VAKTİ', 'AKŞAMÜSTÜ', 'SABAH'];
const KISILER = ['AYŞE', 'KEMAL', 'NURTEN', 'SELİM', 'HACER', 'ORHAN', 'ZEYNEP'];
const PARANTEZLER = ['(fısıltıyla)', '(kendi kendine)', '(gülerek)', '(duraksar)', '(bağırarak)'];
const GECISLER = ['KES:', 'KARARMA:', 'AÇILMA:'];

const AKSIYON_SOZLERI = [
  'kapı', 'ampul', 'perde', 'gölge', 'yağmur', 'duvar', 'masa', 'sandalye', 'pencere',
  'titrer', 'kayar', 'durur', 'bekler', 'uzanır', 'çekilir', 'dönerek', 'yavaşça',
  'nemden', 'kabarmış', 'ıslak', 'boş', 'karanlık', 'uzun', 'sessiz', 'ağır',
  'bir', 'iki', 'üç', 'onun', 'bunun', 'içeri', 'dışarı', 'yukarı', 'aşağı',
];
const DIYALOG_SOZLERI = [
  'emin', 'değilim', 'hiç', 'olmadım', 'kimse', 'yok', 'burada', 'bekle', 'gitme',
  'anlamıyorsun', 'söyledim', 'sana', 'bak', 'şimdi', 'değil', 'sonra', 'belki',
  'yarın', 'unut', 'bunu', 'ben', 'sen', 'biz', 'öyle', 'böyle', 'çünkü', 'ama',
];

function cumle(rnd: () => number, havuz: readonly string[], enAz: number, enCok: number): string {
  const n = enAz + Math.floor(rnd() * (enCok - enAz + 1));
  const kelimeler = Array.from({ length: n }, () => havuz[Math.floor(rnd() * havuz.length)]);
  const metin = kelimeler.join(' ');
  return metin.charAt(0).toLocaleUpperCase('tr') + metin.slice(1) + '.';
}

/**
 * Sonsuz bir blok akışı — gerçek senaryo ritminde.
 *
 * Ritim sabit değil, tohuma bağlı: sahne başlığı → aksiyon(lar) →
 * karakter/parantez/diyalog turları → geçiş. Sabit bir döngü (her 5 blokta
 * bir sahne) sayfa sonu kurallarının yalnız tek bir hizalanmasını sınardı.
 */
export function* blokAkisi(tohum = 20260827): Generator<ScriptBlock> {
  const rnd = rastgele(tohum);
  let i = 0;
  const yeni = (type: ScriptBlockType, text: string, sahne: number): ScriptBlock => ({
    id: `sb_${i++}`, fp: '', type, text, scene: String(sahne), sceneId: `sc_${sahne}`,
  });

  for (let sahne = 1; ; sahne++) {
    const ic = rnd() < 0.6 ? 'İÇ.' : 'DIŞ.';
    yield yeni(
      'scene',
      `${ic} ${MEKANLAR[Math.floor(rnd() * MEKANLAR.length)]} - ${ZAMANLAR[Math.floor(rnd() * ZAMANLAR.length)]}`,
      sahne,
    );

    const aksiyon = 1 + Math.floor(rnd() * 3);
    for (let a = 0; a < aksiyon; a++) {
      yield yeni('action', cumle(rnd, AKSIYON_SOZLERI, 6, 34), sahne);
    }

    const replik = 1 + Math.floor(rnd() * 5);
    for (let r = 0; r < replik; r++) {
      yield yeni('character', KISILER[Math.floor(rnd() * KISILER.length)], sahne);
      if (rnd() < 0.3) {
        yield yeni('parenthetical', PARANTEZLER[Math.floor(rnd() * PARANTEZLER.length)], sahne);
      }
      yield yeni('dialogue', cumle(rnd, DIYALOG_SOZLERI, 3, 26), sahne);
      if (rnd() < 0.35) yield yeni('action', cumle(rnd, AKSIYON_SOZLERI, 5, 20), sahne);
    }

    if (rnd() < 0.4) yield yeni('transition', GECISLER[Math.floor(rnd() * GECISLER.length)], sahne);
  }
}

/** İlk `n` blok — akışın sonlu dilimi. */
export function bloklar(n: number, tohum?: number): ScriptBlock[] {
  const cikti: ScriptBlock[] = [];
  for (const b of blokAkisi(tohum)) {
    cikti.push(b);
    if (cikti.length >= n) break;
  }
  return cikti;
}

/**
 * TAM `hedef` sayfa tutan senaryo.
 *
 * Blok blok büyütülüp sayfa sayısı hedefi AŞTIĞI anda son blok atılıyor —
 * yani sonuç hem gerçekçi hem birebir hedefte. Sabit bir blok sayısı
 * verilseydi sayfa sayısı tohuma göre kayardı ve "10 sayfa" iddiası
 * ölçülemezdi.
 */
export function sayfayaGoreBloklar(hedef: number, profil: FormatProfili, tohum?: number): ScriptBlock[] {
  const cikti: ScriptBlock[] = [];
  for (const b of blokAkisi(tohum)) {
    cikti.push(b);
    /* Sayfa sayısı ancak blok eklendikçe artar; her adımda tam sayfalama
       yapmak 10 sayfada ucuz, 1000 sayfada değil — o yüzden bu fonksiyon
       yalnız KÜÇÜK hedefler için. */
    if (sayfala(cikti, profil).length > hedef) {
      cikti.pop();
      break;
    }
  }
  return cikti;
}

/* ------------------------------------------------------------------ */
/* Fransız (iki sütun)                                                 */
/* ------------------------------------------------------------------ */

/** Aynı akıştan iki sütunlu girdi — blok tipleri AYNI (§6.6). */
export function ikiSutunGirdileri(n: number, tohum?: number): CiftGirdi[] {
  return bloklar(n, tohum).map((b) => ({ id: b.id, tip: b.type, metin: b.text }));
}

export function sayfayaGoreGirdiler(hedef: number, profil: FormatProfili, tohum?: number): CiftGirdi[] {
  const cikti: CiftGirdi[] = [];
  for (const b of blokAkisi(tohum)) {
    cikti.push({ id: b.id, tip: b.type, metin: b.text });
    if (sayfalaIkiSutun(cikti, profil).length > hedef) {
      cikti.pop();
      break;
    }
  }
  return cikti;
}
