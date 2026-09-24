import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { setScript } from '../../packages/core/src/doc/mutations';
import type { ScriptBlock } from '../../packages/core/src/model/script';

/**
 * KEŞİF TURU — İÇE AKTARMA VE PENCERELER.
 *
 * Dosyalar diskten gerçekten yükleniyor ve SONRASINDA kâğıtta ne göründüğü
 * okunuyor. "Hata çıkmadı" yeterli değil: boş bir belge de hata vermez.
 *
 * İçerik ÜRETİLMİŞTİR — gerçek senaryodan alıntı yok.
 */

const SERVER = 'http://localhost:5180';
const CIKTI = 'design/kesif';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId: 'sc1' });

const BASLANGIC: ScriptBlock[] = [
  b('scene', 'İÇ. BAŞLANGIÇ — GÜN'),
  b('action', 'Bu metin içe aktarımdan sonra YERİNİ BIRAKMALI.'),
];

const FOUNTAIN = `İÇ. MUTFAK - GECE

Demir masaya oturur. Işık soluk.

DEMİR
(fısıldayarak)
Bu iş burada bitmez.

KESME:

DIŞ. İSKELE - GÜNDÜZ

Martılar. Uzakta bir tekne belirir.
`;

const FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="General"><Text>Bir üretim notu.</Text></Paragraph>
    <Paragraph Type="Scene Heading" Number="1"><Text>İÇ. ATÖLYE - GECE</Text></Paragraph>
    <Paragraph Type="Shot"><Text>YAKIN PLAN - ELLER</Text></Paragraph>
    <Paragraph Type="Action"><Text>Torna tezgâhı döner.</Text></Paragraph>
    <Paragraph Type="Character"><Text>USTA</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Tut şunu sıkı.</Text></Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Action"><Text>KÜNYE SATIRI</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>
`;

const rapor: string[] = [];
const hatalar: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };

test('içe aktarma ve pencere turu', async ({ page, request }) => {
  test.setTimeout(600_000);
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-ice-'));
  fs.mkdirSync(CIKTI, { recursive: true });

  page.on('console', (m) => {
    if (m.type() === 'error') hatalar.push(`KONSOL: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => hatalar.push(`SAYFA: ${e.message.slice(0, 200)}`));

  async function dene(ad: string, is: () => Promise<string | void>) {
    adimNo++;
    const once = hatalar.length;
    try {
      const s = await is();
      const yeni = hatalar.length - once;
      not(`- [${String(adimNo).padStart(2, '0')}] ✅ ${ad}${s ? ` — ${s}` : ''}${yeni ? ` ⚠ ${yeni} konsol hatası` : ''}`);
    } catch (e) {
      not(`- [${String(adimNo).padStart(2, '0')}] ❌ ${ad} — ${(e as Error).message.split('\n')[0].slice(0, 200)}`);
    }
  }

  /* ------------------------------------------------------------ açılış */
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'İçe Aktarma Turu', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  setScript(tohum, { name: 'Baslangic', blocks: BASLANGIC });
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();

  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('İçe');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });

  /** Dosyayı gezginin gizli girdisine verir ve kâğıttaki metni döner. */
  async function iceAktar(ad: string, icerik: string): Promise<string> {
    const yol = path.join(gecici, ad);
    fs.writeFileSync(yol, icerik, 'utf8');
    await page.locator('input[type="file"]').first().setInputFiles(yol);
    await page.waitForTimeout(1500);
    return (await page.locator('.senaryo-metin').first().innerText()).replace(/\s+/g, ' ').trim();
  }

  await dene('İçe aktar — .fountain', async () => {
    const metin = await iceAktar('ornek.fountain', FOUNTAIN);
    if (!metin.includes('MUTFAK')) throw new Error('sahne başlığı kâğıtta yok');
    if (!metin.includes('Bu iş burada bitmez')) throw new Error('replik kâğıtta yok');
    if (metin.includes('BAŞLANGIÇ')) throw new Error('eski belge silinmemiş');
    return `${await page.locator('.senaryo-metin > *').count()} blok`;
  });

  await dene('İçe aktar — .fdx (başlık sayfası ve bilinmeyen tipler)', async () => {
    const metin = await iceAktar('ornek.fdx', FDX);
    if (!metin.includes('ATÖLYE')) throw new Error('sahne başlığı yok');
    if (!metin.includes('Tut şunu sıkı')) throw new Error('replik yok');
    if (metin.includes('KÜNYE SATIRI')) throw new Error('BAŞLIK SAYFASI gövdeye karıştı');
    if (!metin.includes('YAKIN PLAN')) throw new Error('bilinmeyen tip (Shot) DÜŞTÜ');
    if (!metin.includes('üretim notu')) throw new Error('bilinmeyen tip (General) DÜŞTÜ');
    return `${await page.locator('.senaryo-metin > *').count()} blok`;
  });

  await dene('İçe aktar — düz metin (.txt)', async () => {
    const metin = await iceAktar('ornek.txt', 'DIŞ. SOKAK - GECE\n\nYağmur başlar.\n');
    if (!metin.includes('SOKAK')) throw new Error('metin gelmedi');
    return 'okundu';
  });

  await dene('İçe aktar — BOZUK .fdx (hata görünür mü)', async () => {
    await iceAktar('bozuk.fdx', '<FinalDraft><Paragraph>');
    const uyari = await page.getByText(/okunamadı|Geçersiz/i).count();
    if (!uyari) throw new Error('bozuk dosya SESSİZCE yutuldu');
    return 'kullanıcıya bildirildi';
  });

  /* --------------------------------------------------------- pencereler */
  /* Ayarlar bir MODAL DEĞİL, kendi paneli (`ayarlar-paneli`). Yalnız
     `[role=dialog]` bekleyen bir tur onu "açılmadı" sanır — açılmış olur. */
  const pencere = page.locator('[role="dialog"], [data-testid="ayarlar-paneli"]');
  /* Pencereler UYGULAMA MENÜSÜNDE, araç çubuğunda değil. İlk denemem
     doğrudan düğme aradı ve "düğme yok" dedi — yanlış yerde arayan bir
     tur, çalışan bir özelliği kırık gösterir. */
  async function pencereAc(ad: string | RegExp) {
    await page.getByTestId('uygulama-menusu').click();
    await page.waitForTimeout(400);
    const oge = page.getByRole('menuitem', { name: ad }).first();
    if (!(await oge.count())) throw new Error('menü öğesi yok');
    await oge.click();
    await pencere.first().waitFor({ state: 'visible', timeout: 15_000 });
    const baslik = (await pencere.innerText()).split('\n')[0];
    await page.screenshot({ path: path.join(CIKTI, `pencere-${adimNo}.png`) });
    await page.keyboard.press('Escape');
    /* Tam ekran analiz panosu Escape'e bir kerede kapanmayabiliyor; açık
       kalan bir pencere SONRAKİ menü tıklamasını süresiz bekletiyordu. */
    await page.waitForTimeout(400);
    if (await pencere.count()) await page.keyboard.press('Escape');
    await pencere.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(async () => {
      /* Escape kapatmadıysa kapatma düğmesini dene — tur sonraki adımda
         açık bir pencerenin arkasına takılmasın. */
      const kapat = page.locator('[data-testid="ayarlar-kapat"]');
      if (await kapat.count()) await kapat.first().click().catch(() => {});
    });
    await page.waitForTimeout(400);
    return baslik;
  }

  /* Menü öğeleri TAHMİN EDİLMİYOR, OKUNUYOR. Ad tahmin eden bir tur,
     var olan bir pencereyi "yok" diye rapor eder — ilk denemede tam olarak
     bu oldu. */
  await page.getByTestId('uygulama-menusu').click();
  await page.waitForTimeout(400);
  const ogeAdlari = (await page.getByRole('menuitem').allInnerTexts())
    .map((x) => x.split(String.fromCharCode(10))[0].trim())
    .filter(Boolean);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  not(`Menüdeki öğeler: ${ogeAdlari.join(' · ')}`);

  /* Pencere açan öğeler (üç nokta ile biten) tek tek deneniyor. */
  /* "Aç…" ve "Farklı kaydet…" İŞLETİM SİSTEMİ penceresi açıyor; DOM'da
     karşılığı yok ve sürülemezler. Turdan çıkarılıyorlar — "açılmadı"
     diye raporlamak çalışan bir özelliği kırık gösterirdi. */
  const OS_PENCERESI = /^(Aç…|Farklı kaydet…)$/;
  /* PROJEYİ DEĞİŞTİREN öğeler turdan çıkarılıyor: açık belgeyi başkasıyla
     değiştiriyorlar ve turun geri kalanı bambaşka bir belgede koşardı.
     Ayrıca önlerinde "kaydedilmemiş iş" onayı var ve tur o onayı
     yanıtlamıyor. Kendi turları var (`fon.spec.ts`). */
  const PROJEYI_DEGISTIRIR = /^Bu senaryodan fon dosyası oluştur…$/;
  for (const ad of ogeAdlari.filter(
    (x) => /…|\.\.\./.test(x) && !OS_PENCERESI.test(x) && !PROJEYI_DEGISTIRIR.test(x),
  )) {
    /* PASİF ÖĞE TIKLANMIYOR. Menüde bağlama göre kapanan öğeler var
       ("Fon dosyası kontrol listesi…" yalnız fon belgesinde etkin) ve
       Playwright pasif bir düğmeye tıklamayı test zaman aşımına kadar
       BEKLER — turun tamamı tek bir pasif öğede asılıyordu. */
    await page.getByTestId('uygulama-menusu').click();
    await page.waitForTimeout(300);
    const pasif = await page.getByRole('menuitem', { name: ad }).first().isDisabled();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (pasif) {
      adimNo++;
      not(`- [${String(adimNo).padStart(2, '0')}] ⏭ Menü: ${ad} — bu belgede pasif, atlandı`);
      continue;
    }
    await dene(`Menü: ${ad}`, () => pencereAc(ad));
  }
  /* Analiz panosu artık UYGULAMA MENÜSÜNDE (2026-08-30): yukarıdaki
     menü turu onu zaten açıyor. Ayrı bir adım aynı şeyi ikinci kez
     denerdi. */

  fs.writeFileSync(
    path.join(CIKTI, 'rapor-ice.md'),
    ['# Keşif turu — içe aktarma ve pencereler', '', ...rapor, '', '## Konsol hataları', '',
      ...(hatalar.length ? [...new Set(hatalar)].map((h) => `- ${h}`) : ['- (yok)'])].join('\n'),
    'utf8',
  );
  console.log('HATA SAYISI:', hatalar.length);
  fs.rmSync(gecici, { recursive: true, force: true });
});
