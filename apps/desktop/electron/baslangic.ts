/**
 * Başlangıç davranışı — "PC açılınca otomatik başlat" / "Küçültülmüş başla".
 *
 * ELECTRON'A BAĞLI DEĞİL, kasten (`atomik.ts` ile aynı gerekçe): gerçek
 * `app`/pencere nesneleri burada tip olarak enjekte ediliyor, test ortamında
 * gerçek 'electron' paketini yüklemeye gerek kalmıyor.
 */

/** `app.setLoginItemSettings` alan tarafın en dar arayüzü. */
export interface LoginItemApi {
  setLoginItemSettings(settings: { openAtLogin: boolean; args?: string[]; path?: string }): void;
}

/** Süreç `--minimize` bayrağıyla mı başladı (oto-başlatma + küçültülmüş başla niyeti). */
export function kucukBaslatildiMi(argv: readonly string[]): boolean {
  return argv.includes('--minimize');
}

/** Oto-başlatma tercihini Electron'un login-item ayarına uygular. */
export function otoBaslatmaUygula(app: LoginItemApi, otoBaslat: boolean, kucukBasla: boolean, yol?: string): void {
  app.setLoginItemSettings({ openAtLogin: otoBaslat, ...loginItemHedefi(kucukBasla, yol) });
}

/**
 * Açılış penceresini başlangıç bayrağına göre gösterir.
 *
 * Pencere HER DURUMDA görev çubuğunda görünür kalır — `--minimize` ile
 * açılış "hiç gösterme" değil "göster ve küçült" demektir; sessizce hiç
 * açılmaması §15.4'ün yasakladığı sessiz başarısızlığın aynısı olurdu.
 */
export function baslangictaPencereyiGoster(
  win: { show(): void; showInactive(): void; minimize(): void },
  argv: readonly string[],
): void {
  if (kucukBaslatildiMi(argv)) {
    win.showInactive();
    win.minimize();
  } else {
    win.show();
  }
}

/** Windows kaydı okuma ve yazmada aynı yol/argümanları eşleştirir. */
export function loginItemHedefi(kucukBasla: boolean, yol?: string): { args: string[]; path?: string } {
  return { args: kucukBasla ? ['--minimize'] : [], ...(yol ? { path: yol } : {}) };
}
