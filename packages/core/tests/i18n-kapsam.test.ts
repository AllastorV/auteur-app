import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN } from '@storyboard/core/dil/arayuz';

/**
 * i18n KAPSAM DENETİMİ — `t()` ile HİÇ SARILMAMIŞ dizgileri bulur.
 *
 * `arayuz-dili.test.ts` yalnız SARILMIŞ anahtarların çevrisi var mı diye
 * bakıyor; hiç sarılmamış bir dizgi onun için görünmez. Kullanıcı hatası
 * (2026-08-27): "ayarlar kısmı yarı İngilizce yarı Türkçe" — 43 dizgi
 * sarılmamıştı ve sözleşme testi yeşildi. Asıl boşluk buydu.
 *
 * ## Neden desen taraması, tam ayrıştırıcı değil
 *
 * Amaç kanıt değil, KAÇAK YAKALAMAK. JSX metin düğümü ve öznitelik değeri
 * yeni dizginin girdiği iki yer; ikisini denetlemek yeni bir Türkçe metnin
 * çevrilmeden geçmesini engelliyor. Tam bir TSX ayrıştırıcısı bağlamak,
 * bu testin değerinden fazlasına mal olurdu.
 *
 * ## Beyaz liste
 *
 * Bazı dizgiler çeviriye GİRMEMELİ: sinema terimleri (Dutch, Pitch),
 * kısaltmalar, marka adı. Onlar burada tek tek adlandırılıyor — sessizce
 * atlanmış bir desenle değil, çünkü sessiz atlama bu testin bütün
 * anlamını götürürdü.
 */

const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Sözlükteki TÜRKÇE anahtarlar — ikinci yakalama kanalı.
 *
 * Türkçe'ye özgü harf araması "Kaydet", "Yeni proje" gibi ASCII-only
 * Türkçe metinleri KAÇIRIYOR (öz-sınama testinde ölçüldü). Sözlükte zaten
 * anahtar olan bir dizgi bir yerde sarılmadan duruyorsa, orası kesin
 * kaçaktır — dilin harflerinden bağımsız.
 */
const SOZLUK_ANAHTARLARI = new Set(Object.keys(EN));

/** Çeviriye girmeyecek dizgiler ve GEREKÇELERİ. */
const BEYAZ_LISTE = new Map<string, string>([
  ['Auteur', 'ürün adı — çevrilmez'],
  /* Dil adları KENDİ dillerinde durur: bir dil seçicide "English" her
     arayüz dilinde "English"tir, çevrilirse kullanıcı kendi dilini
     bulamaz. */
  ['English', 'dil adı — kendi dilinde kalır'],
  ['Türkçe', 'dil adı — kendi dilinde kalır'],
  /* Kod TANIMLAYICISI, ekran metni değil: yer imi renkleri bir birlik
     tipinin üyeleri (`YerImiRengi`) ve depoya bu adla yazılıyor.
     Çevrilseydi kaydedilmiş imler açılmaz olurdu. Gösterildikleri yerde
     `t()` ile ayrıca çevriliyorlar. */
  ['kırmızı', 'YerImiRengi üyesi — depo değeri'],
  ['sarı', 'YerImiRengi üyesi — depo değeri'],
  ['yeşil', 'YerImiRengi üyesi — depo değeri'],
  /* SENARYO terimleri belge diline bağlı, arayüz diline DEĞİL: İngilizce
     arayüzde Türkçe yazılmış bir senaryonun sahne başlığı yine `İÇ`tir. */
  ['İÇ', 'senaryo terimi — belge dili'],
  ['DIŞ', 'senaryo terimi — belge dili'],
]);

function tsxDosyalari(kok: string): string[] {
  const cikti: string[] = [];
  const gez = (d: string) => {
    for (const ad of fs.readdirSync(d)) {
      const y = path.join(d, ad);
      if (fs.statSync(y).isDirectory()) gez(y);
      else if (ad.endsWith('.tsx') && !ad.includes('.test.')) cikti.push(y);
    }
  };
  if (fs.existsSync(kok)) gez(kok);
  return cikti;
}

/** Bir dosyadaki sarılmamış Türkçe dizgileri döndürür. */
export function sarilmamislar(icerik: string): string[] {
  const bulgular: string[] = [];
  /* YORUMLAR ÖNCE ve BÜTÜN DOSYADAN siliniyor. Satır satır bakmak
     yetmiyordu: bu kod tabanında blok yorum çoğu zaman satırın ORTASINDA
     açılıyor ve eski ayıklayıcı onu görmüyordu. Türkçe yorum burada bol —
     yakalananların yarısı yorum metniydi ve testi gürültüye boğuyordu. */
  const temiz = icerik
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  /* ÇOK SATIRLI JSX METNİ — satır satır tarama bunu GÖREMEZ:
         <GridBtn ...>
           Sil          <- `>` önceki satırda, `<` sonraki satırda
         </GridBtn>
     Aşağıdaki döngü her satıra ayrı bakıyor ve `gorunum` kanalı metnin
     kendi satırında `>` görmesini şart koşuyor; metin ortada yalnız
     kalınca hiçbir kanala düşmüyor.

     ÖLÇÜLDÜ 2026-08-31: on yerde kaçak vardı ve ikisinin (`Sil`, `Kurtar`)
     sözlükte karşılığı BİLE duruyordu — yani İngilizce arayüzde panel
     silme düğmesi "Sil" yazıyordu. Tarayıcının ÜÇÜNCÜ kör noktası; ilk
     ikisi satır sonunda biten metin ve tırnaklı ASCII dizgiydi. */
  for (const m of temiz.matchAll(
    />[^<>{}]*\n\s*([A-ZÇĞİÖŞÜa-zçğıöşü][^<>{}\n]{2,70}?)\s*\n\s*</g,
  )) {
    const v = m[1].trim();
    if (v && !BEYAZ_LISTE.has(v) && (TURKCE.test(v) || SOZLUK_ANAHTARLARI.has(v))
      && !bulgular.includes(v)) bulgular.push(v);
  }
  for (const ham of temiz.split('\n')) {
    /* Satırda ZATEN sarılmış bir çağrı varsa o çağrının içi atlanıyor —
       ama satırın GERİ KALANI atlanmıyor. Eski sürüm bütün satırı
       atlıyordu ve `<Alan etiket="Başlık" ... {t('X')} />` gibi karma
       satırlarda kaçak görünmez oluyordu. Ölçüldü: bu yüzden 259 dizgi
       yeşil testin altından geçmişti (kullanıcı bulgusu 2026-08-28). */
    const kalan = ham
      .replace(/\bt\(\s*'(?:[^'\\]|\\.)*'\s*\)/g, '')
      .replace(/\bt\(\s*"(?:[^"\\]|\\.)*"\s*\)/g, '')
      .replace(/\bceviri\(\s*'(?:[^'\\]|\\.)*'\s*\)/g, '')
      .replace(/\btf\(\s*'(?:[^'\\]|\\.)*'/g, '');

    /* Adaylar İKİ KÜMEDE toplanıyor çünkü yakalama kanalları farklı.
       Görüntü bağlamı (JSX metni, dört öznitelik) KESİN metindir; orada
       sözlük anahtarı olmak da kaçak sayılır. Çıplak tırnaklı dizgi ise
       metin OLABİLİR: aynı biçim kod tanımlayıcısında da kullanılıyor
       (`'kaydedildi'` bir durum adı, `'sahne'` bir blok tipi). Orada
       yalnız Türkçe harf kanalı geçerli — sözlük kanalı açık olsaydı
       her tanımlayıcı kaçak sanılırdı ve test yalan söylerdi. */
    const gorunum: string[] = [];
    /* KAPANIŞ `<` ZORUNLU DEĞİL — metin SATIR SONUNDA bitebiliyor.
       `{n}</b> sayfa` ve `<Ikon /> Duraklat` gibi satırlarda metin bir
       sonraki satırda kapanıyor ve eski desen ikisini de görmüyordu.
       ÖLÇÜLDÜ (2026-08-31): bu tek karakterlik gevşetme iki gerçek kaçak
       buldu ve HİÇ yanlış pozitif üretmedi. Tembel nicelik (`?`) şart:
       açgözlüsü satırın sonuna kadar yutup `<`li durumu bozardı. */
    const jsx = kalan.match(/>\s*([A-ZÇĞİÖŞÜa-zçğıöşü][^<>{}]{2,70}?)\s*(?:<|$)/);
    if (jsx?.[1]) gorunum.push(jsx[1]);
    const oz = kalan.match(/(?:label|title|placeholder|aria-label)="([^"{}]{2,70})"/);
    if (oz?.[1]) gorunum.push(oz[1]);

    /* ÜÇÜNCÜ KANAL — tırnaklı dizgi. En sık kaçak yeri burasıydı:
       `{ ad: 'Üçler kuralı' }`, `etiket="Kostüm"`, `title={'…'}`.
       İlk iki kanal yalnız JSX metnine ve dört özniteliğe bakıyordu ve
       259 dizgi bu boşluktan geçmişti (kullanıcı bulgusu 2026-08-28). */
    const tirnakli: string[] = [];
    for (const m of kalan.matchAll(/'((?:[^'\\\n]){2,90})'|"((?:[^"\\\n]){2,90})"/g)) {
      const v = (m[1] ?? m[2]).trim();
      if (v) tirnakli.push(v);
    }

    for (const [aday, sozlukKanali] of [
      ...gorunum.map((v) => [v.trim(), true] as const),
      /* TIRNAKLI DİZGİDE SÖZLÜK KANALI, YALNIZ BÜYÜK HARFLE BAŞLIYORSA.
         Kanalı koşulsuz açmak 28 aday üretti ve 21'i kod tanımlayıcısıydı
         (`'sahne'`, `'panel'`, `'kaydedildi'`) — bu kod tabanında değer
         adları küçük harfle, ekran metinleri büyük harfle yazılıyor ve
         ayrımı taşıyan tek şey bu. ÖLÇÜLDÜ (2026-08-31): daraltılmış
         kanalda 7 aday kaldı, YEDİSİ de gerçek kaçaktı. */
      ...tirnakli.map((v) => [v.trim(), /^[A-ZÇĞİÖŞÜ]/.test(v.trim())] as const),
    ]) {
      if (!aday || BEYAZ_LISTE.has(aday)) continue;
      if (!TURKCE.test(aday) && !(sozlukKanali && SOZLUK_ANAHTARLARI.has(aday))) continue;
      if (!bulgular.includes(aday)) bulgular.push(aday);
    }
  }
  return bulgular;
}

/**
 * MODÜL KAPSAMINDA `t()` ÇAĞIRAN SABİTLER — dil değişiminde DONAN metin.
 *
 * Kabuk dili değişince ağacı `key` ile yeniden kuruyor, ama modül
 * kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
 * `const TABS = [{ label: t('Objeler') }]` metni ilk dilde çakılı bırakır.
 * Sayfa yenilenmediği için (`location.reload` hiçbir yerde yok) kullanıcı
 * tr→en yaptığında o tablo Türkçe kalıyordu.
 *
 * ÖLÇÜLDÜ 2026-08-31: dokuz tablo bu durumdaydı — araç çubuğu, mod
 * seçici, galeri filtreleri, senaryo gezgini, kütüphane sekmeleri,
 * kompozisyon kılavuzları, karşılaştırma etiketleri, çeviri sağlayıcıları
 * ve hedef diller. Yani ekranın yarısı.
 *
 * Sarılmamış dizgi taraması bunu GÖREMEZ: dizgiler DOĞRU sarılmıştı,
 * yanlış olan ÇAĞRININ ZAMANI. Ayrı bir kanal gerekiyor.
 */
export function donmusCeviriler(icerik: string): string[] {
  const temiz = icerik
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const satirlar = temiz.split('\n');
  const bulgular: string[] = [];
  for (let i = 0; i < satirlar.length; i++) {
    /* Modül kapsamı = GİRİNTİSİZ `const`. Bir fonksiyona (`=>` ya da
       `function`) atanan sabit sorun DEĞİL: gövdesi çağrıldığında
       çalışır, içe aktarıldığında değil. */
    const bas = satirlar[i].match(/^(?:export )?const ([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*([[{])\s*$/);
    if (!bas) continue;
    const kapanis = bas[2] === '[' ? /^\]/ : /^\}/;
    for (let j = i + 1; j < satirlar.length; j++) {
      if (kapanis.test(satirlar[j])) { i = j; break; }
      if (/\bt\(/.test(satirlar[j]) || /\btf\(/.test(satirlar[j])) {
        if (!bulgular.includes(bas[1])) bulgular.push(bas[1]);
      }
    }
  }
  return bulgular;
}

describe('çeviri modül kapsamında DONMUYOR', () => {
  it('hiçbir modül sabiti t() çağırmıyor', () => {
    const kokler = [
      path.join(__dirname, '..', 'src', 'components'),
      path.join(__dirname, '..', '..', '..', 'apps', 'web', 'src'),
    ];
    const donmus: string[] = [];
    for (const yol of kokler.flatMap(tsxDosyalari)) {
      for (const ad of donmusCeviriler(fs.readFileSync(yol, 'utf8'))) {
        donmus.push(`${path.basename(yol)}: ${ad}`);
      }
    }
    expect(donmus, 'render sırasında çağrılan bir fonksiyona çevir').toEqual([]);
  });

  it('tarayıcı GERÇEKTEN yakalıyor — kendi kendini sınıyor', () => {
    // Donmuş: modül kapsamında dizi sabiti.
    expect(donmusCeviriler("const TABS = [\n  { label: t('Objeler') },\n];")).toEqual(['TABS']);
    // Donmuş: nesne sabiti.
    expect(donmusCeviriler("const E = {\n  a: t('yeni'),\n};")).toEqual(['E']);
    // DONMUŞ DEĞİL: fonksiyona atanmış, çağrıldığında çalışır.
    expect(donmusCeviriler("const TABS = () => [\n  { label: t('Objeler') },\n];")).toEqual([]);
    // DONMUŞ DEĞİL: bileşen gövdesi (girintili, modül kapsamı değil).
    expect(donmusCeviriler("  const x = [\n    t('Objeler'),\n  ];")).toEqual([]);
    // Çeviri içermeyen sabit rahat bırakılıyor.
    expect(donmusCeviriler("const IDS = [\n  'a', 'b',\n];")).toEqual([]);
  });
});

describe('i18n kapsamı — sarılmamış Türkçe dizgi kalmadı', () => {
  it('paneli açma ve daraltma başlıkları İngilizce tam cümlelerdir', () => {
    expect(EN['Özellikler panelini aç']).toBe('Expand Properties panel');
    expect(EN['Özellikler panelini daralt']).toBe('Collapse Properties panel');
    expect(EN['Zaman çizelgesi panelini aç']).toBe('Expand Timeline panel');
    expect(EN['Zaman çizelgesi panelini daralt']).toBe('Collapse Timeline panel');
  });

  it('bileşenlerde t() dışında Türkçe metin yok', () => {
    const kokler = [
      path.join(__dirname, '..', 'src', 'components'),
      path.join(__dirname, '..', '..', '..', 'apps', 'web', 'src'),
    ];
    const dosyalar = kokler.flatMap(tsxDosyalari);
    expect(dosyalar.length).toBeGreaterThan(30); // tarama gerçekten geziyor

    const kacaklar: string[] = [];
    for (const yol of dosyalar) {
      for (const d of sarilmamislar(fs.readFileSync(yol, 'utf8'))) {
        kacaklar.push(`${path.basename(yol)}: ${d}`);
      }
    }
    expect(kacaklar).toEqual([]);
  });

  it('tarayıcı GERÇEKTEN yakalıyor — kendi kendini sınıyor', () => {
    /* Test bir şey ölçmeden yeşil kalmasın: bilinen bir kaçak veriliyor. */
    expect(sarilmamislar('<span>Değişiklik yok</span>')).toEqual(['Değişiklik yok']);
    expect(sarilmamislar('<input placeholder="Kişi ara" />')).toEqual(['Kişi ara']);
    /* ASCII-only Türkçe: harf kanalı görmez, SÖZLÜK kanalı yakalar. */
    expect(sarilmamislar('<span>Kaydet</span>')).toEqual(['Kaydet']);
    /* Sarılmış olan yakalanmamalı. */
    expect(sarilmamislar("<span>{t('Kaydet')}</span>")).toEqual([]);
    /* ÜÇÜNCÜ KANAL: nesne değeri ve tek tırnaklı öznitelik — eski
       tarayıcının kör noktası. Bunlar yakalanmazsa test anlamsızdır. */
    expect(sarilmamislar("  { anahtar: 'thirds', ad: 'Üçler kuralı' },")).toEqual(['Üçler kuralı']);
    expect(sarilmamislar("<Alan etiket=\"Kostüm\" />")).toEqual(['Kostüm']);
    /* KARMA SATIR: sarılmış bir çağrının yanındaki kaçak görünmeli. */
    expect(sarilmamislar("<Alan etiket=\"Başlık\" ph={t('Kaydet')} />")).toEqual(['Başlık']);
    /* Yorum satırı yakalanmamalı. */
    expect(sarilmamislar('// <span>Kaydedilmedi</span>')).toEqual([]);
    /* ÜÇÜNCÜ KANAL — ÇOK SATIRLI JSX metni (ajan taraması 2026-08-31).
       Metin kendi satırında yalnız kalınca satır satır tarama onu hiç
       görmüyordu; on kaçak buradan geçmişti. */
    const SATIR = String.fromCharCode(10);
    expect(sarilmamislar(['<GridBtn', '  danger', '>', '  Sil', '</GridBtn>'].join(SATIR)))
      .toEqual(['Sil']);
    // Sarılmış olan yakalanmamalı — kanal yanlış alarm üretmemeli.
    expect(sarilmamislar(['<GridBtn', '>', "  {t('Sil')}", '</GridBtn>'].join(SATIR)))
      .toEqual([]);
    /* YENİ KANALLAR (2026-08-31) — ikisi de gerçek kaçaktan doğdu. */
    // Satır sonunda biten JSX metni:
    expect(sarilmamislar('<Ikon ad="duraklat" /> Duraklat')).toEqual(['Duraklat']);
    // Tırnaklı, ASCII-only, BÜYÜK harfle başlayan sözlük anahtarı:
    expect(sarilmamislar("  { id: 'aksiyon', label: 'Aksiyon' },")).toEqual(['Aksiyon']);
    // Aynı satırdaki KÜÇÜK harfli kod değeri kaçak SAYILMAMALI:
    expect(sarilmamislar("  { id: 'aksiyon', label: t('Aksiyon') },")).toEqual([]);
    /* İngilizce metin bu testin konusu değil. */
    expect(sarilmamislar('<span>Saved</span>')).toEqual([]);
  });
});
