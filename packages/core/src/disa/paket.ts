import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ScriptBlock } from '../model/script';
import type { FormatProfili } from '../format/profil';
import {
  fontlariGom,
  senaryoCiz,
  type Filigran,
  type PdfYaziTipleri,
  type RevizyonBasimi,
  type SayfaAraligi,
} from './pdf';
import { baslikSayfasiCiz, type BaslikSayfasi } from './baslik-sayfasi';
import { storyboardCiz, type StoryboardKare } from './storyboard-pdf';
import { ikiSutunCiz } from './iki-sutun-pdf';
import { sayfalaIkiSutun, type CiftGirdi } from '../format/iki-sutun';
import { dokumanTipi } from '../model/dokuman-tipi';

/**
 * §16.2 — dışa aktarım KAPSAMI.
 *
 * Kullanıcı kararı (2026-08-25, bağlayıcı): senaryo ve storyboard ayrı ayrı
 * aktarılabilir. İkisi farklı alıcılara gider — senaryo yapımcıya/festivale,
 * storyboard sete/ekibe. Tek bir "projeyi dışa aktar" düğmesi kullanıcıyı
 * istemediği yarısını taşımaya zorlardı. Birlikte aktarım bir SEÇENEKTİR,
 * varsayılan değil.
 */
export type Kapsam = 'senaryo' | 'storyboard' | 'ikisi';

export interface PdfPaketSecenekleri {
  kapsam: Kapsam;
  profil: FormatProfili;
  yaziTipleri: PdfYaziTipleri;
  bloklar: readonly ScriptBlock[];
  /**
   * İKİ SÜTUNLU belgenin metni. Tek sütunlu belgede boş.
   *
   * Ayrı alan çünkü ayrı DEPO: iki sütunlu metin `project.ciftler`'de
   * yaşıyor, `script.blocks`'ta değil. Bu ayrım gözden kaçtığı için Fransız
   * formatındaki belgeler METNİ OLMAYAN bir PDF üretiyordu — uyarı da
   * vermeden (§15.4 sessiz başarısızlık). Artık doküman tipi iki sütunluysa
   * çizim buradan besleniyor.
   */
  ciftler?: readonly CiftGirdi[];
  /**
   * Belgenin doküman tipi. Iki sutunlu olup olmadigina BURADA karar
   * veriliyor; cagiranin hatirlamasi gereken bir sey birakilmiyor.
   */
  dokumanTipi?: string;
  kareler: readonly StoryboardKare[];
  baslik?: string;
  yazar?: string;
  /** Verilmezse tüm sayfalar (§16.2). */
  aralik?: SayfaAraligi | null;
  /** Kapalıysa `null` — varsayılan kapalı. */
  filigran?: Filigran | null;
  /**
   * Verilirse belgenin BAŞINA bir başlık sayfası konur.
   *
   * Sayfa SAYISINA girmez: başlık sayfası numaralanmaz ve "1 sayfa ≈ 1
   * dakika" sözleşmesine dahil değildir — orada hiçbir şey oynanmıyor.
   */
  baslikSayfasi?: BaslikSayfasi | null;
  /**
   * Revizyon basımı — renkli sayfa, üstbilgi, değişim yıldızı.
   *
   * İKİ SÜTUNLU belgeye UYGULANMAZ: Fransız yerleşiminin çizicisi ayrı ve
   * orada sağ kenar boşluğu yok — yıldız sütunların arasına düşerdi.
   * Uygulanmadığı SESSİZ kalmıyor, `revizyonUygulandi` ile bildiriliyor.
   */
  revizyon?: RevizyonBasimi | null;
  /**
   * İki sütunlu (Fransız) belgede sütun ayıracını BAS — VARSAYILAN HAYIR.
   *
   * Tek sütunlu belgede karşılığı yok, sessizce yok sayılır: seçeneği
   * doküman tipine göre gizlemek ARAYÜZÜN işi, çizicinin değil.
   */
  ortaCizgi?: boolean;
}

export interface PdfPaketi {
  pdf: Uint8Array;
  senaryoSayfa: number;
  storyboardSayfa: number;
  /**
   * Revizyon basımı istendi mi ve UYGULANDI mı.
   *
   * İki sütunlu belgede istenip uygulanmıyor. Çağıran bunu kullanıcıya
   * söylemek zorunda: sessizce beyaz sayfa teslim etmek, ekibin revizyonu
   * gözden kaçırmasına yol açar (§15.4).
   */
  revizyonUygulandi: boolean;
}

/**
 * Kapsama göre tek bir PDF kurar.
 *
 * Kapsam dışı bölüm ÇİZİLMEZ, gizlenmez: "yalnız senaryo" belgesinde
 * storyboard sayfası hiç oluşturulmaz. Sayılar da buradan döner, ayrı bir
 * hesap yok — dosyada gerçekten kaç sayfa varsa o.
 */
export async function pdfPaketiKur(secenekler: PdfPaketSecenekleri): Promise<PdfPaketi> {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  if (secenekler.baslik) belge.setTitle(secenekler.baslik);
  if (secenekler.yazar) belge.setAuthor(secenekler.yazar);

  const fontlar = await fontlariGom(belge, secenekler.yaziTipleri);
  const senaryoVar = secenekler.kapsam !== 'storyboard';
  const storyboardVar = secenekler.kapsam !== 'senaryo';

  /* İki sütunlu belge AYRI çiziciye gider: metni ayrı depoda ve sayfa
     düzeni ayrı. Doküman TİPİ karar veriyor, çağıran değil — çağıranın
     unutması tam olarak bu hatanın kaynağıydı. */
  const ikiSutunlu = Boolean(dokumanTipi(secenekler.dokumanTipi)?.ikiSutun);
  const senaryoSayfa = !senaryoVar
    ? 0
    : ikiSutunlu
      ? ikiSutunCiz(
          belge,
          sayfalaIkiSutun(secenekler.ciftler ?? [], secenekler.profil),
          {
            profil: secenekler.profil,
            fontlar,
            ortaCizgi: secenekler.ortaCizgi ?? false,
          },
        )
      : senaryoCiz(belge, secenekler.bloklar, {
          profil: secenekler.profil,
          fontlar,
          aralik: secenekler.aralik ?? null,
          filigran: secenekler.filigran ?? null,
          revizyon: secenekler.revizyon ?? null,
        });
  const storyboardSayfa = storyboardVar
    ? await storyboardCiz(belge, secenekler.kareler, {
        geometri: secenekler.profil.geometri,
        fontlar,
      })
    : 0;

  /* Başlık sayfası EN SONDA ekleniyor ama belgenin BAŞINA giriyor
     (`insertPage(0)`): çizim sırası ne olursa olsun önde durmalı ve
     sayfa sayımına karışmamalı. */
  if (senaryoVar && secenekler.baslikSayfasi) {
    baslikSayfasiCiz(belge, secenekler.profil, fontlar, secenekler.baslikSayfasi);
  }

  return {
    pdf: await belge.save(),
    senaryoSayfa,
    storyboardSayfa,
    revizyonUygulandi: Boolean(secenekler.revizyon) && senaryoVar && !ikiSutunlu,
  };
}
