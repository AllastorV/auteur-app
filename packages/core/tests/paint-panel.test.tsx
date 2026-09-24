// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaintPanel } from '../src/components/inspector/PaintPanel';
import { useUiStore } from '../src/store/ui';
import { createStroke } from '../src/model/objects';

let host: HTMLDivElement;
let root: Root;
const field = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | HTMLButtonElement | null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  useUiStore.setState({
    tool: 'pen', previousTool: null, strokeColor: '#111827', fillColor: '#00000000',
    strokeWidth: 4, brushSmoothing: 0.5, opacity: 1, recentColors: [],
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () => act(() => root.render(<PaintPanel editable />));
const change = (id: string, value: string) => act(() => {
  const input = field(id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

describe('Storyboard boya sekmesi', () => {
  it('kontur/dolgu seçicilerini ve saydam dolguyu ayrı tutar', () => {
    render();
    expect(field('paint-stroke-color')).toBeTruthy();
    expect(field('paint-fill-color')).toBeTruthy();
    act(() => field('paint-transparent-fill')!.click());
    expect(useUiStore.getState().fillColor).toBe('#00000000');
    expect(useUiStore.getState().strokeColor).toBe('#111827');
  });

  it('fırça yumuşatmasını yalnız fırçada, silgi boyutunu yalnız silgide gösterir', () => {
    render();
    expect(field('paint-smoothing')).toBeNull();
    act(() => useUiStore.setState({ tool: 'brush' }));
    expect(field('paint-smoothing')).toBeTruthy();
    act(() => useUiStore.setState({ tool: 'eraser' }));
    expect(field('paint-eraser-size')).toBeTruthy();
    expect(field('paint-smoothing')).toBeNull();
    expect(field('paint-fill-color')).toBeNull();
  });

  it('opaklığı yeni çizgiye kaydeder ve var olan çizgiyi geriye dönük değiştirmez', () => {
    render();
    const old = createStroke({ layerId: 'l1', x: 0, y: 0 }, { points: [0, 0, 1, 10, 10, 1], color: '#111827', width: 4 });
    change('paint-opacity', '40');
    expect(useUiStore.getState().opacity).toBe(0.4);
    const next = createStroke({ layerId: 'l1', x: 0, y: 0 }, { points: [0, 0, 1, 10, 10, 1], color: '#111827', width: 4, opacity: useUiStore.getState().opacity });
    expect(old.opacity).toBe(1);
    expect(next.opacity).toBe(0.4);
  });

  it('son renkleri geri çağırır ve damlalık önceki çizim aracını korur', () => {
    render();
    change('paint-stroke-color', '#ff0000');
    change('paint-stroke-color', '#00ff00');
    expect(useUiStore.getState().recentColors).toEqual(['#00ff00', '#ff0000']);
    act(() => field('paint-recent-1')!.click());
    expect(useUiStore.getState().strokeColor).toBe('#ff0000');
    act(() => field('paint-eyedropper')!.click());
    expect(useUiStore.getState().tool).toBe('eyedropper');
    expect(useUiStore.getState().previousTool).toBe('pen');
  });
});
