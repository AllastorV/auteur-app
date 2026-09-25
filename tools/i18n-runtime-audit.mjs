// i18n runtime audit — launches the BUILT desktop app with a fresh profile (a new
// English-speaking user's defaults), walks every mode, tab, dialog and menu it can
// reach, and reports visible text that is still Turkish.
//
// Why at runtime: the static scanners (packages/core/tests/i18n-kapsam.test.ts) only
// see .tsx literals; strings assembled in .ts stores, template literals, main-process
// menus and data tables slip past them. The screen is the ground truth.
//
//   npm run build --workspace @storyboard/desktop
//   node tools/i18n-runtime-audit.mjs            -> test-results/i18n-audit/report.json (+ .md)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'i18n-audit');
fs.mkdirSync(OUT, { recursive: true });

// Turkish source strings are the dictionary KEYS; any of them on screen = untranslated.
// Import the dictionary itself (Node strips TS types) — parsing it by regex missed single-quoted keys.
const { EN } = await import(new URL('../packages/core/src/dil/arayuz.ts', import.meta.url));
const EN_KEYS = Object.keys(EN);
const EN_VALUES = new Set(Object.values(EN));
// Keys that are also valid English (e.g. "Auteur", "PDF") are not evidence of a leak.
const KEYS = new Set(EN_KEYS.filter((k) => !EN_VALUES.has(k) && k.length > 2));
const TR_WORDS = /\b(ve|ile|için|yok|bağlı|sahne|sayfa|kaydet|kaydedildi|sil|iptal|kapat|yeni|proje|seç|seçili|değil|bir|bu|daha|çok|tüm|hepsi|kişi|panel yok|dakika|saniye|saat|gün|önce|sonra|açık|kapalı|hata|uyarı)\b/i;
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
// Content the audit itself types, and names that stay as they are in every language.
const ALLOW = [/^Auteur\b/, /^English$/, /^Türkçe$/, /The Last Train/i, /^Mara\b/i, /Northreach/];

const findings = new Map();
let screen = 'start';

async function scan(page, label) {
  screen = label;
  const items = await page.evaluate(() => {
    const out = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };
    const where = (el) => {
      const tid = el.closest('[data-testid]')?.getAttribute('data-testid') || '';
      return `${el.tagName.toLowerCase()}${tid ? `@${tid}` : ''}`;
    };
    // skip the document itself (screenplay/novel text the user typed)
    const inDocument = (el) => !!el.closest('.senaryo-metin, [contenteditable="true"], textarea');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const txt = n.nodeValue.replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!txt || !el || !visible(el) || inDocument(el)) continue;
      out.push({ kind: 'text', text: txt, where: where(el) });
    }
    for (const el of document.querySelectorAll('[title],[placeholder],[aria-label]')) {
      if (!visible(el)) continue;
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v && v.trim()) out.push({ kind: a, text: v.trim(), where: where(el) });
      }
    }
    for (const o of document.querySelectorAll('select option')) {
      if (o.parentElement && visible(o.closest('select'))) out.push({ kind: 'option', text: o.textContent.trim(), where: where(o.closest('select')) });
    }
    return out;
  });
  for (const it of items) {
    if (ALLOW.some((re) => re.test(it.text))) continue;
    const reasons = [];
    if (TR_LETTERS.test(it.text)) reasons.push('tr-letters');
    if (KEYS.has(it.text)) reasons.push('untranslated-key');
    if (!reasons.length && TR_WORDS.test(it.text) && !/^[A-Z0-9 .,:;!?'"()\-/%]+$/.test(it.text)) reasons.push('tr-word');
    if (!reasons.length) continue;
    const key = `${it.kind}|${it.text}|${it.where}`;
    if (!findings.has(key)) findings.set(key, { ...it, reasons, screens: new Set() });
    findings.get(key).screens.add(label);
  }
  await page.screenshot({ path: path.join(OUT, `${label.replace(/[^a-z0-9-]+/gi, '_')}.png`), timeout: 5000 }).catch(() => {});
  writeReport(); // after every screen: a hang later must not lose what was already seen
}

function writeReport() {
  const list = [...findings.values()].map((f) => ({ ...f, screens: [...f.screens] }))
    .sort((a, b) => a.where.localeCompare(b.where) || a.text.localeCompare(b.text));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(list, null, 2));
  const md = ['| text | kind | where | reasons | first screen |', '|---|---|---|---|---|',
    ...list.map((f) => `| ${f.text.replace(/\|/g, '\\|').slice(0, 90)} | ${f.kind} | ${f.where} | ${f.reasons.join(',')} | ${f.screens[0]} |`)];
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
  return list.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Hard per-step budget: a step that never settles (native dialog, hung evaluate)
// is abandoned instead of stalling the whole walk.
async function tryStep(page, label, fn) {
  let timer;
  const budget = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('step budget 25s exceeded')), 25_000); });
  try { await Promise.race([(async () => { await fn(); await sleep(500); await scan(page, label); })(), budget]); }
  catch (e) { console.warn(`[skip] ${label}: ${e.message.split('\n')[0]}`); }
  finally { clearTimeout(timer); }
}
// Escape closes popovers; full-screen pages (Help) and some dialogs need their own
// back/close button — without this one open page blocks every later step.
async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await sleep(150); }
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('[role="dialog"] button, header button, button').filter({ hasText: /^(Close|Cancel|×)$/ })
      .or(page.locator('button[aria-label="Back"], button[aria-label="Close"], button[title="Back"], button[title="Close"]')).first();
    if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) break;
    await btn.click({ timeout: 1500 }).catch(() => {});
    await sleep(250);
  }
}
// Walk the left-hand section list of a full-page view (Help, Settings).
async function walkSections(page, label) {
  const items = page.locator('nav button, nav a, aside button').filter({ hasText: /\w/ });
  const n = Math.min(await items.count(), 14);
  for (let k = 0; k < n; k++) {
    await items.nth(k).click({ timeout: 1500 }).catch(() => {});
    await sleep(300);
    await scan(page, `${label}-section${k}`);
  }
}

// A fresh app + profile per document type: one stuck overlay can no longer
// poison the rest of the walk, and every type is seen as a new user sees it.
async function launch() {
  const root = path.join(ROOT, 'apps/desktop');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-i18n-'));
  const app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--lang=en-US'], cwd: root });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(400, 300); w.setContentSize(1536, 864); });
  await sleep(1500);
  return { app, page };
}

(async () => {
  const TYPES = process.argv[2] ? process.argv[2].split(',')
    : ['Screenplay', 'TV episode', 'Stage play', 'Radio play', 'Novel', 'Comic', 'Plain text', 'French (two column)'];
  for (const [i, type] of TYPES.entries()) {
    const { app, page } = await launch();
    if (i === 0) {
      const nativeMenu = await app.evaluate(({ Menu }) => {
        const walk = (m) => (m ? m.items.flatMap((it) => [it.label, ...walk(it.submenu)]) : []);
        return walk(Menu.getApplicationMenu()).filter(Boolean);
      });
      for (const label of nativeMenu) {
        if (TR_LETTERS.test(label) || KEYS.has(label)) findings.set(`native|${label}`, { kind: 'native-menu', text: label, where: 'main process menu', reasons: ['native-menu'], screens: new Set(['app menu bar']) });
      }
      await scan(page, '00-library');
    }
    await tryStep(page, `01-new-dialog-${type}`, async () => {
      await page.locator('[data-testid="kitaplik-yeni"], [data-testid="bos-yeni"]').first().click();
      await sleep(400);
      await page.getByText(type, { exact: true }).first().click();
    });
    await tryStep(page, `02-${type}-editor`, async () => {
      await page.getByTestId('yeni-proje-ad').fill(`Audit ${type}`);
      await page.getByTestId('yeni-proje-olustur').click();
      await sleep(1200);
      const ed = page.locator('.senaryo-metin, [contenteditable="true"]').first();
      if (await ed.count()) { await ed.click(); await page.keyboard.type('int. kitchen - night'); await page.keyboard.press('Enter'); await page.keyboard.type('Mara waits.'); }
    });
    for (const tab of ['sekme-sahne', 'sekme-yazim', 'sekme-analiz', 'sekme-yapim']) {
      await tryStep(page, `03-${type}-${tab}`, async () => { await page.getByTestId(tab).click({ timeout: 3000 }); });
    }
    await tryStep(page, `03-${type}-subtabs`, async () => {
      const subs = page.locator('[data-testid="denetci-alt-sekmeleri"] button');
      for (let k = 0; k < await subs.count(); k++) { await subs.nth(k).click(); await sleep(300); await scan(page, `03-${type}-sub-${k}`); }
    });
    if (i > 0 && type !== 'Novel' && type !== 'Comic') { await app.close().catch(() => {}); continue; } // shared screens: walk fully for three types
    await tryStep(page, `04-${type}-context-menu`, async () => {
      await page.locator('.senaryo-metin > *').first().click({ button: 'right' });
    });
    await closeOverlays(page);
    await tryStep(page, `05-${type}-export`, async () => { await page.getByTestId('disa-aktar-dugmesi').click(); });
    for (const scope of ['kapsam-senaryo', 'kapsam-storyboard', 'kapsam-ikisi']) {
      await tryStep(page, `05-${type}-export-${scope}`, async () => { await page.getByTestId(scope).click({ timeout: 2000 }); });
    }
    await closeOverlays(page);
    const MENU = ['Title page…', 'Version history…', 'Seal and proof…', 'Compare versions…', 'Translate screenplay…',
      'Create a funding application from this screenplay…', 'Analysis board…', 'Collaboration session…', 'Help', 'Keyboard shortcuts', 'Settings'];
    for (const item of MENU) {
      await tryStep(page, `06-${type}-menu-${item}`, async () => {
        await page.getByTestId('uygulama-menusu').click();
        await sleep(300);
        await scan(page, `06-${type}-app-menu`);
        await page.getByText(item, { exact: true }).first().click({ timeout: 2000 });
        await sleep(700);
      });
      await tryStep(page, `06-${type}-menu-${item}-tabs`, async () => {
        const tabs = page.locator('[role="dialog"] [role="tab"], [role="dialog"] [data-testid*="sekme"]');
        for (let k = 0; k < Math.min(await tabs.count(), 8); k++) { await tabs.nth(k).click({ timeout: 1500 }); await sleep(300); await scan(page, `06-${type}-${item}-tab${k}`); }
        if (item === 'Help' || item === 'Settings' || item === 'Keyboard shortcuts') await walkSections(page, `06-${type}-${item}`);
      });
      await closeOverlays(page);
    }
    for (const mode of ['mod-grid', 'mod-board', 'mod-harita']) {
      await tryStep(page, `07-${type}-${mode}`, async () => { await page.getByTestId(mode).click({ timeout: 3000 }); await sleep(800); });
      if (mode === 'mod-grid') await tryStep(page, `07-${type}-cards-add`, async () => { await page.getByTestId('cards-add').click(); });
      if (mode === 'mod-board') {
        for (const tab of ['pano-sekme-katman', 'pano-sekme-boya', 'pano-sekme-ozellik', 'pano-sekme-rehber']) {
          await tryStep(page, `08-${type}-${tab}`, async () => { await page.getByTestId(tab).click({ timeout: 2000 }); });
        }
        await tryStep(page, `08-${type}-library`, async () => { await page.getByTestId('kutuphane-anahtari').click(); });
        await tryStep(page, `08-${type}-library-tabs`, async () => {
          const tabs = page.locator('[data-testid="kutuphane-cekmecesi"] button');
          for (let k = 0; k < Math.min(await tabs.count(), 6); k++) { await tabs.nth(k).click({ timeout: 1500 }); await sleep(300); await scan(page, `08-${type}-library-${k}`); }
        });
        await closeOverlays(page);
        await tryStep(page, `08-${type}-present`, async () => { await page.getByTestId('sunum-modu').click(); await sleep(800); });
        await closeOverlays(page);
      }
      if (mode === 'mod-harita') {
        await tryStep(page, `09-${type}-map-create`, async () => { await page.getByTestId('map-create').click(); await sleep(2500); });
        for (const tab of ['map-tab-settings', 'map-tab-countries', 'map-tab-places', 'map-tab-images']) {
          await tryStep(page, `09-${type}-${tab}`, async () => { await page.getByTestId(tab).click({ timeout: 2000 }); });
        }
      }
    }
    await tryStep(page, `10-${type}-back-to-script`, async () => { await page.getByTestId('mod-senaryo').click(); });
    await app.close().catch(() => {});
  }

  console.log(`findings ${writeReport()} -> ${path.join(OUT, 'report.md')}`);
  process.exit(0);
})();
