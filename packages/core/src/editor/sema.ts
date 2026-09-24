import { Schema, type Node as PMNode } from 'prosemirror-model';
import { BLOK_TIPLERI, type ScriptBlock, type ScriptBlockType } from '../model/script';

/**
 * Senaryo belge şeması.
 *
 * TEK blok düğümü var; blok TİPİ bir attribute'tur, ayrı düğüm tipleri değil.
 * Gerekçe: tip değiştirmek (aksiyon → diyalog) bir attribute güncellemesidir,
 * düğümü yeniden yaratmak gerekmez — kimlik tip değişiminde de yaşar.
 *
 * KİMLİK `id` attribute'unda taşınır (spec §5.2). Panel bağlarının tamamı
 * buna dayanıyor; bu attribute hiçbir dönüşümde kaybolamaz.
 *
 * `id`'ye ASLA varsayılan verilmez. Varsayılansız olduğu için `blok`
 * ProseMirror açısından "üretilemez" bir düğümdür: şema `blok+` gibi zorunlu
 * bir konum tanımlamayı denerse motor derleme anında patlar
 * (ölçüldü: `Only non-generatable nodes (blok) in a required position`).
 * Varsayılan verilseydi ProseMirror kendi başına UYDURMA kimlikli blok
 * üretebilirdi — panel bağlarının bağlanacağı sahte kimlikler.
 *
 * `tip` de aynı sebeple varsayılansızdır (Karar 6): şema tipin VAR OLMASINI
 * zorunlu kılar, `docToBloklar` ise depodan gelen tanınmayan DEĞERİ
 * `action`'a düşürür. İkisi farklı sözleşmedir; varsayılan konsaydı ikinci
 * kural şemada bir kez daha kopyalanmış olurdu.
 */
export const senaryoSemasi = new Schema({
  nodes: {
    doc: { content: 'blok*' },
    blok: {
      content: 'text*',
      attrs: {
        id: {},
        tip: {},
        scene: { default: '' },
        sceneId: { default: '' },
        /* SAYFA BAŞI — DİZGİ, boolean değil ('1' = evet).
           İki ayrı yazar var: `bloklariFragmenteYaz` (toplu kurulum) ve
           canlı editörde `ySyncPlugin`. İkincisi attribute'u ne verirsek
           onu Yjs'e koyar; biri boolean biri dizgi yazsaydı okuma yolu iki
           farklı türle karşılaşırdı. Model katmanına `boolean` olarak
           `docToBloklar`'da çevriliyor — dönüşüm tek yerde. */
        yeniSayfada: { default: '' },
      },
      toDOM: (n) => [
        'p',
        {
          'data-id': n.attrs.id,
          'data-tip': n.attrs.tip,
          /* CSS kancası: kesikli çizgi ve "Sayfa başı" etiketi buna bakıyor
             (`format/ekran.ts`). `undefined` attribute'u hiç basmaz. */
          ...(n.attrs.yeniSayfada === '1' ? { 'data-elle-sayfa': '1' } : {}),
        },
        0,
      ],
    },
    text: {},
  },
});

export function bloklarToDoc(bloklar: readonly ScriptBlock[]): PMNode {
  const dugumler = bloklar.map((b) => {
    const metin = b.text.normalize('NFC');
    return senaryoSemasi.node(
      'blok',
      {
        id: b.id, tip: b.type, scene: b.scene, sceneId: b.sceneId,
        yeniSayfada: b.yeniSayfada ? '1' : '',
      },
      metin.length ? [senaryoSemasi.text(metin)] : [],
    );
  });
  return senaryoSemasi.node('doc', null, dugumler);
}

/* Şema varsayılanı YALNIZCA attribute hiç verilmediğinde devreye girer; bozuk bir
   depo `scene: null` yazarsa `default: ''` devreye girmez ve `ScriptBlock.scene: string`
   sözleşmesi ihlal edilir. `scene`/`sceneId` KİMLİK DEĞİL — görüntüleme ve gruplama
   alanları; bozuk değerleri veri kaybına değil yanlış gruplamaya yol açar. Bu yüzden
   `id` gibi fırlatmazlar, boş dizgeye normalize edilirler (Karar 7). */
export const dizgi = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Depoda bulunan bozuk bir kimliğin onarım kaydı. */
export interface Onarim {
  /** Belgedeki blok sırası. */
  indeks: number;
  /** Depoda bulunan bozuk değer. */
  bulunan: unknown;
  /** Yerine konan kimlik. */
  atanan: string;
  sebep: 'kimliksiz' | 'yinelenen';
}

export interface SenaryoOkuma {
  bloklar: ScriptBlock[];
  /** Boşsa belge sağlamdı. Doluysa çağıran bunu KULLANICIYA GÖSTERMEK zorunda. */
  onarimlar: Onarim[];
}

/**
 * Kullanılmamış, kaynağından TÜRETİLMİŞ bir kimlik üretir.
 *
 * `uid()` KULLANILMAZ: rastgele olurdu ve `docToBloklar` bir OKUMA yoludur —
 * belgeyi değiştirmez. İki istemci aynı bozuk belgeyi okuduğunda aynı onarılmış
 * kimliğe varmalı; rastgele kimlik ikisini ayırıp panel bağını istemciden
 * istemciye farklı satıra oturturdu. `__n` soneki `uid` alfabesinde (a-z0-9)
 * geçmez, bu yüzden gerçek bir kimlikle çakışamaz.
 */
function tazeKimlik(kok: string, gorulen: Set<string>): string {
  let n = 2;
  while (gorulen.has(`${kok}__${n}`)) n++;
  return `${kok}__${n}`;
}

/**
 * GÜVEN SINIRI — ama artık REDDEDEN değil ONARAN bir sınır (Karar 10).
 *
 * Karar 5 fırlatıyordu. Ölçüldü ki bozukluk elle kurcalanmış depodan değil
 * OLAĞAN kullanımdan doğuyor: iki yazar aynı anda senaryo içe aktarırsa
 * `reconcileScript` iki tarafta da aynı eski kimliği kendi yeni bloğuna
 * devrediyor, CRDT ikisini de saklıyor ve fırlatan okuma yolu belgeyi kalıcı
 * olarak AÇILAMAZ hâle getiriyordu. Fırlatmak kullanıcıyı kendi metninden
 * ediyor; onarmak hiçbir metni kaybetmiyor.
 *
 * Kural: İLK GÖRÜLEN KİMLİK SAHİBİDİR. Yinelenen kimlikte panel bağı ilk bloğa
 * bağlı kalır, ikinci blok bağsız bir blok olarak yaşamaya devam eder.
 *
 * "Yüksek sesle patla" ilkesi duruyor — ama patlamanın yeri okuma yolu değil,
 * `onarimlar` üzerinden KULLANICIYA GÖRÜNEN rapor. Sessizce onarmak yasak.
 */
export function docToBloklar(pmDoc: PMNode): SenaryoOkuma {
  const bloklar: ScriptBlock[] = [];
  const onarimlar: Onarim[] = [];
  const gorulenId = new Set<string>();
  pmDoc.forEach((n, _konum, i) => {
    const ham: unknown = n.attrs.id;
    let id: string;
    if (typeof ham !== 'string' || ham === '') {
      id = tazeKimlik(`sb_onarilmis_${i}`, gorulenId);
      onarimlar.push({ indeks: i, bulunan: ham, atanan: id, sebep: 'kimliksiz' });
    } else if (gorulenId.has(ham)) {
      id = tazeKimlik(ham, gorulenId);
      onarimlar.push({ indeks: i, bulunan: ham, atanan: id, sebep: 'yinelenen' });
    } else {
      id = ham;
    }
    gorulenId.add(id);

    const hamTip = n.attrs.tip;
    const tip: ScriptBlockType = BLOK_TIPLERI.has(hamTip) ? (hamTip as ScriptBlockType) : 'action';
    bloklar.push({
      id,
      fp: '',
      type: tip,
      text: n.textContent.normalize('NFC'),
      scene: dizgi(n.attrs.scene),
      sceneId: dizgi(n.attrs.sceneId),
      /* Depodan gelen HER ŞEY '1' değilse yok sayılır: bozuk bir değer
         (`true`, `'evet'`, nesne) sessizce sayfa çevirmesin. */
      /* `false` DEĞİL `undefined`: alan isteğe bağlı, işaretsiz blok onu
         hiç taşımasın. `.sbp` yolu da (`migrateProject`) böyle davranıyor;
         iki yol farklı davransaydı aynı senaryo diskten mi CRDT'den mi
         geldiğine göre farklı JSON üretirdi. */
      yeniSayfada: n.attrs.yeniSayfada === '1' || undefined,
    });
  });
  return { bloklar, onarimlar };
}
