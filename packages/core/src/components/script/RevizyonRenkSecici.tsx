import React, { useEffect, useRef, useState } from 'react';
import { REVIZYON_RENKLERI, RENK_ADLARI, RENK_ZEMINI, type RevizyonRengi } from '../../model/revizyon';
import { t } from '../../dil/arayuz';
import { Ikon } from '../Ikon';

export function RevizyonRenkSecici({ renk, onChange }: {
  renk: RevizyonRengi;
  onChange: (renk: RevizyonRengi) => void;
}) {
  const [acik, setAcik] = useState(false);
  const kok = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [konum, setKonum] = useState({ left: 0, top: 0 });
  const kapat = () => { setAcik(false); dugme.current?.focus(); };

  useEffect(() => {
    if (!acik) return;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const disari = (e: PointerEvent) => {
      if (!kok.current?.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener('pointerdown', disari);
    const kapatDisari = () => setAcik(false);
    window.addEventListener('resize', kapatDisari);
    window.addEventListener('scroll', kapatDisari, true);
    return () => {
      document.removeEventListener('pointerdown', disari);
      window.removeEventListener('resize', kapatDisari);
      window.removeEventListener('scroll', kapatDisari, true);
    };
  }, [acik]);

  const ornek = (r: RevizyonRengi) => (
    <span aria-hidden="true" data-renk={r} className="inline-block h-3 w-3 shrink-0 border border-kenar-denetim"
      style={{ background: `rgb(${RENK_ZEMINI[r].map((k) => Math.round(k * 255)).join(',')})` }} />
  );

  return (
    <div ref={kok} className="relative shrink-0"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAcik(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && acik) { e.preventDefault(); e.stopPropagation(); kapat(); }
      }}>
      <button ref={dugme} type="button" data-testid="revizyon-renk-secici"
        aria-label={`${t('Revizyon rengi')}: ${t(RENK_ADLARI[renk])}`}
        aria-haspopup="menu" aria-expanded={acik}
        onClick={() => {
          const rect = dugme.current?.getBoundingClientRect();
          if (rect) setKonum({ left: Math.max(0, Math.min(rect.left, window.innerWidth - 232)), top: rect.bottom + 4 });
          setAcik((a) => !a);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAcik(true); }
        }}
        className="mzn-denetim flex items-center gap-1 px-1.5 py-1 text-xs focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber">
        {ornek(renk)}
        <span className="hidden xl:inline">{t('Revizyon rengi')}</span>
        <Ikon ad="ok-asagi" boyut={10} />
      </button>
      {acik && (
        <div ref={menu} role="menu" aria-label={t('Revizyon rengi')}
          data-testid="revizyon-renk-menusu"
          className="fixed z-50 max-h-[60vh] min-w-[232px] overflow-y-auto border border-kenar-denetim bg-cubuk py-1 text-xs text-metin-govde"
          style={konum}
          onKeyDown={(e) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation();
            const ogeler = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const i = ogeler.indexOf(document.activeElement as HTMLButtonElement);
            const hedef = e.key === 'Home' ? 0 : e.key === 'End' ? ogeler.length - 1
              : (i + (e.key === 'ArrowDown' ? 1 : -1) + ogeler.length) % ogeler.length;
            ogeler[hedef]?.focus();
          }}>
          {REVIZYON_RENKLERI.map((r, i) => (
            <button key={r} type="button" role="menuitemradio" aria-checked={r === renk}
              data-testid={`revizyon-renk-${r}`} tabIndex={r === renk ? 0 : -1}
              onClick={() => { onChange(r); kapat(); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-etkin focus:bg-etkin focus:text-metin focus:outline-none">
              {ornek(r)}
              <span className="flex-1">{i + 1}. {t(RENK_ADLARI[r])}</span>
              {r === renk && <Ikon ad="onay" boyut={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
