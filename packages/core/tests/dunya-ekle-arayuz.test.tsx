// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DunyalarSekmesi } from '@storyboard/core/components/inspector/DunyalarSekmesi';
import { useProjectStore } from '@storyboard/core/store/project';
import { createProject } from '@storyboard/core/model/factory';

it('dünya adı uygulamanın kendi penceresinden girilir ve kaydedilir', () => {
  useProjectStore.getState().replaceProject(createProject());
  useProjectStore.getState().setRole('owner');
  const prompt = vi.spyOn(window, 'prompt');
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  try {
    act(() => { root.render(<DunyalarSekmesi />); });
    act(() => { (host.querySelector('[data-testid="dunya-ekle"]') as HTMLElement).click(); });
    const input = document.querySelector('input[aria-label="Dünya adı"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'QA Evreni');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(Object.values(useProjectStore.getState().dunyalar).map(d => d.ad)).toContain('QA Evreni');
    expect(prompt).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); host.remove(); prompt.mockRestore(); }
});
