import * as Y from 'yjs';
import { metaMap } from '../doc/schema';
import { kurtar, type KurtarmaSonucu } from './kurtarma';

/**
 * Anlık görüntü (çıpa) ve kuşak halkası — §15.2'nin 2. ve 3. katmanı.
 *
 * ## Neden ayrı bir çıpa dosyası var
 *
 * Kullanıcıya dönük kayıt biçimi bir ZIP paketidir (`packProject`). Günlüğün
 * çıpası O OLAMAZ: `loadProjectIntoDoc` her çalıştığında YENİ Yjs kimlikleri
 * üretir. A oturumunda kaydedilmiş güncellemeler, B oturumunda paketten
 * yeniden kurulan belgeye uygulanınca yerine geçmez — BİRLEŞİR. Kullanıcı
 * metnini çift görür ve bunu hiçbir hata bildirmez.
 *
 * Bu yüzden 1. katmanın çıpası Yjs-doğal baytlardır
 * (`Y.encodeStateAsUpdate`). ZIP paketi kontrol noktası ve dışa aktarım
 * biçimi olarak kalır; ikisi farklı işler yapar.
 *
 * ## Yazma sırası SÖZLEŞMEDİR
 *
 * Önce çıpa (atomik `rename`), SONRA günlük kesilir. Ters sırada, ikisinin
 * arasında çökme kesilen günlüğü çıpasız bırakır — o aralıktaki bütün iş
 * gider. Bu sırayla çökme yalnızca zaten çıpada olan güncellemelerin günlükte
 * de kalmasına yol açar; Yjs güncellemeleri idempotenttir, oynatma aynı
 * sonucu verir.
 */

/** Halkadaki tek bir aday kayıt. `oku` tembeldir: bozuk dosya okunmaya kadar açılmaz. */
export interface AdayKayit {
  id: string;
  oku: () => Uint8Array;
}

export interface KayitElemesi {
  id: string;
  sebep: 'okunamadi' | 'cozumlenemedi' | 'projesiz' | 'baska-proje';
}

export interface YuklemeSonucu {
  doc: Y.Doc | null;
  /** Kullanılan adayın kimliği. `null` ise hiçbiri sağlam değildi. */
  kullanilan: string | null;
  /** Denenip elenen adaylar, sırasıyla. Kullanıcıya GÖSTERİLİR (§15.4). */
  elenen: KayitElemesi[];
}

/**
 * Bir Yjs anlık görüntüsünün gerçekten bir PROJE taşıyıp taşımadığı.
 *
 * Yalnız "çözümlenebiliyor mu" diye sormak yetmez: sıfır uzunluklu ya da
 * yarım yazılmış bir dosya çoğu zaman sorunsuz çözümlenir ve BOŞ bir belge
 * verir. Boş belge geçerli sayılırsa kuşak halkası hiç geri düşmez —
 * kullanıcı boş bir projeyle karşılaşır ve sağlam yedeği hiç denenmemiş olur.
 */
function projeTasiyorMu(doc: Y.Doc): boolean {
  const id = metaMap(doc).get('id');
  return typeof id === 'string' && id.length > 0;
}

/**
 * Çıpa BU projeye mi ait?
 *
 * `projeTasiyorMu` yalnız kimliğin VAR olduğuna bakıyordu; hangi proje
 * olduğuna değil. Aynı günlük dizinini paylaşan iki farklı Yjs soyu (aynı
 * `projeId` altında `replaceProject` yeni bir doküman kurar) yan yana
 * durabiliyordu ve `Y.applyUpdate` yabancı soyda FIRLATMIYOR — bekleyen yapı
 * olarak saklıyor ya da köke iliştiriyor. Yani `uygulanamayan` sayacı bu
 * durumu hiç görmüyordu: kullanıcıya "0 uygulanamadı" diye yeşil rapor
 * veriliyordu, oysa belge çiftlenmişti.
 */
export function ayniProje(doc: Y.Doc, projeId: string | undefined): boolean {
  if (!projeId) return true; // Kıyaslanacak kimlik yoksa eleme yapılmaz.
  return metaMap(doc).get('id') === projeId;
}

/**
 * Kuşak halkasında ilk SAĞLAM kaydı bulur (§15.5, "kuşak halkası bozuk
 * kayıtta geri düşüyor").
 *
 * Adaylar yeniden eskiye sıralı verilir. En yeni bozuksa bir öncekine
 * düşülür; elenenler sessizce yutulmaz, çağırana döndürülür.
 */
export function ilkSaglamKayit(
  adaylar: readonly AdayKayit[],
  projeId?: string,
): YuklemeSonucu {
  const elenen: KayitElemesi[] = [];
  for (const aday of adaylar) {
    let bayt: Uint8Array;
    try {
      bayt = aday.oku();
    } catch {
      elenen.push({ id: aday.id, sebep: 'okunamadi' });
      continue;
    }
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, bayt, 'yukleme');
    } catch {
      doc.destroy();
      elenen.push({ id: aday.id, sebep: 'cozumlenemedi' });
      continue;
    }
    if (!projeTasiyorMu(doc)) {
      doc.destroy();
      elenen.push({ id: aday.id, sebep: 'projesiz' });
      continue;
    }
    /* BAŞKA projenin çıpası elenir. Kabul edilseydi Yjs onu çakıştırmaz,
       BİRLEŞTİRİRDİ — kullanıcı metnini çift görür ve hiçbir hata çıkmazdı. */
    if (!ayniProje(doc, projeId)) {
      doc.destroy();
      elenen.push({ id: aday.id, sebep: 'baska-proje' });
      continue;
    }
    return { doc, kullanilan: aday.id, elenen };
  }
  return { doc: null, kullanilan: null, elenen };
}

export interface OturumKurtarma extends KurtarmaSonucu {
  /** Çıpa olarak kullanılan kayıt; `null` ise günlük tek başına oynatıldı. */
  cipa: string | null;
  elenen: KayitElemesi[];
}

/**
 * Açılış yolu: kuşak halkasından çıpayı seç, üstüne günlüğü oynat.
 *
 * Çıpa hiç bulunamazsa günlük TEK BAŞINA oynatılır — bu bir gerileme değil:
 * günlük belgenin doğumundan itibaren tutulduğunda tam durumu zaten taşır.
 * "Çıpa yok, o hâlde iş yok" demek, en çok işin bulunduğu durumda (hiç anlık
 * görüntü alınamadan çökme) her şeyi atmak olurdu.
 */
export function oturumuKurtar(
  adaylar: readonly AdayKayit[],
  gunluk: Uint8Array,
  projeId?: string,
  /**
   * Seçilen çıpanın DEPODAKİ varlık baytları ve özgün öğe kimlikleri —
   * kabuk çıpayı varlıksız verdiğinde doldurulur. Geri koymayı `kurtar`
   * günlükten SONRA yapar; nedeni orada (yarış + dirilme, tarama bulgusu 1).
   */
  varliklarIcin?: (cipaId: string) => {
    varliklar: Record<string, string>;
    ogeler?: Record<string, readonly number[]>;
  } | undefined,
): OturumKurtarma {
  const secim = ilkSaglamKayit(adaylar, projeId);
  const cipaBaytlari = secim.doc ? Y.encodeStateAsUpdate(secim.doc) : null;
  secim.doc?.destroy();
  const parcalar = secim.kullanilan ? varliklarIcin?.(secim.kullanilan) : undefined;
  const sonuc = kurtar(cipaBaytlari, gunluk, parcalar?.varliklar, parcalar?.ogeler);
  return { ...sonuc, cipa: secim.kullanilan, elenen: secim.elenen };
}
