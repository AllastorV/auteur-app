import { parseFountain, type ScriptBlock, type ScriptBlockType } from '../model/script';

/**
 * Fountain dışa aktarımı.
 *
 * ## Kendi kendini doğrulayan yazım
 *
 * Fountain tipleri BİÇİMDEN çıkarır (büyük harf, boş satır, `INT.` ön eki) ve
 * bu çıkarım kayıplıdır: sonunda diyalog olmayan bir karakter satırı geri
 * okunduğunda aksiyon olur, `KES` gibi bir replik geçişe dönüşür. Zorlama
 * işaretleri (`.` `@` `>` `!`) bunu keser ama HEPSİNİ işaretlemek okunmaz,
 * insan eliyle düzenlenemez bir dosya üretir — Fountain'ın bütün varlık
 * sebebi düz metin olarak okunabilmesidir.
 *
 * Çözüm: deyimsel Fountain yaz, SONRA kendi ayrıştırıcımızla geri oku ve
 * yalnız tipi TUTMAYAN blokları zorla işaretle. Yuvarlanabilirlik iddia
 * edilmez, ÖLÇÜLÜR.
 */

/** Zorlama işaretleri — ayrıştırıcının tanıdığı ön ekler. */
const ZORLA: Partial<Record<ScriptBlockType, string>> = {
  scene: '.',
  character: '@',
  transition: '>',
  action: '!',
};

/** Bir bloğun tek başına metin karşılığı. */
function satir(b: ScriptBlock, zorlaIsaret: boolean): string {
  const metin = b.text.normalize('NFC').trim();
  const on = zorlaIsaret ? (ZORLA[b.type] ?? '') : '';
  return on + metin;
}

/** Blok tipinden ÖNCE boş satır gerekir mi (Fountain'ın blok ayıracı). */
function oncesiBos(tip: ScriptBlockType): boolean {
  /* Diyalog ve parantezik karakterin HEMEN ALTINDA olmak zorunda: araya boş
     satır girerse ayrıştırıcı diyalog akışını keser ve replik aksiyona
     dönüşür. */
  return tip !== 'dialogue' && tip !== 'parenthetical';
}

function yaz(bloklar: readonly ScriptBlock[], zorlananlar: ReadonlySet<number>): string {
  const parcalar: string[] = [];
  bloklar.forEach((b, i) => {
    if (i > 0 && oncesiBos(b.type)) parcalar.push('');
    parcalar.push(satir(b, zorlananlar.has(i)));
  });
  return parcalar.join('\n') + '\n';
}

export interface FountainCiktisi {
  metin: string;
  /** Zorlama işareti eklenen blokların sırası — kaç blok deyimsel yazılamadı. */
  zorlananlar: number[];
  /** Zorlamaya rağmen tipi tutmayan bloklar. Boş olmak ZORUNDA. */
  tutmayan: { indeks: number; beklenen: ScriptBlockType; okunan: ScriptBlockType | null }[];
}

export function fountainYaz(bloklar: readonly ScriptBlock[]): FountainCiktisi {
  const zorlananlar = new Set<number>();

  /* İki geçiş yeter: ilk geçiş deyimsel yazımın nerede tutmadığını bulur,
     ikinci geçiş o blokları zorlar. Üçüncü bir geçiş gerekmez çünkü zorlama
     işareti ayrıştırıcıda KOŞULSUZ kazanır. Yine de sonuç doğrulanıyor —
     "gerekmez" bir varsayımdır, `tutmayan` onu ölçer. */
  for (let gecis = 0; gecis < 2; gecis++) {
    const metin = yaz(bloklar, zorlananlar);
    const okunan = parseFountain(metin);
    let degisti = false;
    for (let i = 0; i < bloklar.length; i++) {
      if (okunan[i]?.type !== bloklar[i].type && !zorlananlar.has(i)) {
        zorlananlar.add(i);
        degisti = true;
      }
    }
    if (!degisti) break;
  }

  const metin = yaz(bloklar, zorlananlar);
  const okunan = parseFountain(metin);
  const tutmayan: FountainCiktisi['tutmayan'] = [];
  for (let i = 0; i < bloklar.length; i++) {
    if (okunan[i]?.type !== bloklar[i].type) {
      tutmayan.push({ indeks: i, beklenen: bloklar[i].type, okunan: okunan[i]?.type ?? null });
    }
  }

  return { metin, zorlananlar: [...zorlananlar].sort((a, b) => a - b), tutmayan };
}
