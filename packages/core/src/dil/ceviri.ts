import type { ScriptBlock } from '../model/script';
import type { DilAdi } from '../format/profil';
import { sahneBasligiAyristir, sahneBasligiBicimle } from '../format/terim';
import { t, tf } from './arayuz';

/**
 * Makine çevirisi — §16.4.
 *
 * ## Karar 23'ün yolundan geçer
 *
 * Çeviri **sayfalamadan ÖNCE** uygulanır ve çevrilmiş bir `ScriptBlock[]`
 * üretir; editör, PDF ve analiz **aynı** bloklarla çalışır. Sayfalamadan
 * sonra çevirmek üç tüketiciyi ayrıştırırdı (`'ŞAFAK VAKTİ'` 11 karakter,
 * `'DAWN'` 4 — satır sayısı, dolayısıyla sayfa sayısı değişir).
 *
 * ## ÇEVİRİ BİR VERİ KAYBI YOLUDUR
 *
 * Bu modülün asıl işi çevirmek değil, **yarım çeviriyi belgeye
 * SOKMAMAKTIR.** Sağlayıcı hatası, kısmi yanıt ya da eksik parça →
 * fırlatılır, çağıran belgeye hiç dokunmaz. "Elde ne varsa onu yaz" yasak.
 */

export interface CeviriSaglayici {
  readonly ad: string;
  /** Tek istekte taşınabilecek azami karakter. */
  readonly azamiKarakter: number;
  /** Tek istekte taşınabilecek azami parça sayısı. */
  readonly azamiParca: number;
  /**
   * Parçaları çevirir. Dönen dizi girdiyle AYNI UZUNLUKTA ve AYNI SIRADA
   * olmak zorundadır; sağlayıcı bunu bozarsa çağıran yakalar.
   */
  cevir(parcalar: readonly string[], hedef: string, kaynak?: string): Promise<string[]>;
}

export interface CeviriSecenekleri {
  hedefDil: string;
  kaynakDil?: string;
  /** Sahne başlığı terimleri için hedef profil dili (İÇ/INT.). */
  hedefProfilDili?: DilAdi;
  kaynakProfilDili?: DilAdi;
  onIlerleme?: (biten: number, toplam: number) => void;
  iptal?: { cancelled: boolean };
}

/**
 * Parçaları sağlayıcının sınırlarına göre böler.
 *
 * İKİ sınır birden uygulanır: karakter VE parça sayısı. Yalnız karakteri
 * saymak, bin tane tek harfli bloğu tek istekte gönderip sağlayıcının parça
 * limitine çarpardı; yalnız parçayı saymak, üç uzun bloğu gönderip karakter
 * limitine çarpardı.
 *
 * Tek başına limiti aşan bir parça KENDİ isteğinde gider — bölmek cümleyi
 * ortadan keser ve çeviriyi bozar. Sağlayıcı reddederse hata yukarı çıkar,
 * sessizce kırpılmaz.
 */
export function parcalaraBol(
  parcalar: readonly string[],
  azamiKarakter: number,
  azamiParca: number,
): string[][] {
  if (azamiKarakter < 1 || azamiParca < 1) {
    throw new Error(`Sağlayıcı sınırları pozitif olmalı: ${azamiKarakter}/${azamiParca}`);
  }
  const gruplar: string[][] = [];
  let grup: string[] = [];
  let uzunluk = 0;

  for (const p of parcalar) {
    const tekBasinaAsiyor = p.length > azamiKarakter;
    /* `tekBasinaAsiyor` burada AYRICA denetlenmez: grup doluyken tek başına
       sınırı aşan bir parça zaten `uzunluk + p.length > azamiKarakter`
       koşulunu sağlar. Mutasyonla ölçüldü — fazladan koşul ölü mantıktı. */
    if (grup.length > 0 && (uzunluk + p.length > azamiKarakter || grup.length >= azamiParca)) {
      gruplar.push(grup);
      grup = [];
      uzunluk = 0;
    }
    grup.push(p);
    uzunluk += p.length;
    if (tekBasinaAsiyor) {
      gruplar.push(grup);
      grup = [];
      uzunluk = 0;
    }
  }
  if (grup.length) gruplar.push(grup);
  return gruplar;
}

/**
 * Sağlayıcıyı çağırır ve yanıtı DOĞRULAR.
 *
 * Uzunluk denetimi bu dosyadaki en kritik satırdır: sağlayıcı 10 parçaya 9
 * yanıt dönerse naif bir eşleme bütün blokları BİR KAYDIRIR ve senaryo
 * makul görünen bir çöpe dönüşür. Hata değil, SESSİZ BOZULMA olurdu.
 */
async function grubuCevir(
  saglayici: CeviriSaglayici,
  grup: readonly string[],
  secenekler: CeviriSecenekleri,
): Promise<string[]> {
  const sonuc = await saglayici.cevir(grup, secenekler.hedefDil, secenekler.kaynakDil);
  if (!Array.isArray(sonuc) || sonuc.length !== grup.length) {
    throw new Error(
      `${saglayici.ad}: ${grup.length} parça gönderildi, ${
        Array.isArray(sonuc) ? sonuc.length : 'dizi olmayan'
      } yanıt geldi. Çeviri uygulanmadı.`,
    );
  }
  for (let i = 0; i < sonuc.length; i++) {
    const s = sonuc[i];
    if (typeof s !== 'string') {
      throw new Error(tf('%s: metin olmayan yanıt geldi. Çeviri uygulanmadı.', saglayici.ad));
    }
    /* Sağlayıcı boş ya da yalnız boşluktan oluşan dizge dönerse uzunluk ve
       tip denetimini geçiyordu ama bloğun metnini SİLİYORDU — kaynak
       satırı hiçbir zaman boş değil (`senaryoyuCevir` boş satırları zaten
       sağlayıcıya göndermiyor). Bu, o blok ÇEVRİLMEMİŞ sayılır: mevcut
       "eksik/biçimsiz yanıt" hata yoluna düşer, belge kirlenmez. */
    if (s.trim() === '' && grup[i].trim() !== '') {
      throw new Error(tf('%s: boş çeviri yanıtı geldi. Çeviri uygulanmadı.', saglayici.ad));
    }
  }
  return sonuc;
}

/** Bir bloğun sağlayıcıya gidecek metni — sahne başlığında yalnız YER kısmı. */
function cevrilecekMetin(blok: ScriptBlock, kaynakDili: DilAdi): string {
  if (blok.type !== 'scene') return blok.text;
  /* Sahne başlığının terimleri (İÇ/DIŞ/GECE) makine çevirisine
     GÖNDERİLMEZ: sağlayıcı `İÇ` için "IN" der ve senaryo formatını bozar.
     Terimler Karar 23'ün tablosundan gelir, yer adı makineden. */
  return sahneBasligiAyristir(blok.text, kaynakDili).yer;
}

/** Çevrilmiş metni bloğa geri yazar — sahne başlığında terimleri tabloya bırakır. */
function metniYerlestir(
  blok: ScriptBlock,
  cevrilen: string,
  kaynakDili: DilAdi,
  hedefDili: DilAdi,
): ScriptBlock {
  if (blok.type !== 'scene') return { ...blok, text: cevrilen };
  const parca = sahneBasligiAyristir(blok.text, kaynakDili);
  return { ...blok, text: sahneBasligiBicimle({ ...parca, yer: cevrilen }, hedefDili) };
}

/**
 * Senaryoyu çevirir. HEPSİ ya da HİÇBİRİ.
 *
 * Boş bloklar sağlayıcıya gönderilmez: kotayı boşa harcar ve kimi sağlayıcı
 * boş girdiye boş olmayan yanıt döner.
 *
 * İptal edilirse fırlatır — yarım sonuç DÖNDÜRMEZ. Yarım bir dizi döndürmek,
 * çağıranın onu belgeye yazmasına ve senaryonun karışık dilde kalmasına yol
 * açardı.
 */
export async function senaryoyuCevir(
  bloklar: readonly ScriptBlock[],
  saglayici: CeviriSaglayici,
  secenekler: CeviriSecenekleri,
): Promise<ScriptBlock[]> {
  const kaynakDili = secenekler.kaynakProfilDili ?? 'tr';
  const hedefDili = secenekler.hedefProfilDili ?? 'en';

  const indeksler: number[] = [];
  const metinler: string[] = [];
  bloklar.forEach((b, i) => {
    const m = cevrilecekMetin(b, kaynakDili);
    if (!m.trim()) return;
    indeksler.push(i);
    metinler.push(m);
  });

  const gruplar = parcalaraBol(metinler, saglayici.azamiKarakter, saglayici.azamiParca);
  const cevrilenler: string[] = [];
  for (const grup of gruplar) {
    if (secenekler.iptal?.cancelled) {
      throw new Error(t('Çeviri iptal edildi. Belgeye dokunulmadı.'));
    }
    cevrilenler.push(...(await grubuCevir(saglayici, grup, secenekler)));
    secenekler.onIlerleme?.(cevrilenler.length, metinler.length);
  }

  /* Son savunma. MUTASYONLA ÖLÇÜLDÜ: bu satır bugün ERİŞİLEMEZ — `grubuCevir`
     her grubu tek tek denetliyor ve `parcalaraBol`'ün hiçbir parçayı
     kaybetmediği ayrıca test ediliyor, dolayısıyla toplam sapamaz.
     Bilerek duruyor: burası bir VERİ KAYBI yolu (§16.4) ve gelecekte
     parçalamaya dokunan biri bu ağı bulmalı. Erişilse DOĞRU davranır
     (durdurur), yani "erişilemez ve yanlış" değil, "erişilemez ve doğru". */
  if (cevrilenler.length !== metinler.length) {
    throw new Error(
      `Çeviri eksik: ${metinler.length} parça gönderildi, ${cevrilenler.length} döndü. ` +
        `Belgeye dokunulmadı.`,
    );
  }

  const sonuc = [...bloklar];
  indeksler.forEach((blokIndeksi, i) => {
    sonuc[blokIndeksi] = metniYerlestir(bloklar[blokIndeksi], cevrilenler[i], kaynakDili, hedefDili);
  });
  return sonuc;
}
