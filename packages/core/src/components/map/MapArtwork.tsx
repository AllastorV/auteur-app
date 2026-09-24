import React from 'react';
import type { Lokasyon } from '../../model/lokasyon';
import type { MapDraft, WorldMap } from '../../model/world-map';
import { MAP_HEIGHT, MAP_WIDTH } from '../../model/world-map-generator';
import { MapGeography } from './MapGeography';
import { t } from '../../dil/arayuz';
import type { VerifiedTextures } from './map-texture-source';

export type MapArtworkSelection =
  | { type: 'marker' | 'label' | 'overlay' | 'country'; id: string }
  | { type: 'terrain'; x: number; y: number };

export interface MapLayerVisibility { relief: boolean; rivers: boolean; countries: boolean; labels: boolean }
export const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  relief: true, rivers: true, countries: true, labels: true,
};

/** Single SVG art tree for both interactive preview and raster export. */
export function MapArtwork({ map, assets, textures, locations, draft, selected, onSelect, showSea = true, layers = DEFAULT_MAP_LAYERS }: {
  map: WorldMap;
  assets: Readonly<Record<string, string>>;
  textures?: Partial<VerifiedTextures>;
  locations?: Readonly<Record<string, Lokasyon>>;
  draft?: MapDraft | null;
  selected?: MapArtworkSelection | null;
  onSelect?: (selection: MapArtworkSelection) => void;
  showSea?: boolean;
  layers?: MapLayerVisibility;
}) {
  return <>
    <MapGeography map={map} assets={assets} textures={textures} draft={draft} showSea={showSea}
      selectedId={selected?.type === 'country' ? selected.id : null}
      onSelectCountry={onSelect ? (id) => onSelect({ type: 'country', id }) : undefined}
      onSelectTerrain={onSelect ? (x, y) => onSelect({ type: 'terrain', x, y }) : undefined}
      layers={layers} />
    {map.overlays.filter((overlay) => overlay.visible).map((overlay) => (
      <image key={overlay.id} href={assets[overlay.assetId]}
        x={overlay.x * MAP_WIDTH - 90 * overlay.scale} y={overlay.y * MAP_HEIGHT - 90 * overlay.scale}
        width={180 * overlay.scale} height={180 * overlay.scale}
        preserveAspectRatio="xMidYMid meet"
        transform={`rotate(${overlay.rotation} ${overlay.x * MAP_WIDTH} ${overlay.y * MAP_HEIGHT})`}
        className={onSelect ? 'cursor-pointer' : undefined}
        onPointerDown={onSelect ? (event) => { event.stopPropagation(); onSelect({ type: 'overlay', id: overlay.id }); } : undefined} />
    ))}
    {layers.labels && map.labels.map((label) => (
      <text key={label.id} x={label.x * MAP_WIDTH} y={label.y * MAP_HEIGHT}
        textAnchor="middle" fill="#f3ead5" stroke="#17363b" strokeWidth="3" paintOrder="stroke"
        fontSize="23" fontFamily="Georgia, serif" className={onSelect ? 'cursor-pointer' : undefined}
        onPointerDown={onSelect ? (event) => { event.stopPropagation(); onSelect({ type: 'label', id: label.id }); } : undefined}>
        {label.text}
      </text>
    ))}
    {map.markers.map((marker) => {
      const missing = Boolean(locations && marker.locationId && !locations[marker.locationId]);
      const active = selected?.type === 'marker' && selected.id === marker.id;
      return <g key={marker.id} transform={`translate(${marker.x * MAP_WIDTH} ${marker.y * MAP_HEIGHT})`}
        className={onSelect ? 'cursor-pointer' : undefined} data-testid={`map-marker-${marker.id}`}
        onPointerDown={onSelect ? (event) => { event.stopPropagation(); onSelect({ type: 'marker', id: marker.id }); } : undefined}>
        <circle r={active ? 12 : 9} fill={missing ? '#d38171' : '#d9ad64'} stroke="#17363b" strokeWidth="3" />
        {layers.labels && <text x="14" y="5" fill="#f5eddd" fontSize="18" stroke="#17363b" strokeWidth="3" paintOrder="stroke">{marker.label}</text>}
        {missing && <title>{t('Bağlı mekân bulunamadı')}</title>}
      </g>;
    })}
  </>;
}
