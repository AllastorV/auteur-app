import { describe, expect, it } from 'vitest';
import {
  GUN_MS,
  GUNLUK_PENCERE_MS,
  SAAT_MS,
  SAATLIK_PENCERE_MS,
  TAZE_PENCERE_MS,
  seyrelt,
  type KontrolNoktasi,
} from '@storyboard/core/veri/kontrol-noktalari';

const SIMDI = 1_800_000_000_000;

const nokta = (yasMs: number, ek: Partial<KontrolNoktasi> = {}): KontrolNoktasi => ({
  id: `k${yasMs}${ek.taslak ? '-t' : ''}`,
  zaman: SIMDI - yasMs,
  ...ek,
});

/** 5 dakikada bir, 30 günlük sentetik seri (§15.5 yöntemi). */
function otuzGunlukSeri(): KontrolNoktasi[] {
  const noktalar: KontrolNoktasi[] = [];
  const adim = 5 * 60_000;
  for (let yas = 0; yas < 31 * GUN_MS; yas += adim) noktalar.push(nokta(yas));
  return noktalar;
}

describe('§15.5 — kontrol noktası seyrelmesi doğru pencereyi koruyor', () => {
  const { tutulan, silinen } = seyrelt(otuzGunlukSeri(), SIMDI);
  const yas = (n: KontrolNoktasi) => SIMDI - n.zaman;

  it('son 1 saatte HER nokta tutulur', () => {
    const taze = otuzGunlukSeri().filter((n) => yas(n) < TAZE_PENCERE_MS);
    const tutulanTaze = tutulan.filter((n) => yas(n) < TAZE_PENCERE_MS);
    expect(tutulanTaze).toHaveLength(taze.length);
    expect(taze.length).toBe(12); // 5 dakikada bir → saatte 12
  });

  it('1-24 saat arasında saatte bir kalır', () => {
    const kovalar = new Set(
      tutulan
        .filter((n) => yas(n) >= TAZE_PENCERE_MS && yas(n) < SAATLIK_PENCERE_MS)
        .map((n) => Math.floor(n.zaman / SAAT_MS)),
    );
    const tutulanSayi = tutulan.filter(
      (n) => yas(n) >= TAZE_PENCERE_MS && yas(n) < SAATLIK_PENCERE_MS,
    ).length;
    // Kova başına TEK nokta: sayı ile ayrık kova sayısı eşit olmak zorunda.
    expect(tutulanSayi).toBe(kovalar.size);
    // 23 saatlik pencere → 23 ya da 24 kova (sınır hizasına göre).
    expect(kovalar.size).toBeGreaterThanOrEqual(23);
    expect(kovalar.size).toBeLessThanOrEqual(24);
  });

  it('1-30 gün arasında günde bir kalır', () => {
    const gunlukler = tutulan.filter(
      (n) => yas(n) >= SAATLIK_PENCERE_MS && yas(n) < GUNLUK_PENCERE_MS,
    );
    const kovalar = new Set(gunlukler.map((n) => Math.floor(n.zaman / GUN_MS)));
    expect(gunlukler).toHaveLength(kovalar.size);
    expect(kovalar.size).toBeGreaterThanOrEqual(28);
    expect(kovalar.size).toBeLessThanOrEqual(30);
  });

  it('30 günden eski otomatik noktalar düşer', () => {
    expect(silinen.length).toBeGreaterThan(0);
    expect(tutulan.filter((n) => yas(n) >= GUNLUK_PENCERE_MS && !n.taslak)).toHaveLength(0);
  });

  /* Asıl kazanç bu: 5 dakikada bir nokta üreten 30 günlük bir seans binlerce
     dosya bırakır; seyrelme onu ~65'e indirirken 30 günlük pencereyi korur. */
  it('binlerce noktayı onlarca noktaya indirir ama pencereyi korumaya devam eder', () => {
    expect(otuzGunlukSeri().length).toBeGreaterThan(8000);
    expect(tutulan.length).toBeLessThan(80);
    expect(Math.max(...tutulan.map(yas))).toBeGreaterThan(29 * GUN_MS);
  });
});

describe('veri kaybı yolları', () => {
  /* Uygulama 40 gün sonra açılırsa BÜTÜN noktalar 30 günden eskidir. Guard
     olmasa politika hepsini siler ve projenin tek yedeği yok olurdu. */
  it('EN YENİ nokta yaşı ne olursa olsun tutulur', () => {
    const eski = [nokta(40 * GUN_MS), nokta(45 * GUN_MS), nokta(50 * GUN_MS)];
    const { tutulan, silinen } = seyrelt(eski, SIMDI);
    expect(tutulan).toHaveLength(1);
    expect(tutulan[0].id).toBe(eski[0].id);
    expect(silinen).toHaveLength(2);
  });

  it('kaydedilmiş taslaklar ASLA silinmez', () => {
    const noktalar = [
      nokta(0),
      nokta(60 * GUN_MS, { taslak: true }),
      nokta(400 * GUN_MS, { taslak: true }),
      nokta(61 * GUN_MS),
    ];
    const { tutulan, silinen } = seyrelt(noktalar, SIMDI);
    expect(tutulan.filter((n) => n.taslak)).toHaveLength(2);
    expect(silinen.every((n) => !n.taslak)).toBe(true);
  });

  /* Saat geriye atlarsa (yaz saati, NTP düzeltmesi) damgalar gelecekte kalır.
     Şüpheli bir saat yüzünden iş silmek kabul edilemez. */
  it('gelecekteki zaman damgası silinmez', () => {
    const noktalar = [nokta(-2 * GUN_MS), nokta(0)];
    const { silinen } = seyrelt(noktalar, SIMDI);
    expect(silinen).toHaveLength(0);
  });

  it('boş liste çökmez', () => {
    expect(seyrelt([], SIMDI)).toEqual({ tutulan: [], silinen: [] });
  });
});

describe('kararlılık', () => {
  /* Kovalar MUTLAK zamana göre; yaşa göre olsaydı her çağrıda kayar ve aynı
     nokta bir çağrıda tutulup diğerinde silinebilirdi. */
  it('aynı girdide iki çağrı aynı sonucu verir', () => {
    const seri = otuzGunlukSeri();
    const a = seyrelt(seri, SIMDI).tutulan.map((n) => n.id);
    const b = seyrelt(seri, SIMDI).tutulan.map((n) => n.id);
    expect(a).toEqual(b);
  });

  it('bir kez tutulan nokta, saat ilerlemeden ikinci çağrıda düşmez', () => {
    const seri = otuzGunlukSeri();
    const ilk = new Set(seyrelt(seri, SIMDI).tutulan.map((n) => n.id));
    // Zaman 1 dakika ilerledi; hiçbir pencere sınırı aşılmadı.
    const ikinci = seyrelt(seri.filter((n) => ilk.has(n.id)), SIMDI + 60_000);
    expect(ikinci.silinen).toHaveLength(0);
  });

  /* Kovaların MUTLAK zamana bağlı olduğunu ölçen iddia. Aynı saat diliminde
     üç nokta: hangi anda bakılırsa bakılsın tek temsilci kalmalı. Kovalar
     YAŞA göre hesaplansaydı `simdi` yarım saat ilerlediğinde aynı saatteki
     noktalar iki farklı yaş kovasına düşer ve ikisi birden tutulurdu — yani
     seyrelme `simdi`'ye göre salınırdı. */
  it('aynı MUTLAK saatteki noktalar hangi anda bakılırsa bakılsın tek temsilci bırakır', () => {
    const saatBasi = Math.floor(SIMDI / SAAT_MS) * SAAT_MS;
    const ucu: KontrolNoktasi[] = [
      { id: 'a', zaman: saatBasi - 5 * SAAT_MS + 5 * 60_000 },
      { id: 'b', zaman: saatBasi - 5 * SAAT_MS + 25 * 60_000 },
      { id: 'c', zaman: saatBasi - 5 * SAAT_MS + 45 * 60_000 },
      // En yeni nokta guard'ının üçlüyü kurtarmaması için taze bir nokta.
      { id: 'taze', zaman: SIMDI },
    ];
    for (const kayma of [0, 30 * 60_000, 47 * 60_000]) {
      const { tutulan } = seyrelt(ucu, SIMDI + kayma);
      const saatlikTutulan = tutulan.filter((n) => n.id !== 'taze');
      expect(saatlikTutulan.map((n) => n.id), `kayma=${kayma}`).toEqual(['c']);
    }
  });

  it('sonuç zamana göre yeniden eskiye sıralı döner', () => {
    const { tutulan } = seyrelt(otuzGunlukSeri(), SIMDI);
    for (let i = 1; i < tutulan.length; i++) {
      expect(tutulan[i - 1].zaman).toBeGreaterThan(tutulan[i].zaman);
    }
  });
});
