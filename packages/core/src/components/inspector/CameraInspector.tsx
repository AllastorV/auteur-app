import React from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import type { CameraOverlayObject, Panel } from '../../model/types';
import { CheckField, ColorField, Row, Section, SelectField, SliderField } from './Fields';
import { CAMERA_PRESETS, cameraLabel, getCameraPreset, kameraAdi } from '../../data/cameras';

/**
 * Kamera preseti seçildikten sonra serbest ayar.
 * Değerler sahnedeki 3D mankenlerin kamerasıyla senkronlanabilir.
 */
export function CameraInspector({
  panel,
  object,
  editable,
}: {
  panel: Panel;
  object: CameraOverlayObject;
  editable: boolean;
}) {
  const doc = useProjectStore((s) => s.doc);
  const preset = getCameraPreset(object.presetId);
  const patch = (p: Record<string, unknown>) => projectActions.updateObject(doc, panel.id, object.id, p);

  const [fov, setFov] = React.useState(preset?.fov ?? 45);
  const [height, setHeight] = React.useState(preset?.cameraHeight ?? 1.6);
  const [distance, setDistance] = React.useState(preset?.distance ?? 3.5);
  const [tilt, setTilt] = React.useState(preset?.tilt ?? 0);
  const [roll, setRoll] = React.useState(preset?.roll ?? 0);

  React.useEffect(() => {
    if (!preset) return;
    setFov(preset.fov);
    setHeight(preset.cameraHeight);
    setDistance(preset.distance);
    setTilt(preset.tilt);
    setRoll(preset.roll);
  }, [preset?.id]);


  return (
    <Section title={t('Kamera Açısı')}>
      <Row label={t('Preset')}>
        <SelectField
          value={object.presetId}
          disabled={!editable}
          options={CAMERA_PRESETS.map((c) => ({ value: c.id, label: `${c.short} — ${kameraAdi(c)}` }))}
          onChange={(v) => {
            const p = getCameraPreset(v);
            if (!p) return;
            patch({ presetId: v, label: cameraLabel(p), showArrow: p.category === 'hareket' });
            projectActions.updatePanelMeta(doc, panel.id, { cameraLabel: cameraLabel(p) });
          }}
        />
      </Row>
      {preset && <p className="pb-1 text-[10px] text-metin-zayif">{preset.description}</p>}
      <Row label={t('Renk')}>
        <ColorField value={object.color} disabled={!editable} onChange={(v) => patch({ color: v })} />
      </Row>
      <CheckField
        label={t('Hareket okunu göster')}
        checked={object.showArrow}
        disabled={!editable}
        onChange={(v) => patch({ showArrow: v })}
      />

      <div className="mt-2 space-y-1 border border-kenar-ic bg-denetim/40 p-2">
        <p className="text-[10px] uppercase tracking-wide text-metin-etiket">Serbest ayar</p>
        <Row label="FOV">
          <SliderField value={fov} min={10} max={110} step={1} disabled={!editable}
            onChange={(v) => { setFov(v); }} format={(v) => `${Math.round(v)}°`} />
        </Row>
        <Row label={t('Yükseklik')}>
          <SliderField value={height} min={0} max={12} step={0.05} disabled={!editable}
            onChange={(v) => { setHeight(v); }} format={(v) => `${v.toFixed(2)}m`} />
        </Row>
        <Row label={t('Mesafe')}>
          <SliderField value={distance} min={0.3} max={40} step={0.1} disabled={!editable}
            onChange={(v) => { setDistance(v); }} format={(v) => `${v.toFixed(1)}m`} />
        </Row>
        <Row label={t('Eğim')}>
          <SliderField value={tilt} min={-90} max={90} step={1} disabled={!editable}
            onChange={(v) => { setTilt(v); }} format={(v) => `${Math.round(v)}°`} />
        </Row>
        <Row label="Dutch">
          <SliderField value={roll} min={-45} max={45} step={1} disabled={!editable}
            onChange={(v) => { setRoll(v); }} format={(v) => `${Math.round(v)}°`} />
        </Row>
      </div>
    </Section>
  );
}
