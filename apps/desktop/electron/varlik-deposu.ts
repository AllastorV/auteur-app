import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { writeFileAtomic } from './atomik';
import { assetsMap } from '@storyboard/core/doc/schema';

/**
 * İçerik adresli varlık deposu ve çıpanın varlık ayrıştırması — §15.2.2'nin
 * DİSK maliyeti.
 *
 * ## Sorun (ölçüldü, `agir-cipa-boyut.test.ts`)
 *
 * Varlıklar belgenin İÇİNDE `dataUrl` olarak duruyor (`assetsMap`) ve çıpa
 * belgenin TAM anlık görüntüsü. Yani halkadaki HER nokta bütün görsellerin
 * bir kopyasını taşıyordu: 50 sayfa + 20 varlık için tek çıpa 5,37 MB, 30
 * günlük halka 354,6 MB — aynı senaryo varlıksız 10,8 MB. Aynı `dataUrl`ün
 * 66 kopyası diskte gerçekten 66 kat yer kaplıyordu.
 *
 * ## Çözüm
 *
 * Belgenin VERİ MODELİ DEĞİŞMEDİ: `assetsMap` olduğu gibi duruyor, varlıklar
 * CRDT içinde akmaya devam ediyor (ortak çalışmada görselin baytları karşı
 * tarafa ancak bu yolla ulaşır). Değişen tek şey ÇIPANIN DİSKE YAZILAN
 * hâli: varlıklar çıpadan çıkarılıp burada bir kez saklanıyor, çıpaya
 * yalnız `varlikId → özet` eşlemesi (birkaç yüz bayt) giriyor.
 *
 * ## Varlıklar çıpadan NASIL çıkarılıyor — ve neden BÖYLE
 *
 * Çıpa baytları geçici bir `Y.Doc`'a uygulanıyor, `assets` anahtarları
 * SİLİNİYOR ve belge yeniden kodlanıyor. Silinen öğeleri Yjs kendi çöp
 * toplayıcısıyla (`doc.gc`, varsayılan açık) `ContentDeleted`'a indiriyor —
 * yani `dataUrl` baytları kodlamadan GERÇEKTEN düşüyor (ölçüm: 5.512.182
 * bayt → 50.308 bayt, varlıksız iskeletin yalnız 276 bayt üstünde).
 *
 * ELENEN ALTERNATİF — kökleri YENİ bir `Y.Doc`'a kopyalamak: kopyalama bütün
 * öğe kimliklerini YENİDEN YAZAR. Çıpadan sonraki günlük çerçeveleri ESKİ
 * kimliklere atıfta bulunduğu için oynatıldıklarında bağlanacak öğeyi
 * bulamaz. Ölçüldü: çıpa + günlük oynatıldığında çıpadan sonraki iş SESSİZCE
 * KAYBOLDU ("YENİ MERHABA DÜNYA" yerine "MERHABA DÜNYA"). §15'in en pahalı
 * hatası tam olarak bu; bu yüzden öğe kimliklerini KORUYAN silme yolu
 * seçildi.
 *
 * ## Budama YOK
 *
 * Depo yalnız BENZERSİZ varlık kadar büyür — kullanıcının gerçekten eklediği
 * içerik kadar, kopya yok. Otomatik silme, hâlâ kullanılan bir görseli silme
 * riski demek; bu fazda yapılmıyor. `toplamBoyut()` yalnız RAPORLAMA için.
 */

/** Depo dizininin adı; proje kimlikleri `prj_*` olduğu için çakışmaz. */
export const VARLIK_DIZINI = 'varliklar';

/** Dosya adı olarak kullanılan özet — YOL SINIRI, elle denetleniyor. */
const OZET_DESENI = /^[0-9a-f]{64}$/;

export interface VarlikDepo {
  readonly dizin: string;
  /** İçeriği yazar (varsa YAZMAZ) ve özetini döndürür. */
  yaz(icerik: string): string;
  /** İçerik; depoda yoksa `null`. */
  oku(ozet: string): string | null;
  varMi(ozet: string): boolean;
  /** Deponun toplam boyutu, bayt — yalnız raporlama (§15.4 sayacı). */
  toplamBoyut(): number;
}

export function varlikDeposu(kok: string): VarlikDepo {
  const dizin = path.join(kok, VARLIK_DIZINI);
  const yol = (ozet: string) => path.join(dizin, ozet);

  return {
    dizin,

    yaz(icerik) {
      const ozet = createHash('sha256').update(icerik, 'utf8').digest('hex');
      /* Aynı içerik ikinci kez YAZILMAZ: iki projede ya da iki kez eklenmiş
         aynı görsel diskte tek kopya. Dedup'ın tamamı bu satır. */
      if (fs.existsSync(yol(ozet))) return ozet;
      fs.mkdirSync(dizin, { recursive: true });
      /* Atomik: yarım yazılmış bir varlık dosyası, özeti tutan ama içeriği
         bozuk bir kayıt demek olurdu ve bunu hiçbir şey fark etmezdi. */
      writeFileAtomic(yol(ozet), Buffer.from(icerik, 'utf8'));
      return ozet;
    },

    oku(ozet) {
      if (!OZET_DESENI.test(ozet)) return null;
      try {
        return fs.readFileSync(yol(ozet), 'utf8');
      } catch {
        return null;
      }
    },

    varMi(ozet) {
      return OZET_DESENI.test(ozet) && fs.existsSync(yol(ozet));
    },

    toplamBoyut() {
      let toplam = 0;
      let girisler: string[];
      try {
        girisler = fs.readdirSync(dizin);
      } catch {
        return 0;
      }
      for (const ad of girisler) {
        try {
          toplam += fs.statSync(yol(ad)).size;
        } catch {
          /* yarışta silinmiş olabilir — sayaçta atlanır */
        }
      }
      return toplam;
    },
  };
}

/* ------------------------- Çıpa zarfı (biçim) ------------------------- */

/**
 * Zarf başlığı — 8 bayt, ilki 0x00.
 *
 * Ham bir Yjs güncellemesi bu diziyle BAŞLAYAMAZ: ilk varint yapı sayısıdır
 * ve sıfır yapılı bir güncelleme yalnız iki bayttır (`00 00`), 8 baytlık
 * başlık denetimini geçemez. Geriye uyum tam olarak buna dayanıyor —
 * başlıksız her dosya ESKİ biçim (varlıkları gömülü çıpa) sayılıp OLDUĞU
 * GİBİ okunur.
 */
const BASLIK = Uint8Array.from([0x00, 0x4d, 0x5a, 0x4e, 0x43, 0x56, 0x31, 0x00]); // \0MZNCV1\0

/**
 * Zarf: BAŞLIK + JSON uzunluğu (uint32LE) + JSON + varlıksız çıpa.
 *
 * JSON'un iki kuşağı var:
 * - v1 (ilk gece): düz `{varlikId → özet}`.
 * - v2: `{s: 2, indeks, ogeler}` — `ogeler` çıkarılan varlığın ÖZGÜN Yjs
 *   öğe kimliği `[client, clock, len]`. Kurtarma bunu günlük çerçevelerinin
 *   delete set'iyle karşılaştırır: çıpadan sonra o varlığı DEĞİŞTİREN de
 *   SİLEN de özgün öğeyi öldürür, ikisi de buradan yakalanır. Gözlemciyle
 *   yakalanamıyordu — gövdedeki öğe zaten mezar taşı, ikinci silme görünür
 *   olay üretmiyor (ölçüldü: "SİLİNEN görsel dirilmiyor" testi).
 *
 * Ayrım güvenli: v1'de bütün değerler dizgi (özet), v2'de `s` SAYI.
 */
function zarfla(
  indeks: Record<string, string>,
  ogeler: Record<string, number[]>,
  govde: Uint8Array,
): Uint8Array {
  const json = Buffer.from(JSON.stringify({ s: 2, indeks, ogeler }), 'utf8');
  const cikti = new Uint8Array(BASLIK.length + 4 + json.length + govde.length);
  cikti.set(BASLIK, 0);
  new DataView(cikti.buffer).setUint32(BASLIK.length, json.length, true);
  cikti.set(json, BASLIK.length + 4);
  cikti.set(govde, BASLIK.length + 4 + json.length);
  return cikti;
}

interface Zarf {
  indeks: Record<string, string>;
  /** v2: çıkarılan varlıkların özgün öğe kimlikleri; v1 zarfta boş. */
  ogeler: Record<string, number[]>;
  govde: Uint8Array;
}

/** Zarfı çözer; ESKİ biçim (ya da bozuk zarf) ise `null`. */
function zarfCoz(bayt: Uint8Array): Zarf | null {
  if (bayt.length < BASLIK.length + 4) return null;
  for (let i = 0; i < BASLIK.length; i++) if (bayt[i] !== BASLIK[i]) return null;
  const uzunluk = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength).getUint32(
    BASLIK.length,
    true,
  );
  const jsonBas = BASLIK.length + 4;
  const govdeBas = jsonBas + uzunluk;
  if (govdeBas > bayt.length) return null;
  try {
    const veri: unknown = JSON.parse(Buffer.from(bayt.slice(jsonBas, govdeBas)).toString('utf8'));
    if (!veri || typeof veri !== 'object' || Array.isArray(veri)) return null;
    const kayit = veri as { s?: unknown; indeks?: unknown; ogeler?: unknown };
    if (kayit.s === 2 && kayit.indeks && typeof kayit.indeks === 'object') {
      return {
        indeks: kayit.indeks as Record<string, string>,
        ogeler: (kayit.ogeler && typeof kayit.ogeler === 'object'
          ? kayit.ogeler
          : {}) as Record<string, number[]>,
        govde: bayt.slice(govdeBas),
      };
    }
    /* v1: JSON'un tamamı indeks; öğe kimlikleri yok. */
    return { indeks: veri as Record<string, string>, ogeler: {}, govde: bayt.slice(govdeBas) };
  } catch {
    return null;
  }
}

/* ---------------------- Ayrıştırma / birleştirme ---------------------- */

/**
 * Çıpadan varlıkları çıkarır, baytlarını depoya yazar, zarflanmış çıpayı
 * döndürür.
 *
 * Varlıklar çıpa dosyasından ÖNCE depoya yazılıyor (bu işlev çağıranın
 * `writeFileAtomic`inden önce koşuyor): ters sırada, ikisi arasındaki bir
 * çökme özet taşıyan ama baytları hiç yazılmamış bir çıpa bırakırdı.
 *
 * Çözümlenemeyen ya da HİÇ varlığı olmayan çıpa OLDUĞU GİBİ döner — bayt
 * bayt aynı. Varlıksız proje bu değişiklikten hiçbir şey ödemez.
 */
export function cipaAyikla(cipa: Uint8Array, depo: VarlikDepo): Uint8Array {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, cipa, 'varlik-ayirma');
  } catch {
    /* Çözümlenemeyen baytlar DOKUNULMADAN yazılır: çıpa yazımını bir
       ayrıştırma hatası yüzünden düşürmek §15'in kayıp tavanını çiğnerdi. */
    doc.destroy();
    return cipa;
  }
  const map = assetsMap(doc);
  const indeks: Record<string, string> = {};
  for (const [id, deger] of map.entries()) {
    /* Yalnız DİZGİ değerler taşınır; başka bir tip varsa belgede kalır. */
    if (typeof deger !== 'string' || deger.length === 0) continue;
    indeks[id] = depo.yaz(deger);
  }
  const tasinan = Object.keys(indeks);
  if (tasinan.length === 0) {
    doc.destroy();
    return cipa;
  }
  /* Özgün öğe kimlikleri SİLMEDEN ÖNCE kaydediliyor — kurtarmanın
     delete-set denetimi için (bkz. zarfla yorumu). `_map` Yjs'in yarı-iç
     ama y-ekosisteminde standart yüzeyi: anahtarın YAŞAYAN öğesini verir. */
  const ogeler: Record<string, number[]> = {};
  for (const id of tasinan) {
    const oge = (
      map as unknown as {
        _map: Map<string, { id: { client: number; clock: number }; length: number } | undefined>;
      }
    )._map.get(id);
    if (oge) ogeler[id] = [oge.id.client, oge.id.clock, oge.length];
  }
  doc.transact(() => {
    for (const id of tasinan) map.delete(id);
  }, 'varlik-ayirma');
  const govde = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return zarfla(indeks, ogeler, govde);
}

export interface BirlestirmeSonucu {
  cipa: Uint8Array;
  /** Depoda BULUNAMAYAN varlıkların kimlikleri. Boş değilse bildirilir. */
  eksik: string[];
}

/**
 * Zarflanmış çıpayı açar ve varlıkları depodan belgeye geri koyar.
 *
 * Depoda olmayan varlık belgeye KONMAZ ama açılışı ENGELLEMEZ (§15.4:
 * "yoksay ve yedeği koru" — eksik bir görsel yüzünden bütün belgeyi
 * açmamak, kaybı büyütmek olurdu). Eksik olanlar `eksik` ile bildiriliyor;
 * sessizce boş kare gösterilmiyor.
 *
 * ESKİ biçim (zarfsız, varlıkları gömülü) OLDUĞU GİBİ döner.
 */
export function cipaBirlestir(bayt: Uint8Array, depo: VarlikDepo): BirlestirmeSonucu {
  const zarf = zarfCoz(bayt);
  if (!zarf) return { cipa: bayt, eksik: [] };

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, zarf.govde, 'varlik-birlestirme');
  } catch {
    /* Gövde bozuksa ham baytlar döner; `ilkSaglamKayit` bunu eleyip
       halkada bir öncekine düşer — karar oraya ait, buraya değil. */
    doc.destroy();
    return { cipa: bayt, eksik: [] };
  }
  const map = assetsMap(doc);
  const eksik: string[] = [];
  doc.transact(() => {
    for (const [id, ozet] of Object.entries(zarf.indeks)) {
      const icerik = typeof ozet === 'string' ? depo.oku(ozet) : null;
      if (icerik === null) eksik.push(id);
      else map.set(id, icerik);
    }
  }, 'varlik-birlestirme');
  const cipa = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return { cipa, eksik };
}

export interface CipaParcalari {
  /** Varlıksız çıpa gövdesi; ESKİ biçimde ham baytların kendisi. */
  govde: Uint8Array;
  /** Depodan okunmuş varlık baytları — `varlikId → dataUrl`. */
  varliklar: Record<string, string>;
  /** Çıkarılan varlıkların özgün öğe kimlikleri `[client, clock, len]` (v2). */
  ogeler: Record<string, number[]>;
  /** İndekste olup depoda bulunamayanlar. */
  eksik: string[];
}

/**
 * Zarfı AÇMADAN parçalara ayırır: gövde ve varlık baytları AYRI döner,
 * belgeye geri koyma yapılmaz.
 *
 * `cipaBirlestir`den farkı ve VARLIK SEBEBİ (tarama bulgusu 1, 2026-08-27):
 * birleştirme varlıkları burada, rastgele clientID'li YENİ öğelerle geri
 * koyuyordu. Kurtarma o birleşik çıpanın üstüne günlüğü oynatınca, çıpadan
 * sonra DEĞİŞTİRİLMİŞ bir görsel geri koyan öğeyle eşzamanlı düşüyor ve
 * YMap'te büyük clientID kazandığı için ~%50 ESKİ görsel geri geliyordu;
 * SİLİNMİŞ görsel ise her durumda diriliyordu. Geri koymanın doğru yeri
 * günlükten SONRASI ve orası çekirdekte (`veri/kurtarma.ts`) — bu işlev
 * ona ham malzemeyi taşır.
 *
 * `cipaBirlestir` duruyor: günlük OYNATMAYAN yollar (geri dönüş noktasına
 * dönüş, önizleme) için geri koyma hâlâ doğru ve yarışsız.
 */
export function cipaParcala(bayt: Uint8Array, depo: VarlikDepo): CipaParcalari {
  const zarf = zarfCoz(bayt);
  if (!zarf) return { govde: bayt, varliklar: {}, ogeler: {}, eksik: [] };
  const varliklar: Record<string, string> = {};
  const eksik: string[] = [];
  for (const [id, ozet] of Object.entries(zarf.indeks)) {
    const icerik = typeof ozet === 'string' ? depo.oku(ozet) : null;
    if (icerik === null) eksik.push(id);
    else varliklar[id] = icerik;
  }
  return { govde: zarf.govde, varliklar, ogeler: zarf.ogeler, eksik };
}

/**
 * Çıpanın indeksinde olup depoda BULUNMAYAN varlıklar — belgeyi hiç
 * çözmeden. Arayüzün "şu kadar görsel bulunamadı" bildirimi bunu kullanır;
 * `cipaBirlestir` gibi bütün baytları okumaz.
 */
export function cipaEksikVarliklar(bayt: Uint8Array, depo: VarlikDepo): string[] {
  const zarf = zarfCoz(bayt);
  if (!zarf) return [];
  return Object.entries(zarf.indeks)
    .filter(([, ozet]) => typeof ozet !== 'string' || !depo.varMi(ozet))
    .map(([id]) => id);
}
