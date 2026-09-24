import { generateGeography, geographyPath } from '../../model/world-map-generator';
import { parseMapSettings, type MapDraft, type WorldMap } from '../../model/world-map';
import { MapCountries } from './MapCountries';
import { safeTextureState, type VerifiedTextures } from './map-texture-source';
import { AtlasGeography } from './AtlasGeography';
import { getAtlasScene } from './atlas-cache';
import type { MapLayerVisibility } from './MapArtwork';
import { t } from '../../dil/arayuz';

/** The map backdrop deliberately stays quiet so places and images remain legible. */
export const MAP_PALETTE = {
  sea: '#153941',
  land: '#647863',
  coast: '#d2bc89',
  contour: '#8fa184',
} as const;

export function MapGeography({ map, assets, textures, draft, showSea = true, selectedId, onSelectCountry, onSelectTerrain, layers }: {
  map: WorldMap;
  assets: Readonly<Record<string, string>>;
  textures?: Partial<VerifiedTextures>;
  draft?: MapDraft | null;
  showSea?: boolean;
  selectedId?: string | null;
  onSelectCountry?: (id: string) => void;
  onSelectTerrain?: (x: number, y: number) => void;
  layers: MapLayerVisibility;
}) {
  const resolvedDraft = draft && parseMapSettings(draft) &&
    Number.isInteger(draft.countryCount) && draft.countryCount >= 2 && draft.countryCount <= 16 ? draft : null;
  if ((resolvedDraft?.engineVersion ?? map.engineVersion) === 2) {
    const current = resolvedDraft ?? map;
    const controls = parseMapSettings({ seed: current.seed, controls: current.controls })!.controls;
    const countryCount = resolvedDraft?.countryCount ?? map.countryConfig.count;
    const scene = getAtlasScene(current.seed, controls, countryCount);
    return <AtlasGeography map={map} scene={scene} assets={assets} textures={textures}
      showSea={showSea} selectedId={selectedId} onSelectCountry={onSelectCountry}
      onSelectTerrain={onSelectTerrain} layers={layers} />;
  }
  const current = draft && parseMapSettings(draft) ? draft : map;
  const geometry = generateGeography(current.seed, current.controls);
  const clipId = `map-land-${map.worldId}`;
  const mainWithLakes = [
    geographyPath(geometry.polygons[0]),
    ...geometry.lakes.map(geographyPath),
  ].join(' ');
  const islands = geometry.polygons.slice(1);
  const water = map.countryConfig.appearance === 'texture'
    ? safeTextureState(map, 'sea', assets, textures) : null;
  const waterPatternId = `map-water-${map.worldId}`;
  return (
    <g aria-label="Map geography">
      {showSea && water?.kind === 'custom' && <defs><pattern id={waterPatternId}
        patternUnits="userSpaceOnUse" width="1200" height="750">
        <image href={water.url} width="1200" height="750" preserveAspectRatio="xMidYMid slice" />
      </pattern></defs>}
      {showSea && <rect width="1200" height="750"
        fill={water?.kind === 'custom' ? `url(#${waterPatternId})` :
          water?.kind === 'broken' || water?.kind === 'loading' ? '#67757a' : MAP_PALETTE.sea} />}
      {showSea && (water?.kind === 'broken' || water?.kind === 'loading') &&
        <title data-testid="map-texture-broken-sea">{t('Deniz dokusu yüklenemedi')}</title>}
      <defs><clipPath id={clipId}>
        <path d={mainWithLakes} clipRule="evenodd" />
        {islands.map((polygon) => <path key={polygon.id} d={geographyPath(polygon)} />)}
      </clipPath></defs>
      <path d={mainWithLakes} fillRule="evenodd" fill={MAP_PALETTE.land} />
      {islands.map((polygon) => <path key={polygon.id} d={geographyPath(polygon)} fill={MAP_PALETTE.land} />)}
      <MapCountries map={map} assets={assets} textures={textures} draft={draft && parseMapSettings(draft) ? draft : null}
        selectedId={selectedId} onSelect={onSelectCountry} clipId={clipId} />
      {geometry.polygons.map((polygon) => <path key={`coast-${polygon.id}`} d={geographyPath(polygon)}
        fill="none" stroke={MAP_PALETTE.coast} strokeWidth={polygon.id === 'main' ? 3 : 2}
        strokeLinejoin="round" pointerEvents="none" />)}
      {geometry.lakes.map((lake) => <path key={lake.id} data-testid={`map-lake-${lake.id}`}
        d={geographyPath(lake)} fill="none" stroke={MAP_PALETTE.coast} strokeWidth="2"
        strokeLinejoin="round" pointerEvents="none" />)}
    </g>
  );
}
