import { breakdownEkiDuzelt, type BreakdownEki } from '../model/breakdown';
import type { BaslikSayfasi } from '../disa/baslik-sayfasi';
import { baslikSayfasiDuzelt } from '../model/baslik-sayfasi';
import * as Y from 'yjs';
import { IKI_SUTUN_BLOKLARI, type CiftGirdi } from '../format/iki-sutun';
import { sozlukAnahtari, sozlugeUygun } from '../dil/sozluk';
import {
  assetsMap,
  bloklariFragmenteYaz,
  findLayerMap,
  findObjectMap,
  findPanelIndex,
  findPanelMap,
  layerToY,
  metaMap,
  objectToY,
  panelToY,
  panelsArray,
  orderedPanelMaps,
  readPanel,
  readScript,
  scriptMap,
  sozlukMap,
  ciftlerArray,
  yerImleriMap,
  revizyonlarArray,
  revizyonIsaretleriMap,
  karakterlerMap,
  lokasyonlarMap,
  dunyalarMap,
  worldMapsMap,
  copArray,
  baslikSayfasiMap,
  breakdownMap,
  settingsMap,
} from './schema';
import { createLayer, createPanel, nextPanelMeta } from '../model/factory';
import { reconcileScript } from '../model/reconcile';
import { uid } from '../util/id';
import {
  revizyonCoz,
  REVIZYON_RENKLERI,
  siradakiRenk,
  type Revizyon,
  type RevizyonRengi,
} from '../model/revizyon';
import type {
  Layer,
  Panel,
  PanelMeta,
  ProjectSettings,
  SBObject,
  ScriptDoc,
} from '../model/types';
import type { ScriptBlock } from '../model/script';
import {
  etiketiDuzelt, rengiDuzelt, sonrakiRenk, type YerImi, type YerImiRengi,
} from '../model/yerimi';
import { adiDuzelt as karakterAdiDuzelt, karakterAdiGecerliMi, type Karakter } from '../model/karakter';
import { lokasyonAdiDuzelt, lokasyonAdiGecerliMi, lokasyonTipiDuzelt, type Lokasyon } from '../model/lokasyon';
import { dunyaAdiDuzelt, dunyaAdiGecerliMi, dunyaTuruDuzelt, type Dunya } from '../model/dunya';
import { copEskimisleriAyir, type CopOgesi } from '../model/geridonusum';
import {
  DEFAULT_MAP_SETTINGS, DEFAULT_COUNTRY_CONFIG, countryConfigKey, countryKey, defaultMapCountry,
  labelKey, markerKey, overlayKey, parseCountryConfig, parseMapCountry, parseMapLabel,
  parseMapMarker, parseMapOverlay, parseMapSettings, settingsKey, validMapId,
  type CountryConfig, type GeographyControls, type MapCountry, type MapDraft, type MapLabel, type MapMarker, type MapOverlay, type MapSettings,
} from '../model/world-map';
import { PROJECT_MAP_ID } from '../model/world-map-id';
import { generateGeography, MapLayoutError } from '../model/world-map-generator';
import { generateCountries } from '../model/world-map-countries';

/** Yerel düzenlemeler bu origin ile işaretlenir — UndoManager yalnızca bunları geri alır. */
export const LOCAL_ORIGIN = Symbol('storyboard-local');

function tx(doc: Y.Doc, fn: () => void, origin: unknown = LOCAL_ORIGIN) {
  doc.transact(fn, origin);
}

function touch(doc: Y.Doc) {
  metaMap(doc).set('updatedAt', Date.now());
}

/* ------------------------------- Proje ------------------------------- */

/** Tek varlığı yazar. */
export function setAsset(doc: Y.Doc, assetId: string, dataUrl: string) {
  tx(doc, () => { assetsMap(doc).set(assetId, dataUrl); });
}

/** Birden çok varlığı tek transaction'da yazar (proje açma). */
export function setAssets(doc: Y.Doc, assets: Record<string, string>, origin: unknown = LOCAL_ORIGIN) {
  const entries = Object.entries(assets);
  if (!entries.length) return;
  tx(doc, () => {
    const map = assetsMap(doc);
    for (const [id, url] of entries) map.set(id, url);
  }, origin);
}

/* -------------------------- Dünya haritası -------------------------- */

function requireMapId(id: string): void {
  if (!validMapId(id)) throw new Error('Invalid world map ID');
}

/** Settings are one record; each marker/label/overlay has its own CRDT key. */
export function setWorldMapSettings(doc: Y.Doc, worldId: string, patch: { seed?: number; controls?: GeographyControls }): void {
  requireMapId(worldId);
  if (worldId === PROJECT_MAP_ID) throw new MapLayoutError('invalid');
  const root = worldMapsMap(doc);
  const current = parseMapSettings(root.get(settingsKey(worldId))) ?? DEFAULT_MAP_SETTINGS;
  const next = parseMapSettings({
    seed: patch.seed ?? current.seed,
    controls: { ...current.controls, ...patch.controls },
  });
  if (!next) throw new Error('Invalid world map settings');
  tx(doc, () => { root.set(settingsKey(worldId), next); touch(doc); });
}

export function setCountryConfig(doc: Y.Doc, worldId: string, patch: Partial<CountryConfig>): void {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  const current = parseCountryConfig(root.get(countryConfigKey(worldId))) ?? DEFAULT_COUNTRY_CONFIG;
  if (worldId === PROJECT_MAP_ID && patch.count !== undefined && patch.count !== current.count)
    throw new MapLayoutError('invalid');
  const next = parseCountryConfig({ ...current, ...patch });
  if (!next) throw new Error('Invalid country config');
  tx(doc, () => { root.set(countryConfigKey(worldId), next); touch(doc); });
}

export function updateMapCountry(doc: Y.Doc, worldId: string, id: string, patch: Partial<MapCountry>): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  const current = parseMapCountry(root.get(countryKey(worldId, id)), worldId, id) ?? defaultMapCountry(worldId, id);
  const next = parseMapCountry({ ...current, ...patch }, worldId, id);
  if (!next) throw new Error('Invalid map country');
  tx(doc, () => { root.set(countryKey(worldId, id), next); touch(doc); });
  return true;
}

/** Geography and visible country count form a single undoable draft application. */
export function validateMapDraft(
  draft: MapDraft, current: CountryConfig,
): { settings: MapSettings; config: CountryConfig } {
  const settings = parseMapSettings({ seed: draft.seed, controls: draft.controls });
  const config = parseCountryConfig({ ...current, count: draft.countryCount });
  if (!settings || !config) throw new MapLayoutError('invalid');
  generateGeography(settings.seed, settings.controls);
  generateCountries(settings.seed, settings.controls, config.count);
  return { settings, config };
}

export function applyMapDraft(doc: Y.Doc, worldId: string, draft: MapDraft): void {
  requireMapId(worldId);
  if (worldId === PROJECT_MAP_ID) throw new MapLayoutError('invalid');
  const root = worldMapsMap(doc);
  const current = parseCountryConfig(root.get(countryConfigKey(worldId))) ?? DEFAULT_COUNTRY_CONFIG;
  const { settings, config } = validateMapDraft(draft, current);
  tx(doc, () => {
    root.set(settingsKey(worldId), settings);
    root.set(countryConfigKey(worldId), config);
    touch(doc);
  });
}

export function addMapMarker(
  doc: Y.Doc, worldId: string, input: Omit<MapMarker, 'worldId' | 'id'> & { id?: string },
): MapMarker {
  requireMapId(worldId);
  const id = input.id ?? uid('mk');
  const marker = parseMapMarker({ ...input, id, worldId }, worldId, id);
  if (!marker) throw new Error('Invalid map marker');
  const root = worldMapsMap(doc);
  if (root.has(markerKey(worldId, id))) throw new Error('Map marker already exists');
  tx(doc, () => { root.set(markerKey(worldId, id), marker); touch(doc); });
  return marker;
}

export function updateMapMarker(
  doc: Y.Doc, worldId: string, id: string, patch: Partial<Omit<MapMarker, 'worldId' | 'id'>>,
): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  const current = parseMapMarker(root.get(markerKey(worldId, id)), worldId, id);
  if (!current) return false;
  const next = parseMapMarker({ ...current, ...patch }, worldId, id);
  if (!next) throw new Error('Invalid map marker');
  tx(doc, () => { root.set(markerKey(worldId, id), next); touch(doc); });
  return true;
}

export function removeMapMarker(doc: Y.Doc, worldId: string, id: string): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  if (!root.has(markerKey(worldId, id))) return false;
  tx(doc, () => { root.delete(markerKey(worldId, id)); touch(doc); });
  return true;
}

export function addMapLabel(
  doc: Y.Doc, worldId: string, input: Omit<MapLabel, 'worldId' | 'id'> & { id?: string },
): MapLabel {
  requireMapId(worldId);
  const id = input.id ?? uid('ml');
  const label = parseMapLabel({ ...input, id, worldId }, worldId, id);
  if (!label) throw new Error('Invalid map label');
  const root = worldMapsMap(doc);
  if (root.has(labelKey(worldId, id))) throw new Error('Map label already exists');
  tx(doc, () => { root.set(labelKey(worldId, id), label); touch(doc); });
  return label;
}

export function updateMapLabel(
  doc: Y.Doc, worldId: string, id: string, patch: Partial<Omit<MapLabel, 'worldId' | 'id'>>,
): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  const current = parseMapLabel(root.get(labelKey(worldId, id)), worldId, id);
  if (!current) return false;
  const next = parseMapLabel({ ...current, ...patch }, worldId, id);
  if (!next) throw new Error('Invalid map label');
  tx(doc, () => { root.set(labelKey(worldId, id), next); touch(doc); });
  return true;
}

export function removeMapLabel(doc: Y.Doc, worldId: string, id: string): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  if (!root.has(labelKey(worldId, id))) return false;
  tx(doc, () => { root.delete(labelKey(worldId, id)); touch(doc); });
  return true;
}

export function addMapOverlay(
  doc: Y.Doc, worldId: string,
  input: Omit<MapOverlay, 'worldId' | 'id' | 'order'> & { id?: string; order?: number },
): MapOverlay {
  requireMapId(worldId);
  const id = input.id ?? uid('mo');
  const overlay = parseMapOverlay({ ...input, id, worldId, order: input.order ?? 0 }, worldId, id);
  if (!overlay) throw new Error('Invalid map overlay');
  const root = worldMapsMap(doc);
  if (root.has(overlayKey(worldId, id))) throw new Error('Map overlay already exists');
  tx(doc, () => { root.set(overlayKey(worldId, id), overlay); touch(doc); });
  return overlay;
}

export function updateMapOverlay(
  doc: Y.Doc, worldId: string, id: string, patch: Partial<Omit<MapOverlay, 'worldId' | 'id'>>,
): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  const current = parseMapOverlay(root.get(overlayKey(worldId, id)), worldId, id);
  if (!current) return false;
  const next = parseMapOverlay({ ...current, ...patch }, worldId, id);
  if (!next) throw new Error('Invalid map overlay');
  tx(doc, () => { root.set(overlayKey(worldId, id), next); touch(doc); });
  return true;
}

export function removeMapOverlay(doc: Y.Doc, worldId: string, id: string): boolean {
  requireMapId(worldId);
  const root = worldMapsMap(doc);
  if (!root.has(overlayKey(worldId, id))) return false;
  tx(doc, () => { root.delete(overlayKey(worldId, id)); touch(doc); });
  return true;
}

export function setProjectName(doc: Y.Doc, name: string) {
  tx(doc, () => { metaMap(doc).set('name', name); touch(doc); });
}

export function updateSettings(doc: Y.Doc, patch: Partial<ProjectSettings>) {
  tx(doc, () => {
    const s = settingsMap(doc);
    for (const [k, v] of Object.entries(patch)) s.set(k, v);
    touch(doc);
  });
}

/* ------------------------------ Senaryo ------------------------------ */

/**
 * Senaryoyu belgeye yazar ve artık var olmayan bloklara işaret eden panel
 * bağlantılarını temizler.
 *
 * Yeni bloklar önce mevcut senaryoyla hizalanır (`reconcileScript`): metni
 * değişmiş ama yapıdaki yeri aynı olan bloklar kimliğini korur, böylece panel
 * bağları yeniden içe aktarımda kopmaz. Yalnızca gerçekten silinmiş blokların
 * bağları düşer.
 */
export function setScript(doc: Y.Doc, script: ScriptDoc) {
  const onceki = readScript(doc).blocks;
  const bloklar = reconcileScript(onceki, script.blocks);
  const alive = new Set(bloklar.map((b) => b.id));
  tx(doc, () => {
    /* §15 / §13.2 geri dönüşüm kutusu — GERÇEKTEN silinmiş bloklar (reconcile
       sonrası hayatta kalmayanlar) iz bırakmadan kaybolmuyor. `komsu` en
       yakın HAYATTA KALAN önceki bloğa bağlanıyor (yalnız bir önceki değil):
       aynı çağrıda ardışık birkaç blok birden silinirse hepsi aynı sağlam
       çapaya oturur, restore ederken "eski yerine" komşusu gerçekten orada
       bulunur.
       Bilinen sınır: bu yalnız `setScript`ten geçen TOPLU yeniden yazımları
       (çeviri, karşılaştırma birleştirme, .fountain/.fdx içe aktarım)
       yakalıyor — canlı klavye düzenlemesi (ProseMirror/y-prosemirror)
       `Y.XmlFragment`i doğrudan değiştiriyor ve bu yoldan geçmiyor. */
    onceki.forEach((b, i) => {
      if (alive.has(b.id)) return;
      let j = i - 1;
      while (j >= 0 && !alive.has(onceki[j].id)) j -= 1;
      copaEkle(doc, 'blok', b, j >= 0 ? onceki[j].id : null);
    });
    scriptMap(doc).set('name', script.name);
    bloklariFragmenteYaz(doc, bloklar);

    const arr = panelsArray(doc);
    for (let i = 0; i < arr.length; i++) {
      const pm = arr.get(i);
      const refs = (pm.get('scriptRefs') as string[] | undefined) ?? [];
      const kept = refs.filter((r) => alive.has(r));
      if (kept.length !== refs.length) pm.set('scriptRefs', kept);
    }
    touch(doc);
  });
}

export function clearScript(doc: Y.Doc) {
  setScript(doc, { name: '', blocks: [] });
}

/** Paneli verilen senaryo bloklarına bağlar (birleşim — mevcutlar korunur). */
export function linkPanelScript(doc: Y.Doc, panelId: string, blockIds: string[]) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  tx(doc, () => {
    const refs = (pm.get('scriptRefs') as string[] | undefined) ?? [];
    pm.set('scriptRefs', [...new Set([...refs, ...blockIds])]);
    touch(doc);
  });
}

export function unlinkPanelScript(doc: Y.Doc, panelId: string, blockIds: string[]) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  const drop = new Set(blockIds);
  tx(doc, () => {
    const refs = (pm.get('scriptRefs') as string[] | undefined) ?? [];
    pm.set('scriptRefs', refs.filter((r) => !drop.has(r)));
    touch(doc);
  });
}

/* ------------------------------ Paneller ----------------------------- */

export function addPanel(doc: Y.Doc, atIndex?: number): string {
  const arr = panelsArray(doc);
  const ordered = orderedPanelMaps(doc);
  const settings = settingsMap(doc).toJSON() as ProjectSettings;
  // Ortak çalışmada dizi eşzamanlı küçülmüş olabilir; sınır dışı okumak
  // `readPanel(undefined)` ile çökerdi.
  const index = Math.max(0, Math.min(atIndex ?? ordered.length, ordered.length));
  const prev = index > 0 ? readPanel(ordered[index - 1]) : undefined;
  const panel = createPanel({
    meta: nextPanelMeta(prev, settings.defaultPanelDuration ?? 3),
    guides: { ...(settings.guides ?? {}), aspect: settings.aspect } as Panel['guides'],
  });
  tx(doc, () => {
    const map = panelToY(panel);
    arr.push([map]);
    ordered.splice(index, 0, map);
    ordered.forEach((item, position) => item.set('order', position));
    touch(doc);
  });
  return panel.id;
}

export function duplicatePanel(doc: Y.Doc, panelId: string): string | null {
  const arr = panelsArray(doc);
  const ordered = orderedPanelMaps(doc);
  const index = ordered.findIndex((map) => map.get('id') === panelId);
  if (index < 0) return null;
  const src = readPanel(ordered[index]);

  // Kimlikler yeniden üretilir; katman kimlikleri objelerde de güncellenir.
  const copy = createPanel({
    meta: { ...src.meta },
    guides: { ...src.guides },
    transition: src.transition,
    transitionDuration: src.transitionDuration,
    background: src.background,
    // Aynı senaryo anını farklı açıdan çekmek yaygın — bağlantı kopyaya taşınır.
    scriptRefs: [...src.scriptRefs],
    layers: [],
    objects: [],
  });
  const layerIdMap = new Map<string, string>();
  copy.layers = src.layers.map((l) => {
    const nl = createLayer({ ...l, id: undefined });
    layerIdMap.set(l.id, nl.id);
    return nl;
  });
  copy.objects = src.objects.map((o) => ({
    ...o,
    id: uid(o.kind.slice(0, 3)),
    layerId: layerIdMap.get(o.layerId) ?? copy.layers[0]?.id ?? o.layerId,
  })) as SBObject[];

  tx(doc, () => {
    const map = panelToY(copy);
    arr.push([map]);
    ordered.splice(index + 1, 0, map);
    ordered.forEach((item, position) => item.set('order', position));
    touch(doc);
  });
  return copy.id;
}

/**
 * Paneli siler — §13.2 geri dönüşüm kutusuna YÖNLENDİRİR (Karar 2, tek
 * silme yolu). Silinen TAM panel kaydı ve o andaki önceki komşusu
 * `copaEkle` ile arşivlenir; "Geri getir" o komşuya (sonuna değil) koyar.
 */
export function removePanel(doc: Y.Doc, panelId: string) {
  const index = findPanelIndex(doc, panelId);
  if (index < 0) return;
  const arr = panelsArray(doc);
  if (arr.length <= 1) return; // en az bir panel kalmalı
  const veri = readPanel(arr.get(index));
  const ordered = orderedPanelMaps(doc);
  const displayed = ordered.findIndex((map) => map.get('id') === panelId);
  const komsu = displayed > 0 ? (ordered[displayed - 1].get('id') as string) : null;
  tx(doc, () => {
    copaEkle(doc, 'panel', veri, komsu);
    arr.delete(index, 1);
    touch(doc);
  });
}

export function movePanel(doc: Y.Doc, panelId: string, toIndex: number) {
  const ordered = orderedPanelMaps(doc);
  const from = ordered.findIndex((panel) => panel.get('id') === panelId);
  if (from < 0) return;
  const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1));
  if (clamped === from) return;
  tx(doc, () => {
    const [moving] = ordered.splice(from, 1);
    ordered.splice(clamped, 0, moving);
    ordered.forEach((panel, index) => panel.set('order', index));
    touch(doc);
  });
}

export function updatePanelMeta(doc: Y.Doc, panelId: string, patch: Partial<PanelMeta>) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  tx(doc, () => {
    const m = pm.get('meta') as Y.Map<any>;
    for (const [k, v] of Object.entries(patch)) m.set(k, v);
    touch(doc);
  });
}

export function updatePanel(
  doc: Y.Doc,
  panelId: string,
  patch: Partial<Pick<Panel, 'transition' | 'transitionDuration' | 'background'>>,
) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  tx(doc, () => {
    for (const [k, v] of Object.entries(patch)) pm.set(k, v);
    touch(doc);
  });
}

export function updatePanelGuides(doc: Y.Doc, panelId: string, patch: Partial<Panel['guides']>) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  tx(doc, () => {
    const g = pm.get('guides') as Y.Map<any>;
    for (const [k, v] of Object.entries(patch)) g.set(k, v);
    touch(doc);
  });
}

/* ------------------------------ Katmanlar ---------------------------- */

export function addLayer(doc: Y.Doc, panelId: string, partial: Partial<Layer> = {}): string | null {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return null;
  const arr = pm.get('layers') as Y.Array<Y.Map<any>>;
  const layer = createLayer({
    name: partial.name ?? `Katman ${arr.length + 1}`,
    ...partial,
    order: arr.length,
  });
  tx(doc, () => { arr.push([layerToY(layer)]); touch(doc); });
  return layer.id;
}

export function updateLayer(doc: Y.Doc, panelId: string, layerId: string, patch: Partial<Layer>) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  const found = findLayerMap(pm, layerId);
  if (!found) return;
  tx(doc, () => {
    for (const [k, v] of Object.entries(patch)) found.map.set(k, v);
    touch(doc);
  });
}

export function removeLayer(doc: Y.Doc, panelId: string, layerId: string) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  const layers = pm.get('layers') as Y.Array<Y.Map<any>>;
  if (layers.length <= 1) return;
  const found = findLayerMap(pm, layerId);
  if (!found) return;
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  tx(doc, () => {
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects.get(i).get('layerId') === layerId) objects.delete(i, 1);
    }
    layers.delete(found.index, 1);
    touch(doc);
  });
}

export function duplicateLayer(doc: Y.Doc, panelId: string, layerId: string): string | null {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return null;
  const found = findLayerMap(pm, layerId);
  if (!found) return null;
  const src = found.map.toJSON() as Layer;
  const copy = createLayer({ ...src, id: undefined, name: `${src.name} kopya`, order: found.index + 1 });
  const layers = pm.get('layers') as Y.Array<Y.Map<any>>;
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  tx(doc, () => {
    layers.insert(found.index + 1, [layerToY(copy)]);
    const clones: Y.Map<any>[] = [];
    for (let i = 0; i < objects.length; i++) {
      const o = objects.get(i).toJSON() as SBObject;
      if (o.layerId === layerId) {
        clones.push(objectToY({
          ...o,
          id: uid(o.kind.slice(0, 3)),
          layerId: copy.id,
        } as SBObject));
      }
    }
    if (clones.length) objects.push(clones);
    touch(doc);
  });
  return copy.id;
}

export function reorderLayer(doc: Y.Doc, panelId: string, layerId: string, toIndex: number) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  const layers = pm.get('layers') as Y.Array<Y.Map<any>>;
  const ordered = layers.toArray().sort((a, b) => Number(a.get('order')) - Number(b.get('order')));
  const from = ordered.findIndex((layer) => layer.get('id') === layerId);
  if (from < 0) return;
  const clamped = Math.max(0, Math.min(Math.trunc(toIndex), ordered.length - 1));
  if (clamped === from) return;
  tx(doc, () => {
    const [moved] = ordered.splice(from, 1);
    ordered.splice(clamped, 0, moved);
    // Y.Map kimliklerini koru: eşzamanlı ad/opaklık düzenlemeleri silinmesin.
    ordered.forEach((layer, index) => {
      if (layer.get('order') !== index) layer.set('order', index);
    });
    touch(doc);
  });
}

/* ------------------------------- Objeler ----------------------------- */

export function addObject(doc: Y.Doc, panelId: string, obj: SBObject): string | null {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return null;
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  tx(doc, () => { objects.push([objectToY(obj)]); touch(doc); });
  return obj.id;
}

export function addObjects(doc: Y.Doc, panelId: string, objs: SBObject[]) {
  const pm = findPanelMap(doc, panelId);
  if (!pm || !objs.length) return;
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  tx(doc, () => { objects.push(objs.map(objectToY)); touch(doc); });
}

export function updateObject(
  doc: Y.Doc,
  panelId: string,
  objectId: string,
  patch: Partial<SBObject> | Record<string, unknown>,
) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  const found = findObjectMap(pm, objectId);
  if (!found) return;
  tx(doc, () => {
    for (const [k, v] of Object.entries(patch)) found.map.set(k, v);
    touch(doc);
  });
}

/** Birden çok objeye aynı transaction içinde yama uygular (çoklu seçim). */
export function updateObjects(
  doc: Y.Doc,
  panelId: string,
  ids: string[],
  patchFor: (obj: SBObject) => Record<string, unknown>,
) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  tx(doc, () => {
    for (const id of ids) {
      const found = findObjectMap(pm, id);
      if (!found) continue;
      const patch = patchFor(found.map.toJSON() as SBObject);
      for (const [k, v] of Object.entries(patch)) found.map.set(k, v);
    }
    touch(doc);
  });
}

export function removeObjects(doc: Y.Doc, panelId: string, ids: string[]) {
  const pm = findPanelMap(doc, panelId);
  if (!pm || !ids.length) return;
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  const set = new Set(ids);
  tx(doc, () => {
    for (let i = objects.length - 1; i >= 0; i--) {
      if (set.has(objects.get(i).get('id'))) objects.delete(i, 1);
    }
    touch(doc);
  });
}

export function duplicateObjects(doc: Y.Doc, panelId: string, ids: string[]): string[] {
  const pm = findPanelMap(doc, panelId);
  if (!pm || !ids.length) return [];
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  const newIds: string[] = [];
  tx(doc, () => {
    const clones: Y.Map<any>[] = [];
    for (const id of ids) {
      const found = findObjectMap(pm, id);
      if (!found) continue;
      const src = found.map.toJSON() as SBObject;
      const nid = uid(src.kind.slice(0, 3));
      newIds.push(nid);
      clones.push(objectToY({ ...src, id: nid, x: src.x + 24, y: src.y + 24 } as SBObject));
    }
    if (clones.length) objects.push(clones);
    touch(doc);
  });
  return newIds;
}

/** Objelerin katman içi sırasını değiştirir. */
export function reorderObject(
  doc: Y.Doc,
  panelId: string,
  objectId: string,
  direction: 'front' | 'back' | 'forward' | 'backward',
) {
  const pm = findPanelMap(doc, panelId);
  if (!pm) return;
  const objects = pm.get('objects') as Y.Array<Y.Map<any>>;
  const found = findObjectMap(pm, objectId);
  if (!found) return;
  const all = objects.toJSON() as SBObject[];
  const zs = all.map((o) => o.z);
  const maxZ = Math.max(0, ...zs);
  const minZ = Math.min(0, ...zs);
  tx(doc, () => {
    const cur = found.map.get('z') as number;
    if (direction === 'front') found.map.set('z', maxZ + 1);
    else if (direction === 'back') found.map.set('z', minZ - 1);
    else if (direction === 'forward') found.map.set('z', cur + 1.5);
    else found.map.set('z', cur - 1.5);
    touch(doc);
  });
}

/* ------------------------------ Varlıklar ---------------------------- */

/* ------------------------------------------------------------------ */
/* Proje sözlüğü (§16.4)                                               */
/* ------------------------------------------------------------------ */

/**
 * Sözlüğe kelime ekler. Anahtar katlanmış biçimdir, değer kullanıcının
 * yazdığı ÖZGÜN biçimdir.
 *
 * Uygun olmayan kelime (boş, harfsiz, 64'ten uzun) sessizce yutulmaz —
 * `false` döner ve çağıran kullanıcıya söyler. Sessiz yutma, kullanıcıya
 * kelimeyi eklediğini sandırırdı.
 */
export function sozlugeEkle(doc: Y.Doc, kelime: string): boolean {
  if (!sozlugeUygun(kelime)) return false;
  const ozgun = kelime.normalize('NFC').trim();
  /* `tx` ŞART: origin'siz yazım `LOCAL_ORIGIN` taşımaz, dolayısıyla ne geri
     alınabilir ne de sunucu reddettiğinde istemci toparlanabilir —
     `client.ts` reddi `store.undo()` ile karşılıyor ve o çağrı, kapsam
     dışındaki bir yazımda ALAKASIZ bir önceki düzenlemeyi geri alırdı. */
  tx(doc, () => {
    sozlukMap(doc).set(sozlukAnahtari(ozgun), ozgun);
  });
  return true;
}

/** Sözlükten kelime çıkarır. Yoksa `false`. */
export function sozluktenCikar(doc: Y.Doc, kelime: string): boolean {
  const harita = sozlukMap(doc);
  const anahtar = sozlukAnahtari(kelime);
  if (!harita.has(anahtar)) return false;
  tx(doc, () => {
    harita.delete(anahtar);
  });
  return true;
}

/** Birden çok kelimeyi TEK transaction'da ekler — geri alma tek adım olur. */
export function sozlugeTopluEkle(doc: Y.Doc, kelimeler: readonly string[]): number {
  let n = 0;
  /* Dıştaki `tx` origin'i taşır; içteki tek tek `tx` çağrıları Yjs'te bu
     işleme KATILIR, ayrı adım açmaz — geri alma gerçekten tek adım olur. */
  tx(doc, () => {
    for (const k of kelimeler) if (sozlugeEkle(doc, k)) n++;
  });
  return n;
}

/* ------------------------------ Yer imleri ---------------------------- */

/**
 * Yer imi koyar ya da var olanı günceller (§13.4).
 *
 * `tx` ŞART: origin'siz yazım `LOCAL_ORIGIN` taşımaz, geri alınamaz ve sunucu
 * reddettiğinde istemci toparlanamaz — sözlükte tam olarak bu hata yapılmıştı.
 */
export function yerImiKoy(
  doc: Y.Doc,
  blockId: string,
  im: Partial<YerImi> = {},
): void {
  if (!blockId) return;
  const harita = yerImleriMap(doc);
  const mevcut = harita.get(blockId);
  tx(doc, () => {
    harita.set(blockId, {
      etiket: etiketiDuzelt(im.etiket ?? mevcut?.etiket ?? ''),
      renk: rengiDuzelt(im.renk ?? mevcut?.renk),
    });
  });
}

/** Yer imini kaldırır. Yoksa `false`. */
export function yerImiKaldir(doc: Y.Doc, blockId: string): boolean {
  const harita = yerImleriMap(doc);
  if (!harita.has(blockId)) return false;
  tx(doc, () => { harita.delete(blockId); });
  return true;
}

/**
 * İmin rengini palette bir ileri alır ve YENİ rengi döner. İm yoksa `null`.
 *
 * Okuma ve yazma TEK işlemde: çağıran önce okuyup sonra yazsaydı, iki ortak
 * yazar aynı ime aynı anda bastığında biri diğerinin rengini görmeden
 * hesaplar ve iki tık tek renk ilerletirdi.
 */
export function yerImiRenginiIlerlet(doc: Y.Doc, blockId: string): YerImiRengi | null {
  const harita = yerImleriMap(doc);
  const mevcut = harita.get(blockId);
  if (!mevcut) return null;
  const renk = sonrakiRenk(rengiDuzelt(mevcut.renk));
  tx(doc, () => {
    harita.set(blockId, { etiket: etiketiDuzelt(mevcut.etiket ?? ''), renk });
  });
  return renk;
}

/**
 * İmi açıp kapatır ve SON durumu döner.
 *
 * Tek eylem olarak duruyor çünkü kısayolun anlamı "bu satırda im olsun /
 * olmasın"; çağıranın önce okuyup sonra yazması, iki ortak yazarın aynı anda
 * bastığında birinin yazımını görünmez kılardı.
 */
export function yerImiCevir(doc: Y.Doc, blockId: string, im?: Partial<YerImi>): boolean {
  if (yerImiKaldir(doc, blockId)) return false;
  yerImiKoy(doc, blockId, im);
  return true;
}

/* --------------------------- Karakterler (§13.2) --------------------------- */

/**
 * Yeni karakter ekler.
 *
 * Ad boşsa ya da (Türkçe katlamayla) BAŞKA bir karakterle çakışıyorsa
 * AÇIKÇA fırlar — sessizce reddetmek ya da sessizce ikinci bir kayıt
 * açmak, kullanıcının kadro listesinde hangi kaydın "gerçek" olduğunu
 * belirsizleştirirdi (proje kuralı: sessiz başarısızlık yasak).
 */
export function karakterEkle(doc: Y.Doc, veri: Partial<Omit<Karakter, 'id'>> = {}): Karakter {
  const harita = karakterlerMap(doc);
  const ad = karakterAdiDuzelt(veri.ad);
  const gecerlilik = karakterAdiGecerliMi(ad, [...harita.values()]);
  if (!gecerlilik.gecerli) throw new Error(gecerlilik.hata);
  const karakter: Karakter = {
    id: uid('kr'),
    ad,
    aciklama: veri.aciklama ?? '',
    renk: veri.renk ?? '',
    notlar: veri.notlar ?? '',
  };
  tx(doc, () => { harita.set(karakter.id, karakter); touch(doc); });
  return karakter;
}

/**
 * Karakteri günceller. Kayıt yoksa `false`.
 *
 * Ad değiştiriliyorsa AYNI benzersizlik denetimi ekleme ile aynı yoldan
 * geçer — `karakterEkle`'nin kuralını burada TEKRAR YAZMAK yerine ikisi de
 * `karakterAdiGecerliMi`yi çağırıyor (Karar 2, tek ev).
 */
export function karakterGuncelle(
  doc: Y.Doc,
  id: string,
  patch: Partial<Omit<Karakter, 'id'>>,
): boolean {
  const harita = karakterlerMap(doc);
  const mevcut = harita.get(id);
  if (!mevcut) return false;
  const ad = patch.ad === undefined ? mevcut.ad : karakterAdiDuzelt(patch.ad);
  const gecerlilik = karakterAdiGecerliMi(ad, [...harita.values()], id);
  if (!gecerlilik.gecerli) throw new Error(gecerlilik.hata);
  tx(doc, () => {
    harita.set(id, { ...mevcut, ...patch, ad });
    touch(doc);
  });
  return true;
}

/** Karakteri siler. Yoksa `false`. */
export function karakterSil(doc: Y.Doc, id: string): boolean {
  const harita = karakterlerMap(doc);
  if (!harita.has(id)) return false;
  tx(doc, () => { harita.delete(id); touch(doc); });
  return true;
}

/* --------------------------- Lokasyonlar (§13.2) --------------------------- */

/** `karakterEkle`nin lokasyon karşılığı — aynı gerekçe, aynı desen. */
export function lokasyonEkle(doc: Y.Doc, veri: Partial<Omit<Lokasyon, 'id'>> = {}): Lokasyon {
  const harita = lokasyonlarMap(doc);
  const ad = lokasyonAdiDuzelt(veri.ad);
  const gecerlilik = lokasyonAdiGecerliMi(ad, [...harita.values()]);
  if (!gecerlilik.gecerli) throw new Error(gecerlilik.hata);
  const lokasyon: Lokasyon = {
    id: uid('lk'),
    ad,
    tip: lokasyonTipiDuzelt(veri.tip),
    aciklama: veri.aciklama ?? '',
    notlar: veri.notlar ?? '',
  };
  tx(doc, () => { harita.set(lokasyon.id, lokasyon); touch(doc); });
  return lokasyon;
}

/** `karakterGuncelle`nin lokasyon karşılığı. */
export function lokasyonGuncelle(
  doc: Y.Doc,
  id: string,
  patch: Partial<Omit<Lokasyon, 'id'>>,
): boolean {
  const harita = lokasyonlarMap(doc);
  const mevcut = harita.get(id);
  if (!mevcut) return false;
  const ad = patch.ad === undefined ? mevcut.ad : lokasyonAdiDuzelt(patch.ad);
  const gecerlilik = lokasyonAdiGecerliMi(ad, [...harita.values()], id);
  if (!gecerlilik.gecerli) throw new Error(gecerlilik.hata);
  const tip = patch.tip === undefined ? mevcut.tip : lokasyonTipiDuzelt(patch.tip);
  tx(doc, () => {
    harita.set(id, { ...mevcut, ...patch, ad, tip });
    touch(doc);
  });
  return true;
}

/** Lokasyonu siler. Yoksa `false`. */
export function lokasyonSil(doc: Y.Doc, id: string): boolean {
  const harita = lokasyonlarMap(doc);
  if (!harita.has(id)) return false;
  tx(doc, () => { harita.delete(id); touch(doc); });
  return true;
}

/* --------------------------- Dünyalar (§13.2) --------------------------- */

/** `karakterEkle`nin dünya karşılığı — aynı gerekçe, aynı desen. */
export function dunyaEkle(doc: Y.Doc, veri: Partial<Omit<Dunya, 'id'>> = {}): Dunya {
  const harita = dunyalarMap(doc);
  const ad = dunyaAdiDuzelt(veri.ad);
  const gecerlilik = dunyaAdiGecerliMi(ad, [...harita.values()]);
  if (!gecerlilik.gecerli) throw new Error(gecerlilik.hata);
  const dunya: Dunya = {
    id: uid('dn'),
    ad,
    tur: dunyaTuruDuzelt(veri.tur),
    aciklama: veri.aciklama ?? '',
    notlar: veri.notlar ?? '',
    bagliKarakterler: [...(veri.bagliKarakterler ?? [])],
    bagliLokasyonlar: [...(veri.bagliLokasyonlar ?? [])],
  };
  tx(doc, () => { harita.set(dunya.id, dunya); touch(doc); });
  return dunya;
}

/** `karakterGuncelle`nin dünya karşılığı. */
export function dunyaGuncelle(
  doc: Y.Doc,
  id: string,
  patch: Partial<Omit<Dunya, 'id'>>,
): boolean {
  const harita = dunyalarMap(doc);
  const mevcut = harita.get(id);
  if (!mevcut) return false;
  const ad = patch.ad === undefined ? mevcut.ad : dunyaAdiDuzelt(patch.ad);
  const gecerlilik = dunyaAdiGecerliMi(ad, [...harita.values()], id);
  if (!gecerlilik.gecerli) throw new Error(gecerlilik.hata);
  const tur = patch.tur === undefined ? mevcut.tur : dunyaTuruDuzelt(patch.tur);
  tx(doc, () => {
    harita.set(id, { ...mevcut, ...patch, ad, tur });
    touch(doc);
  });
  return true;
}

/** Dünyayı siler. Yoksa `false`. */
export function dunyaSil(doc: Y.Doc, id: string): boolean {
  const harita = dunyalarMap(doc);
  if (!harita.has(id)) return false;
  tx(doc, () => { harita.delete(id); touch(doc); });
  return true;
}

/**
 * Dünyayı karakterlere bağlar (birleşim — mevcutlar korunur).
 *
 * `linkPanelScript`in AYNISI: küme birleşimi, çünkü iki yazar aynı anda
 * FARKLI karakter bağlarsa "kalanı yaz" biri diğerini ezerdi.
 */
export function dunyaKarakterBagla(doc: Y.Doc, dunyaId: string, karakterIdleri: string[]): boolean {
  const harita = dunyalarMap(doc);
  const mevcut = harita.get(dunyaId);
  if (!mevcut) return false;
  tx(doc, () => {
    harita.set(dunyaId, {
      ...mevcut,
      bagliKarakterler: [...new Set([...mevcut.bagliKarakterler, ...karakterIdleri])],
    });
    touch(doc);
  });
  return true;
}

/** `dunyaKarakterBagla`nın kaldırma karşılığı — `unlinkPanelScript` ile aynı desen. */
export function dunyaKarakterBaginiKaldir(doc: Y.Doc, dunyaId: string, karakterIdleri: string[]): boolean {
  const harita = dunyalarMap(doc);
  const mevcut = harita.get(dunyaId);
  if (!mevcut) return false;
  const drop = new Set(karakterIdleri);
  tx(doc, () => {
    harita.set(dunyaId, {
      ...mevcut,
      bagliKarakterler: mevcut.bagliKarakterler.filter((id) => !drop.has(id)),
    });
    touch(doc);
  });
  return true;
}

/** `dunyaKarakterBagla`nın lokasyon karşılığı. */
export function dunyaLokasyonBagla(doc: Y.Doc, dunyaId: string, lokasyonIdleri: string[]): boolean {
  const harita = dunyalarMap(doc);
  const mevcut = harita.get(dunyaId);
  if (!mevcut) return false;
  tx(doc, () => {
    harita.set(dunyaId, {
      ...mevcut,
      bagliLokasyonlar: [...new Set([...mevcut.bagliLokasyonlar, ...lokasyonIdleri])],
    });
    touch(doc);
  });
  return true;
}

/** `dunyaKarakterBaginiKaldir`nin lokasyon karşılığı. */
export function dunyaLokasyonBaginiKaldir(doc: Y.Doc, dunyaId: string, lokasyonIdleri: string[]): boolean {
  const harita = dunyalarMap(doc);
  const mevcut = harita.get(dunyaId);
  if (!mevcut) return false;
  const drop = new Set(lokasyonIdleri);
  tx(doc, () => {
    harita.set(dunyaId, {
      ...mevcut,
      bagliLokasyonlar: mevcut.bagliLokasyonlar.filter((id) => !drop.has(id)),
    });
    touch(doc);
  });
  return true;
}

/**
 * Doküman tipini değiştirir (§13.2 / F7).
 *
 * Bloklar DÖNÜŞTÜRÜLMÜYOR: yeni tipte karşılığı olmayan bloklar yerinde
 * duruyor ve sayfalayıcı onları AÇIKÇA bildiriyor. Otomatik dönüştürme
 * kullanıcının metnini haber vermeden yeniden biçimlendirmek olurdu; tipi
 * geri alınca eski hâline dönmesi de garanti edilemezdi.
 */
export function setDokumanTipi(doc: Y.Doc, tipAdi: string): void {
  tx(doc, () => {
    metaMap(doc).set('dokumanTipi', tipAdi);
    touch(doc);
  });
}

/* ---------------------- İki sütunlu belge (§6.6) ---------------------- */

/**
 * Görüntü/ses çiftleri — bölünmez birim olarak saklanır.
 *
 * Tek sütunlu senaryonun birimi SATIR, bunun birimi ÇİFT. İkisini aynı
 * diziye koymak "çift"i yan yana duran iki bloğa indirger ve §6.6'nın
 * "bir satır çifti bölünemez" kuralını yapıdan çıkarıp korunması gereken
 * bir davranışa çevirirdi. Burada bölünmezlik YAPISAL: silinen bir çiftin
 * yarısı diye bir şey yok.
 */

function ciftMap(g: CiftGirdi): Y.Map<any> {
  const m = new Y.Map<any>();
  m.set('id', g.id);
  m.set('tip', g.tip);
  /* Her girdinin TEK metni var: hangi sütuna düşeceğini `tip` söylüyor.
     Önceki model iki hücre saklıyordu (`goruntu` + `ses`) çünkü girdiyi
     yan yana bir çift sanıyordu — referans örnek böyle değil. */
  m.set('metin', g.metin);
  return m;
}

/** Çifti sona ya da `at` konumuna ekler; eklenen çiftin kimliğini döner. */
export function ciftEkle(doc: Y.Doc, g: CiftGirdi, at?: number): string {
  const dizi = ciftlerArray(doc);
  tx(doc, () => {
    dizi.insert(at ?? dizi.length, [ciftMap(g)]);
    touch(doc);
  });
  return g.id;
}

/**
 * Bir çiftin hücrelerini günceller.
 *
 * `tip` DEĞİŞTİRİLEMEZ: sahne başlığı iki sütuna yayılır, çift yayılmaz —
 * tipi yerinde çevirmek, hücrelerden birini sessizce düşürmek olurdu.
 * Tip değiştirmek isteyen sil ve yeniden ekler; kayıp o zaman görünür.
 */
export function ciftGuncelle(doc: Y.Doc, id: string, metin: string): boolean {
  const dizi = ciftlerArray(doc);
  for (let i = 0; i < dizi.length; i++) {
    const m = dizi.get(i);
    if (m.get('id') !== id) continue;
    tx(doc, () => { m.set('metin', metin); touch(doc); });
    return true;
  }
  return false;
}

/** Girdiyi tümüyle siler. Yoksa `false`. */
export function ciftSil(doc: Y.Doc, id: string): boolean {
  const dizi = ciftlerArray(doc);
  for (let i = 0; i < dizi.length; i++) {
    if (dizi.get(i).get('id') !== id) continue;
    tx(doc, () => { dizi.delete(i, 1); touch(doc); });
    return true;
  }
  return false;
}

/**
 * Girdinin BLOK TİPİNİ değiştirir — sütunu tablo belirler.
 *
 * Kullanıcı kararı: "oto presete göre sağ ya da sol yazım alanındaki
 * yerleşime geçsin." Yani sütun ayrı bir ayar değil, presetin SONUCU;
 * ikisini ayrı tutmak "sağ sütunda duran bir aksiyon" gibi tutarsız bir
 * durum üretebilirdi.
 *
 * Metin taşınmıyor: aynı cümle bazen yanlış preseti alır ve düzeltmenin
 * yolu silip yeniden yazmak olmamalı.
 */
export function ciftTipiDegistir(doc: Y.Doc, id: string, tip: string): boolean {
  if (!IKI_SUTUN_BLOKLARI.includes(tip as never)) return false;
  const dizi = ciftlerArray(doc);
  for (let i = 0; i < dizi.length; i++) {
    const m = dizi.get(i);
    if (m.get('id') !== id) continue;
    if (m.get('tip') === tip) return false;
    tx(doc, () => { m.set('tip', tip); touch(doc); });
    return true;
  }
  return false;
}

/** Çifti `hedef` konumuna taşır. */
export function ciftTasi(doc: Y.Doc, id: string, hedef: number): boolean {
  const dizi = ciftlerArray(doc);
  const at = dizi.toArray().findIndex((m) => m.get('id') === id);
  if (at < 0) return false;
  const sinirli = Math.max(0, Math.min(dizi.length - 1, hedef));
  if (sinirli === at) return false;
  const ham = dizi.get(at).toJSON() as Record<string, unknown>;
  tx(doc, () => {
    dizi.delete(at, 1);
    /* Kopya YENİDEN kuruluyor: Yjs'te bir `Y.Map` iki yere birden
       bağlanamaz, taşınan düğüm yeniden oluşturulmak zorunda. */
    dizi.insert(sinirli, [ciftMap({
      id: String(ham.id),
      tip: String(ham.tip ?? 'action'),
      metin: String(ham.metin ?? ''),
    })]);
    touch(doc);
  });
  return true;
}

/* ---------------------- Geri dönüşüm kutusu (§13.2, §15) ---------------------- */

/**
 * Silinen bir öğeyi geri dönüşüm kutusuna ARŞİVLER. ÇAĞIRANIN transaction'ı
 * içinde çalışır — `removePanel`/`setScript`'in AYNI transaction'ında
 * arşivleme ve silme atomik olur: biri fırlarsa ikisi de geri sarılır,
 * "arşivlendi ama silinmedi" ya da tersi bir yarım durum oluşmaz.
 *
 * TEK EV: bu ikisinin dışında ÜÇÜNCÜ bir çağıran YOK — silme yolu açmak
 * isteyen her yeni mutasyon buraya değil, `removePanel`/`setScript`'e
 * (ya da onların deseniyle) yönlenmeli (Karar 2).
 */
function copaEkle(doc: Y.Doc, tur: CopOgesi['tur'], veri: Panel | ScriptBlock, oncekiKomsu: string | null): void {
  const m = new Y.Map<any>();
  m.set('id', uid('cop'));
  m.set('tur', tur);
  m.set('veri', veri);
  m.set('silinmeTarihi', Date.now());
  // Bilinen sınır — bkz. `model/geridonusum.ts` `CopOgesi.silenKullanici`.
  m.set('silenKullanici', '');
  m.set('oncekiKomsu', oncekiKomsu);
  copArray(doc).push([m]);
}

/** Ham `Y.Map`i `CopOgesi`ye çevirir — `readPanel`in geri dönüşüm karşılığı. */
function copOku(m: Y.Map<any>): CopOgesi {
  return {
    id: m.get('id') as string,
    tur: m.get('tur') as CopOgesi['tur'],
    veri: m.get('veri') as Panel | ScriptBlock,
    silinmeTarihi: m.get('silinmeTarihi') as number,
    silenKullanici: (m.get('silenKullanici') as string) ?? '',
    oncekiKomsu: (m.get('oncekiKomsu') as string | null) ?? null,
  };
}

/** Kutunun tamamı — sıralama/süzme UI/model katmanının işi (`model/geridonusum.ts`). */
export function copListesi(doc: Y.Doc): CopOgesi[] {
  return copArray(doc).map(copOku);
}

/**
 * Bir öğeyi ESKİ YERİNE geri getirir — sona atmak kullanıcının düzenini
 * bozar (bkz. `CopOgesi.oncekiKomsu`, F3'ün kontrol noktası "geri dönüş
 * mevcut durumu silmiyor" kararıyla AYNI ruh: geri getirme veri
 * kaybetmeden, iz bırakmadan çalışır).
 *
 * Komşu ARTIK yoksa (o da silindi/hâlâ kutuda) BAŞA düşülür — sona değil:
 * kullanıcı "en üstte" arayacaktır, listenin dibinde değil.
 */
export function copGeriGetir(doc: Y.Doc, id: string): boolean {
  const dizi = copArray(doc);
  let index = -1;
  for (let i = 0; i < dizi.length; i++) if (dizi.get(i).get('id') === id) { index = i; break; }
  if (index < 0) return false;
  const oge = copOku(dizi.get(index));

  if (oge.tur === 'panel') {
    const panel = oge.veri as Panel;
    const arr = panelsArray(doc);
    const ordered = orderedPanelMaps(doc);
    const komsuIdx = oge.oncekiKomsu
      ? ordered.findIndex((map) => map.get('id') === oge.oncekiKomsu) : -1;
    const at = komsuIdx >= 0 ? komsuIdx + 1 : 0;
    tx(doc, () => {
      const map = panelToY(panel);
      arr.push([map]);
      ordered.splice(at, 0, map);
      ordered.forEach((item, position) => item.set('order', position));
      dizi.delete(index, 1);
      touch(doc);
    });
    return true;
  }

  // tur === 'blok'
  const blok = oge.veri as ScriptBlock;
  const mevcut = readScript(doc).blocks;
  const komsuIdx = oge.oncekiKomsu ? mevcut.findIndex((b) => b.id === oge.oncekiKomsu) : -1;
  const at = komsuIdx >= 0 ? komsuIdx + 1 : 0;
  const yeni = [...mevcut];
  yeni.splice(at, 0, blok);
  tx(doc, () => {
    bloklariFragmenteYaz(doc, yeni);
    dizi.delete(index, 1);
    touch(doc);
  });
  return true;
}

/**
 * KALICI silme — geri alınamaz. Açık onay UI katmanının işi (bir mutasyon
 * fonksiyonu kendi başına kullanıcıyla konuşamaz); burası yalnız çağrıldığı
 * ANDA sessizce değil, GERÇEKTEN siliyor.
 */
export function copKaliciSil(doc: Y.Doc, id: string): boolean {
  const dizi = copArray(doc);
  for (let i = 0; i < dizi.length; i++) {
    if (dizi.get(i).get('id') !== id) continue;
    tx(doc, () => { dizi.delete(i, 1); touch(doc); });
    return true;
  }
  return false;
}

/**
 * Otomatik temizlik — §15: "30 günden eski kayıtlar." SESSİZ değil: kaç
 * kaydın silindiğini DÖNDÜRÜR, çağıran (UI) bunu kullanıcıya göstermek
 * ZORUNDA (proje kuralı: sessiz başarısızlık/temizlik yasak).
 */
export function copTemizle(doc: Y.Doc, simdi: number = Date.now()): number {
  const dizi = copArray(doc);
  const ogeler = dizi.map(copOku);
  const { silinecek } = copEskimisleriAyir(ogeler, simdi);
  if (!silinecek.length) return 0;
  const silinecekId = new Set(silinecek.map((o) => o.id));
  tx(doc, () => {
    // SONDAN başa doğru sil: dizi index'leri öne doğru silince kayar.
    for (let i = dizi.length - 1; i >= 0; i--) {
      if (silinecekId.has(dizi.get(i).get('id'))) dizi.delete(i, 1);
    }
    touch(doc);
  });
  return silinecek.length;
}

/**
 * Başlık sayfası alanlarını günceller — YALNIZ `patch`te VERİLEN alanlar yazılır.
 *
 * `harita.set` `metaMap`/`settingsMap` ile aynı alan-bazlı desen (bkz.
 * `baslikSayfasiMap`). Sanitizasyon `baslikSayfasiDuzelt`den (Karar 2, tek
 * ev) geçiyor ama yalnız `patch`teki anahtarlar YAZILIYOR: tüm nesneyi her
 * seferinde yeniden yazmak, iki ortak yazarın aynı anda FARKLI alanları
 * düzenlediği durumda birinin — o an henüz görmediği — yazımını stale bir
 * varsayılanla ezerdi.
 */
export function baslikSayfasiGuncelle(doc: Y.Doc, patch: Partial<BaslikSayfasi>): void {
  const harita = baslikSayfasiMap(doc);
  const temiz = baslikSayfasiDuzelt(patch);
  tx(doc, () => {
    for (const k of Object.keys(patch) as (keyof BaslikSayfasi)[]) harita.set(k, temiz[k]);
    touch(doc);
  });
}

/**
 * Bir sahnenin ELLE girilen çekim dökümü alanlarını günceller ya da kurar.
 *
 * `yerImiKoy` ile AYNI desen (`doc/mutations.ts` — mevcutla birleştirip TAM
 * kaydı yazar): breakdown alanı iç içe diziler taşıyor (`ozelEsya` vb.) ve
 * Yjs'te iç içe bir dizinin TEK bir alanını güncellemenin CRDT karşılığı
 * yok — tüm kaydı sanitize edip yeniden yazmak burada doğru birim.
 */
export function breakdownEkiGuncelle(
  doc: Y.Doc,
  sceneId: string,
  patch: Partial<BreakdownEki>,
): void {
  if (!sceneId) return;
  const harita = breakdownMap(doc);
  const mevcut = harita.get(sceneId);
  const yeni = breakdownEkiDuzelt({ ...mevcut, ...patch });
  tx(doc, () => { harita.set(sceneId, yeni); touch(doc); });
}

/* ---------------------------- Revizyonlar ----------------------------- */

/**
 * Revizyon listesini okur — GÜVEN SINIRI.
 *
 * Çözülemeyen (kimliksiz) kayıtlar ATILIR, listenin tamamı değil: bozuk tek
 * bir kayıt yüzünden bütün revizyon geçmişini kaybetmek §15'in yasakladığı
 * kayıp olurdu.
 */
export function revizyonlariOku(doc: Y.Doc): Revizyon[] {
  // Eşzamanlı renk değişimleri aynı kimliği iki kez ekleyebilir. Yjs'nin
  // ortak sırasındaki son kayıt kazanır; bu yeni bir revizyon sayılmaz.
  const cikti = new Map<string, Revizyon>();
  for (const ham of revizyonlarArray(doc).toArray()) {
    const r = revizyonCoz(ham);
    if (r) cikti.set(r.id, r);
  }
  return [...cikti.values()];
}

/**
 * Etkin revizyon — listedeki SON kayıt.
 *
 * Ayrı bir "etkin" alanı tutulmuyor: iki yazar aynı anda revizyon
 * yayınlarsa o alan çatışırdı. Dizide ikisi de yaşar ve sonuncusu etkindir.
 */
export function etkinRevizyon(doc: Y.Doc): Revizyon | null {
  const liste = revizyonlariOku(doc);
  return liste.length ? liste[liste.length - 1] : null;
}

/**
 * Yeni revizyon yayınlar ve onu döner.
 *
 * İlk rengi sıradan alır; kullanıcı daha sonra iki menüden değiştirebilir.
 */
export function revizyonYayinla(doc: Y.Doc, ad = ''): Revizyon {
  const dizi = revizyonlarArray(doc);
  const yeni: Revizyon = {
    id: uid('rev'),
    ad: ad.trim(),
    renk: siradakiRenk(revizyonlariOku(doc).length),
    tarih: Date.now(),
  };
  tx(doc, () => { dizi.push([yeni]); touch(doc); });
  return yeni;
}

/** Etkin revizyonun kimliğini, tarihini ve işaretlerini koruyarak rengini değiştirir. */
export function revizyonRenginiDegistir(doc: Y.Doc, renk: RevizyonRengi): boolean {
  if (!REVIZYON_RENKLERI.includes(renk)) return false;
  const etkin = etkinRevizyon(doc);
  if (!etkin || etkin.renk === renk) return false;
  const dizi = revizyonlarArray(doc);
  const index = dizi.toArray().map((r) => r?.id).lastIndexOf(etkin.id);
  tx(doc, () => {
    dizi.delete(index, 1);
    dizi.insert(index, [{ ...etkin, renk }]);
    touch(doc);
  });
  return true;
}

/** İşaretleri okur — `blockId` → `revizyonId`. */
export function revizyonIsaretleriniOku(doc: Y.Doc): Map<string, string> {
  const cikti = new Map<string, string>();
  for (const [blockId, rev] of revizyonIsaretleriMap(doc).entries()) {
    if (typeof rev === 'string' && rev) cikti.set(blockId, rev);
  }
  return cikti;
}

/**
 * Blokları etkin revizyona işaretler. Etkin revizyon yoksa `false`.
 *
 * SESSİZCE revizyon YARATMIYOR: yazar işaret koyduğunu sanıp aslında yeni
 * bir dağıtım açmış olurdu. Çağıran `false` görünce kullanıcıya "önce
 * revizyon aç" demek zorunda (§15.4).
 */
export function revizyonIsaretle(doc: Y.Doc, blockIds: readonly string[]): boolean {
  const etkin = etkinRevizyon(doc);
  if (!etkin) return false;
  const hedef = blockIds.filter(Boolean);
  if (!hedef.length) return false;
  const harita = revizyonIsaretleriMap(doc);
  tx(doc, () => {
    for (const id of hedef) harita.set(id, etkin.id);
    touch(doc);
  });
  return true;
}

/** İşaretleri kaldırır. Hiçbiri işaretli değilse `false`. */
export function revizyonIsaretKaldir(doc: Y.Doc, blockIds: readonly string[]): boolean {
  const harita = revizyonIsaretleriMap(doc);
  const hedef = blockIds.filter((id) => harita.has(id));
  if (!hedef.length) return false;
  tx(doc, () => {
    for (const id of hedef) harita.delete(id);
    touch(doc);
  });
  return true;
}

/**
 * Seçimi işaretler ya da işareti kaldırır; SON durumu döner.
 *
 * Kural: seçimdeki blokların HEPSİ etkin revizyonda işaretliyse kaldırır,
 * değilse hepsini işaretler. Blok blok çevirmek, karışık bir seçimde
 * yazarın ne olacağını öngöremediği bir sonuç üretirdi.
 */
export function revizyonIsaretCevir(doc: Y.Doc, blockIds: readonly string[]): boolean {
  const etkin = etkinRevizyon(doc);
  if (!etkin) return false;
  const hedef = blockIds.filter(Boolean);
  if (!hedef.length) return false;
  const harita = revizyonIsaretleriMap(doc);
  const hepsiIsaretli = hedef.every((id) => harita.get(id) === etkin.id);
  if (hepsiIsaretli) {
    revizyonIsaretKaldir(doc, hedef);
    return false;
  }
  revizyonIsaretle(doc, hedef);
  return true;
}
