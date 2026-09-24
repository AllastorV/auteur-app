import * as Y from 'yjs';
import { gunlukCozumle, type GunlukDurumu } from './gunluk';
import {
  assetsMap, metaMap, panelsArray, scriptMap, senaryoFragment, settingsMap,
  sozlukMap, ciftlerArray, yerImleriMap, karakterlerMap, lokasyonlarMap, dunyalarMap, copArray,
} from '../doc/schema';
import { stableStringify } from '../model/projection';

/**
 * Kurtarma — §15.3.
 *
 * Anlık görüntünün üzerine günlük oynatılır. Yjs güncellemeleri artımlı ve
 * SIRAYA BAĞLIDIR: bir çerçeve atlanıp sonraki uygulanamaz, o yüzden ilk
 * başarısızlıkta durulur ve kalan sayılır. Kullanıcıya kaç güncellemenin
 * uygulandığı ve kaçının uygulanamadığı söylenir — sessizce yarım kurtarmak
 * §15.4'ün yasakladığı şeydir.
 *
 * Bu modül de SAF: dosya okumaz, yalnız baytları alır.
 */

export interface KurtarmaSonucu {
  doc: Y.Doc;
  /** Günlükten uygulanan güncelleme sayısı. */
  uygulanan: number;
  /**
   * Çözümlenebilmiş ama uygulanırken FIRLATMIŞ güncelleme sayısı.
   *
   * DİKKAT — bu sayaç yabancı SOYU tespit etmez: `Y.applyUpdate` üst öğesi
   * bulunamayan bir güncellemede fırlatmaz, bekleyen yapı olarak saklar ya da
   * köke iliştirir. Eskiden buradaki yorum "sıfırdan büyükse belge farklı bir
   * projeden geliyor olabilir" diyordu ve yanlıştı: soy karışmasında bu sayaç
   * SIFIR çıkıyor, kullanıcıya yeşil rapor veriliyordu. Soy denetimi
   * `anlik.ts`'teki `ayniProje` ile çıpa seçiminde yapılır. */
  uygulanamayan: number;
  /** Günlükten çözümlenen (sağlaması tutan) güncelleme sayısı. */
  cozumlenen: number;
  durum: GunlukDurumu;
  /** Günlükteki ilk ve son yazımın zamanı — "kaç dakikalık iş" bundan çıkar. */
  ilkZaman: number | null;
  sonZaman: number | null;
}

/**
 * Kurtarılacak işin süresi (ms). §15.3 kullanıcıya bunu gösterir.
 *
 * Tek çerçevelik günlükte süre SIFIRDIR ama iş VARDIR; çağıran "0 dakika"
 * yazmamalı, bu yüzden süre ile varlık ayrı sorulardır (`uygulanan > 0`).
 */
export function kurtarilanSure(sonuc: KurtarmaSonucu): number {
  if (sonuc.ilkZaman === null || sonuc.sonZaman === null) return 0;
  return Math.max(0, sonuc.sonZaman - sonuc.ilkZaman);
}

/**
 * Anlık görüntü + günlük → belge.
 *
 * `anlikGoruntu` `null` olabilir: hiç anlık görüntü alınmadan çökülmüşse
 * günlük tek başına da tam durumu taşır (Yjs güncellemeleri baştan itibaren
 * artımlıdır).
 */
/** `Y.decodeUpdate` çıktısının delete set kısmı — yjs d.ts bunu adlandırmıyor. */
interface SilmeKumesi {
  clients: Map<number, { clock: number; len: number }[]>;
}

/** Öğe kimliği `[client, clock, len]` bu güncellemenin delete set'ine giriyor mu. */
function silmeKapsiyorMu(guncelleme: Uint8Array, oge: readonly number[]): boolean {
  const [client, clock, len = 1] = oge;
  let ds: SilmeKumesi;
  try {
    ds = (Y.decodeUpdate(guncelleme) as unknown as { ds: SilmeKumesi }).ds;
  } catch {
    return false;
  }
  const araliklar = ds.clients.get(client);
  if (!araliklar) return false;
  return araliklar.some((a) => a.clock < clock + len && clock < a.clock + a.len);
}

export function kurtar(
  anlikGoruntu: Uint8Array | null,
  gunluk: Uint8Array,
  varliklar?: Record<string, string>,
  /**
   * Çıkarılan varlıkların ÖZGÜN öğe kimlikleri `[client, clock, len]`
   * (zarf v2). Günlükteki bir çerçeve bu öğeyi silmişse — hem DEĞİŞTİRME
   * hem SİLME özgün öğeyi öldürür — o varlık geri konmaz.
   */
  ogeler?: Record<string, readonly number[]>,
): KurtarmaSonucu {
  const doc = new Y.Doc();
  if (anlikGoruntu && anlikGoruntu.length) Y.applyUpdate(doc, anlikGoruntu, 'kurtarma');

  /* VARLIK GERİ KOYMA GÜNLÜKTEN SONRA — 2026-08-27 taramasının 1. bulgusu.

     Çıpa diske varlıksız yazılıyor (varlik-deposu); baytlar buraya
     `varliklar` ile ayrı geliyor. Günlükten ÖNCE `map.set` ile geri
     konsaydı, geri koyan set çıpadan sonraki günlük düzenlemeleriyle CRDT
     açısından EŞZAMANLI düşerdi ve YMap'te büyük clientID kazanır (ölçüldü):
     kullanıcının çıpadan sonra DEĞİŞTİRDİĞİ görsel ~%50 eski hâline dönerdi
     (40 denemede 18). SİLDİĞİ görsel ise her durumda dirilirdi.

     Bu yüzden önce günlük oynatılır, DOKUNULAN anahtarlar toplanır ve geri
     koyma yalnız dokunulmamışlara yapılır. Dokunulmuşsa günlükteki karar
     (yeni değer YA DA silinmişlik) zaten belgededir ve son sözdür.

     "Dokunuldu" İKİ kanaldan tespit edilir:
     1. Gözlemci — `assets` kökünde görünür değişiklik (yeni SET).
     2. Delete-set denetimi — çerçevenin sildiği aralıklar, zarfın verdiği
        özgün öğe kimlikleriyle (`ogeler`) kesişiyor mu. Tek başına gözlemci
        YETMİYOR (ölçüldü): gövdedeki özgün öğe zaten mezar taşı, günlükteki
        SİLME onun üstünde görünür olay üretmiyor — ama delete-set'te izi
        duruyor. v1 zarfta `ogeler` boş; orada yalnız 1. kanal çalışır ve
        silme dirilmesi bilinen sınırdır (30 günde doğal ölür). */
  const dokunulan = new Set<string>();
  const assets = varliklar ? assetsMap(doc) : null;
  const gozlemci = assets
    ? (olay: Y.YMapEvent<string>) => {
        for (const anahtar of olay.keysChanged) dokunulan.add(anahtar);
      }
    : null;
  if (assets && gozlemci) assets.observe(gozlemci);

  const okuma = gunlukCozumle(gunluk);
  let uygulanan = 0;
  let uygulanamayan = 0;
  for (let i = 0; i < okuma.guncellemeler.length; i++) {
    try {
      Y.applyUpdate(doc, okuma.guncellemeler[i], 'kurtarma');
      uygulanan++;
    } catch {
      /* Sağlaması tutan bir çerçeve bile BAŞKA bir projenin güncellemesi
         olabilir. Durulur: sıraya bağlı bir akışta ortadaki bir güncellemeyi
         atlayıp sonrakini uygulamak metni sessizce yanlış duruma getirir. */
      uygulanamayan = okuma.guncellemeler.length - i;
      break;
    }
  }

  if (assets && gozlemci && varliklar) {
    assets.unobserve(gozlemci);
    if (ogeler) {
      const uygulananlar = okuma.guncellemeler.slice(0, uygulanan);
      for (const [id, oge] of Object.entries(ogeler)) {
        if (dokunulan.has(id)) continue;
        if (uygulananlar.some((u) => silmeKapsiyorMu(u, oge))) dokunulan.add(id);
      }
    }
    doc.transact(() => {
      for (const [id, icerik] of Object.entries(varliklar)) {
        if (!dokunulan.has(id)) assets.set(id, icerik);
      }
    }, 'kurtarma');
  }

  return {
    doc,
    uygulanan,
    uygulanamayan,
    cozumlenen: okuma.guncellemeler.length,
    durum: okuma.durum,
    ilkZaman: okuma.zamanlar.length ? okuma.zamanlar[0] : null,
    sonZaman: uygulanan > 0 ? okuma.zamanlar[uygulanan - 1] : null,
  };
}

/**
 * Kökleri şema erişimcileriyle AYAĞA KALDIRIR.
 *
 * ÖLÇÜLDÜ: güncellemelerden kurtarılan bir `Y.Doc`'ta kökler, erişilene kadar
 * TİPSİZ yer tutuculardır. O hâlde `doc.toJSON()` `{}` döner ve kimi kökleri
 * (`customPoses`, `senaryo`) hiç LİSTELEMEZ — yani iki boş JSON karşılaştırıp
 * "özdeş" demek mümkündür. Bir veri güvenliği testinde bu, yalancı yeşilin ta
 * kendisidir.
 *
 * Üretimde bu tuzak yok çünkü `attachDoc` → `ProjectSnapshot.read()` zaten
 * bütün köklere dokunuyor; ama kurtarılmış belgeyi doğrudan okuyan HER yol
 * bunu yapmak zorunda.
 */
function koklariAyagaKaldir(doc: Y.Doc): void {
  metaMap(doc);
  settingsMap(doc);
  panelsArray(doc);
  scriptMap(doc);
  senaryoFragment(doc);
  assetsMap(doc);
  /* Sonradan eklenen kökler — GENİŞLEYEN LİSTE. Eksik kalan her kök burada
     AYNI yalancı-yeşile düşer: `doc.toJSON()` onu listelemez, iki belge
     gerçekte FARKLI olsa da özdeş görünür. `sozluk`/`ciftler` başta unutulup
     bu fonksiyonun eksikliğiyle örtülmüştü (§15.5'in ölçmediği bir kör
     nokta) — `dunyalar`/`cop` eklenirken fark edildi. Kalıcı çözüm:
     `doc/schema.ts` `ROOT`'a yeni bir kök eklenince BURASI da güncellenmeli
     (`izdusum-kapsami.test.ts`nin korumalı izdüşüm için yaptığının aynısı,
     burada elle — bu dosya `ROOT`'u import ETMİYOR çünkü her kökün tipi
     farklı ve tek bir jenerik "wake" çağrısı yok). */
  sozlukMap(doc);
  ciftlerArray(doc);
  yerImleriMap(doc);
  karakterlerMap(doc);
  lokasyonlarMap(doc);
  dunyalarMap(doc);
  copArray(doc);
}

/**
 * İki belgenin durumu ÖZDEŞ mi (§15.5, "günlük oynatma durumu birebir geri
 * getiriyor").
 *
 * İki BAĞIMSIZ eksen sorulur:
 * 1. **Durum vektörü** — hangi istemciden kaç güncelleme görüldüğü. Yapısal
 *    eşitlik; içerik aynı görünse de eksik bir güncelleme burada yakalanır.
 * 2. **İçerik** — `toJSON()`, kökler ayağa kaldırıldıktan SONRA ve
 *    ANAHTAR SIRASINDAN bağımsız. `doc.share` bir Map'tir ve kökler kurtarılan
 *    belgede güncellemelerden gelen sırayla, kaynak belgede yaratılma
 *    sırasıyla dizilir; düz `JSON.stringify` bu yüzden özdeş belgeleri farklı
 *    sayardı (ölçüldü). `stableStringify` anahtarları sıralar.
 *
 * Tek eksene bakmak yeterli GÖRÜNÜR; ikisi birden aldatılmaz.
 */
export function durumOzdes(a: Y.Doc, b: Y.Doc): boolean {
  const va = Y.encodeStateVector(a);
  const vb = Y.encodeStateVector(b);
  if (va.length !== vb.length) return false;
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
  koklariAyagaKaldir(a);
  koklariAyagaKaldir(b);
  return stableStringify(a.toJSON()) === stableStringify(b.toJSON());
}
