import React, { useEffect, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { ONERI, oneriyiKabulEt, type OneriDurumu } from '../../editor/oneri-eklenti';
import { t } from '../../dil/arayuz';

/**
 * ÖNERİ AÇILIR LİSTESİ — imlecin altında.
 *
 * Konum İMLEÇTEN okunuyor (`coordsAtPos`), bloktan değil: uzun bir satırın
 * ortasında yazarken liste satırın başında açılsaydı kullanıcı gözünü
 * yazdığı yerden koparmak zorunda kalırdı.
 *
 * Liste `position: fixed`: kağıt kaydırılabilir bir yüzeyde ve `absolute`
 * konumlandırma listeyi kağıtla birlikte kaydırırdı — imleç sabit dururken
 * liste kayardı.
 */
export function OneriListesi({ view }: { view: EditorView | null }) {
  const [durum, setDurum] = useState<OneriDurumu | null>(null);
  const [konum, setKonum] = useState<{ sol: number; ust: number } | null>(null);

  useEffect(() => {
    if (!view) return;
    /* ProseMirror'ın kendi güncelleme döngüsüne bağlanmak yerine DOM
       olaylarını dinlemek, iki ayrı durum kaynağı üretirdi. Görünüm her
       işlemde `dispatchTransaction` çağırıyor; bileşen oradan besleniyor. */
    const oku = () => {
      const d = ONERI.getState(view.state) ?? null;
      setDurum(d);
      if (!d || d.oneriler.length === 0) return setKonum(null);
      try {
        const c = view.coordsAtPos(view.state.selection.from);
        setKonum({ sol: c.left, ust: c.bottom + 4 });
      } catch {
        /* Konum hesaplanamıyorsa (görünüm henüz çizilmedi) liste
           gösterilmiyor — yanlış yerde açılmasındansa hiç açılmasın. */
        setKonum(null);
      }
    };
    oku();
    const gozcu = () => oku();
    view.dom.addEventListener('mizansen-guncelle', gozcu);
    return () => view.dom.removeEventListener('mizansen-guncelle', gozcu);
  }, [view]);

  if (!view || !durum || durum.oneriler.length === 0 || !konum) return null;

  return (
    <div
      data-testid="oneri-listesi"
      role="listbox"
      className="fixed z-50 max-h-[240px] min-w-[180px] overflow-auto border border-kenar-denetim bg-cubuk py-1 shadow-[0_18px_40px_rgba(0,0,0,.55)]"
      style={{ left: konum.sol, top: konum.ust }}
    >
      {durum.oneriler.map((o, i) => (
        <button
          key={o.metin}
          type="button"
          role="option"
          aria-selected={i === durum.secili}
          data-secili={i === durum.secili ? 'evet' : undefined}
          /* `onMouseDown` + `preventDefault`: `onClick` kullanılsaydı tıklama
             önce editörün odağını düşürür, imleç kaybolur ve öneri yanlış
             yere yazılırdı. */
          onMouseDown={(e) => {
            e.preventDefault();
            oneriyiKabulEt(view, o);
          }}
          className={
            'flex w-full items-baseline justify-between gap-3 px-3 py-1 text-left text-xs '
            + (i === durum.secili ? 'bg-etkin text-metin' : 'text-metin-govde hover:bg-etkin')
          }
        >
          <span className="mzn-sayi">{o.metin}</span>
          <span className="text-[10px] text-metin-cok-zayif">{o.sayi}×</span>
        </button>
      ))}
      <p className="border-t border-kenar-ic px-3 pt-1 text-[10px] text-metin-cok-zayif">
        {t('↑↓ gez · Enter seç · Esc kapat')}
      </p>
    </div>
  );
}
