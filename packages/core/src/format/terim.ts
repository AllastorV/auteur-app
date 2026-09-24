import type { DilAdi } from './profil';

export type MekanAnahtar = 'ic' | 'dis';
export type ZamanAnahtar = 'gunduz' | 'gece' | 'safak' | 'aksam';

/**
 * Sahne başlığı ayracı.
 *
 * Kullanıcı kuralı: **neyle başlarsan onunla devam edersin.** Bir başlıkta
 * hem `.` hem `-` olamaz; ayraç baştan sona aynıdır. Türkçede yaygın olan
 * ikisi: `-` ve `/`.
 */
export type SahneAyraci = '-' | '/' | '–' | '—';

/** Ayraç okunamadığında kullanılan. */
export const VARSAYILAN_AYRAC: SahneAyraci = '-';

/**
 * Okunabilen ayraçlar — YAZILANDAN geniş.
 *
 * ÖLÇÜLDÜ (2001: A Space Odyssey, 14 başlık): gerçek senaryolar sahne
 * başlığında UZUN TİRE kullanıyor — `EXT. THE STREAM – THE OTHERS`. Yalnız
 * `-` arasaydık o başlıkların zamanı sessizce ayrıştırılamaz, üstveri
 * kaybolurdu.
 *
 * Okuma esnek, yazma katı: `İÇ.` yazımında verilen kararın aynısı. Yazarın
 * kullandığı ayraç KORUNUYOR — kendi belgesi elinde başka bir şeye
 * dönüşmemeli.
 */
export const OKUNAN_AYRACLAR: readonly SahneAyraci[] = ['-', '/', '–', '—'];

/**
 * Çekim dökümü etiketleri — ARAYÜZ DİLİNE DEĞİL, BELGE DİLİNE bağlı.
 *
 * Karar (2026-08-31): dökümün satırlarındaki İÇ/DIŞ ve zaman zaten
 * `TERIMLER[dil]`den geliyordu; başlıkları arayüz dilinden almak AYNI
 * dosyada iki dil karıştırırdı — İngilizce bir senaryonun dökümünde
 * `INT.` yazan satırın üstünde `İç/Dış` sütun başlığı dururdu. Döküm
 * belgeyle birlikte yolculuk eder: yapımcıya, sanat yönetmenine,
 * oyuncuya. Onu okuyanın Auteur'ü hangi dilde kurduğu bilgi değildir.
 */
export interface DokumEtiketleri {
  sahne: string; baslik: string; icDis: string; mekan: string; zaman: string;
  karakterler: string; sure: string; sureDk: string; dakikaKisa: string;
  ozelEsya: string; kostum: string; efekt: string; notlar: string;
  otomatik: string; elle: string; yok: string;
}

/**
 * Fon/destek başvuru dosyasının türetilmiş bölümlerindeki etiketler.
 *
 * `DokumEtiketleri` ile aynı gerekçe, aynı eksen: bu metinler BELGENİN
 * içine giriyor ve belge kuruma gidiyor. SGM dosyası Türkçe, Eurimages
 * dosyası İngilizce çıkıyor — kullanıcının Auteur'ü hangi dilde kurduğu
 * o dosyada bilgi değil. Arayüz etiketleri ayrı eksende (`t()`).
 */
export interface FonEtiketleri {
  kunye: string; yazar: string; tarih: string; toplamSayfa: string;
  sure: string; sureOlculemez: string;
  sahneListesi: string; neOluyor: string;
  karakterDosyasi: string; replik: string; kelime: string; sahneAraligi: string;
  mekanListesi: string; sahneSayisi: string;
  butceSinyalleri: string; butceUyarisi: string;
  toplamMekan: string; icDisDagilimi: string; geceKumesi: string;
}

export interface TerimTablosu {
  mekan: Record<MekanAnahtar, string>;
  zaman: Record<ZamanAnahtar, string>;
  dokum: DokumEtiketleri;
  fon: FonEtiketleri;
}

/**
 * Terim karşılıkları. Türkçe değerler araştırma raporu §3'ten alınmıştır.
 *
 * DİL BİR FORMAT DEĞİLDİR. Sektörde iki yerleşim vardır (Amerikan, Fransız);
 * "Türk formatı" diye bir şey yoktur. Türkçe burada yalnız bir dil değeridir.
 * Yeni dil eklemek bu tabloya bir satır eklemektir — kod değişmez.
 */
export const TERIMLER: Record<DilAdi, TerimTablosu> = {
  tr: {
    /* NOKTA YOK — kullanıcı düzeltmesi.
       İngilizcede `INT.`/`EXT.` birer KISALTMADIR (interior/exterior) ve
       nokta kısaltmanın işaretidir. Türkçe `İÇ` ve `DIŞ` tam kelimelerdir;
       oraya nokta koymak İngilizce yazım kuralını Türkçeye taşımaktır.
       Üstelik nokta orada bir AYRAÇ gibi okunuyordu ve başlığın gerisi
       `-` ile devam ediyordu — yani aynı başlıkta iki ayrı ayraç. */
    mekan: { ic: 'İÇ', dis: 'DIŞ' },
    zaman: { gunduz: 'GÜN', gece: 'GECE', safak: 'ŞAFAK VAKTİ', aksam: 'AKŞAM' },
    dokum: {
      sahne: 'Sahne', baslik: 'Başlık', icDis: 'İç/Dış', mekan: 'Mekân',
      zaman: 'Zaman', karakterler: 'Karakterler',
      sure: 'Süre tahmini', sureDk: 'Süre tahmini (dk)', dakikaKisa: 'dk',
      ozelEsya: 'Özel eşya', kostum: 'Kostüm', efekt: 'Efekt', notlar: 'Notlar',
      otomatik: 'Otomatik toplanan', elle: 'Elle girilen', yok: 'yok',
    },
    fon: {
      kunye: 'Künye', yazar: 'Yazan', tarih: 'Tarih', toplamSayfa: 'Toplam sayfa',
      sure: 'Süre (tahmini)',
      sureOlculemez: 'Bu belge tipinde sayfa süreyi ölçmez; süre yazılmıyor.',
      sahneListesi: 'Sahne listesi', neOluyor: '[bu sahnede ne oluyor?]',
      karakterDosyasi: 'Karakterler', replik: 'replik', kelime: 'kelime',
      sahneAraligi: 'sahne', mekanListesi: 'Mekânlar', sahneSayisi: 'sahne',
      butceSinyalleri: 'Bütçe sinyalleri',
      butceUyarisi: 'Bu liste bütçe DEĞİLDİR; bütçeyi etkileyen, senaryodan ölçülmüş sinyallerdir.',
      toplamMekan: 'Toplam mekân', icDisDagilimi: 'İç / Dış',
      geceKumesi: 'Gece kümesi',
    },
  },
  en: {
    mekan: { ic: 'INT.', dis: 'EXT.' },
    zaman: { gunduz: 'DAY', gece: 'NIGHT', safak: 'DAWN', aksam: 'DUSK' },
    dokum: {
      sahne: 'Scene', baslik: 'Heading', icDis: 'Int/Ext', mekan: 'Location',
      zaman: 'Time', karakterler: 'Characters',
      sure: 'Estimated time', sureDk: 'Estimated time (min)', dakikaKisa: 'min',
      ozelEsya: 'Props', kostum: 'Costume', efekt: 'Effects', notlar: 'Notes',
      otomatik: 'Collected automatically', elle: 'Entered manually', yok: 'none',
    },
    fon: {
      kunye: 'Project details', yazar: 'Written by', tarih: 'Date',
      toplamSayfa: 'Total pages', sure: 'Running time (estimated)',
      sureOlculemez: 'Pages do not measure time in this document type; no running time is given.',
      sahneListesi: 'Scene list', neOluyor: '[what happens in this scene?]',
      karakterDosyasi: 'Characters', replik: 'lines', kelime: 'words',
      sahneAraligi: 'scenes', mekanListesi: 'Locations', sahneSayisi: 'scenes',
      butceSinyalleri: 'Budget signals',
      butceUyarisi: 'This is NOT a budget; these are measured signals from the script that drive one.',
      toplamMekan: 'Locations in total', icDisDagilimi: 'Int / Ext',
      geceKumesi: 'Night clusters',
    },
  },
};

/**
 * OKUNABİLEN zaman terimleri — YAZILANDAN geniş.
 *
 * ÖLÇÜLDÜ (Küçük Kıyamet, Doğu Yücel — çekilmiş uzun metraj, 83 başlık):
 * Türkçe senaryolar `GÜN` yanında `GÜNDÜZ`, `AKŞAMÜSTÜ`, `SABAH`,
 * `GÜN BATIMI` da yazıyor ve başlık sık sık niteleyiciyle sürüyor
 * (`GECE KARANLIK`). Yalnız yazdığımız dört terimi arasaydık bu
 * başlıkların zamanı sessizce kaybolurdu.
 *
 * Okuma esnek, yazma katı: `İÇ.` ve uzun tire kararlarının aynısı.
 */
export const OKUNAN_ZAMANLAR: readonly [string, ZamanAnahtar][] = [
  ['GÜN BATIMI', 'aksam'],
  ['AKŞAMÜSTÜ', 'aksam'],
  ['AKŞAM', 'aksam'],
  ['ŞAFAK VAKTİ', 'safak'],
  ['ŞAFAK', 'safak'],
  ['SABAH', 'safak'],
  ['GÜNDÜZ', 'gunduz'],
  ['GÜN', 'gunduz'],
  ['GECE', 'gece'],
];

/**
 * Boşlukları TEKİLLEŞTİRİR ve düzeltme işaretlerini kırpar.
 *
 * ÖLÇÜLDÜ: PDF'ten çıkarılan gerçek senaryoda `GÜN BATIMI` arasındaki
 * boşluk KIRILMAZ BOŞLUK (U+00A0) ve bazı başlıklar `*` düzeltme işaretiyle
 * bitiyor (`SALON İÇ GECE*`). İkisi de terim eşleşmesini sessizce
 * düşürüyordu — 83 başlığın 23'ü bu yüzden kaçıyordu.
 *
 * NFC normalizasyonu gibi bu da METİN SINIRINDA yapılan bir iş: içeri
 * girerken bir kez, sonra hep aynı uzayda.
 */
function sadelestir(metin: string): string {
  return metin.replace(/\s+/gu, ' ').replace(/[\s*]+$/u, '').trim();
}

/** Metin bir zaman terimiyle mi başlıyor — niteleyici sürebilir. */
export function zamanOnEki(metin: string, dil: DilAdi): ZamanAnahtar | null {
  const buyuk = buyut(sadelestir(metin), dil);
  const tablo: readonly [string, ZamanAnahtar][] = dil === 'tr'
    ? OKUNAN_ZAMANLAR
    : (Object.entries(TERIMLER.en.zaman).map(([k, v]) => [v, k as ZamanAnahtar]));
  for (const [terim, anahtar] of tablo) {
    const t = buyut(terim, dil);
    if (buyuk === t || buyuk.startsWith(t + ' ')) return anahtar;
  }
  return null;
}

export interface SahneBasligi {
  mekan?: MekanAnahtar;
  yer: string;
  zaman?: ZamanAnahtar;
  /**
   * Başlıkta KULLANILMIŞ ayraç.
   *
   * Ayrıştırma bunu TESPİT EDER, varsaymaz: yazar `/` kullanıyorsa çeviri
   * ya da yeniden biçimleme onu `-`'ye çevirmemeli — kendi yazdığı belge
   * elinde başka bir şeye dönüşmüş olurdu.
   *
   * İSTEĞE BAĞLI: parçaları elle kuran çağıranlar (çeviri testleri, dil
   * çevrimi) ayraçla ilgilenmiyor; verilmezse `VARSAYILAN_AYRAC`.
   */
  ayirac?: SahneAyraci;
}

/** Türkçe'de i -> İ olduğu için dile duyarlı büyütme şart. */
export const buyut = (s: string, dil: DilAdi) => s.toLocaleUpperCase(dil);

/**
 * Satır bir mekân terimiyle mi BAŞLIYOR — ve terim orada BİTİYOR mu?
 *
 * TEK EV. Aynı soruyu `editor/algila.ts` da soruyor ve orada
 * `startsWith(mekan)` yazılıydı; nokta kalkınca `İÇTEN bir gülümseme`
 * sahne başlığı sanıldı. Nokta yalnız bir yazım işareti değil, aynı
 * zamanda SINIR işaretiymiş — o iş şimdi burada, açıkça yapılıyor.
 *
 * Terimden sonra ya metin biter ya da boşluk/ayraç gelir. `İÇERİDE`,
 * `İÇTEN`, `DIŞARIDA` bir sahne başlığı değildir.
 *
 * Dönen `kalan` terim ve onu izleyen ayraç/boşluk kırpılmış gövdedir.
 */
export function mekanOnEki(
  metin: string,
  dil: DilAdi,
): { mekan: MekanAnahtar; kalan: string } | null {
  const buyuk = buyut(metin, dil);
  const t = TERIMLER[dil];
  for (const anahtar of ['ic', 'dis'] as MekanAnahtar[]) {
    const terim = buyut(t.mekan[anahtar], dil);
    /* Terimin sonundaki nokta İSTEĞE BAĞLI okunuyor: `İÇ.` biçiminde
       yazılmış eski belgeler ve İngilizce `INT.` aynı yoldan geçiyor.
       Yazarken artık üretilmiyor ama yazılmış metin YUTULMUYOR. */
    const on = terim.endsWith('.') ? terim.slice(0, -1) : terim;
    if (!buyuk.startsWith(on)) continue;
    /* Nokta KIRPILMADAN önce saklanıyor: Türkçe ayraç koşulu ham kuyruğa
       bakıyor ve nokta da geçerli bir ayraç. Kırpılmış kuyruğa bakmak
       `İÇ. MUTFAK` başlığını reddederdi (ölçüldü). */
    const hamKalan = metin.slice(on.length);
    let kalan = hamKalan;
    if (kalan.startsWith('.')) kalan = kalan.slice(1);
    /* SINIR: terimden sonra ya metin biter ya ayraç/boşluk gelir.
       `İÇERİDE`, `İÇTEN`, `DIŞARIDA` sahne başlığı değildir. */
    if (kalan !== '' && !/^[\s\-/–—.]/.test(kalan)) continue;

    /* TÜRKÇEDE AYRAÇ ŞART. `İÇ` aynı zamanda bir FİİLDİR ("İç şunu") ve
       İngilizcedeki `INT.` gibi güvenli değil: yalnız boşluk istemek,
       karakterin repliği olan `İÇ ŞUNU` satırını sahne başlığına
       çeviriyordu. Program zaten ayraçlı yazıyor (`İÇ - MUTFAK - GECE`) ve
       eski belgeler noktalı (`İÇ. MUTFAK`); ikisi de bu koşulu geçiyor.
       Ayraçsız Türkçe yazım zaten `mekanSonEki` yolundan okunuyor. */
    if (dil === 'tr' && hamKalan !== '' && !/^\s*[-/–—.]/u.test(hamKalan)) continue;

    return { mekan: anahtar, kalan: kalan.replace(/^[\s\-/–—.]+/, '').trim() };
  }
  return null;
}

/**
 * SONDA duran mekân terimi — Türkçe yaygın yazım.
 *
 * ÖLÇÜLDÜ (Küçük Kıyamet, çekilmiş uzun metraj): 83 sahne başlığının
 * 83'ü `MEKÂN İÇ/DIŞ ZAMAN` sırasında ve neredeyse hiçbirinde ayraç yok —
 * `SALON İÇ GÜN`, `EV ÖNÜ DIŞ GÜNDÜZ`, `ORMAN DIŞ GÜN`. Bizim ayrıştırıcı
 * yalnız BAŞTA duran terimi arıyordu ve 83'ün 83'ünü kaçırıyordu; hepsi
 * `character` tipleniyordu, yani içe aktarımda senaryonun bütün yapısı
 * bozuluyordu.
 *
 * Okuma esnek, yazma katı: program bu sırayı YAZMIYOR, ama yazılmış
 * belgeyi anlıyor.
 *
 * YANLIŞ POZİTİF KORUMASI: yalnız tek başına duran `İÇ`/`DIŞ` sözcüğü
 * sayılıyor VE ardından bir ZAMAN terimi gelmek zorunda. `İç şunu` ya da
 * `Dışarıda yağmur` sahne başlığı değildir; zaman koşulu olmadan
 * "içmek" fiili her cümleyi başlığa çevirirdi.
 */
export function mekanSonEki(
  metin: string,
  dil: DilAdi,
): { mekan: MekanAnahtar; yer: string; zaman: ZamanAnahtar } | null {
  if (dil !== 'tr') return null;
  const sade = sadelestir(metin);
  const buyuk = buyut(sade, dil);
  /* Son geçen terim aranıyor: `YOL ARABA İÇ DIŞ GÜN` gibi başlıklarda
     ikisi de var ve zamanı belirleyen SONUNCUSU. */
  const kalip = /(^|\s)(İÇ|DIŞ)(?=\s|$)/gu;
  let son: { anahtar: MekanAnahtar; bas: number; bit: number } | null = null;
  for (const e of buyuk.matchAll(kalip)) {
    const terim = e[2];
    const bas = e.index + e[1].length;
    son = { anahtar: terim === 'İÇ' ? 'ic' : 'dis', bas, bit: bas + terim.length };
  }
  if (!son) return null;

  const kuyruk = sade.slice(son.bit).trim();
  const zaman = zamanOnEki(kuyruk, dil);
  if (zaman === null) return null;

  const yer = sade.slice(0, son.bas).replace(/[\s\-/–—]+$/u, '').trim();
  if (yer === '') return null;
  return { mekan: son.anahtar, yer, zaman };
}

export function sahneBasligiAyristir(metin: string, dil: DilAdi): SahneBasligi {
  // NFC — `sarmala`'daki normalizasyonun kopyasi DEGIL, KARDESI (K-2).
  // NFD girdide `TERIMLER` (hepsi NFC) ile karsilastirma tutmaz ve
  // ayristirma SESSIZCE yanlis sonuc verir. Iki dize de ayni uzayda
  // yasamak zorunda; giris noktasi burasi.
  const ham = metin.normalize('NFC').trim();
  const buyuk = buyut(ham, dil);
  const t = TERIMLER[dil];

  /* Ayraç TESPİT EDİLİYOR: metinde EN SON hangisi geçiyorsa o.
     Varsaymak, `/` ile yazan bir yazarın başlığını sessizce `-`'ye
     çevirmek olurdu.

     SON geçen aranıyor, ilk değil: `INT. / EXT. CAVES – MOONWATCHER`
     gibi başlıklarda `/` mekân teriminin İÇİNDE geçiyor ve zaman ayracı
     ondan sonrakidir. */
  let ayirac: SahneAyraci = VARSAYILAN_AYRAC;
  let enSon = -1;
  for (const a of OKUNAN_AYRACLAR) {
    const k = ham.lastIndexOf(a);
    if (k > enSon) { enSon = k; ayirac = a; }
  }

  const on = mekanOnEki(ham, dil);
  /* ÖNCE baştaki terim (Amerikan türevi, programın yazdığı biçim), SONRA
     sondaki (Türkçe yaygın yazım). Sıra önemli: `İÇ - SALON - GÜN` her
     ikisine de uyar ve öndeki okuma daha bilgilidir. */
  if (!on) {
    const arka = mekanSonEki(ham, dil);
    if (arka) return { mekan: arka.mekan, yer: arka.yer, zaman: arka.zaman, ayirac };
  }
  const mekan = on?.mekan;
  const govde = on?.kalan ?? ham;
  if (mekan === undefined) return { yer: ham, ayirac };

  // Zaman SON ayraçtan sonra aranır; yer adındaki ayraçlar korunur.
  // Karar 11: `konum > 0` — yer adı boş olan başlıkta zaman AYRIŞTIRILMAZ,
  // kalan metin `yer` alanında aynen korunur. Yutmama ilkesi boş `yer`
  // üretmeye ağır basar. Kuyruk karşılaştırması TAM EŞİTLİKTİR:
  // `startsWith` olsaydı boş kuyruk zaman uydururdu.
  let zaman: ZamanAnahtar | undefined;
  let yer = govde;
  const konum = govde.lastIndexOf(ayirac);
  if (konum > 0) {
    /* Kuyruk OKUNAN tabloya karşı sınanıyor, yazdığımız dört terime değil.
       ÖLÇÜLDÜ (2026-08-29): `DIŞ. İSKELE - GÜNDÜZ` ayrıştırılmıyordu —
       `GÜNDÜZ` yazım tablosunda yok, orada `GÜN` var. Zaman sessizce
       kayboluyor ve dahası "GÜNDÜZ" mekân adına yapışıyordu; aynı iskele
       iki ayrı mekân gibi sayılıyordu. `OKUNAN_ZAMANLAR`ın kendi
       açıklaması bu hatayı tarif ediyor, ama bu yol onu kullanmıyordu.

       `zamanOnEki` niteleyiciye de izin veriyor (`GECE KARANLIK`) ve boş
       kuyrukta `null` döndürüyor — eski tam-eşitlik kuralının koruduğu
       "boş kuyruk zaman uydurmasın" güvencesi duruyor. */
    const kuyruk = govde.slice(konum + 1).trim();
    const bulunan = zamanOnEki(kuyruk, dil);
    if (bulunan) {
      zaman = bulunan;
      yer = govde.slice(0, konum).trim();
    }
  }
  return { mekan, yer, zaman, ayirac };
}

/**
 * Başlığı yeniden kurar — TEK AYRAÇ boyunca.
 *
 * Kullanıcı kuralı: neyle başlarsan onunla devam edersin. Önceki hâli
 * `İÇ. MUTFAK - GECE` üretiyordu: nokta ile başlayıp tire ile devam eden,
 * kendi içinde tutarsız bir başlık.
 *
 * İngilizce bundan MUAF: `INT.` bir kısaltmadır, oradaki nokta ayraç
 * değildir ve `INT. KITCHEN - DAY` sektörün yerleşik yazımıdır.
 */
export function sahneBasligiBicimle(parca: SahneBasligi, dil: DilAdi): string {
  if (parca.mekan === undefined) return parca.yer;
  const t = TERIMLER[dil];
  const terim = t.mekan[parca.mekan];
  const ayirac = parca.ayirac ?? VARSAYILAN_AYRAC;
  /* Kısaltma (nokta ile biten) kendi noktasını ayraç olarak kullanır;
     tam kelime ayracı AÇIKÇA yazar. */
  const bas = terim.endsWith('.')
    ? `${terim} ${parca.yer}`
    : `${terim} ${ayirac} ${parca.yer}`;
  return parca.zaman === undefined ? bas : `${bas} ${ayirac} ${t.zaman[parca.zaman]}`;
}
