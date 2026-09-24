import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';
import { panelSirasiHesapla, siraylaTasimalar } from '../model/sahne-panel';
import * as M from '../doc/mutations';

/**
 * Sahne ↔ panel canlı bağı — F5.
 *
 * Senaryo sırası değiştiğinde bağlı panelleri aynı sıraya getirir.
 *
 * ## Neden bir BAYRAK var
 *
 * Otomatik sıralama, kullanıcının panodaki elle düzenini ezebilir ve bu
 * "neden kartlarım kaydı" diye sorulacak bir sürprizdir. Varsayılan AÇIK
 * (bitiş ölçütü bunu istiyor) ama kapatılabiliyor; kapatınca hiçbir yazım
 * yapılmıyor, yani karar kullanıcının.
 *
 * ## Neden geri alma ADIMI ayrı değil
 *
 * Taşımalar senaryo düzenlemesinin hemen ardından geliyor ve Yjs'in
 * `captureTimeout`'u onları aynı adıma katıyor: kullanıcı sahneyi geri
 * aldığında kartlar da geri geliyor. Ayrı adım olsaydı Ctrl+Z bir kez metni,
 * bir kez kartları geri alırdı — aynı eylemin iki kez geri alınması.
 */
export function useSahnePanelBagi(): void {
  const bagliMi = useUiStore((s) => s.sahnePanelBagi);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const paneller = useProjectStore((s) => s.project.panels);
  const doc = useProjectStore((s) => s.doc);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));

  /* Elle kart taşıma panel dizisini değiştirir ama bu, senaryoda bir
     değişiklik değildir. Sadece blok sırası veya panel bağlantıları
     değiştiğinde otomatik hizalama çalışır. İlk açılışta kayıtlı el
     düzeni korunur. */
  const sonKaynak = useRef<{ doc: typeof doc; imza: string } | null>(null);
  const blokImza = bloklar?.map((block) => block.id).join('|') ?? '';
  const bagImza = paneller.filter((panel) => panel.scriptRefs.length > 0)
    .map((panel) => `${panel.id}:${panel.scriptRefs.join(',')}`)
    .sort().join('|');

  useEffect(() => {
    const imza = `${blokImza}##${bagImza}`;
    if (!sonKaynak.current || sonKaynak.current.doc !== doc) {
      sonKaynak.current = { doc, imza };
      return;
    }
    if (sonKaynak.current.imza === imza) return;
    sonKaynak.current.imza = imza;
    if (!bagliMi || !duzenlenebilir || !bloklar?.length) return;

    const currentPanels = useProjectStore.getState().project.panels;
    if (currentPanels.length < 2) return;
    const { sira, degisti } = panelSirasiHesapla(bloklar, currentPanels);
    if (!degisti) return;

    /* Tek tek taşıma: diziyi toptan yazmak ortak çalışmada başkasının aynı
       anda eklediği paneli silerdi. */
    for (const { panelId, toIndex } of siraylaTasimalar(currentPanels.map((p) => p.id), sira)) {
      M.movePanel(doc, panelId, toIndex);
    }
  }, [bagliMi, blokImza, bagImza, doc, duzenlenebilir]);
}
