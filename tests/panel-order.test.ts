import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDoc, docToProject, panelsArray } from '../packages/core/src/doc/schema';
import { createPanel, createProject } from '../packages/core/src/model/factory';
import { LOCAL_ORIGIN, addPanel, duplicatePanel, movePanel, updatePanelMeta } from '../packages/core/src/doc/mutations';
import { insertionIndex } from '../packages/core/src/model/panel-order';
import { protectedProjection } from '../packages/core/src/model/projection';

const fixture = () => createProject({ panels: ['a', 'b', 'c', 'd']
  .map((id) => createPanel({ id, meta: { scene: id }, scriptRefs: [`script-${id}`] })) });
const ids = (doc: Y.Doc) => docToProject(doc).panels.map((p) => p.id);

describe('stable panel ordering', () => {
  it('inserts and duplicates at displayed positions after a move', () => {
    const doc = createDoc(fixture());
    movePanel(doc, 'd', 1);
    const inserted = addPanel(doc, 2);
    expect(ids(doc)).toEqual(['a', 'd', inserted, 'b', 'c']);
    const duplicate = duplicatePanel(doc, 'd');
    expect(duplicate).not.toBeNull();
    expect(ids(doc)).toEqual(['a', 'd', duplicate, inserted, 'b', 'c']);
  });

  it('panel order is protected against comment-only roles', () => {
    const doc = createDoc(fixture());
    const before = protectedProjection(doc);
    movePanel(doc, 'd', 0);
    expect(protectedProjection(doc)).not.toBe(before);
  });
  it('inserts at beginning, middle and end using visible gaps without moving hidden peers', () => {
    expect(insertionIndex(['a', 'b', 'c', 'd'], ['a', 'c'], 'c', 0)).toBe(0);
    expect(insertionIndex(['a', 'b', 'c', 'd'], ['a', 'c'], 'c', 1)).toBe(1);
    expect(insertionIndex(['a', 'b', 'c', 'd'], ['a', 'c'], 'a', 1)).toBe(1);
    expect(insertionIndex(['a', 'b', 'c', 'd'], ['a', 'c'], 'a', 2)).toBe(2);
    const doc = createDoc(fixture());
    movePanel(doc, 'c', insertionIndex(ids(doc), ['a', 'c'], 'c', 0));
    expect(ids(doc)).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(doc).filter((id) => !['a', 'c'].includes(id))).toEqual(['b', 'd']);
  });

  it('moves the same Yjs panel map, retaining concurrent metadata edits and script refs', () => {
    const project = fixture();
    const a = createDoc(project);
    const map = panelsArray(a).toArray().find((p) => p.get('id') === 'c');
    movePanel(a, 'c', 0);
    expect(panelsArray(a).toArray().find((p) => p.get('id') === 'c')).toBe(map);
    expect(ids(a)).toEqual(['c', 'a', 'b', 'd']);
    updatePanelMeta(a, 'c', { action: 'New action' });
    expect(docToProject(a).panels[0].meta.action).toBe('New action');
    expect(docToProject(a).panels[0].scriptRefs).toEqual(['script-c']);
    const reopened = createDoc(docToProject(a));
    expect(ids(reopened)).toEqual(ids(a));
  });

  it('undoes, redoes and syncs a move without replacing panel content', () => {
    const a = createDoc(fixture());
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const undo = new Y.UndoManager(panelsArray(a), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    movePanel(a, 'd', 1);
    expect(ids(a)).toEqual(['a', 'd', 'b', 'c']);
    undo.undo();
    expect(ids(a)).toEqual(['a', 'b', 'c', 'd']);
    undo.redo();
    expect(ids(a)).toEqual(['a', 'd', 'b', 'c']);
    updatePanelMeta(b, 'd', { dialogue: 'Remote note' });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    expect(ids(b)).toEqual(['a', 'd', 'b', 'c']);
    expect(docToProject(b).panels[1].meta.dialogue).toBe('Remote note');
  });
});
