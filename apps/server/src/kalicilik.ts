import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { ilkSaglamKayit, type AdayKayit, type KayitElemesi } from '@storyboard/core/veri/anlik';
import { arsivBudamasi } from '@storyboard/core/veri/kontrol-noktalari';
/* §15.2'nin atomik yazımı TEK EVDE (Karar 2). Dosya Electron'a KASTEN bağlı
   değil (kendi başlığı böyle diyor); sunucu onu olduğu gibi çağırıyor, benzerini
   YAZMIYOR. `apps/server/tsconfig.json` bu tek dosyayı `include`'a alıyor.
   ⚠ TAVAN: sunucu tek başına paketlenirse bu göreli yol kırılır — ama SESSİZ
   değil, modül yüklenirken patlar. Kalıcı çözüm dosyanın ortak bir pakete
   taşınması; `packages/core` bu görevde dokunulmaz alandı. */
import { writeFileAtomic, geciciDosyalariTemizle } from '../../desktop/electron/atomik';
import type { Invite, Room, RoomUser } from './rooms';

/**
 * Sunucu tarafı kalıcılık — §15'in sunucudaki karşılığı.
 *
 * ## Neden var
 *
 * Odalar YALNIZCA bellekteydi. Sunucu yeniden başlarsa (güncelleme, çökme,
 * elektrik) odanın içeriği giderdi. Kullanıcının bağlayıcı cümlesi:
 * "sunucu yeniden başlarsa tekrar program açılması sıkıntı değil, ÖNEMLİ OLAN
 * DOSYALARIN KAYBOLMAMASI."
 *
 * ## Katmanlar §15.2 ile aynı, biri EKSİK — bilerek
 *
 * | Katman | Masaüstü | Sunucu |
 * |---|---|---|
 * | 1 · yazma günlüğü | `oturum.log`, ~1 sn | **YOK** — aşağıya bak |
 * | 2 · atomik anlık görüntü | 5 dk | **≤ 2 sn** (`KAYIT_ARALIK_MS`) |
 * | 3 · kuşak halkası | seyrelen | son 3 kuşak |
 *
 * Günlük katmanı yok çünkü sunucudaki tam anlık görüntü aralığı 5 DAKİKA
 * değil 2 SANİYE: masaüstünde günlüğün kapattığı pencere burada zaten kapalı.
 * Günlük eklemek aynı korumayı ikinci kez satın almak olurdu.
 *
 * 2 saniyenin gerekçesi ve ölçümü `KAYIT_ARALIK_MS`'te.
 *
 * ## İkinci kopya argümanı ve neden ONA GÜVENİLMİYOR
 *
 * Yjs bir CRDT'dir: bağlı her istemci belgenin tam kopyasını taşır, yeniden
 * bağlandığında sunucunun kaçırdığını geri iter. Bu doğru ama YETERSİZ —
 * son istemci de kapandıktan sonra sunucudaki kopya TEK kopyadır. Bu ürünün
 * en ağır kısıtı (§15) "ikinci kopya vardır herhalde" varsayımına
 * dayandırılamaz.
 */

/** Kuşak halkasında tutulan anlık görüntü sayısı (§15.2, 3. katman). */
export const KUSAK_SAYISI = 3;

/**
 * Diske yazma aralığı — kayıp penceresinin tavanı.
 *
 * ## Neden her güncellemede değil
 *
 * `doc.on('update')` başına tam `encodeStateAsUpdate` + atomik yazım, hızlı
 * yazan tek bir kullanıcıda saniyede onlarca tam belge yazımı demek. Disk
 * dövülür, üstelik iş Node'un tek iş parçacığında döner ve odadaki HERKESİ
 * yavaşlatır.
 *
 * ## Neden 2 saniye
 *
 * ÖLÇÜLDÜ (`tests/sunucu-kalicilik.test.ts` → "ÖLÇÜM — yazma turunun
 * maliyeti", Windows 11 / NVMe / Node 26): 200 panelli, panel başına replikli
 * gerçekçi bir belgede çıpa **353 KB**; `encodeStateAsUpdate` + atomik yazım
 * turu, tek başına koşarken **ortalama 11 – 18 ms** (medyan 11 – 17 ms, en
 * kötü 17 – 39 ms; dört ölçüm). Bütün test paketiyle birlikte, yani disk
 * çekişmesi altında ortalama 45 ms'e, en kötü 266 ms'e çıktı — sunucunun
 * gerçek koşullarına daha yakın olan üst uç budur.
 *
 * 2 sn aralıkta bu **yüzde 0,5 – 2,3** meşguliyet demek — gürültü.
 * Karşılaştırma: 500 ms seçilseydi aynı iş dört kat sık döner (%2 – %9) ve
 * kazanılan tek şey 1,5 saniyelik pencere olurdu; 10 sn seçilseydi
 * meşguliyet beşte birine iner ama pencere beş katına çıkardı — yüzde birkaç
 * için sekiz saniye daha fazla yazı riske atılmaz.
 *
 * Yani eşik disk maliyetiyle değil, KAYIP PENCERESİYLE belirlendi: 2 saniye,
 * ölçülen maliyeti hâlâ gürültü seviyesinde tutan en küçük pencere. Ölçüm
 * testte duruyor ki eşiğin gerekçesi bayatlarsa kırmızıya dönsün.
 *
 * `STORYBOARD_KAYIT_MS` ile değiştirilebilir; §15.2.1 gibi KAPATILAMAZ.
 */
export const KAYIT_ARALIK_MS = 2000;

/** Aralık ayarlanabilir ama kapatılamaz — 200 ms ile 30 sn arasına kıstırılır. */
export function kayitAraligiKisitla(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return KAYIT_ARALIK_MS;
  return Math.max(200, Math.min(30_000, ms));
}

const ODALAR_DIZINI = 'odalar';
const SILINEN_DIZINI = 'silinen';
const KAYIT_ADI = 'oda.json';
const CIPA_ONEK = 'cipa-';
const CIPA_SONEK = '.yjs';

/** Odanın belge DIŞINDAKİ her şeyi — kod, roller, davetler. */
export interface OdaKaydi {
  id: string;
  code: string;
  projectName: string;
  ownerTokenId: string;
  createdAt: number;
  users: RoomUser[];
  invites: Invite[];
}

export interface OdaOkumasi {
  kayit: OdaKaydi;
  /** Kuşak halkasından seçilen sağlam belge; `null` ise hiçbiri sağlam değildi. */
  doc: Y.Doc | null;
  /** Denenip elenen çıpalar — SESSİZCE yutulmaz (§15.4). */
  elenen: KayitElemesi[];
}

export interface DepoDurumu {
  /** ARKA ARKAYA başarısız yazım sayısı. Başarıda sıfırlanır. */
  ardArdaHata: number;
  sonHata: string | null;
  /** §15.4: ilk hatada uyarı, arka arkaya İKİNCİ hatada engelleyici durum. */
  engelleyici: boolean;
  sonYazim: number | null;
}

export interface OdaDeposu {
  readonly kok: string;
  /** Diskte kaydı olan odaların kimlik→kod dizini. Bellekte tutulur. */
  dizin(): Map<string, string>;
  yaz(kayit: OdaKaydi, durum: Uint8Array): void;
  oku(id: string): OdaOkumasi | null;
  /** §15.3: SİLMEZ, `silinen/` altına taşır. */
  arsivle(id: string): string | null;
  durum(): DepoDurumu;
}

/** `STORYBOARD_DATA_DIR` verilmemişse kullanılacak yol. */
export function varsayilanVeriDizini(env: NodeJS.ProcessEnv = process.env): string {
  return env.STORYBOARD_DATA_DIR || path.join(os.homedir(), '.mizansen-sunucu');
}

/**
 * Oda kimliği bir YOL SINIRIDIR.
 *
 * Kimlikler `newId` üretiyor ama diskten okunan bir dizin adı da buraya
 * geliyor ve `..` taşıyan bir ad veri kökünün DIŞINA yazdırırdı. Ayraçlar
 * elle sayılıyor (`path.basename` ile değil): POSIX'te `\` ayraç sayılmaz ve
 * aynı veri dizini iki platformda da okunabilir — `gunluk-deposu.ts` aynı
 * sınırı aynı gerekçeyle çiziyor.
 */
function kimlikDogrula(id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..') || id === '.') {
    throw new Error(`Gecersiz oda kimligi: ${id}`);
  }
}

/**
 * Veri dizinini GERÇEKTEN yazarak sınar.
 *
 * §15.4: "disk dolu, izin reddi veya salt-okunur konum durumunda düzenlemeye
 * sessizce devam edilmez." Sunucunun karşılığı daha da katı — kalıcılığı
 * olmayan bir ortak çalışma sunucusu kullanıcıya yalan söyler: herkes yazar,
 * yeniden başlatma her şeyi siler. `mkdir` başarısı YETMEZ; salt-okunur
 * bağlanmış bir dizinde `mkdir` var olan dizin için sorunsuz döner.
 */
export function veriDiziniSina(kok: string): void {
  const hedef = path.join(kok, ODALAR_DIZINI);
  fs.mkdirSync(hedef, { recursive: true });
  const deneme = path.join(hedef, `.yazma-denemesi-${process.pid}`);
  fs.writeFileSync(deneme, 'mizansen');
  fs.rmSync(deneme, { force: true });
}

export function odaDeposu(kok: string): OdaDeposu {
  const odalarKok = path.join(kok, ODALAR_DIZINI);
  const kodDizini = new Map<string, string>();
  let durum: DepoDurumu = { ardArdaHata: 0, sonHata: null, engelleyici: false, sonYazim: null };

  const odaDizini = (id: string) => {
    kimlikDogrula(id);
    return path.join(odalarKok, id);
  };

  const kayitOku = (id: string): OdaKaydi | null => {
    let ham: string;
    try {
      ham = fs.readFileSync(path.join(odaDizini(id), KAYIT_ADI), 'utf8');
    } catch {
      return null;
    }
    try {
      const c = JSON.parse(ham) as OdaKaydi;
      if (!c || typeof c.id !== 'string' || typeof c.code !== 'string') return null;
      /* Diskten gelen liste alanları eksik olabilir (elle düzenleme, eski
         sürüm). Boş diziye düşürmek `[...]` yayılımının fırlatmasını önler;
         odanın BELGESİ bundan etkilenmez — asıl korunan veri odur. */
      return { ...c, users: c.users ?? [], invites: c.invites ?? [] };
    } catch (err) {
      /* Atomik yazım yarım dosya bırakmaz; buraya düşmek disk hasarı ya da
         elle bozma demektir. SESSİZ geçilmez (§15.4): oda erişilemez oluyor
         ve dizin diskte DURUYOR — sonradan elle kurtarılabilsin. */
      console.error(
        `[kalicilik] '${id}' odasının kaydı okunamadı, oda açılamıyor: ` +
          `${err instanceof Error ? err.message : String(err)}\n` +
          `            Belge dosyaları silinmedi: ${odaDizini(id)}`,
      );
      return null;
    }
  };

  /** Kuşak halkası, YENİDEN ESKİYE. */
  const halka = (id: string): { ad: string; zaman: number }[] => {
    let girisler: string[];
    try {
      girisler = fs.readdirSync(odaDizini(id));
    } catch {
      return [];
    }
    return girisler
      .filter((a) => a.startsWith(CIPA_ONEK) && a.endsWith(CIPA_SONEK))
      .map((a) => ({ ad: a, zaman: Number(a.slice(CIPA_ONEK.length, -CIPA_SONEK.length)) }))
      /* Damgası okunamayan dosya ELENİR, sıfır sayılmaz: sıfır onu en eski
         yapar ve budama sırasında SAĞLAM bir çıpanın önüne geçebilirdi. */
      .filter((c) => Number.isFinite(c.zaman) && c.zaman > 0)
      .sort((a, b) => b.zaman - a.zaman);
  };

  const basarili = () => {
    durum = { ardArdaHata: 0, sonHata: null, engelleyici: false, sonYazim: Date.now() };
  };

  const basarisiz = (err: unknown, ne: string) => {
    const sayi = durum.ardArdaHata + 1;
    const mesaj = err instanceof Error ? err.message : String(err);
    durum = { ...durum, ardArdaHata: sayi, sonHata: `${ne}: ${mesaj}`, engelleyici: sayi >= 2 };
    /* Sunucunun arayüzü GÜNLÜĞÜDÜR; §15.4'ün "toast" karşılığı budur.
       Engelleyici duruma geçince `/api/health` de 503 döner — bildirimi
       kaçırmak mümkündür, sağlık kontrolünün kırmızıya dönmesini kaçırmak
       değildir. */
    console.error(`[kalicilik] ${ne} BAŞARISIZ (arka arkaya ${sayi}): ${mesaj}`);
    if (sayi >= 2) {
      console.error(
        '[kalicilik] ⛔ ODA İÇERİĞİ DİSKE YAZILAMIYOR. Yeniden başlatma iş kaybına yol açar. ' +
          'Diskte yer, yazma izni ve STORYBOARD_DATA_DIR ayarını denetleyin.',
      );
    }
  };

  return {
    kok,

    dizin: () => kodDizini,

    yaz(kayit, durumBaytlari) {
      const dizin = odaDizini(kayit.id);
      try {
        fs.mkdirSync(dizin, { recursive: true });
        /* Çıpa ÖNCE, kayıt SONRA. `oda.json` odanın "var" işaretidir; ters
           sırada, ikisi arasındaki çökme kayıtlı ama çıpasız bir oda bırakır
           ve açılışta boş belgeyle karşılanır. Bu sırayla en kötü ihtimal
           kayıtsız bir çıpadır — bir sonraki yazımda tamamlanır. */
        const zaman = Date.now();
        /* Boş gövde çıpa YAZDIRMAZ. Sıfır baytlık bir çıpa açılışta
           `ilkSaglamKayit` tarafından "projesiz" diye elenirdi — gerçek bir
           arızayla karışan gürültü. */
        if (durumBaytlari.length > 0) {
          writeFileAtomic(path.join(dizin, `${CIPA_ONEK}${zaman}${CIPA_SONEK}`), durumBaytlari);
        }
        writeFileAtomic(
          path.join(dizin, KAYIT_ADI),
          Buffer.from(JSON.stringify(kayit, null, 2), 'utf8'),
        );
        kodDizini.set(kayit.code.toUpperCase(), kayit.id);
        /* Budama YAZIMDAN SONRA: önce budansaydı yeni çıpa yazılamadığında
           halka gereksiz yere bir kuşak küçülürdü. */
        for (const eski of halka(kayit.id).slice(KUSAK_SAYISI)) {
          fs.rmSync(path.join(dizin, eski.ad), { force: true });
        }
        basarili();
      } catch (err) {
        basarisiz(err, `'${kayit.id}' odası yazılamadı`);
      }
    },

    oku(id) {
      const kayit = kayitOku(id);
      if (!kayit) return null;
      /* Çökmeden artakalan yan dosyalar: temizlenmezse her çökme bir kopya
         daha bırakır ve disk sessizce dolar (§15.4). */
      geciciDosyalariTemizle(odaDizini(id));

      const adaylar: AdayKayit[] = halka(id).map((c) => ({
        id: c.ad,
        oku: () => new Uint8Array(fs.readFileSync(path.join(odaDizini(id), c.ad))),
      }));
      /* Kuşak halkasında ilk SAĞLAM kaydı bulan kural TEK EVDE: çekirdekteki
         `ilkSaglamKayit`. Proje kimliği verilmiyor — sunucu hangi projeyi
         beklediğini bilmez, yalnız "çözümlenebiliyor ve proje taşıyor" ölçütü
         uygulanır. */
      const secim = ilkSaglamKayit(adaylar);
      if (adaylar.length > 0 && !secim.doc) {
        console.error(
          `[kalicilik] '${id}' odasının ${adaylar.length} çıpasının HİÇBİRİ açılamadı ` +
            `(${secim.elenen.map((e) => `${e.id}:${e.sebep}`).join(', ')}). Oda BOŞ açılıyor.`,
        );
      } else if (secim.elenen.length > 0) {
        console.warn(
          `[kalicilik] '${id}' odasında ${secim.elenen.length} çıpa elendi, ` +
            `bir öncekine düşüldü: ${secim.kullanilan}`,
        );
      }
      return { kayit, doc: secim.doc, elenen: secim.elenen };
    },

    arsivle(id) {
      const kaynak = odaDizini(id);
      if (!fs.existsSync(kaynak)) return null;
      const hedefKok = path.join(kok, SILINEN_DIZINI);
      fs.mkdirSync(hedefKok, { recursive: true });
      const hedef = path.join(hedefKok, `${id}-${Date.now()}`);
      /* Taşınır, SİLİNMEZ (§15.3): "kullanıcının yanlış tuşa basması veri
         kaybı olmamalıdır." Sahibin "oturumu kapat" düğmesi de yanlış
         basılabilir ve aylarca emek onun arkasında durur. */
      fs.renameSync(kaynak, hedef);
      for (const [kod, odaId] of kodDizini) if (odaId === id) kodDizini.delete(kod);
      /* Arşiv budanıyor — masaüstündeki `kurtarma/` ile AYNI politika ve
         aynı işlev. Kurumsal bir sunucuda kapatılan her oda burada kalıyordu;
         e2e paketinin tek koşusu bile yüzlerce dizin bırakabiliyor. */
      try {
        const kayitlar = fs
          .readdirSync(hedefKok)
          .map((ad) => ({ id: ad, zaman: Number(ad.slice(ad.lastIndexOf('-') + 1)) }))
          .filter((k) => Number.isFinite(k.zaman) && k.zaman > 0);
        for (const eski of arsivBudamasi(kayitlar, Date.now()).silinen) {
          fs.rmSync(path.join(hedefKok, eski.id), { recursive: true, force: true });
        }
      } catch {
        /* Budama başarısızsa arşivleme başarılı sayılır: oda taşınmış
           durumda ve asıl iş odur. */
      }
      return hedef;
    },

    durum: () => ({ ...durum }),
  };
}

/**
 * Açılışta diskteki odaların kimlik→kod dizinini kurar.
 *
 * Belgeler TEMBEL yüklenir: yüz odalı bir sunucuda hepsini belleğe açmak
 * açılışı saniyelere çıkarır ve çoğu hiç istenmez. Dizin küçüktür
 * (`oda.json` başına birkaç yüz bayt) ve `getRoomByCode`'un diske gitmeden
 * "böyle bir oda var mı" sorusunu yanıtlamasını sağlar.
 */
export function dizinKur(depo: OdaDeposu): number {
  const odalarKok = path.join(depo.kok, ODALAR_DIZINI);
  let girisler: string[];
  try {
    girisler = fs.readdirSync(odalarKok);
  } catch {
    return 0;
  }
  let sayi = 0;
  for (const ad of girisler) {
    if (ad.startsWith('.')) continue;
    let ham: string;
    try {
      ham = fs.readFileSync(path.join(odalarKok, ad, KAYIT_ADI), 'utf8');
    } catch {
      continue;
    }
    try {
      const kayit = JSON.parse(ham) as OdaKaydi;
      if (typeof kayit.id === 'string' && typeof kayit.code === 'string') {
        depo.dizin().set(kayit.code.toUpperCase(), kayit.id);
        sayi++;
      }
    } catch {
      console.error(`[kalicilik] '${ad}' oda kaydı çözümlenemedi; dizine alınmadı.`);
    }
  }
  return sayi;
}

/** Odanın diske yazılacak üstverisi. */
export function odaKaydiCikar(room: Room): OdaKaydi {
  return {
    id: room.id,
    code: room.code,
    projectName: room.projectName,
    ownerTokenId: room.ownerTokenId,
    createdAt: room.createdAt,
    /* `online` diske YAZILMAZ değeri olarak `false`'a düşürülüyor: bağlantı
       durumu çalışma zamanına aittir ve diskte `true` kalsaydı yeniden
       başlatmadan sonra katılımcı listesi hiç bağlanmamış kişileri çevrimiçi
       gösterirdi. */
    users: [...room.users.values()].map((u) => ({ ...u, online: false })),
    invites: [...room.invites.values()],
  };
}

/**
 * Değişen odaları düzenli aralıklarla diske yazan tur.
 *
 * ## Neden `doc.on('update')` dinleyicisi değil, TUR
 *
 * Dinleyici yalnız BELGE değişimini görür; rol değişimi, yeni davet ve
 * katılım `oda.json`'da yaşar ve hiçbir belge güncellemesi üretmez. Her
 * üstveri yazan çağrı yerine elle "kaydet" eklemek, bir tanesi unutulduğunda
 * SESSİZCE bayat kayıt bırakırdı (Karar 2: kural tek evde). Tur her iki ekseni
 * de tek yerde ölçüyor:
 *  - belge → `Y.encodeStateVector` (birkaç düzine bayt, karşılaştırması bedava)
 *  - üstveri → serileştirilmiş metnin karşılaştırması
 * Değişmemiş oda için tur maliyeti mikrosaniyeler; yazım yalnız gerçekten
 * değişmişse yapılır.
 */
export class KalicilikTuru {
  private readonly depo: OdaDeposu;
  private readonly odalar: () => Iterable<Room>;
  private readonly aralikMs: number;
  private sayac: ReturnType<typeof setInterval> | null = null;
  /** Oda kimliği → son yazılan {durum vektörü, üstveri metni} parmak izi. */
  private izler = new Map<string, { vektor: string; ustveri: string }>();

  constructor(depo: OdaDeposu, odalar: () => Iterable<Room>, aralikMs = KAYIT_ARALIK_MS) {
    this.depo = depo;
    this.odalar = odalar;
    this.aralikMs = kayitAraligiKisitla(aralikMs);
  }

  baslat(): void {
    if (this.sayac) return;
    this.sayac = setInterval(() => this.tur(), this.aralikMs);
    /* Sunucu kapanışı turu beklemesin diye `unref`: tur tek başına süreci
       ayakta tutmamalı. Kapanışta `hepsiniYaz` zaten çağrılıyor. */
    this.sayac.unref?.();
  }

  durdur(): void {
    if (this.sayac) clearInterval(this.sayac);
    this.sayac = null;
  }

  /** Değişmiş odaları yazar; değişen oda sayısını döndürür. */
  tur(): number {
    let yazilan = 0;
    for (const room of this.odalar()) {
      if (room.closed) continue;
      if (this.odaYaz(room, false)) yazilan++;
    }
    return yazilan;
  }

  /** Tek odayı yazar. `zorla` parmak izi denetimini atlar (kapanış yolu). */
  odaYaz(room: Room, zorla: boolean): boolean {
    const ham = Y.encodeStateVector(room.doc);
    const vektor = Buffer.from(ham).toString('base64');
    const kayit = odaKaydiCikar(room);
    const ustveri = JSON.stringify(kayit);
    const iz = this.izler.get(room.id);
    if (!zorla && iz && iz.vektor === vektor && iz.ustveri === ustveri) return false;

    /* Hiç yazılmamış odanın belgesi GÖNDERİLMEZ (boş durum vektörü tek
       bayttır). Üstveri yine de yazılır ki oda kodu yeniden başlatmadan
       sonra da çalışsın. */
    this.depo.yaz(kayit, ham.length <= 1 ? new Uint8Array() : Y.encodeStateAsUpdate(room.doc));
    this.izler.set(room.id, { vektor, ustveri });
    return true;
  }

  unut(roomId: string): void {
    this.izler.delete(roomId);
  }
}
