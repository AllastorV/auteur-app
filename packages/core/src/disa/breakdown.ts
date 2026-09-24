import type { BreakdownSatiri } from '../model/breakdown';
import type { DilAdi } from '../format/profil';
import { TERIMLER } from '../format/terim';
import { markdownKacir } from './duz';

/**
 * Çekim dökümü (breakdown) dışa aktarımı — §13.2 borcu, görev tanımının
 * istediği CSV ve Markdown.
 *
 * Markdown kaçırma `disa/duz.ts`teki `markdownKacir`i ÇAĞIRIYOR — ikinci bir
 * kaçırma yazmak Karar 2'yi kırardı (o dosyanın kendi gerekçesi: "biri
 * düzeltilip öteki unutulurdu").
 *
 * İÇ/DIŞ ve zaman etiketleri `format/terim.ts`teki `TERIMLER`den — sahne
 * başlığında kullanılan AYNI terimler, burada YENİDEN YAZILMIYOR.
 */

function icDisEtiketi(satir: BreakdownSatiri, dil: DilAdi): string {
  return TERIMLER[dil].mekan[satir.icDis];
}

function zamanEtiketi(satir: BreakdownSatiri, dil: DilAdi): string {
  return satir.zaman ? TERIMLER[dil].zaman[satir.zaman] : '';
}

/** CSV alanı — virgül/tırnak/satır sonu içeriyorsa RFC4180 tırnaklaması. */
function csvAlan(deger: string): string {
  if (/[",\n\r]/u.test(deger)) return `"${deger.replace(/"/gu, '""')}"`;
  return deger;
}

/* Sütun başlıkları BELGE DİLİNDEN — gerekçesi `terim.ts`teki
   `DokumEtiketleri` başlığında yazılı. Sabit dizi olmaktan çıktı çünkü
   artık dile bağlı. */
function basliklar(dil: DilAdi): string[] {
  const d = TERIMLER[dil].dokum;
  return [d.sahne, d.baslik, d.icDis, d.mekan, d.zaman, d.karakterler,
    d.sureDk, d.ozelEsya, d.kostum, d.efekt, d.notlar];
}

/**
 * CSV yazıcı.
 *
 * BAŞINDA BOM: Türkçe karakterli (İ, ı, ş, ğ) bir CSV'yi Excel'in Windows'ta
 * UTF-8 olarak DOĞRU açması için gerekiyor — BOM'suz dosya Excel'de varsayılan
 * yerel kod sayfasıyla okunur ve Türkçe harfler bozuk çıkar.
 */
export function breakdownCsvYaz(satirlar: readonly BreakdownSatiri[], dil: DilAdi): string {
  const satirYaz = (hucre: string[]) => hucre.map(csvAlan).join(',');
  const gövde = satirlar.map((s) => satirYaz([
    String(s.sira + 1),
    s.baslik,
    icDisEtiketi(s, dil),
    s.mekan,
    zamanEtiketi(s, dil),
    s.karakterler.join('; '),
    s.ek.sureTahmini === null ? '' : String(s.ek.sureTahmini),
    s.ek.ozelEsya.join('; '),
    s.ek.kostum.join('; '),
    s.ek.efekt.join('; '),
    s.ek.notlar,
  ]));
  return '﻿' + [satirYaz(basliklar(dil)), ...gövde].join('\r\n') + '\r\n';
}

/** Etiket: değer satırı — boşsa hiç yazılmaz (yutulan bilgi değil, gösterilecek bir şey yok). */
function alan(etiket: string, deger: string): string {
  return deger ? `- **${etiket}:** ${markdownKacir(deger)}\n` : '';
}

/**
 * Markdown yazıcı — sahne başına bir bölüm.
 *
 * OTOMATİK toplanan alanlarla ELLE girilenler AYRI başlık altında: ekranda
 * kurulan ayrım (görev tanımı) dışa aktarımda da kaybolmamalı, yoksa okuyan
 * kişi hangi bilginin senaryodan hangisinin yapımcının kararı olduğunu
 * karıştırır.
 */
export function breakdownMarkdownYaz(satirlar: readonly BreakdownSatiri[], dil: DilAdi): string {
  const d = TERIMLER[dil].dokum;
  const bolumler = satirlar.map((s) => {
    const otomatik =
      alan(d.icDis, icDisEtiketi(s, dil)) +
      alan(d.mekan, s.mekan) +
      alan(d.zaman, zamanEtiketi(s, dil)) +
      alan(d.karakterler, s.karakterler.join(', '));
    const elle =
      alan(d.sure, s.ek.sureTahmini === null ? '' : `${s.ek.sureTahmini} ${d.dakikaKisa}`) +
      alan(d.ozelEsya, s.ek.ozelEsya.join(', ')) +
      alan(d.kostum, s.ek.kostum.join(', ')) +
      alan(d.efekt, s.ek.efekt.join(', ')) +
      alan(d.notlar, s.ek.notlar);
    return (
      `## ${s.sira + 1}. ${markdownKacir(s.baslik)}\n\n` +
      `### ${d.otomatik}\n\n${otomatik || `_${d.yok}_\n`}\n` +
      `### ${d.elle}\n\n${elle || `_${d.yok}_\n`}`
    );
  });
  return bolumler.join('\n\n') + '\n';
}
