import React, { useMemo, useState } from 'react';
import { t } from '../../dil/arayuz';
import { useUiStore, type LibraryTab } from '../../store/ui';
import { useProjectStore, projectActions } from '../../store/project';
import { CAMERA_CATEGORIES, CAMERA_PRESETS, kameraAdi, searchCameraPresets } from '../../data/cameras';
import { PROPS, PROP_CATEGORIES, searchProps } from '../../data/props';
import { TEMPLATES, searchTemplates } from '../../data/templates';
import { setDragPayload } from '../dnd';
import { useImageDropHandler } from '../../hooks/useDropHandler';
import { panelSize } from '../../data/aspect';

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const TABS = (): { id: LibraryTab; label: string }[] => [
  { id: 'kameralar', label: t('Kamera Açıları') },
  { id: 'objeler', label: t('Objeler') },
  { id: 'sablonlar', label: t('Şablonlar') },
];

export function LibraryPanel() {
  const tab = useUiStore((s) => s.libraryTab);
  const search = useUiStore((s) => s.librarySearch);
  const category = useUiStore((s) => s.libraryCategory);
  const set = useUiStore((s) => s.set);

  const categories = useMemo(() => {
    switch (tab) {
      /* Etiket KULLANILDIĞI yerde sarılıyor: tablo belgenin değil arayüzün
         verisi ama Türkçe yazılmış tek kaynak ve öyle kalmalı (aynı kalıp
         `ROLE_LABELS` için de geçerli, bkz. i18n-veri-tablolari testi). */
      case 'kameralar': return CAMERA_CATEGORIES.map((c) => ({ id: c.id, label: t(c.label) }));
      case 'objeler': return PROP_CATEGORIES.map((c) => ({ id: c.id, label: t(c.label) }));
      case 'sablonlar':
        return [
          { id: 'diyalog', label: t('Diyalog') },
          { id: 'aksiyon', label: t('Aksiyon') },
          { id: 'kurulus', label: t('Kuruluş') },
          { id: 'duzen', label: t('Düzen') },
        ];
      default: return [];
    }
  }, [tab]);

  return (
    <div className="flex h-full flex-col bg-panel text-metin-guclu">
      {/* Sekmeler denetçininkiyle AYNI dil: alt amber çizgi. Altı dolu amber
          kutu, ekranda "tek dolu amber" kuralını altı kez çiğniyordu. */}
      <div className="flex shrink-0 overflow-x-auto border-b border-kenar-ic">
        {TABS().map((sekme) => (
          <button
            key={sekme.id}
            type="button"
            onClick={() => set('libraryTab', sekme.id)}
            className={
              'shrink-0 px-3 py-2 text-[12px] transition-colors ' +
              (tab === sekme.id
                ? 'border-b-2 border-amber bg-etkin text-metin'
                : 'border-b-2 border-transparent text-metin-zayif hover:text-metin-govde')
            }
          >
            {t(sekme.label)}
          </button>
        ))}
      </div>

      <div className="space-y-2 border-b border-kenar-ic p-2">
        <input
          type="search"
          value={search}
          onChange={(e) => set('librarySearch', e.target.value)}
          placeholder={t('Kütüphanede ara…')}
          className="mzn-denetim w-full px-2 py-1.5 text-[12px] outline-none placeholder:text-metin-cok-zayif focus:border-amber"
        />
        <div className="flex flex-wrap gap-1">
          <CategoryChip active={category === 'all'} onClick={() => set('libraryCategory', 'all')}>
            {t('Tümü')}
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              active={category === c.id}
              onClick={() => {
                set('libraryCategory', c.id);
              }}
            >
              {t(c.label)}
            </CategoryChip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'kameralar' && <CameraTab search={search} category={category} />}
        {tab === 'objeler' && <PropTab search={search} category={category} />}
        {tab === 'sablonlar' && <TemplateTab search={search} category={category} />}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-2 py-0.5 text-[11px] transition-colors ' +
        (active ? 'mzn-etkin' : 'mzn-denetim')
      }
    >
      {children}
    </button>
  );
}

/* --------------------------- Kamera açıları -------------------------- */

function CameraTab({ search, category }: { search: string; category: string }) {
  const results = useMemo(
    () => searchCameraPresets(search, category === 'all' ? 'all' : (category as any)),
    [search, category],
  );

  return (
    <div className="space-y-2">
      {CAMERA_CATEGORIES.filter((c) => category === 'all' || category === c.id).map((cat) => {
        const items = results.filter((r) => r.category === cat.id);
        if (!items.length) return null;
        return (
          <div key={cat.id}>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-metin-etiket">{t(cat.label)}</p>
            <div className="space-y-1.5">
              {items.map((preset) => (
                <div
                  key={preset.id}
                  draggable
                  onDragStart={(e) => setDragPayload(e, { type: 'camera', presetId: preset.id })}
                  title={preset.description}
                  className="cursor-grab border border-kenar-denetim bg-etkin/60 p-2 transition hover:border-amber"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-metin">{kameraAdi(preset)}</span>
                    <span className="bg-denetim px-1.5 py-0.5 text-[10px] text-amber">
                      {preset.short}
                    </span>
                  </div>
                  <p className="text-[10px] text-metin-etiket">{preset.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-metin-zayif">{preset.description}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!results.length && <EmptyState />}
    </div>
  );
}

/* ------------------------------ Objeler ----------------------------- */

function PropTab({ search, category }: { search: string; category: string }) {
  const results = useMemo(
    () => searchProps(search, category === 'all' ? 'all' : (category as any)),
    [search, category],
  );

  return (
    <>
      <ImageImportButton />
      <div className="grid grid-cols-3 gap-2">
        {results.map((prop) => (
          <div
            key={prop.id}
            draggable
            onDragStart={(e) => setDragPayload(e, { type: 'prop', propId: prop.id })}
            title={t(prop.name)}
            className="cursor-grab border border-kenar-denetim bg-etkin/60 p-1 transition hover:border-amber"
          >
            <svg viewBox="0 0 100 100" className="mx-auto h-16 w-full">
              <path d={prop.path} fill="none" stroke="#cbd5e1" strokeWidth={3} strokeLinejoin="round" />
            </svg>
            <p className="truncate text-center text-[10px] text-metin-zayif">{t(prop.name)}</p>
          </div>
        ))}
      </div>
      {!results.length && <EmptyState />}
    </>
  );
}

function TemplateTab({ search, category }: { search: string; category: string }) {
  const results = useMemo(() => searchTemplates(search, category), [search, category]);
  return (
    <div className="space-y-1.5">
      {results.map((sonuc) => (
        <div
          key={sonuc.id}
          draggable
          onDragStart={(e) => setDragPayload(e, { type: 'template', templateId: sonuc.id })}
          className="cursor-grab border border-kenar-denetim bg-etkin/60 p-2 transition hover:border-amber"
        >
          <p className="text-xs font-semibold text-metin">{t(sonuc.name)}</p>
          <p className="mt-0.5 text-[10px] text-metin-zayif">{t(sonuc.description)}</p>
        </div>
      ))}
      {!results.length && <EmptyState />}
      <p className="pt-2 text-[10px] text-metin-etiket">
        Toplam {TEMPLATES.length} şablon · {CAMERA_PRESETS.length} kamera preseti ·{' '}
        {PROPS.length} obje
      </p>
    </div>
  );
}

/**
 * Görsel içe aktarma — dosya panele gömülür ve `.sbp` içindeki `assets/`
 * klasörüne kaydedilir. Görseller canvas'a doğrudan da sürüklenebilir.
 */
function ImageImportButton() {
  const panel = useProjectStore((s) => s.activePanel());
  const activeLayerId = useUiStore((s) => s.activeLayerId);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const layerId = useMemo(() => {
    if (!panel) return '';
    const explicit = panel.layers.find((l) => l.id === activeLayerId && !l.locked && l.visible);
    if (explicit) return explicit.id;
    const drawable = panel.layers.filter((l) => !l.locked && l.visible);
    return drawable[drawable.length - 1]?.id ?? panel.layers[0]?.id ?? '';
  }, [panel, activeLayerId]);

  const importImages = useImageDropHandler(panel ?? ({ id: '', layers: [], guides: { aspect: '16:9' } } as any), layerId);

  if (!panel) return null;
  const frame = panelSize(panel.guides.aspect);

  return (
    <div className="mb-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void importImages(e.target.files, { x: frame.width / 2, y: frame.height / 2 });
          }
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border border-dashed border-kenar-denetim bg-etkin/50 px-2 py-2 text-xs text-metin-govde transition hover:border-amber hover:text-metin"
      >
        {t('Görsel ekle (ya da canvas\'a sürükleyin)')}
      </button>
    </div>
  );
}

function EmptyState() {
  return <p className="py-6 text-center text-xs text-metin-etiket">{t('Sonuç bulunamadı.')}</p>;
}
