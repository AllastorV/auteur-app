import type { ResolvedGeographyControls } from '../world-map';

export type AtlasArchetype = 'single' | 'fragmented' | 'multi';

/** Pure, derived geography. The serialized map stores only seed, version and controls. */
export interface AtlasTerrain {
  seed: number;
  width: 256;
  height: 160;
  controls: ResolvedGeographyControls;
  archetype: AtlasArchetype;
  elevation: Float32Array;
  land: Uint8Array;
  coastPaths: string[];
  /** 4-neighbour components, with the east/west seam connected. */
  landComponents: number[][];
}
