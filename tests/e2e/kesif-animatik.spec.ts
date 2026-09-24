import { test, expect, _electron as electron } from '@playwright/test';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * KEŞİF — ANİMATİK VİDEO (masaüstü).
 *
 * Video yalnız Electron kabuğunda üretiliyor: kareler ana sürece akıtılıp
 * `ffmpeg` ile birleştiriliyor. Web kabuğunda karşılığı yok.
 *
 * Kaydetme penceresi (`showSaveDialog`) işletim sistemine ait ve
 * sürülemez; bu yüzden tur onu ANA SÜREÇTEN sahteliyor ve sonra ÜRETİLEN
 * DOSYAYA bakıyor. "Hata çıkmadı" yeterli değil — sıfır baytlık bir
 * dosya da hata vermez.
 */

const CIKTI = 'design/kesif';

const rapor: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };

test('animatik video üretiliyor', async () => {
  masaustuDerlemesiniDenetle();
  test.setTimeout(600_000);
  fs.mkdirSync(CIKTI, { recursive: true });
  const hedef = path.resolve(CIKTI, 'animatik.mp4');
  if (fs.existsSync(hedef)) fs.rmSync(hedef);

  const kok = path.join(__dirname, '..', '..', 'apps', 'desktop');
  /* KENDİ UYGULAMA VERİSİ — kullanıcının kurulumundan YALITIK.
     Bu tur ana süreçte `dialog.showSaveDialog`i SAHTELİYOR. Aynı profili
     paylaşınca kullanıcının açık penceresi de o sahteyi kullanıyor ve
     PDF dışa aktarımı sessizce `animatik.mp4`e yazıldı — kullanıcı
     "program mp4 kaydettim diyor" diye bildirdi (2026-08-30). Testin
     ürünü bozması değil, KULLANICININ OTURUMUNU ele geçirmesiydi.
     Ayrı profil ayrıca turu deterministik yapıyor: kabuk son durumu
     hatırlıyor (açık panel, seçili dil) ve tur temiz kurulum varsayar. */
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-animatik-'));
  const app = await electron.launch({
    args: [kok, `--user-data-dir=${profil}`],
    cwd: kok,
  });
  const sayfa = await app.firstWindow();

  const hatalar: string[] = [];
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text().slice(0, 200)); });
  sayfa.on('pageerror', (e) => hatalar.push(e.message.slice(0, 200)));

  async function dene(ad: string, is: () => Promise<string | void>) {
    adimNo++;
    try {
      const s = await is();
      not(`- [${String(adimNo).padStart(2, '0')}] ✅ ${ad}${s ? ` — ${s}` : ''}`);
    } catch (e) {
      not(`- [${String(adimNo).padStart(2, '0')}] ❌ ${ad} — ${(e as Error).message.split('\n')[0].slice(0, 220)}`);
    }
  }

  await dene('ffmpeg ikilisi bulunuyor', async () => {
    /* KONTROL TEST SÜRECİNDE, `app.evaluate` İÇİNDE DEĞİL. Ana süreç
       esbuild ile tek dosyaya paketleniyor; o bağlamda çalışma anında
       `require('ffmpeg-static')` çözülemiyor ve adım her koşuda kırmızıya
       düşüyordu — ikili gerçekten kuruluyken bile. Testin sorusu "ikili
       depoda var mı"; ana sürecin onu BULDUĞUNUN kanıtı üretilen MP4. */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('ffmpeg-static');
    const yol: string | null = typeof mod === 'string' ? mod : mod?.default ?? null;
    if (!yol || !fs.existsSync(yol)) throw new Error(`ffmpeg-static yok: ${yol}`);
    return path.basename(yol);
  });

  await dene('Kaydetme penceresi sahteleniyor', async () => {
    await app.evaluate(async ({ dialog }, yol) => {
      /* İşletim sistemi penceresi sürülemez. Sahtelemek testin ÜRÜNÜ
         atlaması değil: kullanıcının yol seçmesinin ötesindeki her şey
         (kare akıtma, ffmpeg çağrısı, dosya yazımı) gerçek kalıyor. */
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: yol });
    }, hedef);
    return hedef;
  });

  await dene('Uygulama açılıyor', async () => {
    /* MASAÜSTÜ KABUĞU SON DURUMU HATIRLIYOR. Pencere, kullanıcının en son
       nerede bıraktığıyla açılıyor — bu turda Ayarlar paneli açık ve
       arayüz dili İngilizce geldi, `mod-senaryo` altmış saniye boyunca
       görünmedi ve tur "uygulama açılmıyor" dedi. Uygulama gayet
       açılmıştı. Tur, temiz bir kurulum varsaymamalı: önce üstteki
       katmanı KAPATIYOR. */
    for (let i = 0; i < 4; i++) {
      if (await sayfa.locator('[data-testid="mod-senaryo"]').count()) break;
      await sayfa.keyboard.press('Escape');
      await sayfa.waitForTimeout(600);
    }
    /* KİTAPLIK, STÜDYO DEĞİL. Ayarlar kapanınca altından masaüstü
       kabuğunun giriş ekranı çıktı: hiçbir proje açık değil. Tur bir
       proje AÇMAYI hiç yapmıyordu — web kabuğunda oturum bağlantısı
       stüdyoyu doğrudan getirdiği için fark edilmemişti. */
    const yeni = sayfa.locator('[data-testid="kitaplik-yeni"]');
    if (await yeni.count()) {
      /* KİMLİKLE: kabuk İngilizce açılabiliyor (kullanıcının son dili
         hatırlanıyor) ve metinle arayan bir tur o zaman düşer. */
      await yeni.click();
      await sayfa.locator('[data-testid="yeni-proje-olustur"]')
        .click({ timeout: 15_000 });
      await sayfa.waitForTimeout(2000);
    }
    await sayfa.waitForSelector('[data-testid="mod-senaryo"]', { timeout: 60_000 });
    return 'stüdyo hazır';
  });

  await dene('Storyboard moduna geçiliyor', async () => {
    await sayfa.locator('[data-testid="mod-board"]').click();
    await sayfa.waitForSelector('[data-testid="canvas-container"]', { timeout: 30_000 });
    await sayfa.waitForTimeout(1200);
    return 'tuval açık';
  });

  await dene('Animatik üretiliyor', async () => {
    const pencere = sayfa.locator('[role="dialog"]');
    /* KİMLİKLE: masaüstü kabuğu kullanıcının son dilini hatırlıyor ve
       İngilizce açıldığında düğmenin adı "Export" oluyor — metinle arayan
       adım orada otuz saniye bekleyip düşüyordu. */
    await sayfa.locator('[data-testid="disa-aktar-dugmesi"]').click();
    await pencere.waitFor({ state: 'visible', timeout: 20_000 });
    /* KİMLİKLE seçiliyor, METİNLE değil: panel 2026-08-30'da yeniden
       tasarlandı, kapsam düğmeleri ikon kartına indi ve "Yalnız
       storyboard" etiketi kalmadı. Kapsamsız `locator('select')` de
       kullanılmıyor — daha önce pencerenin ARKASINDAKİ araç çubuğu
       listesini yakalayıp turu 15 dakika kilitlemişti. */
    await pencere.locator('[data-testid="kapsam-storyboard"]').click();
    /* DEĞERLE seçiliyor, ETİKETLE değil: kabuk İngilizce açıldığında
       seçeneğin adı "Animatic video" oluyor ve etikete bakan adım otuz
       saniye bekleyip düşüyordu. Değer (`video`) dilden bağımsız. */
    await pencere.locator('[data-testid="storyboard-bicim"]').selectOption('video');
    await sayfa.waitForTimeout(600);
    await sayfa.screenshot({ path: path.join(CIKTI, 'animatik-pencere.png') });

    /* KİMLİKLE: İngilizce kabukta düğmenin adı "Create animatic" oluyor
       ve /oluştur/i hiç eşleşmiyordu. Bu turda üçüncü kez aynı sınıf
       hata — masaüstü kabuğu kullanıcının son dilini hatırlıyor. */
    await pencere.locator('[data-testid="disa-aktar-uret"]').click();

    /* Dosyanın BÜYÜMESİNİ bekliyoruz: ffmpeg önce boş dosya açar, sonra
       yazar. Yalnız varlığına bakmak yarım dosyayı başarı sayardı. */
    const bitis = Date.now() + 180_000;
    let boyut = 0;
    while (Date.now() < bitis) {
      await sayfa.waitForTimeout(2000);
      if (!fs.existsSync(hedef)) continue;
      const yeni = fs.statSync(hedef).size;
      if (yeni > 0 && yeni === boyut) break;
      boyut = yeni;
    }
    if (!fs.existsSync(hedef)) throw new Error('dosya hiç oluşmadı');
    if (boyut < 1000) throw new Error(`dosya çok küçük: ${boyut} bayt`);

    const bas = fs.readFileSync(hedef).subarray(4, 12).toString('latin1');
    if (!bas.startsWith('ftyp')) throw new Error(`MP4 imzası yok: ${JSON.stringify(bas)}`);
    return `${boyut} bayt · ftyp imzası var`;
  });

  fs.writeFileSync(
    path.join(CIKTI, 'rapor-animatik.md'),
    ['# Keşif turu — animatik video (masaüstü)', '', ...rapor, '', '## Konsol hataları', '',
      ...(hatalar.length ? [...new Set(hatalar)].map((h) => `- ${h}`) : ['- (yok)'])].join('\n'),
    'utf8',
  );
  console.log('HATA SAYISI:', hatalar.length);
  /* KAPANIŞ SÜRELİ, sonra ZORLA. `app.close()` asılıyordu: ffmpeg işi
     bitmiş olsa da ana süreç kapanmıyor ve test 600 sn'de zaman aşımına
     düşüyordu — beş adımın beşi yeşilken. Bir turun ürünü değil KENDİ
     kapanışı yüzünden kırmızı olması, gerçek hatayı gizler. */
  /* `kill` YALNIZ kapanış ASILDIYSA. Koşulsuz çağrı, `close()` başarılı
     olduğunda `app.process()`in içi boşaldığı için `TypeError: Cannot read
     properties of undefined (reading '_object')` atıyordu: tur yeşilken
     test kendi temizliğinde kırmızıya dönüyordu. */
  let kapandi = false;
  await Promise.race([
    app.close().then(() => { kapandi = true; }),
    new Promise((r) => setTimeout(r, 15_000)),
  ]).catch(() => {});
  if (!kapandi) {
    try { app.process().kill(); } catch { /* süreç zaten gitti */ }
  }
  expect(rapor.filter((r) => r.includes('❌')), rapor.join('\n')).toEqual([]);
});
