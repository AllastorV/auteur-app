import React, { useState } from 'react';
import { t } from '../dil/arayuz';
import type { Onarim } from '../editor/sema';
import { onarimAnahtari, onarimMesaji } from '../editor/onarim-rapor';

/**
 * Karar 10 — onarılmış belge kullanıcıya SESSİZCE açılmaz (spec §12 F1c).
 *
 * Kapatılabilir ama kalıcı: kapatma durumu raporun İÇERİĞİNE bağlı, dizinin
 * referansına değil. Aynı bozukluk kapalı kalır; yeni bir bozukluk şeridi
 * geri getirir.
 */
export function OnarimSeridi({ onarimlar }: { onarimlar: readonly Onarim[] }) {
  const [kapatilan, setKapatilan] = useState('');
  const [acik, setAcik] = useState(false);
  const anahtar = onarimAnahtari(onarimlar);

  if (onarimlar.length === 0 || anahtar === kapatilan) return null;

  return (
    <div
      data-testid="onarim-seridi"
      role="status"
      className="shrink-0 bg-amber-900/70 px-3 py-1.5 text-[11px] text-amber-100"
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">{onarimMesaji(onarimlar)}</span>
        <button
          type="button"
          onClick={() => setAcik((a) => !a)}
          className="shrink-0 underline underline-offset-2 hover:text-amber-50"
        >
          {acik ? t('Ayrıntıyı gizle') : t('Ayrıntı')}
        </button>
        <button
          type="button"
          data-testid="onarim-kapat"
          onClick={() => setKapatilan(anahtar)}
          className="shrink-0 hover:text-amber-50"
          aria-label={t('Onarım uyarısını kapat')}
        >
          ✕
        </button>
      </div>

      {acik && (
        <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto font-mono text-[10px] text-amber-200/90">
          {onarimlar.map((o) => (
            <li key={`${o.indeks}-${o.atanan}`}>
              {o.indeks + 1}. blok · {o.sebep === 'yinelenen' ? 'yinelenen' : 'kimliksiz'} ·{' '}
              {JSON.stringify(o.bulunan)} → {o.atanan}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
