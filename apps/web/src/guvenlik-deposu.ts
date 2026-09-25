import type { CipaKaydi, VeriGuvenligiKabugu } from '@storyboard/core/platform/types';
import { t as ceviri } from '@storyboard/core/dil/arayuz';

/**
 * §15 VERİ GÜVENLİĞİ — TARAYICI KATMANI (§17 borcu).
 *
 * §17 diyordu: "Web istemcisinde §15 disk katmanı YOK. Tarayıcıda çökme
 * koruması yalnız ortak çalışma sunucusunda; ÇEVRİMDIŞI yazan bir web
 * kullanıcısı korunmasız." Bu, spec'in "hiçbir gerekçeyle
 * sadeleştirilemez" dediği tek maddenin tarayıcıdaki deliğiydi.
 *
 * ## Neden IndexedDB
 *
 * `localStorage` OLMAZ: eşzamanlı (senkron) çalışıyor, yani her günlük
 * yazımında yazarın tuşları donardı; ve tipik kotası ~5 MB — bir senaryonun
 * çerçeve günlüğü onu kısa sürede aşar. IndexedDB eşzamansız, ikili veri
 * saklıyor ve kotası disk boyutuyla ölçülüyor.
 *
 * OPFS (Origin Private File System) daha da uygun olurdu — gerçek dosya
 * semantiği verir — ama Safari'de yalnız Worker içinde eşzamanlı erişim
 * sunuyor ve bu, katmanı bir Worker'a taşımayı gerektirirdi. IndexedDB her
 * hedef tarayıcıda ana iş parçacığından çalışıyor.
 *
 * ## Atomiklik: masaüstünden FARKLI ama daha güçlü
 *
 * Masaüstü sözleşmesi "çıpayı ATOMİK yazar, SONRA günlüğü keser" diyor;
 * orada iki ayrı dosya var ve sıra bir zorunluluk. IndexedDB'de ikisi TEK
 * İŞLEMDE yapılıyor: ya ikisi de olur ya hiçbiri. Yani "çıpa yazıldı ama
 * günlük kesilmedi" ara durumu bile oluşmuyor — sözleşmenin amacı (çıpa
 * yazılmadan günlük ASLA kesilmesin) fazlasıyla karşılanıyor.
 *
 * ## ⚠ Tavan
 *
 * Tarayıcı depolaması kullanıcı "site verilerini temizle" derse gider ve
 * gizli pencerede oturumla sınırlıdır. Bu yüzden arayüz web'de yine de
 * "yerel koruma sınırlı" diyor — masaüstündeki dosya sistemi kadar güçlü
 * değil ve olduğunu iddia etmek §15.4 ihlali olurdu.
 */

const DB_ADI = 'mizansen-guvenlik';
const DB_SURUM = 1;
const GUNLUK = 'gunluk';
const CIPA = 'cipa';
const KURTARMA = 'kurtarma';

/** Kuşak halkasında tutulan çıpa sayısı — masaüstüyle aynı. */
const HALKA_BOYU = 10;

function db(): Promise<IDBDatabase> {
  return new Promise((coz, red) => {
    const istek = indexedDB.open(DB_ADI, DB_SURUM);
    istek.onupgradeneeded = () => {
      const d = istek.result;
      /* Günlük parça parça yazılıyor (`autoIncrement`): her `gunlugeEkle`
         yeni bir kayıt. Tek bir kaydı büyütmek, her eklemede tüm günlüğü
         okuyup yeniden yazmak demekti — uzun bir oturumda o maliyet
         karesel büyür ve yazarın tuşları donardı. */
      if (!d.objectStoreNames.contains(GUNLUK)) {
        d.createObjectStore(GUNLUK, { autoIncrement: true }).createIndex('proje', 'projeId');
      }
      if (!d.objectStoreNames.contains(CIPA)) {
        d.createObjectStore(CIPA, { keyPath: ['projeId', 'id'] }).createIndex('proje', 'projeId');
      }
      if (!d.objectStoreNames.contains(KURTARMA)) {
        d.createObjectStore(KURTARMA, { autoIncrement: true }).createIndex('proje', 'projeId');
      }
    };
    istek.onsuccess = () => coz(istek.result);
    /* Hata YUTULMUYOR: depo açılamıyorsa koruma YOK demektir ve çağıran
       bunu kullanıcıya söylemek zorunda (§15.4). */
    istek.onerror = () => red(istek.error ?? new Error(ceviri('IndexedDB açılamadı')));
  });
}

function bekle<T>(istek: IDBRequest<T>): Promise<T> {
  return new Promise((coz, red) => {
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => red(istek.error ?? new Error(ceviri('IndexedDB isteği başarısız')));
  });
}

function islemBitti(t: IDBTransaction): Promise<void> {
  return new Promise((coz, red) => {
    t.oncomplete = () => coz();
    t.onerror = () => red(t.error ?? new Error(ceviri('IndexedDB işlemi başarısız')));
    t.onabort = () => red(t.error ?? new Error(ceviri('IndexedDB işlemi iptal edildi')));
  });
}

/** Bir projenin dizinli kayıtlarını okur. */
async function kayitlar<T>(d: IDBDatabase, magaza: string, projeId: string): Promise<T[]> {
  const t = d.transaction(magaza, 'readonly');
  const dizin = t.objectStore(magaza).index('proje');
  return bekle(dizin.getAll(IDBKeyRange.only(projeId)) as IDBRequest<T[]>);
}

interface GunlukKaydi { projeId: string; veri: Uint8Array; sira: number }
interface CipaKaydiDepo { projeId: string; id: string; zaman: number; veri: Uint8Array }

export function webGuvenlikDeposu(): VeriGuvenligiKabugu {
  return {
    async gunlugeEkle(projeId, cerceveler) {
      const d = await db();
      const t = d.transaction(GUNLUK, 'readwrite');
      /* `sira` zamandan DEĞİL sayaçtan: aynı milisaniyede iki yazım olabilir
         ve sıra bozulursa günlük yanlış çözülür — kurtarılan belge sessizce
         başka bir belge olurdu. */
      t.objectStore(GUNLUK).add({ projeId, veri: cerceveler, sira: Date.now() });
      await islemBitti(t);
    },

    async gunlukOku(projeId) {
      const d = await db();
      const kayit = await kayitlar<GunlukKaydi>(d, GUNLUK, projeId);
      if (kayit.length === 0) return null;
      /* Parçalar EKLENME SIRASINDA birleştiriliyor: `getAll` anahtar
         sırasında dönüyor ve anahtar `autoIncrement`. */
      const toplam = kayit.reduce((n, k) => n + k.veri.byteLength, 0);
      const birlesik = new Uint8Array(toplam);
      let ofset = 0;
      for (const k of kayit) {
        birlesik.set(k.veri, ofset);
        ofset += k.veri.byteLength;
      }
      return birlesik;
    },

    async cipaYazVeGunlugeKes(projeId, cipa) {
      const d = await db();
      /* TEK İŞLEM: ya ikisi de olur ya hiçbiri. Masaüstündeki "önce çıpa,
         sonra kes" sırası burada gerekmiyor çünkü ara durum oluşmuyor. */
      const t = d.transaction([CIPA, GUNLUK], 'readwrite');
      const zaman = Date.now();
      t.objectStore(CIPA).put({ projeId, id: String(zaman), zaman, veri: cipa });

      const g = t.objectStore(GUNLUK).index('proje');
      const imlec = g.openCursor(IDBKeyRange.only(projeId));
      imlec.onsuccess = () => {
        const c = imlec.result;
        if (!c) return;
        c.delete();
        c.continue();
      };
      await islemBitti(t);

      /* HALKA BUDAMA AYRI İŞLEMDE ve bilinçli: budama başarısız olsa bile
         çıpa yazılmış olmalı. Ters sırada bir budama hatası taze çıpayı da
         geri alırdı — yani koruma, kendi bakımı yüzünden kaybolurdu. */
      const hepsi = await kayitlar<CipaKaydiDepo>(d, CIPA, projeId);
      const fazla = hepsi.sort((a, b) => b.zaman - a.zaman).slice(HALKA_BOYU);
      if (fazla.length) {
        const t2 = d.transaction(CIPA, 'readwrite');
        for (const c of fazla) t2.objectStore(CIPA).delete([projeId, c.id]);
        await islemBitti(t2);
      }
    },

    async cipaHalkasi(projeId): Promise<CipaKaydi[]> {
      const d = await db();
      const hepsi = await kayitlar<CipaKaydiDepo>(d, CIPA, projeId);
      /* YENİDEN ESKİYE — masaüstü halkasıyla aynı sıra. Ters dönseydi
         kurtarma ekranı en eski çıpayı "son kayıt" diye gösterirdi. */
      return hepsi
        .sort((a, b) => b.zaman - a.zaman)
        .map((c) => ({ id: c.id, zaman: c.zaman }));
    },

    async cipaOku(projeId, id) {
      const d = await db();
      const t = d.transaction(CIPA, 'readonly');
      const k = await bekle(t.objectStore(CIPA).get([projeId, id]) as IDBRequest<CipaKaydiDepo>);
      /* Bulunamayan çıpa SESSİZ dönmüyor: çağıran onu belge sanıp boş bir
         proje açardı ve kullanıcı işini kaybettiğini sanırdı. */
      if (!k) throw new Error(`${ceviri('Çıpa bulunamadı')}: ${id}`);
      return k.veri;
    },

    async gunluguArsivle(projeId) {
      const d = await db();
      const kayit = await kayitlar<GunlukKaydi>(d, GUNLUK, projeId);
      if (kayit.length === 0) return null;

      /* §15.3: günlük SİLİNMEZ, taşınır. Bozuk bir günlük bile kullanıcının
         yazdığı metni taşıyor olabilir ve onu atmak, kurtarmaya çalıştığımız
         şeyi yok etmek olurdu. */
      const etiket = `kurtarma-${Date.now()}`;
      const t = d.transaction([KURTARMA, GUNLUK], 'readwrite');
      for (const k of kayit) t.objectStore(KURTARMA).add({ ...k, etiket });
      const g = t.objectStore(GUNLUK).index('proje');
      const imlec = g.openCursor(IDBKeyRange.only(projeId));
      imlec.onsuccess = () => {
        const c = imlec.result;
        if (!c) return;
        c.delete();
        c.continue();
      };
      await islemBitti(t);
      return etiket;
    },
  };
}
