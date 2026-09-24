import type { ScriptBlock } from './script';

/**
 * İki senaryo sürümünü karşılaştırır — §16.5 / F3.
 *
 * ## Neden `id` üzerinden, `fp` üzerinden değil
 *
 * `reconcileScript` içe aktarımda kimlik TAŞIMAK için `fp` (içerik parmak
 * izi) eşliyor: orada iki taraf farklı kimlik uzaylarından geliyor.
 * Karşılaştırmada durum tersi — iki sürüm AYNI belgenin geçmişi, yani
 * kimlikler ortak. `fp` eşleseydi metni değişmemiş ama taşınmış bir blok
 * "aynı" görünür, metni değişmiş ama yerinde duran blok ise "silinmiş +
 * eklenmiş" olarak ikiye bölünürdü — kullanıcı revizyonu okuyamazdı.
 *
 * ## Taşınma AYRI bir durum
 *
 * Taşınmayı "sil + ekle" olarak göstermek, bir sahnenin yerini değiştiren
 * revizyonu, o sahnenin yeniden yazıldığı bir revizyondan ayırt edilemez
 * kılardı. Yazar için bu ikisi apayrı kararlardır.
 */

export type FarkTuru = 'ayni' | 'degisti' | 'eklendi' | 'silindi' | 'tasindi';

export interface BlokFarki {
  tur: FarkTuru;
  /** Blok kimliği — iki tarafta da aynı (eklenen/silinen tek taraflı). */
  blockId: string;
  onceki?: ScriptBlock;
  sonraki?: ScriptBlock;
  /** Eski ve yeni sıradaki konum; taşınmayı okunur kılar. */
  onceSira?: number;
  sonraSira?: number;
}

export interface SahneFarki {
  /** Sahne başlığı metni; başlıksız açılış için boş dizge. */
  baslik: string;
  sceneId: string;
  bloklar: BlokFarki[];
  /** Sahnede hiç değişiklik yoksa arayüz onu kapalı gösterebilir. */
  degisti: boolean;
}

/** Blok ÖZDEŞ mi — kimlik dışındaki her görünür alan. */
function ozdes(a: ScriptBlock, b: ScriptBlock): boolean {
  return a.type === b.type && a.text === b.text && a.scene === b.scene;
}

/**
 * Blok bazında fark listesi, YENİ sürümün sırasında.
 *
 * Silinen bloklar, silindikleri yere — yani eski sıradaki komşularının
 * arasına — yerleştiriliyor. Sona toplansaydı kullanıcı neyin nereden
 * silindiğini göremezdi.
 */
export function bloklariKarsilastir(
  onceki: readonly ScriptBlock[],
  sonraki: readonly ScriptBlock[],
): BlokFarki[] {
  const oncekiSira = new Map(onceki.map((b, i) => [b.id, i]));
  const oncekiBlok = new Map(onceki.map((b) => [b.id, b]));
  const sonrakiSira = new Map(sonraki.map((b, i) => [b.id, i]));

  const farklar: BlokFarki[] = [];

  /* Silinenler ESKİ sıradaki yerlerine serpiştiriliyor: her yeni blok
     yazılmadan önce, ondan önce gelip silinmiş olanlar boşaltılıyor. */
  let silinmeİmleci = 0;
  const silinenleriBosalt = (sinir: number) => {
    while (silinmeİmleci < sinir) {
      const b = onceki[silinmeİmleci];
      silinmeİmleci++;
      if (!sonrakiSira.has(b.id)) {
        farklar.push({ tur: 'silindi', blockId: b.id, onceki: b, onceSira: oncekiSira.get(b.id) });
      }
    }
  };

  for (const yeni of sonraki) {
    const eski = oncekiBlok.get(yeni.id);
    if (!eski) {
      farklar.push({
        tur: 'eklendi',
        blockId: yeni.id,
        sonraki: yeni,
        sonraSira: sonrakiSira.get(yeni.id),
      });
      continue;
    }
    silinenleriBosalt(oncekiSira.get(yeni.id)!);
    silinmeİmleci = Math.max(silinmeİmleci, oncekiSira.get(yeni.id)! + 1);

    const ortak = {
      blockId: yeni.id,
      onceki: eski,
      sonraki: yeni,
      onceSira: oncekiSira.get(yeni.id),
      sonraSira: sonrakiSira.get(yeni.id),
    };
    if (!ozdes(eski, yeni)) farklar.push({ tur: 'degisti', ...ortak });
    else farklar.push({ tur: 'ayni', ...ortak });
  }
  silinenleriBosalt(onceki.length);

  /* Taşınma AYRI bir tur: içeriği aynı kalıp SIRASI değişen bloklar.
     Ölçü göreli — araya blok eklenince herkesin mutlak sırası kayar ve
     bunların hepsini "taşındı" saymak farkı okunmaz yapardı. */
  const ortakEski = onceki.filter((b) => sonrakiSira.has(b.id)).map((b) => b.id);
  const ortakYeni = sonraki.filter((b) => oncekiSira.has(b.id)).map((b) => b.id);
  const yerindeKalanlar = new Set(enUzunOrtakDizi(ortakEski, ortakYeni));
  for (const f of farklar) {
    if (f.tur === 'ayni' && !yerindeKalanlar.has(f.blockId)) f.tur = 'tasindi';
  }

  return farklar;
}

/**
 * En uzun ortak alt dizi — taşınmayı bulmanın tek yolu.
 *
 * Dizide KALAN bloklar "yerinde", kalmayanlar "taşınmış" sayılıyor. Basit
 * "sıra numarası değişti mi" ölçüsü, araya tek bir blok eklendiğinde
 * aşağıdaki HER bloğu taşınmış gösterirdi.
 */
function enUzunOrtakDizi(a: readonly string[], b: readonly string[]): string[] {
  const n = a.length;
  const m = b.length;
  /* `n * m` tablo: senaryo bloğu sayısı on binler mertebesinde değil (400
     sayfalık senaryo ~10 bin blok) ve karşılaştırma kullanıcı isteğiyle,
     tuş başına değil çalışıyor. ponytail: O(n·m), profil ölçüp gerekirse
     Hunt–Szymanski'ye geçilir. */
  const tablo: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tablo[i][j] = a[i] === b[j] ? tablo[i + 1][j + 1] + 1 : Math.max(tablo[i + 1][j], tablo[i][j + 1]);
    }
  }
  const cikti: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { cikti.push(a[i]); i++; j++; }
    else if (tablo[i + 1][j] >= tablo[i][j + 1]) i++;
    else j++;
  }
  return cikti;
}

/**
 * Farkları SAHNELERE göre gruplar.
 *
 * Yazar revizyonu sahne sahne okur; düz bir blok listesi 400 sayfalık bir
 * senaryoda okunamaz. Grup ölçütü `sceneId` — sahne BAŞLIĞI değil: başlık
 * revizyonda değişebilir ve o zaman sahne ikiye bölünmüş görünürdü.
 */
export function sahnelereBol(farklar: readonly BlokFarki[]): SahneFarki[] {
  const gruplar: SahneFarki[] = [];
  let acik: SahneFarki | null = null;

  for (const f of farklar) {
    const blok = f.sonraki ?? f.onceki!;
    const sceneId = blok.sceneId || '';
    if (acik === null || acik.sceneId !== sceneId) {
      const grup: SahneFarki = {
        sceneId,
        baslik: blok.type === 'scene' ? blok.text : '',
        bloklar: [],
        degisti: false,
      };
      gruplar.push(grup);
      acik = grup;
    }
    /* Sahne başlığı grubun İÇİNDE geliyorsa grubun adı olur — başlıksız
       açılış sahnesi için boş kalır ve arayüz "başlıksız" der. */
    if (blok.type === 'scene' && !acik.baslik) acik.baslik = blok.text;
    acik.bloklar.push(f);
    if (f.tur !== 'ayni') acik.degisti = true;
  }
  return gruplar;
}

export interface FarkOzeti {
  eklenen: number;
  silinen: number;
  degisen: number;
  tasinan: number;
  /** Değişiklik var mı — "fark yok" demenin tek ölçüsü. */
  fark: boolean;
}

/** Sayılar tek yerden: iki ekran ayrı sayarsa biri yanlış söyler. */
export function farkOzeti(farklar: readonly BlokFarki[]): FarkOzeti {
  const say = (t: FarkTuru) => farklar.filter((f) => f.tur === t).length;
  const ozet = {
    eklenen: say('eklendi'),
    silinen: say('silindi'),
    degisen: say('degisti'),
    tasinan: say('tasindi'),
  };
  return { ...ozet, fark: Object.values(ozet).some((n) => n > 0) };
}
