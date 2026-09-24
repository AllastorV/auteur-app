import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, MenuItem, nativeImage, safeStorage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  listVersions,
  pushRecent,
  readRecent,
  readStartupSettings,
  readVersion,
  writeFileAtomic,
  writeStartupSettings,
  writeVersion,
} from './store';
import { baslangictaPencereyiGoster, otoBaslatmaUygula, loginItemHedefi } from './baslangic';
import { renderVideo, cancelVideo, type ProgressEvent } from './video';
import { discardAllFrames, discardFrames, pushFrame, takeFrames } from './frameStore';
import { AUTOSAVE_DIR, VERI_KOK } from './paths';
import { gunlukDeposu } from './gunluk-deposu';
import { yazarlikDeposu } from './yazarlik-deposu';
import { zincirDeposu } from './zincir-deposu';
import { gunlukBasligi } from '@storyboard/core/veri/gunluk';
import type { YazarlikKaydi } from '@storyboard/core/veri/yazarlik';
import type { ZincirKaydi } from '@storyboard/core/veri/zincir';
import { baglamMenusu, menuEtiketi, type MenuDurumu } from '@storyboard/core/dil/menu';
import { RENK_ZEMINI, RENK_ADLARI } from '@storyboard/core/model/revizyon';
import { EN } from '@storyboard/core/dil/arayuz';
import {
  allowFile,
  isExternalHttpUrl,
  safeChosenMediaPath,
  safeHistoryId,
  safeProjectPath,
  safeVersionPath,
} from './safePath';
import { installMenu, menuDiliniAyarla, type ArayuzDili } from './menu';
import { eskiKokuTasi } from './veri-tasima';
import { iliskilendir } from './dosya-iliskilendirme';

/**
 * Ürün adı "Storyboard Stüdyo"dan "Auteur"e geçti (2026-08-27).
 *
 * Electron veri kökünü ürün adından TÜRETİYOR: taşımasaydık eski kurulumun
 * otomatik kayıtları, sürüm geçmişi ve §15 günlükleri yeni sürüm için yok
 * sayılırdı. Kullanıcı "bir şey silinmedi, sadece başka klasörde" diye
 * düşünmez — "her şey kayboldu" görür. Bir kereye mahsus, YALNIZCA yeni kök
 * henüz yokken taşınır; varsa hiç dokunulmaz.
 *
 * Taşıma başarısız olursa SESSİZ GEÇİLMEZ (§15.4): eski kök yerinde durur ve
 * kullanıcıya nerede olduğu söylenir.
 */
const ESKI_VERI_KOKU = 'Storyboard Stüdyo';

/* Windows gorev cubugu kimligi: ayarlanmazsa gelistirmede pencere
   "Electron" olarak gruplanir ve eski surumden kalan sabitlenmis kisayol
   yanlis simgeyle eslesir. electron-builder.json'daki appId ile AYNI. */
app.setAppUserModelId('com.auteur.app');

const { hata: veriTasimaHatasi } = eskiKokuTasi(app.getPath('userData'), ESKI_VERI_KOKU);

const DIRNAME = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
/** Renderer tarafından bildirilen "kaydedilmemiş değişiklik var" durumu. */
let hasUnsavedChanges = false;
let forceQuit = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#020617',
    title: 'Auteur',
    /* Pencere/gorev cubugu simgesi — gelistirmede exe simgesi yok, bu yol
       olmasa Electron'un varsayilan simgesi gorunur. Paketli surumde exe
       simgesi zaten build/icon.png'den geliyor (electron-builder). */
    icon: path.join(DIRNAME, '../build/icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(DIRNAME, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[pencere] ready-to-show geldi, gösteriliyor.');
    // `--minimize`: oto-başlatmadan "küçültülmüş başla" ile açıldı — pencere
    // yine görev çubuğunda görünür kalır, yalnız küçültülmüş açılır.
    if (mainWindow) baslangictaPencereyiGoster(mainWindow, process.argv);
  });

  /* PENCERE HER DURUMDA GÖRÜNÜR (§15.4 sessiz başarısızlık yasağı).
     `show: false` + `ready-to-show` deseni ilk boyamayı bekler; renderer
     açılırken patlarsa o olay HİÇ GELMEZ ve kullanıcı süreç ayakta olduğu
     hâlde ekranda hiçbir şey görmez — ÖLÇÜLDÜ: üretim derlemesi tam olarak
     böyle davrandı, üç Electron süreci çalışıyordu ve pencere yoktu.
     Programın çöktüğünü söylememek, çökmesinden kötüdür. */
  const GORUNME_SINIRI_MS = 8000;
  const gorunmeSayaci = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.error('[pencere] ready-to-show gelmedi; pencere yine de gösteriliyor.');
      mainWindow.show();
      mainWindow.webContents.openDevTools({ mode: 'bottom' });
    }
  }, GORUNME_SINIRI_MS);
  mainWindow.once('ready-to-show', () => clearTimeout(gorunmeSayaci));
  mainWindow.once('closed', () => clearTimeout(gorunmeSayaci));

  /* Renderer hataları ANA SÜREÇ günlüğüne akıyor. Renderer'ın kendi konsolu
     görünmeyen bir pencerede kimseye ulaşmıyor; hata ayıklanamayan bir hata
     yok sayılmış hatadır. */
  mainWindow.webContents.on('did-fail-load', (_o, kod, aciklama, url) => {
    console.error(`[pencere] yükleme başarısız (${kod}): ${aciklama} — ${url}`);
    mainWindow?.show();
  });
  mainWindow.webContents.on('render-process-gone', (_o, ayrinti) => {
    console.error(`[pencere] renderer düştü: ${ayrinti.reason}`);
  });
  mainWindow.webContents.on('preload-error', (_o, yol, hata) => {
    console.error(`[pencere] preload hatası (${yol}): ${hata.message}`);
  });
  mainWindow.webContents.on('console-message', (_o, seviye, mesaj, satir, kaynak) => {
    /* Yalnız hata ve uyarı: bilgi mesajlarını taşımak günlüğü kullanılamaz
       kılar ve asıl hatayı gizler. */
    if (seviye >= 2) console.error(`[renderer] ${mesaj} (${kaynak}:${satir})`);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(DIRNAME, '../dist/index.html'));
  }

  // Dış bağlantılar yalnızca tarayıcıda ve yalnızca http(s) olarak açılır:
  // şema denetlenmezse renderer `file:`/`smb:` gibi yollarla işletim
  // sisteminde keyfi hedef açtırabilir.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Uygulama penceresi kendi arayüzünden başka bir yere gitmez.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    if (url !== current) {
      event.preventDefault();
      if (isExternalHttpUrl(url)) void shell.openExternal(url);
    }
  });

  // Kaydedilmemiş iş sessizce kaybolmasın: Electron, tarayıcıların aksine
  // `beforeunload` için kendiliğinden onay kutusu göstermez.
  mainWindow.on('close', (event) => {
    if (!hasUnsavedChanges || forceQuit || !mainWindow) return;
    event.preventDefault();
    const tr = arayuzDili === 'tr';
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: tr ? ['Vazgeç', 'Kaydetmeden çık'] : ['Cancel', 'Quit without saving'],
      defaultId: 0,
      cancelId: 0,
      title: tr ? 'Kaydedilmemiş değişiklikler' : 'Unsaved changes',
      message: tr ? 'Kaydedilmemiş değişiklikler var.' : 'There are unsaved changes.',
      detail: tr
        ? 'Çıkarsanız son kayıttan sonraki değişiklikler kaybolur.'
        : 'If you quit, changes since the last save will be lost.',
    });
    if (choice === 1) {
      forceQuit = true;
      mainWindow.close();
    }
  });

  /* §16.4 bağlam menüsü.
   *
   * KARAR mantığı burada DEĞİL: hangi öğenin görüneceği ve hangisinin pasif
   * olacağı `@storyboard/core/dil/menu`'deki saf `baglamMenusu`'nda ve orada
   * test ediliyor. Bu blok yalnız Electron'un `params`'ını o modülün
   * girdisine çeviriyor ve sonucu çiziyor — kural iki eve çıkmıyor (Karar 2).
   *
   * Yazım önerileri YALNIZ buradan gelebilir: `params.dictionarySuggestions`
   * Chromium'un denetleyicisinden geliyor ve tarayıcıda karşılığı yok. Web'de
   * `denetimVar: false` ile yazım grubu hiç oluşmuyor.
   *
   * ⚠ Bu blok bu ortamda ÇALIŞTIRILARAK doğrulanmadı (Electron penceresi
   * gerekiyor); §17'de kayıtlı. Saf karar katmanı ölçüldü, çizim katmanı
   * kullanıcının `npm run dev` denemesini bekliyor.
   */
  mainWindow.webContents.on('context-menu', (_olay, params) => {
    const pencere = mainWindow;
    if (!pencere) return;

    void (async () => {
      /* Menü DURUMU renderer'dan soruluyor: rol, seçili satır sayısı ve panel
         bağı orada yaşıyor. Ana süreçte tahmin etmek, iki tarafın ayrı
         cevaplar vermesine yol açardı. */
      const durum = (await pencere.webContents
        .executeJavaScript('window.__mizansenMenuDurumu?.() ?? null')
        .catch(() => null)) as Record<string, unknown> | null;
      if (!durum) return;

      const gruplar = baglamMenusu({
        ...(durum as unknown as MenuDurumu),
        yanlisKelime: params.misspelledWord || undefined,
        oneriler: params.dictionarySuggestions,
        secimVar: params.selectionText.length > 0,
        panoDolu: clipboard.readText().length > 0,
        denetimVar: true,
      });

      const menu = new Menu();
      gruplar.forEach((grup, i) => {
        if (i > 0) menu.append(new MenuItem({ type: 'separator' }));
        if (grup[0]?.eylem.tur === 'revizyon-rengi') {
          const altMenu = new Menu();
          grup.forEach((oge, index) => {
            const e = oge.eylem;
            if (e.tur !== 'revizyon-rengi') return;
            const [r, g, b] = RENK_ZEMINI[e.renk].map((k) => Math.round(k * 255));
            const pikseller = Buffer.alloc(14 * 14 * 4);
            for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
              const kenar = x === 0 || y === 0 || x === 13 || y === 13;
              pikseller.set(kenar ? [112, 112, 112, 255] : [b, g, r, 255], (y * 14 + x) * 4);
            }
            const ad = RENK_ADLARI[e.renk];
            altMenu.append(new MenuItem({
              label: `${index + 1}. ${arayuzDili === 'en' ? EN[ad] ?? ad : ad}`,
              type: 'checkbox', checked: oge.secili, enabled: !oge.pasif,
              icon: nativeImage.createFromBitmap(pikseller, { width: 14, height: 14 }),
              click: () => {
                void pencere.webContents.executeJavaScript(
                  `window.__mizansenMenuEylem?.(${JSON.stringify(e)})`,
                ).catch((error) => console.error('[revizyon-rengi]', error));
              },
            }));
          });
          menu.append(new MenuItem({
            label: arayuzDili === 'en' ? 'Revision colour' : 'Revizyon rengi', submenu: altMenu,
          }));
          return;
        }
        for (const oge of grup) {
          menu.append(new MenuItem({
            label: menuEtiketi(oge, arayuzDili),
            enabled: !oge.pasif,
            click: () => {
              /* Pano ve yazım eylemleri ELECTRON'un kendi API'leriyle: bunlar
                 belgenin değil düzenleyicinin işi ve `replaceMisspelling`
                 Chromium'un denetleyicisine bağlı — renderer'da karşılığı yok.
                 Belgeye dokunan eylemler ise renderer'da uygulanıyor, çünkü
                 mutasyonlar, mod kabuğu ve geri alma orada yaşıyor. */
              const e = oge.eylem;
              const wc = pencere.webContents;
              switch (e.tur) {
                case 'kes': wc.cut(); return;
                case 'kopyala': wc.copy(); return;
                case 'yapistir': wc.paste(); return;
                case 'tumunu-sec': wc.selectAll(); return;
                case 'oneri': wc.replaceMisspelling(e.oneri); return;
                default:
                  void wc.executeJavaScript(
                    `window.__mizansenMenuEylem?.(${JSON.stringify(e)})`,
                  ).catch(() => {});
              }
            },
          }));
        }
      });
      menu.popup({ window: pencere });
    })();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * ÇİFT TIKLANAN PROJE DOSYASI (kullanıcı bildirimi 2026-08-26).
 *
 * Bildirilen: "masaüstündeki proje dosyasına basınca direkt uygulama
 * açılıyor, sonra projeyi seçmem gerekiyor; kayıtlı bir dosyaya tıkladıysam
 * direkt dosyayı açmalı."
 *
 * Haklı: dosyaya tıklamak "bu dosyayı aç" demektir, "programı aç" değil.
 * Windows dosya yolunu KOMUT SATIRI ARGÜMANI olarak veriyor; macOS ise
 * `open-file` olayıyla ve o olay `whenReady`'den ÖNCE gelebiliyor — bu yüzden
 * yol bir değişkende BEKLETİLİYOR ve pencere hazır olunca gönderiliyor.
 */
let acilacakDosya: string | null = null;

/** Argümanlar arasından proje dosyasını ayıklar. */
function projeYoluBul(argv: readonly string[]): string | null {
  /* Electron'un kendi bayrakları (`--`) ve `.` gibi yollar atlanıyor;
     yalnız gerçekten var olan bir dosya kabul ediliyor. Var olmayan bir yolu
     açmaya çalışmak, kullanıcıya anlamsız bir hata göstermek olurdu. */
  for (const a of argv.slice(1)) {
    if (a.startsWith('-') || a === '.') continue;
    try {
      if (fs.statSync(a).isFile()) return a;
    } catch { /* yol değil */ }
  }
  return null;
}

/** Pencereye "şu dosyayı aç" der. Pencere yoksa bekletir. */
function dosyayiAc(yol: string) {
  acilacakDosya = yol;
  const p = mainWindow;
  if (!p) return;
  /* Renderer henüz yüklenmemişse olay kaybolur; `did-finish-load` bekleniyor
     ve zaten yüklüyse hemen gönderiliyor. */
  const gonder = () => {
    p.webContents.send('proje-dosyasi-ac', acilacakDosya);
    acilacakDosya = null;
  };
  if (p.webContents.isLoading()) p.webContents.once('did-finish-load', gonder);
  else gonder();
}

/* macOS: dosya çift tıklandığında bu olay gelir ve `whenReady`'den ÖNCE
   gelebilir. */
app.on('open-file', (olay, yol) => {
  olay.preventDefault();
  dosyayiAc(yol);
});

/* İKİNCİ ÖRNEK: program açıkken bir dosyaya çift tıklanırsa yeni bir kopya
   açmak yerine AÇIK pencerede o dosya açılıyor. İki kopya aynı dosyayı
   yazarsa §15'in koruduğu şey tehlikeye girerdi. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_o, argv) => {
    const yol = projeYoluBul(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (yol) dosyayiAc(yol);
  });
}

app.whenReady().then(() => {
  installMenu();
  createWindow();
  /* §15.4: taşıma başarısızsa kullanıcı bunu GÖRMELİ; log yeterli değil. */
  if (veriTasimaHatasi) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Eski sürümün verisi taşınamadı',
      message: 'Eski sürümün verisi taşınamadı',
      detail: veriTasimaHatasi,
      buttons: ['Tamam'],
    });
  }
  const yol = acilacakDosya ?? projeYoluBul(process.argv);
  if (yol) dosyayiAc(yol);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Yarıda kalmış dışa aktarmaların geçici kareleri diskte kalmasın.
app.on('will-quit', () => discardAllFrames());

/* ------------------------------------------------------------------ */
/* IPC — proje dosyası                                                 */
/* ------------------------------------------------------------------ */

const SBP_FILTER = [{ name: 'Storyboard Projesi', extensions: ['sbp'] }];

ipcMain.handle('project:open-dialog', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Proje aç',
    filters: SBP_FILTER,
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const filePath = allowFile(res.filePaths[0]);
  const data = fs.readFileSync(filePath);
  return { path: filePath, data: new Uint8Array(data) };
});

ipcMain.handle('project:read', async (_e, filePath: string) => {
  return new Uint8Array(fs.readFileSync(safeProjectPath(filePath)));
});

ipcMain.handle(
  'project:save',
  async (
    _e,
    payload: {
      data: Uint8Array; path: string | null; saveAs: boolean;
      projectName: string; projectId: string; projectType?: string;
    },
  ) => {
    let target: string;
    if (!payload.path || payload.saveAs) {
      const res = await dialog.showSaveDialog({
        title: payload.saveAs ? 'Farklı kaydet' : 'Projeyi kaydet',
        defaultPath: `${payload.projectName || 'storyboard'}.sbp`,
        filters: SBP_FILTER,
      });
      if (res.canceled || !res.filePath) return { path: null, cancelled: true };
      target = allowFile(res.filePath);
    } else {
      target = safeProjectPath(payload.path);
    }
    writeFileAtomic(target, Buffer.from(payload.data));
    pushRecent({ path: target, name: payload.projectName, openedAt: Date.now(), tip: payload.projectType });
    writeVersion(safeHistoryId(payload.projectId, 'proje kimliği'), payload.projectName, payload.data);
    return { path: target, cancelled: false };
  },
);

ipcMain.handle(
  'project:autosave',
  async (
    _e,
    payload: { data: Uint8Array; path: string | null; projectId: string; projectName: string; savedBy?: unknown },
  ) => {
    // Dosya yolu varsa üzerine yazılır; yoksa otomatik kayıt klasörüne düşer.
    const projectId = safeHistoryId(payload.projectId, 'proje kimliği');
    const target = payload.path
      ? safeProjectPath(payload.path)
      : path.join(AUTOSAVE_DIR(), `${projectId}.sbp`);
    writeFileAtomic(target, Buffer.from(payload.data));
    writeVersion(projectId, payload.projectName, payload.data, payload.savedBy);
    return { path: target };
  },
);

/* §15 veri güvenliği. Kök dizin uygulama verisinde: proje henüz diske
   kaydedilmemiş olabilir ama yazdıkları o andan itibaren korunmalı.

   `projeId` doğrulaması BURADA DEĞİL, `gunlukDeposu`'nun içinde: yol sınırı
   orası ve `cipaOku`'nun ad denetimi de orada duruyor. Kuralı burada
   tekrarlasaydık iki eve çıkardı (Karar 2) ve deponun başka bir çağıranı
   korumasız kalırdı. */
const veriDeposu = (projeId: string) => gunlukDeposu(VERI_KOK(), projeId);

ipcMain.handle('veri:gunluge-ekle', async (_e, projeId: string, cerceveler: Uint8Array) => {
  veriDeposu(projeId).ekle(new Uint8Array(cerceveler), gunlukBasligi());
});
ipcMain.handle('veri:gunluk-oku', async (_e, projeId: string) => veriDeposu(projeId).oku());
ipcMain.handle(
  'veri:cipa-yaz',
  async (_e, projeId: string, cipa: Uint8Array, seyreltme?: boolean) => {
    veriDeposu(projeId).cipaYazVeKes(new Uint8Array(cipa), Date.now(), seyreltme ?? true);
  },
);
ipcMain.handle('veri:halka', async (_e, projeId: string) => veriDeposu(projeId).halka());
ipcMain.handle('veri:cipa-oku', async (_e, projeId: string, id: string) =>
  veriDeposu(projeId).cipaOku(id));
/* Kurtarma yolu çıpayı PARÇALI ister: geri koyma günlükten sonra, çekirdekte
   (yarış + dirilme — bkz. varlik-deposu.cipaParcala). */
ipcMain.handle('veri:cipa-parcali-oku', async (_e, projeId: string, id: string) =>
  veriDeposu(projeId).cipaParcaliOku(id));
/* Varlıkları çıpadan ayrı tutmanın bedeli: baytlar diskten silinmiş olabilir.
   Sessiz boş kare §15.4'ün yasakladığı şey — arayüz bunu sorup söylüyor. */
ipcMain.handle('veri:cipa-eksik-varliklar', async (_e, projeId: string, id: string) =>
  veriDeposu(projeId).eksikVarliklar(id));
ipcMain.handle('veri:gunluk-arsivle', async (_e, projeId: string) =>
  veriDeposu(projeId).arsivle(Date.now()));

/**
 * Yazarlık günlüğü — "bu satırı kim yazdı" sorusu, `veriDeposu` ile AYNI kök,
 * AYRI dosya. `ekle` her çağrıda fırsatçı biçimde budanıyor da: ayrı bir
 * zamanlayıcı kurmak yerine — 30 günden eski kayıtlar yalnız yeni yazım
 * geldiğinde silinir, bu günlük büyüklüğü için yeterli.
 */
const yazarlikDeposuAl = (projeId: string) => yazarlikDeposu(VERI_KOK(), projeId);

ipcMain.handle('yazarlik:ekle', async (_e, projeId: string, kayitlar: YazarlikKaydi[]) => {
  const depo = yazarlikDeposuAl(projeId);
  depo.ekle(kayitlar);
  depo.buda(Date.now());
});
ipcMain.handle('yazarlik:oku', async (_e, projeId: string) => yazarlikDeposuAl(projeId).oku());

/**
 * MÜHÜR ZİNCİRİ — `veriDeposu` ile AYNI kök, AYRI dosya.
 *
 * Yazarlık günlüğünden farkı BUDAMA YOK: bir hash zincirini yeniden yazmak
 * zinciri kırar ve kırık zincir kurcalanmış zincirden ayırt edilemez. Bu
 * yüzden burada `buda` çağrısı da yok, öyle bir yöntem de yok.
 *
 * Hatalar YUTULMUYOR: `ipcMain.handle` fırlatan bir işleyiciyi renderer'a
 * reddedilmiş bir söz olarak geçiriyor ve arayüz onu kullanıcıya gösteriyor.
 * "Mühürlendi" dedikten sonra sessizce kaybolan bir kayıt, hiç mühür
 * olmamasından kötüdür.
 */
const zincirDeposuAl = (projeId: string) => zincirDeposu(VERI_KOK(), projeId);

ipcMain.handle(
  'kanit:muhur-yaz',
  async (_e, projeId: string, kayit: ZincirKaydi, metin: Uint8Array) =>
    zincirDeposuAl(projeId).muhurYaz(kayit, new Uint8Array(metin)),
);
ipcMain.handle(
  'kanit:damga-yaz',
  async (_e, projeId: string, kayit: ZincirKaydi, jeton: Uint8Array) =>
    zincirDeposuAl(projeId).damgaYaz(kayit, new Uint8Array(jeton)),
);
ipcMain.handle('kanit:oku', async (_e, projeId: string) => zincirDeposuAl(projeId).oku());
ipcMain.handle('kanit:muhur-metni', async (_e, projeId: string, zaman: number) =>
  zincirDeposuAl(projeId).muhurMetni(zaman));
ipcMain.handle('kanit:damga-jetonu', async (_e, projeId: string, zaman: number) =>
  zincirDeposuAl(projeId).damgaJetonu(zaman));

/* ------------------------------------------------------------------ */
/* IPC — §16.4 dil araçları                                            */
/* ------------------------------------------------------------------ */

/**
 * Denetim dilleri listesi KABUKTAN geliyor, sabit yazılmıyor: Chromium'un
 * derlenmiş sözlük listesi sürümden sürüme değişiyor ve sabit bir liste,
 * kullanıcıya `setSpellCheckerLanguages`'in fırlatacağı bir dil gösterirdi.
 */
ipcMain.handle('dil:diller', async () => {
  const oturum = mainWindow?.webContents.session;
  return oturum ? [...oturum.availableSpellCheckerLanguages] : [];
});

ipcMain.handle('dil:dilleri-ayarla', async (_e, diller: string[]) => {
  const oturum = mainWindow?.webContents.session;
  if (!oturum) return;
  /* Desteklenmeyen dil FIRLATIR ve bütün çağrıyı düşürür; önce süzülüyor ki
     bir yazım hatası yüzünden kullanıcı hiç denetim alamaz duruma düşmesin. */
  const gecerli = diller.filter((d) => oturum.availableSpellCheckerLanguages.includes(d));
  oturum.setSpellCheckerLanguages(gecerli);
});

ipcMain.handle('dil:sozluk', async (_e, kelimeler: string[]) => {
  const oturum = mainWindow?.webContents.session;
  if (!oturum) return;
  /* Chromium'un özel sözlüğü KALICI ve uygulama geneli; proje sözlüğü ise
     belgeye ait. İkisi ayrı: proje değiştiğinde eski projenin adları
     denetleyicide kalmasın diye her yükleme öncesi temizlenir. */
  for (const k of kelimeler) {
    if (typeof k === 'string' && k) oturum.addWordToSpellCheckerDictionary(k);
  }
});

/**
 * API anahtarı ŞİFRELİ saklanıyor (`safeStorage`).
 *
 * Düz metin dosyaya yazmak, anahtarı yedeklere ve senkron klasörlerine
 * taşırdı. `safeStorage` işletim sisteminin anahtarlığını kullanıyor;
 * kullanılamıyorsa yazım REDDEDİLİYOR — sessizce düz metne düşmek, kullanıcıya
 * şifrelendiğini sandırmak olurdu.
 */
const ANAHTAR_DOSYASI = () => path.join(VERI_KOK(), 'anahtarlar.bin');

function anahtarlariOku(): Record<string, string> {
  try {
    const ham = fs.readFileSync(ANAHTAR_DOSYASI());
    return JSON.parse(safeStorage.decryptString(ham)) as Record<string, string>;
  } catch {
    return {};
  }
}

ipcMain.handle('dil:anahtar-yaz', async (_e, saglayici: string, anahtar: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Bu sistemde şifreli saklama yok; anahtar kaydedilmedi.');
  }
  const id = safeHistoryId(saglayici, 'sağlayıcı adı');
  const hepsi = anahtarlariOku();
  hepsi[id] = String(anahtar);
  fs.mkdirSync(VERI_KOK(), { recursive: true });
  writeFileAtomic(ANAHTAR_DOSYASI(), safeStorage.encryptString(JSON.stringify(hepsi)));
});

ipcMain.handle('dil:anahtar-oku', async (_e, saglayici: string) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return anahtarlariOku()[safeHistoryId(saglayici, 'sağlayıcı adı')] ?? null;
});

ipcMain.handle('project:recent', async () => readRecent());
ipcMain.handle('project:versions', async (_e, projectId: string) =>
  listVersions(safeHistoryId(projectId, 'proje kimliği')),
);
ipcMain.handle('project:restore', async (_e, projectId: string, versionId: string) => {
  const buf = readVersion(safeVersionPath(projectId, versionId));
  return buf ? new Uint8Array(buf) : null;
});

/* ------------------------------------------------------------------ */
/* IPC — dışa aktarma                                                  */
/* ------------------------------------------------------------------ */

/**
 * Tek dosyalık dışa aktarım (senaryo PDF/Fountain/FDX, storyboard PDF).
 *
 * Yazım ATOMİK: kullanıcı var olan bir dosyanın üstüne kaydediyor olabilir ve
 * yarıda kesilen bir yazım, önceki teslim edilebilir dosyayı da götürürdü
 * (§15 ile aynı gerekçe).
 */
ipcMain.handle(
  'export:dosya',
  async (
    _e,
    payload: { bytes: Uint8Array; dosyaAdi: string; turAdi: string; uzantilar: string[] },
  ) => {
    const res = await dialog.showSaveDialog({
      title: 'Dışa aktar',
      defaultPath: payload.dosyaAdi,
      filters: [{ name: payload.turAdi, extensions: payload.uzantilar }],
    });
    if (res.canceled || !res.filePath) return { path: null, cancelled: true };
    writeFileAtomic(res.filePath, Buffer.from(payload.bytes));
    return { path: res.filePath, cancelled: false };
  },
);

ipcMain.handle(
  'export:png-zip',
  async (_e, payload: { frames: { fileName: string; dataUrl: string }[]; zipName: string }) => {
    const res = await dialog.showSaveDialog({
      title: 'PNG dizisini kaydet',
      defaultPath: payload.zipName,
      filters: [{ name: 'ZIP arşivi', extensions: ['zip'] }],
    });
    if (res.canceled || !res.filePath) return { path: null, cancelled: true };

    const zip = new JSZip();
    for (const frame of payload.frames) {
      zip.file(frame.fileName, Buffer.from(frame.dataUrl.slice(frame.dataUrl.indexOf(',') + 1), 'base64'));
    }
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    /* ATOMİK — kardeşi `export:dosya` ile aynı gerekçe: kullanıcı var olan bir
       teslim dosyasının üstüne aktarıyor olabilir ve yarıda kesilen bir yazım
       eskisini de götürürdü. §15.2: "Yerinde yazma yasaktır — bu kural hiçbir
       yerde delinmez." Kural `atomik.ts`'te tek yerde yaşıyor; bu çağıran
       ona uğramıyordu. */
    writeFileAtomic(res.filePath, out);
    return { path: res.filePath, cancelled: false };
  },
);

/**
 * Renderer kareleri üretildikçe tek tek gönderir; her biri doğrudan diske
 * yazılır. Tüm kare setini tek IPC mesajında taşımak büyük animatiklerde
 * uygulamayı yanıt veremez hale getiriyordu.
 */
ipcMain.handle('export:video-frame', async (_e, payload: unknown) => {
  return pushFrame(payload as Parameters<typeof pushFrame>[0]);
});

ipcMain.handle('export:video-discard', async (_e, jobId: string) => {
  discardFrames(jobId);
});

/* 'export:pick-audio' dialogunun filtresiyle AYNI liste — ikisi ayrilirsa
   dialogun verdigi dosya dogrulamadan gecemez olurdu. */
const SES_UZANTILARI = ['mp3', 'wav', 'm4a', 'aac', 'ogg'] as const;

ipcMain.handle('export:video', async (_e, payload: any) => {
  const ext = payload.format === 'webm' ? 'webm' : 'mp4';
  /* Yollar renderer'dan geliyor ve renderer güvenilir DEĞİL (tarama
     bulgusu 3): denetimsiz `outputPath` ffmpeg çıktısıyla diskte keyfi
     dosyayı ezer, denetimsiz `audioPath` keyfi dosyayı okurdu. Yalnız BU
     oturumda dialog'dan geçmiş yollar kabul edilir (`allowFile`). */
  let outputPath: string | null = payload.outputPath
    ? safeChosenMediaPath(payload.outputPath, ['mp4', 'webm'], 'video çıktısı')
    : null;
  const audioPath: string | null = payload.audioPath
    ? safeChosenMediaPath(payload.audioPath, SES_UZANTILARI, 'ses dosyası')
    : null;
  if (!outputPath) {
    const res = await dialog.showSaveDialog({
      title: 'Animatiği kaydet',
      defaultPath: `animatik.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return { path: null, cancelled: true };
    outputPath = allowFile(res.filePath);
  }

  const send = (p: ProgressEvent) => mainWindow?.webContents.send('export:progress', p);
  try {
    // Akıtılmış kareler varsa bellekteki listeye değil onlara bakılır.
    const diskSegments = takeFrames(payload.jobId) ?? undefined;
    const finalPath = await renderVideo({ ...payload, diskSegments, outputPath, audioPath }, send);
    return { path: finalPath, cancelled: false };
  } catch (err) {
    const message = (err as Error).message;
    send({ jobId: payload.jobId, phase: message === 'İptal edildi' ? 'iptal' : 'hata', percent: 0, message });
    if (message === 'İptal edildi') return { path: null, cancelled: true };
    throw err;
  } finally {
    discardFrames(payload.jobId);
  }
});

ipcMain.handle('export:cancel', async (_e, jobId: string) => {
  cancelVideo(jobId);
  discardFrames(jobId);
});

ipcMain.handle('export:pick-audio', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Ses dosyası seç',
    filters: [{ name: 'Ses', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  /* Secilen yol allowlist'e girer: export:video ayni yolu safeChosenMediaPath
     ile dogrulayacak. */
  return allowFile(res.filePaths[0]);
});

ipcMain.handle('app:server-url', async () => process.env.STORYBOARD_SERVER_URL ?? 'http://localhost:5180');

ipcMain.on('app:dirty', (_e, dirty: unknown) => {
  hasUnsavedChanges = Boolean(dirty);
});

/* Arayüz dili renderer'da yaşar (localStorage); ana süreç menü ve yerel
   diyaloglar için buradan öğrenir. Açılışta ve her değişimde gelir. */
let arayuzDili: ArayuzDili = 'en';
/* Dosya ilişkilendirmesi KULLANICI İSTEĞİYLE — açılışta sessizce sistem
   ayarı değiştirmek kabul edilemez (bkz. dosya-iliskilendirme.ts). */
ipcMain.handle('dosya:iliskilendir', async () => iliskilendir());

ipcMain.on('dil:arayuz', (_e, dil: unknown) => {
  arayuzDili = dil === 'tr' ? 'tr' : 'en';
  menuDiliniAyarla(arayuzDili);
});

/* ------------------------------------------------------------------ */
/* IPC — başlangıç ayarları                                            */
/* ------------------------------------------------------------------ */

ipcMain.handle('baslangic:oku', async () => ({
  // `openAtLogin` işletim sisteminden okunuyor: kullanıcı bunu OS'in kendi
  // "Başlangıç uygulamaları" listesinden kapatmış olabilir, saklanan bir
  // kopya o durumda yalan söylerdi.
  otoBaslat: app.getLoginItemSettings(loginItemHedefi(
    readStartupSettings().kucukBasla, process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'),
  )).openAtLogin,
  kucukBasla: readStartupSettings().kucukBasla,
}));

ipcMain.handle(
  'baslangic:yaz',
  async (_e, payload: { otoBaslat: boolean; kucukBasla: boolean }) => {
    otoBaslatmaUygula(app, payload.otoBaslat, payload.kucukBasla,
      process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'));
    writeStartupSettings({ kucukBasla: payload.kucukBasla });
  },
);
