export type DropPayload =
  | { type: 'camera'; presetId: string }
  | { type: 'prop'; propId: string }
  | { type: 'template'; templateId: string }
  /** Senaryo satırları — bir panele bırakılınca o panele bağlanır. */
  | { type: 'script'; blockIds: string[] };

export const DND_MIME = 'application/x-storyboard-item';

export function setDragPayload(e: React.DragEvent, payload: DropPayload) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

export function readDragPayload(e: React.DragEvent): DropPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.type === 'string' ? (parsed as DropPayload) : null;
  } catch {
    return null;
  }
}
