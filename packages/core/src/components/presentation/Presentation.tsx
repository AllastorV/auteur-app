import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/project';
import { sunumdanCik } from '../../store/mod';
import { panelSize } from '../../data/aspect';
import { PanelThumbnail } from '../grid/PanelThumbnail';
import { formatDuration } from '../../model/timeline';
import { Ikon } from '../Ikon';
import { t } from '../../dil/arayuz';

/**
 * Sunum modu (F8 — STARC `presentation`, §13.2). Panelleri tam ekran,
 * sırayla gösterir; müşteriye/ekibe sunmak için.
 *
 * ## Durum OTURUMLUK, Yjs'e YAZILMAZ
 *
 * `playing` bu bileşenin KENDİ `useState`'i — mağazada bir alan değil.
 * Gösterilen panel `activePanelId`'den okunuyor ve o zaten Yjs'e yazılmayan
 * bir alan (`store/project.ts`). Sonuç: bir kullanıcı sunuma geçtiğinde
 * ortak çalışanın ekranı DEĞİŞMİYOR — yer imi çekmecesinde (§13.4) verilen
 * kararın aynı gerekçesi.
 *
 * ## Arayüz kaybolur, yalnız iş görünür
 *
 * `Studio.tsx` `viewMode === 'sunum'`i `odakModu`yla AYNI şekilde okuyup
 * araç çubuğunu ve panelleri gizliyor (§16.3 odak modunun mantığı). Bu
 * bileşen yalnız kendi tam ekran yüzeyini çiziyor, kabuğu kendisi gizlemiyor
 * — ikinci bir "kabuğu gizle" yolu açmak Karar 2'yi ihlal ederdi.
 */
export function Presentation() {
  const panels = useProjectStore((s) => s.project.panels);
  const script = useProjectStore((s) => s.project.script);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);

  const index = Math.max(0, panels.findIndex((p) => p.id === activePanelId));
  const panel = panels[index] ?? panels[0];

  const [playing, setPlaying] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);
  const wasFullscreen = useRef(false);
  const intentionalExit = useRef(false);

  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement === hostRef.current;
      setFullscreen(active);
      if (wasFullscreen.current && !active && !intentionalExit.current) sunumdanCik();
      wasFullscreen.current = active;
      intentionalExit.current = false;
    };
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    const entering = document.fullscreenElement !== host;
    setFullscreenNotice(null);
    try {
      if (entering) await host.requestFullscreen();
      else {
        intentionalExit.current = true;
        await document.exitFullscreen();
      }
    } catch {
      intentionalExit.current = false;
      setFullscreen(document.fullscreenElement === host);
      setFullscreenNotice(entering
        ? t('Tam ekran açılamadı. Tarayıcı iznini kontrol edin.')
        : t('Tam ekrandan çıkılamadı.'));
    }
  }, []);

  const leave = useCallback(async () => {
    if (document.fullscreenElement === hostRef.current) {
      intentionalExit.current = true;
      try {
        await document.exitFullscreen();
      } catch {
        intentionalExit.current = false;
        setFullscreenNotice(t('Tam ekrandan çıkılamadı.'));
        return;
      }
    }
    sunumdanCik();
  }, []);

  const git = useCallback(
    (delta: number) => {
      const guncelPaneller = useProjectStore.getState().project.panels;
      const at = guncelPaneller.findIndex((p) => p.id === useProjectStore.getState().activePanelId);
      const hedef = guncelPaneller[Math.max(0, Math.min(guncelPaneller.length - 1, (at < 0 ? 0 : at) + delta))];
      if (hedef) setActivePanel(hedef.id);
    },
    [setActivePanel],
  );

  /* Otomatik ilerleme — panelin KENDİ süresi kadar bekler (`meta.duration`,
     `Timeline`'ın da kullandığı aynı alan, Karar 2). Son panelde DURUR: sona
     gelince sessizce başa sarmak "bitti" sinyalini kullanıcıya kaçırtırdı —
     bir sunum bittiğinde bilinçli olarak biter, döngüye girmez. */
  useEffect(() => {
    if (!playing || !panel) return;
    const ms = Math.max(0.1, panel.meta.duration) * 1000;
    const zamanlayici = setTimeout(() => {
      const guncelPaneller = useProjectStore.getState().project.panels;
      const at = guncelPaneller.findIndex((p) => p.id === panel.id);
      if (at < 0 || at >= guncelPaneller.length - 1) {
        setPlaying(false);
        return;
      }
      setActivePanel(guncelPaneller[at + 1].id);
    }, ms);
    return () => clearTimeout(zamanlayici);
  }, [playing, panel, setActivePanel]);

  /* Klavye: kendi katmanı. `useShortcuts` `viewMode === 'sunum'`de erken
     dönüyor (pano/senaryo kısayolları sunum sırasında sızmasın diye) — bu
     yüzden burada yalnız sunum tuşları dinlenir, çakışma yok. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); git(1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); git(-1); return; }
      if (e.key === 'Escape') { e.preventDefault(); void leave(); return; }
      if (e.key.toLowerCase() === 'f' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [git, leave, toggleFullscreen]);

  /* Panel boyu görünüm kutusuna SIĞDIRILIR (`object-fit: contain` aritmetiği):
     `PanelThumbnail` sabit piksel genişliği alıyor, tuval yeniden çizilmiyor
     (Karar 2) — burada yalnız o genişlik hesaplanıyor. `ResizeObserver` yoksa
     (jsdom) tek seferlik ölçüm yeterli, `PanelThumbnail`ın kendi
     `IntersectionObserver` düşüşüyle AYNI desen. */
  const [box, setBox] = useState({ width: 960, height: 600 });
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const olc = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    olc();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bagliSatirlar = useMemo(() => {
    if (!panel) return [];
    const refs = new Set(panel.scriptRefs);
    return script?.blocks.filter((b) => refs.has(b.id)) ?? [];
  }, [panel, script]);

  if (!panel) {
    return (
      <div data-testid="sunum-yuzeyi" className="grid h-full place-items-center bg-black text-metin-zayif">
        {t('Gösterilecek panel yok.')}
      </div>
    );
  }

  const frame = panelSize(panel.guides.aspect);
  const altSerit = bagliSatirlar.length ? 96 : 0;
  const pad = 32;
  const availW = Math.max(1, box.width - pad * 2);
  const availH = Math.max(1, box.height - pad * 2 - altSerit);
  const genislik = Math.max(120, Math.min(availW, availH * (frame.width / frame.height)));

  return (
    <div
      ref={hostRef}
      data-testid="sunum-yuzeyi"
      className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-8"
    >
      <PanelThumbnail panel={panel} frame={frame} width={genislik} />

      {bagliSatirlar.length > 0 && (
        <div
          data-testid="sunum-satirlar"
          className="max-h-24 w-full max-w-2xl overflow-y-auto text-center font-mono text-[13px] leading-relaxed text-metin-guclu"
        >
          {bagliSatirlar.map((b) => <p key={b.id}>{b.text}</p>)}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-metin-zayif">
        <span data-testid="sunum-sayac" className="mzn-sayi">{index + 1} / {panels.length}</span>
        <button
          type="button"
          data-testid="sunum-oynat"
          onClick={() => setPlaying((p) => !p)}
          className="mzn-denetim px-2.5 py-1"
        >
          {playing ? (
            <span className="inline-flex items-center gap-1">
              <Ikon ad="duraklat" boyut={13} /> {t('Duraklat')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Ikon ad="oynat" boyut={13} /> {t('Oynat')}
            </span>
          )}
        </button>
        <span className="mzn-sayi">{formatDuration(panel.meta.duration)}</span>
        <button
          type="button"
          data-testid="sunum-tam-ekran"
          aria-pressed={fullscreen}
          onClick={() => { void toggleFullscreen(); }}
          className="mzn-denetim px-2.5 py-1"
        >
          {fullscreen ? t('Tam ekrandan çık') : t('Tam ekran')} (F)
        </button>
        <button type="button" data-testid="sunum-cik" onClick={() => { void leave(); }} className="mzn-denetim px-2.5 py-1">
          {t('Esc · Çık')}
        </button>
      </div>
      {fullscreenNotice && <p role="alert" className="text-xs text-metin-guclu">{fullscreenNotice}</p>}
    </div>
  );
}
