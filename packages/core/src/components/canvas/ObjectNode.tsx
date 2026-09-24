import React, { useMemo } from 'react';
import { Arrow, Circle, Ellipse, Group, Image as KImage, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type {
  CameraOverlayObject,
  SBObject,
} from '../../model/types';
import { getCameraPreset } from '../../data/cameras';
import { movementArrowPoints } from '../../render/cameraOverlay';
import type { RenderQuality } from '../../model/kalite';
import { useAssetImage } from '../../hooks/useAssetImage';
import { strokeGeometry } from '../../render/stroke';

export interface ObjectNodeProps {
  object: SBObject;
  /**
   * Olay dinleme YALNIZCA kök düğümde ayarlanır.
   *
   * Konva'da vuruş (hit) tuvaline yalnızca Shape'ler çizilir ve her biri kendi
   * `listening` durumuyla kapılanır — Group'un kendi vuruş alanı yoktur.
   * İç şekillere `listening={false}` verilirse silüet/manken/3D obje/kamera
   * çerçevesi hiç tıklanamaz hale gelir: seçilemez, sürüklenemez, denetçisi
   * açılamaz. Alt düğümler kökten miras alır.
   */
  listening: boolean;
  /**
   * `fast` küçük resimlerde kullanılır: 3D render yerine hafif vektör çizim.
   * 100 panellik bir projede her küçük resim için WebGL çağırmamak için.
   */
  quality?: RenderQuality;
  onSelect?: (id: string, additive: boolean) => void;
  onChange?: (id: string, patch: Record<string, unknown>) => void;
  onEditText?: (id: string) => void;
  draggable?: boolean;
  nodeRef?: (node: Konva.Node | null) => void;
}

/* ------------------------- Kamera overlay ------------------------- */

const CameraOverlayNode = React.memo(function CameraOverlayNode({
  obj,
}: {
  obj: CameraOverlayObject;
}) {
  const preset = getCameraPreset(obj.presetId);
  const arrow = useMemo(
    () => (obj.showArrow && preset ? movementArrowPoints(preset.arrow, obj.width, obj.height) : null),
    [obj.showArrow, obj.width, obj.height, preset],
  );

  return (
    <Group offsetX={obj.width / 2} offsetY={obj.height / 2}>
      <Rect
        width={obj.width}
        height={obj.height}
        stroke={obj.color}
        strokeWidth={3}
        dash={[14, 8]}
      />
      {/* köşe işaretleri */}
      {[
        [0, 0, 1, 1], [obj.width, 0, -1, 1],
        [0, obj.height, 1, -1], [obj.width, obj.height, -1, -1],
      ].map(([x, y, sx, sy], i) => (
        <Line
          key={i}
          points={[x, y + sy * 26, x, y, x + sx * 26, y]}
          stroke={obj.color}
          strokeWidth={5}
        />
      ))}
      <Rect
        x={8}
        y={8}
        width={Math.min(obj.width - 16, 20 + obj.label.length * 11)}
        height={34}
        fill={obj.color}
        opacity={0.9}
        cornerRadius={4}
      />
      <Text
        x={16}
        y={16}
        text={obj.label}
        fontSize={18}
        fontStyle="bold"
        fill="#0b1220"
      />
      {arrow?.segments.map((seg, i) => (
        <Arrow
          key={`arr${i}`}
          points={seg}
          stroke={obj.color}
          fill={obj.color}
          strokeWidth={5}
          pointerLength={16}
          pointerWidth={14}
        />
      ))}
      {arrow?.circles.map((c, i) => (
        <Circle
          key={`circ${i}`}
          x={c[0]}
          y={c[1]}
          radius={c[2]}
          stroke={obj.color}
          strokeWidth={4}
          dash={[10, 8]}
        />
      ))}
    </Group>
  );
});

/* --------------------------- Görsel obje -------------------------- */

const ImageNode = React.memo(function ImageNode({
  assetId,
  width,
  height,
}: {
  assetId: string;
  width: number;
  height: number;
}) {
  const image = useAssetImage(assetId);
  if (!image) {
    return <Rect width={width} height={height} fill="#1e293b" />;
  }
  return <KImage image={image} width={width} height={height} />;
});

/* ----------------------------- Kök node ---------------------------- */

export const ObjectNode = React.memo(function ObjectNode({
  object,
  listening,
  onSelect,
  onChange,
  onEditText,
  draggable,
  nodeRef,
  quality = 'full',
}: ObjectNodeProps) {
  const common = {
    id: object.id,
    x: object.x,
    y: object.y,
    rotation: object.rotation,
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    opacity: object.visible ? object.opacity : 0,
    listening: listening && !object.locked && object.visible,
    draggable: draggable && !object.locked,
    ref: nodeRef as any,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!onSelect) return;
      e.cancelBubble = true;
      onSelect(object.id, e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
    },
    onTap: (e: Konva.KonvaEventObject<Event>) => {
      if (!onSelect) return;
      e.cancelBubble = true;
      onSelect(object.id, false);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange?.(object.id, { x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      onChange?.(object.id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
    },
  };

  switch (object.kind) {
    case 'stroke': {
      // Geometry version preserves old strokes; new Brush is a filled variable
      // outline and new Pen is a fixed-width centerline.
      const geo = strokeGeometry(object);
      return (
        <Line
          {...common}
          points={geo.points}
          closed={geo.filled}
          fill={geo.filled ? object.color : undefined}
          stroke={geo.filled ? undefined : object.color}
          strokeWidth={geo.filled ? 0 : object.width}
          lineCap="round"
          lineJoin="round"
          tension={!geo.filled && object.brush ? Math.min(object.smoothing, 0.5) : 0}
          globalCompositeOperation={object.eraser ? 'destination-out' : 'source-over'}
          hitStrokeWidth={Math.max(object.width, 16)}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      );
    }
    case 'rect':
      return (
        <Rect
          {...common}
          width={object.width}
          height={object.height}
          offsetX={object.width / 2}
          offsetY={object.height / 2}
          fill={object.fill ?? 'transparent'}
          stroke={object.stroke ?? undefined}
          strokeWidth={object.strokeWidth}
          cornerRadius={object.cornerRadius}
          perfectDrawEnabled={false}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          {...common}
          radiusX={object.radiusX}
          radiusY={object.radiusY}
          fill={object.fill ?? 'transparent'}
          stroke={object.stroke ?? undefined}
          strokeWidth={object.strokeWidth}
          perfectDrawEnabled={false}
        />
      );
    case 'line':
      return (
        <Line
          {...common}
          points={object.points}
          stroke={object.stroke}
          strokeWidth={object.strokeWidth}
          dash={object.dash ?? undefined}
          lineCap="round"
          hitStrokeWidth={Math.max(object.strokeWidth, 16)}
        />
      );
    case 'arrow':
      return (
        <Arrow
          {...common}
          points={object.points}
          stroke={object.stroke}
          fill={object.stroke}
          strokeWidth={object.strokeWidth}
          pointerLength={Math.max(12, object.strokeWidth * 3)}
          pointerWidth={Math.max(10, object.strokeWidth * 2.6)}
          hitStrokeWidth={Math.max(object.strokeWidth, 16)}
        />
      );
    case 'polygon':
      return (
        <Line
          {...common}
          points={object.points}
          closed={object.closed}
          fill={object.fill ?? 'transparent'}
          stroke={object.stroke ?? undefined}
          strokeWidth={object.strokeWidth}
        />
      );
    case 'text':
      return (
        <Text
          {...common}
          onDblClick={(e) => { e.cancelBubble = true; onEditText?.(object.id); }}
          onDblTap={(e) => { e.cancelBubble = true; onEditText?.(object.id); }}
          text={object.text}
          fontFamily={object.fontFamily}
          fontSize={object.fontSize}
          fontStyle={object.fontStyle}
          align={object.align}
          fill={object.fill}
          stroke={object.stroke ?? undefined}
          strokeWidth={object.strokeWidth}
          width={object.width}
          lineHeight={object.lineHeight}
        />
      );
    case 'image':
      return (
        <Group {...common}>
          <ImageNode assetId={object.assetId} width={object.width} height={object.height} />
        </Group>
      );
    case 'cameraOverlay':
      return (
        <Group {...common}>
          <CameraOverlayNode obj={object} />
        </Group>
      );
    default:
      return null;
  }
});
