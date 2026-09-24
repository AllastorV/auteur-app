import React, { useRef, useState } from 'react';
import { t } from '../../dil/arayuz';
import { addMapLabel, addMapMarker, setCountryConfig } from '../../doc/mutations';
import { MAP_HEIGHT, MAP_WIDTH, MapLayoutError } from '../../model/world-map-generator';
import { useProjectStore } from '../../store/project';
import { haritadanCik } from '../../store/mod';
import { adoptLegacyMap, createProjectMap, legacyMapSources, PROJECT_MAP_ID, validateProjectMapDraft } from '../../model/project-world-map';
import { useUiStore } from '../../store/ui';
import { DEFAULT_MAP_LAYERS, MapArtwork, type MapLayerVisibility } from './MapArtwork';
import { useWorldMap } from './useWorldMap';
import { renderWorldMapToDataURL } from '../../export/world-map';
import { safeFileName } from '../../model/project-io';
import { useMapTextureSources } from './map-texture-source';

export function MapWorkspace() {
  const doc = useProjectStore((s) => s.doc);
  const locations = useProjectStore((s) => s.lokasyonlar);
  const assetUrls = useProjectStore((s) => s.assetUrls);
  const editable = useProjectStore((s) => s.allowed('edit'));
  const exportAllowed = useProjectStore((s) => s.allowed('export'));
  const projectName = useProjectStore((s) => s.project.meta.name);
  const worldId = PROJECT_MAP_ID;
  const draft = useUiStore((s) => s.mapDraft);
  const selected = useUiStore((s) => s.mapSelection);
  const placement = useUiStore((s) => s.mapPlacement);
  const map = useWorldMap(doc, worldId);
  const textures = useMapTextureSources(map, assetUrls);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState<'png' | 'jpg' | null>(null);
  const [layers, setLayers] = useState<MapLayerVisibility>(DEFAULT_MAP_LAYERS);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  if (!map) {
    const sources = legacyMapSources(doc);
    return <div data-testid="map-empty-state" className="flex h-full min-h-0 flex-col bg-[#102c32] text-metin-guclu">
      <div className="flex h-12 shrink-0 items-center border-b border-kenar px-4 text-sm font-medium">World Map</div>
      <div className="m-auto w-full max-w-lg space-y-5 p-6">
        <div>
          <h2 className="text-lg font-medium">{t('Proje dünya haritası')}</h2>
          <p className="mt-2 text-sm text-metin-zayif">{t('Bu projede henüz bir dünya haritası yok.')}</p>
        </div>
        {editable && <button type="button" data-testid="map-create"
          onClick={() => createProjectMap(doc, globalThis.crypto.getRandomValues(new Uint32Array(1))[0])}
          className="mzn-birincil w-full px-3 py-2 text-left text-sm">{t('Rastgele dünya oluştur')}</button>}
        {sources.length > 0 && <section className="space-y-2 border-t border-kenar pt-4">
          <h3 className="mzn-etiket">{t('Eski haritayı içe al')}</h3>
          <p className="text-xs text-metin-zayif">{t('Kaynak haritalar ve görselleri korunur; yalnızca seçtiğiniz kopyalanır.')}</p>
          {sources.map((source) => <button key={source.worldId} type="button"
            data-testid={`map-adopt-${source.worldId}`} disabled={!editable}
            onClick={() => adoptLegacyMap(doc, source.worldId)}
            className="mzn-denetim block w-full px-3 py-2 text-left text-sm disabled:opacity-40">
            {source.name}
          </button>)}
        </section>}
      </div>
    </div>;
  }

  let safeDraft = null;
  if (draft) {
    try { validateProjectMapDraft({ ...draft, engineVersion: 2 }, map.countryConfig); safeDraft = { ...draft, engineVersion: 2 as const }; }
    catch (error) {
      if (!(error instanceof MapLayoutError)) throw error;
      // Keep the last saved map visible while the draft is impossible.
    }
  }

  const exportImage = async (type: 'image/png' | 'image/jpeg') => {
    if (!exportAllowed || draft || exporting) return;
    const extension = type === 'image/png' ? 'png' : 'jpg';
    setExporting(extension);
    try {
      const dataUrl = await renderWorldMapToDataURL(map, assetUrls, type, locations, undefined, layers);
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `${safeFileName(projectName)}-harita.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      console.error('[world-map] export failed', error);
      useUiStore.getState().showToast(t('Harita dışa aktarılamadı.'), 'error');
    } finally { setExporting(null); }
  };

  const relative = (clientX: number, clientY: number) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    // preserveAspectRatio=xMidYMid meet: remove letterbox before inverting pan/zoom.
    const fit = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT);
    const ox = (rect.width - MAP_WIDTH * fit) / 2;
    const oy = (rect.height - MAP_HEIGHT * fit) / 2;
    return {
      x: ((clientX - rect.left - ox) / fit - pan.x) / zoom / MAP_WIDTH,
      y: ((clientY - rect.top - oy) / fit - pan.y) / zoom / MAP_HEIGHT,
    };
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (placement && editable && event.button === 0) {
      const point = relative(event.clientX, event.clientY);
      if (!point || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
      if (placement.type === 'marker') {
        const locationId = placement.locationId && locations[placement.locationId] ? placement.locationId : null;
        const marker = addMapMarker(doc, worldId, {
          locationId, x: point.x, y: point.y,
          label: locationId ? locations[locationId].ad : t('Yeni mekân'),
        });
        useUiStore.setState({ mapSelection: { type: 'marker', id: marker.id } });
      } else {
        const label = addMapLabel(doc, worldId, { x: point.x, y: point.y, text: t('Yeni etiket') });
        useUiStore.setState({ mapSelection: { type: 'label', id: label.id } });
      }
      useUiStore.setState({ mapPlacement: null });
      return;
    }
    panStart.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const start = panStart.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fit = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT);
    if (!fit) return;
    setPan({ x: start.px + (event.clientX - start.x) / fit, y: start.py + (event.clientY - start.y) / fit });
  };

  return (
    <div data-testid="map-workspace" className="flex h-full min-h-0 flex-col bg-[#102c32] text-metin-guclu">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-kenar px-4">
        <button type="button" data-testid="map-back" onClick={haritadanCik}
          className="mzn-denetim px-2.5 py-1 text-xs">← {t('Geri')}</button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{projectName} <span className="ml-2 text-xs text-metin-zayif">World Map</span></div>
        {draft && <span className="rounded-sm border border-amber px-2 py-0.5 text-[11px] text-amber">{t('Taslak')}</span>}
        {editable ? <div role="group" aria-label={t('Harita görünümü')} className="flex shrink-0">
          {(['color', 'texture'] as const).map((appearance) => <button key={appearance} type="button"
            data-testid={`map-appearance-${appearance}`} aria-pressed={map.countryConfig.appearance === appearance}
            onClick={() => setCountryConfig(doc, worldId, { appearance })}
            className={'mzn-denetim px-2 py-1 text-[11px] ' +
              (map.countryConfig.appearance === appearance ? 'border-amber bg-etkin text-amber' : '')}>
            {appearance === 'color' ? t('Renk') : t('Doku')}
          </button>)}
        </div> : <span data-testid="map-appearance-readonly" className="text-[11px] text-metin-zayif">
          {map.countryConfig.appearance === 'texture' ? t('Doku') : t('Renk')}
        </span>}
        {exportAllowed && <>
          <button data-testid="map-export-png" type="button" disabled={Boolean(draft || exporting)}
            onClick={() => { void exportImage('image/png'); }}
            title={map.countryConfig.appearance === 'texture' && textures?.sea.kind === 'custom'
              ? t('Özel deniz dokusuyla PNG olarak dışa aktar')
              : t('Haritayı saydam PNG olarak dışa aktar')}
            className="mzn-denetim px-2 py-1 text-xs disabled:opacity-40">PNG</button>
          <button data-testid="map-export-jpg" type="button" disabled={Boolean(draft || exporting)}
            onClick={() => { void exportImage('image/jpeg'); }} title={t('Haritayı JPG olarak dışa aktar')}
            className="mzn-denetim px-2 py-1 text-xs disabled:opacity-40">JPG</button>
        </>}
        <details data-testid="map-layers" className="relative shrink-0">
          <summary className="mzn-denetim cursor-pointer px-2 py-1 text-xs">{t('Harita katmanları')}</summary>
          <div className="absolute right-0 top-full z-30 mt-1 w-44 space-y-1 rounded-sm border border-kenar bg-panel p-2 shadow-xl">
            {([
              ['relief', t('Yeryüzü')], ['rivers', t('Nehirler')],
              ['countries', t('Ülkeler')], ['labels', t('Etiketler')],
            ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 px-1 py-1 text-xs">
              <input type="checkbox" data-testid={`map-layer-${key}`} checked={layers[key]}
                onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))} />
              {label}
            </label>)}
          </div>
        </details>
        <button type="button" aria-label={t('Uzaklaş')} onClick={() => setZoom((v) => Math.max(0.5, v / 1.2))} className="mzn-denetim px-2">−</button>
        <span data-testid="map-zoom" className="w-12 text-center text-xs">%{Math.round(zoom * 100)}</span>
        <button type="button" aria-label={t('Yakınlaş')} onClick={() => setZoom((v) => Math.min(3, v * 1.2))} className="mzn-denetim px-2">+</button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="mzn-denetim px-2 py-1 text-xs">{t('Sığdır')}</button>
      </div>
      <div className="relative min-h-0 flex-1 p-4 md:p-6">
        <svg ref={svg} data-testid="map-canvas" role="img" aria-label={t('Dünya haritası')}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-full w-full touch-none rounded-sm border border-[#476063] shadow-2xl"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={(event) => { panStart.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { panStart.current = null; }}
          onWheel={(event) => { event.preventDefault(); setZoom((v) => Math.max(0.5, Math.min(3, v * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))); }}>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <MapArtwork map={map} assets={assetUrls} textures={textures ?? undefined} locations={locations} draft={safeDraft} selected={selected} layers={layers}
              onSelect={placement ? undefined : (item) => useUiStore.setState({
                mapSelection: item, mapTab: item.type === 'overlay' ? 'layers' : item.type === 'country' ? 'countries' : item.type === 'terrain' ? 'settings' : 'places',
              })} />
          </g>
        </svg>
        {placement && <div className="pointer-events-none absolute bottom-8 left-8 rounded-sm bg-panel/90 px-3 py-2 text-xs">{t('Haritada bir noktaya tıkla')}</div>}
      </div>
    </div>
  );
}
