import { test, expect, _electron as electron } from '@playwright/test';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { zincirCozumle } from '../../packages/core/src/veri/zincir';

/**
 * KEŞİF TURU — MÜHÜR ZİNCİRİ, GERÇEK ELECTRON PENCERESİNDE.
 *
 * §19'un kapatılmamış tek borcu buydu: birim ve jsdom testleri yolu
 * ölçüyordu ama `zincir.log`un gerçek bir pencerede gerçekten yazıldığı,
 * IPC köprüsünün bağlı olduğu ve FreeTSA'dan damga geldiği hiç
 * denenmemişti. "Yeşil test ölü koda kefil olabilir" hatası bu depoda üç
 * kez yaşandı; bu tur o kapıyı kapatıyor.
 *
 * Tur ADIM ADIM raporluyor (`kesif-ice.spec.ts` kalıbı): her adım kendi
 * satırını basıyor, ağ gerektiren adım düşerse SEBEBİYLE birlikte
 * raporlanıyor ama turu düşürmüyor — FreeTSA'nın kapalı olması ürünün
 * hatası değil. Yerel adımlar SERT: zincir yazılmadıysa tur kırmızıdır.
 */

const CIKTI = 'design/kesif';
const rapor: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };
const ok = (ad: string, ek = '') => not(`- [${String(++adimNo).padStart(2, '0')}] ✅ ${ad}${ek ? ` — ${ek}` : ''}`);
const atla = (ad: string, sebep: string) => not(`- [${String(++adimNo).padStart(2, '0')}] ⏭ ${ad} — ${sebep}`);

/**
 * Mühür penceresini menüden açar.
 *
 * Öğe KİMLİKLE değil ADLA aranıyor (menü listesi `data-testid` taşımıyor)
 * ve ad İKİ DİLDE de eşleşiyor: masaüstü kabuğu son kullanılan arayüz
 * dilini hatırlıyor ve TEMİZ bir profilde varsayılan İNGİLİZCE açılıyor.
 * Yalnız Türkçe adı arayan ilk yazışım tam olarak burada düştü —
 * `kesif-ice.spec.ts`in aynı uyarısının masaüstündeki karşılığı.
 */
async function muhurPenceresi(sayfa: import('@playwright/test').Page) {
  await sayfa.getByTestId('uygulama-menusu').click();
  await sayfa.getByRole('menuitem', { name: /Mühür ve kanıt|Seal and proof/u }).click();
}

test('mühür zinciri — gerçek masaüstü penceresi', async () => {
  masaustuDerlemesiniDenetle();
  test.setTimeout(240_000);
  const kok = path.join(__dirname, '..', '..', 'apps', 'desktop');
  /* AYRI PROFİL ŞART: `main.ts` tek örnek kilidi kullanıyor ve kullanıcının
     kendi Auteur'ü açıkken ikinci örnek hemen kapanır (2026-08-31'de
     ölçüldü, iki masaüstü testi bu yüzden kırmızıydı). */
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-muhur-'));
  fs.mkdirSync(CIKTI, { recursive: true });

  const app = await electron.launch({ args: [kok, `--user-data-dir=${profil}`], cwd: kok });
  const sayfa = await app.firstWindow();
  const konsolHatalari: string[] = [];
  sayfa.on('pageerror', (e) => konsolHatalari.push(e.message.slice(0, 200)));

  try {
    await sayfa.waitForLoadState('domcontentloaded');
    await sayfa.waitForTimeout(2500);

    /* 1 — proje aç ve gerçek metin yaz. Mühürlenen şey belgenin kanonik
       metni; boş bir belgeyi mühürlemek hiçbir şey ölçmezdi. */
    const yeni = sayfa.getByTestId('kitaplik-yeni');
    const bos = sayfa.getByTestId('bos-yeni');
    await ((await yeni.count()) ? yeni : bos).first().click();
    await sayfa.getByTestId('yeni-proje-ad').fill('Mühür Turu');
    await sayfa.getByTestId('yeni-proje-olustur').click();
    await expect(sayfa.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });
    await sayfa.getByTestId('senaryo-editor').click();
    await sayfa.keyboard.type('İÇ - ATÖLYE - GECE\n');
    await sayfa.keyboard.type('Demir tezgâha eğilir. Torna döner.\n');
    await sayfa.waitForTimeout(600);
    ok('Proje açıldı ve metin yazıldı');

    /* 2 — pencere MENÜDEN açılıyor: bu depoda üç kez "yazıldı ama menüye
       bağlanmadı" hatası yaşandı. */
    await muhurPenceresi(sayfa);
    await expect(sayfa.getByTestId('muhur-listesi')).toBeVisible({ timeout: 15_000 });
    /* Masaüstünde kabuk VAR: "bu kabukta yok" metni çıkarsa IPC köprüsü
       bağlanmamış demektir. */
    await expect(sayfa.getByTestId('muhur-yok')).toHaveCount(0);
    ok('Mühür penceresi menüden açıldı, kanıt kabuğu bağlı');

    await expect(sayfa.getByTestId('muhur-bos')).toBeVisible();
    ok('Başlangıçta mühür yok, zincir sağlam');

    /* 3 — MÜHÜRLE. Buradan sonrası diskte gerçekten olmalı. */
    await sayfa.getByTestId('muhur-al').click();
    await expect(sayfa.getByTestId('muhur-bos')).toHaveCount(0, { timeout: 20_000 });
    await sayfa.screenshot({ path: path.join(CIKTI, 'muhur-01-alindi.png') });
    ok('Mühürle çalıştı, liste doldu');

    /* 4 — DİSK. `<profil>/veri/<projeId>/zincir.log` gerçekten var mı. */
    const veriKok = path.join(profil, 'veri');
    const projeler = fs.existsSync(veriKok)
      ? fs.readdirSync(veriKok).filter((d) => fs.existsSync(path.join(veriKok, d, 'zincir.log')))
      : [];
    expect(projeler, 'zincir.log yazılmış bir proje dizini yok').toHaveLength(1);
    const projeDizini = path.join(veriKok, projeler[0]);
    const zincirYolu = path.join(projeDizini, 'zincir.log');
    const ham = new Uint8Array(fs.readFileSync(zincirYolu));
    const okuma = zincirCozumle(ham);
    expect(okuma.durum).toBe('tam');
    expect(okuma.kayitlar).toHaveLength(1);
    expect(okuma.kayitlar[0].tur).toBe('muhur');
    ok('zincir.log diskte ve çözümleniyor', `${ham.length} bayt, 1 kayıt`);

    /* 5 — mühürlenen METİN saklanmış mı ve özeti tutuyor mu. */
    const zaman = okuma.kayitlar[0].zaman;
    const gzYolu = path.join(projeDizini, 'muhur', `${Math.trunc(zaman)}.txt.gz`);
    expect(fs.existsSync(gzYolu), `mühür metni yok: ${gzYolu}`).toBe(true);
    const metin = zlib.gunzipSync(fs.readFileSync(gzYolu));
    expect(metin.length).toBe(okuma.kayitlar[0].icerikBayt);
    expect(metin.toString('utf8')).toContain('ATÖLYE');
    ok('Mühürlenen metin saklanmış ve uzunluğu kayıtla aynı', `${metin.length} bayt`);

    /* 6 — İKİNCİ MÜHÜR: zincir gerçekten büyüyor ve bağ kuruluyor mu.
       Pencere ÖNCE kapatılıyor: `Modal`ın perdesi tam ekran ve altındaki
       editöre yapılan tıklamayı yutuyor — ilk yazışım tam olarak burada
       "intercepts pointer events" ile düştü. */
    await sayfa.keyboard.press('Escape');
    await expect(sayfa.getByTestId('muhur-listesi')).toHaveCount(0, { timeout: 10_000 });
    await sayfa.getByTestId('senaryo-editor').click();
    await sayfa.keyboard.type('Işık söner.\n');
    await sayfa.waitForTimeout(400);
    await muhurPenceresi(sayfa);
    await sayfa.getByTestId('muhur-al').click();
    await sayfa.waitForTimeout(2000);
    const ikinci = zincirCozumle(new Uint8Array(fs.readFileSync(zincirYolu)));
    expect(ikinci.durum).toBe('tam');
    expect(ikinci.kayitlar).toHaveLength(2);
    ok('İkinci mühür zincire eklendi (append, üzerine yazma yok)');

    /* 7 — ZAMAN DAMGASI. Gerçek ağ: FreeTSA kapalıysa ürün hatası değil,
       o yüzden bu adım turu düşürmüyor ama SEBEBİYLE raporlanıyor. */
    let damgaAlindi = false;
    try {
      await sayfa.getByTestId(`muhur-damgala-${Math.trunc(zaman)}`).click();
      await expect(sayfa.locator('text=/Zaman damgası alındı|Timestamp obtained/u')).toBeVisible({ timeout: 60_000 });
      damgaAlindi = true;
    } catch (e) {
      atla('Zaman damgası (FreeTSA)', (e as Error).message.split('\n')[0].slice(0, 160));
    }
    if (damgaAlindi) {
      const damgali = zincirCozumle(new Uint8Array(fs.readFileSync(zincirYolu)));
      const damga = damgali.kayitlar.find((k) => k.tur === 'damga');
      expect(damga, 'zincire damga kaydı düşmedi').toBeTruthy();
      const tsr = path.join(projeDizini, 'muhur', `${Math.trunc(damga!.zaman)}.tsr`);
      expect(fs.existsSync(tsr), `jeton dosyası yok: ${tsr}`).toBe(true);
      const jeton = fs.readFileSync(tsr);
      /* Gerçek bir TimeStampResp DER: dış katman SEQUENCE (0x30). */
      expect(jeton[0]).toBe(0x30);
      ok('FreeTSA damgası alındı ve jeton saklandı', `${jeton.length} bayt`);
      await sayfa.screenshot({ path: path.join(CIKTI, 'muhur-02-damgali.png') });
    }

    /* 8 — BAĞIMSIZ DOĞRULAYICI, diskteki GERÇEK zincir üzerinde.
       Kanıt paketini pencereden kaydetmek işletim sistemi diyaloğu açıyor
       ve sürülemiyor; paketin İÇERİĞİ zaten `tests/kanit-paketi.test.ts`te
       ölçülüyor. Burada ölçülen şey daha değerlisi: gerçek pencerenin
       yazdığı zincir, bağımsız doğrulayıcıdan geçiyor mu. */
    const dogrulamaDizini = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-dogrula-'));
    fs.copyFileSync(zincirYolu, path.join(dogrulamaDizini, 'zincir.log'));
    fs.mkdirSync(path.join(dogrulamaDizini, 'muhurler'));
    fs.mkdirSync(path.join(dogrulamaDizini, 'damgalar'));
    const son = zincirCozumle(new Uint8Array(fs.readFileSync(zincirYolu)));
    for (const k of son.kayitlar) {
      const ad = String(Math.trunc(k.zaman));
      if (k.tur === 'muhur') {
        const gz = path.join(projeDizini, 'muhur', `${ad}.txt.gz`);
        if (fs.existsSync(gz)) {
          fs.writeFileSync(path.join(dogrulamaDizini, 'muhurler', `${ad}.txt`),
            zlib.gunzipSync(fs.readFileSync(gz)));
        }
      } else {
        const tsr = path.join(projeDizini, 'muhur', `${ad}.tsr`);
        if (fs.existsSync(tsr)) fs.copyFileSync(tsr, path.join(dogrulamaDizini, 'damgalar', `${ad}.tsr`));
      }
    }
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'packages', 'core', 'src', 'kanit', 'dogrula.mjs'),
      path.join(dogrulamaDizini, 'dogrula.mjs'),
    );
    const cikti = execFileSync(process.execPath, ['dogrula.mjs'], {
      cwd: dogrulamaDizini, encoding: 'utf8',
    });
    expect(cikti).toContain('zincir saglam');
    ok('Bağımsız doğrulayıcı gerçek zinciri onayladı', `${son.kayitlar.length} kayıt`);
    fs.rmSync(dogrulamaDizini, { recursive: true, force: true });

    expect(konsolHatalari, `sayfa hatası: ${konsolHatalari.join(' | ')}`).toEqual([]);
    ok('Sayfa hatası yok');
  } finally {
        /* KAPANIŞ SINIRLI TUTULUYOR.
       ÖLÇÜLDÜ (2026-09-01): turun on adımı da yeşilken `app.close()`
       dönmüyor ve test 240 sn'de zaman aşımına düşüyor; rapor dosyası
       adımların 6 saniyede bittiğini gösteriyor. Değişiklikten ÖNCEKİ
       sürümle de birebir aynı, yani sebep tur kodunda ya da üründe değil:
       gerçek FreeTSA isteğinden sonra Chromium'un ağ katmanı kapanmayı
       geciktiriyor. Ağ isteği yapmayan öteki masaüstü turları saniyeler
       içinde kapanıyor.
       Turun işi ÜRÜNÜ ölçmek; kapanışı beklemek değil. Süre dolunca
       süreç doğrudan sonlandırılıyor — sessiz değil, sebebi burada
       yazılı (§19.8 tavan listesinde de duruyor). */
    /* PID KAPANIŞTAN ÖNCE alınıyor: `app.process()` kapanmış bir
       uygulamada tanımsız dönüyor ve sonradan okumak turu kendi
       temizliğinde düşürüyor (ölçüldü). */
    const pid = app.process().pid;
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((r) => { setTimeout(r, 15_000); }),
    ]);
    /* SÜREÇ AĞACI: Electron ana sürecin altında renderer, GPU ve yardımcı
       süreçler var; yalnız ana süreci öldürmek çocukları bırakıyor ve
       Playwright'ın işçi kapanışı 60 sn'de zaman aşımına düşüyor
       (ölçüldü). Windows'ta ağacı `taskkill /T /F` topluyor. */
    try {
      if (pid && process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else if (pid) {
        process.kill(pid, 'SIGKILL');
      }
    } catch { /* zaten kapanmış */ }
    /* PROFİL SİLİNEMEZSE TUR DÜŞMÜYOR.
       Windows süreç ağacını sonlandırdıktan sonra dosya tanıtıcılarını
       gecikmeli bırakıyor ve dizin bir süre EPERM veriyor (ölçüldü).
       Birkaç saniye yeniden deneniyor; yine olmazsa dizin işletim
       sisteminin geçici klasöründe kalıyor ve orayı işletim sistemi
       temizliyor. Turun ölçtüğü şey ürün; kendi çöpü yüzünden kırmızıya
       düşmesi ölçümü yok eder. Sessiz de değil: sebep rapora yazılıyor. */
    try {
      fs.rmSync(profil, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (e) {
      not(`- (temizlik) profil dizini silinemedi: ${(e as Error).message.slice(0, 120)}`);
    }
    /* RAPOR EN SONDA yazılıyor: kapanış ve temizlik notları da dosyaya
       girsin diye. Önceden kapanıştan ÖNCE yazılıyordu ve kapanışta olan
       hiçbir şey rapora düşmüyordu. */
    fs.writeFileSync(
      path.join(CIKTI, 'rapor-muhur.md'),
      ['# Keşif turu — mühür zinciri (gerçek Electron)', '', ...rapor, ''].join('\n'),
      'utf8',
    );

  }
});
