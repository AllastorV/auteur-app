import * as Y from 'yjs';
import {
  DEFAULT_FRAME_GUIDES,
  PROJECT_SCHEMA_VERSION,
  type FrameGuideSettings,
  type Layer,
  type Panel,
  type PanelMeta,
  type Project,
  type ProjectMeta,
  type ProjectSettings,
  type SBObject,
  type ScriptBlock,
  type ScriptDoc,
} from '../model/types';
import { createProject } from '../model/factory';
import { IKI_SUTUN_BLOKLARI, type CiftGirdi } from '../format/iki-sutun';
import type { YerImi } from '../model/yerimi';
import type { Karakter } from '../model/karakter';
import type { Lokasyon } from '../model/lokasyon';
import type { Dunya } from '../model/dunya';
import type { CopOgesi } from '../model/geridonusum';
import type { BreakdownEki } from '../model/breakdown';
import type { Revizyon } from '../model/revizyon';
import { baslikSayfasiDuzelt } from '../model/baslik-sayfasi';
import type { BaslikSayfasi } from '../disa/baslik-sayfasi';
import { bloklarToDoc, dizgi, docToBloklar, senaryoSemasi, type Onarim } from '../editor/sema';
import { blockFingerprint } from '../model/script';
import type { Node as PMNode } from 'prosemirror-model';

/**
 * Proje durumu her zaman bir `Y.Doc` üzerinde tutulur — çevrimdışı çalışırken de.
 * Böylece geri alma (Y.UndoManager) ve ortak çalışma senkronu tek bir kod yolunu
 * paylaşır; iki ayrı durum kaynağı arasında tutarsızlık oluşmaz.
 *
 * Yerleşim:
 *   meta        : Y.Map  — proje üst bilgisi
 *   settings    : Y.Map  — proje ayarları
 *   panels      : Y.Array<Y.Map> — paneller
 *   assets      : Y.Map  — assetId → dataURL (gömülü görseller, bake PNG'leri)
 *
 * Varlıklar da dokümanda tutulur: ortak çalışmada görselin baytları diğer
 * katılımcılara ancak bu yolla ulaşır. Yalnızca yerel store'da tutulsalardı
 * karşı taraf boş kare görürdü.
 */

export const ROOT = {
  meta: 'meta',
  settings: 'settings',
  panels: 'panels',
  assets: 'assets',
  script: 'script',
  senaryo: 'senaryo',
  sozluk: 'sozluk',
  yerImleri: 'yerImleri',
  karakterler: 'karakterler',
  lokasyonlar: 'lokasyonlar',
  /** Dünyalar (§13.2) — kurgu evreni notları: mekan/kurum/kavram/olay/nesne. */
  dunyalar: 'dunyalar',
  /** Dünya haritaları — dünya/varlık kimliğine göre bağımsız kayıtlar. */
  worldMaps: 'worldMaps',
  /**
   * Geri dönüşüm kutusu (§13.2, §15) — silinen panel/senaryo bloğu kayıtları.
   *
   * `Y.Array`, `Y.Map` DEĞİL: `recycleBin` spec'inin (§5.1) verdiği tip bu —
   * bir günlük (log), bir küme değil; aynı öğe iki kez silinemez, dolayısıyla
   * `karakterler`/`lokasyonlar`daki "iki yazar aynı anahtara yakınsasın"
   * kaygısı burada yok. Kök adı disk klasörüyle (§5.3 `cop/`) eşleşiyor.
   */
  cop: 'cop',
  /** Başlık sayfası (§16.2 ekranı) — alan bazlı, `meta`/`settings` ile aynı desen. */
  baslikSayfasi: 'baslikSayfasi',
  /** Çekim dökümünün ELLE girilen alanları (§13.2) — `sceneId` → kayıt. */
  breakdown: 'breakdown',
  /**
   * İki sütunlu (Fransız) belgenin görüntü/ses çiftleri — §6.6.
   *
   * `script` ile AYRI kök: tek sütunlu belgenin birimi SATIR, bunun birimi
   * ÇİFT ve çift bölünemez. İkisini aynı diziye koymak, "çift" kavramını
   * yan yana duran iki bloğa indirger ve bölünmezliği yapıdan çıkarıp
   * korunması gereken bir kurala çevirirdi.
   */
  ciftler: 'ciftler',
  /**
   * Revizyon kayıtları — SIRALI, bu yüzden `Y.Array`.
   *
   * `Y.Map` DEĞİL: renk sırası (Beyaz → Mavi → Pembe...) revizyonların
   * SIRASINDAN türer ve harita sırayı tutmaz. Ayrıca listedeki SON kayıt
   * etkin revizyondur — ayrı bir "etkin" alanı tutulmuyor, çünkü iki yazar
   * aynı anda revizyon yayınlarsa o alan çatışırdı; dizide ikisi de yaşar.
   */
  revizyonlar: 'revizyonlar',
  /**
   * Değişiklik işaretleri — `blockId` → `revizyonId`.
   *
   * Desen `yerImleri`nin AYNISI: iki yazar aynı satırı aynı anda işaretlerse
   * harita tek girdiye yakınsar. Çıpa BLOK kimliği, sayfa numarası DEĞİL:
   * sayfa numarası metin uzadıkça kayar, blok kimliği kaymaz. Hangi sayfaya
   * düştüğü basma anında sayfalayıcıya sorulur (Karar 34).
   */
  revizyonIsaretleri: 'revizyonIsaretleri',
} as const;

export function metaMap(doc: Y.Doc): Y.Map<any> { return doc.getMap(ROOT.meta); }
export function settingsMap(doc: Y.Doc): Y.Map<any> { return doc.getMap(ROOT.settings); }
export function panelsArray(doc: Y.Doc): Y.Array<Y.Map<any>> { return doc.getArray(ROOT.panels); }
export function assetsMap(doc: Y.Doc): Y.Map<string> { return doc.getMap(ROOT.assets); }

/**
 * Yer imleri (§13.4) — `blockId` → im.
 *
 * `Y.Map`, `Y.Array` DEĞİL: iki yazar aynı satırı aynı anda imlerse harita tek
 * girdiye yakınsar, dizi aynı satırı iki kez gösterirdi. Aynı gerekçe
 * `sozluk`'ta da geçerli.
 *
 * Çapa BLOK kimliği, sahne değil: blok olunca im her modda çalışır (odak
 * sahneyi ve paneli kendisi türetiyor). Sahneye çapalansaydı storyboard
 * modunda hangi panele gidileceğini yer imi bilmek zorunda kalırdı — §7'nin
 * yasakladığı mod-moda bağı geri getirirdi.
 *
 * Belgede yaşıyor, kullanıcıda değil: kalıcı kullanıcı-katmanı deposu yok
 * (§17), yani "kişisel yer imi" yeniden açılışta buharlaşırdı.
 */
export function yerImleriMap(doc: Y.Doc): Y.Map<YerImi> { return doc.getMap(ROOT.yerImleri); }

/** Revizyon kayıtları — sıralı; SON öge etkin revizyondur. */
export function revizyonlarArray(doc: Y.Doc): Y.Array<Revizyon> {
  return doc.getArray(ROOT.revizyonlar);
}

/** Değişiklik işaretleri — `blockId` → `revizyonId`. */
export function revizyonIsaretleriMap(doc: Y.Doc): Y.Map<string> {
  return doc.getMap(ROOT.revizyonIsaretleri);
}

/**
 * Karakterler (§13.2) — `karakterId` → kayıt.
 *
 * Desen `yerImleriMap`'in AYNISI: `Y.Map`, `Y.Array` DEĞİL — iki yazar aynı
 * anda karakter eklerse harita tek girdiye yakınsar, dizi olsaydı çakışan
 * bir sıra numarası tartışmasına dönerdi.
 *
 * Anahtar kendi `id`'si, AD DEĞİL: ad değişebilir (yazım düzeltmesi, karakter
 * yeniden adlandırma) ve ad anahtar olsaydı yeniden adlandırma bir silme +
 * ekleme olurdu — karaktere bağlı ileride eklenecek ilişkiler (§13.2
 * `charactersrelations`) sessizce kopardı.
 */
export function karakterlerMap(doc: Y.Doc): Y.Map<Karakter> { return doc.getMap(ROOT.karakterler); }

/** Lokasyonlar (§13.2) — `lokasyonId` → kayıt. `karakterlerMap` ile aynı gerekçe. */
export function lokasyonlarMap(doc: Y.Doc): Y.Map<Lokasyon> { return doc.getMap(ROOT.lokasyonlar); }

/** Dünyalar (§13.2) — `dunyaId` → kayıt. `karakterlerMap` ile aynı gerekçe (ad değişebilir, anahtar id). */
export function dunyalarMap(doc: Y.Doc): Y.Map<Dunya> { return doc.getMap(ROOT.dunyalar); }

/** Harita ayarları ve işaretleri ayrı anahtarlardır; eşzamanlı eklemeler birleşir. */
export function worldMapsMap(doc: Y.Doc): Y.Map<unknown> { return doc.getMap(ROOT.worldMaps); }

/**
 * Geri dönüşüm kutusu (§13.2, §15) — silinen öğelerin günlüğü.
 *
 * Her girdi bir `Y.Map<any>` (ham depolama); `CopOgesi` biçimine
 * `copOku`/`copListesi` (`doc/mutations.ts`) ile çevrilir — `panelToY`/
 * `readPanel` çiftinin aynısı: yazma tarafı `Y.Map` kurar, okuma tarafı
 * düz nesneye çevirir.
 */
export function copArray(doc: Y.Doc): Y.Array<Y.Map<any>> { return doc.getArray(ROOT.cop); }
/**
 * Başlık sayfası (§16.2 ekranı) — `metaMap`/`settingsMap` ile AYNI desen:
 * alan bazlı `Y.Map`, tek bileşik değer DEĞİL.
 *
 * Neden alan bazlı: proje TEK başlık sayfası taşır (karakter/lokasyon gibi
 * çoklu kayıt değil), yani `karakterlerMap`in "kimlik → kayıt" deseni burada
 * uymuyor. İki ortak yazar aynı anda FARKLI alanları düzenlerse (biri
 * başlığı, öteki yazarı) alan bazlı harita ikisini de korur — tek bileşik
 * değer olsaydı CRDT son yazanı tutar, öteki alan sessizce kaybolurdu.
 */
export function baslikSayfasiMap(doc: Y.Doc): Y.Map<unknown> { return doc.getMap(ROOT.baslikSayfasi); }

/** Başlık sayfasını güvenli bir kayda çevirerek okur — güven sınırı burada. */
export function readBaslikSayfasi(doc: Y.Doc): BaslikSayfasi {
  return baslikSayfasiDuzelt(baslikSayfasiMap(doc).toJSON());
}

/**
 * Çekim dökümünün ELLE girilen alanları (§13.2) — `sceneId` → kayıt.
 *
 * `yerImleriMap` ile AYNI desen: `Y.Map`, `Y.Array` DEĞİL — iki yazar aynı
 * sahneye aynı anda özel eşya eklerse harita tek girdiye yakınsar, dizi
 * olsaydı çakışan bir sıra numarası tartışmasına dönerdi. Anahtar `sceneId`:
 * OTOMATİK toplanan alanlar (karakter, mekân) senaryodan HER OKUMADA
 * türüyor, yalnız bu ELLE girilen parça kalıcı depoda yaşıyor.
 */
export function breakdownMap(doc: Y.Doc): Y.Map<BreakdownEki> { return doc.getMap(ROOT.breakdown); }

/** İki sütunlu belgenin çiftleri (§6.6). */
export function ciftlerArray(doc: Y.Doc): Y.Array<Y.Map<any>> {
  return doc.getArray(ROOT.ciftler);
}

/**
 * Çiftleri motorun beklediği biçimde okur.
 *
 * Dönen tip `CiftGirdi` — `format/iki-sutun.ts`'in girdi tipi. Ayrı bir
 * "belge tipi" tanımlamıyoruz: sayfalayıcı zaten bu şekli konuşuyor ve
 * ikinci bir şekil, aralarında çeviri yazmak demekti (Karar 2).
 *
 * Her girdi TEK sütunda; hangi sütun olduğunu blok tipi ve
 * `IKI_SUTUN_YERLESIM` tablosu söylüyor.
 */
export function ciftleriOku(doc: Y.Doc): CiftGirdi[] {
  return ciftlerArray(doc).map((m) => {
    const ham = m.toJSON() as Record<string, unknown>;
    const id = String(ham.id ?? '');
    /* Bilinmeyen blok 'action'a düşüyor: okuyucu bir cevap üretmeli —
       `undefined` bir girdi sayfalayıcıyı düşürürdü. Yerleşim tablosunda
       karşılığı olmayan bir tip ise `yerlesim()` AÇIKÇA fırlıyor; sessizce
       görünmez bir sütuna yazılmıyor. */
    const tip = IKI_SUTUN_BLOKLARI.includes(ham.tip as never)
      ? String(ham.tip) : 'action';
    return { id, tip, metin: String(ham.metin ?? '') };
  });
}

/**
 * Proje sözlüğü (§16.4) — `sozlukAnahtari` → kullanıcının yazdığı özgün biçim.
 *
 * `Y.Map` seçildi, `Y.Array` değil: iki yazar aynı kelimeyi aynı anda
 * eklerse Map'te tek girdiye yakınsar, Array'de kelime İKİ KEZ görünürdü.
 * Kümenin CRDT karşılığı budur.
 */
export function sozlukMap(doc: Y.Doc): Y.Map<string> { return doc.getMap(ROOT.sozluk); }
/**
 * Senaryonun ÜST BİLGİSİ burada durur — yalnız `name`.
 * Metnin kendisi `senaryoFragment`'tedir: bir Y.Map değeri olarak tutulan düz
 * dizi, iki yazarın aynı anda yazmasında birinin tümünü diğerine ezdiriyordu.
 */
export function scriptMap(doc: Y.Doc): Y.Map<any> { return doc.getMap(ROOT.script); }

/**
 * Senaryo metni kökü. `Y.XmlFragment` bir KÖK tiptir, Y.Map değeri olamaz —
 * bu yüzden `script` haritasının içinde değil, onun yanında durur.
 *
 * Blok başına bir `Y.XmlElement('blok')`; kimlik/tip/sahne attribute, metin
 * tek bir `Y.XmlText` çocuk. Karakter düzeyi birleştirme buradan gelir.
 */
export function senaryoFragment(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(ROOT.senaryo);
}

/** Dokümandaki tüm varlıkları düz nesne olarak okur. */
export function readAssets(doc: Y.Doc): Record<string, string> {
  return assetsMap(doc).toJSON() as Record<string, string>;
}

/**
 * Bir Y.XmlText'in düz metni.
 *
 * `toString()` KULLANILMAZ: biçim işaretlerini XML etiketi olarak gömer, yani
 * yazar bir sözcüğü italik yaptığında `ScriptBlock.text` içine `<em>` sızardı.
 * Delta'daki dizgi eklemelerini birleştirmek biçimden bağımsızdır.
 */
function duzMetin(t: Y.XmlText): string {
  return t.toDelta()
    .map((d: { insert?: unknown }) => (typeof d.insert === 'string' ? d.insert : ''))
    .join('');
}

/** Fragment → ProseMirror belgesi. Güven sınırı `docToBloklar`'dadır. */
function fragmentToPmDoc(frag: Y.XmlFragment): PMNode {
  const dugumler: PMNode[] = [];
  frag.forEach((el) => {
    if (!(el instanceof Y.XmlElement)) return;
    /* BÜTÜN metin çocukları birleştirilir, yalnız `get(0)` değil: iki istemci
       aynı bloğa eşzamanlı yazarsa Yjs iki ayrı Y.XmlText tutabilir (ölçüldü:
       çocuk sayısı 3). Yalnız ilkini okumak ikinci yazarın metnini sessizce
       düşürürdü — göçün önlemeye çalıştığı kaybın ta kendisi. */
    let metin = '';
    el.forEach((c) => { if (c instanceof Y.XmlText) metin += duzMetin(c); });
    dugumler.push(senaryoSemasi.node(
      'blok',
      {
        // `?? ''` şemanın "değer verilmedi" hatasını değil, `docToBloklar`'ın
        // tanılayan kimlik hatasını devreye sokar — depo bozuksa kullanıcıya
        // hangi blok olduğunu söyleyen mesaj gitmeli.
        id: el.getAttribute('id') ?? '',
        tip: el.getAttribute('tip') ?? '',
        scene: el.getAttribute('scene') ?? '',
        sceneId: el.getAttribute('sceneId') ?? '',
        yeniSayfada: el.getAttribute('yeniSayfada') ?? '',
        /* BEYAZ LİSTE: bu nesneye yazılmayan her attribute burada SESSİZCE
           düşer. Şemaya yeni bir attribute eklendiğinde BURASI da
           güncellenmeli — ölçüldü, `elleSabit` eklenirken tam olarak bu
           unutulmuştu ve karar depoya yazılıp okunmuyordu. */
      },
      metin.length ? [senaryoSemasi.text(metin)] : [],
    ));
  });
  return senaryoSemasi.node('doc', null, dugumler);
}

/**
 * Fragment'i verilen bloklarla yeniden kurar. ÇAĞIRANIN transaction'ı içinde
 * çalışır — kendi başına bir işlem açmaz.
 */
export function bloklariFragmenteYaz(doc: Y.Doc, bloklar: readonly ScriptBlock[]): void {
  const frag = senaryoFragment(doc);
  /* ÖNCE kur, SONRA değiştir: Yjs `transact` geri sarmaz. Sırayı ters çevirmek
     (sil → doldur) doldurma adımı fırlarsa senaryonun TAMAMINI siler ve hata
     yakalansa bile metni geri getirmez — §15'in yasakladığı kayıp. */
  const dugumler: Y.XmlElement[] = [];
  bloklarToDoc(bloklar).forEach((n) => {
    const el = new Y.XmlElement('blok');
    el.setAttribute('id', n.attrs.id);
    el.setAttribute('tip', n.attrs.tip);
    el.setAttribute('scene', n.attrs.scene);
    el.setAttribute('sceneId', n.attrs.sceneId);
    el.setAttribute('yeniSayfada', n.attrs.yeniSayfada);
    /* YAZMA yolunun beyaz listesi — okuma yolundakiyle (`fragmentToPmDoc`)
       AYNI alanları taşımak zorunda. Yeni bir attribute iki listeye de
       girmezse sessizce kaybolur. */
    // Metin boşken de Y.XmlText konur: canlı editör boş bir bloğa yazarken
    // tutunacak bir düğüm bulmalı.
    el.insert(0, [new Y.XmlText(n.textContent)]);
    dugumler.push(el);
  });
  if (frag.length) frag.delete(0, frag.length);
  if (dugumler.length) frag.insert(0, dugumler);
}

/**
 * `fp` SAKLANMAZ, HESAPLANIR. Sayaç HER blokta ilerler — `parseFountain` ile
 * birebir aynı desen. Yalnız boş `fp`'lerde ilerletmek aynı `tip+metin` taşıyan
 * iki bloğa aynı parmak izini verir ve `reconcileScript`'i yanlış çapaya bağlar.
 *
 * `onarimlar` boş değilse depo bozuktu ve ONARILDI (Karar 10). Alan
 * `ScriptDoc`'un üstünde taşınır ki çağıran görmezden gelmek için ekstra çaba
 * harcasın; kullanıcıya gösterme yükümlülüğü üst katmandadır.
 */
export function readScript(doc: Y.Doc): ScriptDoc & { onarimlar: Onarim[] } {
  const gorulen = new Map<string, number>();
  const { bloklar, onarimlar } = docToBloklar(fragmentToPmDoc(senaryoFragment(doc)));
  return {
    // `name` de bloklarla aynı güven sınırından geçer: bozuk depo nesne yazarsa
    // `ScriptDoc.name: string` ihlal olur ve panel React çocuğu olarak basar.
    name: dizgi(scriptMap(doc).get('name')),
    blocks: bloklar.map((b) => ({ ...b, fp: blockFingerprint(b.type, b.text, gorulen) })),
    onarimlar,
  };
}

/* ------------------------------------------------------------------ */
/* Plain -> Y                                                          */
/* ------------------------------------------------------------------ */

function fillMap(map: Y.Map<any>, obj: Record<string, unknown>): Y.Map<any> {
  for (const [k, v] of Object.entries(obj)) map.set(k, v);
  return map;
}

export function layerToY(layer: Layer): Y.Map<any> {
  return fillMap(new Y.Map(), layer as unknown as Record<string, unknown>);
}

export function objectToY(obj: SBObject): Y.Map<any> {
  // Diziler (points, dash, bones) opak değer olarak saklanır; obje düzeyinde
  // değiştirildiklerinde tamamı yeniden yazılır — çizgi başına çakışma beklenmez.
  return fillMap(new Y.Map(), obj as unknown as Record<string, unknown>);
}

export function panelToY(panel: Panel, order?: number): Y.Map<any> {
  const m = new Y.Map<any>();
  m.set('id', panel.id);
  if (order !== undefined) m.set('order', order);
  m.set('meta', fillMap(new Y.Map(), panel.meta as unknown as Record<string, unknown>));
  const layers = new Y.Array<Y.Map<any>>();
  layers.push(panel.layers.map(layerToY));
  m.set('layers', layers);
  const objects = new Y.Array<Y.Map<any>>();
  objects.push(panel.objects.map(objectToY));
  m.set('objects', objects);
  m.set('guides', fillMap(new Y.Map(), panel.guides as unknown as Record<string, unknown>));
  m.set('transition', panel.transition);
  m.set('transitionDuration', panel.transitionDuration);
  m.set('background', panel.background);
  m.set('scriptRefs', [...(panel.scriptRefs ?? [])]);
  return m;
}

/** Boş bir dokümanı verilen proje ile doldurur (tek transaction). */
export function loadProjectIntoDoc(doc: Y.Doc, project: Project, origin: unknown = 'load'): void {
  doc.transact(() => {
    const meta = metaMap(doc);
    meta.clear();
    fillMap(meta, { ...project.meta, schemaVersion: project.schemaVersion ?? PROJECT_SCHEMA_VERSION });

    const settings = settingsMap(doc);
    settings.clear();
    fillMap(settings, project.settings as unknown as Record<string, unknown>);

    const panels = panelsArray(doc);
    if (panels.length) panels.delete(0, panels.length);
    panels.push(project.panels.map((panel, index) => panelToY(panel, index)));

    scriptMap(doc).set('name', project.script?.name ?? '');
    bloklariFragmenteYaz(doc, project.script?.blocks ?? []);

    /* Belgenin ÖTEKİ kökleri. Burada olmak zorunda: her `unpackProject`
       çağıranı ayrıca yüklemeyi hatırlamak zorunda kalsaydı, unutan bir
       çağrı yeri sessiz kaybı geri getirirdi. */
    belgeKokleriniYaz(doc, project.belge);
  }, origin);
}

/* ------------------------------------------------------------------ */
/* Y -> Plain                                                          */
/* ------------------------------------------------------------------ */

function mapToObj<T>(m: Y.Map<any> | undefined, fallback: T): T {
  if (!m) return fallback;
  return { ...(fallback as object), ...(m.toJSON() as object) } as T;
}

export function readPanel(pm: Y.Map<any>): Panel {
  const layers = (pm.get('layers') as Y.Array<Y.Map<any>> | undefined);
  const objects = (pm.get('objects') as Y.Array<Y.Map<any>> | undefined);
  return {
    id: pm.get('id') as string,
    meta: mapToObj<PanelMeta>(pm.get('meta'), {
      scene: '1', shot: '1', duration: 3, dialogue: '', action: '', sound: '', cameraLabel: '',
    }),
    layers: layers ? (layers.toJSON() as Layer[]).sort((a, b) => a.order - b.order) : [],
    objects: objects ? (objects.toJSON() as SBObject[]) : [],
    guides: mapToObj<FrameGuideSettings>(pm.get('guides'), { ...DEFAULT_FRAME_GUIDES }),
    transition: (pm.get('transition') ?? 'cut') as Panel['transition'],
    transitionDuration: (pm.get('transitionDuration') ?? 0.5) as number,
    background: (pm.get('background') ?? '#ffffff') as string,
    scriptRefs: (pm.get('scriptRefs') as string[] | undefined) ?? [],
  };
}

/** Stable panel maps in displayed order; physical Y.Array order remains legacy fallback. */
export function orderedPanelMaps(doc: Y.Doc): Y.Map<any>[] {
  return panelsArray(doc).toArray()
    .map((map, physical) => ({ map, physical }))
    .sort((a, b) => {
      const ao = a.map.get('order');
      const bo = b.map.get('order');
      const av = typeof ao === 'number' && Number.isFinite(ao) ? ao : a.physical;
      const bv = typeof bo === 'number' && Number.isFinite(bo) ? bo : b.physical;
      return av - bv || a.physical - b.physical ||
        String(a.map.get('id')).localeCompare(String(b.map.get('id')));
    })
    .map(({ map }) => map);
}

export function docToProject(doc: Y.Doc): Project {
  const base = createProject({ panels: [] });
  const meta = metaMap(doc).toJSON() as ProjectMeta & { schemaVersion?: number };
  const settings = settingsMap(doc).toJSON() as ProjectSettings;
  return {
    schemaVersion: meta.schemaVersion ?? PROJECT_SCHEMA_VERSION,
    meta: { ...base.meta, ...meta },
    settings: { ...base.settings, ...settings },
    panels: orderedPanelMaps(doc).map(readPanel),
    // `onarimlar` bir OKUMA RAPORU, belge verisi değil. `Project.script` bir
    // `ScriptDoc`'tur; raporu buraya sızdırmak sözleşmeyi bozar (bkz. readScript).
    script: scriptDocu(doc),
    belge: belgeKokleriniOku(doc),
  };
}

/** `readScript`'in onarım raporu ayıklanmış hâli — saf `ScriptDoc`. */
export function scriptDocu(doc: Y.Doc): ScriptDoc {
  const { onarimlar: _rapor, ...script } = readScript(doc);
  return script;
}

/* ------------------------------------------------------------------ */
/* Belgenin ÖTEKİ kökleri — kayıt kapsamı                              */
/* ------------------------------------------------------------------ */

/**
 * `Project`in taşımadığı kökler.
 *
 * ## Neden var
 *
 * Kullanıcıya dönük kayıt biçimi (`packProject` → `.sbp`) bir `Project`
 * paketliyor ve `Project` yalnız meta/settings/panels/script taşıyor.
 * Belgede bunların YANINDA duran kökler bu yoldan geçmiyordu: kaydedip
 * dosyayı yeniden açan yazar sözlüğünü, karakterlerini, çekim dökümünü,
 * başlık sayfasını ve İKİ SÜTUNLU BELGENİN METNİNİ kaybediyordu — hiçbir
 * hata bildirmeden. §15'in yasakladığı sessiz kayıp buydu.
 *
 * ## Neden `Project`in İÇİNDE, ayrı bir paket dosyası değil
 *
 * Ayrı dosya olsaydı her `unpackProject` çağıranı onu ayrıca yüklemeyi
 * hatırlamak zorunda kalırdı (yedi çağrı yeri) ve unutan bir tanesi kaybı
 * geri getirirdi. `Project`in içinde olduğunda `loadProjectIntoDoc` hepsini
 * kendiliğinden taşır — kayıp MÜMKÜN olmaktan çıkar, "belgelenmiş" olmaz.
 *
 * ## Neden `docToProject` sıcak yolda değil
 *
 * Alan yalnız KAYIT anında dolduruluyor (`kayitIcinProje`). Store'un her
 * karede okuduğu anlık görüntüye (`ProjectSnapshot`) girseydi, canvas'ın
 * sıcak yolu on bir kökün `toJSON()` maliyetini her karede öderdi.
 */
export interface BelgeKokleri {
  sozluk?: Record<string, unknown>;
  yerImleri?: Record<string, unknown>;
  karakterler?: Record<string, unknown>;
  lokasyonlar?: Record<string, unknown>;
  dunyalar?: Record<string, unknown>;
  worldMaps?: Record<string, unknown>;
  baslikSayfasi?: Record<string, unknown>;
  breakdown?: Record<string, unknown>;
  revizyonIsaretleri?: Record<string, unknown>;
  ciftler?: unknown[];
  cop?: unknown[];
  revizyonlar?: unknown[];
}

/** Harita kökleri — ad → belgedeki `Y.Map`. TEK liste (Karar 2). */
const HARITA_KOKLERI = [
  'sozluk', 'yerImleri', 'karakterler', 'lokasyonlar', 'dunyalar', 'worldMaps',
  'baslikSayfasi', 'breakdown', 'revizyonIsaretleri',
] as const;

/** Dizi kökleri — öğeleri düz nesne olan `Y.Array`ler. */
const DIZI_KOKLERI = ['ciftler', 'cop', 'revizyonlar'] as const;

/**
 * Belgenin öteki köklerini düz JSON olarak okur.
 *
 * `panels`, `senaryo`, `assets` BURADA YOK: ilk ikisi zaten `Project`te,
 * `assets` ise pakette ayrı klasörde duruyor. Bu üçünü buraya da koymak
 * aynı veriyi iki kez yazardı.
 */
export function belgeKokleriniOku(doc: Y.Doc): BelgeKokleri {
  const cikti: Record<string, unknown> = {};
  for (const ad of HARITA_KOKLERI) cikti[ad] = doc.getMap(ROOT[ad]).toJSON();
  for (const ad of DIZI_KOKLERI) cikti[ad] = doc.getArray(ROOT[ad]).toJSON();
  return cikti as BelgeKokleri;
}

/**
 * Kökleri belgeye yazar — GÜVEN SINIRI, fırlatmaz.
 *
 * ALAN YOKSA KÖKE DOKUNULMAZ. Bu kasıtlı: yeni alanları bilmeyen bir çağıran
 * (eski bir sürüm, eski bir `.sbp`) kaydettiğinde belgede duran veriyi
 * süpürmemeli. "Yok" ile "boş" ayrı şeyler; ayırmayan bir yükleyici, kaybı
 * düzeltmek için yazılırken kaybın kendisi olurdu.
 *
 * Beklenmeyen şekildeki alan (dizi yerine nesne vb.) ATLANIR: bir alanın
 * bozukluğu yüzünden dosyanın tamamını açılamaz kılmak, kullanıcıyı bütün
 * metninden etmek olurdu.
 */
export function belgeKokleriniYaz(doc: Y.Doc, kokler: BelgeKokleri | undefined): void {
  if (!kokler || typeof kokler !== 'object') return;
  const ham = kokler as Record<string, unknown>;
  for (const ad of HARITA_KOKLERI) {
    const deger = ham[ad];
    if (deger === undefined) continue;
    if (typeof deger !== 'object' || deger === null || Array.isArray(deger)) continue;
    const harita = doc.getMap<unknown>(ROOT[ad]);
    harita.clear();
    for (const [k, v] of Object.entries(deger as Record<string, unknown>)) harita.set(k, v);
  }
  for (const ad of DIZI_KOKLERI) {
    const deger = ham[ad];
    if (deger === undefined) continue;
    if (!Array.isArray(deger)) continue;
    const dizi = doc.getArray<unknown>(ROOT[ad]);
    if (dizi.length) dizi.delete(0, dizi.length);
    /* `ciftler` ve `cop` öğeleri belgede `Y.Map`tir; düz nesne olarak
       yazılsalardı `ciftGuncelle` gibi alan bazlı mutasyonlar öğeyi
       bulamaz, iki yazarın aynı çifti düzenlemesi de birleşmezdi. */
    const ogeler = deger.map((o) =>
      ad === 'revizyonlar' || typeof o !== 'object' || o === null || Array.isArray(o)
        ? o
        : fillMap(new Y.Map(), o as Record<string, unknown>),
    );
    if (ogeler.length) dizi.push(ogeler);
  }
}

/**
 * KAYIT için tam proje — anlık görüntüdeki `Project` + belgenin öteki kökleri.
 *
 * Kaydeden her yol bundan geçmeli. `state.project`i doğrudan yollamak,
 * düzeltilen kaybı geri getirir.
 */
export function kayitIcinProje(project: Project, doc: Y.Doc): Project {
  return { ...project, belge: belgeKokleriniOku(doc) };
}

/* ------------------------------------------------------------------ */
/* Arama yardımcıları                                                  */
/* ------------------------------------------------------------------ */

export function findPanelMap(doc: Y.Doc, panelId: string): Y.Map<any> | undefined {
  const arr = panelsArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const p = arr.get(i);
    if (p.get('id') === panelId) return p;
  }
  return undefined;
}

export function findPanelIndex(doc: Y.Doc, panelId: string): number {
  const arr = panelsArray(doc);
  for (let i = 0; i < arr.length; i++) if (arr.get(i).get('id') === panelId) return i;
  return -1;
}

export function findObjectMap(
  panel: Y.Map<any>,
  objectId: string,
): { map: Y.Map<any>; index: number } | undefined {
  const arr = panel.get('objects') as Y.Array<Y.Map<any>> | undefined;
  if (!arr) return undefined;
  for (let i = 0; i < arr.length; i++) {
    const o = arr.get(i);
    if (o.get('id') === objectId) return { map: o, index: i };
  }
  return undefined;
}

export function findLayerMap(
  panel: Y.Map<any>,
  layerId: string,
): { map: Y.Map<any>; index: number } | undefined {
  const arr = panel.get('layers') as Y.Array<Y.Map<any>> | undefined;
  if (!arr) return undefined;
  for (let i = 0; i < arr.length; i++) {
    const l = arr.get(i);
    if (l.get('id') === layerId) return { map: l, index: i };
  }
  return undefined;
}

/** Yeni bir Y.Doc üzerinde boş proje oluşturur. */
export function createDoc(project?: Project): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, project ?? createProject(), 'init');
  return doc;
}
