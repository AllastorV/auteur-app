import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomik';
import {
  yazarlikBasligi,
  yazarlikCercevesi,
  yazarlikCozumle,
  type YazarlikKaydi,
} from '@storyboard/core/veri/yazarlik';
import { GUNLUK_PENCERE_MS } from '@storyboard/core/veri/kontrol-noktalari';

/**
 * Yazarlık günlüğünün disk katmanı — "bu satırı kim yazdı" sorusu.
 *
 * `gunluk-deposu.ts`nin kalıbını izler: ELECTRON'A BAĞLI DEĞİL, kök dizin
 * dışarıdan verilir, gerçek dosyalarla birim testi yazılabilir.
 *
 * Yerleşim: `<kok>/<projeId>/yazarlik.log` — `gunluk-deposu.ts`nin
 * `oturum.log`u ile AYNI proje dizini, ayrı dosya. Aynı proje, aynı YOL
 * SINIRI (`projeId` denetimi), farklı içerik.
 */

const YAZARLIK_ADI = 'yazarlik.log';

export interface YazarlikDepo {
  readonly dizin: string;
  /** Kayıtları günlüğe EKLER (append); üzerine yazma YOK. */
  ekle(kayitlar: readonly YazarlikKaydi[]): void;
  /** Günlüğün tamamı; hiç yoksa boş dizi. */
  oku(): YazarlikKaydi[];
  /** `GUNLUK_PENCERE_MS`den (30 gün) eski kayıtları atar. */
  buda(simdi: number): void;
}

export function yazarlikDeposu(kok: string, projeId: string): YazarlikDepo {
  /* `projeId` YOL SINIRI — `gunluk-deposu.ts`teki denetimin BİREBİR AYNISI.
     Gevşetilmedi: aynı proje kimliği aynı tehdide açık — renderer'dan gelen
     `meta.id`, `../..` taşıyabilir. */
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
  const yol = path.join(dizin, YAZARLIK_ADI);

  const hazirla = () => fs.mkdirSync(dizin, { recursive: true });

  const okuHam = (): Uint8Array | null => {
    try {
      return new Uint8Array(fs.readFileSync(yol));
    } catch {
      return null;
    }
  };

  const govdeyiYaz = (kayitlar: readonly YazarlikKaydi[]) => {
    const cerceveler = kayitlar.map((k) => yazarlikCercevesi(k));
    const toplam = cerceveler.reduce((t, c) => t + c.length, 0);
    const baslik = yazarlikBasligi();
    const cikti = new Uint8Array(baslik.length + toplam);
    cikti.set(baslik, 0);
    let konum = baslik.length;
    for (const c of cerceveler) {
      cikti.set(c, konum);
      konum += c.length;
    }
    writeFileAtomic(yol, cikti);
  };

  return {
    dizin,

    ekle(kayitlar) {
      if (!kayitlar.length) return;
      hazirla();
      const cerceveler = kayitlar.map((k) => yazarlikCercevesi(k));
      const toplam = cerceveler.reduce((t, c) => t + c.length, 0);
      const cikti = new Uint8Array(toplam);
      let konum = 0;
      for (const c of cerceveler) {
        cikti.set(c, konum);
        konum += c.length;
      }
      /* Dosya yoksa BAŞLIKLA kurulur — başlıksız kurulsaydı çözümleyici
         dosyayı "yabancı" sayardı (bkz. gunluk-deposu.ts). */
      if (!fs.existsSync(yol)) fs.writeFileSync(yol, yazarlikBasligi());
      fs.appendFileSync(yol, cikti);
    },

    oku() {
      const bayt = okuHam();
      if (!bayt) return [];
      return yazarlikCozumle(bayt).kayitlar;
    },

    buda(simdi) {
      const bayt = okuHam();
      if (!bayt) return;
      const { kayitlar } = yazarlikCozumle(bayt);
      /* YENİ BİR SAYI İCAT EDİLMEDİ: ufuk `kontrol-noktalari.ts`teki
         `GUNLUK_PENCERE_MS` — çıpa halkası ve arşiv budaması da aynı 30 günü
         kullanıyor. */
      const tutulan = kayitlar.filter((k) => simdi - k.zaman < GUNLUK_PENCERE_MS);
      if (tutulan.length === kayitlar.length) return; // silinecek yok — yeniden yazma.
      /* Budama bir REWRITE, ekleme değil: atomik yazım şart, aksi halde
         yarıda kalan bir budama bütün günlüğü götürür. */
      govdeyiYaz(tutulan);
    },
  };
}
