import React from 'react';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { PanelThumbnail } from '../grid/PanelThumbnail';
import { panelSize } from '../../data/aspect';
import { blogaGit } from '../../store/mod';
import { t } from '../../dil/arayuz';

/** Tasarımdaki küçük resim ölçüsü (DESIGN.md · Yerleşim). */
const KUCUK_EN = 148;

/**
 * Planlar şeridi — alt çubuktan açılır (B · Kesme Masası).
 *
 * ## Neden senaryo modunda storyboard görünüyor
 *
 * Yazar plan çizmiyor, ÇİZİLMİŞ planı görerek yazıyor: "bu sahnenin üç planı
 * var, dördüncüyü yazmaya değer mi?" Şerit bu soruyu cevaplıyor. Storyboard
 * moduna geçmek aynı cevabı verirdi ama yazının yerini kaybettirirdi.
 *
 * ## Tıklama NE YAPAR
 *
 * Panel aktif olur (mod değişince orada açılsın diye) ve plan bir senaryo
 * satırına bağlıysa imleç O SATIRA gider — yazar planın metnini bulur.
 * Mod DEĞİŞMEZ: şerit senaryodan çıkmak için değil, senaryoda gezinmek için.
 * Bağsız plan da tıklanabilir; sadece atlanacak satır yoktur, bu yüzden
 * `blogaGit` çağrılmaz — olmayan bir yere gitme numarası yapmıyoruz.
 *
 * Küçük resim `PanelThumbnail`'ın kendisi: grid ve zaman çizelgesiyle aynı
 * çizim, ikinci bir önizleme yolu yok (Karar 2).
 */
export function PlanSeridi() {
  const paneller = useProjectStore((s) => s.project.panels);
  const aktif = useProjectStore((s) => s.activePanelId);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);

  if (!paneller.length) return null;

  return (
    <div
      data-testid="plan-seridi"
      className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-kenar bg-panel px-3 py-2"
    >
      {paneller.map((p) => {
        const secili = p.id === aktif;
        const hedef = p.scriptRefs?.[0];
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`plan-${p.id}`}
            aria-current={secili || undefined}
            title={`S${p.meta.scene}·C${p.meta.shot}${hedef ? '' : ` — ${t('senaryoya bağlı değil')}`}`}
            onClick={() => {
              setActivePanel(p.id);
              if (hedef) blogaGit(hedef);
            }}
            className={
              'relative shrink-0 border transition-colors ' +
              (secili ? 'border-amber' : 'border-kenar-denetim hover:border-metin-cok-zayif')
            }
          >
            <PanelThumbnail panel={p} frame={panelSize(p.guides.aspect)} width={KUCUK_EN} />
            <span className="mzn-sayi absolute bottom-0 left-0 bg-cubuk/85 px-1 text-[10px] text-metin-sonuk">
              {p.meta.scene}·{p.meta.shot}
            </span>
          </button>
        );
      })}
    </div>
  );
}
