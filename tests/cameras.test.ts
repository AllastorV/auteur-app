import { describe, expect, it } from 'vitest';
import {
  CAMERA_PRESETS,
  cameraLabel,
  getCameraPreset,
  searchCameraPresets,
} from '@storyboard/core/data/cameras';
import { movementArrowPoints } from '@storyboard/core/render/cameraOverlay';
import { exportSize, fitBox, panelSize } from '@storyboard/core/data/aspect';

describe('Kamera preset kütüphanesi', () => {
  it('şartnamedeki tüm ölçek presetlerini içerir', () => {
    for (const id of ['els', 'ls', 'fs', 'mls', 'ms', 'mcu', 'cu', 'ecu']) {
      expect(getCameraPreset(id), id).toBeDefined();
    }
  });

  it('konum, açı ve hareket presetlerini içerir', () => {
    const required = [
      'ots', 'pov', 'two-shot', 'three-shot', 'insert',
      'low-angle', 'high-angle', 'birds-eye', 'worms-eye', 'dutch', 'eye-level',
      'pan-right', 'pan-left', 'tilt-up', 'tilt-down',
      'dolly-in', 'dolly-out', 'track', 'zoom-in', 'zoom-out',
      'crane-up', 'crane-down', 'handheld',
    ];
    for (const id of required) expect(getCameraPreset(id), id).toBeDefined();
  });

  it('preset kimlikleri benzersizdir', () => {
    const ids = CAMERA_PRESETS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('her presetin geçerli serbest ayar değerleri vardır', () => {
    for (const c of CAMERA_PRESETS) {
      expect(c.fov, c.id).toBeGreaterThan(5);
      expect(c.fov, c.id).toBeLessThan(130);
      expect(c.distance, c.id).toBeGreaterThan(0);
      expect(Math.abs(c.tilt), c.id).toBeLessThanOrEqual(90);
    }
  });

  it('hareket presetleri ok overlay üretir', () => {
    const movement = CAMERA_PRESETS.filter((c) => c.category === 'hareket');
    expect(movement.length).toBeGreaterThanOrEqual(7);
    for (const c of movement) {
      const arrow = movementArrowPoints(c.arrow, 1920, 1080);
      expect(arrow.segments.length + arrow.circles.length, c.id).toBeGreaterThan(0);
    }
  });

  it('etiket panel meta verisi için biçimlendirilir', () => {
    expect(cameraLabel(getCameraPreset('cu')!)).toBe('CU — Yakın Plan');
  });

  it('arama Türkçe ve İngilizce adlarla çalışır', () => {
    expect(searchCameraPresets('yakın').length).toBeGreaterThan(0);
    expect(searchCameraPresets('close').length).toBeGreaterThan(0);
    expect(searchCameraPresets('', 'aci').every((c) => c.category === 'aci')).toBe(true);
  });
});

describe('Çıktı çerçevesi sığdırma', () => {
  it('aynı oranda tam doldurur', () => {
    const f = fitBox(panelSize('16:9'), exportSize('16:9', '1080p'));
    expect(f.scale).toBeCloseTo(1, 5);
    expect(f.offsetX).toBeCloseTo(0, 5);
    expect(f.offsetY).toBeCloseTo(0, 5);
  });

  it('farklı oranlı paneli kırpmaz, letterbox uygular', () => {
    // 4:3 panel (1440×1080) 16:9 çıktıya (1920×1080) sığdırılır.
    const frame = panelSize('4:3');
    const target = exportSize('16:9', '1080p');
    const { scale, offsetX, offsetY } = fitBox(frame, target);

    expect(frame.width * scale).toBeLessThanOrEqual(target.width + 0.001);
    expect(frame.height * scale).toBeLessThanOrEqual(target.height + 0.001);
    expect(offsetX).toBeGreaterThan(0); // yanlarda boşluk
    expect(offsetY).toBeCloseTo(0, 5);
  });

  it('dikey paneli yatay çıktıda taşırmaz', () => {
    const frame = panelSize('9:16');
    const target = exportSize('16:9', '1080p');
    const { scale } = fitBox(frame, target);
    expect(frame.height * scale).toBeLessThanOrEqual(target.height + 0.001);
  });
});
