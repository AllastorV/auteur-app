import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { userDataRoot } from '../apps/desktop/electron/paths';
import {
  allowFile,
  isExternalHttpUrl,
  safeChosenMediaPath,
  safeHistoryId,
  safeProjectPath,
  safeVersionPath,
} from '../apps/desktop/electron/safePath';

/**
 * Renderer'dan gelen yollar güvenilmezdir: doğrulanmazsa IPC keyfi dosya
 * okuma/yazmaya dönüşür.
 */
describe('IPC yol doğrulaması', () => {
  it('dialog ile seçilen .sbp dosyasına izin verir', () => {
    const p = path.join(os.tmpdir(), 'proje.sbp');
    allowFile(p);
    expect(safeProjectPath(p)).toBe(path.resolve(p));
  });

  it('izin verilmemiş yolu reddeder', () => {
    expect(() => safeProjectPath(path.join(os.tmpdir(), 'baska.sbp'))).toThrow();
  });

  it('.sbp dışındaki uzantıları reddeder', () => {
    expect(() => safeProjectPath('C:/Windows/System32/config/SAM')).toThrow();
    expect(() => safeProjectPath('/etc/passwd')).toThrow();
    expect(() => safeProjectPath('')).toThrow();
    expect(() => safeProjectPath(null)).toThrow();
  });

  it('sürüm kimliğinde yol ayracı ve .. kabul etmez', () => {
    expect(() => safeHistoryId('../../etc', 'kimlik')).toThrow();
    expect(() => safeHistoryId('a/b', 'kimlik')).toThrow();
    expect(() => safeHistoryId('..', 'kimlik')).toThrow();
    expect(safeHistoryId('prj_abc123', 'kimlik')).toBe('prj_abc123');
  });

  it('sürüm yolu geçmiş klasörünün dışına çıkamaz', () => {
    expect(() => safeVersionPath('prj_1', '../../../../etc/passwd')).toThrow();
    expect(() => safeVersionPath('prj_1', '1700000000000.txt')).toThrow();
    const ok = safeVersionPath('prj_1', '1700000000000.sbp');
    expect(ok.endsWith(`${path.sep}1700000000000.sbp`)).toBe(true);
    fs.rmSync(userDataRoot(), { recursive: true, force: true });
  });
});

describe('Dış bağlantı şeması', () => {
  it('yalnızca http/https dışarı açılır', () => {
    expect(isExternalHttpUrl('https://example.com')).toBe(true);
    expect(isExternalHttpUrl('http://localhost:5180/api/health')).toBe(true);
    expect(isExternalHttpUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isExternalHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalHttpUrl('\\saldirgan\paylasim\yuk.exe')).toBe(false);
    expect(isExternalHttpUrl('bilinmeyen')).toBe(false);
  });
});

describe('safeChosenMediaPath — video/ses yolları (tarama bulgusu 3)', () => {
  /* export:video'nun outputPath/audioPath'i denetimsizdi: renderer keyfi bir
     yola ffmpeg çıktısı yazdırabilir (oturum.log'u ezmek dahil), keyfi bir
     dosyayı ses girdisi diye okutabilirdi. Kural: yalnız BU oturumda dialog
     ile seçilmiş (allowFile) yollar, yalnız beklenen uzantılar. */
  it('dialog ile seçilmemiş yol REDDEDİLİR — uzantı doğru olsa bile', () => {
    expect(() => safeChosenMediaPath('C:\hedef\oturum.mp4', ['mp4', 'webm'], 'video çıktısı'))
      .toThrow(/erişim izni yok/);
  });

  it('allowFile ile kaydedilen yol kabul edilir', () => {
    const yol = 'C:\secilen\animatik.mp4';
    allowFile(yol);
    expect(safeChosenMediaPath(yol, ['mp4', 'webm'], 'video çıktısı')).toContain('animatik.mp4');
  });

  it('yanlış uzantı REDDEDİLİR — izin listesinde olsa bile', () => {
    const yol = 'C:\secilen\gunluk.log';
    allowFile(yol);
    expect(() => safeChosenMediaPath(yol, ['mp4', 'webm'], 'video çıktısı')).toThrow(/uzantısı/);
  });

  it('boş ya da dizgi olmayan yol REDDEDİLİR', () => {
    expect(() => safeChosenMediaPath('', ['mp4'], 'video çıktısı')).toThrow(/Geçersiz/);
    expect(() => safeChosenMediaPath(null, ['mp4'], 'video çıktısı')).toThrow(/Geçersiz/);
  });
});
