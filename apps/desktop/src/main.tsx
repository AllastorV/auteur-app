import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Kitaplik, PlatformProvider, Studio, useUiStore } from '@storyboard/core';
import { desktopPlatform } from './platform';
import './styles.css';

/**
 * Masaüstü kabuğu.
 *
 * Program PROJE AÇIK OLMADAN açılıyor: önce kitaplık, sonra masa. Eskiden
 * doğrudan `Studio` çiziliyordu ve kullanıcı her açılışta adı olmayan boş bir
 * projenin içinde buluyordu kendini — dün ne üzerinde çalıştığını hatırlatan
 * hiçbir şey yoktu.
 *
 * Karar mağazada değil BURADA: `Studio` bir projeyi düzenler, hangi projenin
 * düzenleneceğini seçmek onun işi değil. Web kabuğu bir odaya katılarak
 * geliyor ve bu ekranı hiç görmüyor — orada proje zaten belli.
 */
function Masaustu() {
  const [acik, setAcik] = useState(false);
  /* Arayuz dili degisince agac `key` ile yeniden kurulur — `t()` React'e
     abone degil, tazelik buradan (bkz. dil/arayuz.ts). */
  const arayuzDili = useUiStore((s) => s.arayuzDili);
  /* Ana surec menuyu bu dille kurar — acilista ve her degisimde bildir. */
  React.useEffect(() => {
    (window as unknown as { storyboard?: { arayuzDiliBildir?: (d: string) => void } })
      .storyboard?.arayuzDiliBildir?.(arayuzDili);
  }, [arayuzDili]);
  return (
    <PlatformProvider platform={desktopPlatform}>
      <React.Fragment key={arayuzDili}>
        {acik ? <Studio /> : <Kitaplik onAcildi={() => setAcik(true)} />}
      </React.Fragment>
    </PlatformProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

createRoot(container).render(
  <React.StrictMode>
    <Masaustu />
  </React.StrictMode>,
);
