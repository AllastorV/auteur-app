import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * KISAYOL LİSTESİ YALAN SÖYLEMEZ.
 *
 * Liste elle yazılıyor ve kod ayrı yerde; ikisi ıraksadığında kullanıcı ya
 * olmayan bir kısayolu dener (ve program bozuk sanır) ya da var olan bir
 * yeteneği hiç öğrenmez. Bu test iki yönü de zorlar.
 *
 * ÖLÇÜLDÜ: F, B, < > ve ? gerçekten bağlıydı ama listede hiç yazmıyordu;
 * ? ise yalnız Electron'un yerel menüsünden açılabiliyordu, yani web
 * derlemesinde hiç ulaşılamıyordu.
 */

const kok = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const kanca = fs.readFileSync(path.join(kok, 'hooks', 'useShortcuts.ts'), 'utf8');
const liste = fs.readFileSync(
  path.join(kok, 'components', 'dialogs', 'ShortcutsDialog.tsx'), 'utf8');

/** Kancada gerçekten bir dalı olan tek harfli tuşlar. */
const BAGLI_HARFLER = ['n', 'g', 's', 'b', 'f'];

/** Listedeki TUŞ hücrelerinden biri bu harfi içeriyor mu (`S`, `S / Alt+S`, `Alt+F`…). */
const listedeHarfVar = (harf: string) =>
  new RegExp(`\['[^']*${harf.toUpperCase()}[^']*',`).test(liste);

describe('kısayol listesi ile kod aynı şeyi söylüyor', () => {
  it.each(BAGLI_HARFLER)('%s tuşu kancada bağlı ve listede yazıyor', (harf) => {
    expect(kanca, `useShortcuts içinde '${harf}' dalı`).toContain(`key === '${harf}'`);
    expect(listedeHarfVar(harf), `listede '${harf.toUpperCase()}'`).toBe(true);
  });

  it('? kancada bağlı ve listede yazıyor', () => {
    expect(kanca).toContain("e.key === '?'");
    expect(liste).toContain("['?'");
  });

  it('yer imi gezinmesi (< >) listede', () => {
    expect(kanca).toContain("e.key === '<'");
    expect(liste).toContain('Alt+<');
  });

  /* KURAL DA LİSTEDE OLMALI. Kapı koda konup listede söylenmezse kullanıcı
     senaryo sayfasında `S`'ye basar, hiçbir şey olmaz ve programı bozuk
     sanar — olmayan bir kısayolu vaat etmekle aynı zarar. */
  it('senaryoda Alt kuralı hem kancada hem listede', () => {
    expect(kanca, 'çıplak harf kapısı').toContain("viewMode === 'senaryo'");
    expect(kanca).toMatch(/altKey/);
    expect(liste, 'kural şeridi').toContain('çıplak harf kısayolu yoktur');
  });

  /* `?` bir karakterdir; senaryo yazarken soru işareti yazmak listeyi
     açmamalı. Karakter üretmeyen bir takma ad şart. */
  it('F1 takma adı hem kancada hem listede', () => {
    expect(kanca).toContain("e.key === 'F1'");
    expect(liste).toContain("['F1'");
  });

  /* `?` Türkçe klavyede Shift+, ile yazılır. `shiftKey && key === '/'`
     diye kurulsaydı Türkçe düzende HİÇ çalışmazdı — programın dili Türkçe
     ve kullanıcısının klavyesi de öyle. */
  it('? tuşu düzen bağımsız okunuyor — Shift+/ varsayılmıyor', () => {
    expect(kanca).not.toMatch(/shiftKey[^\n]*key === '\/'/);
  });
});
