import type { PointerEvent } from 'react';
import { t } from '../../dil/arayuz';
import { maskPaths } from '../../model/atlas/contours';
import { ATLAS_BIOMES } from '../../model/atlas/biomes';
import type { MapCountry, WorldMap } from '../../model/world-map';
import { MAP_HEIGHT, MAP_WIDTH, type MapPoint } from '../../model/world-map-generator';
import type { CountryBiome, MapTextureSlot } from '../../model/world-map-textures';
import { COUNTRY_COLORS, mapCountryColor } from './MapCountries';
import { safeTextureState, type VerifiedTextures } from './map-texture-source';
import type { MapLayerVisibility } from './MapArtwork';
import type { AtlasScene } from './atlas-cache';

const COLORS: Record<CountryBiome, string> = {
  plain: '#9aaa82', forest: '#5f876b', desert: '#c8aa77', mountain: '#898d8b',
  swamp: '#668b75', tundra: '#b8c7c1', volcanic: '#756f72',
};

interface PreparedAtlas {
  land: string[];
  lakes: string[];
  unclaimed: string[];
  unclaimedCell: number;
  biomes: Partial<Record<CountryBiome, string[]>>;
  highlands: string[];
  rivers: string[];
}

const preparedScenes = new WeakMap<AtlasScene, PreparedAtlas>();

function riverPath(points: MapPoint[]): string[] {
  const segments: MapPoint[][] = [];
  let current: MapPoint[] = [];
  for (const point of points) {
    if (current.length && Math.abs(point.x - current[current.length - 1].x) > MAP_WIDTH / 2) {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length >= 2) segments.push(current);
  return segments.map((segment) => {
    const parts = [`M ${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`];
    for (let i = 1; i < segment.length - 1; i++) {
      const middle = segment[i];
      const next = segment[i + 1];
      parts.push(`Q ${middle.x.toFixed(2)} ${middle.y.toFixed(2)} ` +
        `${((middle.x + next.x) / 2).toFixed(2)} ${((middle.y + next.y) / 2).toFixed(2)}`);
    }
    const end = segment[segment.length - 1];
    parts.push(`L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`);
    return parts.join(' ');
  });
}

function prepare(scene: AtlasScene): PreparedAtlas {
  const cached = preparedScenes.get(scene);
  if (cached) return cached;
  const { world, ownership } = scene;
  const { width, height, land, lakes } = world;
  const unclaimedMask = new Uint8Array(land.length);
  const dryLandMask = new Uint8Array(land.length);
  const biomeMasks = ATLAS_BIOMES.map(() => new Uint8Array(land.length));
  const highlandMask = new Uint8Array(land.length);
  let coastLevel = Infinity;
  for (let index = 0; index < land.length; index++) {
    if (land[index] && world.elevation[index] < coastLevel) coastLevel = world.elevation[index];
  }
  let unclaimedCell = -1;
  for (let index = 0; index < land.length; index++) {
    if (!land[index] || lakes[index]) continue;
    dryLandMask[index] = 1;
    biomeMasks[world.biome[index]][index] = 1;
    if ((world.biome[index] === 3 || world.biome[index] === 6) &&
      world.elevation[index] - coastLevel > .42) highlandMask[index] = 1;
    if (ownership.owners[index] === 0) {
      unclaimedMask[index] = 1;
      if (unclaimedCell < 0) unclaimedCell = index;
    }
  }
  const biomes: Partial<Record<CountryBiome, string[]>> = {};
  ATLAS_BIOMES.forEach((biome, index) => {
    if (biomeMasks[index].some((cell) => cell === 1)) biomes[biome] = maskPaths(biomeMasks[index], width, height, true);
  });
  const result = {
    land: maskPaths(dryLandMask, width, height, true),
    lakes: maskPaths(lakes, width, height, true),
    unclaimed: maskPaths(unclaimedMask, width, height, true),
    unclaimedCell, biomes,
    highlands: maskPaths(highlandMask, width, height, true),
    rivers: world.rivers.flatMap(riverPath),
  };
  preparedScenes.set(scene, result);
  return result;
}

function terrainCoordinates(event: PointerEvent<SVGPathElement>): { x: number; y: number } {
  const target = event.currentTarget;
  const matrix = target.getScreenCTM?.();
  if (matrix && typeof DOMPoint !== 'undefined') {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.max(0, Math.min(1, point.x / MAP_WIDTH)),
      y: Math.max(0, Math.min(1, point.y / MAP_HEIGHT)) };
  }
  const bounds = target.ownerSVGElement?.getBoundingClientRect();
  const px = bounds?.width ? (event.clientX - bounds.left) * MAP_WIDTH / bounds.width : event.clientX;
  const py = bounds?.height ? (event.clientY - bounds.top) * MAP_HEIGHT / bounds.height : event.clientY;
  return { x: Math.max(0, Math.min(1, px / MAP_WIDTH)),
    y: Math.max(0, Math.min(1, py / MAP_HEIGHT)) };
}

function authoredBiome(country: MapCountry | undefined): CountryBiome | null {
  if (!country) return null;
  if (country.biomeOverride !== undefined) return country.biomeOverride;
  return country.biome !== 'plain' ? country.biome : null;
}

export function AtlasGeography({ map, scene, assets, textures, showSea, selectedId,
  onSelectCountry, onSelectTerrain, layers }: {
  map: WorldMap;
  scene: AtlasScene;
  assets: Readonly<Record<string, string>>;
  textures?: Partial<VerifiedTextures>;
  showSea: boolean;
  selectedId?: string | null;
  onSelectCountry?: (id: string) => void;
  onSelectTerrain?: (x: number, y: number) => void;
  layers: MapLayerVisibility;
}) {
  const prepared = prepare(scene);
  const { world, ownership } = scene;
  const textureMode = map.countryConfig.appearance === 'texture';
  const usedBiomes = ATLAS_BIOMES.filter((biome) => prepared.biomes[biome]?.length ||
    map.countries.some((country) => authoredBiome(country) === biome));
  const sources = Object.fromEntries((['sea', ...usedBiomes] as MapTextureSlot[]).map((slot) =>
    [slot, safeTextureState(map, slot, assets, textures)])) as Record<string, ReturnType<typeof safeTextureState>>;
  const patternId = (slot: MapTextureSlot) => `map-atlas-${map.worldId.replace(/[^A-Za-z0-9_-]/g, '-')}-${slot}`;
  const patternFill = (slot: MapTextureSlot, fallback: string) => {
    const source = sources[slot];
    return textureMode && source && (source.kind === 'custom' || source.kind === 'bundled') && source.url
      ? `url(#${patternId(slot)})` : fallback;
  };
  return <g aria-label="Atlas geography">
    {textureMode && <defs>{(['sea', ...usedBiomes] as MapTextureSlot[]).map((slot) => {
      const source = sources[slot];
      return source && (source.kind === 'custom' || source.kind === 'bundled') && source.url
        ? <pattern key={slot} id={patternId(slot)} data-map-texture={slot}
          patternUnits="userSpaceOnUse" width={MAP_WIDTH} height={MAP_HEIGHT}>
          <image href={source.url} width={MAP_WIDTH} height={MAP_HEIGHT} preserveAspectRatio="xMidYMid slice" />
        </pattern> : null;
    })}</defs>}
    {showSea && <rect data-map-layer="sea" width={MAP_WIDTH} height={MAP_HEIGHT}
      fill={patternFill('sea', '#315d70')} />}
    {textureMode && (['sea', ...usedBiomes] as MapTextureSlot[]).map((slot) => {
      const source = sources[slot];
      return source?.kind === 'broken' || source?.kind === 'loading'
        ? <title key={slot} data-testid={`map-texture-broken-${slot}`}>
          {`${t('Doku yüklenemedi')}: ${slot}`}</title> : null;
    })}
    <g data-map-layer="land" fill="#a4aa87">
      <path d={prepared.land.join(' ')} fillRule="evenodd" />
    </g>
    {layers.relief && <g data-map-layer="relief">
      {usedBiomes.map((biome) => prepared.biomes[biome]?.length
        ? <path key={biome} data-map-biome={biome} d={prepared.biomes[biome]!.join(' ')}
          fillRule="evenodd" fill={patternFill(biome, COLORS[biome])} /> : null)}
      <path d={prepared.highlands.join(' ')} fillRule="evenodd"
        fill="#f5e6c6" opacity=".16" pointerEvents="none" />
    </g>}
    <g data-map-layer="lakes" pointerEvents="none">
      {prepared.lakes.map((path, index) => <path key={index} data-map-lake={index + 1} d={path}
        fill={showSea ? patternFill('sea', '#447b87') : 'none'} stroke="#d5c59f" strokeWidth="1.3" />)}
    </g>
    {layers.rivers && <g data-map-layer="rivers" pointerEvents="none" fill="none"
      stroke="#aed3d1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {prepared.rivers.map((path, index) => <path key={index} d={path} />)}
    </g>}
    <path data-map-unclaimed="true" d={prepared.unclaimed.join(' ')} fill="#e3dfc7" fillOpacity=".08"
      fillRule="evenodd"
      role={onSelectTerrain ? 'button' : undefined} tabIndex={onSelectTerrain ? 0 : undefined}
      aria-label={t('Sahipsiz arazi')}
      onPointerDown={onSelectTerrain ? (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const point = terrainCoordinates(event);
        onSelectTerrain(point.x, point.y);
      } : undefined}
      onKeyDown={onSelectTerrain ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (prepared.unclaimedCell < 0) return;
        const cell = prepared.unclaimedCell;
        onSelectTerrain(((cell % world.width) + .5) / world.width,
          (Math.floor(cell / world.width) + .5) / world.height);
      } : undefined} />
    {layers.countries && <g data-map-layer="countries">
      {ownership.fillPaths.map((paths, index) => {
        const id = `country-${index + 1}`;
        const country = map.countries[index];
        const biome = authoredBiome(country);
        const name = country?.name || `${t('Ülke')} ${index + 1}`;
        const selected = selectedId === id;
        const fill = textureMode && biome
          ? patternFill(biome, COUNTRY_COLORS[biome])
          : country?.color ?? mapCountryColor(country, index);
        return <path key={id} data-testid={`map-country-${id}`} data-map-country={id}
          data-map-biome-override={biome ?? undefined}
          data-site-x={ownership.sites[index].x} data-site-y={ownership.sites[index].y}
          d={paths.join(' ')} fillRule="evenodd" fill={fill}
          fillOpacity={textureMode ? biome ? .86 : .14 : biome ? .57 : .29}
          stroke={selected ? '#f0a94b' : 'none'} strokeWidth={selected ? 3 : 0}
          role={onSelectCountry ? 'button' : undefined} tabIndex={onSelectCountry ? 0 : undefined}
          aria-label={name} className={onSelectCountry ? 'cursor-pointer outline-none' : undefined}
          onPointerDown={onSelectCountry ? (event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onSelectCountry(id);
          } : undefined}
          onKeyDown={onSelectCountry ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCountry(id); }
          } : undefined}><title>{name}</title></path>;
      })}
      <g data-map-layer="borders" fill="none" stroke="#d4c5a5" strokeWidth="1.45"
        strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
        {ownership.borderPaths.map((path, index) => <path key={index} d={path} />)}
      </g>
    </g>}
    <g data-map-layer="coast" fill="none" stroke="#ead3aa" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
      {world.coastPaths.map((path, index) => <path key={index} data-map-coast="true" d={path} />)}
    </g>
    {layers.countries && layers.labels && <g data-map-layer="labels" pointerEvents="none">
      {ownership.sites.map((site, index) => {
        const name = map.countries[index]?.name;
        return name ? <text key={index} x={site.x} y={site.y} textAnchor="middle"
          dominantBaseline="middle" fill="#fff6dd" stroke="#263f46" strokeWidth="3"
          paintOrder="stroke" fontSize="17" fontFamily="IBM Plex Sans Condensed, sans-serif">
          {name}</text> : null;
      })}
    </g>}
  </g>;
}
