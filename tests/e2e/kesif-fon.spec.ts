import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * KEŞİF TURU — BUGÜN EKLENENLER, GERÇEK MASAÜSTÜ PENCERESİNDE.
 *
 * Yeni proje penceresinin kart ızgarası ve fon başvuru dosyası şimdiye
 * kadar yalnız web kabuğunda ve jsdom'da görüldü. Oysa ikisinin de gerçek
 * evi masaüstü: kitaplık YALNIZ orada var ve fon paketi orada işletim
 * sistemi kayıt penceresine gidiyor.
 *
 * Tur adım adım raporluyor. Paketi KAYDETME adımı yok: masaüstünde işletim
 * sistemi diyaloğu açılıyor ve sürülemiyor — paketin içeriği
 * `packages/core/tests/fon-paket.test.ts`te ölçülüyor.
 */

const CIKTI = 'design/kesif';
const rapor: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };
const ok = (ad: string, ek = '') =>
  not(`- [${String(++adimNo).padStart(2, '0')}] ✅ ${ad}${ek ? ` — ${ek}` : ''}`);

/** Menü öğesi iki dilde aranıyor: temiz profil İNGİLİZCE açılıyor. */
async function menu(sayfa: Page, desen: RegExp) {
  await sayfa.getByTestId('uygulama-menusu').click();
  await sayfa.getByRole('menuitem', { name: desen }).click();
}

test('bugün eklenenler — kart ızgarası ve fon dosyası', async () => {
  masaustuDerlemesiniDenetle();
  test.setTimeout(240_000);
  const kok = path.join(__dirname, '..', '..', 'apps', 'desktop');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-fon-'));
  fs.mkdirSync(CIKTI, { recursive: true });

  const app = await electron.launch({ args: [kok, `--user-data-dir=${profil}`], cwd: kok });
  const sayfa = await app.firstWindow();
  const hatalar: string[] = [];
  sayfa.on('pageerror', (e) => hatalar.push(e.message.slice(0, 200)));

  try {
    await sayfa.waitForLoadState('domcontentloaded');
    await sayfa.waitForTimeout(2500);

    /* 1 — YENİ PROJE PENCERESİ. Kitaplık yalnız masaüstünde var; kart
       ızgarası bugüne kadar gerçek pencerede hiç görülmedi. */
    const yeni = sayfa.getByTestId('kitaplik-yeni');
    const bos = sayfa.getByTestId('bos-yeni');
    await ((await yeni.count()) ? yeni : bos).first().click();
    await expect(sayfa.getByTestId('yeni-proje-tip')).toBeVisible({ timeout: 15_000 });
    for (const id of ['senaryo', 'dizi', 'sahne-oyunu', 'radyo-oyunu',
      'roman', 'cizgi-roman', 'duz-metin', 'goruntu-ses']) {
      await expect(sayfa.getByTestId(`yeni-proje-tip-${id}`), id).toBeVisible();
      await expect(sayfa.getByTestId(`sayfa-onizleme-${id}`), `${id} önizleme`).toBeVisible();
    }
    /* TÜRETİLEN tip listede OLMAMALI: boş bir fon kabuğu seçilebilseydi
       kullanıcı bomboş bir belge alırdı. */
    await expect(sayfa.getByTestId('yeni-proje-tip-fon-dosyasi')).toHaveCount(0);
    await sayfa.screenshot({ path: path.join(CIKTI, 'fon-01-yeni-proje.png') });
    ok('Sekiz tip kart ve sayfa minyatürüyle çizildi, türetilen tip gizli');

    /* 2 — SEÇİM GERÇEKTEN DEĞİŞİYOR MU: kartlar `<select>`in yerine
       geçtiği için değeri değiştirmek artık bizim kodumuzun işi. */
    const aciklama = sayfa.getByTestId('yeni-proje-aciklama');
    const once = (await aciklama.textContent()) ?? '';
    await sayfa.getByTestId('yeni-proje-tip-goruntu-ses').click();
    await expect(aciklama).not.toHaveText(once);
    /* İKİ DİLDE: temiz profil İngilizce açılıyor ve açıklamalar sözlükten
       geliyor — tek dilde arayan bir iddia çalışan bir özelliği kırık
       gösterirdi. */
    await expect(aciklama).toContainText(/İki sütun|Two columns/u);
    await sayfa.getByTestId('yeni-proje-tip-senaryo').click();
    await expect(aciklama).toContainText(/Amerikan tek sütun|American single column/u);
    ok('Kart seçimi açıklamayı değiştiriyor');

    await sayfa.getByTestId('yeni-proje-ad').fill('Fon Turu');
    await sayfa.getByTestId('yeni-proje-olustur').click();
    await expect(sayfa.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });
    await sayfa.getByTestId('senaryo-editor').click();
    await sayfa.keyboard.type('İÇ - ATÖLYE - GECE\n');
    await sayfa.keyboard.type('Demir tezgâha eğilir.\n');
    await sayfa.keyboard.type('DIŞ - SOKAK - GÜN\n');
    await sayfa.keyboard.type('Yağmur başlar.\n');
    await sayfa.waitForTimeout(600);
    ok('Proje kuruldu ve iki sahnelik senaryo yazıldı');

    /* 3 — FON DOSYASI. Kaydedilmemiş iş uyarısı pencereden ÖNCE geliyor. */
    sayfa.on('dialog', (d) => void d.accept());
    await menu(sayfa, /Bu senaryodan fon dosyası oluştur|Create a funding application/u);
    await expect(sayfa.getByTestId('fon-sablon-listesi')).toBeVisible({ timeout: 15_000 });
    await expect(sayfa.getByTestId('fon-sablon-eurimages-coprod')).toContainText('2026');
    await sayfa.screenshot({ path: path.join(CIKTI, 'fon-02-kurum-secimi.png') });
    ok('Kurum seçimi açıldı, sürüm ve kaynak görünüyor');

    await sayfa.getByTestId('fon-sablon-eurimages-coprod').click();
    await sayfa.getByTestId('fon-olustur').click();
    await expect(sayfa.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });

    /* 4 — ÇOK DİLLİ EK: Eurimages sinopsisi İngilizce VE Fransızca
       istiyor, yani belgede İKİ bölüm olmalı. */
    /* Bölüm başlıkları profilde BÜYÜK HARF (`bolumStili.buyukHarf`), o
       yüzden ekranda "SYNOPSIS — ENGLISH" görünüyor. Karşılaştırma
       harf duyarsız: metnin kendisi değil, iki AYRI bölümün varlığı
       ölçülüyor. */
    const govde = await sayfa.getByTestId('senaryo-editor').innerText();
    expect(govde).toMatch(/SYNOPSIS\s*—\s*ENGLISH/iu);
    expect(govde).toMatch(/SYNOPSIS\s*—\s*FRENCH/iu);
    expect(govde).toMatch(/SCENE LIST/iu);
    ok('Fon belgesi kuruldu, sinopsis iki dilde ayrı bölüm');

    /* 5 — KONTROL LİSTESİ. */
    await menu(sayfa, /Fon dosyası kontrol listesi|Funding application checklist/u);
    await expect(sayfa.getByTestId('fon-bolum-listesi')).toBeVisible({ timeout: 15_000 });
    await expect(sayfa.getByTestId('fon-serit')).toContainText('Eurimages');
    await expect(sayfa.getByTestId('fon-serit')).toContainText('coe.int');
    /* Türetilen bölüm DOLU, elle yazılan BOŞ geliyor. */
    await expect(sayfa.getByTestId('fon-bolum-scene-list')).toContainText(/dolu|filled/u);
    await expect(sayfa.getByTestId('fon-bolum-synopsis:en')).toContainText(/boş|empty/u);
    await expect(sayfa.getByTestId('fon-bolum-synopsis:en')).toContainText('/ 3');
    await expect(sayfa.getByTestId('fon-harici-listesi')).toContainText('Detailed budget');
    await sayfa.screenshot({ path: path.join(CIKTI, 'fon-03-kontrol-listesi.png') });
    ok('Kontrol listesi: şerit, sınır, dolu/boş rozeti, dışarıdan alınacaklar');

    /* 6 — TAZELEME BAĞLANTISI GERÇEK PENCEREDE VAR MI.
       Tıklanmıyor: kaynak senaryo bu turda hiç kaydedilmedi, o yüzden
       düğme işletim sistemi dosya diyaloğunu açar ve o diyalog
       sürülemiyor (paket kaydetme adımının olmama sebebiyle aynı).
       Ölçülen şey bağlantının VAR olması: kaynak satırı yazılmış mı ve
       düğme çiziliyor mu. Tazelemenin kendisi
       `packages/core/tests/fon-tazele.test.ts` ve düğmenin gerçekten o
       kodu çağırdığı `fon-paneli.test.tsx`te ölçülüyor. */
    const kaynakSatiri = sayfa.getByTestId('fon-kaynak');
    await expect(kaynakSatiri).toBeVisible();
    await expect(kaynakSatiri).toContainText('Fon Turu');
    await expect(sayfa.getByTestId('fon-tazele')).toBeVisible();
    await expect(sayfa.getByTestId('fon-tazele')).toBeEnabled();
    ok('Kaynak senaryo satırı ve "Senaryodan tazele" düğmesi yerinde');

    /* KAPSAM DIŞI, BİLEREK: "boş bölüm doldurulunca rozet dolu oluyor mu"
       adımı bu turda YOK. Zengin metin editöründe imleci belirli bir
       bölümün gövdesine koymak turu kırılgan yapıyor (denendi: imleç
       başlığın içine düşüp bölümü yeniden adlandırdı) ve ölçtüğü şey
       zaten `packages/core/tests/fon-paneli.test.tsx`te dolu/boş rozeti
       olarak ölçülüyor. Turun işi masaüstünde GÖRÜLMEYENİ görmek. */
    await sayfa.keyboard.press('Escape');
    await expect(sayfa.getByTestId('fon-bolum-listesi')).toHaveCount(0, { timeout: 10_000 });

    /* 8 — DİL ÇİPİ BELGENİN DİLİNİ GÖSTERİYOR VE KİLİTLİ.
       Gerçek pencerede ölçülen ikinci kusur buydu: belge İngilizce
       basılırken çip "TR" diyordu. Yalan söyleyen bir denetim,
       tıklayan kullanıcıya hiçbir şeyin değişmediğini gösterir. */
    const dilCipi = sayfa.getByTestId('dil-sec-cubuk');
    await expect(dilCipi).toHaveValue('en');
    await expect(dilCipi).toBeDisabled();
    ok('Dil çipi belgenin dilini gösteriyor ve kilitli');

    expect(hatalar, `sayfa hatası: ${hatalar.join(' | ')}`).toEqual([]);
    ok('Sayfa hatası yok');
  } finally {
    fs.writeFileSync(
      path.join(CIKTI, 'rapor-fon.md'),
      ['# Keşif turu — kart ızgarası ve fon dosyası (gerçek Electron)', '', ...rapor, ''].join('\n'),
      'utf8',
    );
    await app.close().catch(() => {});
    fs.rmSync(profil, { recursive: true, force: true });
  }
});
