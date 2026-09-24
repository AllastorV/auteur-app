import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

/**
 * AĞIR TEST 9 — GÖRSEL DOĞRULAMA.
 *
 * İki kullanıcı bildirimi kodda "düzeltildi" diye işaretli. Bu dosya onları
 * KODA BAKARAK değil, gerçek tarayıcıda PİKSEL ÖLÇEREK doğrular:
 *
 *   1. "ikinci sayfaya geçince kanvas yok, şeffaf bir yüzeye yazıyor"
 *      → kağıt (beyaz zemin) 2., 3., 4., 5. sayfalardaki metni de örtüyor mu?
 *   2. "1. sayfa numarası 2 diye gösteriyor, 2. sayfayı da 2 diye"
 *      → sayfa numaraları tekrar ediyor mu?
 *
 * DOM'da "kağıt var" demek YETMEZ: kağıt eleman olarak durup metnin altında
 * bitebilir — hatanın ta kendisi buydu, flex `stretch` kağıdı yüzey
 * yüksekliğinde bırakıyordu. Bu yüzden hem geometri (px) hem de ekran
 * görüntüsünden okunan gerçek RGB ölçülüyor.
 */

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';
const GORUNTU = 'test-results/agir-gorsel';

/** Tema değişkenleri (apps/web/src/styles.css): kağıt kremi ve sayfa alanı. */
const KAGIT_RGB = [0xf7, 0xf5, 0xf0];
const YUZEY_RGB = [0x0a, 0x0c, 0x0e];

/**
 * Kağıt sınıflandırması cömert (antialias kenarları da saysın), KOYU
 * sınıflandırması cimri: kağıt metni `#1c1a17` (28,26,23) ile yazılıyor,
 * sayfa alanı ise `#0a0c0e` (10,12,14). Eşik 20'nin ALTI seçildi ki koyu
 * METİN pikseli "zemin kaçağı" sanılmasın — 20'nin altına yalnız gerçekten
 * açıkta kalan yüzey iner.
 */
const kagitMi = (r: number, g: number, b: number) => r >= 200 && g >= 195 && b >= 185;

interface PikselOzeti {
  en: number;
  boy: number;
  toplam: number;
  kagit: number;
  yuzey: number;
  /** Sol üst pikselin ham RGB'si — 1×1 örneklemede tek anlamlı değer. */
  ilk: [number, number, number];
}

/**
 * PNG baytlarını PİKSELE çevirir.
 *
 * Çözme SAYFA İÇİNDE yapılıyor: depoda PNG çözücü bağımlılığı yok ve bir
 * tane eklemek yalnız bu test için yeni bir bağımlılık olurdu. Tarayıcının
 * kendi `Image` + `<canvas>` çifti zaten elimizde; oluşturulan kanvas DOM'a
 * EKLENMİYOR, yani ölçülen sayfayı değiştirmiyor.
 */
async function pngCozumle(page: Page, png: Buffer): Promise<PikselOzeti> {
  const b64 = png.toString('base64');
  return await page.evaluate(async (veri: string): Promise<PikselOzeti> => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + veri;
    await img.decode();
    const kanvas = document.createElement('canvas');
    kanvas.width = img.naturalWidth;
    kanvas.height = img.naturalHeight;
    const ctx = kanvas.getContext('2d');
    if (!ctx) throw new Error('2d baglami yok');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, kanvas.width, kanvas.height).data;
    let kagit = 0;
    let yuzey = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (r >= 200 && g >= 195 && b >= 185) kagit++;
      else if (r < 20 && g < 20 && b < 20) yuzey++;
    }
    return {
      en: kanvas.width,
      boy: kanvas.height,
      toplam: d.length / 4,
      kagit,
      yuzey,
      ilk: [d[0], d[1], d[2]],
    };
  }, b64);
}

/** Ekranın verilen dikdörtgenini örnekler. Koordinatlar GÖRÜNÜM penceresine göre. */
async function bolgeOrnekle(
  page: Page,
  kutu: { x: number; y: number; width: number; height: number },
): Promise<PikselOzeti> {
  const png = await page.screenshot({
    clip: {
      x: Math.round(kutu.x),
      y: Math.round(kutu.y),
      width: Math.max(1, Math.round(kutu.width)),
      height: Math.max(1, Math.round(kutu.height)),
    },
  });
  return await pngCozumle(page, png);
}

/**
 * Uzun senaryo — en az 5 sayfa.
 *
 * Sahne başlıkları KISA tutuluyor: satırın sağ ucu boş kalsın ki oradan
 * alınan piksel "metnin ARKASINDAKİ zemin" olsun. Uzun bir aksiyon paragrafı
 * da var — sarma çalışsın ve sayfa dolsun.
 */
function uzunSenaryo(sahneSayisi: number): string {
  const satirlar: string[] = [];
  for (let i = 1; i <= sahneSayisi; i++) {
    satirlar.push(`İÇ. ODA ${i} - GECE`);
    satirlar.push('');
    satirlar.push(
      `Sahne ${i}. Masanin ustunde sogumus bir cay bardagi duruyor; ` +
        'pencereden gelen isik duvardaki lekeyi buyutuyor ve odada kimse ' +
        'konusmuyor, yalnizca radyatorun tikirtisi duyuluyor.',
    );
    satirlar.push('');
    satirlar.push('AYSE');
    satirlar.push(`Bu ${i}. kez soruyorum, gercekten kimse yok mu?`);
    satirlar.push('');
  }
  return satirlar.join('\n');
}

/** Editör rolüyle oturuma katılır ve senaryo sayfasında bırakır. */
async function katil(page: Page, request: any): Promise<void> {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Gorsel Dogrulama', ownerName: 'Sahip' },
  });
  const session = await res.json();

  const seed = createDoc(createProject({ panels: [createPanel()] }));
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await new Promise((r) => setTimeout(r, 500));
  await owner.close();

  const inviteRes = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'editor' },
  });
  const invite = await inviteRes.json();

  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(invite.token)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Editör');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  /* Açılış senaryo sayfasında — bu dosya orada kalıyor. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
}

/** Uzun senaryoyu gezginden yükler ve sayfa sınırları belirene kadar bekler. */
async function senaryoYukle(page: Page, sahne: number, enAzSinir: number): Promise<void> {
  await page
    .getByTestId('senaryo-gezgini')
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'uzun.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from(uzunSenaryo(sahne), 'utf8'),
    });
  await expect
    .poll(() => page.locator('.senaryo-sinir').count(), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(enAzSinir);
}

interface BlokOlcumu {
  sira: number;
  tip: string;
  metin: string;
  ust: number;
  alt: number;
  sol: number;
  sag: number;
}

interface KagitOlcumu {
  kagitEn: number;
  kagitBoy: number;
  bloklar: BlokOlcumu[];
  sinirlar: { no: number; etiket: string; ust: number }[];
}

/**
 * Kağıda GÖRE (kaydırmadan bağımsız) geometri.
 *
 * `getBoundingClientRect` aynı anda okunduğu için kaydırma her ikisinden de
 * düşer; fark kağıdın kendi koordinat sistemidir.
 */
async function kagidiOlc(page: Page): Promise<KagitOlcumu> {
  return await page.evaluate((): KagitOlcumu => {
    const kagit = document.querySelector('.senaryo-kagit');
    if (!kagit) throw new Error('kagit yok');
    const k = kagit.getBoundingClientRect();
    const bloklar = Array.from(document.querySelectorAll('.senaryo-metin [data-tip]')).map(
      (el, sira) => {
        const r = el.getBoundingClientRect();
        return {
          sira,
          tip: el.getAttribute('data-tip') ?? '?',
          metin: (el.textContent ?? '').slice(0, 32),
          ust: r.top - k.top,
          alt: r.bottom - k.top,
          sol: r.left - k.left,
          sag: r.right - k.left,
        };
      },
    );
    const sinirlar = Array.from(document.querySelectorAll('.senaryo-sinir')).map((el) => ({
      no: Number(el.getAttribute('data-sayfa')),
      etiket: (el.querySelector('span')?.textContent ?? '').trim(),
      ust: el.getBoundingClientRect().top - k.top,
    }));
    return { kagitEn: k.width, kagitBoy: k.height, bloklar, sinirlar };
  });
}

test.describe('AĞIR 9 — görsel doğrulama', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('kağıt çok sayfalı belgede metnin TAMAMINI örter (piksel ölçümü)', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await katil(page, request);
    await senaryoYukle(page, 34, 4);

    const olcum = await kagidiOlc(page);
    /* En az 5 sayfa: hata tek sayfada GÖRÜNMÜYORDU, uzun belgeyi vuruyordu. */
    expect(olcum.sinirlar.length, 'en az 4 sayfa sınırı (=5 sayfa)').toBeGreaterThanOrEqual(4);

    /* --- 1. KANIT: geometri. Hiçbir blok kağıdın dışına taşmamalı. --- */
    const tasan = olcum.bloklar.filter(
      (b) => b.alt > olcum.kagitBoy + 1 || b.ust < -1 || b.sol < -1 || b.sag > olcum.kagitEn + 1,
    );
    const sonBlok = olcum.bloklar[olcum.bloklar.length - 1];
    expect(
      tasan,
      `kağıt ${olcum.kagitEn.toFixed(1)}×${olcum.kagitBoy.toFixed(1)} px, ` +
        `son blok altı ${sonBlok.alt.toFixed(1)} px — taşan blok olmamalı`,
    ).toEqual([]);
    /* Kağıt metinden EN AZ alt marj kadar uzun olmalı; "tam bitiyor" da hata. */
    expect(olcum.kagitBoy, 'kağıt son satırın altında da sürmeli').toBeGreaterThan(sonBlok.alt + 10);

    /* --- 2. KANIT: piksel. Her sayfada metnin arkasındaki gerçek renk. --- */
    const rapor: string[] = [];
    for (const sinir of olcum.sinirlar.slice(0, 4)) {
      /* Sınırdan SONRAKİ ilk sahne başlığı: kısa satır, sağ ucu boş kağıt. */
      const hedef = olcum.bloklar.find((b) => b.tip === 'scene' && b.ust >= sinir.ust - 1);
      expect(hedef, `sayfa ${sinir.no} için sahne başlığı bulunmalı`).toBeTruthy();
      if (!hedef) continue;

      const konum = page.locator('.senaryo-metin [data-tip]').nth(hedef.sira);
      await konum.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const kutu = (await konum.boundingBox())!;
      const kagitKutu = (await page.locator('.senaryo-kagit').boundingBox())!;

      /* Kağıt bu bloğu dikey olarak GERÇEKTEN kapsıyor mu (pencere koord.). */
      expect(kagitKutu.y, `sayfa ${sinir.no}: kağıt bloğun üstünde başlamalı`).toBeLessThanOrEqual(
        kutu.y + 1,
      );
      expect(
        kagitKutu.y + kagitKutu.height,
        `sayfa ${sinir.no}: kağıt bloğun altında bitmeli`,
      ).toBeGreaterThanOrEqual(kutu.y + kutu.height - 1);

      /* (a) Satırın SAĞ ucundan tek piksel — metnin kendi kutusunun içinde,
             ama harflerin bittiği yerde: burada okunan renk = zemin. */
      const nokta = { x: kutu.x + kutu.width * 0.92, y: kutu.y + kutu.height / 2 };
      const tek = await bolgeOrnekle(page, { ...nokta, width: 1, height: 1 });
      /* (b) Bloğun tüm kutusu — kaç piksel kağıt, kaç piksel açık yüzey. */
      const bolge = await bolgeOrnekle(page, kutu);

      await page.screenshot({ path: `${GORUNTU}/sayfa-${sinir.no}-kagit.png` });

      rapor.push(
        `sayfa ${sinir.no}: nokta(${nokta.x.toFixed(0)},${nokta.y.toFixed(0)})=` +
          `rgb(${tek.ilk.join(',')}) · blok kutusu ${bolge.en}×${bolge.boy}px ` +
          `kağıt=${((bolge.kagit / bolge.toplam) * 100).toFixed(1)}% ` +
          `açık-yüzey=${bolge.yuzey}px`,
      );

      expect(
        kagitMi(tek.ilk[0], tek.ilk[1], tek.ilk[2]),
        `sayfa ${sinir.no}: metnin arkasındaki piksel rgb(${tek.ilk.join(',')}) — ` +
          `kağıt rgb(${KAGIT_RGB.join(',')}) beklenirdi, yüzey rgb(${YUZEY_RGB.join(',')}) değil`,
      ).toBe(true);
      expect(
        bolge.yuzey,
        `sayfa ${sinir.no}: blok kutusunda ${bolge.yuzey} piksel koyu yüzey sızıyor`,
      ).toBe(0);
      expect(
        bolge.kagit / bolge.toplam,
        `sayfa ${sinir.no}: blok kutusunun çoğunluğu kağıt olmalı`,
      ).toBeGreaterThan(0.5);
    }
    console.log('[agir-gorsel] kağıt ölçümü\n  ' + rapor.join('\n  '));
  });

  /**
   * MUTASYON KAPANI — yukarıdaki testin gerçekten ısırdığının kanıtı.
   *
   * Bir "kağıt var mı" testi kendi başına hep yeşil kalabilir: ölçtüğü şey
   * yanlışsa hatayı hiç görmez. Burada hatanın KENDİSİ geri getiriliyor
   * (`align-items:stretch` — kağıdı yüzey yüksekliğinde bırakan eski
   * davranış) ve ölçüm bunu YAKALAMAK ZORUNDA. Bu test yeşilse detektör
   * canlıdır; kırmızıya dönerse yukarıdaki test artık hiçbir şey ölçmüyordur.
   */
  test('mutasyon: eski flex davranışı geri gelirse ölçüm YAKALAR', async ({ page, request }) => {
    test.setTimeout(180_000);
    await katil(page, request);
    await senaryoYukle(page, 34, 4);

    /* `!important`: bileşenin kendi <style>'ı gövdede, bu ise başlıkta —
       belge sırasında gövde sonra gelir ve normalde kazanırdı. */
    /* MUTASYON GÜNCELLENDİ (2026-08-31) — eskisi artık HİÇBİR ŞEY bozmuyordu.
       Eski hata satır yönlü bir kapta `align-items:stretch`ten geliyordu:
       kağıt yüzeyin yüksekliğine geriliyordu. §17'de kap SÜTUN yönüne
       çevrildi ve sütunda `align-items` YATAY ekseni yönetir — enjekte
       edilen bildirim yalnız kağıdın genişliğini geriyor, taşma üretmiyor.
       Kapan yeşil kalıyor ama hiçbir şey kanıtlamıyordu.
       Bugünkü düzende AYNI hatanın yolu: kağıdın yüksekliğini İÇERİĞİNDEN
       koparmak. `height:100%` denendi ve İŞE YARAMADI — yüzeyin yüksekliği
       yüzde çözümü için belirli değil. Tek başına `height` de yetmedi:
       kağıda SATIR İÇİ `min-height` konuyor (`sayfalar.length` × sayfa
       yüksekliği, "kâğıt her zaman tam sayfa katı" düzeltmesi) ve
       `min-height` `height`i yener. O garanti tam da hatayı yapısal olarak
       imkânsız kılan şey; mutasyon onu KALDIRMAK zorunda. */
    await page.addStyleTag({
      content: '.senaryo-kagit{min-height:0!important;height:500px!important;}',
    });
    await page.waitForTimeout(200);

    const olcum = await kagidiOlc(page);
    const sonBlok = olcum.bloklar[olcum.bloklar.length - 1];
    const tasan = olcum.bloklar.filter((b) => b.alt > olcum.kagitBoy + 1);
    expect(
      tasan.length,
      `kağıt ${olcum.kagitBoy.toFixed(1)} px, son blok altı ${sonBlok.alt.toFixed(1)} px — ` +
        'hata geri geldiğinde bloklar kağıdın DIŞINA taşmalı',
    ).toBeGreaterThan(0);

    /* Ve piksel tarafı da görmeli: kağıdın bittiği yerin altındaki metnin
       arkasında artık koyu yüzey var. */
    const konum = page.locator('.senaryo-metin [data-tip]').nth(tasan[tasan.length - 1].sira);
    await konum.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const kutu = (await konum.boundingBox())!;
    const bolge = await bolgeOrnekle(page, kutu);
    await page.screenshot({ path: `${GORUNTU}/mutasyon-kagitsiz.png` });
    expect(
      bolge.yuzey,
      `mutasyonda blok kutusunda koyu yüzey görünmeli (kağıt=${bolge.kagit}px)`,
    ).toBeGreaterThan(0);
    expect(bolge.kagit / bolge.toplam, 'mutasyonda kutu artık kağıt olmamalı').toBeLessThan(0.5);
  });

  test('sayfa numaraları tekrar etmez, 1. sayfada numara YOKTUR', async ({ page, request }) => {
    test.setTimeout(180_000);
    await katil(page, request);
    await senaryoYukle(page, 34, 4);

    const olcum = await kagidiOlc(page);
    const nolar = olcum.sinirlar.map((s) => s.no);
    const etiketler = olcum.sinirlar.map((s) => s.etiket);

    /* §6.3/§6.4 + ScriptEditor yorumu: kağıt TEK sürekli yüzey, numara sayfa
       SINIRINDA duruyor. Sınır, BAŞLATTIĞI sayfayı gösterir; 1. sayfanın
       sınırı yoktur — sektör kuralı da birinci sayfaya numara yazmamaktır. */
    const beklenen = olcum.sinirlar.map((_, i) => i + 2);
    expect(nolar, 'sınır numaraları 2,3,4… olmalı').toEqual(beklenen);
    expect(etiketler, 'ekranda YAZAN sayı da aynı olmalı').toEqual(beklenen.map(String));
    expect(new Set(nolar).size, 'aynı numara iki kez görünmemeli').toBe(nolar.length);
    expect(nolar).not.toContain(1);

    /* Numaraların AYRI olması yetmez, ÇİZİLDİKLERİ yer de ayrı olmalı: iki
       sınır aynı yükseklikte çizilirse kullanıcı yine "iki sayfa aynı
       numarada" görür. Satır birimi ÖLÇÜLÜYOR (sahne bloğu tam bir satır),
       elle yazılmıyor — yakınlaştırma değişirse sayı da değişsin. */
    const satir = (() => {
      const s = olcum.bloklar.find((b) => b.tip === 'scene');
      if (!s) throw new Error('sahne blogu yok');
      return s.alt - s.ust;
    })();
    const araliklar = olcum.sinirlar
      .slice(1)
      .map((s, i) => Number((s.ust - olcum.sinirlar[i].ust).toFixed(1)));
    for (const a of araliklar) {
      expect(a, `sınır aralıkları px=${araliklar.join(', ')} · satır=${satir}px`).toBeGreaterThan(0);
      expect(a, 'bir sayfa 55 satırdan uzun olamaz (§6.3)').toBeLessThanOrEqual(55 * satir + 1);
    }

    /* Hatanın kaynağı üstbilgideki tek sayıydı ("1. sayfa da 2 diyordu"):
       üstbilgide artık HİÇ rakam olmamalı. */
    const ustbilgi = (await page.locator('.senaryo-ustbilgi').innerText()).trim();
    expect(ustbilgi, `üstbilgi: "${ustbilgi}"`).not.toMatch(/\d/);

    /* Durum çubuğu ile sınır sayısı AYNI kaynaktan gelmeli: N sayfa = N-1 sınır. */
    const sayacMetni = (await page.getByTestId('sayac-sayfa').innerText()).trim();
    const sayfaSayisi = Number(sayacMetni.split(/\s+/)[0]);
    expect(sayfaSayisi, `sayaç "${sayacMetni}"`).toBe(olcum.sinirlar.length + 1);

    /* Görsel kanıt: ilk sınır ekranda numarasıyla, ve üstbilgi rakamsız. */
    await page.locator('.senaryo-sinir').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${GORUNTU}/sayfa-numaralari.png` });
    await page.locator('.senaryo-ustbilgi').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${GORUNTU}/ustbilgi-numarasiz.png` });

    console.log(
      `[agir-gorsel] sayfa sayacı=${sayfaSayisi} · sınır numaraları=[${nolar.join(',')}] · ` +
        `sınır aralıkları px=[${araliklar.join(',')}] (satır ${satir}px) · üstbilgi="${ustbilgi}"`,
    );
  });
});
