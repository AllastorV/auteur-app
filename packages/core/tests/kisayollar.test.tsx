// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useShortcuts } from '@storyboard/core/hooks/useShortcuts';
import { useUiStore } from '@storyboard/core/store/ui';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';

/**
 * `useShortcuts` tamamen testsizdi — yeni `F` (odak modu) kısayolu dahil.
 * Kısayollar arayüzün en görünmez katmanı: bozulduklarında hata çıkmaz,
 * yalnız tuş "çalışmaz" ve bu ancak elle denemede fark edilir.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function Sonda() {
  useShortcuts({ onSave: () => {} });
  return null;
}

function Sonda2({ sayac }: { sayac: () => void }) {
  useShortcuts({ onSave: () => {}, onKisayollar: sayac });
  return null;
}

beforeEach(() => {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel(), createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  useUiStore.setState({ viewMode: 'senaryo', odakModu: false, chromeHidden: false, scriptSecili: [] });

  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<Sonda />); });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function listeKur() {
  const liste = document.createElement('div');
  liste.setAttribute('data-script-list', '');
  const cocuk = document.createElement('span');
  liste.appendChild(cocuk);
  document.body.appendChild(liste);
  return { liste, cocuk };
}

/**
 * Tuşa basar. `altKey` VARSAYILAN OLARAK AÇIK çünkü bu dosyanın kurulumu
 * SENARYO görünümünde ve orada çıplak harf kısayolu yoktur (kullanıcı kararı,
 * 2026-08-26). Çıplak biçimi ölçen testler `{ alt: false }` veriyor.
 */
const bas = (
  key: string,
  hedef: EventTarget = document.body,
  { alt = true }: { alt?: boolean } = {},
) => {
  act(() => {
    hedef.dispatchEvent(
      new KeyboardEvent('keydown', { key, altKey: alt, bubbles: true, cancelable: true }),
    );
  });
};

it('Alt+M karışık seçimin tamamını işaretler, ikinci basışta kaldırır', () => {
  const doc = useProjectStore.getState().doc;
  M.revizyonYayinla(doc);
  M.revizyonIsaretle(doc, ['b0']);
  useUiStore.setState({ scriptSecili: ['b0', 'b1'] });
  bas('m');
  expect(M.revizyonIsaretleriniOku(doc).size).toBe(2);
  bas('m');
  expect(M.revizyonIsaretleriniOku(doc).size).toBe(0);
});

describe('odak modu — `F`', () => {
  it('senaryo görünümünde odak modunu açıp kapatıyor', () => {
    bas('f');
    expect(useUiStore.getState().odakModu).toBe(true);
    bas('f');
    expect(useUiStore.getState().odakModu).toBe(false);
  });

  /* Panoda çizim yaparken blokları söndürmenin karşılığı yok; kısayol orada
     SESSİZ kalmalı, `chromeHidden` gibi genel bir anahtarı kirletmemeli. */
  it('pano görünümünde HİÇBİR ŞEY yapmıyor', () => {
    useUiStore.setState({ viewMode: 'board' });
    bas('f', document.body, { alt: false });
    expect(useUiStore.getState().odakModu).toBe(false);
    expect(useUiStore.getState().chromeHidden).toBe(false);
  });

  it('odaktan çıkınca arayüz geri geliyor', () => {
    bas('f');
    expect(useUiStore.getState().chromeHidden).toBe(true);
    bas('f');
    expect(useUiStore.getState().chromeHidden).toBe(false);
  });
});

describe('mod geçişi — `S`', () => {
  it('senaryo ile pano arasında geçiyor', () => {
    bas('s');
    expect(useUiStore.getState().viewMode).toBe('board');
    bas('s');
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  /* Gizli arayüzü geri getirmezse tuş sayfayı açar ama gezgin ve araç
     çubuğu görünmez kalır — kullanıcı ne olduğunu anlamaz. */
  it('gizli arayüzü geri getiriyor', () => {
    useUiStore.setState({ chromeHidden: true });
    bas('s');
    expect(useUiStore.getState().chromeHidden).toBe(false);
  });
});

describe('yazarken kısayol tetiklenmiyor', () => {
  /* Metin girişindeyken `f` yazmak odak modunu açsaydı yazar kelimenin
     ortasında ekranın yarısını kaybederdi. */
  it('input içinde ÇIPLAK `f` odak modunu açmıyor', () => {
    const girdi = document.createElement('input');
    document.body.appendChild(girdi);
    bas('f', girdi, { alt: false });
    expect(useUiStore.getState().odakModu).toBe(false);
    girdi.remove();
  });

  /* ALT'LI biçim yazı alanında da GEÇİYOR ve bu doğru: Alt'a basmak "bu bir
     kısayol" demektir ve Windows/Linux'ta Alt+harf metin üretmez.
     ÖLÇÜLDÜ: erken dönüş Alt'ı da yutarken, editöre otomatik odak verildikten
     sonra kullanıcı senaryo sayfasından panoya HİÇ geçemiyordu. */
  it('input içinde Alt+`f` odak modunu AÇIYOR', () => {
    const girdi = document.createElement('input');
    document.body.appendChild(girdi);
    bas('f', girdi);
    expect(useUiStore.getState().odakModu).toBe(true);
    girdi.remove();
  });

  /* Muhafız yalnız LİSTENİN KENDİ tuşlarını yutuyor, hepsini değil.
     Hepsini yutarken şu oluyordu: kullanıcı gezginde bir satıra tıklıyor
     (imleç oraya gidiyor), sonra `B`'ye basıyor ve hiçbir şey olmuyor —
     yer imi koymanın en doğal yolu ölü tuştu. */
  it('senaryo listesi KENDİ tuşlarını yutuyor', () => {
    const { liste, cocuk } = listeKur();
    bas('ArrowDown', cocuk);
    bas('Enter', cocuk);
    // Liste tuşları genel kısayollara ulaşmadı: mod değişmedi.
    expect(useUiStore.getState().viewMode).toBe('senaryo');
    liste.remove();
  });

  it('listenin kullanmadığı tuş GEÇİYOR — `F` odak modunu açıyor', () => {
    const { liste, cocuk } = listeKur();
    bas('f', cocuk);
    expect(useUiStore.getState().odakModu).toBe(true);
    liste.remove();
  });
});

describe('panel gezinme — `,` ve `.`', () => {
  it('sonraki ve önceki panele geçiyor', () => {
    const paneller = useProjectStore.getState().project.panels;
    useProjectStore.getState().setActivePanel(paneller[0].id);
    bas('.');
    expect(useProjectStore.getState().activePanelId).toBe(paneller[1].id);
    bas(',');
    expect(useProjectStore.getState().activePanelId).toBe(paneller[0].id);
  });

  it('uçlarda SARMALAMIYOR — kazara başa dönmüyor', () => {
    const paneller = useProjectStore.getState().project.panels;
    useProjectStore.getState().setActivePanel(paneller[0].id);
    bas(',');
    expect(useProjectStore.getState().activePanelId).toBe(paneller[0].id);
  });
});

describe('senaryo görünümünde ÇIPLAK harf kısayolu yok', () => {
  /* GERÇEK HATA (2026-08-26, kullanıcı bildirimi): "yazı yazamıyorum,
     kısayol tetiklenip sayfalar arası geçiyor." Odak editörde değilken
     yazılan her `s` panoya atlıyordu. Kullanıcı kararı: senaryo sayfasında
     hiçbir çıplak harf kısayol OLMAYACAK; panoda sektör standardı kalacak. */
  it('çıplak `s` mod değiştirmiyor', () => {
    bas('s', document.body, { alt: false });
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  it('çıplak `f` odak modunu açmıyor', () => {
    bas('f', document.body, { alt: false });
    expect(useUiStore.getState().odakModu).toBe(false);
  });

  it('çıplak `,` `.` panel değiştirmiyor', () => {
    const paneller = useProjectStore.getState().project.panels;
    useProjectStore.getState().setActivePanel(paneller[0].id);
    bas('.', document.body, { alt: false });
    expect(useProjectStore.getState().activePanelId).toBe(paneller[0].id);
  });

  it('çıplak `[` fırça boyutunu değiştirmiyor', () => {
    const once = useUiStore.getState().strokeWidth;
    bas('[', document.body, { alt: false });
    expect(useUiStore.getState().strokeWidth).toBe(once);
  });

  /* Araç kısayolları da (`v`, `b`, `e`…) aynı kapıdan geçiyor: tablo ayrı
     bir yolda olduğu için kapı ondan ÖNCE kurulmalıydı. */
  it('çıplak `v` araç değiştirmiyor', () => {
    useUiStore.setState({ tool: 'pen' });
    bas('v', document.body, { alt: false });
    expect(useUiStore.getState().tool).toBe('pen');
  });

  /* Space senaryo görünümünde HİÇ dinlenmiyor: yazarken en çok basılan tuş
     ve `Alt+Space` Windows'ta pencere menüsünü açtığı için oraya taşınamaz. */
  it('Space kaydırma aracına geçirmiyor — Alt ile bile', () => {
    useUiStore.setState({ tool: 'select' });
    bas(' ', document.body, { alt: false });
    expect(useUiStore.getState().tool).toBe('select');
    bas(' ');
    expect(useUiStore.getState().tool).toBe('select');
  });

  /* Karakter ÜRETMEYEN tuşlar kapıdan muaf: bir belgeye "Escape" yazılamaz. */
  it('Escape ve Tab çıplak çalışmaya devam ediyor', () => {
    useUiStore.setState({ odakModu: true, chromeHidden: true });
    bas('Escape', document.body, { alt: false });
    expect(useUiStore.getState().odakModu).toBe(false);

    const once = useUiStore.getState().chromeHidden;
    bas('Tab', document.body, { alt: false });
    expect(useUiStore.getState().chromeHidden).toBe(!once);
  });
});

describe('panoda çıplak harf ÇALIŞIYOR — sektör standardı', () => {
  /* Kullanıcı kararının ikinci yarısı: "storyboard sayfasına geçince sektör
     standartları çalışabilir." Kapıyı her yere uygulamak Figma ve
     Photoshop'un yerleşik dilini kırardı. */
  it('panoda çıplak `v` seçim aracına geçiyor', () => {
    useUiStore.setState({ viewMode: 'board', tool: 'pen' });
    bas('v', document.body, { alt: false });
    expect(useUiStore.getState().tool).toBe('select');
  });

  it('Space, seçili çizim aracını değiştirmiyor', () => {
    useUiStore.setState({ viewMode: 'board', tool: 'pen' });
    bas(' ', document.body, { alt: false });
    expect(useUiStore.getState().tool).toBe('pen');
  });

  it('panoda çıplak `s` senaryoya geçiyor', () => {
    useUiStore.setState({ viewMode: 'board' });
    bas('s', document.body, { alt: false });
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  it('Alt-lı biçim panoda DA çalışıyor — kas hafızası tek', () => {
    useUiStore.setState({ viewMode: 'board', tool: 'pen' });
    bas('v');
    expect(useUiStore.getState().tool).toBe('select');
  });
});

describe('gerçek kullanım kısayol regresyonları', () => {
  it('editörün işlediği Ctrl+Z tekrar geri alınmıyor', () => {
    let count = 0;
    const undo = useProjectStore.getState().undo;
    useProjectStore.setState({ undo: () => { count += 1; } });
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    event.preventDefault();
    act(() => { document.body.dispatchEvent(event); });
    useProjectStore.setState({ undo });
    expect(count).toBe(0);
  });
  it('Ctrl+Shift+S yalnız Farklı Kaydet çağırıyor', () => {
    let save = 0, saveAs = 0;
    function KayitSondasi() {
      useShortcuts({ onSave: () => { save += 1; }, onSaveAs: () => { saveAs += 1; } });
      return null;
    }
    act(() => { kok!.render(<KayitSondasi />); });
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'S', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
    })); });
    expect(saveAs).toBe(1);
    expect(save).toBe(0);
  });
  it('metin alanında F1 yardımı açıyor', () => {
    let count = 0;
    act(() => { kok!.render(<Sonda2 sayac={() => { count += 1; }} />); });
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    bas('F1', input, { alt: false });
    input.remove();
    expect(count).toBe(1);
  });
});

describe('F1 her görünümde kısayol listesini açıyor', () => {
  /* `?` bir KARAKTERDİR: senaryo yazarken soru işareti yazmak listeyi
     açmamalı. F1 hiçbir klavye düzeninde karakter üretmez. */
  it('senaryo görünümünde çıplak F1 açıyor, çıplak ? açmıyor', () => {
    let acilan = 0;
    act(() => { kok!.render(<Sonda2 sayac={() => { acilan += 1; }} />); });
    bas('?', document.body, { alt: false });
    expect(acilan, 'yazarken ? liste açmamalı').toBe(0);
    bas('F1', document.body, { alt: false });
    expect(acilan).toBe(1);
  });
});

describe('F8 sunum modunda genel kısayollar SESSİZ kalıyor (§13.2)', () => {
  /* `Presentation.tsx` kendi ←/→/Space/Esc katmanını kuruyor. Bu koruma
     yoksa `N`/`G` sunum sırasında panel oluşturup ızgaraya geçebilirdi. */
  it('N yeni panel oluşturmuyor', () => {
    useUiStore.setState({ viewMode: 'sunum' });
    const once = useProjectStore.getState().project.panels.length;
    bas('n', document.body, { alt: false });
    expect(useProjectStore.getState().project.panels.length).toBe(once);
  });

  it('G modu değiştirmiyor — Presentation kendi Esc\'ini yönetir', () => {
    useUiStore.setState({ viewMode: 'sunum' });
    bas('g', document.body, { alt: false });
    expect(useUiStore.getState().viewMode).toBe('sunum');
  });

  it('Space seçili aracı değiştirmiyor', () => {
    useUiStore.setState({ viewMode: 'sunum', tool: 'select' });
    bas(' ', document.body, { alt: false });
    expect(useUiStore.getState().tool).toBe('select');
  });
});
