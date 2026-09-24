import { EN, type ArayuzDili } from './arayuz';
import { BLOK_ETIKETLERI, type ScriptBlockType } from '../model/script';
import { REVIZYON_RENKLERI, RENK_ADLARI, type RevizyonRengi } from '../model/revizyon';

/**
 * Bağlam menüsü (sağ tık) — §16.4, dört grup.
 *
 * Bu modül SAF: menüyü çizmez, hangi öğelerin görüneceğine karar verir.
 * Karar mantığı Electron'un `context-menu` olayına gömülseydi hiç test
 * edilemezdi; oysa "ne zaman ne görünür" tam olarak yanlış yapılabilecek
 * kısım.
 */

export type MenuEylemi =
  | { tur: 'oneri'; kelime: string; oneri: string }
  | { tur: 'sozluge-ekle'; kelime: string }
  | { tur: 'yoksay'; kelime: string }
  | { tur: 'kes' }
  | { tur: 'kopyala' }
  | { tur: 'yapistir' }
  | { tur: 'tumunu-sec' }
  | { tur: 'blok-tipi'; tip: ScriptBlockType }
  | { tur: 'panele-bagla' }
  | { tur: 'panel-olustur-bagla' }
  | { tur: 'yer-imi' }
  | { tur: 'revizyon-isaretle' }
  | { tur: 'revizyon-rengi'; renk: RevizyonRengi }
  | { tur: 'bagi-kaldir' }
  | { tur: 'panele-git' };

export interface MenuOgesi {
  etiket: string;
  eylem: MenuEylemi;
  /** Görünür ama seçilemez — neden seçilemediği etiketten anlaşılmalı. */
  pasif?: boolean;
  secili?: boolean;
}

/** Menü grupları arasına ayırıcı konur; boş grup hiç görünmez. */
export type MenuGrubu = MenuOgesi[];

export interface MenuDurumu {
  /** Yanlış yazılmış kelime — denetleyici bildirir. Yoksa yazım grubu yok. */
  yanlisKelime?: string;
  /** Denetleyicinin önerileri, sırayla. */
  oneriler?: readonly string[];
  /** Seçim var mı — kes/kopyala buna bağlı. */
  secimVar: boolean;
  /** Panoda yapıştırılabilir metin var mı. */
  panoDolu: boolean;
  /** Kullanıcı düzenleyebiliyor mu (rol). */
  duzenlenebilir: boolean;
  /** Seçili satırların ortak blok tipi; karışıksa `undefined`. */
  blokTipi?: ScriptBlockType;
  /** Seçili satır sayısı — blok tipi ve panel grubu buna bağlı. */
  seciliSatir: number;
  /** Seçili satırlardan en az biri bir panele bağlı mı. */
  bagliPanelVar: boolean;
  /** İmleçteki satırda yer imi var mı — menü etiketini belirliyor. */
  imVar?: boolean;
  /** Yazım denetimi bu kabukta var mı (web'de yok). */
  denetimVar: boolean;
  /** Yalnız senaryo görünümündeki etkin revizyon için renk menüsü açılır. */
  revizyonRengi?: RevizyonRengi;
  /** Etkin revizyonda seçimin tamamı işaretliyse kaldır, değilse işaretle. */
  revizyonIsaretleme?: 'isaretle' | 'kaldir';
  /**
   * Bu belgede yazılabilen bloklar (§13.2 / F7). Verilmezse senaryo çekirdeği.
   *
   * Menüde roman bloğu gören bir senaryo yazarı onu seçer ve profilde
   * karşılığı olmadığı için sayfalayıcı fırlatır — liste hem menüyü hem
   * doğrulamayı besliyor, tek kaynak.
   */
  izinliBloklar?: readonly ScriptBlockType[];
}

// Etiketler `model/script.ts`'te tek evde — bkz. `BLOK_ETIKETLERI`.
export { BLOK_ETIKETLERI };

/** F7 öncesi davranış: liste verilmezse senaryo çekirdeği. */
const SENARYO_CEKIRDEGI: readonly ScriptBlockType[] = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition',
];

/** Önerilerden en çok kaçı gösterilir. Uzun liste menüyü kullanılmaz yapar. */
const AZAMI_ONERI = 5;

/**
 * Yazım grubu.
 *
 * Denetleyici yoksa (web) grup HİÇ oluşmaz — boş bir "Sözlüğe ekle" göstermek
 * kullanıcıya olmayan bir yeteneği vaat etmek olurdu (§15.4 ruhu).
 *
 * Önerisi olmayan yanlış kelimede grup yine görünür: "Sözlüğe ekle" o zaman
 * KULLANICININ TEK çaresidir, gizlenirse çare kalmaz.
 */
function yazimGrubu(d: MenuDurumu): MenuGrubu {
  if (!d.denetimVar || !d.yanlisKelime) return [];
  const kelime = d.yanlisKelime;
  const ogeler: MenuOgesi[] = (d.oneriler ?? []).slice(0, AZAMI_ONERI).map((o) => ({
    etiket: o,
    eylem: { tur: 'oneri', kelime, oneri: o },
    // Öneriyi uygulamak metni değiştirir; salt-okur kullanıcı yapamaz.
    pasif: !d.duzenlenebilir,
  }));
  ogeler.push(
    /* Sözlüğe ekleme PROJE sözlüğüne yazar ve o kök korumalı izdüşümde:
       sunucu, düzenleme yetkisi olmayan kullanıcının yazımını reddeder.
       Etkin göstermek, kullanıcıya reddedilecek bir eylem sunmak olurdu —
       bu menüdeki belgeye yazan tek öğe ve tek kapısız öğeydi. */
    {
      etiket: `"${kelime}" kelimesini sözlüğe ekle`,
      eylem: { tur: 'sozluge-ekle', kelime },
      pasif: !d.duzenlenebilir,
    },
    /* Yoksayma OTURUMLUK: belgeye dokunmaz, salt-okur kullanıcı da
       kırmızı altçizgiden kurtulabilmeli. */
    { etiket: 'Bu kelimeyi yoksay', eylem: { tur: 'yoksay', kelime } },
  );
  return ogeler;
}

function duzenlemeGrubu(d: MenuDurumu): MenuGrubu {
  return [
    { etiket: 'Kes', eylem: { tur: 'kes' }, pasif: !d.secimVar || !d.duzenlenebilir },
    { etiket: 'Kopyala', eylem: { tur: 'kopyala' }, pasif: !d.secimVar },
    { etiket: 'Yapıştır', eylem: { tur: 'yapistir' }, pasif: !d.panoDolu || !d.duzenlenebilir },
    { etiket: 'Tümünü seç', eylem: { tur: 'tumunu-sec' } },
  ];
}

/**
 * Blok tipi grubu.
 *
 * Seçili satırın MEVCUT tipi listede kalır ama pasiftir: gizlemek, menüdeki
 * öğelerin yerini her seferinde kaydırır ve kas hafızasını bozar.
 */
function blokGrubu(d: MenuDurumu): MenuGrubu {
  if (d.seciliSatir === 0) return [];
  const izinli = d.izinliBloklar ?? SENARYO_CEKIRDEGI;
  return izinli.map((tip: ScriptBlockType) => ({
    etiket: BLOK_ETIKETLERI[tip],
    eylem: { tur: 'blok-tipi', tip },
    pasif: !d.duzenlenebilir || tip === d.blokTipi,
  }));
}

/**
 * Panel grubu.
 *
 * "Panele git" bağlı panel YOKSA hiç görünmez — pasif göstermek kullanıcıya
 * gidilecek bir yer varmış gibi gelir. "Bağı kaldır" da öyle.
 */
function panelGrubu(d: MenuDurumu): MenuGrubu {
  if (d.seciliSatir === 0) return [];
  const ogeler: MenuOgesi[] = [
    /* "Panel oluştur ve bağla" EN ÜSTTE ve TEK ADIM (kullanıcı kararı
       2026-08-26: "panel oluştur ve bağla kısmı yandaki sahne panelinde
       olmasın, imleçle seçip sağ tık menüsünden yapalım").
       Önce panel oluşturup sonra bağlamak iki adımdı ve ikisinin arasında
       kullanıcı yanlış paneli aktif edebiliyordu. */
    { etiket: 'Panel oluştur ve bağla', eylem: { tur: 'panel-olustur-bagla' }, pasif: !d.duzenlenebilir },
    { etiket: 'Aktif panele bağla', eylem: { tur: 'panele-bagla' }, pasif: !d.duzenlenebilir },
  ];
  if (d.bagliPanelVar) {
    ogeler.push(
      { etiket: 'Bağı kaldır', eylem: { tur: 'bagi-kaldir' }, pasif: !d.duzenlenebilir },
      { etiket: 'Bağlı panele git', eylem: { tur: 'panele-git' } },
    );
  }
  return ogeler;
}

/**
 * Menüyü kurar. Boş gruplar DÜŞER — ayırıcıların arasında boşluk kalmaz.
 */
/**
 * Yer imi grubu.
 *
 * Tek satırda anlamlı: birden çok satıra tek imle işaret koymak, imin neyi
 * gösterdiğini belirsizleştirir.
 */
function imGrubu(d: MenuDurumu): MenuGrubu {
  if (d.seciliSatir !== 1) return [];
  return [{
    etiket: d.imVar ? 'Yer imini kaldır' : 'Yer imi koy',
    eylem: { tur: 'yer-imi' },
    pasif: !d.duzenlenebilir,
  }];
}

/**
 * Menüyü kurar. Boş gruplar DÜŞER — ayırıcıların arasında boşluk kalmaz.
 */
export function baglamMenusu(durum: MenuDurumu): MenuGrubu[] {
  return [
    yazimGrubu(durum),
    duzenlemeGrubu(durum),
    blokGrubu(durum),
    panelGrubu(durum),
    imGrubu(durum),
    durum.duzenlenebilir && durum.revizyonIsaretleme ? [{
      etiket: durum.revizyonIsaretleme === 'kaldir'
        ? 'Seçimin revizyon işaretini kaldır' : 'Seçimi işaretle',
      eylem: { tur: 'revizyon-isaretle' } as const,
    }] : [],
    durum.revizyonRengi ? REVIZYON_RENKLERI.map((renk, i): MenuOgesi => ({
      etiket: `${i + 1}. ${RENK_ADLARI[renk]}`,
      eylem: { tur: 'revizyon-rengi', renk },
      pasif: !durum.duzenlenebilir,
      secili: renk === durum.revizyonRengi,
    })) : [],
  ].filter((g) => g.length > 0);
}

/** Sabit komutları çevirir; yazım önerileri kullanıcı metni olarak kalır. */
export function menuEtiketi(oge: MenuOgesi, dil: ArayuzDili): string {
  if (dil !== 'en' || oge.eylem.tur === 'oneri') return oge.etiket;
  if (oge.eylem.tur === 'sozluge-ekle') return `Add "${oge.eylem.kelime}" to dictionary`;
  if (oge.eylem.tur === 'revizyon-rengi')
    return `${REVIZYON_RENKLERI.indexOf(oge.eylem.renk) + 1}. ${EN[RENK_ADLARI[oge.eylem.renk]]}`;
  return EN[oge.etiket] ?? oge.etiket;
}
