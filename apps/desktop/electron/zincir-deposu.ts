import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  zincirBasligi,
  zincirCercevesi,
  zincirCozumle,
  type ZincirKaydi,
  type ZincirDurumu,
} from '@storyboard/core/veri/zincir';

/**
 * MÜHÜR ZİNCİRİNİN DİSK KATMANI.
 *
 * `gunluk-deposu.ts` ve `yazarlik-deposu.ts` kalıbı: Electron'a bağlı
 * değil, kök dizin dışarıdan veriliyor, gerçek dosyalarla test edilebiliyor,
 * `projeId` yol sınırı BİREBİR aynı.
 *
 * Yerleşim:
 * ```
 * <kok>/<projeId>/zincir.log          asla budanmaz, asla yeniden yazılmaz
 * <kok>/<projeId>/muhur/<zaman>.txt.gz mühürlenen metnin kendisi
 * <kok>/<projeId>/muhur/<zaman>.tsr    RFC 3161 jetonu (varsa)
 * ```
 *
 * ## İKİ FARK — kardeşlerinden bilerek ayrılıyor
 *
 * **1. BUDAMA YOK, REWRITE YOK.** `yazarlik-deposu.ts` `buda()` ile dosyayı
 * yeniden yazıyor; burada öyle bir yol AÇILMADI. Bir hash zincirini yeniden
 * yazmak zinciri kırar ve kırık zincir kurcalanmış zincirden ayırt edilemez.
 * Maliyet ödenebilir: kayıt yalnız mühür olaylarında yazılıyor.
 *
 * **2. `fsync` VAR.** `atomik.ts` bilerek `fsync` yapmıyor (`ponytail:`
 * yorumu) ve o karar DEĞİŞMİYOR — sıcak yol için doğru. Kanıt yolu onun
 * istisnası: seyrek, ~130 baytlık ve kullanıcıya "mühürlendi" diye vaat
 * edilen bir yazım. Vaatten sonraki otuz saniyede elektrik kesilirse kaydın
 * işletim sistemi önbelleğinde buharlaşması kabul edilemez.
 *
 * ## Metin neden saklanıyor
 *
 * Çıpalar seyreltiliyor; metin saklanmazsa geçmiş bir mühür DOĞRULANAMAZ —
 * elinde özet var ama neyin özeti olduğu yok. `node:zlib` ile sıkışıyor:
 * 120 KB'lık bir senaryo ~25 KB.
 */

const ZINCIR_ADI = 'zincir.log';
const MUHUR_DIZINI = 'muhur';

export interface ZincirDepo {
  readonly dizin: string;
  /** Kaydı zincire EKLER ve mühürlenen metni saklar. fsync'li. */
  muhurYaz(kayit: ZincirKaydi, metin: Uint8Array): void;
  /** Damga kaydını ekler ve DER jetonunu saklar. fsync'li. */
  damgaYaz(kayit: ZincirKaydi, jeton: Uint8Array): void;
  /** Zincirin tamamı + çözümleme durumu. Dosya yoksa boş ve `tam`. */
  oku(): { kayitlar: ZincirKaydi[]; durum: ZincirDurumu };
  /** Mühürlenen metnin baytları (açılmış). Yoksa `null`. */
  muhurMetni(zaman: number): Uint8Array | null;
  /** Damga jetonu (DER). Yoksa `null`. */
  damgaJetonu(zaman: number): Uint8Array | null;
}

/** Yol sınırı — `gunluk-deposu.ts`teki denetimin birebir aynısı. */
function projeIdDenetle(projeId: string): void {
  if (
    !projeId
    || projeId.includes('/')
    || projeId.includes('\\')
    || projeId.includes('..')
    || projeId === '.'
  ) {
    throw new Error(`Gecersiz proje kimligi: ${projeId}`);
  }
}

/**
 * fsync'li ekleme.
 *
 * `appendFileSync` yazımı işletim sistemine bırakır; `fsyncSync` diske
 * indiğini garanti eder. Dosya tanıtıcısı `finally`de kapanıyor: kapanmayan
 * bir tanıtıcı uzun oturumda tükenir ve o hata mühür yazımının kendisinden
 * çok sonra, alakasız bir yerde patlardı.
 */
function ekleVeSenkronla(yol: string, bayt: Uint8Array): void {
  const fd = fs.openSync(yol, 'a');
  try {
    fs.writeSync(fd, bayt);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function zincirDeposu(kok: string, projeId: string): ZincirDepo {
  projeIdDenetle(projeId);
  const dizin = path.join(kok, projeId);
  const yol = path.join(dizin, ZINCIR_ADI);
  const muhurDizini = path.join(dizin, MUHUR_DIZINI);

  const hazirla = () => {
    fs.mkdirSync(muhurDizini, { recursive: true });
  };

  /** Zamanın dosya adı olarak kullanılabileceğini garanti eder. */
  const zamanAdi = (zaman: number): string => {
    if (!Number.isFinite(zaman)) throw new Error(`Gecersiz muhur zamani: ${zaman}`);
    return String(Math.trunc(zaman));
  };

  const zincireEkle = (kayit: ZincirKaydi) => {
    hazirla();
    /* Dosya yoksa BAŞLIKLA kurulur — başlıksız kurulsaydı çözümleyici
       dosyayı "yabancı" sayardı (kardeş depolarla aynı kural). */
    if (!fs.existsSync(yol)) ekleVeSenkronla(yol, zincirBasligi());
    ekleVeSenkronla(yol, zincirCercevesi(kayit));
  };

  return {
    dizin,

    muhurYaz(kayit, metin) {
      hazirla();
      /* METİN ÖNCE, KAYIT SONRA. Ters sıra çökme anında kaydı olan ama
         metni olmayan bir mühür bırakırdı — doğrulanamayan bir kanıt,
         hiç olmayan kanıttan kötüdür çünkü kullanıcı ona güvenir.
         (Çıpa/günlük sırasıyla aynı gerekçe.) */
      const sikisik = zlib.gzipSync(metin);
      fs.writeFileSync(path.join(muhurDizini, `${zamanAdi(kayit.zaman)}.txt.gz`), sikisik);
      zincireEkle(kayit);
    },

    damgaYaz(kayit, jeton) {
      hazirla();
      /* Damganın dayandığı MÜHRÜN zamanı etiketten değil, jeton dosyası
         damga kaydının kendi zamanıyla adlandırılıyor: iki damga aynı
         mühre alınabilir ve ikincisi birincisini ezmemeli. */
      fs.writeFileSync(path.join(muhurDizini, `${zamanAdi(kayit.zaman)}.tsr`), jeton);
      zincireEkle(kayit);
    },

    oku() {
      try {
        const bayt = new Uint8Array(fs.readFileSync(yol));
        const okuma = zincirCozumle(bayt);
        return { kayitlar: okuma.kayitlar, durum: okuma.durum };
      } catch {
        /* Dosya HİÇ YOKSA bu bir bozulma değil, henüz mühür alınmamış
           demektir — `bozuk` demek kullanıcıyı boşuna korkuturdu. */
        return { kayitlar: [], durum: 'tam' as ZincirDurumu };
      }
    },

    muhurMetni(zaman) {
      try {
        const sikisik = fs.readFileSync(path.join(muhurDizini, `${zamanAdi(zaman)}.txt.gz`));
        return new Uint8Array(zlib.gunzipSync(sikisik));
      } catch {
        return null;
      }
    },

    damgaJetonu(zaman) {
      try {
        return new Uint8Array(fs.readFileSync(path.join(muhurDizini, `${zamanAdi(zaman)}.tsr`)));
      } catch {
        return null;
      }
    },
  };
}
