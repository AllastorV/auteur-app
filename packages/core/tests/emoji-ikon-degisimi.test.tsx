// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Ikon, type IkonAdi } from '@storyboard/core/components/Ikon';
import { LayersPanel } from '@storyboard/core/components/inspector/LayersPanel';
import { Timeline } from '@storyboard/core/components/timeline/Timeline';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createLayer, createPanel, createProject } from '@storyboard/core/model/factory';

// Timeline now paints real Konva thumbnails; this suite checks icons only.
vi.mock('@storyboard/core/components/grid/PanelThumbnail', () => ({
  PanelThumbnail: () => <div data-testid="thumb-stub" />,
}));

/*
 * Arayüzdeki 8 emoji SVG ikona çevrildi (🔒🔓👁⛓⚠⏸⏮♪). Bu test üç şeyi
 * kanıtlıyor: (1) kaynakta bu karakterlerden hiçbiri KOD olarak kalmadı —
 * yorum satırları muaf, ok/tuş sembolleri (→←↑↓↔⏎⇧⌃⌄, ▶ dahil) muaf;
 * (2) yeni ikon adlarının gerçek bir çizim yolu var (boş değil); (3) emojinin
 * yerini alan iki bileşen gerçekten ikonu çiziyor VE erişilebilir ad duruyor.
 */

const YASAKLI = ['\u{1F512}', '\u{1F513}', '\u{1F441}', '⛓', '⚠', '⏸', '⏮', '♪'];
const YASAKLI_DESEN = new RegExp('[' + YASAKLI.join('') + ']', 'u');

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kaba ama yeterli yorum ayıklayıcı: /* *​/ bloklarını ve satır sonu //
 *  yorumlarını (tırnak içinde değilse) siler. Amaç sözdizimi ayrıştırmak
 *  değil, "bu satır görünür arayüz metni mi yoksa yorum mu" sorusuna
 *  cevap vermek. */
function yorumsuz(kaynak: string): string {
  const blokSuz = kaynak.replace(/\/\*[\s\S]*?\*\//g, '');
  return blokSuz
    .split('\n')
    .map((satir) => {
      const i = satir.indexOf('//');
      if (i === -1) return satir;
      const once = satir.slice(0, i);
      const tek = (once.match(/'/g) || []).length;
      const cift = (once.match(/"/g) || []).length;
      const geriTik = (once.match(/`/g) || []).length;
      // '//' bir dize İÇİNDEYSE (tek/çift tırnak ya da template literal
      // açık kalmışsa) satırı olduğu gibi bırak — bu bir yorum değil.
      if (tek % 2 === 1 || cift % 2 === 1 || geriTik % 2 === 1) return satir;
      return once;
    })
    .join('\n');
}

function taraKlasor(dir: string, dosyalar: string[]) {
  for (const ad of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ad.name === 'node_modules' || ad.name === '.git' || ad.name === 'dist') continue;
    const p = path.join(dir, ad.name);
    if (ad.isDirectory()) taraKlasor(p, dosyalar);
    else if (/\.(tsx|ts)$/.test(ad.name)) dosyalar.push(p);
  }
}

/** Yalnız ARAYÜZ kaynağı: core paketi + web/desktop renderer'ı.
 *  apps/server bir arka uç günlük dizesi taşıyor ("⚠ TLS YOK…") — arayüz
 *  değil, bu taramanın kapsamı dışında. */
const ARAYUZ_KOKLERI = [
  path.join(KOK, 'src'),
  path.join(KOK, '..', '..', 'apps', 'web', 'src'),
  path.join(KOK, '..', '..', 'apps', 'desktop', 'src'),
].filter((p) => fs.existsSync(p));

describe('emoji → SVG ikon geçişi', () => {
  it('arayüz kaynağında 8 emojiden hiçbiri KOD olarak kalmadı (yorumlar muaf)', () => {
    const dosyalar: string[] = [];
    ARAYUZ_KOKLERI.forEach((k) => taraKlasor(k, dosyalar));
    expect(dosyalar.length).toBeGreaterThan(0);

    const ihlaller: string[] = [];
    for (const dosya of dosyalar) {
      const kaynak = fs.readFileSync(dosya, 'utf8');
      const temiz = yorumsuz(kaynak);
      temiz.split('\n').forEach((satir, i) => {
        if (YASAKLI_DESEN.test(satir)) {
          ihlaller.push(`${path.relative(KOK, dosya)}:${i + 1}: ${satir.trim()}`);
        }
      });
    }
    expect(ihlaller, ihlaller.join('\n')).toHaveLength(0);
  });

  it('ok/tuş sembolleri (→←↑↓↔⏎⇧⌃⌄, ▶) taramadan muaf — yanlışlıkla yakalanmıyor', () => {
    const MUAF = '→←↑↓↔⏎⇧⌃⌄▶';
    for (const ch of MUAF) {
      expect(YASAKLI_DESEN.test(ch), `"${ch}" yasaklı desende YAKALANMAMALI`).toBe(false);
    }
  });

  const YENI_IKONLAR: IkonAdi[] = ['goz', 'kilitli', 'kilitsiz', 'uyari', 'duraklat', 'basa-sar', 'nota', 'baglanti'];

  it.each(YENI_IKONLAR)('ikon "%s" gerçek (boş olmayan) bir çizim yoluyla render ediliyor', (ad) => {
    const yer = document.createElement('div');
    document.body.appendChild(yer);
    const kok = createRoot(yer);
    act(() => { kok.render(<Ikon ad={ad} boyut={16} />); });
    const yol = yer.querySelector('svg path');
    expect(yol, `"${ad}" için <path> bulunamadı`).toBeTruthy();
    const d = yol!.getAttribute('d') ?? '';
    expect(d.length, `"${ad}" için d yolu çok kısa/boş: "${d}"`).toBeGreaterThan(10);
    act(() => { kok.unmount(); });
    yer.remove();
  });
});

/* ------------------------------------------------------------------ */
/* Render testleri: emojinin yerini alan gerçek bileşenler, ikon        */
/* gerçekten çiziliyor mu ve erişilebilir ad duruyor mu.                */
/* ------------------------------------------------------------------ */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function ciz(oge: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(oge); });
}

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('LayersPanel — 👁/🔒/🔓 yerini alan ikonlar (erişilebilirlik: title korunuyor)', () => {
  it('görünür + kilitli katmanlarda ikon çiziliyor VE düğmelerin title\'ı (erişilebilir ad) duruyor', () => {
    const panel = createPanel({
      id: 'p1',
      layers: [
        createLayer({ id: 'l1', name: 'Görünür/açık', visible: true, locked: false, order: 1 }),
        createLayer({ id: 'l2', name: 'Gizli/kilitli', visible: false, locked: true, order: 0 }),
      ],
    });
    ciz(<LayersPanel panel={panel} editable />);

    const gizle = yer!.querySelector('button[title="Gizle"]');
    const goster = yer!.querySelector('button[title="Göster"]');
    const kilidiAc = yer!.querySelector('button[title="Kilidi aç"]');
    const kilitle = yer!.querySelector('button[title="Kilitle"]');

    // Erişilebilir ad (title) hâlâ orada — emoji SVG'ye dönünce KAYBOLMADI.
    expect(gizle, 'Görünür katmanın "Gizle" düğmesi').toBeTruthy();
    expect(goster, 'Gizli katmanın "Göster" düğmesi').toBeTruthy();
    expect(kilidiAc, 'Kilitli katmanın "Kilidi aç" düğmesi').toBeTruthy();
    expect(kilitle, 'Açık katmanın "Kilitle" düğmesi').toBeTruthy();

    // Her düğme gerçekten bir SVG ikon çiziyor (metin emoji değil). "Göster"
    // (görünmez katman) kapsam dışı: eşleniği '⃠' görev listesindeki 8
    // emojiden biri değil, bilerek dokunulmadı — yalnız 8 hedef karakter
    // taranıyor, o yüzden burada aranmıyor.
    for (const dugme of [gizle, kilidiAc, kilitle]) {
      expect(dugme!.querySelector('svg'), `${dugme!.getAttribute('title')} içinde <svg> yok`).toBeTruthy();
      expect(dugme!.textContent, `${dugme!.getAttribute('title')} hâlâ emoji metni içeriyor`).not.toMatch(YASAKLI_DESEN);
    }
  });
});

describe('Timeline — ⏸/⏮/⛓ yerini alan ikonlar', () => {
  function kur() {
    const panel = createPanel({ id: 'p1', meta: { scene: '1', shot: '1', duration: 2 } });
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, { ...createProject({ panels: [] }), panels: [panel] }, 'load');
    useProjectStore.getState().attachDoc(doc, 'owner');
    useUiStore.setState({ playing: false, playhead: 0 });
  }

  it('"Başa sar" düğmesi artık ikon-yalnız içerik — aria-label eklendi, emoji kalmadı', () => {
    kur();
    ciz(<Timeline editable />);
    const basaSar = yer!.querySelector('button[aria-label="Başa sar"]');
    expect(basaSar, 'aria-label="Başa sar" düğmesi bulunamadı').toBeTruthy();
    expect(basaSar!.querySelector('svg')).toBeTruthy();
    expect(basaSar!.textContent).not.toMatch(YASAKLI_DESEN);
  });

  it('oynat/duraklat düğmesi: duraklatma durumunda ikon + "Duraklat" metni birlikte duruyor', () => {
    kur();
    ciz(<Timeline editable />);
    const oynatDugmesi = yer!.querySelector('button[title="Animatik önizleme"]') as HTMLButtonElement;
    expect(oynatDugmesi.textContent).toContain('Oynat');

    act(() => { oynatDugmesi.click(); }); // playing: false -> true
    expect(oynatDugmesi.querySelector('svg'), 'duraklat ikonu çizilmedi').toBeTruthy();
    // Görünür metin (erişilebilir ad kaynağı) hâlâ "Duraklat" diyor.
    expect(oynatDugmesi.textContent).toContain('Duraklat');
    expect(oynatDugmesi.textContent).not.toMatch(YASAKLI_DESEN);
  });
});
