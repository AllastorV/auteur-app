import { describe, expect, it, vi } from 'vitest';
import {
  baslangictaPencereyiGoster,
  kucukBaslatildiMi,
  otoBaslatmaUygula,
  loginItemHedefi,
} from '../apps/desktop/electron/baslangic';

/**
 * Ayarlar penceresi — "PC açılınca otomatik başlat" / "Küçültülmüş başla".
 *
 * `otoBaslatmaUygula`/`baslangictaPencereyiGoster` ELECTRON'A BAĞLI DEĞİL
 * (bkz. `baslangic.ts` başlığı): gerçek `app`/pencere nesneleri yerine sahte
 * (mock) nesneler enjekte ediliyor, gerçek 'electron' paketi test ortamında
 * yok.
 */
describe('otoBaslatmaUygula — login-item ayarı', () => {
  it('otoBaslat=true, kucukBasla=true → openAtLogin:true VE args --minimize içeriyor', () => {
    const app = { setLoginItemSettings: vi.fn() };
    otoBaslatmaUygula(app, true, true);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: ['--minimize'] });
  });

  it('kucukBasla=false → args İÇİNDE --minimize YOK', () => {
    const app = { setLoginItemSettings: vi.fn() };
    otoBaslatmaUygula(app, true, false);
    const [ayar] = app.setLoginItemSettings.mock.calls[0];
    expect(ayar.args).not.toContain('--minimize');
    expect(ayar).toEqual({ openAtLogin: true, args: [] });
  });

  it('otoBaslat=false, kucukBasla=true → openAtLogin:false (küçültme niyeti oto-başlatma olmadan anlamsız)', () => {
    const app = { setLoginItemSettings: vi.fn() };
    otoBaslatmaUygula(app, false, true);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false, args: ['--minimize'] });
  });
});

describe('kucukBaslatildiMi', () => {
  it('argv --minimize içeriyorsa true', () => {
    expect(kucukBaslatildiMi(['C:/mizansen.exe', '--minimize'])).toBe(true);
  });
  it('argv --minimize içermiyorsa false', () => {
    expect(kucukBaslatildiMi(['C:/mizansen.exe'])).toBe(false);
    expect(kucukBaslatildiMi(['C:/mizansen.exe', 'C:/proje.mzn'])).toBe(false);
  });
});

describe('baslangictaPencereyiGoster — açılışta pencere', () => {
  it('--minimize argümanıyla açılışta pencere GÖSTERİLİP KÜÇÜLTÜLÜYOR, show() çağrılmıyor', () => {
    const win = { show: vi.fn(), showInactive: vi.fn(), minimize: vi.fn() };
    baslangictaPencereyiGoster(win, ['C:/mizansen.exe', '--minimize']);
    expect(win.showInactive).toHaveBeenCalledTimes(1);
    expect(win.minimize).toHaveBeenCalledTimes(1);
    expect(win.show).not.toHaveBeenCalled();
  });

  it('argümansız açılışta pencere NORMAL GÖSTERİLİYOR, minimize EDİLMİYOR', () => {
    const win = { show: vi.fn(), showInactive: vi.fn(), minimize: vi.fn() };
    baslangictaPencereyiGoster(win, ['C:/mizansen.exe']);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.minimize).not.toHaveBeenCalled();
    expect(win.showInactive).not.toHaveBeenCalled();
  });

  // Pencere HER İKİ durumda da bir şekilde gösteriliyor olmalı — görev
  // çubuğunda hiç görünmeme (§15.4 sessiz başarısızlık) kabul edilmez.
  it('her iki dalda da pencere görev çubuğuna ÇIKARILIYOR (show ya da showInactive)', () => {
    for (const argv of [['x', '--minimize'], ['x']]) {
      const win = { show: vi.fn(), showInactive: vi.fn(), minimize: vi.fn() };
      baslangictaPencereyiGoster(win, argv);
      expect(win.show.mock.calls.length + win.showInactive.mock.calls.length).toBe(1);
    }
  });
});


it('başlangıç okuması ve yazması aynı portable yolu ve argümanları kullanır', () => {
  for (const small of [true, false]) {
    const app = { setLoginItemSettings: vi.fn() };
    const path = 'C:/QA/Auteur.exe';
    otoBaslatmaUygula(app, true, small, path);
    const { openAtLogin, ...target } = app.setLoginItemSettings.mock.calls[0][0];
    expect(openAtLogin).toBe(true);
    expect(target).toEqual(loginItemHedefi(small, path));
    expect(target.path).toBe(path);
    expect(target.args).toEqual(small ? ['--minimize'] : []);
  }
});
