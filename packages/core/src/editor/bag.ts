import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { useUiStore } from '../store/ui';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { ySyncPlugin, ySyncPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';
import { senaryoFragment } from '../doc/schema';
import { uid } from '../util/id';
import { sayfaEklentisi } from './sayfa';
import { odakEklentisi } from './odak';
import { akilliDuzeltmeEklentisi } from './akilli-duzeltme';
import { daktiloKaydirmaEklentisi } from './daktilo-kaydirma';
import { numaraEklentisi } from './numara-eklenti';
import { revizyonEklentisi } from './revizyon-eklenti';
import { etkinRevizyon, revizyonIsaretleriniOku } from '../doc/mutations';
import type { FormatProfili } from '../format/profil';
import type { ScriptBlockType } from '../model/script';
import type { DokumanTipi } from '../model/dokuman-tipi';
import { presetKisayollari } from './preset';
import { sayfaBasiKomutu } from './sayfa-basi';
import { bosIsaretEklentisi } from './bos-isaret';
import { oneriEklentisi } from './oneri-eklenti';
import { imlecEklentileri } from './imlec';
import type { Awareness } from 'y-protocols/awareness';

/**
 * `y-prosemirror` YEREL yazımlarını bu origin ile Yjs'e işler
 * (`sync-plugin.js` içinde `doc.transact(..., ySyncPluginKey)` — 6 çağrı yeri).
 * Modül düzeyinde TEKİL bir `PluginKey`; binding nesnesi değil, yani mount
 * başına değişmez ve `UndoManager`'a bir kez eklenmesi yeterlidir.
 *
 * Bu dışa aktarım `store/project.ts`'in `trackedOrigins`'i için var: klavyeden
 * yazılan metin ancak bu origin izlenirse geri alınabilir. Değeri orada
 * yeniden yazmak, paket sürümü origin'i değiştirdiğinde geri almayı SESSİZCE
 * bozardı — tek kaynak burasıdır.
 */
export const SYNC_ORIGIN: unknown = ySyncPluginKey;

const KIMLIK_ONARIM = new PluginKey('senaryo-kimlik-onarim');

/**
 * Yazma yolunun kimlik güvencesi (Karar 32).
 *
 * ProseMirror'ın `splitBlock`'u (Enter) attribute'ları KOPYALAR: yeni blok
 * bölünen bloğun `id`'sini taşır ve panel bağları ikiye bölünür. Aynı tehlike
 * yapıştırmada ve sürükle-bırakta da var. Komut başına override yerine tek
 * `appendTransaction`: hangi komut üretirse üretsin yinelenen kimlik buradan
 * geçemez — kök nedende tek düzeltme.
 *
 * Kimlik burada RASTGELE (`uid('sb')`), TÜRETİLMİŞ değil. `docToBloklar`'ın
 * tersi: orası OKUMA yolu — iki istemci aynı bozuk belgeden AYNI kimliği
 * türetmek zorunda; burası YAZMA yolu — tek yerel yazar var.
 *
 * İlk görülen kimliği KORUR, sonrakine taze kimlik verir: bölmede panel bağı
 * ilk yarıda kalır (Karar 10'un yönüyle aynı).
 */
export function kimlikOnarimEklentisi(): Plugin {
  return new Plugin({
    key: KIMLIK_ONARIM,
    appendTransaction(islemler, _eski, yeni): Transaction | null {
      if (!islemler.some((t) => t.docChanged)) return null;
      /* UZAK değişimde ASLA onarma (Karar 33). Mekanizma ÖLÇÜLDÜ: koruma
         olmadan onarım uzak girdide koşar ve PM durumunu depodan ANINDA ayırır
         (PM `["sb_1","TAZE_0"]` iken depo `["sb_1","sb_1"]`). `y-prosemirror`
         uzak kaynaklı işlemde PM→Y geri yazımını atladığı için depo o an sağlam
         GÖRÜNÜR; ayrışma bir sonraki yerel düzenlemede depoya boşalır ve iki
         istemci farklı kimliklerle ıraksar. Uzak yazım kimliğini zaten
         yazarıyla taşır; kullanıcıya çakışmasız liste vermek OKUMA yolunun
         işidir (Karar 10). */
      if (islemler.some((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin)) return null;

      const gorulen = new Set<string>();
      const duzeltmeler: { pos: number; id: string }[] = [];
      yeni.doc.forEach((dugum, offset) => {
        const id = dugum.attrs.id;
        if (typeof id === 'string' && id && !gorulen.has(id)) {
          gorulen.add(id);
          return;
        }
        duzeltmeler.push({ pos: offset, id: uid('sb') });
      });
      if (!duzeltmeler.length) return null;

      const tr = yeni.tr;
      for (const d of duzeltmeler) tr.setNodeAttribute(d.pos, 'id', d.id);
      return tr;
    },
  });
}

/**
 * Belgede YAZILACAK BİR BLOK olmasını garanti eder.
 *
 * Boş bir projede senaryo şeması `blok*` diyor ve depoda hiç blok yok:
 * ProseMirror boş bir belge çiziyor, yani tıklanacak, imleç konacak, yazılacak
 * HİÇBİR YER yok. Kullanıcı yazmayı deniyor, tuşlar editöre değil PENCEREYE
 * düşüyor ve genel kısayollar tetikleniyor — "yazamıyorum, program sayfa
 * değiştiriyor" tam olarak bu.
 *
 * `bosMu` bu dosyada zaten VARDI ve "ilk bloğu üretmek çağıranın işi" diyordu;
 * hiçbir çağıran o işi yapmıyordu. Sözleşmeyi çağırana bırakmak yerine
 * eklentiye alıyoruz: tek ev, ve "belge boşaldı" durumunu da kapsıyor
 * (kullanıcı her şeyi silerse editör yine yazılamaz hâle gelirdi).
 *
 * SALT OKUR ROL YAZMAZ: izleyici bir belgeyi AÇMAKLA onu değiştirmiş olamaz.
 *
 * ⚠ Tavan: iki yazar boş bir projeyi AYNI ANDA açarsa ikisi de birer blok
 * ekler ve belge iki boş satırla başlar. Veri kaybı değil, silinebilir bir
 * fazlalık; tek yazarlı kurulum için ikinci bir eşgüdüm mekanizması kurmak
 * bu bedelden pahalı olurdu.
 */
export function ilkBlokEklentisi(varsayilanBlok: ScriptBlockType): Plugin {
  return new Plugin({
    view(gorunum) {
      const saglam = () => {
        if (gorunum.state.doc.childCount > 0) return;
        if (!gorunum.editable) return;
        const blok = gorunum.state.schema.node('blok', {
          id: uid('sb'), tip: varsayilanBlok, scene: '', sceneId: '',
        });
        gorunum.dispatch(gorunum.state.tr.insert(0, blok));
      };
      saglam();
      return { update: saglam };
    },
  });
}

/**
 * Editör eklentileri. `undo`/`redo` DIŞARIDAN gelir: mağazanın tek
 * `UndoManager`'ı kullanılır, `yUndoPlugin` DEĞİL. İkinci bir undo yığını
 * metni panel bağlarından ayırır — F1b-1'in birlikte döndürme sözleşmesi
 * (Görev 4) kırılırdı.
 */
export function senaryoEklentileri(
  doc: Y.Doc,
  profil: FormatProfili,
  komutlar: { undo: () => void; redo: () => void },
  /* Doküman tipi — hem preset kısayollarının numara sırası (`bloklar`) hem
     boş belgeye konacak ilk bloğun tipi (`varsayilanBlok`) buradan geliyor.
     İkisini ayrı parametre yapmak aynı kaynağı iki kez taşımak olurdu. */
  tip: DokumanTipi,
  /* Ortak çalışma görsel katmanı YALNIZ oturum varken bağlanıyor. Tek
     yazıcıda awareness yoktur ve `yCursorPlugin` kendi imlecini zaten
     gizlediği için hiçbir şey çizmezdi — ama boş bir eklenti her tuş
     vuruşunda göreli konum hesaplamaya devam ederdi. Yokluk `undefined`
     ile anlatılıyor, sahte bir `Awareness` ile değil. */
  awareness?: Awareness | null,
): Plugin[] {
  const geri = () => { komutlar.undo(); return true; };
  const ileri = () => { komutlar.redo(); return true; };
  return [
    ySyncPlugin(senaryoFragment(doc)),
    /* İmleç katmanı `ySyncPlugin`'den HEMEN SONRA: göreli konumları onun
       eşlemesinden okuyor. */
    ...(awareness ? imlecEklentileri(awareness) : []),
    kimlikOnarimEklentisi(),
    /* Kimlik onarımından SONRA: eklediğimiz blok da o kapıdan geçsin. */
    ilkBlokEklentisi(tip.varsayilanBlok),
    /* OTOMATİK TİP ALGILAMA KALDIRILDI (kullanıcı kararı 2026-08-26:
       "oto yazım preseti seçmeyi kaldır, kullanıcı kısayollarla halleder
       istediğini").

       §16.3 "otomatik algılama VARSAYILANDIR" diyordu; kullanıcı kararı
       spec'i yeniyor. Gerekçesi sağlam: tahmin eden bir editör, tahmini
       yanlış olduğunda kullanıcının yazdığını GERİ ALIYOR ve bu, doğru
       tahminlerin kazandırdığından fazlasını götürüyor. Ctrl+1..9 zaten
       tek tuş.

       Yeni satır, önceki satırın tipini miras alıyor (ProseMirror'ın
       `splitBlock`'u attribute'ları kopyalıyor) — yani diyalog yazarken
       her satırda tuşa basmak gerekmiyor.

       `algila.ts` ve `algila-eklenti.ts` SİLİNMEDİ: içe aktarma yolu
       (`parseFountain`, `.starc`) hâlâ tip çıkarımı yapıyor ve orada
       algılama şart — dosyadan gelen metnin tipi başka türlü bilinemez. */
    /* Boş blok işareti — yer tutucu yazısı CSS'te buna bakıyor. */
    bosIsaretEklentisi(),
    /* Öneri listesi keymap'lerden ÖNCE: liste açıkken ok tuşları ve Enter
       onun; kapalıyken hiçbirini yakalamıyor ve editör olağan davranıyor. */
    oneriEklentisi(),
    /* Sayfalama, kimlik onarımından SONRA: onarım `appendTransaction` ile
       kimlik değiştirebiliyor ve sayfa durumu blok kimliklerine dayanıyor.
       Önce gelseydi sınırlar bir işlem boyunca eski kimliği gösterirdi. */
    sayfaEklentisi(profil),
    odakEklentisi(),
    /* Akıllı düzeltmeler — ayarı HER çağrıda mağazadan okuyor; eklenti
       listesi ayara göre yeniden kurulmuyor (imleç ve kaydırma düşerdi). */
    akilliDuzeltmeEklentisi(() => useUiStore.getState().akilliDuzeltme),
    /* Daktilo kaydırması — görünüm katmanı; sönme ve vurgu CSS'te
       (`data-daktilo`), imleci ortada tutmak burada. */
    daktiloKaydirmaEklentisi(() => useUiStore.getState().daktiloModu),
    /* Sahne/diyalog numarası — dekorasyon, metne girmiyor ve sayfa
       sayısını değiştirmiyor. */
    numaraEklentisi(() => useUiStore.getState().numaraAyari),
    /* Revizyon işareti — dekorasyon; işaretler belgede DEĞİL, ayrı bir
       kökte yaşıyor, o yüzden tazeleme `REVIZYON_TAZELE` meta'sıyla
       dışarıdan tetikleniyor (bkz. `revizyon-eklenti.ts`). */
    revizyonEklentisi(() => {
      const etkin = etkinRevizyon(doc);
      if (!etkin) return { isaretler: new Set<string>(), renk: null };
      const hepsi = revizyonIsaretleriniOku(doc);
      const kendi = new Set<string>();
      for (const [blockId, rev] of hepsi) if (rev === etkin.id) kendi.add(blockId);
      return { isaretler: kendi, renk: etkin.renk };
    }),
    /* Preset kısayolları geri-al'dan ÖNCE ama `baseKeymap`'ten önce: ikisi
       de çakışmıyor, sıra yalnız okunurluk için. */
    keymap(presetKisayollari(tip.bloklar)),
    keymap({
      /* Sayfa başı Word'deki gibi Ctrl+Enter. `baseKeymap`'ten ÖNCE olmak
         zorunda değil (orada Mod-Enter yok) ama geri-al ile aynı yerde
         durması listeyi okunur tutuyor. */
      'Mod-Enter': sayfaBasiKomutu,
      'Mod-z': geri,
      'Mod-y': ileri,
      'Shift-Mod-z': ileri,
    }),
    keymap(baseKeymap),
  ];
}

/** Belge boşken yazılacak bir blok bırakmaz — ilk bloğu üretmek çağıranın işi. */
export function bosMu(state: EditorState): boolean {
  return state.doc.childCount === 0;
}
