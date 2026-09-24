import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  HISTORY_DIR,
  userDataRoot,
} from '../apps/desktop/electron/paths';
import { MAX_VERSIONS, listVersions, writeVersion } from '../apps/desktop/electron/store';

/**
 * Sürüm geçmişinde "kim kaydetti" bilgisi — §bkz. `store.ts` başlığı.
 *
 * Elektron testte yüklenmiyor (`paths.ts`'in `electronApp()` koruması), yani
 * `HISTORY_DIR` `userDataRoot()/history/<id>` altında (geçici dizin) —
 * `safe-path.test.ts` ile aynı kalıp. Her testte AYRI proje kimliği
 * kullanılıyor ki testler birbirinin dizinine yazmasın.
 */

let sayac = 0;
const projeId = () => `test-yazan-${Date.now()}-${sayac++}`;
const yuk = () => Uint8Array.from([1, 2, 3, 4]);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(userDataRoot(), { recursive: true, force: true });
});

describe('yazan adı — yazılıp geri okunuyor', () => {
  it('writeVersion savedBy ile çağrılınca listVersions onu döndürüyor', () => {
    const id = projeId();
    writeVersion(id, 'Proje X', yuk(), 'Ayşe Yılmaz');
    const [v] = listVersions(id);
    expect(v.savedBy).toBe('Ayşe Yılmaz');
  });

  it('savedBy hiç verilmezse alan tanımsız kalıyor (eski sürüm davranışı)', () => {
    const id = projeId();
    writeVersion(id, 'Proje X', yuk());
    const [v] = listVersions(id);
    expect(v.savedBy).toBeUndefined();
  });
});

describe('boş/boşluk ad kaydedilmiyor', () => {
  it('boş dize savedBy olarak yazılmıyor', () => {
    const id = projeId();
    writeVersion(id, 'Proje X', yuk(), '');
    expect(listVersions(id)[0].savedBy).toBeUndefined();
    // Eş dosya da hiç oluşmamalı.
    const dir = HISTORY_DIR(id);
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.json') && f !== 'meta.json')).toBe(false);
  });

  it('yalnızca boşluktan oluşan ad kaydedilmiyor', () => {
    const id = projeId();
    writeVersion(id, 'Proje X', yuk(), '   \t  ');
    expect(listVersions(id)[0].savedBy).toBeUndefined();
  });

  it('kontrol karakterleri temizlendikten sonra boş kalan ad kaydedilmiyor', () => {
    const id = projeId();
    writeVersion(id, 'Proje X', yuk(), '\x00\x1f\x7f');
    expect(listVersions(id)[0].savedBy).toBeUndefined();
  });
});

describe('eş dosyası olmayan eski sürüm', () => {
  it('hâlâ listeleniyor ve yazan alanı boş geliyor', () => {
    const id = projeId();
    const dir = HISTORY_DIR(id);
    // Göç-öncesi sürümü taklit et: yalnız .sbp, eş .json yok.
    fs.writeFileSync(path.join(dir, '1700000000000.sbp'), Buffer.from(yuk()));
    const versions = listVersions(id);
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe('1700000000000.sbp');
    expect(versions[0].savedBy).toBeUndefined();
  });
});

describe('budama eş dosyayı da siliyor', () => {
  it(`${MAX_VERSIONS}'den fazla sürüm yazılınca artık olanların .json eşi de silinir`, () => {
    const id = projeId();
    const dir = HISTORY_DIR(id);

    // Date.now() aynı ms içinde tekrarlanırsa dosya adları çakışır — her
    // çağrıda kesin farklı bir zaman damgası garanti et.
    let t = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => t++);

    // `id` sürüm dosyasının adını Date.now()'un İLK çağrısından alıyor
    // (`writeFileAtomic` içindeki geçici dosya adı da Date.now() kullanıyor,
    // yani çağrı başına birden fazla artış oluyor) — bu yüzden gerçek id'yi
    // çağrıdan HEMEN ÖNCEKİ `t` değerinden yakala, sonrasından değil.
    const yazilanlar: string[] = [];
    for (let i = 0; i < MAX_VERSIONS + 3; i++) {
      const beklenenId = `${t}.sbp`;
      writeVersion(id, 'Proje X', yuk(), `yazici-${i}`);
      yazilanlar.push(beklenenId);
    }

    const kalanSbp = fs.readdirSync(dir).filter((f) => f.endsWith('.sbp'));
    expect(kalanSbp).toHaveLength(MAX_VERSIONS);

    // Budanan (en eski) sürümlerin ne .sbp'si ne .json'u kalmalı.
    const budananlar = yazilanlar.slice(0, yazilanlar.length - MAX_VERSIONS);
    for (const stale of budananlar) {
      expect(fs.existsSync(path.join(dir, stale))).toBe(false);
      expect(fs.existsSync(path.join(dir, stale.replace('.sbp', '.json')))).toBe(false);
    }

    // Kalan sürümlerin eş dosyası hâlâ duruyor ve doğru adı taşıyor.
    const versions = listVersions(id);
    expect(versions).toHaveLength(MAX_VERSIONS);
    expect(versions.every((v) => typeof v.savedBy === 'string' && v.savedBy.startsWith('yazici-'))).toBe(true);
  });
});
