import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EN } from '@storyboard/core/dil/arayuz';

/**
 * ANALİZ PANOSU — kablolama ve dil denetimi.
 *
 * Panelin GÖRÜNTÜSÜNÜ test etmiyoruz (tasarım kanvası o işi yapıyor);
 * burada denetlenen şey, panelin gerçekten ulaşılabilir olması ve
 * ekrandaki her dizginin İngilizce karşılığının bulunması.
 */

const oku = (...parcalar: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', ...parcalar), 'utf8');

const panel = oku('src', 'components', 'dialogs', 'AnalizPanosuDialog.tsx');
const studio = oku('src', 'components', 'Studio.tsx');
const tipler = oku('src', 'platform', 'types.ts');
const menu = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'apps', 'desktop', 'electron', 'menu.ts'),
  'utf8',
);

describe('panele ULAŞILABİLİYOR', () => {
  it('Studio paneli tanıyor ve çiziyor', () => {
    expect(studio).toContain('AnalizPanosuDialog');
    expect(studio).toContain('analizTamEkran &&');
  });

  it('menü eylemi Studio tarafından karşılanıyor', () => {
    expect(tipler, "MenuActionId'de 'analiz' yoksa menü derlenmez").toContain("| 'analiz'");
    expect(studio, 'menü eylemi karşılıksızsa düğme sessizce hiçbir şey yapar — §15.4')
      .toContain("case 'analiz': analizTamEkranAyarla(true); break;");
  });

  it('masaüstü menüsünde girişi var', () => {
    expect(menu).toContain("item('Analiz Panosu', 'analiz'");
    expect(menu).toContain("'Analiz Panosu': 'Analysis Board',");
  });
});

describe('panelde Türkçe sızıntısı yok', () => {
  /* `t('...')` ile sarılmış her dizgi toplanıp sözlükte aranıyor. Kaçan
     bir dizgi İngilizce arayüzde Türkçe görünür — bu programda o bir
     hatadır, kozmetik bir eksik değil. */
  const sarilmis = [...panel.matchAll(/\bt\('((?:[^'\\]|\\.)+)'\)/g)].map((m) => m[1]);

  it('sarılmış dizgi bulundu (tarayıcı gerçekten çalışıyor)', () => {
    expect(sarilmis.length).toBeGreaterThan(10);
  });

  it('her sarılmış dizginin İngilizce karşılığı var', () => {
    const eksik = [...new Set(sarilmis)].filter((s) => !(s in EN));
    expect(eksik, `sözlükte karşılığı olmayan: ${eksik.join(' | ')}`).toEqual([]);
  });
});

describe('grafikler gezinme aracı', () => {
  it('sahne şeridi tıklanınca senaryoya gidiyor', () => {
    expect(panel, 'grafik poster değil, gezinme aracı olmalı').toContain('blogaGit(s.ilkBlokId)');
    expect(panel).toContain('analiz-sahne-');
  });

  it('boş senaryoda panel çökmüyor, açık bir şey söylüyor', () => {
    expect(panel).toContain('Çözümlenecek senaryo yok.');
  });

  it('hiç karşılaşmayan çift YOKSA da bir şey yazıyor', () => {
    expect(panel, 'her durumun kendi gösterimi olmalı — boşluk bırakılmıyor')
      .toContain('her çift en az bir sahne paylaşıyor');
  });
});

describe('detay — seçilen çiftin sahneleri', () => {
  it('matris hücresi tıklanabilir ve çifti seçiyor', () => {
    expect(panel).toContain('matris-');
    expect(panel).toContain("onSec({ tur: 'cift', a: sutunAd, b: satirAd })");
  });

  it('detay listesi sahneye götürüyor', () => {
    expect(panel).toContain('detay-sahne-');
    expect(panel).toContain('blogaGit(s.ilkBlokId)');
  });

  it('senaryoda nerede şeridi var — liste hangileri, şerit nerede', () => {
    expect(panel).toContain('Senaryoda nerede');
  });

  it('üçüncü kişi yoksa da bir şey yazıyor', () => {
    expect(panel, 'boşluk veri eksik gibi okunur').toContain('yalnız ikisi');
  });

  it('hiç karşılaşmayan çift seçilirse açık cümle kuruluyor', () => {
    expect(panel).toContain('Bu ikili hiç aynı sahnede konuşmuyor.');
  });
});

describe('denetçi sekmesinden panele geçiş', () => {
  const sekme = oku('src', 'components', 'script', 'AnalizPanosu.tsx');

  it('sekmede panele götüren düğme var', () => {
    expect(sekme, 'bağlantı yoksa kullanıcı panelin varlığını menüyü tararsa öğrenir')
      .toContain('analiz-panele-git');
    expect(sekme).toContain('analizTamEkranAyarla(true)');
  });

  it('bayrak MAĞAZADA — iki yerden açıldığı için', () => {
    const ui = oku('src', 'store', 'ui.ts');
    expect(ui).toContain('analizTamEkran: boolean');
    expect(ui).toContain('analizTamEkranAyarla');
  });
});
