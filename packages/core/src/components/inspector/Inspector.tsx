import { REHBER_OPAKLIK, REHBER_RENK, TRANSITIONS } from '../../model/types';
import React, { useEffect, useMemo, useRef } from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import { useUiStore } from '../../store/ui';
import type {
  Panel,
  SBObject,
  CameraOverlayObject,
} from '../../model/types';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import type { FrameGuideSettings } from '../../model/types';
import { LayersPanel } from './LayersPanel';
import { PaintPanel } from './PaintPanel';
import { CameraInspector } from './CameraInspector';
import { ScriptNavigator } from '../script/ScriptNavigator';
import { YazimSekmesi } from './YazimSekmesi';
import { YerImleriCekmecesi } from '../script/YerImleriCekmecesi';
import { AnalizPanosu } from '../script/AnalizPanosu';
import { YapiPanosu } from '../script/YapiPanosu';
import { KadroSekmesi } from './KadroSekmesi';
import { BreakdownSekmesi } from './BreakdownSekmesi';
import { DunyalarSekmesi } from './DunyalarSekmesi';
import { CopKutusuSekmesi } from './CopKutusuSekmesi';
import {
  CheckField,
  ColorField,
  NumberField,
  Row,
  Section,
  SelectField,
  SliderField,
  TextField,
} from './Fields';
import { ASPECT_RATIOS } from '../../data/aspect';
import { uid } from '../../util/id';
import { Ikon, type IkonAdi } from '../Ikon';
import { SEKME_ADLARI, SEKME_GRUPLARI, sekmeGrubu } from '../../model/denetci-sekme';
import { moduDegistir } from '../../store/mod';
const MapInspector = React.lazy(() => import('../map/MapInspector').then((module) => ({ default: module.MapInspector })));

export function Inspector({ panel, editable }: { panel: Panel; editable: boolean }) {
  const viewMode = useUiStore((s) => s.viewMode);
  const focus = useUiStore((s) => s.odakModu);
  if (viewMode === 'sunum' || (viewMode === 'senaryo' && focus)) return null;
  if (viewMode === 'board') return <StoryboardInspector panel={panel} editable={editable} />;
  if (viewMode === 'grid') return <CardsInspector panel={panel} editable={editable} />;
  if (viewMode === 'harita') return <React.Suspense fallback={<div className="h-full bg-panel" />}><MapInspector /></React.Suspense>;
  return <ScreenplayInspector />;
}

function ScreenplayInspector() {
  const sekme = useUiStore((s) => s.inspectorTab);
  /* Kancalar erken `return`'lerden ÖNCE. Bunu aşağıya koymuştum ve
     'imler'/'yazim' sekmelerinde hiç çağrılmıyordu — kanca sırası
     renderdan rendera değişiyor, React'in kuralı bu. Testler yakaladı. */
  const ikiSutunBelge = Boolean(
    (dokumanTipi(useProjectStore((s) => s.project.meta.dokumanTipi))
      ?? DOKUMAN_TIPLERI.senaryo).ikiSutun,
  );

  /* Sekme şeridi YALNIZ senaryo bağlamında görünür: panoda çizim yaparken
     "Yazım" sekmesi ölü bir seçenektir ve sahne denetçisini bir tık uzağa
     iter. */
  const grup = sekmeGrubu(sekme);
  const sekmeler = (
    <div className="shrink-0">
      <div data-testid="denetci-sekmeleri" className="flex border-b border-kenar-ic">
        {SEKME_GRUPLARI.map((g) => (
          <button
            key={g.id}
            type="button"
            data-testid={`sekme-${g.id}`}
            /* Gruba tıklamak İLK ÜYESİNİ açıyor: grubun kendisinin içeriği
               yok, üyelerinin var. */
            onClick={() => useUiStore.setState({ inspectorTab: g.uyeler[0] })}
            aria-current={grup.id === g.id}
            className={
              'flex flex-1 flex-col items-center gap-1 px-2 py-2 text-[12px] transition-colors ' +
              (grup.id === g.id
                ? 'border-b-2 border-amber bg-etkin text-metin'
                : 'text-metin-zayif hover:text-metin-guclu')
            }
          >
            {/* İKON + ETİKET, ikon TEK BAŞINA değil: dokuz bölümün adı
                tahmin edilebilir simgelere oturmuyor ("Yapı" ile "Yapım"
                aynı ikonu çağrıştırıyor). İkon tanımayı hızlandırır,
                etiket anlamı taşır. */}
            <Ikon ad={g.ikon as IkonAdi} boyut={15} />
            {t(g.ad)}
          </button>
        ))}
      </div>
      {grup.uyeler.length > 1 && (
        /* ALT ŞERİT yalnız çok üyeli grupta. Tek üyeli grubun altına boş
           bir şerit koymak, kullanıcıya olmayan bir seçim vaat ederdi. */
        <div data-testid="denetci-alt-sekmeleri" className="flex gap-1 border-b border-kenar-ic px-2 py-1">
          {grup.uyeler.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`sekme-${id}`}
              onClick={() => useUiStore.setState({ inspectorTab: id })}
              aria-current={sekme === id}
              className={
                'rounded-sm px-2 py-1 text-[11.5px] transition-colors ' +
                (sekme === id
                  ? 'bg-amber-zemin text-amber'
                  : 'text-metin-zayif hover:bg-etkin hover:text-metin-guclu')
              }
            >
              {t(SEKME_ADLARI[id])}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (sekme === 'yazim') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <YazimSekmesi />
        </div>
      </div>
    );
  }

  if (sekme === 'imler') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <YerImleriCekmecesi />
      </div>
    );
  }

  if (sekme === 'analiz') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <AnalizPanosu />
      </div>
    );
  }

  if (sekme === 'yapi') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <YapiPanosu />
      </div>
    );
  }

  if (sekme === 'kadro') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <KadroSekmesi />
      </div>
    );
  }

  if (sekme === 'dokum') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <BreakdownSekmesi />
      </div>
    );
  }

  if (sekme === 'dunya') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <DunyalarSekmesi />
      </div>
    );
  }

  if (sekme === 'cop') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
        {sekmeler}
        <CopKutusuSekmesi />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-panel text-metin-govde">
      {sekmeler}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {!ikiSutunBelge && <ScriptNavigator />}
      </div>
    </div>
  );
}

function CardsInspector({ panel, editable }: { panel: Panel; editable: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const update = (patch: Record<string, unknown>) => {
    if (editable) projectActions.updatePanelMeta(doc, panel.id, patch);
  };
  return (
    <div data-testid="cards-inspector" className="flex h-full flex-col overflow-y-auto bg-panel p-3 text-metin-govde">
      {!activePanelId ? <p className="text-xs text-metin-zayif">{t('Seçili kart yok')}</p> : (
        <Section title={t('Kart Bilgisi')}>
          <Row label={t('Sahne')}><TextField value={panel.meta.scene} disabled={!editable} onChange={(scene) => update({ scene })} /></Row>
          <Row label={t('Çekim')}><TextField value={panel.meta.shot} disabled={!editable} onChange={(shot) => update({ shot })} /></Row>
          <Row label={t('Süre')}><NumberField value={panel.meta.duration} min={0.1} step={0.1} disabled={!editable} onChange={(duration) => update({ duration })} suffix={t('sn')} /></Row>
          <p className="py-1 text-[11px] text-metin-zayif">{panel.scriptRefs.length === 1 ? t('1 senaryo satırı') : tf('%d senaryo satırı', panel.scriptRefs.length)}</p>
          <button data-testid="cards-open-board" type="button" onClick={() => moduDegistir('board')}
            className="mzn-denetim mt-2 w-full px-2 py-1.5 text-xs text-metin-guclu">
            {t('Çizimi aç')}
          </button>
        </Section>
      )}
    </div>
  );
}

function StoryboardInspector({ panel, editable }: { panel: Panel; editable: boolean }) {
  const selection = useUiStore((s) => s.selection);
  const activeLayerId = useUiStore((s) => s.activeLayerId);
  const strokeColor = useUiStore((s) => s.strokeColor);
  const strokeWidth = useUiStore((s) => s.strokeWidth);
  const panoSekmesi = useUiStore((s) => s.panoSekmesi);
  const openedObjectProperties = useRef(false);
  const selected = useMemo(() => panel.objects.filter((object) => selection.includes(object.id)), [panel.objects, selection]);
  const activeLayer = panel.layers.find((layer) => layer.id === activeLayerId) ?? panel.layers.find((layer) => !layer.locked && layer.visible);

  useEffect(() => {
    if (selected.length && !openedObjectProperties.current) {
      openedObjectProperties.current = true;
      useUiStore.setState({ panoSekmesi: 'ozellik' });
    }
  }, [selected.length]);

  const tabs = [
    ['katman', t('Katmanlar')], ['boya', t('Boya')],
    ['ozellik', t('Özellikler')], ['rehber', t('Rehberler')],
  ] as const;

  return (
    <div data-testid="storyboard-inspector" className="flex h-full min-w-0 flex-col overflow-hidden bg-panel text-metin-govde">
      <div data-testid="storyboard-cue" className="flex min-w-0 items-center gap-2 border-b border-kenar-ic px-3 py-2 text-[11px]">
        <span className="h-4 w-4 shrink-0 rounded-sm border border-kenar-denetim" style={{ backgroundColor: strokeColor }} aria-hidden />
        <span className="min-w-0 truncate font-medium text-metin-guclu">{activeLayer ? t(activeLayer.name) : t('Katman yok')}</span>
        <span className="ml-auto shrink-0 text-metin-zayif">{strokeWidth}px</span>
      </div>
      <div data-testid="pano-sekmeleri" className="flex shrink-0 border-b border-kenar-ic">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" data-testid={`pano-sekme-${id}`}
            aria-current={panoSekmesi === id}
            onClick={() => { openedObjectProperties.current = true; useUiStore.setState({ panoSekmesi: id }); }}
            className={'min-w-0 flex-1 px-1 py-2 text-[11px] transition-colors ' +
              (panoSekmesi === id ? 'border-b-2 border-amber bg-etkin text-metin' : 'text-metin-zayif hover:text-metin-guclu')}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {panoSekmesi === 'katman' && <LayersPanel panel={panel} editable={editable} />}
        {panoSekmesi === 'boya' && <PaintPanel editable={editable} />}
        {panoSekmesi === 'ozellik' && (
          <>
            {selected.length > 0 && <ObjectSection panel={panel} objects={selected} editable={editable} />}
            {selected.length === 1 && selected[0].kind === 'cameraOverlay' && (
              <CameraInspector panel={panel} object={selected[0] as CameraOverlayObject} editable={editable} />
            )}
            <PanelMetaSection panel={panel} editable={editable} />
          </>
        )}
        {panoSekmesi === 'rehber' && <GuidesSection panel={panel} editable={editable} />}
      </div>
    </div>
  );
}

/* --------------------------- panel meta --------------------------- */

function PanelMetaSection({ panel, editable }: { panel: Panel; editable: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const upd = (patch: Record<string, unknown>) => projectActions.updatePanelMeta(doc, panel.id, patch);

  return (
    <Section title={t('Panel Bilgisi')}>
      <div className="grid grid-cols-2 gap-2">
        <Row label={t('Sahne')}>
          <TextField value={panel.meta.scene} disabled={!editable} onChange={(v) => upd({ scene: v })} />
        </Row>
        <Row label={t('Çekim')}>
          <TextField value={panel.meta.shot} disabled={!editable} onChange={(v) => upd({ shot: v })} />
        </Row>
      </div>
      <Row label={t('Süre')}>
        <NumberField
          value={panel.meta.duration}
          step={0.1}
          min={0.1}
          disabled={!editable}
          suffix={t('sn')}
          onChange={(v) => upd({ duration: Math.max(0.1, v) })}
        />
      </Row>
      <Row label={t('Kamera')}>
        <TextField
          value={panel.meta.cameraLabel}
          disabled={!editable}
          placeholder={t('Preset seçilince dolar')}
          onChange={(v) => upd({ cameraLabel: v })}
        />
      </Row>
      <Row label={t('Diyalog')}>
        <TextField
          value={panel.meta.dialogue}
          multiline
          disabled={!editable}
          placeholder={t('Replik…')}
          onChange={(v) => upd({ dialogue: v })}
        />
      </Row>
      <Row label={t('Aksiyon')}>
        <TextField
          value={panel.meta.action}
          multiline
          disabled={!editable}
          placeholder={t('Sahnede ne oluyor?')}
          onChange={(v) => upd({ action: v })}
        />
      </Row>
      <Row label={t('Ses / Efekt')}>
        <TextField
          value={panel.meta.sound}
          disabled={!editable}
          placeholder={t('SFX, müzik…')}
          onChange={(v) => upd({ sound: v })}
        />
      </Row>
      <Row label={t('Geçiş')}>
        <SelectField
          value={panel.transition}
          disabled={!editable}
          options={TRANSITIONS.map((x) => ({ value: x.value, label: t(x.label) }))}
          onChange={(v) => projectActions.updatePanel(doc, panel.id, { transition: v })}
        />
      </Row>
      {panel.transition !== 'cut' && (
        <Row label={t('Geçiş süresi')}>
          <NumberField
            value={panel.transitionDuration}
            step={0.1}
            min={0}
            suffix={t('sn')}
            disabled={!editable}
            onChange={(v) => projectActions.updatePanel(doc, panel.id, { transitionDuration: Math.max(0, v) })}
          />
        </Row>
      )}
      <Row label={t('Zemin')}>
        <ColorField
          value={panel.background}
          disabled={!editable}
          onChange={(v) => projectActions.updatePanel(doc, panel.id, { background: v })}
        />
      </Row>
    </Section>
  );
}

/* ------------------------- çerçeve rehberi ------------------------- */

/**
 * Kompozisyon kuralları — TEK liste.
 *
 * Arayüz bu tablodan çiziliyor, elle yazılmış beş satırdan değil: yeni bir
 * kural eklendiğinde çizim ve denetim ayrı ayrı güncellenmek zorunda
 * kalmıyor (Karar 2).
 */
/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const KOMPOZISYON = () => [
  { anahtar: 'thirds', ad: t('Üçler kuralı') },
  { anahtar: 'altinOran', ad: t('Altın oran') },
  { anahtar: 'altinSpiral', ad: t('Altın spiral') },
  { anahtar: 'capraz', ad: t('Çapraz yöntem') },
  { anahtar: 'harmonik', ad: t('Harmonik üçgen') },
  { anahtar: 'simetri', ad: 'Simetri ekseni' },
  { anahtar: 'centerCross', ad: t('Merkez çapraz') },
] as const satisfies readonly { anahtar: keyof FrameGuideSettings; ad: string }[];

function GuidesSection({ panel, editable }: { panel: Panel; editable: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const upd = (patch: Record<string, unknown>) => projectActions.updatePanelGuides(doc, panel.id, patch);

  return (
    <Section title={t('Çerçeve Rehberi')}>
      <Row label={t('En-boy')}>
        <SelectField
          value={panel.guides.aspect}
          disabled={!editable}
          options={ASPECT_RATIOS.map((a) => ({ value: a.id, label: `${a.label} — ${t(a.note)}` }))}
          onChange={(v) => upd({ aspect: v })}
        />
      </Row>
      {/* Rehberler TEK anahtarın arkasında. Beş kutucuk hep açık dururken
          hiçbiri okunmuyordu; üstelik dördü, birincisi (`enabled`) kapalıyken
          zaten hiçbir şey yapmıyordu — yani ekranda çalışmayan dört denetim
          duruyordu. Ana anahtar kapalıyken ayrıntı hiç çizilmiyor. */}
      <Row label={t('Rehberler')}>
        <CheckField
          label={panel.guides.enabled ? t('Açık') : t('Kapalı')}
          checked={panel.guides.enabled}
          disabled={!editable}
          onChange={(v) => upd({ enabled: v })}
        />
      </Row>
      {panel.guides.enabled && (
        <div className="space-y-2 border-l border-kenar-ic pl-2.5 pt-1">
          {/* Kompozisyon kuralları — üçler kuralı bunlardan yalnız biri. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {KOMPOZISYON().map((k) => (
              <CheckField
                key={k.anahtar}
                label={k.ad}
                checked={Boolean(panel.guides[k.anahtar])}
                disabled={!editable}
                onChange={(v) => upd({ [k.anahtar]: v })}
              />
            ))}
          </div>

          {/* Güvenli alanlar AYRI: bunlar kompozisyon değil, yayın kuralı.
              Aynı listeye karıştırmak iki farklı işi tek liste gibi
              gösterirdi. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-kenar-ic pt-1.5">
            <CheckField label={t('Aksiyon güvenli')} checked={panel.guides.actionSafe} disabled={!editable} onChange={(v) => upd({ actionSafe: v })} />
            <CheckField label={t('Başlık güvenli')} checked={panel.guides.titleSafe} disabled={!editable} onChange={(v) => upd({ titleSafe: v })} />
          </div>

          {/* Renk ve opaklık HEPSİNE birden. Açık bir karede açık mavi
              rehber görünmez; kullanıcı çizimine göre ayarlayabilmeli. */}
          <div className="border-t border-kenar-ic pt-1.5">
            <Row label={t('Renk')}>
              <ColorField
                value={panel.guides.renk ?? REHBER_RENK}
                disabled={!editable}
                onChange={(v) => upd({ renk: v })}
              />
            </Row>
            <Row label={t('Opaklık')}>
              <SliderField
                value={panel.guides.opaklik ?? REHBER_OPAKLIK}
                min={0.1}
                max={1}
                step={0.05}
                disabled={!editable}
                format={(v) => `%${Math.round(v * 100)}`}
                onChange={(v) => upd({ opaklik: v })}
              />
            </Row>
          </div>
        </div>
      )}
    </Section>
  );
}

/* --------------------------- obje özellikleri --------------------------- */

function ObjectSection({
  panel,
  objects,
  editable,
}: {
  panel: Panel;
  objects: SBObject[];
  editable: boolean;
}) {
  const doc = useProjectStore((s) => s.doc);
  const first = objects[0];
  const many = objects.length > 1;
  const ids = objects.map((o) => o.id);

  const patch = (p: Record<string, unknown>) => {
    if (many) projectActions.updateObjects(doc, panel.id, ids, () => p);
    else projectActions.updateObject(doc, panel.id, first.id, p);
  };

  return (
    <Section title={many ? `Seçim (${objects.length} obje)` : `Obje — ${first.name || first.kind}`}>
      <div className="grid grid-cols-2 gap-2">
        <Row label="X">
          <NumberField value={first.x} disabled={!editable} onChange={(v) => patch({ x: v })} />
        </Row>
        <Row label="Y">
          <NumberField value={first.y} disabled={!editable} onChange={(v) => patch({ y: v })} />
        </Row>
        <Row label={t('Ölçek X')}>
          <NumberField value={first.scaleX} step={0.05} disabled={!editable} onChange={(v) => patch({ scaleX: v })} />
        </Row>
        <Row label={t('Ölçek Y')}>
          <NumberField value={first.scaleY} step={0.05} disabled={!editable} onChange={(v) => patch({ scaleY: v })} />
        </Row>
      </div>
      <Row label={t('Döndürme')}>
        <SliderField
          value={first.rotation}
          min={-180}
          max={180}
          step={1}
          disabled={!editable}
          onChange={(v) => patch({ rotation: v })}
          format={(v) => `${Math.round(v)}°`}
        />
      </Row>
      <Row label={t('Opaklık')}>
        <SliderField
          value={first.opacity}
          min={0}
          max={1}
          disabled={!editable}
          onChange={(v) => patch({ opacity: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Row>
      <Row label={t('Katman')}>
        <SelectField
          value={first.layerId}
          disabled={!editable}
          options={panel.layers.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(v) => patch({ layerId: v })}
        />
      </Row>
      <div className="flex flex-wrap gap-1 pt-1">
        <CheckField label={t('Kilitli')} checked={first.locked} disabled={!editable} onChange={(v) => patch({ locked: v })} />
        <CheckField label={t('Görünür')} checked={first.visible} disabled={!editable} onChange={(v) => patch({ visible: v })} />
      </div>
      <div className="grid grid-cols-4 gap-1 pt-1">
        {(['front', 'forward', 'backward', 'back'] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            disabled={!editable}
            onClick={() => ids.forEach((id) => projectActions.reorderObject(doc, panel.id, id, dir))}
            className="bg-denetim px-1 py-1 text-[10px] text-metin-govde hover:bg-denetim disabled:opacity-40"
          >
            {{ front: t('En öne'), forward: t('Öne'), backward: 'Arkaya', back: 'En arkaya' }[dir]}
          </button>
        ))}
      </div>
    </Section>
  );
}
