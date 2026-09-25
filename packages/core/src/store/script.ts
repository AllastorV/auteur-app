import type React from 'react';
import { useProjectStore, projectActions } from './project';
import { useUiStore } from './ui';
import * as M from '../doc/mutations';
import { DND_MIME, readDragPayload } from '../components/dnd';
import {
  metaFromBlocks,
  parseScript,
  scriptLinkIndex,
  type ScriptBlock,
  type ScriptDoc,
} from '../model/script';
import { starcOku, type StarcUyarisi } from '../ice/starc';
import { bloktanPaneleGec } from './mod';
import { t, tf } from '../dil/arayuz';

/**
 * Senaryo ↔ panel bağlama eylemleri.
 *
 * Buradaki her eylem hem klavyeden, hem düğmeden, hem de sürükle-bırak ile
 * çağrılır — davranışın tek bir yerde durması için ayrı modüle alındı.
 */

/** Belge sırasına göre seçili blokları döndürür. */
export function selectedBlocks(): ScriptBlock[] {
  const { project } = useProjectStore.getState();
  const selected = new Set(useUiStore.getState().scriptSelection);
  return project.script.blocks.filter((b) => selected.has(b.id));
}

export function blocksById(ids: string[]): ScriptBlock[] {
  const wanted = new Set(ids);
  return useProjectStore.getState().project.script.blocks.filter((b) => wanted.has(b.id));
}

/** Bir bloğa bağlı paneller (belge sırasına göre). */
export function panelsForBlock(blockId: string): string[] {
  return scriptLinkIndex(useProjectStore.getState().project.panels).get(blockId) ?? [];
}

/* ------------------------------------------------------------------ */

export interface IceAktarimSonucu {
  satir: number;
  /** Kayıpsız olmayan dönüşümler — çağıran bunu KULLANICIYA GÖSTERİR. */
  uyarilar: StarcUyarisi[];
}

/**
 * Dosyayı ayrıştırıp dokümana yazar. Metni okumak çağıranın işi değildir.
 *
 * `.starc` İKİLİ bir dosya (SQLite): `file.text()` onu bozar, `arrayBuffer()`
 * gerekir. Uzantıya göre ayrılmak zorunlu — biçim tespiti içeriğe bakarak
 * yapılamıyor çünkü metin yolları da geçerli baytlar üretir.
 */
export async function importScriptFile(file: File): Promise<IceAktarimSonucu> {
  let script: ScriptDoc;
  let uyarilar: StarcUyarisi[] = [];

  if (/\.starc$/i.test(file.name)) {
    const senaryolar = await starcOku(new Uint8Array(await file.arrayBuffer()));
    if (senaryolar.length === 0) {
      throw new Error(t('STARC projesinde senaryo metni yok.'));
    }
    /* Bir `.starc` birden çok senaryo taşıyabilir; belgemiz bir tane tutuyor.
       İlkini alıp GERİ KALANI SÖYLEMEK, sessizce ilkini alıp ötekileri yok
       saymaktan iyidir — kullanıcı eksik aktardığını bilmeli. */
    if (senaryolar.length > 1) {
      uyarilar = [
        ...senaryolar[0].uyarilar,
        { starcTipi: `+${senaryolar.length - 1} senaryo`, sayi: senaryolar.length - 1, sonuc: 'dusuruldu' },
      ];
    } else {
      uyarilar = senaryolar[0].uyarilar;
    }
    script = { name: file.name, blocks: senaryolar[0].bloklar };
  } else {
    script = parseScript(file.name, await file.text());
  }

  if (!script.blocks.length) throw new Error(t('Senaryoda okunabilir satır bulunamadı.'));
  M.setScript(useProjectStore.getState().doc, script);
  /* Yükledikten sonra senaryo görünümüne geçilir: eski sol sekme yerine
     artık okunacak yer düzenlenebilir sayfadır, gezgin de onunla gelir. */
  /* `viewMode`'u doğrudan yazan TEK yer burası ve bilerek öyle: bu bir mod
     GEÇİŞİ değil, belge YÜKLEMESİ. Taşınacak bağlam yok — eski imleç artık
     var olmayan blokları gösteriyor. `moduDegistir` burada da güvenli
     olurdu (`odakCoz` bayat kimlikleri düşürür) ama anlamsız: korunacak bir
     şey yokken bağlam korur gibi yapardı. */
  useUiStore.setState({ viewMode: 'senaryo', scriptSelection: [], scriptCursor: null, scriptAnchor: null });
  return { satir: script.blocks.length, uyarilar };
}

/** Seçili satırları verilen panele bağlar (varsayılan: aktif panel). */
export function linkBlocksToPanel(blockIds: string[], panelId?: string): void {
  const state = useProjectStore.getState();
  if (!state.allowed('edit') || !blockIds.length) return;
  M.linkPanelScript(state.doc, panelId ?? state.activePanelId, blockIds);
}

export function unlinkBlocks(blockIds: string[]): void {
  const state = useProjectStore.getState();
  if (!state.allowed('edit') || !blockIds.length) return;
  const index = scriptLinkIndex(state.project.panels);
  // Bir satır birden çok panele bağlı olabilir; hepsinden koparılır.
  const byPanel = new Map<string, string[]>();
  for (const id of blockIds) {
    for (const panelId of index.get(id) ?? []) {
      const list = byPanel.get(panelId);
      if (list) list.push(id);
      else byPanel.set(panelId, [id]);
    }
  }
  for (const [panelId, ids] of byPanel) M.unlinkPanelScript(state.doc, panelId, ids);
}

/**
 * Seçili satırlardan yeni bir panel üretir: aktif panelin hemen ardına eklenir,
 * meta'sı senaryodan doldurulur ve satırlara bağlanır. Ardından imleç bir
 * sonraki satıra kayar — Enter'a basmayı sürdürerek senaryo boyunca panel
 * dizilir.
 */
export function createPanelFromBlocks(blockIds: string[]): string | null {
  const state = useProjectStore.getState();
  if (!state.allowed('edit') || !blockIds.length) return null;
  const blocks = blocksById(blockIds);
  if (!blocks.length) return null;

  const index = state.project.panels.findIndex((p) => p.id === state.activePanelId);
  const panelId = projectActions.addPanel(index >= 0 ? index + 1 : undefined);
  const { scene, action, dialogue } = metaFromBlocks(blocks);
  M.updatePanelMeta(state.doc, panelId, {
    // Sahne numarası bulunamadıysa `nextPanelMeta`nın türettiği değer korunur.
    ...(scene ? { scene } : {}),
    action,
    dialogue,
  });
  M.linkPanelScript(state.doc, panelId, blockIds);
  advanceCursorAfter(blockIds);
  return panelId;
}

/** Seçimi, verilen blokların sonuncusundan sonraki satıra taşır. */
export function advanceCursorAfter(blockIds: string[]): void {
  const blocks = useProjectStore.getState().project.script.blocks;
  const wanted = new Set(blockIds);
  let last = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (wanted.has(blocks[i].id)) { last = i; break; }
  }
  if (last < 0) return;
  const next = blocks[last + 1];
  if (!next) return;
  useUiStore.setState({
    scriptSelection: [next.id],
    scriptCursor: next.id,
    scriptAnchor: next.id,
  });
}

/**
 * Bir satıra bağlı storyboard çizimini açar.
 * `after` verilirse o panelden sonraki bağlı panele geçer — aynı satıra bağlı
 * birden çok plan varsa tekrar tekrar basarak aralarında dolaşılır.
 */
/**
 * Bir panel yüzeyine (zaman çizelgesi kartı, ızgara hücresi) senaryo satırı
 * bırakmayı etkinleştirir. Bağlamanın en doğrudan yolu budur: satırı tut,
 * panele bırak.
 */
export function scriptDropHandlers(panelId: string, editable: boolean) {
  if (!editable) return {};
  const carriesScript = (e: React.DragEvent) => e.dataTransfer.types.includes(DND_MIME);
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!carriesScript(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
    },
    onDrop: (e: React.DragEvent) => {
      const payload = readDragPayload(e);
      if (payload?.type !== 'script') return;
      e.preventDefault();
      e.stopPropagation();
      linkBlocksToPanel(payload.blockIds, panelId);
      useUiStore.getState().showToast(tf('%d satır bağlandı.', payload.blockIds.length), 'success');
    },
  };
}

/**
 * Bir senaryo satırına bağlı çizimi açar.
 *
 * Gövde `store/mod.ts`'e taşındı: burada durduğunda senaryo modu storyboard
 * modunun ADINI biliyordu (`viewMode: 'board'`), yani §7'nin yasakladığı
 * bağı kuruyordu. Artık odak yazılıyor ve mod kabuğu gerisini yapıyor.
 */
export const openPanelForBlock = bloktanPaneleGec;
