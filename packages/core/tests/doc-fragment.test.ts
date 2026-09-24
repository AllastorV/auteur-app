import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  baslikSayfasiMap, breakdownMap, ciftlerArray, copArray, docToProject, dunyalarMap,
  findPanelMap, karakterlerMap, lokasyonlarMap, panelsArray, readScript,
  revizyonIsaretleriMap, revizyonlarArray, scriptMap, senaryoFragment, sozlukMap,
  yerImleriMap,
  worldMapsMap,
} from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';
import { linkPanelScript, revizyonYayinla, setScript } from '@storyboard/core/doc/mutations';
import { blockFingerprint } from '@storyboard/core/model/script';
import { useProjectStore } from '@storyboard/core/store/project';
import { createProject } from '@storyboard/core/model/factory';
import type { ScriptBlock } from '@storyboard/core/model/script';

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '1', sceneId: 'sc_1' });

const SENARYO = {
  name: 'deneme',
  blocks: [
    blok('sb_1', 'scene', 'İÇ. MUTFAK - GECE'),
    blok('sb_2', 'action', 'Ayşe pencereyi açar.'),
  ],
};

describe('senaryoFragment', () => {
  it("kök bir Y.XmlFragment'tir", () => {
    const doc = new Y.Doc();
    expect(senaryoFragment(doc)).toBeInstanceOf(Y.XmlFragment);
  });

  it('setScript sonrası fragment blok başına bir düğüm taşır', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    expect(senaryoFragment(doc).length).toBe(2);
  });

  it('scriptMap artık blocks anahtarı taşımaz', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    expect(doc.getMap('script').get('blocks')).toBeUndefined();
    expect(doc.getMap('script').get('name')).toBe('deneme');
  });
});

describe('readScript', () => {
  it('gidiş-dönüş kimlikleri korur', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    expect(readScript(doc).blocks.map((b) => b.id)).toEqual(['sb_1', 'sb_2']);
  });

  it('fp SAKLANMAZ, hesaplanır — parseFountain ile aynı fonksiyondan', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const okunan = readScript(doc).blocks;
    const gorulen = new Map<string, number>();
    for (const [i, b] of okunan.entries()) {
      expect(b.fp).toBe(blockFingerprint(SENARYO.blocks[i].type, SENARYO.blocks[i].text, gorulen));
    }
  });

  it('fp sayacı HER blokta ilerler — tekrarlı bloklar ayrı parmak izi alır', () => {
    const doc = new Y.Doc();
    setScript(doc, {
      name: 'x',
      blocks: [blok('sb_a', 'character', 'AYŞE'), blok('sb_b', 'character', 'AYŞE')],
    });
    // ÖN KOŞUL: sayaç gerçekten tekrarla karşılaşmalı — iki blok aynı tip+metin.
    const depolanan = readScript(doc).blocks;
    expect(depolanan.map((b) => b.type + '|' + b.text)).toEqual([
      'character|AYŞE',
      'character|AYŞE',
    ]);
    const [a, b] = depolanan;
    expect(a.fp).not.toBe(b.fp);
  });
});

describe('metin sadakati', () => {
  it('biçim işareti ScriptBlock.text içine SIZMAZ', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const metin = (senaryoFragment(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    // ÖN KOŞUL: işaret gerçekten uygulanmalı — yoksa iddia boşlukta kalır.
    metin.format(0, 3, { bold: true });
    expect(metin.toDelta().some((d: { attributes?: unknown }) => d.attributes)).toBe(true);

    // Y.XmlText.toString() işareti `<bold>` etiketi olarak gömer. Depo katmanı
    // düz metin döndürmeli: `blockFingerprint` ve panel özetleri ham metne bakar.
    expect(readScript(doc).blocks[0].text).toBe(SENARYO.blocks[0].text);
  });
});

describe('üretim geri alma zinciri', () => {
  it('mağazanın UndoManager’ı senaryo METNİNİ de geri alır', () => {
    // Testin kendi UndoManager'ı üretimdekinin KOPYASIDIR; kopyaya kök eklemek
    // `attachUndo`yu düzeltmez. Burada üretim mağazasının kendisi sınanır:
    // fragment kökü izlenmezse geri alma senaryonun ADINI döndürür, METNİNİ değil.
    const { doc, undoManager } = useProjectStore.getState();
    setScript(doc, SENARYO);
    undoManager.stopCapturing();
    setScript(doc, { name: 'yanlis', blocks: [blok('sb_x', 'action', 'Yanlış dosya.')] });
    // ÖN KOŞUL: metin gerçekten değişmiş olmalı. (Kimliğe bakılmaz: `reconcileScript`
    // tek aksiyon bloğunu eskisiyle hizalayıp `sb_2`yi devreder — beklenen davranış.)
    expect(readScript(doc).blocks.map((b) => b.text)).toEqual(['Yanlış dosya.']);

    undoManager.undo();
    expect(readScript(doc).blocks.map((b) => b.id)).toEqual(['sb_1', 'sb_2']);
    expect(readScript(doc).blocks.map((b) => b.text))
      .toEqual(SENARYO.blocks.map((b) => b.text));
  });
});

describe('eşzamanlı yazma — göçün varlık sebebi', () => {
  it('İKİ YAZAR FARKLI BLOKLARI DÜZENLERSE İKİSİ DE KORUNUR', () => {
    const a = new Y.Doc();
    setScript(a, SENARYO);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // ÖN KOŞUL: iki belge de aynı metinden başlıyor — yoksa "ikisi de yaşadı"
    // iddiası boşlukta kalır.
    expect(readScript(b).blocks.map((x) => x.text))
      .toEqual(SENARYO.blocks.map((x) => x.text));

    // A birinci bloğun metnini değiştirir, B ikincininkini — aynı anda.
    // ERİŞİM YOLU (ölçüldü): fragment.get(i) bir Y.XmlElement, metni onun
    // 0. çocuğu olan Y.XmlText'tir.
    const metinA = (a.getXmlFragment('senaryo').get(0) as Y.XmlElement).get(0) as Y.XmlText;
    const metinB = (b.getXmlFragment('senaryo').get(1) as Y.XmlElement).get(0) as Y.XmlText;
    expect(metinA).toBeInstanceOf(Y.XmlText);
    expect(metinB).toBeInstanceOf(Y.XmlText);
    metinA.delete(0, 5);
    metinB.insert(0, 'Sonra ');

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const bloklarA = readScript(a).blocks;
    const bloklarB = readScript(b).blocks;
    expect(bloklarA.map((x) => x.text)).toEqual(bloklarB.map((x) => x.text));
    expect(bloklarA[0].text).not.toBe(SENARYO.blocks[0].text); // A'nın düzenlemesi
    expect(bloklarA[1].text.startsWith('Sonra ')).toBe(true);  // B'nin düzenlemesi
    // Kimlikler ikisinde de yerinde: eşzamanlı düzenleme panel bağını koparmaz.
    expect(bloklarA.map((x) => x.id)).toEqual(['sb_1', 'sb_2']);
  });
});

describe('scene/sceneId sadakati (Ö-1)', () => {
  it('gidiş-dönüşte scene ve sceneId de korunur', () => {
    // `sceneId` model/scenes.ts gruplamasının ve reconcileScript'in sahne
    // yürüyüşünün ÇAPASI — kaybolursa sahne yapısı sessizce dağılır.
    const doc = new Y.Doc();
    setScript(doc, {
      name: 'sahneli',
      blocks: [
        { id: 'sb_1', fp: '', type: 'scene', text: 'İÇ. MUTFAK', scene: '1', sceneId: 'sc_a' },
        { id: 'sb_2', fp: '', type: 'action', text: 'Ayşe girer.', scene: '1', sceneId: 'sc_a' },
        { id: 'sb_3', fp: '', type: 'scene', text: 'DIŞ. SOKAK', scene: '2A', sceneId: 'sc_b' },
      ],
    });
    const okunan = readScript(doc).blocks;
    expect(okunan.map((b) => b.scene)).toEqual(['1', '1', '2A']);
    expect(okunan.map((b) => b.sceneId)).toEqual(['sc_a', 'sc_a', 'sc_b']);
    // Depoda gerçekten attribute olarak duruyor mu — ön koşul.
    expect((senaryoFragment(doc).get(2) as Y.XmlElement).getAttribute('sceneId')).toBe('sc_b');
  });
});

describe('bozuk depo ONARILIR, belge açılamaz hâle GELMEZ (K-1)', () => {
  it('İKİ YAZAR AYNI ANDA SENARYO İÇE AKTARIRSA readScript PATLAMAZ', () => {
    // Fazın ikinci varlık sebebi: bu senaryo olağan kullanımdır, kurcalama değil.
    const a = new Y.Doc();
    setScript(a, SENARYO);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // İki yazar aynı anda revize edilmiş senaryoyu içe aktarıyor.
    setScript(a, { name: 'A', blocks: [blok('sb_yeniA', 'action', 'A yazdı.')] });
    setScript(b, { name: 'B', blocks: [blok('sb_yeniB', 'action', 'B yazdı.')] });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // ÖN KOŞUL: birleşme gerçekten yinelenen kimlik üretmiş olmalı — yoksa
    // "patlamıyor" iddiası boşlukta kalır.
    const hamIdler: string[] = [];
    senaryoFragment(a).forEach((el) => {
      hamIdler.push(String((el as Y.XmlElement).getAttribute('id')));
    });
    expect(hamIdler.length).toBeGreaterThan(new Set(hamIdler).size);

    // ASIL İDDİA: okuma yolu fırlatmıyor.
    const okunanA = readScript(a);
    const okunanB = readScript(b);

    // Her iki yazarın metni de okunabiliyor — hiçbiri kaybolmadı.
    expect(okunanA.blocks.map((x) => x.text)).toContain('A yazdı.');
    expect(okunanA.blocks.map((x) => x.text)).toContain('B yazdı.');
    // Onarım raporlandı, sessiz geçilmedi.
    expect(okunanA.onarimlar.length).toBeGreaterThan(0);
    // Kimlikler onarımdan sonra benzersiz.
    const idler = okunanA.blocks.map((x) => x.id);
    expect(new Set(idler).size).toBe(idler.length);
    // İki istemci aynı sonuca varıyor.
    expect(okunanB.blocks.map((x) => x.id)).toEqual(idler);
  });

  it('sağlam belgede onarım listesi boştur', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    expect(readScript(doc).onarimlar).toEqual([]);
  });
});

describe('bir blokta birden çok Y.XmlText (küçük 1)', () => {
  it('BÜTÜN metin çocukları birleştirilir — ikinci yazarın metni düşmez', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const el = senaryoFragment(doc).get(0) as Y.XmlElement;
    // Eşzamanlı yazımda Yjs bir blokta birden çok Y.XmlText tutabilir.
    el.insert(1, [new Y.XmlText(' EK METİN')]);
    expect(el.length).toBe(2); // ön koşul: gerçekten iki çocuk var
    expect(readScript(doc).blocks[0].text).toBe('İÇ. MUTFAK - GECE EK METİN');
  });
});

describe('geri alma zinciri — kök kapsamı (Ö-3 / Görev 4)', () => {
  it('üretim UndoManager’ı HER kullanıcı kökünü izler', () => {
    /* Kök sayısı iddiası: yeni bir kök eklenip listeye yazılmazsa o kökteki
       düzenleme sessizce geri alınamaz hâle gelir.

       SAYI 7'DEN 17'YE ÇIKTI (2026-08-30). Yedi kök izlenirken revizyon,
       yer imi, karakter, lokasyon, dünya, başlık sayfası, breakdown, çift
       listesi ve çöp kutusu kapsam DIŞINDAYDI: kullanıcı yanlışlıkla
       revizyon yayınlıyor, Ctrl+Z'ye basıyor, hiçbir şey olmuyordu — ve
       daha kötüsü, o çağrı ALAKASIZ bir önceki düzenlemeyi geri alıyordu.
       Kullanıcı gerçek pencerede bildirdi.

       Liste TEK TEK yazılıyor, yalnız uzunluk sayılmıyor: uzunluk testi
       bir kök eklenip başka biri düşürüldüğünde yeşil kalırdı. */
    const { undoManager, doc } = useProjectStore.getState();
    const beklenen = [
      doc.getMap('meta'), doc.getMap('settings'), panelsArray(doc),
      doc.getArray('customPoses'), doc.getMap('assets'), doc.getMap('script'), senaryoFragment(doc),
      sozlukMap(doc), yerImleriMap(doc), revizyonlarArray(doc),
      revizyonIsaretleriMap(doc), karakterlerMap(doc), lokasyonlarMap(doc),
      dunyalarMap(doc), worldMapsMap(doc), baslikSayfasiMap(doc), breakdownMap(doc),
      ciftlerArray(doc), copArray(doc),
    ];
    for (const kok of beklenen) expect(undoManager.scope).toContain(kok);
    expect(undoManager.scope).toHaveLength(beklenen.length);
  });

  it('yayınlanan revizyon geri alınabiliyor', () => {
    /* Kullanıcı şikâyetinin kendisi: "yanlışlıkla revizyon verdim diyelim
       geri alma yok, öyle kalıyor". Kapsam testi listeyi doğruluyor; bu
       test o listenin İŞE YARADIĞINI doğruluyor. */
    const { doc, undoManager } = useProjectStore.getState();
    undoManager.stopCapturing();
    const once = revizyonlarArray(doc).length;

    revizyonYayinla(doc);
    expect(revizyonlarArray(doc).length).toBe(once + 1);

    undoManager.undo();
    expect(revizyonlarArray(doc).length).toBe(once);
  });

  it('geri alma senaryoyu VE panel bağlarını birlikte döndürür', () => {
    const { doc, undoManager } = useProjectStore.getState();
    setScript(doc, SENARYO);
    const panelId = panelsArray(doc).get(0).get('id') as string;
    linkPanelScript(doc, panelId, ['sb_1']);
    undoManager.stopCapturing();

    setScript(doc, { name: 'yanlis', blocks: [blok('sb_z', 'action', 'Yanlış dosya.')] });
    // ÖN KOŞUL: bağ gerçekten budanmış olmalı.
    expect(findPanelMap(doc, panelId)!.get('scriptRefs')).toEqual([]);

    undoManager.undo();
    expect(readScript(doc).blocks.map((x) => x.id)).toEqual(['sb_1', 'sb_2']);
    // Budama izlenen işlemin dışına kayarsa senaryo geri gelir ama bağ gelmez.
    expect(findPanelMap(doc, panelId)!.get('scriptRefs')).toEqual(['sb_1']);
  });
});

describe('onarım raporu VERİ DEĞİL — ScriptDoc sözleşmesinden sızmaz', () => {
  /** İki yazarın eşzamanlı içe aktarımı: gerçekten yinelenen kimlik üretir. */
  const bozukBelge = (): Y.Doc => {
    const a = new Y.Doc();
    setScript(a, SENARYO);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setScript(a, { name: 'A', blocks: [blok('sb_1', 'action', 'A yazdı.')] });
    setScript(b, { name: 'B', blocks: [blok('sb_1', 'action', 'B yazdı.')] });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    return a;
  };

  it('docToProject().script yalnız ScriptDoc anahtarlarını taşır', () => {
    const doc = bozukBelge();
    // ÖN KOŞUL: belge gerçekten onarılıyor olmalı, yoksa test boşa döner.
    expect(readScript(doc).onarimlar.length).toBeGreaterThan(0);
    expect(Object.keys(docToProject(doc).script).sort()).toEqual(['blocks', 'name']);
  });

  it('korumalı izdüşüme TÜRETİLMİŞ onarım verisi girmez', () => {
    const doc = bozukBelge();
    expect(readScript(doc).onarimlar.length).toBeGreaterThan(0);
    // İzdüşüm rol denetiminin karşılaştırma tabanıdır; türetilmiş alan orada
    // yanlış red üretme riski taşır ve sözleşme dışıdır.
    expect(protectedProjection(doc)).not.toContain('onarimlar');
  });
});

describe('onarım raporu ÜÇ giriş yolunda da doğru (Ö-1)', () => {
  /* Rapor yalnız `doc.on('update')` yolundan yazılırsa belgeyi DEĞİŞTİREN iki
     yol sessiz kalır: odaya katılan salt-okur bir katılımcıya sonraki güncelleme
     hiç gelmeyebilir. "Sessizce onarmak yasak" (Karar 10) her yolda tutmalı. */
  const bozukBelge = (): Y.Doc => {
    const a = new Y.Doc();
    setScript(a, SENARYO);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setScript(a, { name: 'A', blocks: [blok('sb_1', 'action', 'A yazdı.')] });
    setScript(b, { name: 'B', blocks: [blok('sb_1', 'action', 'B yazdı.')] });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    return a;
  };

  it('attachDoc BOZUK belgeye bağlanınca rapor state’e düşer', () => {
    const doc = bozukBelge();
    // ÖN KOŞUL: belge gerçekten onarılıyor olmalı.
    expect(readScript(doc).onarimlar.length).toBeGreaterThan(0);
    useProjectStore.getState().attachDoc(doc, 'owner');
    expect(useProjectStore.getState().scriptRepairs.length).toBeGreaterThan(0);
  });

  it('replaceProject TEMİZ projeye geçince eski rapor TEMİZLENİR', () => {
    useProjectStore.getState().attachDoc(bozukBelge(), 'owner');
    expect(useProjectStore.getState().scriptRepairs.length).toBeGreaterThan(0);
    useProjectStore.getState().replaceProject(createProject());
    // Yanlış alarm da bir hatadır: temiz belgede onarım uyarısı gösterilemez.
    expect(useProjectStore.getState().scriptRepairs).toEqual([]);
  });
});

describe('yazım İSTİSNA-GÜVENLİ — yarım kalan yazım metni silmez (§15, K-2)', () => {
  it('doldurma adımı FIRLARSA senaryo el değmemiş kalır', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const once = readScript(doc).blocks.map((b) => b.text);

    // `text: null` NFC normalize'ında fırlar. Bugün UI'dan erişilemiyor
    // (`migrateProject` dizgiye zorluyor) ama tek yeni çağıran uzakta.
    expect(() => setScript(doc, {
      name: 'z',
      blocks: [{ ...blok('sb_q', 'action', ''), text: null as unknown as string }],
    })).toThrow();

    expect(readScript(doc).blocks.map((b) => b.text)).toEqual(once);
    expect(senaryoFragment(doc).length).toBe(SENARYO.blocks.length);
  });
});

describe('senaryo adı da güven sınırının İÇİNDE (K-3)', () => {
  it('depo `name` yerine nesne taşıyorsa boş dizgeye normalize edilir', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    scriptMap(doc).set('name', { kotu: 1 } as unknown as string);
    // `ScriptDoc.name: string` sözleşmesi; panel bu değeri React çocuğu olarak
    // basıyor, nesne gelirse ekran çöker.
    expect(typeof readScript(doc).name).toBe('string');
    expect(readScript(doc).name).toBe('');
    expect(typeof docToProject(doc).script.name).toBe('string');
  });
});
