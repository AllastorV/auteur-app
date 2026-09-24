import type { Panel, SBObject } from '../../model/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Rect, Stage, Transformer, Line, Text as KText, Circle } from 'react-konva';
import Konva from 'konva';
import { useProjectStore, projectActions } from '../../store/project';
import { useUiStore, MAX_ZOOM, MIN_ZOOM } from '../../store/ui';
import { panelSize } from '../../data/aspect';
import { ObjectNode } from './ObjectNode';
import { FrameGuides } from './FrameGuides';
import { CursorLayer } from './CursorLayer';
import { PlaybackOverlay } from './PlaybackOverlay';
import {
  createEllipse,
  createLine,
  createPolygon,
  createRect,
  createStroke,
  createText,
} from '../../model/objects';
import { readDragPayload } from '../dnd';
import { useDropHandler, useImageDropHandler } from '../../hooks/useDropHandler';
import { useCollabStore } from '../../store/collab';
import { defaultDrawLayerId } from '../../model/layers';
import { t } from '../../dil/arayuz';
import { lassoSelection } from './lasso';
import { strokeGeometry } from '../../render/stroke';
import { rememberColor } from '../inspector/PaintPanel';
import { paintLayerCanvas } from '../../render/layer-composite';

interface Props {
  panel: Panel;
  /** Düzenleme izni yoksa canvas salt okunur çalışır. */
  editable: boolean;
}

interface Draft {
  kind: 'stroke' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'lasso';
  points: number[];
  start: { x: number; y: number };
}

const MIN_DRAG = 3;

export function CanvasStage({ panel, editable }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const middlePan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lassoPointerId = useRef<number | null>(null);
  const [middlePanning, setMiddlePanning] = useState(false);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [draft, setDraftState] = useState<Draft | null>(null);
  // Taslak hem state hem ref olarak tutulur: yan etkiler (objeyi dokümana
  // yazmak) asla bir state güncelleyicisinin içinde çalıştırılmaz — React
  // StrictMode güncelleyicileri iki kez çağırır ve obje çift eklenirdi.
  const draftRef = useRef<Draft | null>(null);
  const setDraft = useCallback(
    (next: Draft | null | ((prev: Draft | null) => Draft | null)) => {
      const value = typeof next === 'function' ? next(draftRef.current) : next;
      draftRef.current = value;
      setDraftState(value);
    },
    [],
  );
  const [editingText, setEditingText] = useState<{ id: string; value: string; x: number; y: number } | null>(null);

  const ui = useUiStore();
  const doc = useProjectStore((s) => s.doc);
  const activeLayerId = useUiStore((s) => s.activeLayerId);
  const selection = useUiStore((s) => s.selection);
  const setPresenceCursor = useCollabStore((s) => s.setCursor);

  const frame = useMemo(() => panelSize(panel.guides.aspect), [panel.guides.aspect]);

  /* ------------------------- ölçü / yerleşim ------------------------- */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /** Paneli görünüme sığdır. */
  /* En son sığdırmanın yazdığı değerler. Kullanıcının kendi
     yakınlaştırmasını EZMEMEK için gerekli: durum hâlâ bu değerlerdeyse
     tuvale dokunulmamış demektir. */
  const sonSigdirma = useRef<{ zoom: number; panX: number; panY: number } | null>(null);

  const fit = useCallback(() => {
    const pad = 48;
    const k = Math.min(
      (size.width - pad * 2) / frame.width,
      (size.height - pad * 2) / frame.height,
    );
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
    const yeni = {
      zoom,
      panX: (size.width - frame.width * zoom) / 2,
      panY: (size.height - frame.height * zoom) / 2,
    };
    sonSigdirma.current = yeni;
    useUiStore.setState(yeni);
  }, [size.width, size.height, frame.width, frame.height]);

  /* Sığdırma, panel oranı değiştiğinde VE tuval boyutu değişip kullanıcı
     henüz kendi yakınlaştırmasını yapmamışken çalışır.
     ÖLÇÜLDÜ: eskiden yalnız orana bakılıyordu ve kare sola yapışık
     açılıyordu — ilk ölçüm, kütüphane çekmecesi kayarken alınıyor, sonra
     tuval genişliyor ve ortalama eski genişliğe göre kalıyordu. Kullanıcı
     bir kez yakınlaştırdıysa durum artık `sonSigdirma`'ya eşit olmaz ve
     yeniden sığdırılmaz. */
  const sigdirilanOran = useRef('');
  useEffect(() => {
    if (!size.width || !size.height) return;
    const oranDegisti = sigdirilanOran.current !== panel.guides.aspect;
    const s = sonSigdirma.current;
    const u = useUiStore.getState();
    const dokunulmadi = !s || (s.zoom === u.zoom && s.panX === u.panX && s.panY === u.panY);
    if (!oranDegisti && !dokunulmadi) return;
    sigdirilanOran.current = panel.guides.aspect;
    fit();
  }, [fit, panel.guides.aspect, size.width, size.height]);

  /* --------------------------- katmanlar ---------------------------- */

  const layers = useMemo(() => [...panel.layers].sort((a, b) => a.order - b.order), [panel.layers]);

  const objectsByLayer = useMemo(() => {
    const map = new Map<string, SBObject[]>();
    for (const l of layers) map.set(l.id, []);
    for (const o of panel.objects) {
      const bucket = map.get(o.layerId);
      if (bucket) bucket.push(o);
      else map.set(o.layerId, [o]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.z - b.z);
    return map;
  }, [panel.objects, layers]);

  const currentLayerId = useMemo(() => {
    const explicit = layers.find((l) => l.id === activeLayerId && !l.locked && l.visible);
    if (explicit) return explicit.id;
    return defaultDrawLayerId(layers, editable);
  }, [layers, activeLayerId, editable]);

  /* ------------------------- seçim / transformer -------------------- */

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selection
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selection, panel.objects]);

  const selectObject = useCallback((id: string, additive: boolean) => {
    if (ui.tool !== 'select') return;
    useUiStore.getState().toggleSelection(id, additive);
  }, [ui.tool]);

  const patchObject = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      if (!editable) return;
      projectActions.updateObject(doc, panel.id, id, patch);
    },
    [doc, panel.id, editable],
  );

  /* ---------------------------- pan / zoom -------------------------- */

  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const state = useUiStore.getState();

    if (e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) {
      useUiStore.setState({ panX: state.panX - (e.evt.deltaX || e.evt.deltaY) });
    } else {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const oldZoom = state.zoom;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * (1 + direction * 0.12)));
      const worldX = (pointer.x - state.panX) / oldZoom;
      const worldY = (pointer.y - state.panY) / oldZoom;
      useUiStore.setState({
        zoom,
        panX: pointer.x - worldX * zoom,
        panY: pointer.y - worldY * zoom,
      });
    }
  }, []);

  const stopMiddlePan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (middlePan.current?.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    middlePan.current = null;
    setMiddlePanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const moveMiddlePan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = middlePan.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    useUiStore.setState((state) => ({ panX: state.panX + dx, panY: state.panY + dy }));
  }, []);

  const toWorld = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!stage || !p) return null;
    const { zoom, panX, panY } = useUiStore.getState();
    return { x: (p.x - panX) / zoom, y: (p.y - panY) / zoom };
  }, []);

  /* ------------------------ çizim etkileşimi ------------------------ */

  const commitDraft = useCallback(
    (d: Draft) => {
      if (!editable || !currentLayerId) return;
      const state = useUiStore.getState();
      const base = { layerId: currentLayerId, x: 0, y: 0, opacity: state.opacity };

      if (d.kind === 'stroke') {
        if (d.points.length < 6) return;
        projectActions.addObject(
          doc,
          panel.id,
          createStroke(base, {
            points: d.points,
            color: state.strokeColor,
            width: state.strokeWidth,
            eraser: state.tool === 'eraser',
            brush: state.tool === 'brush',
            smoothing: state.brushSmoothing,
            opacity: state.opacity,
          }),
        );
        return;
      }

      if (d.kind === 'lasso') {
        const polygon: { x: number; y: number }[] = [];
        for (let i = 0; i < d.points.length; i += 2) {
          polygon.push({ x: d.points[i], y: d.points[i + 1] });
        }
        // getClientRect(relativeTo: stage) ve kement noktaları aynı dünya
        // koordinatındadır. Kesişim testi kısmen değen nesneleri de kapsar.
        const hits = lassoSelection(panel, polygon, (object) => {
          const node = nodeRefs.current.get(object.id);
          const stage = node?.getStage();
          return node && stage ? node.getClientRect({ relativeTo: stage }) : null;
        });
        useUiStore.setState({ selection: hits });
        return;
      }

      const [x0, y0, x1, y1] = [d.start.x, d.start.y, d.points[2] ?? d.start.x, d.points[3] ?? d.start.y];
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);

      if (d.kind === 'rect') {
        if (w < MIN_DRAG || h < MIN_DRAG) return;
        projectActions.addObject(
          doc,
          panel.id,
          createRect(
            { ...base, x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
            {
              width: w,
              height: h,
              stroke: state.strokeColor,
              strokeWidth: state.strokeWidth,
              fill: state.fillColor === '#00000000' ? null : state.fillColor,
            },
          ),
        );
      } else if (d.kind === 'ellipse') {
        if (w < MIN_DRAG || h < MIN_DRAG) return;
        projectActions.addObject(
          doc,
          panel.id,
          createEllipse(
            { ...base, x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
            {
              radiusX: w / 2,
              radiusY: h / 2,
              stroke: state.strokeColor,
              strokeWidth: state.strokeWidth,
              fill: state.fillColor === '#00000000' ? null : state.fillColor,
            },
          ),
        );
      } else if (d.kind === 'line' || d.kind === 'arrow') {
        if (Math.hypot(x1 - x0, y1 - y0) < MIN_DRAG) return;
        projectActions.addObject(
          doc,
          panel.id,
          createLine(
            { ...base, x: x0, y: y0 },
            {
              points: [0, 0, x1 - x0, y1 - y0],
              stroke: state.strokeColor,
              strokeWidth: state.strokeWidth,
              arrow: d.kind === 'arrow',
            },
          ),
        );
      }
    },
    [doc, panel.id, panel.objects, currentLayerId, editable],
  );

  const onPointerDown = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (e.evt.button !== 0) return;
      const tool = useUiStore.getState().tool;
      const world = toWorld();
      if (!world) return;

      const clickedEmpty = e.target === e.target.getStage() || e.target.name() === 'panel-bg';

      if (tool === 'select') {
        if (clickedEmpty) useUiStore.getState().clearSelection();
        return;
      }

      if (!editable) return;

      if (tool === 'eyedropper') {
        const stage = stageRef.current;
        const p = stage?.getPointerPosition();
        if (stage && p) {
          const ctx = (stage.toCanvas({ pixelRatio: 1 }) as HTMLCanvasElement).getContext('2d');
          const data = ctx?.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
          if (data) {
            const hex =
              '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
            rememberColor(hex);
            const previous = useUiStore.getState().previousTool;
            useUiStore.setState({ tool: previous && previous !== 'eyedropper' ? previous : 'pen', previousTool: null });
          }
        }
        return;
      }

      if (tool === 'fill') {
        // React/Konva can schedule the hit canvas a frame after enabling
        // listening when switching from a drawing tool. A fast bucket click
        // may then target the background even though the shape is visible.
        let hitNode = e.target;
        if (clickedEmpty) {
          const stage = stageRef.current;
          const pointer = stage?.getPointerPosition();
          if (stage && pointer) {
            stage.getLayers().forEach((layer) => layer.drawHit());
            hitNode = stage.getIntersection(pointer) ?? e.target;
          }
        }
        const target = hitNode.findAncestor((node: Konva.Node) => nodeRefs.current.has(node.id()), true);
        const object = panel.objects.find((obj) => obj.id === target?.id());
        const color = useUiStore.getState().fillColor;
        if (object) {
          if ('fill' in object) patchObject(object.id, { fill: color === '#00000000' ? null : color });
        } else if ((hitNode === hitNode.getStage() || hitNode.name() === 'panel-bg') && color !== '#00000000') {
          projectActions.updatePanel(doc, panel.id, { background: color });
        }
        return;
      }

      if (tool === 'text') {
        if (!currentLayerId) return;
        e.evt.preventDefault();
        const obj = createText(
          { layerId: currentLayerId, x: world.x, y: world.y, opacity: useUiStore.getState().opacity },
          { text: t('Metin'), fontSize: useUiStore.getState().fontSize, fill: useUiStore.getState().strokeColor },
        );
        projectActions.addObject(doc, panel.id, obj);
        useUiStore.setState({ selection: [obj.id], tool: 'select' });
        setEditingText({ id: obj.id, value: obj.text, x: world.x, y: world.y });
        return;
      }

      if (tool === 'polygon') {
        setDraft((prev) => {
          if (prev?.kind === 'polygon') {
            return { ...prev, points: [...prev.points, world.x, world.y] };
          }
          return { kind: 'polygon', points: [world.x, world.y], start: world };
        });
        return;
      }

      if (tool === 'pen' || tool === 'brush' || tool === 'eraser') {
        const pressure = (e.evt as PointerEvent).pressure || 0.5;
        setDraft({ kind: 'stroke', points: [world.x, world.y, pressure], start: world });
        return;
      }

      if (tool === 'lasso') {
        lassoPointerId.current = e.evt.pointerId;
        containerRef.current?.setPointerCapture(e.evt.pointerId);
        setDraft({ kind: 'lasso', points: [world.x, world.y], start: world });
        return;
      }

      if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
        setDraft({ kind: tool, points: [world.x, world.y, world.x, world.y], start: world });
      }
    },
    [toWorld, editable, currentLayerId, doc, panel.id, panel.objects, patchObject],
  );

  const onPointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const world = toWorld();
      if (!world) return;
      setPresenceCursor(world.x, world.y, panel.id);

      setDraft((d) => {
        if (!d) return d;
        if (d.kind === 'stroke') {
          const pressure = (e.evt as PointerEvent).pressure || 0.5;
          return { ...d, points: [...d.points, world.x, world.y, pressure] };
        }
        if (d.kind === 'lasso') return d; // yakalanan işaretçi window dinleyicisinden örneklenir
        if (d.kind === 'polygon') return d;
        return { ...d, points: [d.start.x, d.start.y, world.x, world.y] };
      });
    },
    [toWorld, panel.id, setPresenceCursor],
  );

  const onPointerUp = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    if (d.kind === 'polygon') return; // çokgen çift tıklama ya da Enter ile kapanır
    commitDraft(d);
    setDraft(null);
  }, [commitDraft, setDraft]);

  // Kement container'a yakalandığı için Stage artık move/up almaz. Window
  // dinleyicisi dışarı sürüklemeyi de dünya koordinatına çevirir.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (lassoPointerId.current !== e.pointerId || draftRef.current?.kind !== 'lasso') return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { zoom, panX, panY } = useUiStore.getState();
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;
      const previous = draftRef.current.points;
      if (Math.hypot(x - previous[previous.length - 2], y - previous[previous.length - 1]) < 1) return;
      setDraft((draft) => draft?.kind === 'lasso'
        ? { ...draft, points: [...draft.points, x, y] }
        : draft);
    };
    const finish = (e: PointerEvent) => {
      if (e.type === 'pointercancel') {
        if (lassoPointerId.current === e.pointerId) lassoPointerId.current = null;
        setDraft(null);
        return;
      }
      if (lassoPointerId.current !== null && lassoPointerId.current !== e.pointerId) return;
      lassoPointerId.current = null;
      if (e.button === 0) onPointerUp();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [onPointerUp, setDraft]);

  const closePolygon = useCallback(() => {
    const d = draftRef.current;
    setDraft(null);
    if (d?.kind !== 'polygon' || d.points.length < 6 || !currentLayerId || !editable) return;
    const state = useUiStore.getState();
    projectActions.addObject(
      doc,
      panel.id,
      createPolygon(
        { layerId: currentLayerId, x: 0, y: 0, opacity: state.opacity },
        {
          points: d.points,
          closed: true,
          stroke: state.strokeColor,
          strokeWidth: state.strokeWidth,
          fill: state.fillColor === '#00000000' ? null : state.fillColor,
        },
      ),
    );
  }, [doc, panel.id, currentLayerId, editable, setDraft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') closePolygon();
      if (e.key === 'Escape') setDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePolygon]);

  /* ------------------------- sürükle-bırak -------------------------- */

  const handleDrop = useDropHandler(panel, currentLayerId);
  const handleImageDrop = useImageDropHandler(panel, currentLayerId);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!editable) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { zoom, panX, panY } = useUiStore.getState();
      const at = {
        x: (e.clientX - rect.left - panX) / zoom,
        y: (e.clientY - rect.top - panY) / zoom,
      };

      // İşletim sisteminden bırakılan görseller panele gömülür.
      if (e.dataTransfer.files?.length) {
        void handleImageDrop(e.dataTransfer.files, at);
        return;
      }

      const payload = readDragPayload(e);
      if (!payload) return;
      handleDrop(payload, at);
    },
    [handleDrop, editable],
  );

  /* ------------------------------ metin ------------------------------ */

  const textOverlayStyle = useMemo((): React.CSSProperties | null => {
    if (!editingText) return null;
    const { zoom, panX, panY } = ui;
    return {
      position: 'absolute',
      left: editingText.x * zoom + panX,
      top: editingText.y * zoom + panY,
      transform: `scale(${zoom})`,
      transformOrigin: 'top left',
      minWidth: 200,
      zIndex: 20,
    };
  }, [editingText, ui]);

  const strokePreviewColor = ui.tool === 'eraser' ? '#f87171' : ui.strokeColor;
  const strokePreview = draft?.kind === 'stroke'
    ? strokeGeometry({
      points: draft.points,
      width: ui.strokeWidth,
      eraser: ui.tool === 'eraser',
      brush: ui.tool === 'brush',
      smoothing: ui.brushSmoothing,
      geometryVersion: 2,
    })
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-sayfa-alani"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
      data-testid="canvas-container"
      onPointerDownCapture={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        middlePan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        setMiddlePanning(true);
      }}
      onPointerMoveCapture={moveMiddlePan}
      onPointerUpCapture={stopMiddlePan}
      onPointerCancelCapture={stopMiddlePan}
      data-lasso-active={draft?.kind === 'lasso' ? 'true' : 'false'}
      onLostPointerCapture={(e) => {
        if (middlePan.current?.pointerId !== e.pointerId) return;
        middlePan.current = null;
        setMiddlePanning(false);
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={ui.zoom}
        scaleY={ui.zoom}
        x={ui.panX}
        y={ui.panY}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => { if (e.evt.button === 0) onPointerUp(); }}
        onPointerCancel={() => { lassoPointerId.current = null; setDraft(null); }}
        onDblClick={closePolygon}
        style={{ cursor: middlePanning ? 'grabbing' : cursorFor(ui.tool) }}
      >
        {/* Panel zemini + kırpma */}
        <Layer listening>
          <Rect
            name="panel-bg"
            width={frame.width}
            height={frame.height}
            fill={panel.background}
            /* Gölge senaryo sayfasınınkiyle aynı: iki yüzey de "masanın
               üstünde duran kağıt" diyor. */
            shadowColor="#000"
            shadowBlur={60}
            shadowOffsetY={20}
            shadowOpacity={0.55}
          />
        </Layer>

        {layers.map((layer) => (
          <Layer
            key={layer.id}
            visible={layer.visible}
            listening={layer.visible && !layer.locked}
            ref={(node) => {
              if (node) paintLayerCanvas(node.getNativeCanvasElement(), layer.blendMode, layer.opacity, layer.visible);
            }}
            clipX={0}
            clipY={0}
            clipWidth={frame.width}
            clipHeight={frame.height}
          >
              {(objectsByLayer.get(layer.id) ?? []).map((obj) => (
                <ObjectNode
                  key={obj.id}
                  object={obj}
                  listening={(ui.tool === 'select' || ui.tool === 'fill') && !layer.locked}
                  draggable={editable && ui.tool === 'select'}
                  onSelect={selectObject}
                  onChange={patchObject}
                  onEditText={(id) => {
                    if (!editable || ui.tool !== 'select' || obj.kind !== 'text') return;
                    setEditingText({ id, value: obj.text, x: obj.x, y: obj.y });
                  }}
                  nodeRef={(node) => {
                    if (node) nodeRefs.current.set(obj.id, node);
                    else nodeRefs.current.delete(obj.id);
                  }}
                />
              ))}
          </Layer>
        ))}

        {/* Çizim önizlemesi + rehberler + seçim */}
        <Layer>
          {strokePreview && (
            <Line
              points={strokePreview.points}
              closed={strokePreview.filled}
              fill={strokePreview.filled ? strokePreviewColor : undefined}
              stroke={strokePreview.filled ? undefined : strokePreviewColor}
              strokeWidth={strokePreview.filled ? 0 : ui.strokeWidth}
              lineCap="round"
              lineJoin="round"
              opacity={ui.opacity}
              listening={false}
            />
          )}
          {draft?.kind === 'lasso' && (
            <Line
              points={draft.points}
              stroke="#38bdf8"
              strokeWidth={1.5 / ui.zoom}
              dash={[6, 4]}
              closed
              fill="rgba(56,189,248,0.12)"
              listening={false}
            />
          )}
          {draft?.kind === 'polygon' && (
            <>
              <Line points={draft.points} stroke={ui.strokeColor} strokeWidth={ui.strokeWidth} opacity={ui.opacity} listening={false} />
              {Array.from({ length: draft.points.length / 2 }, (_, i) => (
                <Circle
                  key={i}
                  x={draft.points[i * 2]}
                  y={draft.points[i * 2 + 1]}
                  radius={4 / ui.zoom}
                  fill="#38bdf8"
                  listening={false}
                />
              ))}
            </>
          )}
          {draft?.kind === 'rect' && (
            <Rect
              x={Math.min(draft.points[0], draft.points[2])}
              y={Math.min(draft.points[1], draft.points[3])}
              width={Math.abs(draft.points[2] - draft.points[0])}
              height={Math.abs(draft.points[3] - draft.points[1])}
              stroke={ui.strokeColor}
              strokeWidth={ui.strokeWidth}
              fill={ui.fillColor === '#00000000' ? undefined : ui.fillColor}
              opacity={ui.opacity}
              listening={false}
            />
          )}
          {draft?.kind === 'ellipse' && (
            <Rect
              x={Math.min(draft.points[0], draft.points[2])}
              y={Math.min(draft.points[1], draft.points[3])}
              width={Math.abs(draft.points[2] - draft.points[0])}
              height={Math.abs(draft.points[3] - draft.points[1])}
              stroke={ui.strokeColor}
              strokeWidth={1 / ui.zoom}
              opacity={ui.opacity}
              dash={[4, 4]}
              listening={false}
            />
          )}
          {(draft?.kind === 'line' || draft?.kind === 'arrow') && (
            <Line points={draft.points} stroke={ui.strokeColor} strokeWidth={ui.strokeWidth} opacity={ui.opacity} listening={false} />
          )}

          <FrameGuides width={frame.width} height={frame.height} guides={panel.guides} />

          <Rect
            width={frame.width}
            height={frame.height}
            stroke="#334155"
            strokeWidth={1 / ui.zoom}
            listening={false}
          />


          {editable && ui.tool === 'select' && (
            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={false}
              borderStroke="#38bdf8"
              anchorStroke="#38bdf8"
              anchorFill="#0f172a"
              anchorSize={8}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
              }
            />
          )}
        </Layer>

        <CursorLayer panelId={panel.id} zoom={ui.zoom} />
      </Stage>

      {editingText && textOverlayStyle && (
        <textarea
          autoFocus
          aria-label={t('Metin')}
          data-testid="tuval-metin-duzenle"
          onPointerDown={(e) => e.stopPropagation()}
          className="resize-none border border-amber bg-kagit p-1 text-kagit-metin outline-none"
          style={textOverlayStyle}
          value={editingText.value}
          onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
          onBlur={() => {
            projectActions.updateObject(doc, panel.id, editingText.id, { text: editingText.value });
            setEditingText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
        />
      )}

      <PlaybackOverlay width={frame.width * ui.zoom} height={frame.height * ui.zoom} />

      {/* Alt çubuk senaryo sayfasınınkiyle AYNI: solda ölçü (Courier),
          sağda yakınlaştırma. İki yüzeyin durum bilgisi aynı yerde ve aynı
          dilde duruyor; önce serbest yüzen iki kutuydu. */}
      <div className="absolute inset-x-0 bottom-0 flex h-[34px] items-center border-t border-kenar bg-panel text-[11px] text-metin-zayif">
        <span className="mzn-sayi flex items-center gap-3 px-3.5">
          {/* Sayının kendisi güçlü, birimi zayıf — senaryo sayaçlarıyla
              aynı hiyerarşi. Hepsi tek tonda olduğunda hiçbiri okunmuyordu. */}
          <span data-testid="tuval-olcu">
            <b className="font-normal text-metin-guclu">{frame.width}×{frame.height}</b>
          </span>
          <span data-testid="tuval-obje">
            <b className="font-normal text-metin-guclu">{panel.objects.length}</b> {t('obje')}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-0.5 border-l border-kenar-ic px-3">
          <button
            type="button" data-testid="tuval-sigdir" onClick={fit}
            className="mzn-denetim px-2 py-0.5 text-[11px]"
          >
            {t('Sığdır')}
          </button>
          <span className="mzn-sayi min-w-[38px] px-1 text-center text-metin-guclu">
            %{Math.round(ui.zoom * 100)}
          </span>
        </span>
      </div>
      {!editable && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 bg-amber px-3 py-1 text-xs font-medium text-kagit-metin">
          {t('Salt okunur — bu rolde ana katman düzenlenemez')}
        </div>
      )}
    </div>
  );
}

function cursorFor(tool: string): string {
  switch (tool) {
    case 'pen': case 'brush': return 'crosshair';
    case 'eraser': return 'cell';
    case 'text': return 'text';
    case 'eyedropper': return 'copy';
    default: return 'default';
  }
}
