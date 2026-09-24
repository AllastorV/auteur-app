import * as Y from 'yjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { linkPanelScript, setScript } from '@storyboard/core/doc/mutations';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { bloktanPaneleGec, moduDegistir, odakOku, sunumdanCik } from '@storyboard/core/store/mod';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';
import type { ViewMode } from '@storyboard/core/store/ui';

const blok = (
  id: string,
  sceneId: string,
  type: ScriptBlockType = 'action',
  text = 'metin',
): ScriptBlock => ({ id, fp: '', type, text, scene: '', sceneId });

const SENARYO = {
  name: 'x',
  blocks: [
    blok('b1', 'sc1', 'scene', 'İÇ. ODA - GECE'),
    blok('b2', 'sc1'),
    blok('b3', 'sc1'),
    blok('b4', 'sc2', 'scene', 'DIŞ. SOKAK - GÜN'),
    blok('b5', 'sc2'),
  ],
};

/** Üç panelli, iki sahneli proje. `pn1`→`b2`, `pn2`→`b5`, `pn3` bağsız. */
function kur() {
  const paneller = [createPanel(), createPanel(), createPanel()].map((p, i) => ({
    ...p,
    id: `pn${i + 1}`,
  }));
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, { ...createProject({ panels: [] }), panels: paneller }, 'load');
  setScript(doc, SENARYO);
  linkPanelScript(doc, 'pn1', ['b2']);
  linkPanelScript(doc, 'pn2', ['b5']);
  useProjectStore.getState().attachDoc(doc, 'owner');
  return doc;
}

beforeEach(() => {
  kur();
  useUiStore.setState({
    viewMode: 'board',
    scriptSelection: [],
    scriptCursor: null,
    scriptAnchor: null,
  });
});

describe('Storyboard giriş aracı', () => {
  it('düzenleme yetkisinde kalemle başlar', () => {
    useUiStore.setState({ viewMode: 'senaryo', tool: 'select' });
    moduDegistir('board');
    expect(useUiStore.getState().tool).toBe('pen');
  });

  it('salt okunur girişte çizim aracını etkinleştirmez', () => {
    useProjectStore.setState({ role: 'viewer' });
    useUiStore.setState({ viewMode: 'senaryo', tool: 'select' });
    moduDegistir('board');
    expect(useUiStore.getState().tool).toBe('select');
  });
});

describe('F2 BİTİŞ KRİTERİ — modlar arası geçiş bağlamı koruyor', () => {
  it('panodan senaryoya: imleç o panelin bloğuna gidiyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    moduDegistir('senaryo');

    expect(useUiStore.getState().viewMode).toBe('senaryo');
    expect(useUiStore.getState().scriptCursor).toBe('b5');
    expect(useUiStore.getState().scriptSelection).toEqual(['b5']);
  });

  it('senaryodan panoya: aktif panel o bloğun paneli oluyor', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b2' });
    moduDegistir('board');

    expect(useUiStore.getState().viewMode).toBe('board');
    expect(useProjectStore.getState().activePanelId).toBe('pn1');
  });

  it('gidip GERİ gelince bağlam hâlâ duruyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    moduDegistir('senaryo');
    expect(useUiStore.getState().scriptCursor).toBe('b5');

    moduDegistir('board');
    expect(useProjectStore.getState().activePanelId).toBe('pn2');
  });

  it('ızgara ve pano aynı ekseni paylaşıyor — geçiş paneli bozmuyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    moduDegistir('grid');
    expect(useProjectStore.getState().activePanelId).toBe('pn2');
    moduDegistir('senaryo');
    expect(useUiStore.getState().scriptCursor).toBe('b5');
  });
});

describe('bağlam TÜRETİLEMEYİNCE mod kendi seçimini korur', () => {
  /* Rastgele bir yere atlamak, kullanıcıyı bağlamı korunmuş sanarak yanlış
     yere götürürdü. Uydurma yok. */
  it('bağsız panelden senaryoya geçince imleç yerinde kalıyor', () => {
    useUiStore.setState({ scriptCursor: 'b3', scriptSelection: ['b3'] });
    useProjectStore.getState().setActivePanel('pn3'); // hiçbir bloğa bağlı değil
    moduDegistir('senaryo');

    expect(useUiStore.getState().viewMode).toBe('senaryo');
    expect(useUiStore.getState().scriptCursor).toBe('b3');
  });

  it('paneli olmayan bloktan panoya geçince aktif panel yerinde kalıyor', () => {
    useProjectStore.getState().setActivePanel('pn3');
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b1' }); // b1 bağsız
    moduDegistir('board');

    expect(useUiStore.getState().viewMode).toBe('board');
    expect(useProjectStore.getState().activePanelId).toBe('pn3');
  });

  it('aynı moda geçmek hiçbir şeyi değiştirmiyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    moduDegistir('board');
    expect(useProjectStore.getState().activePanelId).toBe('pn2');
  });
});

describe('odak açık modun seçiminden OKUNUR, saklanmaz', () => {
  /* Saklansaydı her seçim değişiminde güncellenmediği sürece bayat kalırdı:
     modun seçimi ilerler, odak geride kalır. */
  it('pano modunda panelden okunuyor', () => {
    useProjectStore.getState().setActivePanel('pn1');
    const o = odakOku();
    expect(o.boardId).toBe('pn1');
    expect(o.blockId).toBe('b2');
    expect(o.sceneId).toBe('sc1');
  });

  it('senaryo modunda imleçten okunuyor', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b5' });
    const o = odakOku();
    expect(o.blockId).toBe('b5');
    expect(o.boardId).toBe('pn2');
    expect(o.sceneId).toBe('sc2');
  });

  it('seçim değişince odak ANINDA takip ediyor — bayatlamıyor', () => {
    useProjectStore.getState().setActivePanel('pn1');
    expect(odakOku().blockId).toBe('b2');
    useProjectStore.getState().setActivePanel('pn2');
    expect(odakOku().blockId).toBe('b5');
  });

  it('hiçbir şey seçili değilken yalnız belge kimliği dönüyor', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: null });
    expect(Object.keys(odakOku())).toEqual(['documentId']);
  });
});

describe('modlar birbirini TANIMIYOR (§7)', () => {
  /* `bloktanPaneleGec` eskiden `store/script.ts`'teydi ve senaryo modu
     storyboard modunun adını biliyordu. Gövde mod kabuğuna taşındı. */
  it('bağlı satırdan panele geçiliyor ve mod değişiyor', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b2' });
    expect(bloktanPaneleGec('b2')).toBe(true);
    expect(useProjectStore.getState().activePanelId).toBe('pn1');
    expect(useUiStore.getState().viewMode).toBe('board');
  });

  it('bağsız satırda hiçbir şey yapmıyor ve FALSE dönüyor', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b1' });
    const oncekiPanel = useProjectStore.getState().activePanelId;
    expect(bloktanPaneleGec('b1')).toBe(false);
    expect(useProjectStore.getState().activePanelId).toBe(oncekiPanel);
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  /* `after` ekseni hiçbir testte kurulmamıştı: fikstürde hiçbir blok İKİ
     panele bağlı değildi ve `after` argümanı hiç verilmiyordu. Mutant
     (`bagli[0]` döndürmek) hayatta kalıyordu — yani çok planlı bir satırda
     kullanıcı ikinci plana ASLA ulaşamazdı ve bu sessizce olurdu. */
  it('aynı satırın birden çok planı arasında DOLAŞILIYOR', () => {
    // `b2` artık hem pn1 hem pn3'e bağlı.
    linkPanelScript(useProjectStore.getState().doc, 'pn3', ['b2']);
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b2' });

    expect(bloktanPaneleGec('b2')).toBe(true);
    const ilk = useProjectStore.getState().activePanelId;

    expect(bloktanPaneleGec('b2', ilk)).toBe(true);
    const ikinci = useProjectStore.getState().activePanelId;
    expect(ikinci).not.toBe(ilk);

    // Sarmalıyor: sondan sonra başa döner.
    expect(bloktanPaneleGec('b2', ikinci)).toBe(true);
    expect(useProjectStore.getState().activePanelId).toBe(ilk);
  });

  /* §17 borcu: mod TAZE senaryodan (henüz `board`a geçmemişken) değişince
     `moduDegistir` içindeki `eksenUygula`, `scriptCursor`'dan `odakCoz` ile
     KENDİ boardId'sini türetip yazıyor. `odakCoz` çok-bağlı bir blokta her
     zaman belge sırasındaki İLK paneli döndürür — `after` ile istenen belirli
     hedefi değil. Mutasyon (setActivePanel'i eksenUygula'dan ÖNCEye almak)
     bu testi KIRDI: hedef pn3 iken sonuç pn1'e döndü. */
  it('senaryodan TAZE geçişte `after` ile hedeflenen panel `eksenUygula` tarafından EZİLMİYOR', () => {
    linkPanelScript(useProjectStore.getState().doc, 'pn3', ['b2']);
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b2' });
    expect(bloktanPaneleGec('b2', 'pn1')).toBe(true);
    expect(useProjectStore.getState().activePanelId).toBe('pn3');
  });

  it('tek plana bağlı satırda `after` verilse de aynı panelde kalıyor', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b5' });
    expect(bloktanPaneleGec('b5')).toBe(true);
    const tek = useProjectStore.getState().activePanelId;
    expect(bloktanPaneleGec('b5', tek)).toBe(true);
    expect(useProjectStore.getState().activePanelId).toBe(tek);
  });

  it('pano modundayken çağrılırsa mod değişmiyor, panel değişiyor', () => {
    useProjectStore.getState().setActivePanel('pn3');
    expect(bloktanPaneleGec('b5')).toBe(true);
    expect(useProjectStore.getState().activePanelId).toBe('pn2');
    expect(useUiStore.getState().viewMode).toBe('board');
  });
});

describe('mod → eksen eşlemesi TÜKETİCİ (§7)', () => {
  /* `mod === 'senaryo' ? 'blockId' : 'boardId'` yazıldığında §7'nin saydığı
     altı moddan yeni eklenen her biri SESSİZCE `boardId`'ye düşerdi: analiz
     modundan çıkarken `odakOku` panel seçimini okur, `eksenUygula` girilen
     modun seçimini ezer, hata da çıkmazdı. */
  const MODLAR: ViewMode[] = ['senaryo', 'board', 'grid', 'sunum'];

  it('her mod için bir eksen tanımlı ve geçişte bağlam korunuyor', () => {
    for (const mod of MODLAR) {
      useUiStore.setState({ viewMode: mod });
      // Çağrı fırlatmıyorsa eksen tanımlıdır; tanımsızda `eksenUygula` patlardı.
      expect(() => odakOku()).not.toThrow();
    }
  });

  it('senaryo modu BLOK eksenini, ötekiler PANEL eksenini sahipleniyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b5' });
    expect(odakOku().blockId).toBe('b5');

    useUiStore.setState({ viewMode: 'board' });
    expect(odakOku().boardId).toBe('pn2');

    useUiStore.setState({ viewMode: 'grid' });
    expect(odakOku().boardId).toBe('pn2');
  });
});

describe('Kartlar ve sunum PANEL ekseninde (§13.2)', () => {
  it('Kartlar da sunum da board gibi boardId sahipleniyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    useUiStore.setState({ viewMode: 'grid' });
    expect(odakOku().boardId).toBe('pn2');
    useUiStore.setState({ viewMode: 'sunum' });
    expect(odakOku().boardId).toBe('pn2');
  });

  it('Kartlar modundan panoya geçiş bağlamı taşıyor', () => {
    useProjectStore.getState().setActivePanel('pn1');
    moduDegistir('grid');
    expect(useUiStore.getState().viewMode).toBe('grid');
    moduDegistir('senaryo');
    expect(useUiStore.getState().scriptCursor).toBe('b2');
  });

  it('sunumdanCik GİRİLDİĞİ moda dönüyor, panoya değil', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b2' });
    moduDegistir('sunum');
    expect(useUiStore.getState().viewMode).toBe('sunum');

    sunumdanCik();
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  it('sunuma PANODAN girilince Esc pano moduna dönüyor', () => {
    useProjectStore.getState().setActivePanel('pn2');
    useUiStore.setState({ viewMode: 'board' });
    moduDegistir('sunum');
    sunumdanCik();
    expect(useUiStore.getState().viewMode).toBe('board');
  });

  it('hangi moddan girildiği BİLİNMİYORSA panoya döner (varsayılan)', () => {
    /* Modülün "önceki mod" belleği ÖNCE bilinen bir duruma getiriliyor
       (test SIRASINA bağımlı kalmamak için): bir kez girip çıkarak
       sıfırlanıyor, sonra sunuma hiç GİRMEDEN ikinci kez çağrılıyor —
       bellek boşken düşüş değeri `'board'` olmalı. */
    moduDegistir('sunum');
    sunumdanCik(); // bellek sıfırlandı
    moduDegistir('senaryo'); // sunuma HİÇ girmeden başka bir moda geç
    sunumdanCik(); // bellek boş — düşüş 'board' olmalı, 'senaryo' DEĞİL
    expect(useUiStore.getState().viewMode).toBe('board');
  });

  it('aynı moda ("sunum"dan "sunum"a) geçiş önceki modu EZMİYOR', () => {
    useUiStore.setState({ viewMode: 'senaryo', scriptCursor: 'b5' });
    moduDegistir('sunum');
    moduDegistir('sunum'); // no-op — suanki === mod
    sunumdanCik();
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });
});
