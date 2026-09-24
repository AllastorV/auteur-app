import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { worldMapsMap } from '../../doc/schema';
import { PROJECT_MAP_ID, readProjectMap } from '../../model/project-world-map';
import { readWorldMap, type WorldMap } from '../../model/world-map';

/** Subscribe only while a Map workspace/inspector is mounted. */
export function useWorldMap(doc: Y.Doc, worldId: string | null): WorldMap | null {
  const [map, setMap] = useState<WorldMap | null>(() => worldId ? worldId === PROJECT_MAP_ID ? readProjectMap(doc) : readWorldMap(worldMapsMap(doc), worldId) : null);
  useEffect(() => {
    if (!worldId) { setMap(null); return; }
    const root = worldMapsMap(doc);
    const update = () => setMap(worldId === PROJECT_MAP_ID ? readProjectMap(doc) : readWorldMap(root, worldId));
    update();
    root.observe(update);
    return () => root.unobserve(update);
  }, [doc, worldId]);
  return map;
}
