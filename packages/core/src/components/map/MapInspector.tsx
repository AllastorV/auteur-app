import React from 'react';
import { t } from '../../dil/arayuz';
import { MapImageError, placeMapImage, placeMapTexture, resetMapTexture } from '../../export/world-map';
import {
  removeMapLabel, removeMapMarker, removeMapOverlay,
  updateMapCountry, updateMapLabel, updateMapMarker, updateMapOverlay, LOCAL_ORIGIN,
} from '../../doc/mutations';
import { COUNTRY_BIOMES, parseMapSettings, type CountryBiome, type MapDraft } from '../../model/world-map';
import { MAP_TEXTURE_SLOTS, type MapTextureSlot } from '../../model/world-map-textures';
import { MapLayoutError } from '../../model/world-map-generator';
import { moduDegistir } from '../../store/mod';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { applyProjectMapDraft, PROJECT_MAP_ID, setProjectMapLock, validateProjectMapDraft } from '../../model/project-world-map';
import { getAtlasScene } from './atlas-cache';
import { ATLAS_BIOMES } from '../../model/atlas/biomes';
import { isAtlasLand } from '../../model/atlas/world';
import { MapRegenerateDialog } from './MapRegenerateDialog';
import { useWorldMap } from './useWorldMap';
import { mapCountryColor } from './MapCountries';
import { useMapTextureSources } from './map-texture-source';

type MapPatch = Partial<{
  seed: number; landFraction: number; islandCount: number;
  lakeCount: number; minCountrySpacing: number; countryCount: number;
}>;

const TABS = () => [
  { id: 'settings', title: t('Ayarlar') },
  { id: 'countries', title: t('Ülkeler') },
  { id: 'places', title: t('Mekânlar') },
  { id: 'layers', title: t('Görseller') },
] as const;
function biomeLabel(biome: CountryBiome): string {
  switch (biome) {
    case 'plain': return t('Düzlük');
    case 'forest': return t('Orman');
    case 'desert': return t('Çöl');
    case 'mountain': return t('Dağ');
    case 'swamp': return t('Bataklık');
    case 'tundra': return t('Tundra');
    case 'volcanic': return t('Volkanik');
  }
}

export function MapInspector() {
  const doc = useProjectStore((s) => s.doc);
  const locations = useProjectStore((s) => s.lokasyonlar);
  const editable = useProjectStore((s) => s.allowed('edit'));
  const assetUrls = useProjectStore((s) => s.assetUrls);
  const worldId = PROJECT_MAP_ID;
  const tab = useUiStore((s) => s.mapTab);
  const selection = useUiStore((s) => s.mapSelection);
  const draft = useUiStore((s) => s.mapDraft);
  const map = useWorldMap(doc, worldId);
  const textures = useMapTextureSources(map, assetUrls);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragOverlay, setDragOverlay] = React.useState<string | null>(null);
  const [textureError, setTextureError] = React.useState<Partial<Record<MapTextureSlot, string>>>({});
  const [textureUploading, setTextureUploading] = React.useState<MapTextureSlot | null>(null);
  const [pendingPatch, setPendingPatch] = React.useState<MapPatch | null>(null);
  const [confirmedPreview, setConfirmedPreview] = React.useState(false);

  if (!map) return <div data-testid="map-inspector" className="h-full bg-panel p-4 text-xs text-metin-zayif">
    {t('Önce bir dünya haritası oluşturun veya eski bir haritayı içe alın.')}
  </div>;

  let terrain: ReturnType<typeof getAtlasScene>['world'] | null = null;
  if (map.engineVersion === 2 && selection?.type === 'terrain') {
    try {
      const settings = parseMapSettings({ seed: draft?.seed ?? map.seed, controls: draft?.controls ?? map.controls });
      if (settings) terrain = getAtlasScene(settings.seed, settings.controls,
        draft?.countryCount ?? map.countryConfig.count).world;
    } catch (error) {
      if (!(error instanceof MapLayoutError)) throw error;
    }
    if (!terrain) {
      const accepted = parseMapSettings(map)!;
      terrain = getAtlasScene(accepted.seed, accepted.controls, map.countryConfig.count).world;
    }
  }
  const terrainIndex = terrain && selection?.type === 'terrain'
    ? Math.min(terrain.height - 1, Math.floor(selection.y * terrain.height)) * terrain.width +
      (Math.floor(selection.x * terrain.width) % terrain.width) : -1;

  let draftError: MapLayoutError['code'] | null = null;
  if (draft) {
    try { validateProjectMapDraft({ ...draft, engineVersion: 2 }, map.countryConfig); }
    catch (error) {
      if (!(error instanceof MapLayoutError)) throw error;
      draftError = error.code;
    }
  }

  const buildDraft = (patch: MapPatch): MapDraft & { engineVersion: 2 } => {
    const current = draft ?? { seed: map.seed, controls: map.controls, countryCount: map.countryConfig.count };
    return {
      engineVersion: 2,
      seed: patch.seed ?? current.seed,
      countryCount: patch.countryCount ?? current.countryCount,
      controls: {
        landFraction: patch.landFraction ?? current.controls.landFraction,
        islandCount: patch.islandCount ?? current.controls.islandCount,
        lakeCount: patch.lakeCount ?? current.controls.lakeCount ?? 0,
        minCountrySpacing: patch.minCountrySpacing ?? current.controls.minCountrySpacing ?? 0,
      },
    };
  };

  const beginMapPreview = (patch: MapPatch) => {
    if (!editable) return;
    if (map.locked && !confirmedPreview) { setPendingPatch(patch); return; }
    useUiStore.setState({ mapDraft: buildDraft(patch) });
  };
  const cancelMapPreview = () => {
    useUiStore.setState({ mapDraft: null });
    setPendingPatch(null);
    setConfirmedPreview(false);
  };
  const randomSeed = () => {
    let seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    if (seed === (draft?.seed ?? map.seed)) seed = (seed + 1) >>> 0;
    return seed;
  };
  const markerOnWater = draft && !draftError && map.markers.length > 0
    ? (() => {
      const settings = parseMapSettings({ seed: draft.seed, controls: draft.controls });
      if (!settings) return false;
      const world = getAtlasScene(settings.seed, settings.controls, draft.countryCount).world;
      return map.markers.some((marker) => !isAtlasLand(world, marker.x, marker.y));
    })() : false;

  const selectedMarker = selection?.type === 'marker' ? map.markers.find((marker) => marker.id === selection.id) : null;
  const selectedLabel = selection?.type === 'label' ? map.labels.find((label) => label.id === selection.id) : null;
  const selectedOverlay = selection?.type === 'overlay' ? map.overlays.find((overlay) => overlay.id === selection.id) : null;
  const selectedCountry = selection?.type === 'country' ? map.countries.find((country) => country.id === selection.id) : null;

  const upload = async (file: File | undefined) => {
    if (!file || !editable) return;
    setUploading(true);
    try {
      const overlay = await placeMapImage(doc, worldId, file, { x: 0.5, y: 0.5 });
      useUiStore.setState({ mapSelection: { type: 'overlay', id: overlay.id } });
    } catch (error) {
      const code = error instanceof MapImageError ? error.code : 'corrupt';
      const messages = () => ({
        unsupported: t('Yalnızca PNG/JPG görseller eklenebilir.'),
        oversized: t('Görsel boyutu sınırı aşıyor.'),
        corrupt: t('Görsel dosyası okunamadı.'),
        aborted: t('Görsel yüklemesi iptal edildi.'),
        invalid: t('Görsel yerleşimi geçersiz.'),
      });
      useUiStore.getState().showToast(messages()[code], 'error');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const reorderOverlay = (sourceId: string, targetId: string) => {
    if (!editable || sourceId === targetId) return;
    const ordered = [...map.overlays];
    const from = ordered.findIndex((item) => item.id === sourceId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    doc.transact(() => {
      ordered.forEach((item, index) => updateMapOverlay(doc, worldId, item.id, { order: index }));
    }, LOCAL_ORIGIN);
  };

  const uploadTexture = async (slot: MapTextureSlot, file: File | undefined) => {
    if (!file || !editable || textureUploading) return;
    setTextureUploading(slot);
    setTextureError((current) => ({ ...current, [slot]: undefined }));
    try { await placeMapTexture(doc, worldId, slot, file); }
    catch (error) {
      const code = error instanceof MapImageError ? error.code : 'corrupt';
      setTextureError((current) => ({ ...current, [slot]:
        code === 'unsupported' ? t('Yalnızca PNG/JPG görseller eklenebilir.') :
          code === 'oversized' ? t('Doku en fazla 4 MB ve 2048 piksel olabilir.') :
            t('Doku dosyası okunamadı.'),
      }));
    } finally { setTextureUploading(null); }
  };

  return (
    <div data-testid="map-inspector" className="flex h-full min-h-0 flex-col bg-panel text-metin-govde">
      <div className="flex shrink-0 border-b border-kenar-ic">
        {TABS().map((item) => <button key={item.id} type="button" data-testid={`map-tab-${item.id}`}
          aria-current={tab === item.id} onClick={() => useUiStore.setState({ mapTab: item.id })}
          className={'min-w-0 flex-1 px-2 py-2.5 text-[11px] ' + (tab === item.id ? 'border-b-2 border-amber bg-etkin text-metin' : 'text-metin-zayif hover:text-metin')}>
          {item.title}
        </button>)}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 text-xs">
        {tab === 'settings' && <>
          <section className="space-y-3">
            <h3 className="mzn-etiket">{t('Coğrafya')}</h3>
            {terrain && terrainIndex >= 0 && selection?.type === 'terrain' &&
              <section data-testid="map-terrain-details" className="space-y-1 border-b border-kenar-ic pb-3">
                <h3 className="mzn-etiket">{t('Sahipsiz arazi')}</h3>
                <p>{t('Arazi')}: {biomeLabel(ATLAS_BIOMES[terrain.biome[terrainIndex]])}</p>
                <p>{t('Yükseklik')}: {Math.round(terrain.elevation[terrainIndex] * 100)}%</p>
                <p>{t('Nem')}: {Math.round(terrain.moisture[terrainIndex] * 100)}%</p>
              </section>}
            <label className="block space-y-1"><span>{t('Tohum')}</span>
              <input data-testid="map-seed" type="number" min="0" max="4294967295" step="1"
                disabled={!editable} value={draft?.seed ?? map.seed}
                onChange={(event) => beginMapPreview({ seed: Number(event.target.value) })}
                className="mzn-girdi w-full px-2 py-1" /></label>
            <label className="block space-y-1"><span>{t('Kara miktarı')} · {Math.round((draft?.controls.landFraction ?? map.controls.landFraction) * 100)}%</span>
              <input data-testid="map-land" type="range" min="0.05" max="0.9" step="0.01"
                disabled={!editable} value={draft?.controls.landFraction ?? map.controls.landFraction}
                onChange={(event) => beginMapPreview({ landFraction: Number(event.target.value) })} className="w-full accent-amber" /></label>
            <label className="block space-y-1"><span>{t('Ada sayısı')} · {draft?.controls.islandCount ?? map.controls.islandCount}</span>
              <input data-testid="map-islands" type="range" min="0" max="20" step="1"
                disabled={!editable} value={draft?.controls.islandCount ?? map.controls.islandCount}
                onChange={(event) => beginMapPreview({ islandCount: Number(event.target.value) })} className="w-full accent-amber" /></label>
            <label className="block space-y-1"><span>{t('Göl sayısı')} · {draft?.controls.lakeCount ?? map.controls.lakeCount}</span>
              <input data-testid="map-lakes" type="range" min="0" max="8" step="1"
                disabled={!editable} value={draft?.controls.lakeCount ?? map.controls.lakeCount}
                onChange={(event) => beginMapPreview({ lakeCount: Number(event.target.value) })} className="w-full accent-amber" /></label>
            <label className="block space-y-1"><span>{t('Ülke sayısı')}</span>
              <input data-testid="map-country-count" type="number" min="2" max="16" step="1"
                disabled={!editable} value={draft?.countryCount ?? map.countryConfig.count}
                onChange={(event) => beginMapPreview({ countryCount: Number(event.target.value) })}
                className="mzn-girdi w-full px-2 py-1" /></label>
            <label className="block space-y-1"><span>{t('Ülke merkezleri arası en az')} · %{draft?.controls.minCountrySpacing ?? map.controls.minCountrySpacing}</span>
              <input data-testid="map-spacing" type="range" min="0" max="8" step="1"
                disabled={!editable} value={draft?.controls.minCountrySpacing ?? map.controls.minCountrySpacing}
                onChange={(event) => beginMapPreview({ minCountrySpacing: Number(event.target.value) })} className="w-full accent-amber" /></label>
            {editable && <button data-testid="map-regenerate" type="button" onClick={() => beginMapPreview({ seed: randomSeed() })}
              className="mzn-denetim w-full px-2 py-1.5 text-left">{t('Yeni kıyı taslağı')}</button>}
            {editable && <button data-testid="map-lock" type="button" aria-pressed={map.locked}
              onClick={() => setProjectMapLock(doc, !map.locked)}
              className="mzn-denetim w-full px-2 py-1.5 text-left">
              {map.locked ? t('Harita kilidini aç') : t('Haritayı kilitle')}
            </button>}
            {draft && <p data-testid="map-preview" className="text-[11px] text-amber">{t('Önizleme')}</p>}
            {draft && editable && <div className="flex gap-2">
              <button data-testid="map-apply" type="button" disabled={Boolean(draftError)} onClick={() => {
                try {
                  applyProjectMapDraft(doc, { ...draft, engineVersion: 2 }, { confirmedLocked: confirmedPreview });
                  cancelMapPreview();
                }
                catch { useUiStore.getState().showToast(t('Geçersiz harita ayarı'), 'error'); }
              }} className="mzn-birincil flex-1 px-2 py-1.5 disabled:opacity-40">{t('Uygula')}</button>
              <button data-testid="map-cancel" type="button" onClick={cancelMapPreview}
                className="mzn-denetim flex-1 px-2 py-1.5">{t('İptal')}</button>
            </div>}
            {draftError && <p data-testid="map-draft-error" role="alert" className="text-[11px] leading-relaxed text-[#e1a18b]">
              {draftError === 'lakes' ? t('Göller bu kara alanına sığmıyor. Göl sayısını azaltın veya kara miktarını değiştirin.') :
                draftError === 'spacing' ? t('Ülkeler bu aralıkla sığmıyor. Aralığı veya ülke sayısını azaltın; coğrafyayı ya da tohumu değiştirin.') :
                  t('Geçersiz harita ayarı')}
            </p>}
            {draft && <p className="text-[11px] leading-relaxed text-amber">{t('Sınırlar değişebilir; ülke adları ve notları korunur.')}</p>}
            {markerOnWater && <p data-testid="map-marker-water-warning" role="status"
              className="text-[11px] leading-relaxed text-[#e1a18b]">
              {t('İşaretler yeni haritada denize düşebilir; konumları ve bağlantıları korunur.')}
            </p>}
          </section>
          {map.countryConfig.appearance === 'texture' && <details data-testid="map-custom-textures"
            className="border-t border-kenar-ic pt-3">
            <summary className="cursor-pointer mzn-etiket">{t('Özel dokular')}</summary>
            <div className="mt-3 space-y-2">
              {MAP_TEXTURE_SLOTS.map((slot) => {
                const source = textures?.[slot];
                const override = map.textureOverrides[slot];
                const broken = source?.kind === 'broken' || map.invalidTextureSlots.includes(slot);
                return <div key={slot} data-testid={`map-texture-row-${slot}`}
                  className="rounded-sm border border-kenar-ic p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>{slot === 'sea' ? t('Deniz ve göller') : biomeLabel(slot)}</span>
                    <span className="min-w-0 truncate text-[10px] text-metin-zayif"
                      title={override?.fileName}>{override?.fileName ?? (broken ? t('Bozuk kayıt') : t('Varsayılan'))}</span>
                  </div>
                  {source?.kind === 'loading' && <p className="mt-1 text-[10px] text-metin-zayif">{t('Doku doğrulanıyor…')}</p>}
                  {broken && <p data-testid={`map-texture-warning-${slot}`} role="alert"
                    className="mt-1 text-[10px] text-[#e1a18b]">{t('Doku yüklenemedi; sıfırlayıp yeniden ekleyin.')}</p>}
                  {textureError[slot] && <p data-testid={`map-texture-error-${slot}`} role="alert"
                    className="mt-1 text-[10px] text-[#e1a18b]">{textureError[slot]}</p>}
                  {editable && <div className="mt-2 flex gap-2">
                    <label className="mzn-denetim cursor-pointer px-2 py-1 text-[10px]">
                      {textureUploading === slot ? t('Görsel okunuyor…') : t('PNG/JPG seç')}
                      <input data-testid={`map-texture-input-${slot}`} type="file"
                        accept="image/png,image/jpeg" disabled={Boolean(textureUploading)}
                        className="sr-only" onChange={(event) => {
                          void uploadTexture(slot, event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }} />
                    </label>
                    {(override || broken) && <button data-testid={`map-texture-reset-${slot}`} type="button"
                      className="mzn-denetim px-2 py-1 text-[10px]" onClick={() => {
                        resetMapTexture(doc, worldId, slot);
                        setTextureError((current) => ({ ...current, [slot]: undefined }));
                      }}>{t('Sıfırla')}</button>}
                  </div>}
                </div>;
              })}
            </div>
          </details>}
          <p className="border-t border-kenar-ic pt-3 text-[11px] leading-relaxed text-metin-zayif">
            {t('Tohum ve ayarlar kaydedilir; aynı değerler aynı kıyıyı üretir.')}
          </p>
        </>}

        {tab === 'countries' && <>
          <h3 className="mzn-etiket">{t('Ülkeler')} · {map.countryConfig.count}</h3>
          <div className="space-y-1">
            {map.countries.map((country, index) => <button key={country.id} type="button"
              data-testid={`map-country-list-${country.id}`}
              onClick={() => useUiStore.setState({ mapSelection: { type: 'country', id: country.id } })}
              className={'mzn-denetim flex w-full items-center gap-2 px-2 py-1.5 text-left ' +
                (selection?.type === 'country' && selection.id === country.id ? 'border-amber bg-etkin text-amber' : '')}>
              <span className="h-3 w-3 shrink-0 border border-kenar" style={{ backgroundColor: mapCountryColor(country, index) }} />
              <span className="min-w-0 flex-1 truncate">{country.name || `${t('Ülke')} ${index + 1}`}</span>
            </button>)}
          </div>
          {selectedCountry && <section className="space-y-3 border-t border-kenar-ic pt-3">
            <h3 className="mzn-etiket">{t('Ülke özellikleri')}</h3>
            <label className="block space-y-1"><span>{t('Ad')}</span>
              <input data-testid="map-country-name" className="mzn-girdi w-full px-2 py-1"
                disabled={!editable} maxLength={120} value={selectedCountry.name}
                placeholder={`${t('Ülke')} ${Number(selectedCountry.id.slice(8))}`}
                onChange={(event) => updateMapCountry(doc, worldId, selectedCountry.id, { name: event.target.value })} />
            </label>
            <label className="block space-y-1"><span>{t('Arazi')}</span>
              <select data-testid="map-country-biome" className="mzn-girdi w-full px-2 py-1"
                disabled={!editable} value={map.engineVersion === 2 ? selectedCountry.biomeOverride ?? 'natural' : selectedCountry.biome}
                onChange={(event) => updateMapCountry(doc, worldId, selectedCountry.id,
                  map.engineVersion === 2 ? { biomeOverride: event.target.value === 'natural' ? null : event.target.value as CountryBiome }
                    : { biome: event.target.value as CountryBiome })}>
                {map.engineVersion === 2 && <option value="natural">{t('Doğal arazi')}</option>}
                {COUNTRY_BIOMES.map((biome) => <option key={biome} value={biome}>{biomeLabel(biome)}</option>)}
              </select>
            </label>
            <label className="block space-y-1"><span>{t('Not')}</span>
              <textarea data-testid="map-country-note" className="mzn-girdi min-h-20 w-full resize-y px-2 py-1"
                disabled={!editable} maxLength={500} value={selectedCountry.note}
                onChange={(event) => updateMapCountry(doc, worldId, selectedCountry.id, { note: event.target.value })} />
            </label>
            <label className="flex items-center justify-between gap-2"><span>{t('Harita rengi')}</span>
              <input data-testid="map-country-color" type="color" className="mzn-girdi h-7 w-12 p-0.5"
                disabled={!editable} value={mapCountryColor(selectedCountry, Number(selectedCountry.id.slice(8)) - 1)}
                onChange={(event) => updateMapCountry(doc, worldId, selectedCountry.id, { color: event.target.value })} />
            </label>
            {map.countryConfig.appearance === 'texture' && <p className="text-[11px] text-metin-zayif">{t('Özel renk, Renk görünümünde gösterilir.')}</p>}
            {editable && selectedCountry.color && <button type="button" className="mzn-denetim w-full px-2 py-1.5 text-left"
              onClick={() => updateMapCountry(doc, worldId, selectedCountry.id, { color: null })}>{t('Arazi rengine dön')}</button>}
          </section>}
        </>}

        {tab === 'places' && <>
          <h3 className="mzn-etiket">{t('Mekân işaretleri')}</h3>
          {editable && <>
            <label className="block space-y-1"><span>{t('Bağlı mekân')}</span>
              <select data-testid="map-location-select" defaultValue="" className="mzn-girdi w-full px-2 py-1"
                onChange={(event) => useUiStore.setState({ mapPlacement: { type: 'marker', locationId: event.target.value || null } })}>
                <option value="">{t('Bağsız işaret')}</option>
                {Object.values(locations).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((location) =>
                  <option key={location.id} value={location.id}>{location.ad}</option>) }
              </select>
            </label>
            <button data-testid="map-add-marker" type="button" onClick={() => {
              const current = useUiStore.getState().mapPlacement;
              useUiStore.setState({ mapPlacement: current?.type === 'marker' ? current : { type: 'marker', locationId: null } });
            }} className="mzn-denetim w-full px-2 py-1.5 text-left">+ {t('İşaret yerleştir')}</button>
            <button data-testid="map-add-label" type="button" onClick={() => useUiStore.setState({ mapPlacement: { type: 'label' } })}
              className="mzn-denetim w-full px-2 py-1.5 text-left">+ {t('Yazı yerleştir')}</button>
          </>}
          {map.markers.length === 0 && <p className="text-metin-zayif">{t('Henüz işaret yok.')}</p>}
          <div className="space-y-1">
            {map.markers.map((marker) => <button key={marker.id} type="button" data-testid={`map-place-${marker.id}`}
              onClick={() => useUiStore.setState({ mapSelection: { type: 'marker', id: marker.id } })}
              className={'mzn-denetim w-full px-2 py-1.5 text-left ' + (selection?.type === 'marker' && selection.id === marker.id ? 'border-l-2 border-amber' : '')}>
              <span className="block truncate">{marker.label}</span>
              {marker.locationId && !locations[marker.locationId] && <span className="text-[10px] text-red-400">{t('Bağlı mekân bulunamadı')}</span>}
            </button>)}
          </div>
          {selectedMarker && <section className="space-y-2 border-t border-kenar-ic pt-3">
            <h3 className="mzn-etiket">{t('İşaret özellikleri')}</h3>
            <label className="block">{t('Ad')}<input aria-label={t('İşaret adı')} className="mzn-girdi mt-1 w-full px-2 py-1"
              disabled={!editable} value={selectedMarker.label} maxLength={120}
              onChange={(event) => updateMapMarker(doc, worldId, selectedMarker.id, { label: event.target.value })} /></label>
            <label className="block">{t('Bağlı mekân')}<select aria-label={t('Bağlı mekân')} className="mzn-girdi mt-1 w-full px-2 py-1"
              disabled={!editable} value={selectedMarker.locationId ?? ''}
              onChange={(event) => updateMapMarker(doc, worldId, selectedMarker.id, { locationId: event.target.value || null })}>
              <option value="">{t('Bağsız işaret')}</option>
              {selectedMarker.locationId && !locations[selectedMarker.locationId] && <option value={selectedMarker.locationId}>{t('Bağlı mekân bulunamadı')}</option>}
              {Object.values(locations).map((location) => <option key={location.id} value={location.id}>{location.ad}</option>)}
            </select></label>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y'] as const).map((axis) => <label key={axis}>{axis.toUpperCase()} %
                <input type="number" min="0" max="100" step="1" className="mzn-girdi mt-1 w-full px-2 py-1"
                  disabled={!editable} value={Math.round(selectedMarker[axis] * 100)}
                  onChange={(event) => updateMapMarker(doc, worldId, selectedMarker.id, { [axis]: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })} />
              </label>)}
            </div>
            {selectedMarker.locationId && locations[selectedMarker.locationId] &&
              <button type="button" onClick={() => { useUiStore.setState({ inspectorTab: 'kadro', focusedLocationId: selectedMarker.locationId }); moduDegistir('senaryo'); }}
                className="mzn-denetim w-full px-2 py-1.5 text-left">{t('Mekân notunu aç')} ↗</button>}
            {editable && <button type="button" onClick={() => { removeMapMarker(doc, worldId, selectedMarker.id); useUiStore.setState({ mapSelection: null }); }}
              className="px-2 py-1 text-red-400">{t('İşareti sil')}</button>}
          </section>}
          {selectedLabel && <section className="space-y-2 border-t border-kenar-ic pt-3">
            <h3 className="mzn-etiket">{t('Yazı özellikleri')}</h3>
            <input aria-label={t('Harita yazısı')} className="mzn-girdi w-full px-2 py-1" disabled={!editable}
              value={selectedLabel.text} maxLength={120}
              onChange={(event) => updateMapLabel(doc, worldId, selectedLabel.id, { text: event.target.value })} />
            {editable && <button type="button" onClick={() => { removeMapLabel(doc, worldId, selectedLabel.id); useUiStore.setState({ mapSelection: null }); }}
              className="px-2 py-1 text-red-400">{t('Yazıyı sil')}</button>}
          </section>}
        </>}

        {tab === 'layers' && <>
          <h3 className="mzn-etiket">{t('Görsel katmanları')}</h3>
          <p className="text-metin-zayif">{t('PNG/JPG görselleri haritanın üstüne yerleştir.')}</p>
          {editable && <>
            <input ref={fileInput} data-testid="map-image-input" type="file" accept="image/png,image/jpeg"
              className="sr-only" onChange={(event) => { void upload(event.target.files?.[0]); }} />
            <button data-testid="map-image-add" type="button" disabled={uploading}
              onClick={() => fileInput.current?.click()} className="mzn-denetim w-full px-2 py-1.5 text-left">
              + {uploading ? t('Görsel okunuyor…') : t('PNG/JPG ekle')}
            </button>
          </>}
          <div className="space-y-1">
            {map.overlays.map((overlay, index) => <button key={overlay.id} type="button"
              data-testid={`map-overlay-${overlay.id}`} draggable={editable}
              onDragStart={(event) => { setDragOverlay(overlay.id); event.dataTransfer.setData('text/plain', overlay.id); }}
              onDragEnd={() => setDragOverlay(null)}
              onDragOver={(event) => { if (editable) event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); reorderOverlay(dragOverlay ?? event.dataTransfer.getData('text/plain'), overlay.id); setDragOverlay(null); }}
              onClick={() => useUiStore.setState({ mapSelection: { type: 'overlay', id: overlay.id } })}
              className={'mzn-denetim flex w-full items-center gap-2 px-2 py-1.5 text-left ' +
                (dragOverlay && dragOverlay !== overlay.id ? 'border-t border-amber ' : '') +
                (selection?.type === 'overlay' && selection.id === overlay.id ? 'border-l-2 border-amber' : '')}>
              <span aria-hidden="true" className="text-metin-zayif">⠿</span>
              <span className="mzn-sayi text-[10px] text-metin-zayif">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{overlay.assetId}</span>
              {!overlay.visible && <span className="text-[10px] text-metin-zayif">{t('Gizli')}</span>}
            </button>)}
          </div>
          {selectedOverlay && <section className="space-y-2 border-t border-kenar-ic pt-3">
            <h3 className="mzn-etiket">{t('Görsel özellikleri')}</h3>
            <label className="flex items-center gap-2"><input type="checkbox" checked={selectedOverlay.visible} disabled={!editable}
              onChange={(event) => updateMapOverlay(doc, worldId, selectedOverlay.id, { visible: event.target.checked })} />{t('Görünür')}</label>
            <label className="block space-y-1">{t('Ölçek')} · {selectedOverlay.scale.toFixed(2)}×
              <input data-testid="map-overlay-scale" type="range" min="0.05" max="4" step="0.05"
                disabled={!editable} value={selectedOverlay.scale} className="w-full accent-amber"
                onChange={(event) => updateMapOverlay(doc, worldId, selectedOverlay.id, { scale: Number(event.target.value) })} />
            </label>
            <label className="block">{t('Döndür')} °
              <input data-testid="map-overlay-rotation" type="number" min="-360" max="360" step="1"
                disabled={!editable} value={selectedOverlay.rotation} className="mzn-girdi mt-1 w-full px-2 py-1"
                onChange={(event) => updateMapOverlay(doc, worldId, selectedOverlay.id, { rotation: Math.max(-360, Math.min(360, Number(event.target.value))) })} />
            </label>
            <div className="grid grid-cols-2 gap-2">{(['x', 'y'] as const).map((axis) =>
              <label key={axis}>{axis.toUpperCase()} %
                <input type="number" min="0" max="100" step="1" disabled={!editable}
                  value={Math.round(selectedOverlay[axis] * 100)} className="mzn-girdi mt-1 w-full px-2 py-1"
                  onChange={(event) => updateMapOverlay(doc, worldId, selectedOverlay.id, { [axis]: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })} />
              </label>)}</div>
            {editable && <button type="button" onClick={() => { removeMapOverlay(doc, worldId, selectedOverlay.id); useUiStore.setState({ mapSelection: null }); }}
              className="px-2 py-1 text-red-400">{t('Görseli kaldır')}</button>}
          </section>}
        </>}
      </div>
      {pendingPatch && <MapRegenerateDialog
        onConfirm={() => {
          useUiStore.setState({ mapDraft: buildDraft(pendingPatch) });
          setConfirmedPreview(true);
          setPendingPatch(null);
        }}
        onClose={() => setPendingPatch(null)}
      />}
    </div>
  );
}
