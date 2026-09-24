import { expect, test, type Page } from '@playwright/test';
import { sarmala } from '../../packages/core/src/format/sayfala';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

const SENARYO = [
  'İÇ. ESKİ APARTMAN - KORİDOR - GECE',
  '',
  'Loş bir koridor. Duvarda nemden kabarmış bir afiş.',
  '',
  'AYŞE',
  'Kimse yok, emin misin?',
  '',
  'DIŞ. SOKAK - GECE',
  '',
  'Yağmur başlar.',
].join('\n');

/** Tek panelli boş bir projeyle editör olarak oturuma katılır. */
async function joinEmpty(page: Page, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Senaryo', ownerName: 'Sahip' },
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
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26). Testlerin
     çoğu panoyla başlıyordu; yardımcı panoya GEÇİYOR ki her testin niyeti
     olduğu gibi kalsın — senaryoyla başlamak isteyen test zaten `moda()`
     çağırıyor. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  /* ÇİFT KOPYA BLOK SİLİNDİ (2026-08-30). Bir birleştirme commit'i
     (`6774cda`) bu üç satırı iki kez bıraktı: panoya geçtikten SONRA
     yeniden senaryo editörü bekleniyordu ve o eleman artık yok.
     `script.spec.ts`in tamamı — 38 test — bu yüzden kırmızıydı ve
     kırmızılık paralel koşuda "19 passed" diye görünüyordu, çünkü işçi
     çöküyor ve kalan testler hiç koşmuyordu. */
  await moda(page, 'board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

const gezgin = (page: Page) => page.getByTestId('senaryo-gezgini');
const list = (page: Page) => page.locator('[data-script-list]');
const row = (page: Page, text: string) =>
  list(page).locator('[role="option"]').filter({ hasText: text }).first();

/** Araç çubuğundaki senaryo ↔ pano düğmesi. */
/* Mod sekmeleri artık AÇIK: "Senaryo"ya basmak her zaman senaryoya götürür,
   eskisi gibi ileri geri toggle etmez. Test de modu açıkça söylüyor. */
const moda = (page: Page, mod: 'senaryo' | 'board' | 'grid') => page.getByTestId(`mod-${mod}`);

/**
 * Senaryo görünümüne geçip dosyayı yükler, sonra panoya döner.
 *
 * Gezgin sağ denetçide yaşadığı için panoda da açıktır; bağlama testleri
 * çizimi ve zaman çizelgesini gördüğü panoda koşar.
 */
async function loadScript(page: Page) {
  await moda(page, 'senaryo').click();
  await gezgin(page).locator('input[type="file"]').setInputFiles({
    name: 'sahne.fountain',
    mimeType: 'text/plain',
    buffer: Buffer.from(SENARYO, 'utf8'),
  });
  await expect(row(page, 'İÇ. ESKİ APARTMAN - KORİDOR - GECE')).toBeVisible();
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26); bu
     bekleme tuvali istiyor.

     BURADA BİRLEŞTİRME ARTIĞI VARDI (`6774cda`): panoya geçen bir tıklama
     bu beklemenin ÜSTÜNDE duruyordu, yani senaryo editörü gittikten SONRA
     onun görünmesi bekleniyor ve her `loadScript` çağrısı 20 sn'de
     düşüyordu. Aynı artık dün `joinEmpty`de temizlenmişti; ikinci kopyası
     gözden kaçmış ve `script.spec.ts`in yarısını kırmızı tutuyordu. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible();
}

test.describe('Senaryo ↔ storyboard bağlama', () => {
  test('senaryo yüklenir ve satırlar türlerine göre ayrışır', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);

    // 2 sahne başlığı + aksiyon + karakter + replik = 6 satır.
    await expect(list(page).locator('[role="option"]')).toHaveCount(6);
    await expect(row(page, 'DIŞ. SOKAK - GECE')).toBeVisible();
  });

  test('Enter seçili satırdan panel üretir ve bağlar', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);

    await expect(page.getByText(/^1 panel ·/)).toBeVisible();

    await row(page, 'Kimse yok, emin misin?').click();
    await list(page).press('Enter');

    // Yeni panel açıldı…
    await expect(page.getByText(/^2 panel ·/)).toBeVisible();
    // …ve satır artık o panele bağlı (satır içinde panel rozeti belirdi).
    await expect(
      row(page, 'Kimse yok, emin misin?').getByRole('button', { name: /^S\d+·C\d+$/ }),
    ).toBeVisible();
  });

  test('imleç bağlamadan sonra bir sonraki satıra kayar', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);

    await row(page, 'Loş bir koridor').click();
    await list(page).press('Enter');
    // Sıradaki satır seçili gelir — Enter'a basmayı sürdürerek panel dizilir.
    await expect(row(page, 'AYŞE')).toHaveAttribute('aria-selected', 'true');
  });

  test('bağlı satırın rozeti o panelin çizimini açar', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);

    await row(page, 'Yağmur başlar').click();
    await list(page).press('Enter');
    const badge = row(page, 'Yağmur başlar').getByRole('button', { name: /^S\d+·C\d+$/ });
    await expect(badge).toBeVisible();

    // Başka bir panele geçip rozetle geri dönülebiliyor mu?
    // Alt ŞART: senaryo görünümünde çıplak harf/işaret kısayolu yoktur.
    await page.keyboard.press('Alt+,');
    await badge.click();
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    // Bağlı panel aktifken satır vurgulanır.
    await expect(row(page, 'Yağmur başlar')).toHaveClass(/border-amber/);
  });

  test('Delete bağlantıyı kaldırır, senaryo satırı kalır', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);

    await row(page, 'AYŞE').click();
    await list(page).press('Shift+Enter');
    await expect(row(page, 'AYŞE').getByRole('button', { name: /^S\d+·C\d+$/ })).toBeVisible();

    await row(page, 'AYŞE').click();
    await list(page).press('Delete');
    await expect(row(page, 'AYŞE').getByRole('button', { name: /^S\d+·C\d+$/ })).toHaveCount(0);
    await expect(row(page, 'AYŞE')).toBeVisible();
  });

  test('S tuşu panodan senaryoya, Alt+S senaryodan panoya geçer', async ({ page, request }) => {
    await joinEmpty(page, request);
    await page.getByTestId('canvas-container').click({ position: { x: 30, y: 30 } });

    await page.keyboard.press('s');
    // Orta alan düzenlenebilir sayfaya bırakıldı; gezgin denetçide açıldı.
    await expect(page.getByTestId('senaryo-editor')).toBeVisible();
    await expect(page.getByText('Senaryonu buraya sürükle')).toBeVisible();
    await expect(page.getByTestId('canvas-container')).toHaveCount(0);
    // Zaman çizelgesi senaryo görünümünde anlamsız — gizli.
    await expect(page.getByText(/^1 panel ·/)).toHaveCount(0);

    // Dönüş Alt'lı: senaryo sayfasındayken çıplak `s` yalnızca 's' harfidir.
    await page.keyboard.press('Alt+s');
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    await expect(page.getByText(/^1 panel ·/)).toBeVisible();
  });

  /* Kenar işareti YALNIZ gerçek tarayıcıda doğrulanabilir: konumu CSS
     değişkenlerinden (`--satir`, `--sayfa-ust`) hesaplanıyor ve jsdom bunları
     çözmüyor. İşaretin sayfa sınırlarıyla aynı ofset kaynağını kullandığı
     iddiası ancak burada ısırılır. */
  test('yer imi kenar işareti çiziliyor ve çekmeceden gezilebiliyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);
    // `loadScript` panoya geçiyor; senaryo sayfasına dönülür.
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('senaryo-editor')).toBeVisible();

    await row(page, 'DIŞ. SOKAK - GECE').click();
    await page.locator('body').press('Alt+b');

    const isaret = page.locator('[data-testid^="yer-imi-"]');
    await expect(isaret).toHaveCount(1);
    const kutu = await isaret.first().boundingBox();
    expect(kutu, 'kenar işareti görünür bir kutu kaplamalı').not.toBeNull();
    expect(kutu!.height).toBeGreaterThan(0);

    /* Yer imleri sağ denetçinin SEKMESİ — ayrı sütun değil. Sekmeler
       2026-08-30'da dokuzdan dörde GRUPLANDI: "İmler" artık üst düzey
       değil, "Yazım" grubunun üyesi ve alt sekme şeridi ancak grup
       seçiliyken çiziliyor. Testte grup adımı eksikti.

       Şeritler AYRI AYRI adresleniyor: `yazim` hem grup hem üye kimliği,
       yani grup açıkken `sekme-yazim` iki düğümle eşleşiyor. */
    await page.getByTestId('denetci-sekmeleri').getByTestId('sekme-yazim').click();
    await page.getByTestId('denetci-alt-sekmeleri').getByTestId('sekme-imler').click();
    await expect(page.getByTestId('yer-imleri-cekmecesi')).toBeVisible();
    await expect(page.locator('[data-testid^="ime-git-"]')).toHaveCount(1);
  });
});

test.describe('Odak modu', () => {
  /**
   * ODAK MODU AYRI BİR MOD DEĞİL — yan panelleri gizleyen bir görünüm
   * anahtarı. Bu testler o farkı korur: paneller SÖKÜLMÜYOR, kayıyor;
   * senaryo editörü aynı örnek olarak yerinde kalıyor.
   */
  test('paneller sökülmeden kayarak gizlenir ve editör yerinde kalır', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);
    await moda(page, 'senaryo').click();

    const editor = page.getByTestId('senaryo-editor');
    const denetci = page.getByTestId('denetci-sekmeleri');
    await expect(denetci).toBeVisible();

    /* Editöre bir işaret bırakıyoruz: odak modu ağacı yeniden kursaydı bu
       DOM düğümü yok olurdu ve `toBeAttached` düşerdi. Asıl korumak
       istediğimiz şey bu — imleç ve geri alma yığını da aynı düğümde. */
    await editor.evaluate((el) => el.setAttribute('data-e2e-iz', 'kalmali'));

    await page.getByTestId('odak-modu').click();

    await expect(page.getByTestId('odak-modu-yuzeyi')).toBeVisible();
    await expect(denetci, 'panel gerçekten kapanmalı — sadece kenara kaymış olması yetmez')
      .toBeHidden();
    /* Ama DOM'da DURMALI: kayabilmesi için orada olması gerekiyor.
       Panelin KENDİSİ soruluyor — genel bir `[data-gizli]` seçicisi sol
       panele düşer ve sağ panelin söküldüğünü fark etmezdi (ÖLÇÜLDÜ: öyle
       yazılmış bir iddia, paneli sökme mutantından sağ çıktı). */
    await expect(page.getByTestId('sag-panel')).toBeAttached();
    await expect(page.getByTestId('sag-panel')).toHaveAttribute('data-gizli', 'evet');
    await expect(editor).toHaveAttribute('data-e2e-iz', 'kalmali');

    await page.keyboard.press('Escape');
    await expect(denetci).toBeVisible();
    await expect(editor, 'odaktan çıkarken de aynı editör').toHaveAttribute('data-e2e-iz', 'kalmali');
  });

  test('planlar şeridi alt çubuktan açılıp kapanır', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);
    await moda(page, 'senaryo').click();

    await expect(page.getByTestId('plan-seridi')).toHaveCount(0);
    await page.getByTestId('plan-serit-anahtari').click();
    await expect(page.getByTestId('plan-seridi')).toBeVisible();
    await page.getByTestId('plan-serit-anahtari').click();
    await expect(page.getByTestId('plan-seridi')).toHaveCount(0);
  });
});

test.describe('İki sütunlu (Fransız) belge — §6.6', () => {
  /**
   * Motor ve PDF F1d'de yazılmıştı; EKRAN yoktu — kullanıcı bu belgeyi
   * yazamıyordu (§17 borcu). Bu test o ekranın gerçekten var olduğunu ve
   * belgenin tipiyle birlikte açıldığını tutar.
   */
  test('tür seçilince iki sütunlu editör açılıyor ve yazılabiliyor', async ({ page, request }) => {
    await joinEmpty(page, request);

    /* Belge tipi PROJE YARATILIRKEN seçiliyor. ÖLÇÜLDÜ: `createProject`
       meta alanlarını tek tek kopyalıyordu ve `dokumanTipi` listede yoktu —
       seçim sessizce düşüyor, her proje senaryo olarak açılıyordu. */
    /* Kaydedilmemiş iş uyarısı diyalogdan ÖNCE geliyor (bilinçli: kullanıcı
       türünü seçtikten sonra "vazgeç" sorusuyla karşılaşmamalı). Playwright
       `confirm`'i varsayılan olarak REDDEDİYOR, yani onaylamazsak yeni proje
       akışı hiç başlamaz. */
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('uygulama-menusu').click();
    await page.getByText('Yeni proje', { exact: true }).click();
    await page.getByTestId('yeni-proje-tip-goruntu-ses').click();
    await page.getByTestId('yeni-proje-ad').fill('Belgesel');
    await page.getByTestId('yeni-proje-olustur').click();

    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('iki-sutun-yuzey')).toBeVisible();
    /* Tek sütunlu editör AÇILMAMALI: iki belge türü aynı ekranı
       paylaşsaydı ikisinin kuralları birbirine karışırdı. */
    await expect(page.getByTestId('senaryo-editor')).toHaveCount(0);

    await page.getByTestId('ekle-scene').click();
    await page.keyboard.type('DIŞ. LİMAN — ŞAFAK');
    await page.getByTestId('ekle-action').click();
    await page.keyboard.type('Vinçler siluet hâlinde.');
    await page.getByTestId('ekle-dialogue').click();
    await page.keyboard.type('Martı sesleri.');

    await expect(page.getByTestId('iki-sutun-girdi')).toHaveText(/^3 girdi$/);
    /* Süre YALNIZ diyalogdan: aksiyon ve karakter adı katkı vermiyor. */
    await expect(page.getByTestId('iki-sutun-kelime')).toHaveText(/^2 diyalog kelimesi$/);

    /* §6.6: sayfa=dakika bu yerleşimde GEÇERSİZ ve katsayı kalibre
       edilmeden süre gösterilmez — ekranda hiçbir yerde "dk" yazmamalı. */
    await expect(page.getByText(/\d+\s*dk/)).toHaveCount(0);
  });

  /* Blok preseti listesi bu belgede BOŞ çiziliyordu: doldurulacakmış gibi
     görünen bir denetim. */
  test('senaryo yükleyici çizilmiyor ve her satırın kendi preseti var', async ({ page, request }) => {
    await joinEmpty(page, request);
    /* Kaydedilmemiş iş uyarısı diyalogdan ÖNCE geliyor (bilinçli: kullanıcı
       türünü seçtikten sonra "vazgeç" sorusuyla karşılaşmamalı). Playwright
       `confirm`'i varsayılan olarak REDDEDİYOR, yani onaylamazsak yeni proje
       akışı hiç başlamaz. */
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('uygulama-menusu').click();
    await page.getByText('Yeni proje', { exact: true }).click();
    await page.getByTestId('yeni-proje-tip-goruntu-ses').click();
    await page.getByTestId('yeni-proje-olustur').click();
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('iki-sutun-yuzey')).toBeVisible();

    /* Senaryo gezgini bu belgede çizilmiyor: sahne listesini
       `ScriptBlock`lardan türetiyor ve o belgenin blokları ayrı kökte. */
    await expect(page.getByTestId('senaryo-gezgini')).toHaveCount(0);
  });
});

test.describe('İki sütunlu belgede presetler — kullanıcı kararı', () => {
  /**
   * "Amerikan formattaki presetler burada da olsun; oto presete göre sağ ya
   * da sol yazım alanındaki yerleşime geçsin."
   *
   * Sütun ayrı bir ayar DEĞİL, presetin sonucu: ikisi ayrı tutulsaydı
   * "sağ sütunda duran bir aksiyon" gibi tutarsız bir durum çıkabilirdi.
   */
  test('preset değişince girdi öteki sütuna geçiyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('uygulama-menusu').click();
    await page.getByText('Yeni proje', { exact: true }).click();
    await page.getByTestId('yeni-proje-tip-goruntu-ses').click();
    await page.getByTestId('yeni-proje-olustur').click();
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('iki-sutun-yuzey')).toBeVisible();

    await page.getByTestId('ekle-action').click();
    await page.keyboard.type('Kapı açılır.');

    const satir = page.locator('.iki-sutun-satir').first();
    await expect(satir).toHaveAttribute('data-tip', 'action');
    const solX = await satir.locator('textarea').evaluate((e) => e.getBoundingClientRect().x);

    await satir.locator('select').selectOption('dialogue');
    await expect(satir).toHaveAttribute('data-tip', 'dialogue');
    /* Metin KORUNUYOR: yanlış preset seçmenin cezası yazdığını kaybetmek
       olmamalı. */
    await expect(satir.locator('textarea')).toHaveValue('Kapı açılır.');
    const sagX = await satir.locator('textarea').evaluate((e) => e.getBoundingClientRect().x);
    expect(sagX).toBeGreaterThan(solX);
  });

  /* "Ali: nasıl yani" DEĞİL — üç ayrı satır. Üçü de sağ sütunda ama farklı
     girintide; okuyucu kim/nasıl/ne ayrımını biçimden yapar. */
  test('karakter, parantez ve diyalog AYRI satırlar ve girintileri farklı', async ({ page, request }) => {
    await joinEmpty(page, request);
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('uygulama-menusu').click();
    await page.getByText('Yeni proje', { exact: true }).click();
    await page.getByTestId('yeni-proje-tip-goruntu-ses').click();
    await page.getByTestId('yeni-proje-olustur').click();
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('iki-sutun-yuzey')).toBeVisible();

    const ekle = async (preset: string, metin: string) => {
      await page.getByTestId('ekle-dialogue').click();
      const son = page.locator('.iki-sutun-satir').last();
      await son.locator('select').selectOption(preset);
      await son.locator('textarea').fill(metin);
    };
    await ekle('character', 'Ali');
    await ekle('parenthetical', '(şaşkın)');
    await ekle('dialogue', 'Nasıl yani');

    const x = async (i: number) =>
      page.locator('.iki-sutun-satir').nth(i).locator('textarea')
        .evaluate((e) => e.getBoundingClientRect().x);
    const [karakter, parantez, diyalog] = [await x(0), await x(1), await x(2)];
    expect(karakter).toBeGreaterThan(parantez);
    expect(parantez).toBeGreaterThan(diyalog);
  });
});

/* YAZIM PRESETİ KISAYOLLARI — Ctrl+1..9.
   Birim testleri komutu ve keymap'i ayrı ayrı ölçüyor; ÖLÇÜLMEYEN tek şey
   `ScriptEditor`'ın blok sırasını eklentilere gerçekten geçirip geçirmediği.
   Sıra unutulsaydı hiçbir birim testi düşmez, uygulamada tuşlar ölü olurdu. */
test.describe('Yazım preseti kısayolları', () => {
  test('Ctrl+rakam imleçteki satırın tipini değiştiriyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await loadScript(page);
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('senaryo-editor')).toBeVisible();

    const satir = page.locator('[data-testid="senaryo-metin"] p').filter({
      hasText: 'Loş bir koridor. Duvarda nemden kabarmış bir afiş.',
    });
    await expect(satir).toHaveAttribute('data-tip', 'action');

    /* İmleci o satıra koymak için TIKLIYORUZ — kısayolun yazarken, yani odak
       editördeyken çalışması gerekiyor. Genel kısayol kancası (`useShortcuts`)
       yazı alanında erken dönüyor; bu tuşlar oraya konsaydı tam burada,
       kullanılacakları tek yerde ölü olurlardı. */
    await satir.click();
    /* İmlecin GERÇEKTEN o satıra oturmasını bekliyoruz. `odakli` sınıfı
       editörün kendi imleç işareti; sabit bir bekleme yerine onu beklemek
       hem belirlenimli hem de doğru şeyi ölçüyor. Beklemeden basıldığında
       tuş imleç taşınmadan önce varıyor ve sessizce ilk satıra düşüyordu. */
    await expect(satir).toHaveClass(/odakli/);
    await page.keyboard.press('Control+3');
    await expect(satir, 'senaryoda Ctrl+3 karakter').toHaveAttribute('data-tip', 'character');

    await page.keyboard.press('Control+5');
    await expect(satir).toHaveAttribute('data-tip', 'dialogue');

    /* Metin yerinde: preset biçimi değiştirir, yazıyı değil. */
    await expect(satir).toHaveText('Loş bir koridor. Duvarda nemden kabarmış bir afiş.');

    /* Kısayol LİSTESİNİN aynı kaynaktan beslendiği birim testinde ölçülüyor
       (`kisayol-listesi-preset`). Burada denenmedi: editör odaktayken `?`
       zaten soru işareti YAZMALI — genel kısayol kancası yazı alanında
       bilinçli olarak susuyor. */
  });
});

/* GERÇEK HATA (2026-08-26, kullanıcı bildirimi): "yazı yazamıyorum, kısayol
   tetiklenip sayfalar arası geçiyor." İki belirti tek nedendendi — yeni bir
   projede belgede HİÇ blok yoktu, yani tıklanacak/yazılacak yer yoktu ve
   tuşlar pencereye düşüyordu. Bu test yalnız gerçek tarayıcıda ısırır:
   jsdom'da odak ve contenteditable davranışı taklit edilmiyor. */
test.describe('Boş projede yazma', () => {
  test('yeni projede doğrudan yazılabiliyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await metin.click();
    await page.keyboard.type('Sahne başlar');
    await expect(metin).toHaveText('Sahne başlar');
  });

  test('yazarken çıplak harf kısayolu tetiklenmiyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    /* Odak EDİTÖRDE DEĞİLKEN yazılıyor — kullanıcının yaşadığı durum.
       `s`, `g`, `n`, `f`, `b` hepsi eski kısayollardı. */
    await page.locator('body').press('s');
    await page.locator('body').press('g');
    await page.locator('body').press('f');
    await expect(page.getByTestId('senaryo-editor'), 'senaryo sayfası yerinde kalmalı')
      .toBeVisible();
    await expect(page.getByTestId('canvas-container')).toHaveCount(0);
    await expect(page.getByTestId('odak-modu-yuzeyi')).toHaveCount(0);

    // Alt'lı biçim ÇALIŞIYOR — kısayol kaybolmadı, kapıya alındı.
    await page.locator('body').press('Alt+s');
    await expect(page.getByTestId('canvas-container')).toBeVisible();
  });
});

/* OTOMATİK ALGILAMA KALDIRILDI (kullanıcı kararı 2026-08-26: "oto yazım
   preseti seçmeyi kaldır, kullanıcı kısayollarla halleder istediğini").

   Buradaki üç test canlı algılamayı ölçüyordu ve artık ölçülecek bir şey yok.
   Yerlerine, kaldırma kararının GERÇEKTEN uygulandığını çivileyen bir test
   geldi: yazılan metin kendiliğinden tip değiştirmemeli. Kaldırılan bir
   davranış da en az eklenen kadar test ister — yoksa bir gün sessizce geri
   gelir. */
test.describe('Yazım preseti YALNIZ kullanıcıdan', () => {
  test('sahne başlığı yazmak tipi kendiliğinden DEĞİŞTİRMİYOR', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await metin.click();
    await page.keyboard.type('İÇ. MUTFAK - GECE');
    await page.keyboard.press('Enter');
    /* Eskiden burada `scene` olurdu. Artık kullanıcı Ctrl+1 demedikçe
       aksiyon kalıyor: tahmin eden bir editör, tahmini yanlış olduğunda
       kullanıcının yazdığını geri alıyordu. */
    await expect(metin.locator('p').first()).toHaveAttribute('data-tip', 'action');
  });

  test('Ctrl+rakam ile seçilen tip YAZMAYA DEVAM EDİNCE de duruyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await metin.click();
    await page.keyboard.press('Control+1');
    await page.keyboard.type('İÇ. MUTFAK - GECE');
    const ilk = metin.locator('p').first();
    await expect(ilk).toHaveAttribute('data-tip', 'scene');

    await page.keyboard.press('Enter');
    await page.keyboard.type('sonraki satır');
    await expect(ilk, 'kullanıcının kararı yerinde kalmalı')
      .toHaveAttribute('data-tip', 'scene');
  });

  test('yeni satır ÖNCEKİ satırın tipini miras alıyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await metin.click();
    await page.keyboard.press('Control+5');
    await page.keyboard.type('Birinci replik.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('İkinci replik.');
    /* Diyalog yazarken her satırda tuşa basmak gerekmesin diye: ProseMirror
       `splitBlock`'u attribute'ları kopyalıyor ve bu davranış artık
       ÖZELLİK — algılama kalktığına göre tek tutunma noktası o. */
    await expect(metin.locator('p').nth(1)).toHaveAttribute('data-tip', 'dialogue');
  });

  test('araç çubuğundaki liste imleçteki satırın tipini gösteriyor ve uyguluyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await metin.click();
    await page.keyboard.type('İÇ. MUTFAK - GECE');
    const liste = page.getByTestId('blok-preseti');
    await liste.selectOption('scene');
    await expect(metin.locator('p').first()).toHaveAttribute('data-tip', 'scene');
    await expect(liste).toHaveValue('scene');
  });
});

/* KULLANICI FORMAT PROFİLİ (§16.3 · §17 borcu).
   Kağıt/dil/preset seçimi `ui` mağazasında oturumla sınırlıydı ve her
   açılışta sıfırlanıyordu. Bu testi ancak GERÇEK bir sayfa yenilemesi
   ısırır: birim testi mağazayı yeniden yükleyemez. */
test.describe('Format tercihi açılışlar arasında yaşıyor', () => {
  test('A4 seçimi sayfa yenilenince duruyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const kagit = page.getByTestId('kagit-sec-cubuk');
    await expect(kagit).toHaveValue('letter');

    await kagit.selectOption('a4');
    await expect(kagit).toHaveValue('a4');

    await page.reload();
    /* YENİLEME OTURUMU DÜŞÜRMÜYOR (2026-08-31). Öncesinde düşürüyordu:
       davet jetonu tek kullanımlık ve istemci sunucunun verdiği OTURUM
       jetonunu saklamıyordu; katılma ekranı tükenmiş daveti forma geri
       doldurup "çalışacak" izlenimi veriyordu. Bu test o hatanın ikinci
       muhafızı — birincisi yenilemeden sonra biçim tercihinin durması. */
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('kagit-sec-cubuk'), 'seçim yeniden yapılmak zorunda kalmamalı')
      .toHaveValue('a4');
  });
});

/* SAYFA SINIRI KAYMASI (§17 borcu) — motor ve tarayıcı AYNI satırı saymalı.
   Sayfa SAYISI motordan geliyor (Karar 34) ama ekrandaki sınır da motorun
   satır sayımıyla konumlanıyor; ikisi ayrışınca sınır her blokta bir satır
   kayıyor ve kayma BİRİKİMLİ. Bu yalnız gerçek tarayıcıda ısırır: `pre-wrap`
   ve sarkan boşluk kuralları jsdom'da yok. */
test.describe('Motor ve tarayıcı aynı satırı sayıyor', () => {
  const ORNEKLER = [
    /* Cümle sonuna çift boşluk — daktilo alışkanlığı, senaryo yazarlarında
       yaygın. ÖLÇÜLDÜ: eski motor bunu 1 satır sayıyordu, DOM 2 çiziyordu. */
    'Kapi acildi.  Ruzgar girdi.  Perde ucustu.  Ayse dondu birden.',
    'Tek bosluklu olagan bir aksiyon satiri, altmis sutunu asacak kadar uzun olsun diye uzatildi.',
    'Cok    fazla    bosluk    var    burada    ve    hepsi    sayilmali.',
    'Kisa satir.',
  ];

  for (const [i, ornek] of ORNEKLER.entries()) {
    test(`ornek ${i + 1}: satir sayilari tutuyor`, async ({ page, request }) => {
      await joinEmpty(page, request);
      await moda(page, 'senaryo').click();
      const metin = page.getByTestId('senaryo-metin');
      await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });
      await metin.click();
      /* YAZARAK DEĞİL YAPIŞTIRARAK: akıllı düzeltme (kullanıcı kararı
         2026-08-27) yazarken ikinci boşluğu BİLEREK yutuyor — tam da sayfa
         sonu kaymasın diye. Tek tek yazsaydık çoklu boşluk belgeye hiç
         ulaşmazdı ve bu test kendi kurduğu durumu sınamamış olurdu. Çoklu
         boşluk belgeye yapıştırma ve içe aktarma yoluyla geliyor; eklenti
         `metin.length !== 1` ile ikisini de bilerek atlıyor. */
      await page.keyboard.insertText(ornek);

      /* Motorun sayısı SAYFA SAYACINDAN okunmuyor (o sayfa sayısı verir);
         DOM'un çizdiği satır yüksekliği ile blok yüksekliği oranlanıyor ve
         motorun aynı metin için ürettiği satır sayısıyla karşılaştırılıyor. */
      const dom = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="senaryo-metin"] p') as HTMLElement;
        const sy = parseFloat(getComputedStyle(p).lineHeight);
        return Math.round(p.getBoundingClientRect().height / sy);
      });
      /* MOTORUN GİRDİSİ BELGEDE NE VARSA O — yazdığımız dizge değil.
         Program metni girerken değiştirebiliyor; ham dizgeyi sarmalamak
         motoru belgede OLMAYAN bir metinle karşılaştırır. 2026-08-30'da
         tam olarak bu oldu: yazarken boşluklar yutuldu, motor 2 saydı, DOM
         doğru olarak 1 çizdi ve suçlu sayfalama motoru sanıldı. */
      const belge = (await metin.locator('p').first().textContent()) ?? '';
      const motor = sarmalaSayisi(belge, 60);
      expect(dom, `"${ornek.slice(0, 30)}…" — motor ${motor}, DOM ${dom}`).toBe(motor);
    });
  }
});

/** `sarmala`nın e2e tarafındaki İKİZİ DEĞİL — motorun kendisi çağrılıyor. */
function sarmalaSayisi(metin: string, sutun: number): number {
  return sarmala(metin, sutun).length;
}

/* YAZI TİPİ: senaryoda KİLİTLİ, romanda seçilebilir (kullanıcı kararı
   2026-08-26). Yalnız gerçek tarayıcıda ısırır: motorun ölçtüğü genişlikle
   DOM'un çizdiği genişliğin tuttuğu ancak orada görülür. */
test.describe('Yazı tipi — senaryoda kilitli, romanda serbest', () => {
  async function yeniProje(page: Page, tip: string, ad: string) {
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('uygulama-menusu').click();
    await page.getByText('Yeni proje', { exact: true }).click();
    await page.getByTestId(`yeni-proje-tip-${tip}`).click();
    await page.getByTestId('yeni-proje-ad').fill(ad);
    await page.getByTestId('yeni-proje-olustur').click();
    await moda(page, 'senaryo').click();
  }

  test('senaryoda kilit gösteriliyor, seçici yok', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('yazi-tipi-kilitli')).toBeVisible();
    await expect(page.getByTestId('yazi-tipi-sec')).toHaveCount(0);
  });

  test('romanda seçilebiliyor ve KAĞIDA uygulanıyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await yeniProje(page, 'roman', 'Kar');
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await expect(page.getByTestId('yazi-tipi-kilitli')).toHaveCount(0);
    const secici = page.getByTestId('yazi-tipi-sec');
    await expect(secici).toHaveValue('tinos');

    /* Kağıt GERÇEKTEN Times ölçüsünde çiziliyor mu: `i` ve `m` aynı
       genişlikteyse eşgenişlikli bir yazı kullanılıyor demektir ve motorun
       orantılı ölçüsü ekranla tutmaz. */
    const orantili = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="senaryo-metin"] p') as HTMLElement;
      const olc = (metin: string) => {
        const s = document.createElement('span');
        s.textContent = metin;
        s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        s.style.font = getComputedStyle(p).font;
        document.body.appendChild(s);
        const g = s.getBoundingClientRect().width;
        s.remove();
        return g;
      };
      return { i: olc('iiiiiiiiii'), m: olc('mmmmmmmmmm') };
    });
    expect(orantili.m, 'Times orantılıdır: m harfi i harfinden geniş')
      .toBeGreaterThan(orantili.i * 1.5);

    // Courier'e geçince eşgenişlikli olmalı.
    await secici.selectOption('courier-prime');
    const esgenislik = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="senaryo-metin"] p') as HTMLElement;
      const olc = (metin: string) => {
        const s = document.createElement('span');
        s.textContent = metin;
        s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        s.style.font = getComputedStyle(p).font;
        document.body.appendChild(s);
        const g = s.getBoundingClientRect().width;
        s.remove();
        return g;
      };
      return { i: olc('iiiiiiiiii'), m: olc('mmmmmmmmmm') };
    });
    expect(Math.abs(esgenislik.m - esgenislik.i), 'Courier eşgenişliklidir')
      .toBeLessThan(1);
  });
});

/* §6.6 KALİBRASYON BORCU (§17).
   Sütun oranı için yayımlanmış bir standart YOK — ölçüm değil AYAR oldu.
   Kelime hızı ise ölçülebilir bir büyüklük ve kalibre edildi (Türkçe
   profesyonel seslendirme ortalaması 150 kel/dk), yani süre artık görünüyor.
   Yalnız gerçek tarayıcıda ısırır: sütun genişliği CSS değişkeninden geliyor
   ve jsdom onları çözmüyor. */
test.describe('İki sütun — oran ayarı ve süre', () => {
  async function ikiSutunProje(page: Page) {
    page.on('dialog', (d) => void d.accept());
    await page.getByTestId('uygulama-menusu').click();
    await page.getByText('Yeni proje', { exact: true }).click();
    await page.getByTestId('yeni-proje-tip-goruntu-ses').click();
    await page.getByTestId('yeni-proje-ad').fill('Belgesel');
    await page.getByTestId('yeni-proje-olustur').click();
    await moda(page, 'senaryo').click();
    await expect(page.getByTestId('iki-sutun-yuzey')).toBeVisible();
  }

  test('sütun oranı değişince KAĞITTAKİ genişlik değişiyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await ikiSutunProje(page);

    /* Sol sütunda bir olay girdisi: `EkleDugmeleri` boş durumda da
       çiziliyor ve düğmenin kimliği blok tipiyle kuruluyor. */
    await page.getByTestId('ekle-action').first().click();
    const olcuAl = () => page.evaluate(() => {
      const t = document.querySelector('.iki-sutun-satir textarea') as HTMLElement | null;
      return t ? Math.round(t.getBoundingClientRect().width) : 0;
    });

    const sürgü = page.getByTestId('sutun-orani');
    await expect(sürgü).toBeVisible();
    const once = await olcuAl();
    expect(once, 'ölçülecek bir hücre olmalı').toBeGreaterThan(0);

    await sürgü.fill('18');
    const sonra = await olcuAl();
    expect(sonra, 'sol sütun daraltılınca hücre de daralmalı').toBeLessThan(once);

    /* Ayraç çizgisi de birlikte kaymalı: ekranda çizgi metnin ortasından
       geçerse iki sütunlu belge okunmaz olur. */
    const ayrac = await page.evaluate(() => {
      const k = document.querySelector('.senaryo-kagit.iki-sutun') as HTMLElement;
      return getComputedStyle(k).getPropertyValue('--iki-sutun-ayrac').trim();
    });
    expect(Number(ayrac)).toBeLessThan(0.5);
  });

  test('süre gösteriliyor ve hız kapatılınca KAYBOLUYOR', async ({ page, request }) => {
    await joinEmpty(page, request);
    await ikiSutunProje(page);

    const hiz = page.getByTestId('kelime-hizi');
    await expect(hiz).toHaveValue('150');

    /* §6.6: "katsayı kalibre edilmeden süre gösterilmez." Katsayı kalibre
       edildi ama kural duruyor — kullanıcı hızı silince süre kaybolmalı. */
    await hiz.fill('');
    await expect(page.getByTestId('iki-sutun-sure')).toHaveCount(0);
  });
});

/* KULLANICI BİLDİRİMLERİ (2026-08-26, gerçek pencerede deneme):
   1. "ilk başta yazılıp yazılmadığını bile anlamadım, imleç çok geç geldi"
   2. "presetler seçilince hangisi seçildiği anlaşılmıyor"
   3. "preset seçimine göre imlecin orada placeholder bir yazı olabilir"
   Üçü de yalnız gerçek tarayıcıda ısırır: odak ve `::before` içeriği
   jsdom'da yok. */
test.describe('Yazmaya hazır açılıyor', () => {
  test('editör açılır açılmaz ODAKLI — tıklamadan yazılıyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    /* TIKLAMADAN yazıyoruz. Odak verilmezse tuşlar pencereye düşer ve
       kısayol olarak yorumlanır — dün kapattığımız hatanın kalan yarısı. */
    await page.keyboard.type('Kapı açılır.');
    await expect(metin).toHaveText('Kapı açılır.');
  });

  test('boş satırda PRESET ADI yer tutucu olarak yazıyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    const yerTutucu = () => page.evaluate(() => {
      const p = document.querySelector('[data-testid="senaryo-metin"] p') as HTMLElement;
      return getComputedStyle(p, '::before').content;
    });

    /* Boş belge aksiyonla açılıyor. */
    expect(await yerTutucu()).toContain('Aksiyon');

    /* Preset değişince yer tutucu da değişmeli — kullanıcının "hangisi
       seçildiği anlaşılmıyor" dediği şeyin çözümü tam olarak bu. */
    await page.keyboard.press('Control+3');
    expect(await yerTutucu()).toContain('Karakter');
    await page.keyboard.press('Control+1');
    expect(await yerTutucu()).toContain('Sahne');
  });

  test('yazı yazılınca yer tutucu KAYBOLUYOR', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });
    await page.keyboard.type('A');
    const icerik = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="senaryo-metin"] p') as HTMLElement;
      return getComputedStyle(p, '::before').content;
    });
    expect(icerik === 'none' || icerik === 'normal' || icerik === '').toBe(true);
  });

  /* KULLANICI BİLDİRİMİ (2026-08-26, gerçek pencere): "placeholderlar fazla,
     projede onlarca çıkıyor; imlecin orada tek bir tane yeter." */
  test('yer tutucu YALNIZ imlecin bulunduğu satırda', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    /* Üç boş satır aç; imleç sonuncuda. */
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(metin.locator('p')).toHaveCount(3);

    const isaretli = await page.evaluate(() =>
      document.querySelectorAll('[data-testid="senaryo-metin"] p[data-bos]').length);
    expect(isaretli, 'yalnız bir satırda yer tutucu olmalı').toBe(1);

    const sonuncuIsaretli = await page.evaluate(() => {
      const ps = document.querySelectorAll('[data-testid="senaryo-metin"] p');
      return ps[ps.length - 1]?.hasAttribute('data-bos');
    });
    expect(sonuncuIsaretli, 'işaret imlecin olduğu satırda olmalı').toBe(true);
  });

  test('yer tutucu METNE karışmıyor — dışa aktarımda yok', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });
    /* Yer tutucu bir DEKORASYON: belgeye yazılmıyor, yoksa PDF'e ve
       kaydedilen dosyaya "Aksiyon" diye bir satır girerdi. */
    await expect(metin).toHaveText('');
  });
});

/* KAĞIT İÇERİĞİ KAPSAR (kullanıcı bildirimi 2026-08-26, gerçek pencere:
   "ikinci sayfaya geçince kanvas yok, şeffaf bir yüzeye yazıyor").
   Yalnız gerçek tarayıcıda ısırır: flex hizalama ve yükseklik hesabı
   jsdom'da yok. */
test.describe('Çok sayfalı belgede kağıt', () => {
  test('kağıt metnin TAMAMINI kapsıyor — taşan satır koyu zemine düşmüyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });
    for (let i = 0; i < 90; i++) {
      await page.keyboard.type(`Satir ${i} uzunca bir aksiyon satiri.`);
      await page.keyboard.press('Enter');
    }

    const d = await page.evaluate(() => {
      const k = document.querySelector('.senaryo-kagit') as HTMLElement;
      const m = document.querySelector('[data-testid="senaryo-metin"]') as HTMLElement;
      return {
        kagit: k.getBoundingClientRect().height,
        metin: m.getBoundingClientRect().height,
        sinir: document.querySelectorAll('.senaryo-sinir').length,
      };
    });

    expect(d.sinir, 'belge birden çok sayfa olmalı ki test anlamlı olsun')
      .toBeGreaterThan(1);
    /* Kağıt metinden KISA olamaz. Ölçüldü (hata hâli): kağıt 526 px, metin
       2896 px — ikinci sayfadan sonrası kağıdın dışındaydı. */
    expect(d.kagit, `kağıt ${Math.round(d.kagit)}px, metin ${Math.round(d.metin)}px`)
      .toBeGreaterThanOrEqual(d.metin);
  });
});

/* YAZARKEN ÖNERİ (kullanıcı isteği 2026-08-26): "daha önce yazılmış isim,
   sahne başlığı varsa imlecin orada dropdown öneri kısmı açılsın, ok
   tuşlarıyla gezilebilsin." Yalnız gerçek tarayıcıda ısırır: imleç konumu
   (`coordsAtPos`) ve klavye gezinmesi jsdom'da yok. */
test.describe('Yazarken öneri', () => {
  async function karakterYaz(page: Page, ad: string) {
    await page.keyboard.press('Control+3');
    await page.keyboard.type(ad);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+5');
    await page.keyboard.type('Replik.');
    await page.keyboard.press('Enter');
  }

  test('daha önce yazılan ad öneriliyor ve ok tuşlarıyla geziliyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await karakterYaz(page, 'AYŞE');
    await karakterYaz(page, 'AYHAN');
    await karakterYaz(page, 'AYŞE');

    /* Yeni bir karakter satırı: "AY" yazınca ikisi de önerilmeli. */
    await page.keyboard.press('Control+3');
    await page.keyboard.type('AY');

    const liste = page.getByTestId('oneri-listesi');
    await expect(liste).toBeVisible();
    const secenekler = liste.getByRole('option');
    await expect(secenekler).toHaveCount(2);
    /* SIK GEÇEN ÖNCE: AYŞE iki kez, AYHAN bir kez. */
    await expect(secenekler.first()).toContainText('AYŞE');

    /* Ok tuşu seçimi gezdiriyor. */
    await expect(secenekler.first()).toHaveAttribute('data-secili', 'evet');
    await page.keyboard.press('ArrowDown');
    await expect(secenekler.nth(1)).toHaveAttribute('data-secili', 'evet');

    /* Enter kabul ediyor ve metin TAMAMLANIYOR. */
    await page.keyboard.press('Enter');
    await expect(liste).toHaveCount(0);
    const satirlar = await metin.locator('p').allTextContents();
    expect(satirlar.at(-1)).toBe('AYHAN');
  });

  test('Esc kapatıyor ve Enter yeniden satır açıyor', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await karakterYaz(page, 'AYŞE');
    await page.keyboard.press('Control+3');
    await page.keyboard.type('AY');
    await expect(page.getByTestId('oneri-listesi')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('oneri-listesi')).toHaveCount(0);

    /* LİSTE KAPALIYKEN Enter OLAĞAN davranmalı — yeni satır açmalı. Eklenti
       tuşları her zaman yakalasaydı editör kullanılamaz olurdu. */
    const once = await metin.locator('p').count();
    await page.keyboard.press('Enter');
    await expect(metin.locator('p')).toHaveCount(once + 1);
  });

  test('sahne başlığında SAHNE başlıkları öneriliyor, karakter adları değil', async ({ page, request }) => {
    await joinEmpty(page, request);
    await moda(page, 'senaryo').click();
    const metin = page.getByTestId('senaryo-metin');
    await expect(metin.locator('p')).toHaveCount(1, { timeout: 10_000 });

    await page.keyboard.press('Control+1');
    await page.keyboard.type('İÇ. MUTFAK - GECE');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await karakterYaz(page, 'İÇTEN');

    await page.keyboard.press('Control+1');
    await page.keyboard.type('İÇ');

    const liste = page.getByTestId('oneri-listesi');
    await expect(liste).toBeVisible();
    /* Karakter adı burada ÖNERİLMEMELİ: hepsini her yerde önermek listeyi
       kullanılamaz kılar ve yanlış öneriyi kabul etmek metni bozar. */
    await expect(liste).toContainText('MUTFAK');
    await expect(liste).not.toContainText('İÇTEN');
  });
});
