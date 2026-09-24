import * as Y from 'yjs';
import {
  metaMap,
  panelsArray,
  orderedPanelMaps,
  readPanel,
  readScript,
  scriptMap,
  senaryoFragment,
  settingsMap,
} from '../doc/schema';
import { createProject } from '../model/factory';
import type { Onarim } from '../editor/sema';
import {
  PROJECT_SCHEMA_VERSION,
  type Panel,
  type Project,
  type ProjectMeta,
  type ProjectSettings,
  type ScriptDoc,
} from '../model/types';

/**
 * Y.Doc → düz JS anlık görüntüsü.
 *
 * 100 panellik projede her düzenlemede tüm projeyi yeniden okumak canvas'ı
 * yavaşlatır. Bu sınıf panel bazında önbellek tutar ve yalnızca değişen
 * panelleri yeniden okur; React referans karşılaştırması ile değişmeyen
 * paneller yeniden render edilmez.
 */
export class ProjectSnapshot {
  private panelCache = new WeakMap<Y.Map<any>, Panel>();
  private dirtyPanels = new WeakSet<Y.Map<any>>();
  private lastProject: Project | null = null;
  private metaDirty = true;
  private structureDirty = true;
  /* Senaryo ayrı önbelleklenir: `readScript` fragment'i baştan geziyor ve 5000
     blokta ~13 ms sürüyor (ölçüldü). `metaDirty` her panel sürüklemesinde
     kalkıyor, yani senaryo bunun peşine takılsaydı canvas'ın sıcak yolu her
     karede o 13 ms'i ödeyecekti. */
  private scriptDirty = true;
  private lastScript: ScriptDoc | null = null;
  /** Son okumada onarılan bozuk kimlikler — üst katman kullanıcıya gösterir. */
  sonOnarimlar: Onarim[] = [];

  constructor(private doc: Y.Doc) {}

  /** Bir transaction'ın etkilediği panelleri işaretler. */
  markFromTransaction(tr: Y.Transaction): void {
    const panels = panelsArray(this.doc);
    const senaryo = senaryoFragment(this.doc);
    const script = scriptMap(this.doc);
    for (const [type] of tr.changedParentTypes) {
      let node: Y.AbstractType<any> | null = type as Y.AbstractType<any>;
      let panelMap: Y.Map<any> | null = null;
      let senaryoya = false;
      while (node) {
        /* Fragment'in KENDİSİ değil, İÇİNDEKİ Y.XmlText değişiyor (karakter
           yazımı). Kök bulunana kadar yukarı yürünmezse senaryo düzenlemesi
           önbelleği hiç geçersizleştirmezdi — sessizce bayat metin. */
        if (node === senaryo || node === script) { senaryoya = true; break; }
        const parent: any = (node as any).parent;
        if (parent === panels && node instanceof Y.Map) {
          panelMap = node;
          break;
        }
        if (!parent) break;
        node = parent as Y.AbstractType<any>;
      }
      if (senaryoya) {
        this.scriptDirty = true;
        this.metaDirty = true;
      } else if (panelMap) {
        this.dirtyPanels.add(panelMap);
      } else if (type === panels) {
        this.structureDirty = true;
      } else {
        this.metaDirty = true;
      }
    }
    this.structureDirty = this.structureDirty || tr.changedParentTypes.has(panels as any);
  }

  markAllDirty(): void {
    this.panelCache = new WeakMap();
    this.dirtyPanels = new WeakSet();
    this.metaDirty = true;
    this.structureDirty = true;
    this.scriptDirty = true;
    this.lastScript = null;
    this.lastProject = null;
  }

  /** Senaryo yalnız fragment (ya da `name`) değiştiyse yeniden okunur. */
  private script(): ScriptDoc {
    if (!this.scriptDirty && this.lastScript) return this.lastScript;
    const { onarimlar, ...okunan } = readScript(this.doc);
    this.sonOnarimlar = onarimlar;
    this.lastScript = okunan;
    this.scriptDirty = false;
    return okunan;
  }

  read(): Project {
    const doc = this.doc;
    const ordered = orderedPanelMaps(doc);

    const panels: Panel[] = [];
    let anyPanelChanged = this.structureDirty;
    for (const pm of ordered) {
      let cached = this.panelCache.get(pm);
      if (!cached || this.dirtyPanels.has(pm)) {
        cached = readPanel(pm);
        this.panelCache.set(pm, cached);
        this.dirtyPanels.delete(pm);
        anyPanelChanged = true;
      }
      panels.push(cached);
    }

    if (!anyPanelChanged && !this.metaDirty && this.lastProject) {
      return this.lastProject;
    }

    const base = createProject({ panels: [] });
    const meta = metaMap(doc).toJSON() as ProjectMeta & { schemaVersion?: number };
    const settings = settingsMap(doc).toJSON() as ProjectSettings;

    const project: Project = {
      schemaVersion: meta.schemaVersion ?? PROJECT_SCHEMA_VERSION,
      meta: { ...base.meta, ...meta },
      settings: { ...base.settings, ...settings },
      panels,
      script: this.script(),
    };

    this.metaDirty = false;
    this.structureDirty = false;
    this.lastProject = project;
    return project;
  }
}
