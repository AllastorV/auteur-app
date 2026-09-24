// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useUiStore } from '@storyboard/core/store/ui';
import { useSenaryoProfili } from '@storyboard/core/hooks/useSenaryoProfili';
import { sayfala } from '@storyboard/core/format/sayfala';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

/**
 * Karar 34 tek SAYFALAYICI'yı garanti ediyordu ama tek PROFİLİ etmiyordu.
 * İki yol (`ScriptEditor` ve `ExportDialog`) aynı `sayfala` çağrısını FARKLI
 * girdiyle yapınca garanti sızdı: presetli profille 5 sayfa, presetsizle 3.
 * Kullanıcıya aynı ekranda "sayfa sayısı editördekiyle aynı" yazılıyordu.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({ scriptPresetler: {} });
});

function profilOku() {
  let sonuc: ReturnType<typeof useSenaryoProfili> | null = null;
  function Sonda() {
    sonuc = useSenaryoProfili();
    return null;
  }
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(React.createElement(Sonda)); });
  return sonuc!;
}

const aksiyonlar = (n: number): ScriptBlock[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    type: 'action' as const,
    text: `Ahmet ${i}. kez girer.`,
    fp: `f${i}`,
    scene: '',
    sceneId: '',
  }));

describe('senaryo profili TEK yerden kuruluyor', () => {
  it('kullanıcının yazım preseti profile giriyor', () => {
    useUiStore.setState({ scriptPresetler: { action: { oncekiBosSatir: 3 } } });
    expect(profilOku().profil.bloklar.action!.oncekiBosSatir).toBe(3);
  });

  /* Ölçülen hatanın kendisi: preset sayfa SAYISINI değiştiriyor. Profil iki
     yerde kurulduğu sürece bir taraf bu değişimi görmüyordu. */
  it('preset sayfa sayısını gerçekten değiştiriyor — fark ölçülebilir', () => {
    const bloklar = aksiyonlar(60);
    const tabanProfil = profilOku().profil;
    const taban = sayfala(bloklar, tabanProfil).length;

    act(() => { kok?.unmount(); });
    useUiStore.setState({ scriptPresetler: { action: { oncekiBosSatir: 3 } } });
    const presetli = sayfala(bloklar, profilOku().profil).length;

    expect(presetli).toBeGreaterThan(taban);
  });

  it('reddedilen presetler yutulmuyor — arayüze taşınıyor', () => {
    // Sütunu tamamen yiyen girinti: uygulanamaz, RED olarak dönmeli.
    useUiStore.setState({ scriptPresetler: { action: { solMm: 10_000 } } });
    const { redler } = profilOku();
    expect(redler.action?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('profil ikinci kez KURULMUYOR', () => {
  /* Kural tek evde durmalı: ikinci bir `profilOlustur` çağrısı, presetleri
     unutmanın yolunu geri açar. Kaynağa bakan test kırılgan ama bu hata tam
     olarak "bir çağıran unuttu" biçiminde geldi. */
  const kaynak = (rel: string) =>
    fs.readFileSync(path.resolve(__dirname, '..', 'src', rel), 'utf8');

  it('ScriptEditor kendi profilini kurmuyor', () => {
    expect(kaynak('components/script/ScriptEditor.tsx')).not.toContain('profilOlustur(');
  });

  it('ExportDialog kendi profilini kurmuyor', () => {
    expect(kaynak('components/dialogs/ExportDialog.tsx')).not.toContain('profilOlustur(');
  });
});
