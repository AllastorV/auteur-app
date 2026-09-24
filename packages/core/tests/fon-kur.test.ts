import { describe, expect, it } from 'vitest';
import { fonBloklariKur, fonProjesiKur } from '@storyboard/core/fon/kur';
import { fonSablonu } from '@storyboard/core/fon/sablon';
import type { TuretmeGirdisi } from '@storyboard/core/fon/turet';
import { senaryoyuCozumle } from '@storyboard/core/model/analiz';
import { yapiIstatistigiCikar } from '@storyboard/core/model/yapi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { packProject, unpackProject } from '@storyboard/core/model/project-io';

/**
 * FON BELGESİNİN KURULUMU.
 *
 * Bu belge senaryonun İÇİNDE değil, ondan türetilmiş AYRI bir belge
 * (kullanıcı kararı 2026-09-01). Testin işi iki sözü tutturmak: kurumun
 * ek sırası korunuyor ve Auteur'ün üretmediği ekler belgeye boş başlık
 * olarak girmiyor.
 */

let sayac = 0;
const b = (tip: ScriptBlock['type'], text: string, sceneId = 'sc1'): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: text, type: tip, text, scene: '', sceneId });

const SENARYO: ScriptBlock[] = [
  b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
  b('action', 'Ayşe masaya oturur.', 'sc1'),
  b('character', 'AYŞE', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
];

function girdi(): TuretmeGirdisi {
  const tip = DOKUMAN_TIPLERI.senaryo;
  return {
    bloklar: SENARYO,
    analiz: senaryoyuCozumle(SENARYO, { dil: 'tr' }),
    yapi: yapiIstatistigiCikar(SENARYO, tip, tipProfili(tip.id, 'letter', 'tr')),
    tip,
    baslikSayfasi: { baslik: 'Bavul', yazar: 'Alp Cavas' },
    meta: {
      id: 'p1', name: 'Bavul', createdAt: 0, updatedAt: 1_700_000_000_000,
      author: 'Alp Cavas', description: '',
    },
    breakdown: {},
    karakterler: [],
    lokasyonlar: [],
    dil: 'tr',
  };
}

/** Sayaçlı kimlik: blok kimlikleri testte kararlı olsun. */
function kimlikUretici() {
  let n = 0;
  return () => `fb${n++}`;
}

describe('bölüm blokları', () => {
  const sablon = fonSablonu('sgm-senaryo')!;
  const bloklar = fonBloklariKur(sablon, girdi(), kimlikUretici());
  const basliklar = bloklar.filter((x) => x.type === 'bolum').map((x) => x.text);

  /* SIRA ŞABLONUN SIRASI. Kurumun ek listesi numaralı ve teslimde o numara
     okunuyor; alfabetik ya da "önce dolular" bir sıra, ekleri yanlış
     numarayla teslim ettirirdi. */
  it('kurumun ek sırası korunuyor', () => {
    expect(basliklar).toEqual([
      'Sinopsis',
      'Tretman',
      'Senaryo ve diyalog yazarı görüşü',
      'Senaryo ve diyalog yazarının biyografisi ve filmografisi',
    ]);
  });

  /* Auteur'ün üretmediği ekler (noter beyannamesi, uyarlama izni) belgeye
     GİRMİYOR: boş bir başlık olarak dursalardı kullanıcı oraya bir şey
     yazması gerektiğini sanırdı. Onlar kontrol listesinde duruyor. */
  it('dışarıdan alınan ekler belgeye girmiyor', () => {
    expect(basliklar).not.toContain('Noter onaylı imza beyannamesi örneği');
    expect(basliklar.some((a) => a.includes('Uyarlama'))).toBe(false);
  });

  /* Sinopsis türetilemez: başlık var, gövde YOK. Yer tutucu bir metin
     ("buraya sinopsis yazın") konsaydı kullanıcı silmeyi unuttuğunda o
     metin kuruma giderdi. */
  it('elle yazılan bölüm başlıkla başlıyor, gövdesi boş', () => {
    const i = bloklar.findIndex((x) => x.type === 'bolum' && x.text === 'Sinopsis');
    expect(bloklar[i + 1].type).toBe('bolum');
    expect(bloklar[i + 1].text).toBe('Tretman');
  });

  it('türetilen bölümün gövdesi dolu', () => {
    const i = bloklar.findIndex((x) => x.type === 'bolum' && x.text === 'Tretman');
    expect(bloklar[i + 1].type).toBe('paragraf');
    expect(bloklar[i + 1].text).toBe('Sahne listesi');
  });

  /* Sahne kimliği UYDURULMUYOR: bu belgenin yapı birimi `bolum` ve sınırı
     blok tipi çiziyor. Uydurma bir sceneId sahne bazlı her sorguyu
     yanıltırdı. */
  it('sahne kimliği boş', () => {
    for (const x of bloklar) {
      expect(x.sceneId, x.text).toBe('');
      expect(x.scene, x.text).toBe('');
    }
  });

  it('blok kimlikleri tekil', () => {
    const idler = bloklar.map((x) => x.id);
    expect(new Set(idler).size).toBe(idler.length);
  });
});

describe('proje kurulumu', () => {
  const sablon = fonSablonu('eurimages-coprod')!;
  const proje = fonProjesiKur({ sablon, girdi: girdi(), kimlik: kimlikUretici() });

  /* Şablon kimliği ayarlarda: belge açıldığında hangi kurumun listesine
     göre kurulduğu bilinmezse kontrol listesi neyi eksik sayacağını
     bilemez. `defaultSettings` alanları tek tek kopyaladığı için bu
     alanın düşmesi SESSİZ olurdu — `dokumanTipi` bir kez tam olarak
     böyle kaybolmuştu. */
  it('doküman tipi ve şablon kimliği yazılmış', () => {
    expect(proje.meta.dokumanTipi).toBe('fon-dosyasi');
    expect(proje.settings.fonSablonu).toBe('eurimages-coprod');
  });

  /* BELGE DİLİ ŞABLONDAN. Yazılmazsa büyütme kuralı YAZARIN diline göre
     işler ve İngilizce bir başlık Türkçe `İ` ile basılır: gerçek Electron
     penceresinde ölçüldü — `SYNOPSİS — ENGLİSH`, `SCRİPT — ORİGİNAL`. */
  it('belge dili şablondan yazılıyor', () => {
    expect(proje.settings.belgeDili).toBe('en');
    const sgm = fonProjesiKur({
      sablon: fonSablonu('sgm-senaryo')!, girdi: girdi(), kimlik: kimlikUretici(),
    });
    expect(sgm.settings.belgeDili).toBe('tr');
  });

  /* KAYNAK YAZILMAZSA TAZELEME ÖLÜR: "Senaryodan tazele" düğmesinin
     okuduğu tek şey bu alan. Yazılmasaydı düğme hiç görünmez ve fon
     dosyası ilk günkü hâlinde donardı. */
  it('kaynak senaryo kimliği, adı, yolu ve tarihi yazılmış', () => {
    const p = fonProjesiKur({
      sablon, girdi: girdi(), kimlik: kimlikUretici(),
      kaynakYol: 'C:/proje/bavul.sbp', simdi: () => 1_800_000_000_000,
    });
    expect(p.settings.fonKaynak).toEqual({
      projeId: 'p1', ad: 'Bavul', yol: 'C:/proje/bavul.sbp', turetildi: 1_800_000_000_000,
    });
  });

  /* Kaydedilmemiş senaryoda yol YOK ve bu `null` olarak yazılıyor: alanın
     hiç olmaması ile yolun bilinmemesi ayrı şeyler — ilkinde düğme
     çizilmiyor, ikincisinde bir kez dosya soruluyor. */
  it('kaydedilmemiş senaryoda yol null', () => {
    const p = fonProjesiKur({ sablon, girdi: girdi(), kimlik: kimlikUretici() });
    expect(p.settings.fonKaynak?.yol).toBeNull();
    expect(p.settings.fonKaynak?.projeId).toBe('p1');
  });

  /* ALANIN DİSKTEN SAĞ DÖNMESİ ayrıca ölçülüyor: bu depoda `dokumanTipi`
     tam olarak burada, `defaultSettings`in alan alan kopyasına
     eklenmediği için sessizce düşmüştü. */
  it('kaynak kayıt–yükleme turundan sağ çıkıyor', async () => {
    const p = fonProjesiKur({
      sablon, girdi: girdi(), kimlik: kimlikUretici(),
      kaynakYol: 'C:/proje/bavul.sbp', simdi: () => 1_800_000_000_000,
    });
    const geri = await unpackProject(await packProject({ project: p, assets: {} }));
    expect(geri.project.settings.fonKaynak).toEqual(p.settings.fonKaynak);
  });

  it('ad kaynak projeden ve şablondan türüyor', () => {
    expect(proje.meta.name).toBe('Bavul — Co-production Support');
    expect(proje.script.name).toBe(proje.meta.name);
  });

  it('verilen ad kullanılıyor', () => {
    const p = fonProjesiKur({ sablon, girdi: girdi(), ad: '  Bavul EU  ', kimlik: kimlikUretici() });
    expect(p.meta.name).toBe('Bavul EU');
  });

  /* Eurimages şablonu İngilizce: türetilmiş bölümlerin etiketleri de
     İngilizce olmalı. Şablonun dili girdiden değil ŞABLONDAN geliyor —
     çağıran (`FonOlusturDialog`) bunu `sablon.dil` ile veriyor. */
  it('belge yalnız üretilen bölümleri taşıyor', () => {
    const basliklar = proje.script.blocks.filter((x) => x.type === 'bolum').map((x) => x.text);
    /* ÇOK DİLLİ EK dil başına ayrı bölüm açıyor: Eurimages sinopsisi
       İngilizce VE Fransızca istiyor ve tek bölüm bırakılsaydı kontrol
       listesi "dolu" der, kullanıcı tek dille başvurur, başvuru elenirdi. */
    expect(basliklar).toContain('Synopsis — English');
    expect(basliklar).toContain('Synopsis — French');
    expect(basliklar).not.toContain('Detailed budget');
  });
});
