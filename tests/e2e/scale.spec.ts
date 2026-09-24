import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { createRect } from '../../packages/core/src/model/objects';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

async function seedAndJoin(page: Page, request: any, panelCount: number) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: `${panelCount} panel`, ownerName: 'Sahip' },
  });
  const session = await res.json();

  const panels = Array.from({ length: panelCount }, (_, i) => {
    const panel = createPanel();
    panel.meta.scene = String(Math.floor(i / 10) + 1);
    panel.meta.shot = String((i % 10) + 1);
    panel.meta.duration = 1 + (i % 4) * 0.5;
    if (i % 3 === 0) {
      panel.transition = 'dissolve';
      panel.transitionDuration = 0.4;
    }
    const layerId = panel.layers[1].id;
    /* Panel başına ÜÇ nesne — ölçek testinin ölçtüğü şey nesne SAYISI ve
       belge büyüklüğü, nesnenin türü değil. Eskiden silüet konuyordu;
       o sistem kaldırıldı (2026-08-29) ve dikdörtgen aynı yükü taşıyor. */
    for (let k = 0; k < 3; k++) {
      panel.objects.push(
        createRect(
          { layerId, x: 400 + k * 420, y: 620 },
          { width: 260, height: 480 },
        ),
      );
    }
    return panel;
  });

  const seed = createDoc(createProject({ panels }));
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await new Promise((r) => setTimeout(r, 800));
  await owner.close();

  const inviteRes = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'editor' },
  });
  const invite = await inviteRes.json();

  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(invite.token)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Ölçek testi');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26); bu
     dosyanın testleri tuvali ölçüyor. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 30_000 });
  return session;
}

test('100 panellik proje yüklenir ve düzenleme akıcı kalır', async ({ page, request }) => {
  test.setTimeout(120_000);
  await seedAndJoin(page, request, 100);

  await expect(page.getByText(/100 panel · toplam/)).toBeVisible({ timeout: 30_000 });

  /* Panel geçişleri ve düzenleme, kare bütçesini aşmadan uygulanmalı.

     ÖLÇÜ ORAN, mutlak duvar saati DEĞİL. Eski hâli `elapsed / 20 < 33 ms`
     idi ve ölçüldü: tam koşuda 33,36 ms ile kırıldı, hemen ardından iki tam
     koşu yeşil, tek başına hep yeşil. Yani kapı kodun değil makinenin o anki
     yükünün kapısıydı — güvenilmeyen bir kapı, hiç olmayan kapıdan kötüdür.
     Eşiği yükseltmek ise gerçek bir yavaşlamayı gizlerdi.

     Bunun yerine AYNI koşuda boş bir rAF döngüsü taban olarak ölçülüyor
     (ekran tazeleme hızı ve makine yükü ikisine de aynı şekilde biniyor) ve
     düzenlemenin tabanın ÜSTÜNE eklediği maliyete bakılıyor. */
  const { taban, elapsed } = await page.evaluate(async () => {
    const dongu = async (duzenle: boolean) => {
      const durationInput = document.querySelector<HTMLInputElement>('input[type="number"]');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        if (duzenle) {
          setter.call(durationInput, String(1 + (i % 5) * 0.5));
          durationInput!.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return performance.now() - start;
    };
    await dongu(false); // ısınma — ilk döngü JIT ve düzen maliyetini taşır
    const taban = await dongu(false);
    const elapsed = await dongu(true);
    return { taban, elapsed };
  });

  /* Düzenleme başına, ham rAF maliyetinin ÜSTÜNE bir kareden fazla
     eklenmemeli. 100 panellik projede tuş başına iki kare beklemek
     "akıcı" değildir. */
  const ekMaliyet = (elapsed - taban) / 20;
  expect(ekMaliyet, `taban ${taban.toFixed(0)} ms, düzenlemeli ${elapsed.toFixed(0)} ms`)
    .toBeLessThan(16);

  // Grid görünümü tembel küçük resimlerle açılır.
  await page.getByTestId('mod-grid').click();
  await expect(page.getByText('Sayfa 1', { exact: true })).toBeVisible();
  const rendered = await page.locator('[data-testid="panel-thumbnail"] canvas').count();
  const total = await page.locator('[data-testid="panel-thumbnail"]').count();
  expect(total).toBe(100);
  // Görünüm alanı dışındaki paneller henüz çizilmemiş olmalı.
  expect(rendered).toBeLessThan(total);
});

test('animatik oynatma geçişleri canvas üzerinde gösterir', async ({ page, request }) => {
  test.setTimeout(90_000);
  await seedAndJoin(page, request, 4);

  await page.getByRole('button', { name: 'Oynat' }).click();
  /* ERİŞİLEBİLİR ADLAR SEMBOLSÜZ: iki düğme de `<Ikon>` kullanıyor ve
     ikon `aria-hidden`, yani ada girmiyor. Önce yalnız Duraklat ikona
     geçmişti ve Oynat `▶` metin karakterinde kalmıştı; kullanıcı
     tutarsızlığı gerçek pencerede gördü (2026-08-31) ve ikisi eşitlendi. */
  await expect(page.getByRole('button', { name: 'Duraklat' })).toBeVisible();

  // Oynatma ilerledikçe zaman göstergesi büyümeli.
  const readTime = async () =>
    Number(
      ((await page.locator('span.font-mono').first().textContent()) ?? '00:00.00')
        .split('/')[0]
        .trim()
        .split(':')
        .reduce((acc, part) => acc * 60 + Number(part), 0),
    );

  const t1 = await readTime();
  await page.waitForTimeout(1200);
  const t2 = await readTime();
  expect(t2).toBeGreaterThan(t1);

  await page.getByRole('button', { name: 'Duraklat' }).click();
});
