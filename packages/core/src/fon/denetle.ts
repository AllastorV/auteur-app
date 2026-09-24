import type { ScriptBlock } from '../model/script';
import type { DokumanTipi } from '../model/dokuman-tipi';
import type { FormatProfili } from '../format/profil';
import { yapiBirimleriniCikar } from '../model/yapi';
import { fonBolumleri, type FonBolum, type FonBolumOrnegi, type FonSablonu } from './sablon';

/**
 * FON DOSYASI KONTROL LİSTESİ.
 *
 * ## Neden sayfa sayısı BURADA HESAPLANMIYOR
 *
 * `yapiBirimleriniCikar` yapı birimi başına sayfayı ZATEN veriyor ve o sayı
 * gerçek sayfalayıcıdan geliyor (Karar 34). İkinci bir hesap kurmak, aynı
 * belgede iki farklı sayfa sayısı demekti — Eurimages'ın "sinopsis en fazla
 * 3 sayfa" kuralı hangi sayıya bakacağını bilemezdi.
 *
 * ## Eşleştirme başlık METNİYLE — ve tavanı
 *
 * Bölümler belgeye kurumun ek adıyla yazılıyor; kontrol listesi de o adla
 * arıyor. Blokta şablon bölüm kimliği SAKLANMIYOR: saklamak `ScriptBlock`'a
 * yalnız bu belge tipinde anlamı olan bir alan eklemek olurdu ve o alan her
 * çıpaya, her ağ paketine girerdi (yazarlık kaydı için verilen kararın
 * aynısı).
 *
 * TAVAN: kullanıcı bir başlığı yeniden yazarsa o bölüm "belgede yok"
 * görünür. Sessiz değil — liste onu eksik gösteriyor ve gerekçesini
 * söylüyor; kullanıcı başlığı geri yazarak düzeltebiliyor.
 */

export interface FonBolumDurumu {
  /** Belgedeki bölüm — çok dilli ekte dil başına bir örnek. */
  ornek: FonBolumOrnegi;
  bolum: FonBolum;
  /** Belgede bu adla bir bölüm başlığı bulundu mu. */
  belgede: boolean;
  /** Başlık dışındaki gövde kelime sayısı. */
  kelime: number;
  /** Bölümün tek başına kaç sayfa tuttuğu — sayfalayıcıdan. */
  sayfa: number;
  /** Gövdesi var mı. Yalnız başlık = boş. */
  dolu: boolean;
  /** Kurumun sınırı aşıldı mı. Sınır yoksa `false`. */
  asim: boolean;
  /** Bölümün blokları — paketleme bunları kullanıyor. */
  bloklar: ScriptBlock[];
}

export interface FonDenetimi {
  durumlar: FonBolumDurumu[];
  /** Zorunlu ama belgede boş ya da hiç yok. */
  eksikler: FonBolumDurumu[];
  /** Kurumun sınırını aşanlar. */
  asanlar: FonBolumDurumu[];
  /** Auteur'ün üretmediği, dışarıdan alınacak ekler. */
  harici: FonBolum[];
}

/** Bölümün gövdesi sınırı aşıyor mu — sınır yoksa asla. */
function asimVarMi(bolum: FonBolum, kelime: number, sayfa: number): boolean {
  const s = bolum.sinir;
  if (!s) return false;
  if (s.birim === 'sayfa') return sayfa > s.azami;
  if (s.birim === 'kelime') return kelime > s.azami;
  return false;
}

export function fonDenetle(
  sablon: FonSablonu,
  bloklar: readonly ScriptBlock[],
  tip: DokumanTipi,
  profil: FormatProfili,
): FonDenetimi {
  const birimler = yapiBirimleriniCikar(bloklar, tip, profil);
  const indeksler = new Map(bloklar.map((b, i) => [b.id, i]));
  const birimAdina = new Map(birimler.map((u) => [u.ad, u]));

  const durumlar: FonBolumDurumu[] = [];
  for (const ornek of fonBolumleri(sablon)) {
    const bolum = ornek.bolum;
    const birim = birimAdina.get(ornek.ad);
    if (!birim) {
      durumlar.push({
        ornek, bolum, belgede: false, kelime: 0, sayfa: 0, dolu: false, asim: false, bloklar: [],
      });
      continue;
    }
    const bas = indeksler.get(birim.ilkBlokId) ?? 0;
    const kesit = bloklar.slice(bas, bas + birim.blokSayisi);
    /* Başlığın kendi kelimeleri gövdeye SAYILMIYOR: sayılsaydı boş bir
       bölüm, başlığı uzun olduğu için "dolu" görünürdü. */
    const govde = kesit.filter((b) => b.type !== tip.yapiBlogu);
    const kelime = govde.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/u).length : 0), 0);
    durumlar.push({
      ornek,
      bolum,
      belgede: true,
      kelime,
      sayfa: birim.sayfa,
      dolu: kelime > 0,
      asim: asimVarMi(bolum, kelime, birim.sayfa),
      bloklar: kesit,
    });
  }

  return {
    durumlar,
    eksikler: durumlar.filter((d) => d.bolum.zorunlu && !d.dolu),
    asanlar: durumlar.filter((d) => d.asim),
    harici: sablon.bolumler.filter((b) => !b.uretilir),
  };
}
