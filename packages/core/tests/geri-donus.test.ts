import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { kontrolNoktasinaDon, type GeriDonusKabugu } from '@storyboard/core/veri/geri-donus';
import { durumOzdes } from '@storyboard/core/veri/kurtarma';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';

/** Bellekte kontrol noktası deposu. */
function depo() {
  const noktalar = new Map<string, Uint8Array>();
  let sayac = 0;
  let yazmaHatasi: string | null = null;
  const kabuk: GeriDonusKabugu = {
    async guvenlikNoktasiYaz(cipa) {
      if (yazmaHatasi) throw new Error(yazmaHatasi);
      noktalar.set(`guvenlik-${sayac++}`, cipa);
    },
    async noktaOku(id) {
      const b = noktalar.get(id);
      if (!b) throw new Error(`yok: ${id}`);
      return b;
    },
  };
  return {
    kabuk,
    noktalar,
    yaz: (id: string, b: Uint8Array) => noktalar.set(id, b),
    bozuk: (v: string | null) => { yazmaHatasi = v; },
    sonGuvenlik: () => [...noktalar.keys()].filter((k) => k.startsWith('guvenlik-')).at(-1)!,
  };
}

function proje(baslik: string): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  doc.getMap('meta').set('title', baslik);
  return doc;
}

describe('§15.5 — geri dönüş MEVCUT DURUMU kaybetmiyor', () => {
  it('geri dönüşten de geri dönülür ve başlangıç durumu birebir gelir', async () => {
    const d = depo();

    // A durumu → kontrol noktası.
    const docA = proje('A');
    d.yaz('nokta-A', Y.encodeStateAsUpdate(docA));

    // A üzerine yazmaya devam → B durumu.
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    docB.getMap('meta').set('title', 'B');
    M.addPanel(docB);

    // B'deyken A'ya dön.
    const donus = await kontrolNoktasinaDon(docB, 'nokta-A', d.kabuk);
    expect(durumOzdes(donus.doc, docA)).toBe(true);

    // "Geri dönüşten geri dön": B birebir geri gelmeli.
    const geri = await kontrolNoktasinaDon(donus.doc, d.sonGuvenlik(), d.kabuk);
    expect(durumOzdes(geri.doc, docB)).toBe(true);
  });

  it('dönüşten ÖNCE güvenlik noktası yazılır', async () => {
    const d = depo();
    const docA = proje('A');
    d.yaz('nokta-A', Y.encodeStateAsUpdate(docA));
    const docB = proje('B');

    const sira: string[] = [];
    const izlenen: GeriDonusKabugu = {
      async guvenlikNoktasiYaz(c) { sira.push('guvenlik'); await d.kabuk.guvenlikNoktasiYaz(c); },
      async noktaOku(id) { sira.push('oku'); return d.kabuk.noktaOku(id); },
    };

    await kontrolNoktasinaDon(docB, 'nokta-A', izlenen);
    expect(sira).toEqual(['guvenlik', 'oku']);
  });

  /* Güvenlik noktası yazılamıyorsa dönüş HİÇ BAŞLAMAZ. "Hedefi yükleyip riski
     bildirelim" burada kabul edilemez: kullanıcı bildirimi okuduğunda iş
     çoktan gitmiş olur. */
  it('güvenlik noktası yazılamıyorsa dönüş iptal edilir ve hedef HİÇ okunmaz', async () => {
    const d = depo();
    const docA = proje('A');
    d.yaz('nokta-A', Y.encodeStateAsUpdate(docA));
    const docB = proje('B');
    d.bozuk('ENOSPC: disk dolu');

    const oku = vi.fn(d.kabuk.noktaOku);
    await expect(
      kontrolNoktasinaDon(docB, 'nokta-A', { ...d.kabuk, noktaOku: oku }),
    ).rejects.toThrow(/disk dolu/);
    expect(oku).not.toHaveBeenCalled();
    // Mevcut belge dokunulmadan duruyor.
    expect(docB.getMap('meta').get('title')).toBe('B');
  });

  it('hedef kontrol noktası bozuksa anlaşılır hata verir', async () => {
    const d = depo();
    d.yaz('bozuk', new Uint8Array(0));
    await expect(kontrolNoktasinaDon(proje('B'), 'bozuk', d.kabuk))
      .rejects.toThrow(/Kontrol noktasi acilamadi/);
  });

  it('olmayan kontrol noktası okunamaz', async () => {
    const d = depo();
    await expect(kontrolNoktasinaDon(proje('B'), 'yok-boyle', d.kabuk))
      .rejects.toThrow(/yok/);
  });

  it('art arda üç dönüş zinciri her adımda geri alınabilir', async () => {
    const d = depo();
    const durumlar: Y.Doc[] = [];
    let doc = proje('0');
    durumlar.push(doc);
    d.yaz('n0', Y.encodeStateAsUpdate(doc));

    for (let i = 1; i <= 3; i++) {
      const sonraki = new Y.Doc();
      Y.applyUpdate(sonraki, Y.encodeStateAsUpdate(doc));
      sonraki.getMap('meta').set('title', String(i));
      d.yaz(`n${i}`, Y.encodeStateAsUpdate(sonraki));
      durumlar.push(sonraki);
      doc = sonraki;
    }

    // 3'ten 0'a dön, sonra güvenlik noktasıyla 3'e geri.
    const sifira = await kontrolNoktasinaDon(durumlar[3], 'n0', d.kabuk);
    expect(durumOzdes(sifira.doc, durumlar[0])).toBe(true);
    const uce = await kontrolNoktasinaDon(sifira.doc, d.sonGuvenlik(), d.kabuk);
    expect(durumOzdes(uce.doc, durumlar[3])).toBe(true);
  });
});
