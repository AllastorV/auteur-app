import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type DecorationAttrs } from 'prosemirror-view';
import { yCursorPlugin, ySyncPluginKey } from 'y-prosemirror';
import type { Awareness } from 'y-protocols/awareness';
import { VARSAYILAN_RENK, withAlpha } from '../util/color';
import { blokDokunusuYayinla } from '../veri/blok-dokunus';

/**
 * ORTAK ÇALIŞMA GÖRSEL KATMANI — kim nerede yazıyor.
 *
 * Kullanıcı kararı (2026-08-27): ayırt etme düzeyi **renk + ad etiketi +
 * kenar şeridi**. Her yazarın imleci kendi renginde, üstünde küçük ad
 * etiketi; seçimi aynı rengin solgun zemini; düzenlediği satırların sol
 * marjında dört saniye duran 2 px'lik çizgi.
 *
 * İMLEÇ SENKRONU YAZILMADI: `y-prosemirror` paketin içinde zaten geliyor
 * (`yCursorPlugin`) ve göreli konumları Yjs'in kendi eşlemesiyle çeviriyor.
 * Elle yazılan bir imleç senkronu, uzak bir düzenleme geldiğinde imleci
 * kaydırmayı kendi başına çözmek zorunda kalırdı — paketin çözdüğü şey tam
 * olarak bu. Buradan verilen yalnız GÖRÜNÜM: imleç çizici ve seçim çizici.
 *
 * ⚠ `yCursorPlugin` awareness'ın `cursor` ALANINI SAHİPLENİR ve bu ad
 * pakette SABİTTİR: `cursorStateField` seçeneği yalnız YAZMA yolunu
 * değiştiriyor, `createDecorations` okurken hâlâ `aw.cursor` diyor (kaynak
 * okundu: `y-prosemirror/src/plugins/cursor-plugin.js`). Yani alanı bize
 * ayırmanın yolu yok — tuval imleci `tuvalImleci` alanına taşındı
 * (`collab/client.ts`). İki farklı imleç aynı alanı paylaşsaydı bu eklenti
 * `{x, y}` nesnesini göreli konum sanıp çökerdi.
 */

/** Şeridin tam parlaklıkta durduğu süre — kullanıcı kararı: 4 saniye. */
export const SERIT_SURESI_MS = 4000;

/** Solma süresi: şerit bu sürede kaybolur, sonra dekorasyon düşer. */
export const SERIT_SOLMA_MS = 500;

/**
 * Düzenleme şeridinin awareness alanı.
 *
 * BELGEYE YAZILMAZ. Yjs'e yazılsaydı her tuş vuruşu geçmişe bir düzenleme
 * daha eklerdi (geçmiş şişer, kontrol noktaları büyür) ve alan belgeden
 * okunan her yola — dışa aktarım, PDF, `.starc` — sızardı. Şerit bir EKRAN
 * olgusudur, metnin bir parçası değil: awareness oturumla birlikte ölür.
 */
export const DUZENLEME_ALANI = 'duzenleme';

/**
 * Uzak seçim zemininin opaklığı.
 *
 * Sabit DIŞA AÇIK çünkü kontrast iddiasını ölçen test aynı sayıyı kullanmak
 * zorunda: testte 0,18 yazılı kalsaydı kod 0,5'e çıktığında ölçüm hâlâ eski
 * değeri doğrular ve yeşil kalırdı.
 */
export const SECIM_OPAKLIGI = 0.18;

/** Aynı bloğa ardışık yazımda awareness'ın tazelenme aralığı. */
const YAYIN_ARALIGI_MS = 1000;

/**
 * Şerit eklentisinin anahtarı — dışa açık ki durum TEST EDİLEBİLSİN.
 *
 * Yayın kararı ("bu düzenleme yerel mi") eklenti DURUMUNDA hesaplanıyor,
 * görünüm katmanında değil; böylece tarayıcı olmadan, tek bir
 * `state.apply()` ile sınanabiliyor.
 */
export const SERIT_ANAHTARI = new PluginKey<SeritDurumu>('senaryo-duzenleme-seridi');

/** Uzak bir yazarın yayımladığı düzenleme işareti. */
export interface DuzenlemeIsareti {
  /** Tek işlemde DOKUNULAN blokların kimlikleri — yapıştırma çok satır sürer. */
  blokIdler: readonly string[];
  /** Her yayında artan sayaç — aynı satıra yeniden yazıldığını ayırt eder. */
  sira: number;
}

/**
 * Tek bir işaretin taşıyabileceği en çok blok.
 *
 * ⚠ Tavan: bin bloğu birden değiştiren bir yapıştırma yalnız ilk yirmisini
 * işaretler. Awareness her istemciye YAYILAN bir kanal; sınırsız bir liste
 * tek bir yapıştırmayla odadaki herkese onlarca kilobayt yollardı. Şeridin
 * işi "kim nerede yazıyor" sorusunu cevaplamak; ekrana yirmiden fazla satır
 * zaten sığmıyor.
 */
const EN_COK_SERIT = 20;

/** Ekranda çizilecek tek bir kenar şeridi. */
export interface Serit {
  clientId: number;
  blokId: string;
  renk: string;
  /** Dört saniye doldu: şerit sönüyor ama henüz düşmedi. */
  solan: boolean;
}

/** Bir uzak istemcinin şeridinin YEREL saatle ne zaman başladığı. */
export interface SeritGecmisi {
  imza: string;
  baslangic: number;
}

export interface SeritDurumu {
  /** Yerel yazarın en son dokunduğu bloklar; awareness'a görünüm katmanı yazar. */
  yerel: { blokIdler: readonly string[]; sayac: number } | null;
  seritler: readonly Serit[];
}

/**
 * Uzak renk GÜVEN SINIRIDIR: awareness'tan gelen değer başka bir istemcinin
 * yazdığı serbest metindir ve buradan doğruca bir `style` özniteliğine
 * giriyor. Doğrulanmasaydı `red;background:url(...)` gibi bir değer kağıda
 * CSS enjekte ederdi. Altı haneli onaltılık dışında hiçbir şey geçmez.
 */
function renkDogrula(deger: unknown): string {
  return typeof deger === 'string' && /^#[0-9a-f]{6}$/i.test(deger) ? deger : VARSAYILAN_RENK;
}

/**
 * Awareness durumlarını çizilecek şeritlere çevirir.
 *
 * SÜRE UZAK SAATTEN DEĞİL, YEREL VARIŞ ANINDAN sayılıyor. Uzak istemci
 * `Date.now()` yollasaydı saati bir saat ileri olan bir bilgisayarın şeridi
 * hiç sönmez, geri olanınki hiç görünmezdi; ortak çalışmada saat uyumu
 * VARSAYILAMAZ. Uzaktan gelen tek şey DEĞİŞTİ bilgisidir (`blokId` + `sira`);
 * kronometre burada, tek saatle çalışıyor.
 *
 * `gecmis` yerine yenisi DÖNÜYOR, yerinde değiştirilmiyor: girdisi
 * değiştirilmeyen bir işlev testte tek çağrıyla sınanabiliyor.
 */
export function seritleriTopla(
  durumlar: Map<number, Record<string, unknown>>,
  yerelClientId: number,
  gecmis: ReadonlyMap<number, SeritGecmisi>,
  simdi: number,
): { seritler: Serit[]; gecmis: Map<number, SeritGecmisi>; sonrakiUyanma: number | null } {
  const seritler: Serit[] = [];
  const yeniGecmis = new Map<number, SeritGecmisi>();
  let sonrakiUyanma: number | null = null;

  durumlar.forEach((durum, clientId) => {
    /* KENDİ ŞERİDİNİ GÖRMEZSİN. `yCursorPlugin` kendi imlecini de gizliyor
       ve şerit aynı soruya cevap veriyor: "kim yazıyor". Kendi yazdığın
       satırın kenarında yanıp sönen bir çizgi, o soruya cevap değil
       gürültüdür — yazarken imleç zaten oradadır. */
    if (clientId === yerelClientId) return;
    const isaret = durum?.[DUZENLEME_ALANI] as Partial<DuzenlemeIsareti> | undefined;
    /* Uzak yük GÜVEN SINIRI: dizi olmayan, boş ya da dizge taşımayan her şey
       sessizce eleniyor. Bir istemci `blokIdler: 5` yollarsa şerit katmanı
       çökmemeli — o kişinin şeridi görünmez, o kadar. */
    const idler = Array.isArray(isaret?.blokIdler)
      ? isaret.blokIdler.filter((k): k is string => typeof k === 'string' && k !== '')
      : [];
    if (!idler.length) return;

    const imza = `${idler.join(',')}:${isaret?.sira ?? 0}`;
    const onceki = gecmis.get(clientId);
    const baslangic = onceki?.imza === imza ? onceki.baslangic : simdi;
    yeniGecmis.set(clientId, { imza, baslangic });

    const yas = simdi - baslangic;
    if (yas >= SERIT_SURESI_MS + SERIT_SOLMA_MS) return;

    const kullanici = durum?.user as { color?: unknown } | undefined;
    const renk = renkDogrula(kullanici?.color);
    const solan = yas >= SERIT_SURESI_MS;
    for (const blokId of idler.slice(0, EN_COK_SERIT)) {
      seritler.push({ clientId, blokId, renk, solan });
    }

    const kalan = yas < SERIT_SURESI_MS
      ? SERIT_SURESI_MS - yas
      : SERIT_SURESI_MS + SERIT_SOLMA_MS - yas;
    sonrakiUyanma = sonrakiUyanma === null ? kalan : Math.min(sonrakiUyanma, kalan);
  });

  return { seritler, gecmis: yeniGecmis, sonrakiUyanma };
}

/**
 * İşlemin gerçekten DOKUNDUĞU blokların kimlikleri.
 *
 * İMLEÇ KONUMU KULLANILMIYOR ve bu ölçüldü: `tr.insertText(metin, konum)`
 * imleci taşımaz — seçim eski yerinde kalır. İmlece bakan ilk sürüm, ikinci
 * bloğa yapılan bir eklemeyi BİRİNCİ bloğun düzenlemesi diye yayımlıyordu
 * (test yazılırken yakalandı, KIRMIZI görüldü). Ayrıca yapıştırma,
 * bul-değiştir ve blok bölme tek işlemde birden çok satıra dokunuyor;
 * kullanıcının istediği de "düzenlediği SATIRLARIN" işaretlenmesi.
 *
 * Değişen aralıklar `tr.mapping` üzerinden okunuyor ve blok sırası
 * `resolve` ile bulunuyor: belgeyi baştan sona taramak her tuş vuruşunda
 * blok sayısı kadar iş demek olurdu.
 */
function degisenBloklar(tr: Transaction, yeniDurum: EditorState): string[] {
  const belge = yeniDurum.doc;
  if (belge.childCount === 0) return [];
  const kimlikler = new Set<string>();
  const sirala = (konum: number): number => {
    const kisitli = Math.max(0, Math.min(konum, belge.content.size));
    return Math.min(belge.resolve(kisitli).index(0), belge.childCount - 1);
  };
  tr.mapping.maps.forEach((adim, i) => {
    /* Ara adımın konumları SONRAKİ adımlarla eşlenmeli: iki adımlı bir
       işlemde birincinin çıktı konumu, ikincisi uygulanmadan önceki
       belgeye aittir. */
    const kalan = tr.mapping.slice(i + 1);
    adim.forEach((_eskiBas, _eskiSon, yeniBas, yeniSon) => {
      const ilk = sirala(kalan.map(yeniBas, -1));
      const son = sirala(kalan.map(yeniSon, 1));
      for (let k = ilk; k <= son; k++) {
        const kimlik = belge.child(k).attrs.id;
        if (typeof kimlik === 'string' && kimlik) kimlikler.add(kimlik);
      }
    });
  });
  return [...kimlikler].slice(0, EN_COK_SERIT);
}

/** İki kimlik listesi aynı satırları mı gösteriyor. */
function ayniIdler(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** İki şerit listesi ekranda aynı şeyi mi çiziyor. */
function ayniMi(a: readonly Serit[], b: readonly Serit[]): boolean {
  return a.length === b.length
    && a.every((s, i) => s.clientId === b[i].clientId && s.blokId === b[i].blokId
      && s.renk === b[i].renk && s.solan === b[i].solan);
}

/**
 * DÜZENLEME ŞERİDİ — hem yayımlayan hem çizen tek eklenti.
 *
 * İkisi TEK EVDE duruyor çünkü tek bir kuralın iki yüzü: "bir yazar bir
 * bloğa dokunduğunda o blok dört saniye onun renginde işaretlenir". Yayın
 * ayrı bir eklentiye alınsaydı süre iki dosyada tanımlanır ve biri
 * değiştiğinde diğeri sessizce ıraksardı.
 */
export function duzenlemeSeridiEklentisi(awareness: Awareness): Plugin<SeritDurumu> {
  return new Plugin<SeritDurumu>({
    key: SERIT_ANAHTARI,
    state: {
      init: () => ({ yerel: null, seritler: [] }),
      apply(tr, eski, _eskiDurum, yeniDurum) {
        const gelen = tr.getMeta(SERIT_ANAHTARI) as readonly Serit[] | undefined;
        const seritler = gelen ?? eski.seritler;
        /* UZAK değişimde yerel işaret ARTMAZ: `ySyncPlugin` uzak güncellemeyi
           de yerel bir işlem olarak uyguluyor, yani `docChanged` doğru olur.
           Süzülmeseydi bir istemci, başkasının yazdığı satırı KENDİ
           düzenlemesi diye yayımlar ve şerit yanlış yazara boyanırdı. */
        if (!tr.docChanged || tr.getMeta(ySyncPluginKey)?.isChangeOrigin) {
          return gelen ? { yerel: eski.yerel, seritler } : eski;
        }
        const blokIdler = degisenBloklar(tr, yeniDurum);
        if (!blokIdler.length) return { yerel: eski.yerel, seritler };
        return { yerel: { blokIdler, sayac: (eski.yerel?.sayac ?? 0) + 1 }, seritler };
      },
    },
    props: {
      decorations(durum) {
        const { seritler } = SERIT_ANAHTARI.getState(durum) ?? { seritler: [] };
        if (!seritler.length) return null;
        /* Kimlik→şerit eşlemesi ÖNCEDEN kuruluyor: `find` ile aramak her
           tuş vuruşunda blok sayısı × şerit sayısı kadar karşılaştırma
           demekti ve uzun bir senaryoda o çarpım yazmayı yavaşlatır. */
        const eslesme = new Map(seritler.map((s) => [s.blokId, s]));
        const dekorlar: Decoration[] = [];
        durum.doc.forEach((dugum, ofset) => {
          const serit = eslesme.get(dugum.attrs.id);
          if (!serit) return;
          const nitelik: DecorationAttrs = {
            class: 'mzn-serit',
            style: `--serit-renk:${serit.renk}`,
          };
          if (serit.solan) nitelik['data-serit-solan'] = 'evet';
          dekorlar.push(Decoration.node(ofset, ofset + dugum.nodeSize, nitelik));
        });
        return dekorlar.length ? DecorationSet.create(durum.doc, dekorlar) : null;
      },
    },
    view(gorunum) {
      let gecmis = new Map<number, SeritGecmisi>();
      let zamanlayici: ReturnType<typeof setTimeout> | null = null;
      let sonYayin = { sayac: -1, blokIdler: [] as readonly string[], zaman: 0 };

      const tazele = (): void => {
        if (zamanlayici !== null) { clearTimeout(zamanlayici); zamanlayici = null; }
        const sonuc = seritleriTopla(
          awareness.getStates() as Map<number, Record<string, unknown>>,
          awareness.clientID,
          gecmis,
          Date.now(),
        );
        gecmis = sonuc.gecmis;
        if (sonuc.sonrakiUyanma !== null) {
          zamanlayici = setTimeout(tazele, sonuc.sonrakiUyanma);
        }
        /* DEĞİŞMEDİYSE İŞLEM GÖNDERİLMEZ. Kendi yayınımız da awareness
           'change' tetikliyor ve orada bir işlem göndermek, ProseMirror'ın
           `update` çağrısının ORTASINDA dispatch etmek olurdu. Kendi
           istemcimiz listeye hiç girmediği için karşılaştırma bunu
           kendiliğinden susturuyor. */
        const mevcut = SERIT_ANAHTARI.getState(gorunum.state)?.seritler ?? [];
        if (ayniMi(mevcut, sonuc.seritler)) return;
        gorunum.dispatch(gorunum.state.tr.setMeta(SERIT_ANAHTARI, sonuc.seritler));
      };

      const yayinla = (): void => {
        const yerel = SERIT_ANAHTARI.getState(gorunum.state)?.yerel;
        if (!yerel || yerel.sayac === sonYayin.sayac) return;
        /* YAZARLIK: dokunulan bloklar §15 yazıcısına bildiriliyor. Burada,
           aşağıdaki yayın kısmalarından ÖNCE: kısma awareness trafiğini
           azaltmak için var, oysa yazarlık kaydının her yerel düzenlemeyi
           görmesi gerekiyor. Birleştirmeyi yazıcı kendi 30 sn penceresinde
           yapıyor — burada bir daha yapılsaydı aynı kural iki yerde yaşardı. */
        blokDokunusuYayinla(yerel.blokIdler);
        const simdi = Date.now();
        /* Aynı bloğa ardışık yazımda saniyede bir tazeleniyor: her tuş
           vuruşunda awareness yollamak, metnin kendi güncellemesinin
           yanına ikinci bir paket koyardı.
           ⚠ Tavan: son tuştan sonraki artık yayın atlanabilir, yani şerit
           en kötü ihtimalle 3 saniye sonra sönmeye başlar. Yazarın kim
           olduğu sorusu bu farkla değişmiyor. */
        if (ayniIdler(yerel.blokIdler, sonYayin.blokIdler)
          && simdi - sonYayin.zaman < YAYIN_ARALIGI_MS) return;
        sonYayin = { sayac: yerel.sayac, blokIdler: yerel.blokIdler, zaman: simdi };
        awareness.setLocalStateField(DUZENLEME_ALANI, {
          blokIdler: yerel.blokIdler,
          sira: yerel.sayac,
        } satisfies DuzenlemeIsareti);
      };

      awareness.on('change', tazele);
      /* İlk tarama BİR SONRAKİ turda. Eklenti görünümü `EditorView`
         kurulurken yaratılıyor ve orada `dispatch` çağırmak ProseMirror'ı
         kendi kurulumunun ortasında yeniden girmeye zorlar. Odaya sonradan
         katılan bir istemci, önceden var olan şeritleri yine de görür —
         yalnız bir tur sonra. */
      zamanlayici = setTimeout(tazele, 0);

      return {
        /* `tazele` BURADA ÇAĞRILMIYOR: şeritler yalnız awareness değişince
           ya da zamanlayıcı dolunca değişir, tuş vuruşuyla değil. Her
           güncellemede yeniden taramak zamanlayıcıyı da sıfırlardı. */
        update: yayinla,
        destroy() {
          awareness.off('change', tazele);
          if (zamanlayici !== null) clearTimeout(zamanlayici);
          /* Ayrılırken kendi işaretimizi siliyoruz: görünüm kapandıktan
             sonra kağıtta asılı kalan bir şerit kimseyi göstermez. */
          awareness.setLocalStateField(DUZENLEME_ALANI, null);
        },
      };
    },
  });
}

/**
 * Uzak imlecin DOM'u.
 *
 * KAĞIDIN AKIŞINA GENİŞLİK EKLEMEZ. Kök öğe `display:inline` ve boş; çizgi
 * de etiket de `position:absolute`. Paketin varsayılan çizicisi ad kutusunu
 * akışa koyuyor ve o kutu satırı ittiriyor — bu programda satır sonlarının
 * kayması sayfa sayısını, yani sayfa≈dakika sözleşmesini bozar (§6.2).
 *
 * Ad etiketi imlecin ÜSTÜNDE: yanına konsaydı imleci ve yazılan harfi
 * kapatırdı — kullanıcı kararı da "imleç o yazarın renginde, ÜSTÜNDE küçük
 * ad etiketi".
 *
 * Ad `textContent` ile yazılıyor: başka bir istemciden gelen serbest metin
 * `innerHTML`'e verilseydi kağıda işaretleme enjekte edilebilirdi.
 */
export function imlecCizici(kullanici: { name?: unknown; color?: unknown }): HTMLElement {
  const renk = renkDogrula(kullanici?.color);
  const kok = document.createElement('span');
  kok.className = 'mzn-imlec';
  kok.style.setProperty('--imlec-renk', renk);
  const etiket = document.createElement('span');
  etiket.className = 'mzn-imlec-ad';
  etiket.textContent = typeof kullanici?.name === 'string' && kullanici.name ? kullanici.name : 'Konuk';
  kok.appendChild(etiket);
  return kok;
}

/**
 * Uzak seçimin zemini — aynı renk, solgun.
 *
 * Opaklık 0,18: kremimsi kağıtla karıştığında mürekkep (`--mzn-kagit-metin`)
 * ile arasındaki kontrast paletin en kötü üyesinde bile 12,9:1 kalıyor
 * (ölçüldü, `tests/imlec.test.ts`). Daha koyu bir zemin seçimi göze çarpar
 * ama altındaki metni okunmaz yapar — seçim, metni GÖSTERMEK için var.
 */
export function secimCizici(kullanici: { color?: unknown }): DecorationAttrs {
  return {
    class: 'mzn-secim',
    style: `background-color:${withAlpha(renkDogrula(kullanici?.color), SECIM_OPAKLIGI)}`,
  };
}

/** Ortak çalışma görsel katmanı — `senaryoEklentileri` yalnız oturum varken ekler. */
export function imlecEklentileri(awareness: Awareness): Plugin[] {
  return [
    yCursorPlugin(awareness, { cursorBuilder: imlecCizici, selectionBuilder: secimCizici }),
    duzenlemeSeridiEklentisi(awareness),
  ];
}
