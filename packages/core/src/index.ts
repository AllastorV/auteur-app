/** Auteur — paylaşılan çekirdek (veri modeli + canvas + UI). */

/* Model */
export * from './model/types';
export * from './model/factory';
export * from './model/objects';
export * from './model/layers';
export * from './model/permissions';
export * from './model/projection';
export * from './model/project-io';
export { reconcileScript } from './model/reconcile';
export * from './model/script';
export * from './model/dokuman-tipi';
export { deriveScenes } from './model/scenes';
export * from './model/timeline';

/* Senaryo formatı */
export * from './format';

/* Veri kütüphaneleri */
export * from './data/aspect';
export * from './data/cameras';
export * from './data/props';
export * from './data/templates';

/* Doküman (Yjs) */
export * from './doc/schema';
export * as mutations from './doc/mutations';
export { LOCAL_ORIGIN } from './doc/mutations';

/* IK ve render */
export * from './render/cameraOverlay';
export * from './render/svgPath';

/* 3D */

/* Dışa aktarma */
export * from './export/animatic';
export * from './export/png';
export * from './export/renderPanel';

/* Durum */
export * from './store/project';
export * from './store/script';
export * from './store/ui';
export * from './store/collab';
export { ProjectSnapshot } from './store/snapshot';

/* Ortak çalışma */
export * from './collab/api';
export * from './collab/client';
export * from './collab/protocol';

/* Platform */
export * from './platform/types';
export * from './platform/context';

/* Bileşenler */
export { Studio, assetUrlsFrom } from './components/Studio';
export { Kitaplik } from './components/kitaplik/Kitaplik';
export { Toolbar } from './components/Toolbar';
export { CanvasStage } from './components/canvas/CanvasStage';
export { LibraryPanel } from './components/library/LibraryPanel';
export { ScriptNavigator } from './components/script/ScriptNavigator';
export { ScriptEditor } from './components/script/ScriptEditor';
export { Inspector } from './components/inspector/Inspector';
export { Timeline } from './components/timeline/Timeline';
export { PanelGrid } from './components/grid/PanelGrid';
export { PanelThumbnail } from './components/grid/PanelThumbnail';
export { Gallery } from './components/gallery/Gallery';
export { Presentation } from './components/presentation/Presentation';
export { Modal, Button } from './components/dialogs/Modal';
export { ExportDialog } from './components/dialogs/ExportDialog';
export { SessionDialog } from './components/dialogs/SessionDialog';
export { ShortcutsDialog } from './components/dialogs/ShortcutsDialog';
export { Toast } from './components/Toast';

/* Kancalar */
export * from './hooks/useShortcuts';
export * from './hooks/useAutosave';
export * from './hooks/useUnsavedGuard';
export * from './hooks/useAssetImage';

/* Yardımcılar */
export * from './util/id';
export * from './util/color';
export * from './util/assets';
export { t, tf, arayuzDili, type ArayuzDili } from './dil/arayuz';
