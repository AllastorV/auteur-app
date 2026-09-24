import { describe, expect, it } from 'vitest';
import { ORIJINAL, fonBolumleri, fonSablonlari, fonSablonu } from '@storyboard/core/fon/sablon';

/**
 * FON ŞABLONLARI — kurumun ek listesi VERİ, kod değil.
 *
 * Bu testlerin çoğu "alan dolu mu" gibi görünüyor ama hepsi ölçülmüş bir
 * hatayı kapatıyor: yanlış ya da eksik bir ek listesiyle yapılan başvuru
 * ELENİYOR (Eurimages'ta bu kural yazılı). Şablonun hangi sürüme baktığı
 * ve nereden alındığı ekranda görünmek zorunda; alan boş kalırsa ekran
 * sessizce bunu söylemez.
 */

const SABLONLAR = fonSablonlari();

describe('şablon kayıt defteri', () => {
  it('dört şablon tanımlı ve kimlikleri tekil', () => {
    expect(SABLONLAR.map((s) => s.id)).toEqual([
      'sgm-senaryo', 'sgm-uzun-metraj', 'sgm-ortak-yapim', 'eurimages-coprod',
    ]);
  });

  /* Kurum listeleri YILLIK değişiyor (indirilen paketlerin adları
     `…-01102025.doc`, `…-v3.doc`). Sürüm ve kaynak olmadan kullanıcı hangi
     yılın listesine baktığını bilemez. */
  it('her şablon sürümünü ve kaynağını taşıyor', () => {
    for (const s of SABLONLAR) {
      expect(s.surum.trim(), `${s.id} sürüm`).not.toBe('');
      expect(s.kaynak.url, `${s.id} kaynak url`).toMatch(/^https:\/\//);
      expect(s.kaynak.erisim, `${s.id} erişim tarihi`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.basvuruKanali.trim(), `${s.id} kanal`).not.toBe('');
    }
  });

  it('bölüm kimlikleri şablon içinde tekil ve bölümler boş değil', () => {
    for (const s of SABLONLAR) {
      const idler = s.bolumler.map((b) => b.id);
      expect(new Set(idler).size, `${s.id} yinelenen bölüm`).toBe(idler.length);
      expect(s.bolumler.length, `${s.id} bölümsüz`).toBeGreaterThan(0);
      for (const b of s.bolumler) {
        expect(b.ad.trim(), `${s.id}/${b.id} ad`).not.toBe('');
        expect(b.aciklama.trim().length, `${s.id}/${b.id} açıklama`).toBeGreaterThan(10);
      }
    }
  });

  /* Auteur'ün ÜRETMEDİĞİ ek (noter belgesi, ticaret odası kaydı) bir
     türeticiye bağlanamaz: bağlansaydı "taslak üret" düğmesi çıkar ve
     olmayan bir yeteneği vaat ederdi. */
  it('üretilmeyen bölümün kaynağı her zaman elle', () => {
    for (const s of SABLONLAR) {
      for (const b of s.bolumler.filter((x) => !x.uretilir)) {
        expect(b.kaynak, `${s.id}/${b.id}`).toBe('elle');
      }
    }
  });

  it('bilinmeyen kimlik null döner, prototip kirliliği sızmaz', () => {
    expect(fonSablonu('yok-boyle-bir-sey')).toBeNull();
    expect(fonSablonu('__proto__')).toBeNull();
    expect(fonSablonu(undefined)).toBeNull();
    expect(fonSablonu('sgm-senaryo')?.id).toBe('sgm-senaryo');
  });
});

describe('SGM — ölçülmüş gerçek', () => {
  const sgm = SABLONLAR.filter((s) => s.id.startsWith('sgm-'));

  /* SAYFA SINIRI RESMÎ KAYNAKTA YOK. Dört başvuru paketi, yönetmelik
     (RG 2019-10-15) ve SSS sayfası tarandı; "sinopsis 2 sayfa" gibi
     sayılar yalnız kaynaksız ikincil rehberlerde geçiyor. Uydurulmuş bir
     sınır, olmayan bir kuralı kullanıcıya dayatırdı. */
  it('hiçbir SGM bölümüne sınır uydurulmamış', () => {
    for (const s of sgm) {
      for (const b of s.bolumler) {
        expect(b.sinir, `${s.id}/${b.id} sınır uydurulmuş`).toBeNull();
      }
    }
  });

  /* Kurumun KENDİ yazdığı tek biçim şartı: uzun metraj ek 6 ve 7 için
     "(MS Word formatında hazırlanmalıdır)". Başka hiçbir ekte biçim
     dayatması yazılı değil. */
  it('uzun metrajda yalnız iki biyografi eki DOCX şartlı', () => {
    const um = fonSablonu('sgm-uzun-metraj')!;
    const docx = um.bolumler.filter((b) => b.bicim === 'docx').map((b) => b.id);
    expect(docx).toEqual(['yonetmen-biyo', 'yapimci-biyo']);
  });

  /* Ortak yapımda yaratıcı eklerin her biri "ve Türkçe tercümesi" ile
     birlikte isteniyor — kurumun listesindeki ad bunu birebir söylüyor. */
  it('ortak yapımda yaratıcı ekler Türkçe tercüme istiyor', () => {
    const oy = fonSablonu('sgm-ortak-yapim')!;
    for (const id of ['sinopsis', 'tretman', 'senaryo', 'yonetmen-gorusu']) {
      const b = oy.bolumler.find((x) => x.id === id)!;
      expect(b.diller, `${id} dilleri`).toContain('tr');
      expect(b.ad, `${id} adı`).toContain('Türkçe tercümesi');
    }
  });
});

describe('Eurimages — yazılı ve sert kurallar', () => {
  const eu = fonSablonu('eurimages-coprod')!;

  /* Screen 6 belgesinden birebir: belgeler PDF olmak zorunda (yalnız bütçe
     tabloları EXCEL), dosya başına 6 MB, filmin özgün adı her belgede,
     dosya adları içeriğe atıflı ve EKSİK EK BAŞVURUYU ELİYOR. */
  it('teslim kuralları ölçülen değerlerde', () => {
    expect(eu.teslim.bicim).toEqual(['pdf', 'xlsx']);
    expect(eu.teslim.azamiBayt).toBe(6 * 1024 * 1024);
    expect(eu.teslim.baslikHerBelgede).toBe(true);
    expect(eu.teslim.dosyaAdiIcerikAtifli).toBe(true);
    expect(eu.teslim.eksikEkElenmeSebebi).toBe(true);
  });

  /* Tek yazılı sayfa sınırı bu: "A synopsis of the film (maximum 3 pages)". */
  it('yalnız sinopsiste sayfa sınırı var ve üç sayfa', () => {
    const sinirli = eu.bolumler.filter((b) => b.sinir);
    expect(sinirli.map((b) => b.id)).toEqual(['synopsis']);
    expect(sinirli[0].sinir).toEqual({ birim: 'sayfa', azami: 3 });
  });

  it('sinopsis, yönetmen ve yapımcı notu İngilizce VE Fransızca', () => {
    for (const id of ['synopsis', 'director-note', 'producer-note']) {
      expect(eu.bolumler.find((b) => b.id === id)!.diller, id).toEqual(['en', 'fr']);
    }
  });

  it('belge dili İngilizce — çıktı kuruma gidiyor', () => {
    expect(eu.dil).toBe('en');
  });
});

describe('çok dilli ekler', () => {
  /* Eurimages sinopsisi İngilizce VE Fransızca istiyor. Tek bölüm
     bırakılsaydı kontrol listesi "dolu" der, kullanıcı tek dille başvurur
     ve EKSİK EK başvuruyu doğrudan elerdi — bu kural Eurimages'ta yazılı. */
  it('Eurimages sinopsisi iki dilde iki bölüm açıyor', () => {
    const eu = fonSablonu('eurimages-coprod')!;
    const ornekler = fonBolumleri(eu).filter((o) => o.bolum.id === 'synopsis');
    expect(ornekler.map((o) => o.id)).toEqual(['synopsis:en', 'synopsis:fr']);
    expect(ornekler.map((o) => o.ad)).toEqual(['Synopsis — English', 'Synopsis — French']);
  });

  /* SGM ortak yapımda kurumun kendi sözü "ve Türkçe tercümesi": özgün dil
     ve Türkçe iki ayrı ek. */
  it('ortak yapımda özgün dil ve Türkçe ayrı bölüm', () => {
    const oy = fonSablonu('sgm-ortak-yapim')!;
    const ornekler = fonBolumleri(oy).filter((o) => o.bolum.id === 'sinopsis');
    expect(ornekler.map((o) => o.dil)).toEqual([ORIJINAL, 'tr']);
    expect(ornekler[0].ad).toContain('özgün dil');
    expect(ornekler[1].ad).toContain('Türkçe');
  });

  /* AUTEUR ÇEVİRMİYOR: taslak yalnız ilk dilde yazılıyor, çeviri bölümü
     BOŞ açılıyor. Makine çevirisiyle doldurmak, kuruma giden bir belgeye
     denetlenmemiş metin koymak olurdu. */
  it('taslak yalnız ilk dilde üretiliyor', () => {
    const eu = fonSablonu('eurimages-coprod')!;
    const ornekler = fonBolumleri(eu).filter((o) => o.bolum.id === 'synopsis');
    expect(ornekler.map((o) => o.taslakli)).toEqual([true, false]);
  });

  it('tek dilli ek dil eki taşımıyor', () => {
    const sgm = fonSablonu('sgm-senaryo')!;
    const sinopsis = fonBolumleri(sgm).find((o) => o.bolum.id === 'sinopsis')!;
    expect(sinopsis.id).toBe('sinopsis');
    expect(sinopsis.ad).toBe('Sinopsis');
  });

  it('dışarıdan alınan ekler bölüm açmıyor', () => {
    const sgm = fonSablonu('sgm-senaryo')!;
    expect(fonBolumleri(sgm).some((o) => o.bolum.id === 'imza-beyannamesi')).toBe(false);
  });

  /* Örnek kimlikleri tekil olmalı: çakışan iki kimlik kontrol listesinde
     aynı satırı iki kez gösterir ve pakette dosya adını ezerdi. */
  it('bütün şablonlarda örnek kimlikleri tekil', () => {
    for (const sablon of SABLONLAR) {
      const idler = fonBolumleri(sablon).map((o) => o.id);
      expect(new Set(idler).size, sablon.id).toBe(idler.length);
      for (const o of fonBolumleri(sablon)) {
        expect(o.ad.trim(), `${sablon.id}/${o.id}`).not.toBe('');
      }
    }
  });
});
