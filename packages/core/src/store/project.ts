import { create } from 'zustand';
import * as Y from 'yjs';
import {
  assetsMap,
  createDoc,
  loadProjectIntoDoc,
  readAssets,
  senaryoFragment,
  sozlukMap,
  ciftlerArray,
  ciftleriOku,
  yerImleriMap,
  karakterlerMap,
  lokasyonlarMap,
  dunyalarMap,
  worldMapsMap,
  copArray,
  baslikSayfasiMap,
  readBaslikSayfasi,
  breakdownMap,
  revizyonlarArray,
  revizyonIsaretleriMap,
} from '../doc/schema';
import { LOCAL_ORIGIN } from '../doc/mutations';
import { SYNC_ORIGIN } from '../editor/bag';
import * as M from '../doc/mutations';
import { ProjectSnapshot } from './snapshot';
import { createProject } from '../model/factory';
import { totalDuration } from '../model/timeline';
import type { Project, Panel, Role } from '../model/types';
import type { Onarim } from '../editor/sema';
import type { CiftGirdi } from '../format/iki-sutun';
import type { YerImi } from '../model/yerimi';
import type { Karakter } from '../model/karakter';
import type { Lokasyon } from '../model/lokasyon';
import type { Dunya } from '../model/dunya';
import type { CopOgesi } from '../model/geridonusum';
import type { BaslikSayfasi } from '../disa/baslik-sayfasi';
import { BOS_BASLIK_SAYFASI } from '../model/baslik-sayfasi';
import type { BreakdownEki } from '../model/breakdown';
import { can } from '../model/permissions';

export interface ProjectStoreState {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
  snapshot: ProjectSnapshot;
  project: Project;
  activePanelId: string;
  /** Kaydedilmemiş değişiklik var mı */
  dirty: boolean;
  /** Diskteki dosya yolu (masaüstü) */
  filePath: string | null;
  lastSavedAt: number | null;
  /**
   * assetId → tarayıcıda kullanılabilir URL.
   * Dokümandan türetilir; doğrudan yazılmaz (bkz. `setAssetUrl`).
   */
  assetUrls: Record<string, string>;
  /**
   * Yer imleri (§13.4) — `blockId` → im. Dokümandan TÜRETİLİR, doğrudan
   * yazılmaz: `assetUrls` ile aynı kalıp. Yerel ve uzak yazımlar aynı
   * yoldan geliyor, yani ortak yazarın imi de anında görünüyor.
   */
  yerImleri: Record<string, YerImi>;
  /**
   * Karakterler ve lokasyonlar (§13.2) — kimlik → kayıt. `yerImleri` ile
   * AYNI kalıp: dokümandan TÜRETİLİR, doğrudan yazılmaz.
   */
  karakterler: Record<string, Karakter>;
  lokasyonlar: Record<string, Lokasyon>;
  /** Dünyalar (§13.2) — `yerImleri`/`karakterler` ile AYNI kalıp. */
  dunyalar: Record<string, Dunya>;
  /**
   * Geri dönüşüm kutusu (§13.2, §15) — dokümandan TÜRETİLİR. `Y.Array`
   * olduğu için `Record` değil düz DİZİ; sıralama `model/geridonusum.ts`
   * `copSirali`'nin işi, burada belge sırası (silinme sırası) korunur.
   */
  cop: CopOgesi[];
  /** Başlık sayfası (§16.2 ekranı) — dokümandan TÜRETİLİR, `yerImleri` ile aynı kalıp. */
  baslikSayfasi: BaslikSayfasi;
  /** Çekim dökümünün ELLE girilen alanları (§13.2) — `sceneId` → kayıt. */
  breakdown: Record<string, BreakdownEki>;
  /**
   * İki sütunlu belgenin görüntü/ses çiftleri (§6.6).
   *
   * Yer imleri ve sözlük gibi BELGEDEN aynalanıyor: bileşen kendi kopyasını
   * tutsaydı ortak çalışmada başkasının yazdığı çift ekranda hiç görünmezdi.
   * `observeDeep` — çift hücrelerinin değişimi dizinin kendisini değil,
   * içindeki `Y.Map`'i etkiliyor.
   */
  ciftler: CiftGirdi[];
  /** Proje sözlüğü (§16.4) — anahtar → kullanıcının yazdığı özgün biçim. */
  sozluk: Record<string, string>;
  /** Ortak çalışmada bu istemcinin rolü */
  role: Role;
  /**
   * Son okumada ONARILAN bozuk senaryo kimlikleri (Karar 10). Boş değilse
   * kullanıcıya gösterilmek ZORUNDA: sessizce onarmak yasak. Okuma yolu artık
   * fırlatmıyor, çünkü fırlatmak kullanıcıyı kendi metninden ediyordu.
   */
  scriptRepairs: Onarim[];
  canUndo: boolean;
  canRedo: boolean;

  /* --- eylemler --- */
  setActivePanel: (id: string) => void;
  activePanel: () => Panel | undefined;
  replaceProject: (project: Project, opts?: { filePath?: string | null; assets?: Record<string, string> }) => void;
  attachDoc: (doc: Y.Doc, role: Role) => void;
  setRole: (role: Role) => void;
  setFilePath: (path: string | null) => void;
  markSaved: (at?: number) => void;
  setAssetUrl: (assetId: string, url: string) => void;
  undo: () => void;
  redo: () => void;
  duration: () => number;
  /** Rol yeterli mi — UI'ı gizlemek yeterli değildir, sunucu da doğrular. */
  allowed: (cap: Parameters<typeof can>[1]) => boolean;
}

function attachUndo(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager(
    [
      doc.getMap('meta'),
      doc.getMap('settings'),
      doc.getArray('panels'),
      doc.getArray('customPoses'),
      // Haritaya eklenen görsel ile yerleşimi aynı Ctrl+Z adımında geri alınır.
      assetsMap(doc),
      // Senaryo içe aktarma da geri alınabilir olmalı — yanlış dosya seçmek yaygın.
      doc.getMap('script'),
      // Metin AYRI bir köktedir (Y.XmlFragment, Y.Map değeri olamaz). Yalnız
      // `script` izlenirse geri alma senaryonun ADINI döndürür, METNİNİ değil.
      // Kök adı `senaryoFragment` üzerinden alınır: dizgiyi burada tekrarlamak,
      // yeniden adlandırmanın geri almayı SESSİZCE bozmasına kapı açardı.
      senaryoFragment(doc),
      /* Proje sözlüğü de kapsamda: korumalı izdüşümde olduğu için sunucu
         yetkisiz yazımı reddediyor ve istemcinin ret sonrası toparlanma yolu
         `store.undo()`. Kapsam dışında kalsaydı o çağrı sözlüğü değil,
         ALAKASIZ bir önceki düzenlemeyi geri alırdı. */
      sozlukMap(doc),
      /* GERİ KALAN BÜTÜN KULLANICI KÖKLERİ.
         Eksiklerdi ve sonuç şuydu: kullanıcı yanlışlıkla revizyon
         yayınlıyor, Ctrl+Z'ye basıyor, HİÇBİR ŞEY OLMUYOR — revizyon öyle
         kalıyordu. Aynı boşluk yer imini, karakteri, lokasyonu, dünyayı,
         başlık sayfasını, breakdown'ı, çift listesini ve çöp kutusunu da
         geri alınamaz yapıyordu (kullanıcı bildirimi 2026-08-30).

         Kök EKLEMEK, eklememekten güvenli: kapsam dışı bir kök, geri-al
         çağrısını ALAKASIZ bir önceki düzenlemeye yönlendiriyor — yani
         kullanıcı bir şeyi geri almak isterken başka bir şeyi bozuyor.
         Yeni bir kök açıldığında BURAYA da eklenmeli. */
      yerImleriMap(doc),
      revizyonlarArray(doc),
      revizyonIsaretleriMap(doc),
      karakterlerMap(doc),
      lokasyonlarMap(doc),
      dunyalarMap(doc),
      worldMapsMap(doc),
      baslikSayfasiMap(doc),
      breakdownMap(doc),
      ciftlerArray(doc),
      copArray(doc),
    ],
    {
      // Yalnızca yerel düzenlemeler geri alınır — ortak çalışmada başkasının
      // değişikliği yanlışlıkla geri alınmaz.
      /* `SYNC_ORIGIN` olmadan KLAVYEDEN yazılan metin geri alınamaz:
         `y-prosemirror` yerel yazımları kendi origin'iyle işler, `LOCAL_ORIGIN`
         ile değil. F1b-1'in geri alma testi bunu yakalamaz — o `setScript`
         yolunu ölçer, klavye yolunu değil. */
      trackedOrigins: new Set([LOCAL_ORIGIN, SYNC_ORIGIN]),
      captureTimeout: 400,
    },
  );
}

let unsubscribe: (() => void) | null = null;

function wire(
  doc: Y.Doc,
  snapshot: ProjectSnapshot,
  undoManager: Y.UndoManager,
  set: (partial: Partial<ProjectStoreState>) => void,
) {
  unsubscribe?.();

  const onAfter = (tr: Y.Transaction) => {
    snapshot.markFromTransaction(tr);
  };
  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    const project = snapshot.read();
    set({
      project,
      scriptRepairs: snapshot.sonOnarimlar,
      dirty: origin !== 'load' && origin !== 'init',
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
    });
  };
  const onStack = () => {
    set({ canUndo: undoManager.canUndo(), canRedo: undoManager.canRedo() });
  };
  // Varlıklar dokümanda tutulur; yerel ve uzak yazımlar aynı yoldan gelir.
  const assets = assetsMap(doc);
  const onAssets = () => set({ assetUrls: readAssets(doc) });
  const imler = yerImleriMap(doc);
  const onImler = () => set({ yerImleri: imler.toJSON() as Record<string, YerImi> });
  const karakterler = karakterlerMap(doc);
  const onKarakterler = () => set({ karakterler: karakterler.toJSON() as Record<string, Karakter> });
  const lokasyonlar = lokasyonlarMap(doc);
  const onLokasyonlar = () => set({ lokasyonlar: lokasyonlar.toJSON() as Record<string, Lokasyon> });
  const dunyalar = dunyalarMap(doc);
  const onDunyalar = () => set({ dunyalar: dunyalar.toJSON() as Record<string, Dunya> });
  const cop = copArray(doc);
  const onCop = () => set({ cop: M.copListesi(doc) });
  const baslikSayfasi = baslikSayfasiMap(doc);
  const onBaslikSayfasi = () => set({ baslikSayfasi: readBaslikSayfasi(doc) });
  const breakdown = breakdownMap(doc);
  const onBreakdown = () => set({ breakdown: breakdown.toJSON() as Record<string, BreakdownEki> });
  const sozluk = sozlukMap(doc);
  const onSozluk = () => set({ sozluk: sozluk.toJSON() as Record<string, string> });
  const ciftler = ciftlerArray(doc);
  const onCiftler = () => set({ ciftler: ciftleriOku(doc) });

  doc.on('afterTransaction', onAfter);
  doc.on('update', onUpdate);
  undoManager.on('stack-item-added', onStack);
  undoManager.on('stack-item-popped', onStack);
  assets.observe(onAssets);
  imler.observe(onImler);
  karakterler.observe(onKarakterler);
  lokasyonlar.observe(onLokasyonlar);
  dunyalar.observe(onDunyalar);
  cop.observe(onCop);
  onCop();
  baslikSayfasi.observe(onBaslikSayfasi);
  breakdown.observe(onBreakdown);
  sozluk.observe(onSozluk);
  /* `observeDeep`: hücre metni dizinin değil, içindeki Y.Map'in olayı. */
  ciftler.observeDeep(onCiftler);
  onCiftler();

  unsubscribe = () => {
    doc.off('afterTransaction', onAfter);
    doc.off('update', onUpdate);
    undoManager.off('stack-item-added', onStack);
    undoManager.off('stack-item-popped', onStack);
    assets.unobserve(onAssets);
    imler.unobserve(onImler);
    karakterler.unobserve(onKarakterler);
    lokasyonlar.unobserve(onLokasyonlar);
    dunyalar.unobserve(onDunyalar);
    cop.unobserve(onCop);
    baslikSayfasi.unobserve(onBaslikSayfasi);
    breakdown.unobserve(onBreakdown);
    sozluk.unobserve(onSozluk);
    ciftler.unobserveDeep(onCiftler);
  };
}

const initialDoc = createDoc(createProject());
const initialSnapshot = new ProjectSnapshot(initialDoc);
const initialUndo = attachUndo(initialDoc);

export const useProjectStore = create<ProjectStoreState>((set, get) => {
  wire(initialDoc, initialSnapshot, initialUndo, set as any);
  const project = initialSnapshot.read();
  return {
    doc: initialDoc,
    undoManager: initialUndo,
    snapshot: initialSnapshot,
    project,
    activePanelId: project.panels[0]?.id ?? '',
    dirty: false,
    filePath: null,
    lastSavedAt: null,
    assetUrls: {},
    yerImleri: {},
    karakterler: {},
    lokasyonlar: {},
    dunyalar: {},
    cop: [],
    baslikSayfasi: BOS_BASLIK_SAYFASI,
    breakdown: {},
    sozluk: {},
    ciftler: [],
    role: 'owner',
    scriptRepairs: initialSnapshot.sonOnarimlar,
    canUndo: false,
    canRedo: false,

    setActivePanel: (id) => set({ activePanelId: id }),
    activePanel: () => {
      const s = get();
      return s.project.panels.find((p) => p.id === s.activePanelId) ?? s.project.panels[0];
    },

    replaceProject: (project, opts) => {
      const s = get();
      s.undoManager.destroy();
      const doc = new Y.Doc();
      loadProjectIntoDoc(doc, project, 'load');
      if (opts?.assets) M.setAssets(doc, opts.assets, 'load');
      const snapshot = new ProjectSnapshot(doc);
      const undoManager = attachUndo(doc);
      wire(doc, snapshot, undoManager, set as any);
      // `read()` onarım raporunu üretir; `sonOnarimlar` ondan SONRA okunmalı.
      const okunan = snapshot.read();
      set({
        doc,
        snapshot,
        undoManager,
        project: okunan,
        scriptRepairs: snapshot.sonOnarimlar,
        activePanelId: project.panels[0]?.id ?? '',
        dirty: false,
        filePath: opts?.filePath ?? null,
        lastSavedAt: opts?.filePath ? Date.now() : null,
        assetUrls: readAssets(doc),
        yerImleri: yerImleriMap(doc).toJSON() as Record<string, YerImi>,
        karakterler: karakterlerMap(doc).toJSON() as Record<string, Karakter>,
        lokasyonlar: lokasyonlarMap(doc).toJSON() as Record<string, Lokasyon>,
        dunyalar: dunyalarMap(doc).toJSON() as Record<string, Dunya>,
        cop: M.copListesi(doc),
        baslikSayfasi: readBaslikSayfasi(doc),
        breakdown: breakdownMap(doc).toJSON() as Record<string, BreakdownEki>,
        sozluk: sozlukMap(doc).toJSON() as Record<string, string>,
        canUndo: false,
        canRedo: false,
      });
    },

    attachDoc: (doc, role) => {
      const s = get();
      s.undoManager.destroy();
      const snapshot = new ProjectSnapshot(doc);
      const undoManager = attachUndo(doc);
      wire(doc, snapshot, undoManager, set as any);
      const project = snapshot.read();
      set({
        doc,
        snapshot,
        undoManager,
        project,
        scriptRepairs: snapshot.sonOnarimlar,
        role,
        activePanelId: project.panels[0]?.id ?? '',
        assetUrls: readAssets(doc),
        yerImleri: yerImleriMap(doc).toJSON() as Record<string, YerImi>,
        karakterler: karakterlerMap(doc).toJSON() as Record<string, Karakter>,
        lokasyonlar: lokasyonlarMap(doc).toJSON() as Record<string, Lokasyon>,
        dunyalar: dunyalarMap(doc).toJSON() as Record<string, Dunya>,
        cop: M.copListesi(doc),
        baslikSayfasi: readBaslikSayfasi(doc),
        breakdown: breakdownMap(doc).toJSON() as Record<string, BreakdownEki>,
        sozluk: sozlukMap(doc).toJSON() as Record<string, string>,
        canUndo: false,
        canRedo: false,
      });
    },

    setRole: (role) => set({ role }),
    setFilePath: (filePath) => set({ filePath }),
    markSaved: (at) => set({ dirty: false, lastSavedAt: at ?? Date.now() }),
    // Dokümana yazılır; `assetUrls` observer üzerinden tazelenir. Yalnızca
    // yerel state'e yazmak görselin diğer katılımcılara ulaşmamasına yol açar.
    setAssetUrl: (assetId, url) => M.setAsset(get().doc, assetId, url),

    undo: () => get().undoManager.undo(),
    redo: () => get().undoManager.redo(),
    duration: () => totalDuration(get().project.panels),
    allowed: (cap) => can(get().role, cap),
  };
});

/** Aktif panel kimliğini güvenceye alır (panel silindiyse ilkine düşer). */
export function ensureActivePanel(): string {
  const s = useProjectStore.getState();
  const exists = s.project.panels.some((p) => p.id === s.activePanelId);
  if (!exists && s.project.panels.length) {
    useProjectStore.setState({ activePanelId: s.project.panels[0].id });
    return s.project.panels[0].id;
  }
  return s.activePanelId;
}

/** UI katmanının kullandığı yüksek seviye eylemler. */
export const projectActions = {
  ...M,
  get doc() { return useProjectStore.getState().doc; },
  get panelId() { return ensureActivePanel(); },

  addPanel(atIndex?: number) {
    const id = M.addPanel(this.doc, atIndex);
    useProjectStore.setState({ activePanelId: id });
    return id;
  },
  duplicatePanel(panelId: string) {
    const id = M.duplicatePanel(this.doc, panelId);
    if (id) useProjectStore.setState({ activePanelId: id });
    return id;
  },
  removePanel(panelId: string) {
    const state = useProjectStore.getState();
    const idx = state.project.panels.findIndex((p) => p.id === panelId);
    M.removePanel(this.doc, panelId);
    const panels = useProjectStore.getState().project.panels;
    if (panels.length) {
      const next = panels[Math.max(0, Math.min(idx, panels.length - 1))];
      useProjectStore.setState({ activePanelId: next.id });
    }
  },
};
