import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomik';
import {
  cipaAyikla,
  cipaBirlestir,
  cipaEksikVarliklar,
  cipaParcala,
  varlikDeposu,
  type CipaParcalari,
  type VarlikDepo,
} from './varlik-deposu';
import { arsivBudamasi, seyrelt } from '@storyboard/core/veri/kontrol-noktalari';

/**
 * §15'in disk katmanı — günlük dosyası ve çıpa kuşak halkası.
 *
 * ELECTRON'A BAĞLI DEĞİL: kök dizin dışarıdan verilir, böylece gerçek
 * dosyalarla birim testi yazılabilir. Electron yalnızca kök dizini seçer.
 *
 * Yerleşim:
 * ```
 * <kok>/<projeId>/
 *   oturum.log            1. katman — eklenerek yazılır
 *   cipa-<zaman>.yjs      3. katman — kuşak halkası, en yeni önce
 *   kurtarma/<zaman>.log  §15.3 "Yoksay ve yedeği koru"
 * <kok>/varliklar/<özet>  içerik adresli varlık deposu — PROJELER ARASI ORTAK
 * ```
 *
 * Varlıklar çıpanın İÇİNDE DEĞİL: her çıpa bütün görsellerin bir kopyasını
 * taşıdığı için 30 günlük halka 354,6 MB'a çıkıyordu (ölçüldü). Baytlar
 * `varliklar/` altında bir kez duruyor, çıpaya yalnız `varlikId → özet`
 * eşlemesi giriyor. Ayrıntı ve GERİYE UYUM: `varlik-deposu.ts`.
 */

const GUNLUK_ADI = 'oturum.log';
const CIPA_ONEK = 'cipa-';
const CIPA_SONEK = '.yjs';

export interface CipaKaydi {
  id: string;
  zaman: number;
}

export interface GunlukDepo {
  readonly dizin: string;
  /** Çerçeveleri günlüğe EKLER; dosya yoksa başlıkla kurar. */
  ekle(cerceveler: Uint8Array, baslik: Uint8Array): void;
  /** Günlüğün tamamı; hiç yoksa `null`. */
  oku(): Uint8Array | null;
  /** Çıpayı atomik yazar, SONRA günlüğü keser. Sıra sözleşmedir (§15.2). */
  /**
   * Çıpayı atomik yazar, SONRA günlüğü keser ve halkayı seyreltir.
   *
   * `seyreltme` yalnız GERİ DÖNÜŞ yolunda kapatılıyor: orada bu çağrı bir
   * güvenlik noktası yazıyor ve hemen ardından ESKİ bir nokta okunacak.
   * Seyreltme açık kalırsa aynı çağrı, birazdan okunacak hedefi budayabilir
   * — kullanıcının kendi eliyle tetiklediği bir işlem, dönmek istediği anı
   * yok eder. Bir turluk seyreltme atlamanın maliyeti yok: halka her 5
   * dakikalık normal çıpada zaten seyreliyor.
   */
  cipaYazVeKes(cipa: Uint8Array, zaman: number, seyreltme?: boolean): void;
  /** Kuşak halkası, YENİDEN ESKİYE. */
  halka(): CipaKaydi[];
  /** Çıpa; varlıkları depodan geri konmuş hâlde. Eksik varlık açılışı ENGELLEMEZ. */
  cipaOku(id: string): Uint8Array;
  /**
   * Çıpa PARÇALARI: varlıksız gövde + varlık baytları ayrı. Günlük
   * OYNATACAK okuma yolu bunu kullanır — geri koyma günlükten sonra,
   * çekirdekte yapılır (yarış + dirilme; bkz. `cipaParcala`).
   */
  cipaParcaliOku(id: string): CipaParcalari;
  /**
   * Çıpanın indeksinde olup depoda bulunamayan varlıkların kimlikleri.
   * Belgeyi çözmeden bakar — arayüzün "şu kadar görsel bulunamadı" bildirimi.
   */
  eksikVarliklar(id: string): string[];
  /** İçerik adresli varlık deposu — boyut sayacı ve testler için. */
  readonly varliklar: VarlikDepo;
  /** §15.3: günlüğü SİLMEZ, `kurtarma/` altına taşır. */
  arsivle(zaman: number): string | null;
}

export function gunlukDeposu(kok: string, projeId: string): GunlukDepo {
  /* `projeId` bir YOL SINIRIDIR — `cipaOku`'nun ad denetimiyle aynı sınır, bir
     seviye yukarısı. Değer renderer'dan geliyor ve `meta.id` açılan `.sbp`
     dosyasından olduğu gibi alınıyor; yani başka birinden gelen bir proje
     `../..` taşıyabilir. Denetlenmeseydi `cipaYazVeKes` veri kökünün DIŞINDAKİ
     bir `oturum.log`'u silerdi ve `arsivle` oraya dosya taşırdı.

     Ayraçlar ELLE sayılıyor, `path.basename` ile değil: POSIX'te `\` ayraç
     sayılmaz, oysa `.sbp` Windows'ta yazılıp Linux'ta okunabilir. Platforma
     göre değişen bir güven sınırı, bir platformda sessizce açık kalırdı. */
  if (
    !projeId ||
    projeId.includes('/') ||
    projeId.includes('\\') ||
    projeId.includes('..') ||
    projeId === '.'
  ) {
    throw new Error(`Gecersiz proje kimligi: ${projeId}`);
  }
  const dizin = path.join(kok, projeId);
  const gunlukYolu = path.join(dizin, GUNLUK_ADI);
  /* Depo PROJE ALTINDA DEĞİL, kökte: aynı görsel iki projede de kullanılıyorsa
     diskte tek kopya kalsın. */
  const varliklar = varlikDeposu(kok);

  const hazirla = () => fs.mkdirSync(dizin, { recursive: true });

  /* Çıpa adı bir YOL SINIRIDIR: `id` halkadan geliyor ama `..` içeren bir ad
     dizin dışına çıkardı. `cipaOku` ve `eksikVarliklar` AYNI sınırı paylaşır;
     iki ayrı denetim yazılsaydı biri güncellenip diğeri unutulabilirdi. */
  const adDenetle = (id: string) => {
    if (id.includes('/') || id.includes('\\') || id.includes('..')) {
      throw new Error(`Gecersiz cipa adi: ${id}`);
    }
    return path.join(dizin, id);
  };

  return {
    dizin,
    varliklar,

    ekle(cerceveler, baslik) {
      hazirla();
      /* Dosya yoksa BAŞLIKLA kurulur. Başlıksız kurulsaydı çözümleyici
         dosyayı "yabancı" sayar ve bütün günlüğü oynatmayı reddederdi. */
      if (!fs.existsSync(gunlukYolu)) fs.writeFileSync(gunlukYolu, baslik);
      fs.appendFileSync(gunlukYolu, cerceveler);
    },

    oku() {
      try {
        return new Uint8Array(fs.readFileSync(gunlukYolu));
      } catch {
        return null;
      }
    },

    cipaYazVeKes(cipa, zaman, seyreltme = true) {
      hazirla();
      /* Varlıklar ÖNCE depoya (bu çağrının içinde), çıpa SONRA: ters sırada,
         ikisi arasındaki çökme özet taşıyan ama baytları hiç yazılmamış bir
         çıpa bırakırdı. Ayrıştırma başarısızsa `cipa` OLDUĞU GİBİ döner —
         çıpa yazımı hiçbir koşulda bu yüzden düşmez. */
      writeFileAtomic(
        path.join(dizin, `${CIPA_ONEK}${zaman}${CIPA_SONEK}`),
        cipaAyikla(cipa, varliklar),
      );
      /* Kesme çıpadan SONRA. Ters sırada, ikisi arasındaki çökme kesilmiş
         günlüğü çıpasız bırakır ve o aralıktaki bütün iş gider. */
      fs.rmSync(gunlukYolu, { force: true });
      /* Budama §15.2.2'nin SEYRELME politikasına göre: son 1 saat her
         nokta, 24 saate kadar saatlik, 30 güne kadar günlük.

         Sabit sayı burada yeterli DEĞİLDİ: beş dakikalık
         çıpa aralığıyla üç kayıt ~15 dakikalık bir geri dönüş penceresi
         demek. Bir hatayı ertesi gün fark eden kullanıcının dönecek noktası
         kalmıyordu — oysa spec aynı disk maliyetiyle 30 gün vaat ediyor ve
         politika `seyrelt`'te yazılmış, ölçülmüş, ama hiç ÇAĞRILMAMIŞTI. */
      if (!seyreltme) return;
      const sonuc = seyrelt(
        this.halka().map((c) => ({ id: c.id, zaman: c.zaman })),
        zaman,
      );
      for (const eski of sonuc.silinen) {
        fs.rmSync(path.join(dizin, eski.id), { force: true });
      }
    },

    halka() {
      let girisler: string[];
      try {
        girisler = fs.readdirSync(dizin);
      } catch {
        return [];
      }
      return girisler
        .filter((a) => a.startsWith(CIPA_ONEK) && a.endsWith(CIPA_SONEK))
        .map((a) => ({
          id: a,
          zaman: Number(a.slice(CIPA_ONEK.length, -CIPA_SONEK.length)),
        }))
        /* Damgası okunamayan dosya ELENİR, sıfır sayılmaz: sıfır zaman onu en
           eski yapar ve budama sırasında sağlam bir çıpanın önüne geçebilirdi. */
        .filter((c) => Number.isFinite(c.zaman) && c.zaman > 0)
        .sort((a, b) => b.zaman - a.zaman);
    },

    cipaOku(id) {
      const ham = new Uint8Array(fs.readFileSync(adDenetle(id)));
      /* Zarfsız (ESKİ biçim, varlıkları gömülü) çıpa olduğu gibi döner. */
      return cipaBirlestir(ham, varliklar).cipa;
    },

    cipaParcaliOku(id) {
      const ham = new Uint8Array(fs.readFileSync(adDenetle(id)));
      return cipaParcala(ham, varliklar);
    },

    eksikVarliklar(id) {
      const yol = adDenetle(id); // ad denetimi try'ın DIŞINDA: yutulmamalı.
      let ham: Uint8Array;
      try {
        ham = new Uint8Array(fs.readFileSync(yol));
      } catch {
        /* Çıpanın kendisi okunamıyorsa eksik varlık sorusu ANLAMSIZ; asıl
           hatayı `cipaOku` fırlatacak ve kullanıcı onu görecek. */
        return [];
      }
      return cipaEksikVarliklar(ham, varliklar);
    },

    arsivle(zaman) {
      if (!fs.existsSync(gunlukYolu)) return null;
      const hedefDizin = path.join(dizin, 'kurtarma');
      fs.mkdirSync(hedefDizin, { recursive: true });
      const hedef = path.join(hedefDizin, `${zaman}.log`);
      /* Taşınır, SİLİNMEZ (§15.3): "kullanıcının yanlış tuşa basması veri
         kaybı olmamalıdır." */
      fs.renameSync(gunlukYolu, hedef);
      /* Arşiv de budanıyor: "sil değil taşı" kuralı, taşınan yere hiç
         dokunulmazsa sınırsız büyüyen bir çöplük demek. Politika ortak
         (`arsivBudamasi`) — 30 günden genç her şey ve yaşı ne olursa olsun
         en yeni 5 kayıt tutuluyor. */
      try {
        const kayitlar = fs
          .readdirSync(hedefDizin)
          .filter((a) => a.endsWith('.log'))
          .map((a) => ({ id: a, zaman: Number(a.slice(0, -4)) }))
          /* Damgası okunamayan dosya ELENİR, sıfır sayılmaz: sıfır zaman
             onu en eski yapar ve sağlam bir arşivin önüne geçebilirdi. */
          .filter((k) => Number.isFinite(k.zaman) && k.zaman > 0);
        for (const eski of arsivBudamasi(kayitlar, zaman).silinen) {
          fs.rmSync(path.join(hedefDizin, eski.id), { force: true });
        }
      } catch {
        /* Budama başarısızsa arşivleme BAŞARILI sayılır: kullanıcının işi
           taşınmış durumda ve asıl iş odur. Temizlik bir sonraki turda. */
      }
      return hedef;
    },
  };
}
