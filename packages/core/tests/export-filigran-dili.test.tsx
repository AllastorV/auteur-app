// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ExportDialog } from '@storyboard/core/components/dialogs/ExportDialog';
import { arayuzDiliniAyarla } from '@storyboard/core/dil/arayuz';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { PlatformProvider } from '@storyboard/core/platform/context';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import { useProjectStore } from '@storyboard/core/store/project';

vi.mock('@storyboard/core/export/renderPanel', () => ({
  renderPanelToDataURL: async () => 'data:image/png;base64,',
}));

afterEach(() => arayuzDiliniAyarla('tr'));

it('İngilizce PDF seçeneklerinde filigran anahtarı Watermark olarak görünür', () => {
  arayuzDiliniAyarla('en');
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    act(() => root.render(
      <PlatformProvider platform={{ kind: 'web', canSaveLocally: true, canExportVideo: false,
        veriGuvenligi: null, dil: null, baslangic: null,
        onExportProgress: () => () => {} } as unknown as PlatformAdapter}>
        <ExportDialog onClose={() => {}} />
      </PlatformProvider>,
    ));
    expect(host.querySelector('[data-testid="filigran-ac"]')?.closest('label')?.textContent)
      .toContain('Watermark');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
