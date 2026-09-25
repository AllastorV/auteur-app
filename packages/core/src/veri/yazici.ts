import * as Y from 'yjs';
import { cerceve } from './gunluk';
import { birlestir, type YazarlikKaydi } from './yazarlik';
import { t, tf } from '../dil/arayuz';

/**
 * Günlük yazıcısı — §15.2'nin 1. ve 2. katmanını süren zamanlayıcı.
 *
 * React'ten BAĞIMSIZ bir sınıf. Gerekçe: "yazdıkların her saniye günlüğe
 * işleniyor" sözü §15.2.1'in taşıyıcısıdır ve bir bileşenin içinde yaşarsa
 * ancak tarayıcı testiyle sınanabilir. Burada sahte zamanlayıcıyla birim
 * testi yazılıyor.
 */

/** Yazıcının diske eriştiği tek yüzey. Kabuk (Electron) uygular. */
export interface YaziciKabugu {
  /** Çerçeveleri günlüğe EKLER. Yerinde yazma yasak (§15.2). */
  gunlugeEkle(cerceveler: Uint8Array): Promise<void>;
  /**
   * Çıpayı ATOMİK yazar, ANCAK ONDAN SONRA günlüğü keser.
   *
   * Sıra sözleşmedir ve kabukta uygulanır: ters sırada, ikisi arasındaki
   * çökme kesilmiş günlüğü çıpasız bırakır ve o aralıktaki bütün iş gider.
   */
  cipaYazVeGunlugeKes(cipa: Uint8Array): Promise<void>;
  /**
   * Yazarlık kaydı ekler — OPSİYONEL. Kabuk desteklemiyorsa (`undefined`)
   * yazarlık izlemesi sessizce devre dışı kalır: bu supplementary metadata,
   * içerik yazımının aksine §15'in kayıp tavanına tabi DEĞİL.
   */
  yazarlikEkle?(kayitlar: YazarlikKaydi[]): Promise<void>;
}

export interface YaziciDurumu {
  /** ARKA ARKAYA başarısız yazım sayısı. Başarıda sıfırlanır. */
  ardArdaHata: number;
  sonHata: string | null;
  /**
   * §15.4: ilk hatada bildirim, arka arkaya İKİNCİ hatada kalıcı şerit.
   * "Bildirimi kaçırmak mümkündür, şeridi kaçırmak değildir."
   */
  engelleyici: boolean;
  /** Son BAŞARILI günlük yazımının anı. Arayüzde her zaman görünür (§15.4). */
  sonYazim: number | null;
  /** Henüz diske ulaşmamış çerçeve sayısı. */
  bekleyen: number;
}

export interface YaziciSecenekleri {
  /** Günlük boşaltma aralığı. §15.2 kayıp tavanı: ≤1 sn. */
  gunlukMs?: number;
  /** Çıpa aralığı. §15.2.1 varsayılanı 5 dk, 1-30 dk arası ayarlanabilir. */
  cipaMs?: number;
  /** Kabuk çağrısı bu süre içinde dönmezse HATA sayılır. */
  zamanAsimiMs?: number;
  simdi?: () => number;
  /**
   * Yazarlık kaydı için yazar adı — HER ÇAĞRIDA GÜNCEL değeri okunur (ortak
   * çalışma oturumu kimliği değişebilir). Boş dönerse o aralıkta dokunulan
   * bloklar için kayıt YAZILMAZ — uydurma bir isimle kayıt açmak yanlış
   * vaat olurdu.
   */
  yazar?: () => string;
}

export const GUNLUK_ARALIK_MS = 1000;
export const CIPA_ARALIK_MS = 5 * 60_000;
export const CIPA_EN_KISA_MS = 60_000;
export const CIPA_EN_UZUN_MS = 30 * 60_000;

/**
 * Kabuk çağrısı için zaman aşımı.
 *
 * Askıda kalan bir yazım (ağ sürücüsü uykuya daldı, virüs tarayıcısı dosyayı
 * tuttu, NAS düştü) ne `resolve` ne `reject` eder. Zaman aşımı olmasaydı
 * `yaziyor` sonsuza dek `true` kalır, `catch` hiç çalışmaz, hata sayacı hiç
 * artmaz ve §15.4'ün şeridi hiç açılmazdı; üstelik `sonYazim` en son BAŞARILI
 * yazımın saatini göstermeye devam ederdi. Kullanıcı korunduğunu sanarak bir
 * saat yazar, elektrik keser, diskte tek bayt olmazdı. §15.4'ün "sessiz
 * başarısızlık yasağı" tam olarak bunu yasaklıyor.
 *
 * Değer boşaltma aralığının katı: normal bir yazım milisaniyeler sürer, bu
 * yüzden 10 sn'lik tavan sağlıklı yazımı asla kesmez.
 */
export const KABUK_ZAMAN_ASIMI_MS = 10_000;

/** `p` verilen sürede bitmezse fırlatır. Askıda kalan çağrıyı HATAYA çevirir. */
function zamanAsimiyla<T>(p: Promise<T>, ms: number, ad: string): Promise<T> {
  return new Promise<T>((coz, hata) => {
    const sayac = setTimeout(
      () => hata(new Error(tf('%s %d sn içinde yanıt vermedi', t(ad), Math.round(ms / 1000)))),
      ms,
    );
    p.then(
      (v) => { clearTimeout(sayac); coz(v); },
      (e) => { clearTimeout(sayac); hata(e); },
    );
  });
}

/** §15.2.1: aralık ayarlanabilir ama KAPATILAMAZ. */
export function cipaAraligiKisitla(ms: number): number {
  if (!Number.isFinite(ms)) return CIPA_ARALIK_MS;
  return Math.max(CIPA_EN_KISA_MS, Math.min(CIPA_EN_UZUN_MS, ms));
}

export class GunlukYazici {
  private readonly doc: Y.Doc;
  private readonly kabuk: YaziciKabugu;
  private readonly gunlukMs: number;
  private readonly cipaMs: number;
  private readonly zamanAsimiMs: number;
  private readonly simdi: () => number;

  private tampon: Uint8Array[] = [];
  private gunlukZaman: ReturnType<typeof setInterval> | null = null;
  private cipaZaman: ReturnType<typeof setInterval> | null = null;
  private yaziyor = false;
  private dinleyici: ((u: Uint8Array) => void) | null = null;
  private abone = new Set<(d: YaziciDurumu) => void>();
  private readonly yazar: () => string;

  /** Bu boşaltma aralığında editörden BİLDİRİLEN, henüz gönderilmemiş bloklar. */
  private bloklarTamponu = new Set<string>();
  /**
   * Henüz DİSKE YAZILMAMIŞ yazarlık kayıtları — SONUNCUSU hâlâ AÇIK: bir
   * sonraki boşaltmada aynı yazar aynı bloklara dokunursa `birlestir` onu
   * genişletir, yeni bir disk satırı açmaz. Yalnız zincir KIRILDIĞINDA (yazar
   * ya da blok kümesi değişti, ya da pencere doldu) kapanan kayıtlar diske
   * gider (bkz. `yazarlikGonder`).
   */
  private yazarlikBekleyen: YazarlikKaydi[] = [];

  private _durum: YaziciDurumu = {
    ardArdaHata: 0,
    sonHata: null,
    engelleyici: false,
    sonYazim: null,
    bekleyen: 0,
  };

  constructor(doc: Y.Doc, kabuk: YaziciKabugu, secenekler: YaziciSecenekleri = {}) {
    this.doc = doc;
    this.kabuk = kabuk;
    this.gunlukMs = secenekler.gunlukMs ?? GUNLUK_ARALIK_MS;
    this.cipaMs = cipaAraligiKisitla(secenekler.cipaMs ?? CIPA_ARALIK_MS);
    this.zamanAsimiMs = secenekler.zamanAsimiMs ?? KABUK_ZAMAN_ASIMI_MS;
    this.simdi = secenekler.simdi ?? (() => Date.now());
    this.yazar = secenekler.yazar ?? (() => '');
  }

  /**
   * Editörün "bu işlem şu blokları değiştirdi" bildirimi.
   *
   * YENİ BİR TOPLAYICI DEĞİL: `editor/imlec.ts`teki düzenleme şeridi
   * eklentisi zaten her yerel işlemde dokunulan blokları hesaplıyor
   * (`degisenBloklar`) — bu metot onu, yazıcının zaten çalışan boşaltma
   * döngüsüne (§15.2'nin 1 sn'lik `bosalt` zamanlayıcısı) bağlıyor.
   */
  blokDokunusuBildir(blokIdler: readonly string[]): void {
    for (const id of blokIdler) this.bloklarTamponu.add(id);
  }

  durum(): YaziciDurumu {
    return { ...this._durum };
  }

  onDurum(cb: (d: YaziciDurumu) => void): () => void {
    this.abone.add(cb);
    return () => this.abone.delete(cb);
  }

  private yay(yama: Partial<YaziciDurumu>): void {
    this._durum = { ...this._durum, ...yama, bekleyen: this.tampon.length };
    for (const cb of this.abone) cb(this.durum());
  }

  baslat(): void {
    if (this.dinleyici) return;
    /* HER güncelleme günlüğe girer — uzak kaynaklı olanlar dahil. Yerel
       belgenin durumu tam olarak geri gelmeli; "uzak zaten sunucuda" demek,
       çevrimdışı düşmüş bir istemcide o işi kaybetmek olurdu. */
    this.dinleyici = (u: Uint8Array) => {
      this.tampon.push(cerceve(u, this.simdi()));
      this.yay({});
    };
    this.doc.on('update', this.dinleyici);
    this.gunlukZaman = setInterval(() => void this.bosalt(), this.gunlukMs);
    this.cipaZaman = setInterval(() => void this.cipaAl(), this.cipaMs);
  }

  durdur(): void {
    if (this.dinleyici) this.doc.off('update', this.dinleyici);
    this.dinleyici = null;
    if (this.gunlukZaman) clearInterval(this.gunlukZaman);
    if (this.cipaZaman) clearInterval(this.cipaZaman);
    this.gunlukZaman = null;
    this.cipaZaman = null;
  }

  /**
   * Bekleyen çerçeveleri diske yazar.
   *
   * BAŞARISIZLIKTA TAMPON KORUNUR ve çerçeveler başa geri konur. Düşürülseydi
   * geçici bir disk hatası (ağ sürücüsü, kilit, dolu disk) kullanıcının o
   * saniyedeki yazısını sessizce yok ederdi — §15'in yasakladığı tam olarak
   * budur.
   */
  async bosalt(): Promise<void> {
    if (this.yaziyor || !this.tampon.length) return;
    this.yaziyor = true;
    const yazilacak = this.tampon;
    this.tampon = [];
    try {
      await zamanAsimiyla(
        this.kabuk.gunlugeEkle(birlestirBaytlari(yazilacak)),
        this.zamanAsimiMs,
        'Günlük yazımı',
      );
      this.yay({ ardArdaHata: 0, sonHata: null, engelleyici: false, sonYazim: this.simdi() });
    } catch (err) {
      this.tampon = [...yazilacak, ...this.tampon];
      const sayi = this._durum.ardArdaHata + 1;
      this.yay({
        ardArdaHata: sayi,
        sonHata: err instanceof Error ? err.message : String(err),
        engelleyici: sayi >= 2,
      });
    } finally {
      this.yaziyor = false;
    }
    /* İÇERİK yazımından SONRA, ayrı bir best-effort adım: yazarlık bir
       attribution kaydı, içerik değil — biri başarısız olsa bile diğerini
       bloklamamalı. */
    await this.yazarlikGonder();
  }

  /**
   * Bekleyen blok bildirimlerini `birlestir` ile önceki AÇIK kayda ekler ve
   * ZİNCİRİ KIRAN (yazar/blok kümesi değişti ya da pencere doldu) kayıtları
   * diske yazar. Sonuncusu kasıtla bellekte kalır — bir sonraki çağrıda hâlâ
   * genişleyebilir.
   */
  private async yazarlikGonder(): Promise<void> {
    if (this.bloklarTamponu.size && this.yazar()) {
      this.yazarlikBekleyen.push({
        zaman: this.simdi(),
        yazar: this.yazar(),
        bloklar: [...this.bloklarTamponu],
      });
    }
    this.bloklarTamponu.clear();
    if (!this.kabuk.yazarlikEkle || !this.yazarlikBekleyen.length) return;

    const birlesmis = birlestir(this.yazarlikBekleyen);
    const kesinlesen = birlesmis.slice(0, -1);
    this.yazarlikBekleyen = birlesmis.slice(-1);
    if (!kesinlesen.length) return;
    try {
      await this.kabuk.yazarlikEkle(kesinlesen);
    } catch {
      /* Yoksay: bir attribution kaydı kaybolur, kullanıcının METNİ değil.
         §15'in "sessiz başarısızlık yasağı" içerik yazımı için — bu onun
         dışında, ayrı bir günlük. */
    }
  }

  /**
   * Bellekte bekleyen (hâlâ birleşebilir) AÇIK yazarlık kaydını ZORLA yazar.
   *
   * Oturum kapanırken çağrılmalı (bkz. `useVeriGuvenligi`): normal akışta
   * kasıtla bellekte tutulan son kayıt, kapanışta hiç yazılmazsa son birkaç
   * saniyenin "kim yazdı" bilgisi sessizce kaybolur.
   */
  async yazarlikZorlaBosalt(): Promise<void> {
    if (!this.kabuk.yazarlikEkle || !this.yazarlikBekleyen.length) return;
    const kayitlar = this.yazarlikBekleyen;
    this.yazarlikBekleyen = [];
    try {
      await this.kabuk.yazarlikEkle(kayitlar);
    } catch {
      /* best-effort — bkz. yazarlikGonder. */
    }
  }

  /**
   * Çıpa alır: önce bekleyen çerçeveler boşaltılır, sonra kabuk çıpayı yazıp
   * günlüğü keser.
   *
   * Boşaltma ÖNCE gelir çünkü çıpa `doc`'un o anki hâlini kodluyor; bekleyen
   * çerçeveler zaten çıpanın içinde olacak, ama boşaltma başarısız olursa
   * günlüğün kesilmemesi gerekir.
   *
   * Koşul TAMPONA bakar, hata SAYACINA değil. Sayaca bakılsaydı bir çıpa
   * hatasının kendisi sonraki denemeleri de bloklardı: sayaç 1'de donar,
   * arka arkaya ikinci hata hiç oluşmaz ve §15.4'ün engelleyici şeridi
   * KALICI bir çıpa arızasında hiç açılmazdı (ölçüldü).
   */
  async cipaAl(): Promise<void> {
    await this.bosalt();
    if (this.tampon.length) return;
    try {
      await zamanAsimiyla(
        this.kabuk.cipaYazVeGunlugeKes(Y.encodeStateAsUpdate(this.doc)),
        this.zamanAsimiMs,
        'Çıpa yazımı',
      );
      this.yay({ ardArdaHata: 0, sonHata: null, engelleyici: false, sonYazim: this.simdi() });
    } catch (err) {
      const sayi = this._durum.ardArdaHata + 1;
      this.yay({
        ardArdaHata: sayi,
        sonHata: err instanceof Error ? err.message : String(err),
        engelleyici: sayi >= 2,
      });
    }
  }
}

/** Çerçeve parçalarını tek bayt dizisinde birleştirir — `veri/yazarlik.ts`teki
    kayıt-birleştiren `birlestir`den AYRI: bu yalnız bayt concat. */
function birlestirBaytlari(parcalar: readonly Uint8Array[]): Uint8Array {
  const toplam = parcalar.reduce((t, p) => t + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) {
    cikti.set(p, k);
    k += p.length;
  }
  return cikti;
}
