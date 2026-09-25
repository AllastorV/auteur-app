import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { arayuzDiliniAyarla, EN } from '@storyboard/core/dil/arayuz';
import { insanaGoreZaman } from '@storyboard/core/util/zaman';
import { tercihiCoz, VARSAYILAN_TERCIH } from '@storyboard/core/format/tercih';
import { dosyaAdiDegiskenleri, renderFileNameTemplate } from '@storyboard/core/model/project-io';
import { onarimMesaji } from '@storyboard/core/editor/onarim-rapor';
import { sureMetni } from '@storyboard/core/veri/kurtarma-ozeti';
import { SOZLER, sozKimi } from '@storyboard/core/components/kitaplik/sozler';
import { sunucuMetni } from '@storyboard/core/collab/api';
import { okubeniAdi } from '@storyboard/core/kanit/paket';
import { CAMERA_CATEGORIES, CAMERA_PRESETS } from '@storyboard/core/data/cameras';
import { TEMPLATES } from '@storyboard/core/data/templates';
import { PROP_CATEGORIES, PROPS } from '@storyboard/core/data/props';
import { SAYFA_RENGI_ADLARI } from '@storyboard/core/format/sayfa-rengi';

/**
 * İNGİLİZCE ARAYÜZ DENETİMİ (2026-09-25) — kalıcı koruma bandı.
 *
 * `i18n-kapsam.test.ts` yeşilken İngilizce arayüzde Türkçe metin vardı:
 * `0/9 bağlı`, sürüm geçmişinde `az önce`, kırmızı veri kaybı şeridi,
 * dışa aktarma ilerlemesi, sunucunun davet hataları. Hepsi o testin
 * desen tarayıcısının kör noktalarındaydı: `{ifade}` çevresindeki JSX
 * metni, `.ts` dosyalarındaki template literal'ler, `tf()` anahtarları
 * (sözleşme yalnız `t('…')` arıyordu) ve sunucudan gelen mesajlar.
 *
 * Buradaki tarama REGEX DEĞİL, TypeScript ayrıştırıcısı: JSX metni ve
 * template literal AST düğümü olarak görülüyor, satır biçimine takılmıyor.
 */

afterEach(() => arayuzDiliniAyarla('tr')); // testler Türkçe koşuyor (tests/kurulum-dil.ts)

const SRC = path.join(__dirname, '..', 'src');
const WEB = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SERVER = path.join(__dirname, '..', '..', '..', 'apps', 'server', 'src');
const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

function dosyalar(kok: string, desen = /\.tsx?$/): string[] {
  const cikti: string[] = [];
  const gez = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const ad of fs.readdirSync(d)) {
      const y = path.join(d, ad);
      if (fs.statSync(y).isDirectory()) gez(y);
      else if (desen.test(ad) && !ad.includes('.test.')) cikti.push(y);
    }
  };
  gez(kok);
  return cikti;
}

const CEVIRI_CAGRILARI = new Set(['t', 'tf', 'ceviri']);

/** Bir kaynaktaki çevrilmemiş Türkçe JSX metni ve template literal'ler. */
export function cevrilmemisler(yol: string, kaynak: string): string[] {
  const sf = ts.createSourceFile(yol, kaynak, ts.ScriptTarget.Latest, true,
    yol.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const cevirideMi = (n: ts.Node): boolean => {
    for (let p = n.parent; p; p = p.parent) {
      if (!ts.isCallExpression(p)) continue;
      const e = p.expression;
      if (ts.isIdentifier(e) && CEVIRI_CAGRILARI.has(e.text)) return true;
      // console.* çıktısı geliştirici günlüğü, arayüz değil.
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'console') return true;
    }
    return false;
  };
  const bulgular: string[] = [];
  const gez = (n: ts.Node) => {
    let metin: string | null = null;
    if (ts.isJsxText(n)) metin = n.text.replace(/\s+/g, ' ').trim();
    else if (ts.isNoSubstitutionTemplateLiteral(n)) metin = n.text;
    else if (ts.isTemplateExpression(n)) metin = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join('…');
    if (metin && TURKCE.test(metin) && !cevirideMi(n)) {
      bulgular.push(`${path.basename(yol)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}  ${metin.slice(0, 80)}`);
    }
    ts.forEachChild(n, gez);
  };
  gez(sf);
  return bulgular;
}

describe('İngilizce arayüz — AST taraması', () => {
  /* Arayüze metin üreten katmanlar. `format/`, `model/` gibi katmanlar
     BELGE diliyle konuşur (senaryo terimleri) ve burada taranmaz. */
  const KATMANLAR = ['components', 'hooks', 'store', 'veri', 'editor', 'export', 'collab', 'util']
    .map((k) => path.join(SRC, k));

  it('JSX metninde ve template literal\'lerde çevrilmemiş Türkçe yok', () => {
    const yollar = [...KATMANLAR.flatMap((k) => dosyalar(k)), ...dosyalar(WEB)];
    expect(yollar.length).toBeGreaterThan(100); // tarama gerçekten geziyor
    const bulgular = yollar.flatMap((y) => cevrilmemisler(y, fs.readFileSync(y, 'utf8')));
    expect(bulgular).toEqual([]);
  });

  it('tarayıcı GERÇEKTEN yakalıyor — denetimin bulduğu dört kör nokta', () => {
    // {ifade} sonrasındaki JSX metni (`0/9 bağlı`)
    expect(cevrilmemisler('a.tsx', 'const x = <span>{a}/{b} bağlı</span>;')).toHaveLength(1);
    // çok satırlı, ortasında ifade olan JSX metni (veri kaybı şeridi)
    expect(cevrilmemisler('a.tsx', 'const x = <div>\n  Yazdıkların kaydedilemiyor: {h}. Başka\n  yere kaydet.\n</div>;')).toHaveLength(2);
    // .ts içindeki template literal (bildirim)
    expect(cevrilmemisler('a.ts', 'showToast(`${n} satır bağlandı.`);')).toHaveLength(1);
    // Sarılmış olan ve günlük çıktısı yakalanmamalı
    expect(cevrilmemisler('a.ts', "showToast(tf('%d satır bağlandı.', n));")).toEqual([]);
    expect(cevrilmemisler('a.ts', 'console.warn(`[pencere] yükleme başarısız`);')).toEqual([]);
    expect(cevrilmemisler('a.tsx', "const x = <span>{t('Kaydet')}</span>;")).toEqual([]);
  });
});

describe('sözlük sözleşmesi — tf() ve sunucu mesajları', () => {
  it("tf('…') ve ceviri('…') ile sarılmış her dizginin EN karşılığı var", () => {
    /* `arayuz-dili.test.ts` yalnız `t('…')` arıyordu; `tf('Rol güncellendi: %s')`
       ve `t as ceviri` takma adıyla sarılmış `ceviri('Senaryoda hiç sahne yok.')`
       bu yüzden sözlüksüz kalmıştı (ikincisi çalışma zamanı denetiminde görüldü). */
    const eksik = new Set<string>();
    for (const yol of [...dosyalar(SRC), ...dosyalar(WEB)]) {
      if (yol.endsWith(`dil${path.sep}arayuz.ts`)) continue;
      for (const m of fs.readFileSync(yol, 'utf8').matchAll(/\b(?:tf|ceviri)\(\s*'((?:[^'\\]|\\.)+)'/g)) {
        const anahtar = m[1].replace(/\\'/g, "'");
        if (!(anahtar in EN)) eksik.add(`${anahtar}  ←  ${path.basename(yol)}`);
      }
    }
    expect([...eksik]).toEqual([]);
  });

  it('sunucunun istemciye gönderdiği her mesajın EN karşılığı var', () => {
    /* Sunucu mesajları anahtar olarak gelir, `sunucuMetni` çevirir. Sunucuya
       yeni bir hata eklenip sözlük unutulursa İngilizce arayüz Türkçe basar. */
    arayuzDiliniAyarla('en');
    const eksik: string[] = [];
    for (const yol of dosyalar(SERVER, /\.ts$/)) {
      const icerik = fs.readFileSync(yol, 'utf8');
      for (const m of icerik.matchAll(/\b(?:error|reason):\s*(['`])((?:(?!\1)[^\\]|\\.)+)\1/g)) {
        const ornek = m[2].replace(/\$\{[^}]+\}/g, '7');
        if (!TURKCE.test(ornek)) continue;
        if (sunucuMetni(ornek) === ornek) eksik.push(`${path.basename(yol)}: ${m[2]}`);
      }
    }
    expect(eksik).toEqual([]);
  });
});

describe('kütüphane veri tabloları — ekranda görünen her alan çevrili', () => {
  /* Çalışma zamanı denetimi (2026-09-25): Storyboard kütüphanesinde kamera
     açıklamaları ve şablon adları İngilizce arayüzde Türkçe görünüyordu.
     `i18n-veri-tablolari` kategori etiketlerini ölçüyordu; ADLAR ve
     AÇIKLAMALAR ölçülmüyordu. Bu test gösterilen HER alanı ölçer. */
  it('kamera presetleri, şablonlar ve objeler', () => {
    /* `kesin`: alan HER ZAMAN Türkçe metindir, harfine bakılmaz — "Kamera
       yana yatar; huzursuzluk ve dengesizlik hissi." hiç Türkçe harf
       içermiyor ve harf kuralı onu kaçırmıştı (çalışma zamanı denetimi). */
    const eksik = (ad: string, liste: readonly Record<string, unknown>[], alanlar: string[], kesin = false) =>
      liste.flatMap((o) => alanlar
        .filter((a) => typeof o[a] === 'string' && (kesin || TURKCE.test(o[a] as string)) && !((o[a] as string) in EN))
        .map((a) => `${ad}.${a}: ${o[a]}`));
    expect([
      // `name`/`nameTr` sözlükten değil `kameraAdi()` ile seçilir; açıklama sözlükten.
      ...eksik('CAMERA_PRESETS', CAMERA_PRESETS as never, ['description'], true),
      ...eksik('CAMERA_CATEGORIES', CAMERA_CATEGORIES as never, ['label']),
      ...eksik('TEMPLATES', TEMPLATES as never, ['name', 'description'], true),
      ...eksik('PROPS', PROPS as never, ['name']),
      ...eksik('PROP_CATEGORIES', PROP_CATEGORIES as never, ['label']),
      ...Object.values(SAYFA_RENGI_ADLARI).filter((ad) => !(ad in EN)).map((ad) => `SAYFA_RENGI_ADLARI: ${ad}`),
    ]).toEqual([]);
  });
});

describe('İngilizce çıktılar', () => {
  it('göreli zaman', () => {
    arayuzDiliniAyarla('en');
    const simdi = 10_000_000;
    expect(insanaGoreZaman(simdi - 20_000, simdi)).toBe('just now');
    expect(insanaGoreZaman(simdi - 5 * 60_000, simdi)).toBe('5 min ago');
    expect(insanaGoreZaman(simdi - 80 * 60_000, simdi)).toBe('1 h 20 min ago');
    arayuzDiliniAyarla('tr');
    expect(insanaGoreZaman(simdi - 80 * 60_000, simdi)).toBe('1 saat 20 dakika önce');
  });

  it('belge dili, kayıtlı tercih yoksa arayüz dilini izler; açık seçim önceliklidir', () => {
    arayuzDiliniAyarla('en');
    expect(VARSAYILAN_TERCIH.dil).toBe('en');
    expect(tercihiCoz(null).dil).toBe('en');
    expect(tercihiCoz(JSON.stringify({ dil: 'tr' })).dil).toBe('tr');
    arayuzDiliniAyarla('tr');
    expect(tercihiCoz(null).dil).toBe('tr');
  });

  it('dosya adı şablonu İngilizce değişkenlerle önerilir ve iki takım da çalışır', () => {
    const en = dosyaAdiDegiskenleri('en');
    expect(en.adlar).toEqual(['scene', 'shot', 'panel', 'name']);
    const vars = { sahne: '1', cekim: '3', panel: 7, ad: 'Mara' };
    expect(renderFileNameTemplate(en.varsayilan, vars)).toBe('S1_C3.png');
    expect(renderFileNameTemplate(dosyaAdiDegiskenleri('tr').varsayilan, vars)).toBe('S1_C3.png');
  });

  it('onarım ve kurtarma metinleri', () => {
    arayuzDiliniAyarla('en');
    expect(onarimMesaji([{ sebep: 'kimliksiz' } as never, { sebep: 'yinelenen' } as never]))
      .toMatch(/^2 block IDs were repaired while opening the document \(1 duplicate, 1 missing\)\./);
    expect(sureMetni(0, 0)).toBe('no unsaved work');
    expect(sureMetni(5 * 60_000, 3)).toBe('5 min of work');
  });

  it('sunucu mesajları ve parametreli kalıplar', () => {
    arayuzDiliniAyarla('en');
    expect(sunucuMetni('Davetin süresi dolmuş.')).toBe('The invite has expired.');
    expect(sunucuMetni('Parola en az 10 karakter olmalı.')).toBe('The password must be at least 10 characters.');
    expect(sunucuMetni('Çok fazla deneme. 30 saniye sonra tekrar deneyin.')).toBe('Too many attempts. Try again in 30 seconds.');
    expect(sunucuMetni('bilinmeyen ileti')).toBe('bilinmeyen ileti'); // sessiz kayıp yok
  });

  it('alıntı yazarları ve paket açıklama dosyası İngilizce', () => {
    const cehov = SOZLER.find((s) => s.kim === 'Anton Çehov')!;
    expect(sozKimi(cehov, 'en')).toBe('Anton Chekhov');
    expect(sozKimi(cehov, 'tr')).toBe('Anton Çehov');
    arayuzDiliniAyarla('en');
    expect(okubeniAdi()).toBe('README.txt');
    arayuzDiliniAyarla('tr');
    expect(okubeniAdi()).toBe('OKUBENI.txt');
  });
});
