import React from 'react';
import { t } from '../../dil/arayuz';
import type { CountryBiome, MapCountry, MapDraft, WorldMap } from '../../model/world-map';
import { countryPath, generateCountries } from '../../model/world-map-countries';
import { MAP_HEIGHT, MAP_WIDTH } from '../../model/world-map-generator';
import { safeTextureState, type VerifiedTextures } from './map-texture-source';

export const COUNTRY_COLORS: Record<CountryBiome, string> = {
  plain: '#728365', forest: '#3f6958', desert: '#b39263', mountain: '#777f7a',
  swamp: '#627660', tundra: '#aebdb9', volcanic: '#625f60',
};
const PLAIN_COUNTRY_COLORS = [
  '#788867', '#8a9367', '#698370', '#7b806b',
  '#61856b', '#92916f', '#697c76', '#858b72',
] as const;

export function mapCountryColor(country: MapCountry | undefined, index: number): string {
  if (country?.color) return country.color;
  if (!country || country.biome === 'plain') return PLAIN_COUNTRY_COLORS[index % PLAIN_COUNTRY_COLORS.length];
  return COUNTRY_COLORS[country.biome];
}

export function MapCountries({ map, assets, textures, draft, selectedId, onSelect, clipId }: {
  map: WorldMap;
  assets: Readonly<Record<string, string>>;
  textures?: Partial<VerifiedTextures>;
  draft?: MapDraft | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  clipId: string;
}) {
  const current = draft && Number.isInteger(draft.countryCount) && draft.countryCount >= 2 && draft.countryCount <= 16
    ? draft : { seed: map.seed, controls: map.controls, countryCount: map.countryConfig.count };
  const regions = generateCountries(current.seed, current.controls, current.countryCount);
  const appearance = map.countryConfig.appearance;
  const biomes = [...new Set(regions.map((region, index) => map.countries[index]?.biome ?? 'plain'))] as CountryBiome[];
  const patternId = (biome: CountryBiome) => `map-terrain-${map.worldId}-${biome}`;
  const sources = Object.fromEntries(biomes.map((biome) =>
    [biome, safeTextureState(map, biome, assets, textures)])) as Partial<Record<CountryBiome, ReturnType<typeof safeTextureState>>>;
  return <>
    {appearance === 'texture' && <defs>{biomes.map((biome) => {
      const source = sources[biome];
      return source && (source.kind === 'custom' || source.kind === 'bundled') ?
        <pattern key={biome} id={patternId(biome)} patternUnits="userSpaceOnUse"
          width={MAP_WIDTH} height={MAP_HEIGHT}>
          <image href={source.url} width={MAP_WIDTH} height={MAP_HEIGHT}
            preserveAspectRatio="xMidYMid slice" />
        </pattern> : null;
    })}</defs>}
    {appearance === 'texture' && biomes.map((biome) => {
      const source = sources[biome];
      return source?.kind === 'loading' || source?.kind === 'broken' ?
        <title key={biome} data-testid={`map-texture-broken-${biome}`}>{`${t('Doku yüklenemedi')}: ${biome}`}</title> : null;
    })}
    <g clipPath={`url(#${clipId})`}>{regions.map((region) => {
      const country = map.countries.find((item) => item.id === region.id);
      const number = Number(region.id.slice('country-'.length));
      const name = country?.name || `${t('Ülke')} ${number}`;
      const selected = selectedId === region.id;
      return <path key={region.id} data-testid={`map-country-${region.id}`} data-site-x={region.site.x * MAP_WIDTH}
          data-site-y={region.site.y * MAP_HEIGHT} d={countryPath(region)}
          fill={appearance === 'texture'
            ? (sources[country?.biome ?? 'plain']?.kind === 'bundled' || sources[country?.biome ?? 'plain']?.kind === 'custom'
              ? `url(#${patternId(country?.biome ?? 'plain')})` : '#867c67')
            : mapCountryColor(country, number - 1)}
          stroke={selected ? '#e0932f' : '#d2bc89'} strokeWidth={selected ? 4 : 1.4}
          strokeLinejoin="round" role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}
          aria-label={name} className={onSelect ? 'cursor-pointer outline-none focus:stroke-amber' : undefined}
          onPointerDown={onSelect ? (event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onSelect(region.id);
          } : undefined}
          onKeyDown={onSelect ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(region.id); }
          } : undefined}><title>{name}</title></path>;
    })}</g>
    <g pointerEvents="none">{regions.map((region) => {
      const name = map.countries.find((country) => country.id === region.id)?.name;
      return name ? <text key={region.id} x={region.site.x * MAP_WIDTH} y={region.site.y * MAP_HEIGHT}
          textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
          fill="#f5eddd" stroke="#223b3c" strokeWidth="2.5" paintOrder="stroke"
          fontSize="15" fontFamily="IBM Plex Sans Condensed, sans-serif">{name}</text> : null;
    })}</g>
  </>;
}
