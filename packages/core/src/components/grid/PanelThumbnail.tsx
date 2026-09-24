import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Rect, Stage } from 'react-konva';
import type { Panel } from '../../model/types';
import { ObjectNode } from '../canvas/ObjectNode';
import { paintLayerCanvas } from '../../render/layer-composite';

const THUMB_WIDTH = 260;

/**
 * Panel küçük resmi — aynı Konva düğümleri küçültülmüş ölçekte çizilir.
 * Ayrı bir raster önbelleğe gerek kalmadan grid ve zaman çizelgesi güncel kalır.
 */
export const PanelThumbnail = React.memo(function PanelThumbnail({
  panel,
  frame,
  width = THUMB_WIDTH,
}: {
  panel: Panel;
  frame: { width: number; height: number };
  width?: number;
}) {
  const scale = width / frame.width;
  const height = frame.height * scale;

  const layers = useMemo(() => [...panel.layers].sort((a, b) => a.order - b.order), [panel.layers]);
  const objects = useMemo(() => {
    const byLayer = new Map<string, typeof panel.objects>();
    for (const l of layers) byLayer.set(l.id, []);
    for (const o of panel.objects) byLayer.get(o.layerId)?.push(o);
    for (const list of byLayer.values()) list.sort((a, b) => a.z - b.z);
    return byLayer;
  }, [panel.objects, layers]);

  // 100 panellik bir projede her küçük resim için bir Konva sahnesi açmak
  // belleği ve ilk boyamayı ağırlaştırır. Sahne yalnızca görünüm alanına
  // girdiğinde kurulur.
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden border border-kenar-ic bg-white"
      style={{ width, height, isolation: 'isolate' }}
      data-testid="panel-thumbnail"
    >
      {visible && (
        <Stage width={width} height={height} scaleX={scale} scaleY={scale} listening={false}>
          <Layer listening={false}>
            <Rect width={frame.width} height={frame.height} fill={panel.background} />
          </Layer>
          {layers.map((layer) => (
            <Layer key={layer.id} visible={layer.visible} listening={false}
              ref={(node) => {
                if (node) paintLayerCanvas(node.getNativeCanvasElement(), layer.blendMode, layer.opacity, layer.visible);
              }}>
              {(objects.get(layer.id) ?? []).map((obj) => (
                <ObjectNode key={obj.id} object={obj} listening={false} quality="fast" />
              ))}
            </Layer>
          ))}
        </Stage>
      )}
    </div>
  );
});
