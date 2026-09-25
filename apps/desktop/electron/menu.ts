import { BrowserWindow, Menu, app, shell, type MenuItemConstructorOptions } from 'electron';
import { anaDiliniAyarla } from './metin';

/**
 * Uygulama menüsü — arayüz diliyle (varsayılan İngilizce) çizilir.
 *
 * Sözlük BURADA ayrı: ana süreç renderer'ın `dil/arayuz.ts`ini import
 * edemez (ayrı süreç, ayrı paket). Anahtarlar aynı desen: Türkçe metin
 * anahtar, İngilizce çeviri değer; bilinmeyen anahtar Türkçe düşer.
 *
 * Menü öğeleri arayüzdeki eylemlerle aynı kanaldan gider: ana pencereye bir
 * `menu:<eylem>` mesajı gönderilir, renderer kendi kısayol işleyicisini
 * çalıştırır. Böylece menü ve klavye kısayolları tek bir davranışı paylaşır.
 */
export type MenuAction =
  | 'yeni'
  | 'ac'
  | 'kaydet'
  | 'farkli-kaydet'
  | 'son-projeler'
  | 'surum-gecmisi'
  | 'disa-aktar'
  | 'oturum'
  | 'geri-al'
  | 'ileri-al'
  | 'yeni-panel'
  | 'panel-cogalt'
  | 'grid-gorunum'
  | 'panelleri-gizle'
  | 'sigdir'
  | 'kisayollar'
  | 'yardim'
  | 'analiz'
  | 'ayarlar';


export type ArayuzDili = 'en' | 'tr';

let aktifDil: ArayuzDili = 'en';

const MENU_EN: Record<string, string> = {
  'Hakkında': 'About',
  'Gizle': 'Hide',
  'Diğerlerini Gizle': 'Hide Others',
  'Tümünü Göster': 'Show All',
  'Çıkış': 'Quit',
  'Dosya': 'File',
  'Yeni Proje': 'New Project',
  'Aç…': 'Open…',
  'Son Açılanlar': 'Recent',
  'Kaydet': 'Save',
  'Farklı Kaydet…': 'Save As…',
  'Sürüm Geçmişi': 'Version History',
  'Dışa Aktar…': 'Export…',
  'Ayarlar…': 'Settings…',
  'Pencereyi Kapat': 'Close Window',
  'Düzen': 'Edit',
  'Geri Al': 'Undo',
  'İleri Al': 'Redo',
  'Kes': 'Cut',
  'Kopyala': 'Copy',
  'Yapıştır': 'Paste',
  'Tümünü Seç': 'Select All',
  'Panel': 'Panel',
  'Yeni Panel': 'New Panel',
  'Paneli Çoğalt': 'Duplicate Panel',
  'Görünüm': 'View',
  'Grid ↔ Pano': 'Grid ↔ Board',
  'Panelleri Gizle/Göster': 'Show/Hide Panels',
  'Canvas’ı Sığdır': 'Fit Canvas',
  'Arayüzü Büyüt': 'Zoom In UI',
  'Arayüzü Küçült': 'Zoom Out UI',
  'Arayüz Ölçeğini Sıfırla': 'Reset UI Zoom',
  'Tam Ekran': 'Full Screen',
  'Yeniden Yükle': 'Reload',
  'Geliştirici Araçları': 'Developer Tools',
  'Ortak Çalışma': 'Collaboration',
  'Oturum ve Davetler…': 'Session & Invites…',
  'Yardım': 'Help',
  'Klavye Kısayolları': 'Keyboard Shortcuts',
  'Yardım Merkezi': 'Help Centre',
  'Analiz Panosu': 'Analysis Board',
  'Proje Sayfası': 'Project Page',
};

const mt = (tr: string): string => (aktifDil === 'tr' ? tr : MENU_EN[tr] ?? tr);

/** Renderer dil değişimini bildirince menü bu dille YENİDEN kurulur. */
export function menuDiliniAyarla(dil: ArayuzDili): void {
  aktifDil = dil;
  anaDiliniAyarla(dil); // diyalog başlıkları ve ana süreç mesajları aynı dille
  Menu.setApplicationMenu(buildMenu());
}

function send(action: MenuAction) {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:action', action);
}

const item = (label: string, action: MenuAction, accelerator?: string): MenuItemConstructorOptions => ({
  label: mt(label),
  accelerator,
  click: () => send(action),
});

export function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about', label: mt('Hakkında') },
              { type: 'separator' },
              { role: 'hide', label: mt('Gizle') },
              { role: 'hideOthers', label: mt('Diğerlerini Gizle') },
              { role: 'unhide', label: mt('Tümünü Göster') },
              { type: 'separator' },
              { role: 'quit', label: mt('Çıkış') },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: mt('Dosya'),
      submenu: [
        item('Yeni Proje', 'yeni', 'CmdOrCtrl+N'),
        item('Aç…', 'ac', 'CmdOrCtrl+O'),
        item('Son Açılanlar', 'son-projeler'),
        { type: 'separator' },
        item('Kaydet', 'kaydet', 'CmdOrCtrl+S'),
        item('Farklı Kaydet…', 'farkli-kaydet', 'CmdOrCtrl+Shift+S'),
        item('Sürüm Geçmişi', 'surum-gecmisi'),
        { type: 'separator' },
        item('Dışa Aktar…', 'disa-aktar', 'CmdOrCtrl+E'),
        { type: 'separator' },
        item('Ayarlar…', 'ayarlar', 'CmdOrCtrl+,'),
        { type: 'separator' },
        isMac ? { role: 'close', label: mt('Pencereyi Kapat') } : { role: 'quit', label: mt('Çıkış') },
      ],
    },
    {
      label: mt('Düzen'),
      submenu: [
        item('Geri Al', 'geri-al', 'CmdOrCtrl+Z'),
        item('İleri Al', 'ileri-al', 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { role: 'cut', label: mt('Kes') },
        { role: 'copy', label: mt('Kopyala') },
        { role: 'paste', label: mt('Yapıştır') },
        { role: 'selectAll', label: mt('Tümünü Seç') },
      ],
    },
    {
      label: mt('Panel'),
      submenu: [
        item('Yeni Panel', 'yeni-panel'),
        item('Paneli Çoğalt', 'panel-cogalt', 'CmdOrCtrl+D'),
      ],
    },
    {
      label: mt('Görünüm'),
      submenu: [
        item('Grid ↔ Pano', 'grid-gorunum'),
        item('Panelleri Gizle/Göster', 'panelleri-gizle'),
        item('Canvas’ı Sığdır', 'sigdir'),
        { type: 'separator' },
        item('Analiz Panosu', 'analiz', 'CmdOrCtrl+Shift+A'),
        { type: 'separator' },
        { role: 'zoomIn', label: mt('Arayüzü Büyüt') },
        { role: 'zoomOut', label: mt('Arayüzü Küçült') },
        { role: 'resetZoom', label: mt('Arayüz Ölçeğini Sıfırla') },
        { role: 'togglefullscreen', label: mt('Tam Ekran') },
        { type: 'separator' },
        { role: 'reload', label: mt('Yeniden Yükle') },
        { role: 'toggleDevTools', label: mt('Geliştirici Araçları') },
      ],
    },
    {
      label: mt('Ortak Çalışma'),
      submenu: [item('Oturum ve Davetler…', 'oturum')],
    },
    {
      label: mt('Yardım'),
      submenu: [
        item('Yardım Merkezi', 'yardim'),
        item('Klavye Kısayolları', 'kisayollar'),
        {
          label: mt('Proje Sayfası'),
          click: () => void shell.openExternal('https://github.com/allastorv/storyboard'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

export function installMenu(): void {
  Menu.setApplicationMenu(buildMenu());
}
