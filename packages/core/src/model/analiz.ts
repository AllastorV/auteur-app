import { matchesFolded, type ScriptBlock } from './script';
import { metinSayaclari } from '../format/ekran';
import { sahneBasligiAyristir, type ZamanAnahtar } from '../format/terim';
import type { DilAdi } from '../format/profil';
import { VARSAYILAN_KATMAN, type ZamanKatmani } from './zaman-katmani';

/**
 * Dramaturjik analiz — F4.
 *
 * Saf: senaryo bloklarından sahne ve karakter istatistiği üretir. Grafik
 * çizmez, DOM bilmez.
 *
 * ## Ölçü SATIR değil SAYFA
 *
 * Sahne uzunluğunu blok sayısıyla ölçmek yanıltır: on kısa diyalog satırı,
 * tek uzun aksiyon paragrafından kısa sürer. Sayfa ölçüsü §6.2'nin
 * "1 sayfa ≈ 1 dakika" sözleşmesine bağlı ve zaten motorun ürettiği sayı —
 * ikinci bir hesap yok (Karar 34).
 */

export interface SahneIstatistigi {
  sceneId: string;
  baslik: string;
  /** Senaryodaki sırası (0'dan). Grafikten sahneye gitmenin anahtarı. */
  sira: number;
  /** Sahnenin ilk bloğunun kimliği — tıklamada oraya gidilir. */
  ilkBlokId: string;
  kelime: number;
  /** Kaç satır diyalog, kaç satır aksiyon. Ritmin en ham ölçüsü. */
  diyalogSatir: number;
  aksiyonSatir: number;
  /** Sahnede konuşan karakterler, konuşma sırasına göre. */
  karakterler: string[];
  /** Sahnenin senaryo içindeki payı (0-1). Sayfa ölçüsünün yerine geçer. */
  pay: number;
  /**
   * Başlıktan AYRIŞTIRILMIŞ mekân adı, büyük harfe getirilmiş.
   *
   * Başlıksız sahnede `''`. Boş bırakılıyor, "(başlıksız)" YAZILMIYOR:
   * o bir arayüz metnidir ve motorun ürettiği veriye karışırsa dile de
   * bağımlı olurdu.
   */
  yer: string;
  /** İç mekân mı — başlıktan. Başlık yoksa/tanınmıyorsa `undefined`. */
  ic?: boolean;
  /** Günün saati — başlıktan. Yazılmamışsa `undefined`. */
  zaman?: ZamanAnahtar;
  /** Anlatı düzlemi — ETİKETTEN gelir, başlıktan çıkarılmaz. */
  katman: ZamanKatmani;
  /** Sahnenin hikâye (olay) sırası. Etiketlenmemişse `null`. */
  hikayeSirasi: number | null;
}

/** Bir mekânın senaryodaki ağırlığı — kaç kez × ne kadar yer. */
export interface MekanIstatistigi {
  yer: string;
  sahneSayisi: number;
  kelime: number;
  /** Senaryonun ne kadarı (0-1). */
  pay: number;
  /** Geçtiği sahnelerin sırası — şeritte işaretlemek için. */
  sahneler: number[];
}

/**
 * İki karakterin paylaştığı sahneler.
 *
 * "Birlikte bulunma" burada KONUŞMAK demek: sahne başlığı kimin sessizce
 * odada durduğunu kodlamıyor, elimizdeki tek kesin sinyal replik. Bunu
 * "aynı sahnede" diye adlandırmak veriyi olduğundan güçlü gösterirdi.
 */
export interface CiftIstatistigi {
  a: string;
  b: string;
  ortak: number;
  sahneler: number[];
}

export interface KarakterIstatistigi {
  ad: string;
  /** Kaç replik. Bir karakterin "ne kadar var olduğu"nun ilk ölçüsü. */
  replik: number;
  kelime: number;
  /** Göründüğü sahnelerin sırası — dağılım grafiği bunun üstüne kurulur. */
  sahneler: number[];
  /** İlk ve son görünüşü; arada kaybolan karakter dramaturjik bir sorudur. */
  ilkSahne: number;
  sonSahne: number;
  /**
   * Replik başına MEDYAN kelime — karakterin sesi.
   *
   * Ortalama değil medyan: tek bir uzun tirat ortalamayı yukarı çeker ve
   * üç kelimeyle konuşan bir karakteri konuşkan gösterirdi. Medyan o tiratı
   * bir veri noktası olarak sayar, ağırlık vermez.
   */
  replikMedyan: number;
  /** Toplam repliğin içindeki payı (0-1). */
  replikPayi: number;
}

export interface SenaryoAnalizi {
  sahneler: SahneIstatistigi[];
  karakterler: KarakterIstatistigi[];
  toplamKelime: number;
  /** İÇ./DIŞ. dağılımı — mekân ritmi. */
  icSahne: number;
  disSahne: number;
  /** Mekânlar, ağırlığa göre azalan. */
  mekanlar: MekanIstatistigi[];
  /**
   * Günün saati dağılımı. `bilinmiyor` AYRI sayılıyor: zaman yazılmamış
   * sahneyi gündüze saymak, olmayan bir bilgiyi uydurmak olurdu.
   */
  zamanDagilimi: Record<ZamanAnahtar | 'bilinmiyor', number>;
  /**
   * Ardışık gece sahnelerinin oluşturduğu küme sayısı.
   *
   * Prodüksiyon ölçüsü: 12 gece sahnesi dağınıksa 12 gece çekimi, kümeliyse
   * 4. Sayı değil DAĞILIM pahalıdır.
   */
  geceKumeleri: number;
  /** Anlatı düzlemi dağılımı — etiketlenmemiş senaryo tümüyle `simdi`. */
  katmanDagilimi: Record<ZamanKatmani, number>;
  /** Konuşan karakter çiftleri, paylaşılan sahneye göre azalan. */
  ciftler: CiftIstatistigi[];
  /**
   * Hiç aynı sahnede konuşmamış çiftler. Ad sırasına göre kararlı —
   * liste her çizimde aynı sırada olmalı.
   */
  hicKarsilasmayan: readonly (readonly [string, string])[];
}

/** Motorun dışarıdan aldığı, blokta OLMAYAN bilgiler. */
export interface CozumlemeSecenekleri {
  /** Sahne başlığını ayrıştırmak için belge dili. Varsayılan `'tr'`. */
  dil?: DilAdi;
  /** `sceneId` → anlatı düzlemi etiketi. Verilmeyen sahne `simdi` sayılır. */
  katmanlar?: Readonly<Record<string, ZamanKatmani>>;
  /** `sceneId` → hikâye sırası. Verilmeyen sahne `null`. */
  hikayeSiralari?: Readonly<Record<string, number>>;
}

/**
 * Karakter adını normalleştirir.
 *
 * `AYŞE (V.O.)` ile `AYŞE` AYNI karakter: ek, karakterin kim olduğunu değil
 * sesinin nereden geldiğini söyler. Ayrı sayılsalardı en çok konuşan
 * karakter listesi ikiye bölünür ve dağılım grafiği yalan söylerdi.
 */
export function karakterAdi(metin: string): string {
  return metin
    .normalize('NFC')
    /* `+` İLE YIĞILMIŞ EKLER: `AYŞE (V.O.) (CONT'D)` gerçek senaryolarda
       yaygın (aynı sahnede sesle devam eden karakter) ve tek geçişli bir
       `replace` yalnız SON eki soyup `AYŞE (V.O.)`de bırakırdı — aynı
       karakter analiz panosunda ikiye bölünürdü. */
    .replace(/(\s*\([^)]*\))+$/u, '')
    .replace(/^@/, '')
    .trim();
}

/**
 * Sahne başlığı iç mekân mı — §6.2 terimleri.
 *
 * Katlama `matchesFolded` ile: `tr` yerelinde `INT.` → `ınt.` olur (I → ı) ve
 * tek katlama İngilizce başlıkları kaçırırdı. Kural tek evde (`model/script`),
 * burada yalnız KULLANILIYOR.
 */
const IC_MEKAN = /^(int|iç|ic)[.\s/]/;
function icMekan(baslik: string): boolean {
  return matchesFolded(IC_MEKAN, baslik);
}

/**
 * Senaryoyu çözümler.
 *
 * Sahne sınırı `sceneId` ile çiziliyor, `type === 'scene'` ile değil:
 * başlıksız açılış sahnesi de bir sahnedir ve tipe bakan bir bölme onu
 * bir önceki sahneye yapıştırırdı (ya da hiç saymazdı).
 */
export function senaryoyuCozumle(
  bloklar: readonly ScriptBlock[],
  secenekler: CozumlemeSecenekleri = {},
): SenaryoAnalizi {
  const dil = secenekler.dil ?? 'tr';
  const katmanlar = secenekler.katmanlar ?? {};
  const hikayeSiralari = secenekler.hikayeSiralari ?? {};

  const sahneler: SahneIstatistigi[] = [];
  const karakterHarita = new Map<string, KarakterIstatistigi>();
  /* Replik uzunlukları AYRI tutuluyor: medyan için bütün değerler gerekli,
     toplamdan geri hesaplanamaz. */
  const replikBoylari = new Map<string, number[]>();

  let acik: SahneIstatistigi | null = null;
  let sonKarakter: string | null = null;
  let toplamKelime = 0;

  for (const blok of bloklar) {
    const sceneId = blok.sceneId || '';
    if (!acik || acik.sceneId !== sceneId) {
      acik = {
        sceneId,
        baslik: blok.type === 'scene' ? blok.text : '',
        sira: sahneler.length,
        ilkBlokId: blok.id,
        kelime: 0,
        diyalogSatir: 0,
        aksiyonSatir: 0,
        karakterler: [],
        pay: 0,
        yer: '',
        katman: katmanlar[sceneId] ?? VARSAYILAN_KATMAN,
        hikayeSirasi: hikayeSiralari[sceneId] ?? null,
      };
      sahneler.push(acik);
      sonKarakter = null;
    }
    if (blok.type === 'scene' && !acik.baslik) acik.baslik = blok.text;

    const kelime = metinSayaclari(blok.text).kelime;
    acik.kelime += kelime;
    toplamKelime += kelime;

    if (blok.type === 'dialogue') acik.diyalogSatir++;
    if (blok.type === 'action') acik.aksiyonSatir++;

    if (blok.type === 'character') {
      const ad = karakterAdi(blok.text);
      if (ad) {
        sonKarakter = ad;
        if (!acik.karakterler.includes(ad)) acik.karakterler.push(ad);
        const kayit = karakterHarita.get(ad) ?? {
          ad, replik: 0, kelime: 0, sahneler: [], ilkSahne: acik.sira, sonSahne: acik.sira,
          replikMedyan: 0, replikPayi: 0,
        };
        kayit.replik++;
        if (!kayit.sahneler.includes(acik.sira)) kayit.sahneler.push(acik.sira);
        kayit.ilkSahne = Math.min(kayit.ilkSahne, acik.sira);
        kayit.sonSahne = Math.max(kayit.sonSahne, acik.sira);
        karakterHarita.set(ad, kayit);
      }
    }

    /* Diyalog kelimeleri KONUŞANA yazılıyor: karakter satırının kendisi
       (adın kendisi) sayılsaydı çok adı geçen bir figüran, az konuşan bir
       başroldan fazla "konuşmuş" görünürdü. */
    if (blok.type === 'dialogue' && sonKarakter) {
      const k = karakterHarita.get(sonKarakter);
      if (k) k.kelime += kelime;
      const boylar = replikBoylari.get(sonKarakter) ?? [];
      boylar.push(kelime);
      replikBoylari.set(sonKarakter, boylar);
    }
  }

  const toplam = sahneler.reduce((t, s) => t + s.kelime, 0);
  for (const s of sahneler) {
    /* Boş senaryoda pay SIFIR — bölme yapılmıyor. `0/0` NaN üretir ve grafik
       sessizce çizilmez hâle gelirdi. */
    s.pay = toplam > 0 ? s.kelime / toplam : 0;

    /* Başlık AYRIŞTIRILIYOR, ikinci bir ayrıştırıcı yazılmıyor (Karar 2):
       `format/terim.ts` aynı işi editörde ve dışa aktarımda da yapıyor. */
    if (s.baslik) {
      const p = sahneBasligiAyristir(s.baslik, dil);
      s.yer = p.yer.toLocaleUpperCase(dil).trim();
      if (p.mekan) s.ic = p.mekan === 'ic';
      if (p.zaman) s.zaman = p.zaman;
    }
  }

  /* ---------------- mekânlar ---------------- */
  const mekanHarita = new Map<string, MekanIstatistigi>();
  for (const s of sahneler) {
    const m = mekanHarita.get(s.yer) ?? { yer: s.yer, sahneSayisi: 0, kelime: 0, pay: 0, sahneler: [] };
    m.sahneSayisi++;
    m.kelime += s.kelime;
    m.sahneler.push(s.sira);
    mekanHarita.set(s.yer, m);
  }
  const mekanlar = [...mekanHarita.values()]
    .map((m) => ({ ...m, pay: toplam > 0 ? m.kelime / toplam : 0 }))
    /* Ağırlığa göre; eşitlikte ada göre — sıra kararlı olmalı. */
    .sort((a, b) => b.kelime - a.kelime || a.yer.localeCompare(b.yer, dil));

  /* ---------------- zaman ve gece kümeleri ---------------- */
  const zamanDagilimi: Record<ZamanAnahtar | 'bilinmiyor', number> = {
    gunduz: 0, gece: 0, safak: 0, aksam: 0, bilinmiyor: 0,
  };
  for (const s of sahneler) zamanDagilimi[s.zaman ?? 'bilinmiyor']++;

  let geceKumeleri = 0;
  let geceAcik = false;
  for (const s of sahneler) {
    const gece = s.zaman === 'gece';
    if (gece && !geceAcik) geceKumeleri++;
    geceAcik = gece;
  }

  /* ---------------- katman ---------------- */
  const katmanDagilimi: Record<ZamanKatmani, number> = { simdi: 0, geri: 0, ileri: 0, hayal: 0 };
  for (const s of sahneler) katmanDagilimi[s.katman]++;

  /* ---------------- çiftler ---------------- */
  const ciftHarita = new Map<string, CiftIstatistigi>();
  for (const s of sahneler) {
    const k = [...s.karakterler].sort((a, b) => a.localeCompare(b, dil));
    for (let i = 0; i < k.length; i++) {
      for (let j = i + 1; j < k.length; j++) {
        const anahtar = k[i] + ' ' + k[j];
        const c = ciftHarita.get(anahtar) ?? { a: k[i], b: k[j], ortak: 0, sahneler: [] };
        c.ortak++;
        c.sahneler.push(s.sira);
        ciftHarita.set(anahtar, c);
      }
    }
  }
  const ciftler = [...ciftHarita.values()].sort(
    (x, y) => y.ortak - x.ortak || x.a.localeCompare(y.a, dil) || x.b.localeCompare(y.b, dil),
  );

  /* Hiç karşılaşmayanlar: konuşan HER karakter çifti taranıyor, çünkü
     "yokluk" ancak bütün olasılıklar bilinerek söylenebilir. */
  const adlar = [...karakterHarita.keys()].sort((a, b) => a.localeCompare(b, dil));
  const hicKarsilasmayan: (readonly [string, string])[] = [];
  for (let i = 0; i < adlar.length; i++) {
    for (let j = i + 1; j < adlar.length; j++) {
      if (!ciftHarita.has(adlar[i] + ' ' + adlar[j])) {
        hicKarsilasmayan.push([adlar[i], adlar[j]] as const);
      }
    }
  }

  /* ---------------- replik medyanı ve payı ---------------- */
  const toplamReplik = [...karakterHarita.values()].reduce((t, k) => t + k.replik, 0);
  for (const k of karakterHarita.values()) {
    k.replikMedyan = medyan(replikBoylari.get(k.ad) ?? []);
    k.replikPayi = toplamReplik > 0 ? k.replik / toplamReplik : 0;
  }

  return {
    sahneler,
    mekanlar,
    zamanDagilimi,
    geceKumeleri,
    katmanDagilimi,
    ciftler,
    hicKarsilasmayan,
    /* Sıralama REPLİĞE göre: kelime sayısı uzun tiratı olan bir yan karakteri
       öne çıkarır, oysa "kim ne kadar var" sorusunun ilk cevabı kaç kez
       konuştuğudur. Eşitlikte ad — sıra kararlı olmalı, yoksa liste her
       çizimde oynardı. */
    karakterler: [...karakterHarita.values()].sort(
      (a, b) => b.replik - a.replik || a.ad.localeCompare(b.ad, 'tr'),
    ),
    toplamKelime,
    icSahne: sahneler.filter((s) => s.baslik && icMekan(s.baslik)).length,
    disSahne: sahneler.filter((s) => s.baslik && !icMekan(s.baslik)).length,
  };
}

/**
 * Medyan — sıralı dizinin ortası, çift sayıda değerde iki ortancanın
 * ortalaması. Boş dizide `0`: ölçülecek replik yoksa uzunluk da yoktur.
 */
function medyan(degerler: readonly number[]): number {
  if (degerler.length === 0) return 0;
  const s = [...degerler].sort((a, b) => a - b);
  const orta = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[orta] : (s[orta - 1] + s[orta]) / 2;
}

/**
 * Bir karakterin sahne dağılımındaki en uzun BOŞLUK.
 *
 * Dramaturjik soru: "başrol on sahne boyunca kayboluyor mu?" Sayı sahne
 * cinsinden ve karakter hiç yoksa `0`.
 */
export function enUzunYokluk(k: KarakterIstatistigi): number {
  let enUzun = 0;
  for (let i = 1; i < k.sahneler.length; i++) {
    enUzun = Math.max(enUzun, k.sahneler[i] - k.sahneler[i - 1] - 1);
  }
  return enUzun;
}
