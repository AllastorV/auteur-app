import { uid } from '../util/id';
import { blockFingerprint, type ScriptBlock } from '../model/script';
import { createProject } from '../model/factory';
import type { Project } from '../model/types';
import { fonBolumleri, type FonSablonu } from './sablon';
import { taslakUret, type TuretmeGirdisi } from './turet';

/**
 * FON DOSYASI KURULUMU — açık senaryodan ANLIK KOPYA.
 *
 * ## Neden anlık kopya, canlı bağ değil
 *
 * Kullanıcı kararı (2026-09-01). Canlı bağ kaynak `.sbp` yolunu tutmayı,
 * dosya taşınınca/silinince ne olacağını ve "tazele" sırasında elle
 * yazılanı korumayı gerektirirdi — üç ayrı sorun, hiçbiri bugünün işi
 * değil. Kopya eskiyebilir ve arayüz bunu söylüyor; sessizce yanlış
 * veriyle durmuyor.
 *
 * ## Belgeye hangi bölümler giriyor
 *
 * YALNIZ `uretilir: true` olanlar. Noter onaylı imza sirküleri ya da
 * ticaret odası belgesi Auteur'ün yazacağı şeyler değil; belgeye boş bir
 * başlık olarak konsalardı kullanıcı orada bir şey yazması gerektiğini
 * sanırdı. Onlar kontrol listesinde duruyor — unutulmasınlar diye.
 *
 * ## Boş bölüm neden BOŞ bırakılıyor
 *
 * `kaynak: 'elle'` bölümlerde başlık var, gövde yok. Yer tutucu bir metin
 * ("buraya sinopsis yazın") koymak iki riski birden taşırdı: kullanıcı
 * silmeyi unutursa kuruma o metin gider, ve sayfa sayacı olmayan bir
 * içeriği sayar.
 */

export interface FonKurulumu {
  sablon: FonSablonu;
  /** Kaynak senaryodan okunan her şey — `fon/turet.ts`. */
  girdi: TuretmeGirdisi;
  /** Yeni projenin adı. Boşsa kaynak proje adı + şablon adından kurulur. */
  ad?: string;
  /** Testte sabitlenir; üretimde `uid`. */
  kimlik?: () => string;
  /**
   * Kaynak senaryonun dosya yolu — "tazele" bunu kullanıyor.
   *
   * Kaydedilmemiş senaryoda `null`: o hâlde tazeleme kullanıcıya bir kez
   * dosyayı soruyor ve öğrendiği yolu belgeye yazıyor.
   */
  kaynakYol?: string | null;
  /** Testte sabitlenir; üretimde `Date.now`. */
  simdi?: () => number;
}

/**
 * Şablonun bölüm sırasında `bolum` + `paragraf` blokları kurar.
 *
 * Sıra ŞABLONUN sırasıdır, alfabetik ya da "önce dolular" değil: kurumun
 * ek listesi numaralıdır ve teslimde o numara okunur.
 */
export function fonBloklariKur(
  sablon: FonSablonu,
  girdi: TuretmeGirdisi,
  kimlik: () => string = () => uid('sb'),
): ScriptBlock[] {
  const bloklar: ScriptBlock[] = [];
  const gorulen = new Map<string, number>();
  const ekle = (type: ScriptBlock['type'], text: string) => {
    bloklar.push({
      id: kimlik(),
      fp: blockFingerprint(type, text, gorulen),
      type,
      text,
      /* Sahne kimliği YOK: bu belgenin yapı birimi `bolum` ve sınırı blok
         TİPİ çiziyor (`yapiBirimleriniCikar`). Uydurma bir sceneId, sahne
         bazlı her sorguyu yanıltırdı. */
      scene: '',
      sceneId: '',
    });
  };

  for (const ornek of fonBolumleri(sablon)) {
    ekle('bolum', ornek.ad);
    /* ÇEVİRİ BÖLÜMÜ BOŞ AÇILIYOR: taslak yalnız ilk (çoğunlukla özgün)
       dilde yazılıyor. Makine çevirisiyle doldurmak, kuruma giden bir
       belgeye denetlenmemiş metin koymak olurdu. */
    if (!ornek.taslakli) continue;
    const taslak = taslakUret(ornek.bolum.kaynak, girdi);
    if (!taslak) continue;
    for (const satir of taslak) ekle('paragraf', satir);
  }
  return bloklar;
}

/**
 * Fon başvuru dosyası projesini kurar.
 *
 * Şablon kimliği `settings.fonSablonu`'na yazılıyor: belge açıldığında
 * hangi kurumun listesine göre kurulduğu bilinmeli — yoksa kontrol listesi
 * neyi eksik sayacağını bilemez.
 */
export function fonProjesiKur(k: FonKurulumu): Project {
  const ad = k.ad?.trim() || `${k.girdi.meta.name} — ${k.sablon.ad}`;
  return createProject({
    meta: { name: ad, dokumanTipi: 'fon-dosyasi', author: k.girdi.meta.author },
    /* BELGE DİLİ ŞABLONDAN: kurumun şartı, kullanıcının tercihi değil.
       Yazılmazsa büyütme kuralı yazarın diline göre işler ve İngilizce bir
       başlık Türkçe `İ` ile basılır (2026-09-01'de gerçek pencerede
       ölçüldü). */
    settings: {
      fonSablonu: k.sablon.id,
      belgeDili: k.sablon.dil,
      /* KAYNAK YAZILIYOR: bu alan olmasaydı "tazele" her seferinde
         kullanıcıya hangi senaryodan türetildiğini sorardı — programın
         zaten bildiği bir şeyi. */
      fonKaynak: {
        projeId: k.girdi.meta.id,
        ad: k.girdi.meta.name,
        yol: k.kaynakYol ?? null,
        turetildi: (k.simdi ?? Date.now)(),
      },
    },
    script: { name: ad, blocks: fonBloklariKur(k.sablon, k.girdi, k.kimlik) },
  });
}
