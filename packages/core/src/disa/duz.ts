import { BLOK_ETIKETLERI, type ScriptBlock, type ScriptBlockType } from '../model/script';
import type { FormatProfili } from '../format/profil';
import { buyut } from '../format/terim';

/**
 * DÜZ METİN ve MARKDOWN dışa aktarımı (§16.2 borcu).
 *
 * §16.2 senaryo biçim listesinde bu ikisini sayıyordu ama yalnız PDF,
 * Fountain ve FDX yazılmıştı. Roman ve düz metin yazarının en çok istediği
 * çıktı bunlar: Fountain senaryo işaretlemesi taşıyor, FDX ikili bir sektör
 * biçimi — ikisi de bir romanı başka bir editöre taşımaz.
 *
 * ## Neden İKİ ayrı yazıcı değil
 *
 * Aynı gezinme (bloklar → satırlar), farklı süsleme. Ayrı yazılsalardı biri
 * düzeltilip öteki unutulurdu (Karar 2). Fark tek bir tabloda: hangi blok
 * hangi işaretle sarılıyor.
 */

/** Blok tipi → Markdown sarmalayıcı. Tanımsızsa süslemesiz yazılır. */
const MARKDOWN_SARMA: Partial<Record<ScriptBlockType, (m: string) => string>> = {
  /* Sahne başlığı ve bölüm BAŞLIK: Markdown'ın kendi başlık düzeyleri
     belgeyi başka bir araçta da gezilebilir kılıyor (içindekiler, katlama). */
  scene: (m) => `## ${m}`,
  bolum: (m) => `# ${m}`,
  sayfa: (m) => `## ${m}`,
  /* Karakter adı KALIN, parantezik ve sahne yönergesi İTALİK: senaryonun
     görsel hiyerarşisinin düz metinde kalan tek karşılığı. */
  character: (m) => `**${m}**`,
  parenthetical: (m) => `*${m}*`,
  'sahne-yonergesi': (m) => `*${m}*`,
  transition: (m) => `*${m}*`,
  /* Diyalog ALINTI: konuşulan sözü betimden ayıran en yaygın Markdown
     kalıbı ve tek satırlık okunurluk kazancı büyük. */
  dialogue: (m) => `> ${m}`,
  balon: (m) => `> ${m}`,
  altyazi: (m) => `> ${m}`,
};

/**
 * Markdown'ın anlam yüklediği karakterleri kaçırır.
 *
 * `*yıldızlı*` yazan bir yazarın metni Markdown'da italik olurdu ve dosya
 * geri okunduğunda yıldızlar KAYBOLURDU — yani kaçırmamak veri kaybıdır.
 * Yalnız satır İÇİNDEKİ işaretler kaçırılıyor; başa konan `#` ve `>` zaten
 * bizim koyduğumuz süsleme.
 */
/* EXPORTED: `disa/breakdown.ts` (§13.2 çekim dökümü Markdown çıktısı) AYNI
   kaçırmayı kullanıyor — ikinci bir kaçırma yazılsaydı biri düzeltilip öteki
   unutulurdu (Karar 2, bu dosyanın kendi gerekçesiyle aynı). */
export function markdownKacir(metin: string): string {
  /* İKİ AYRI KÜME. Satır İÇİNDE anlam taşıyanlar her yerde kaçırılıyor; blok
     işaretleri (`#`, `>`, `-`, `+`, `1.`) YALNIZ SATIR BAŞINDA.

     İlk yazışımda hepsi her yerde kaçırılıyordu ve `İÇ. MUTFAK - GECE`
     başlığı `İÇ. MUTFAK \- GECE` çıkıyordu. Gereksiz kaçırma da metni bozar:
     kullanıcı bu dosyayı Markdown işlemeyen bir yerde de okuyor. */
  return metin
    .replace(/([\\`*_[\]])/gu, '\\$1')
    .replace(/^(\s*)([#>+-]|\d+\.)/u, '$1\\$2');
}

export interface DuzSecenek {
  /** Büyük harf dönüşümü uygulansın mı — profil verilmezse uygulanmaz. */
  profil?: FormatProfili;
  /** Markdown süslemesi. Kapalıyken saf düz metin çıkar. */
  markdown?: boolean;
  /**
   * Blok tipini köşeli parantezle yaz — düz metinde yapıyı görünür kılar.
   *
   * Markdown'da KAPALI olmalı: orada yapı zaten başlık ve alıntı
   * işaretleriyle taşınıyor ve ikisi birden okunmaz bir dosya üretirdi.
   */
  tipEtiketi?: boolean;
}

/**
 * Blokları metne çevirir.
 *
 * Boş bloklar KORUNUYOR (Karar 11: metni yutma): yazarın bilerek bıraktığı
 * boşluk bir ritim kararıdır ve dışa aktarımda sessizce silinmesi, geri
 * okunduğunda metnin başka görünmesi demektir.
 */
export function duzYaz(bloklar: readonly ScriptBlock[], secenek: DuzSecenek = {}): string {
  const { profil, markdown = false, tipEtiketi = false } = secenek;
  const parcalar: string[] = [];

  for (const b of bloklar) {
    const stil = profil?.bloklar[b.type];
    let metin = b.text.normalize('NFC');
    /* BÜYÜK HARF profilden geliyor, tipten değil: aynı blok tipi farklı
       doküman tiplerinde farklı yazılıyor ve kuralı burada tekrarlamak
       ekranla dosyayı ıraksatırdı (Karar 2). */
    if (stil?.buyukHarf && profil) metin = buyut(metin, profil.dil);

    if (markdown) {
      const sarma = MARKDOWN_SARMA[b.type];
      metin = metin === '' ? '' : (sarma ? sarma(markdownKacir(metin)) : markdownKacir(metin));
    } else if (tipEtiketi && metin !== '') {
      metin = `[${BLOK_ETIKETLERI[b.type]}] ${metin}`;
    }

    /* Bloklar arası boş satır: hem düz metinde hem Markdown'da paragraf
       ayırıcısı. Markdown'da ŞART — bitişik satırlar tek paragrafa
       yapışır ve sahne başlığı ile aksiyon aynı bloğa girerdi. */
    parcalar.push(metin);
  }

  /* `\n{3,}` KOLLAPSI YOK: böyle bir normalizasyon art arda gelen boş
     bloklardan doğan fazladan `\n`leri de yutuyordu — 1 boş blok, 2 boş
     blok ve hiç boş blok olmaması AYNI dosyayı üretiyordu (Karar 11
     ihlali, bu dosyanın kendi üstteki gerekçesiyle çelişen bir hataydı).
     Kaldırılınca her boş blok kendi ayracını KORUYOR: N boş blok N ekstra
     boş satır demek — yazarın bilerek bıraktığı boşluk sayısı okunuyor. */
  /* Sonda TEK satır sonu: POSIX metin dosyası sözleşmesi. Hiç olmasa bazı
     araçlar son satırı eksik okur. */
  return parcalar.join('\n\n') + '\n';
}
