import { uid } from '../util/id';
import { blockFingerprint, type ScriptBlock } from '../model/script';
import type { DokumanTipi } from '../model/dokuman-tipi';
import type { FormatProfili } from '../format/profil';
import { fonDenetle } from './denetle';
import type { FonSablonu } from './sablon';
import { taslakUret, type TuretmeGirdisi } from './turet';

/**
 * FON DOSYASINI KAYNAK SENARYODAN TAZELEME.
 *
 * ## Neyi değiştirir, neyi ASLA
 *
 * YALNIZ türetilen bölümlerin GÖVDESİ yenilenir: sahne listesi, karakter
 * dosyası, mekân listesi, künye, bütçe sinyalleri. `kaynak: 'elle'` olan
 * her şey — sinopsis, yönetmen görüşü, biyografi, finans planı — parmak
 * bile sürülmeden kalır. Kullanıcının haftalarca yazdığı metni "güncelleme"
 * adı altında ezmek, bu özelliğin yapabileceği en pahalı hata olurdu.
 *
 * Bölüm BAŞLIKLARI da olduğu gibi bırakılıyor (aynı blok nesnesi, aynı
 * kimlik): başlık kullanıcının yer imi koyduğu, panele bağladığı ve
 * revizyonda izlediği çapa.
 *
 * ## Belgede olmayan bölüm GERİ EKLENMİYOR
 *
 * Kullanıcı bir bölümü sildiyse bu bir karardır. Tazeleme onu geri
 * getirseydi, silme işlemi hiçbir zaman kalıcı olmazdı. Kontrol listesi
 * eksik bölümü zaten "bulunamadı" diye gösteriyor; geri getirmek oradan
 * belgeyi yeniden kurmakla olur.
 *
 * ## Değişen bölümler SAYILIYOR
 *
 * Sonuç `yenilenen` listesini döndürüyor ve arayüz onu kullanıcıya
 * gösteriyor. "Tazelendi" deyip hiçbir şey değiştirmemiş olmak, sessiz
 * başarısızlığın en kibar hâlidir (§15.4).
 */

export interface TazelemeSonucu {
  bloklar: ScriptBlock[];
  /** Gövdesi yenilenen bölümlerin belgedeki adı. */
  yenilenen: string[];
  /** Türetilebilir ama belgede bulunamayan bölümler — geri EKLENMEDİ. */
  bulunamayan: string[];
}

export function fonTazele(
  sablon: FonSablonu,
  mevcut: readonly ScriptBlock[],
  girdi: TuretmeGirdisi,
  tip: DokumanTipi,
  profil: FormatProfili,
  kimlik: () => string = () => uid('sb'),
): TazelemeSonucu {
  const denetim = fonDenetle(sablon, mevcut, tip, profil);

  /** Başlık bloğunun kimliği → o bölümün yeni gövdesi ve kaç blok yutacağı. */
  const plan = new Map<string, { ad: string; uzunluk: number; satirlar: readonly string[] }>();
  const yenilenen: string[] = [];
  const bulunamayan: string[] = [];

  for (const durum of denetim.durumlar) {
    /* Çeviri örneği (`taslakli === false`) türetilmiyor: taslak yalnız
       özgün dilde yazılıyor ve makine çevirisi kuruma denetlenmemiş metin
       göndermek olurdu (`fon/kur.ts` ile aynı kural). */
    if (!durum.ornek.taslakli) continue;
    const satirlar = taslakUret(durum.bolum.kaynak, girdi);
    if (!satirlar) continue;
    if (!durum.belgede) { bulunamayan.push(durum.ornek.ad); continue; }
    plan.set(durum.bloklar[0].id, {
      ad: durum.ornek.ad,
      uzunluk: durum.bloklar.length,
      satirlar,
    });
    yenilenen.push(durum.ornek.ad);
  }

  /* Parmak izleri belge sırasında TEK sayaçla üretiliyor: dokunulmayan
     bloklar da sayaca besleniyor, yoksa aynı metne sahip iki blok aynı
     `fp` alır ve `reconcileScript` kimlikleri yanlış çapaya bağlar
     (`model/script.ts` uyarısı). */
  const gorulen = new Map<string, number>();
  const cikti: ScriptBlock[] = [];

  for (let i = 0; i < mevcut.length; i++) {
    const blok = mevcut[i];
    const is = plan.get(blok.id);
    /* Dokunulmayan blok OLDUĞU GİBİ geçiyor — kimliği ve parmak izi
       korunuyor; sayaç yine de ilerletiliyor. */
    blockFingerprint(blok.type, blok.text, gorulen);
    cikti.push(blok);
    if (!is) continue;

    for (const satir of is.satirlar) {
      cikti.push({
        id: kimlik(),
        fp: blockFingerprint('paragraf', satir, gorulen),
        type: 'paragraf',
        text: satir,
        scene: '',
        sceneId: '',
      });
    }
    /* Eski gövde ATLANIYOR: başlık zaten yazıldı, kalan `uzunluk - 1` blok
       bu bölümün eski gövdesi. */
    i += is.uzunluk - 1;
  }

  return { bloklar: cikti, yenilenen, bulunamayan };
}
