import { describe, expect, it } from 'vitest';
import { publicWebUrl, geriDonguMu, yerelAdresler } from '../../../apps/server/src/server';

/**
 * DAVET LİNKİ BAŞKA MAKİNEDE ÇALIŞIYOR (kullanıcı bildirimi 2026-08-26).
 *
 * Bildirilen: "oturum oluşturup açınca farklı internetten girmeye çalıştım,
 * bağlanamadı diyor." Sebep: davet linki SABİT `localhost:5174` üretiyordu ve
 * daveti alan kişi linki açınca KENDİ bilgisayarına gidiyordu. Yani ortak
 * çalışma daveti aynı makine dışında HİÇ çalışmıyordu.
 */

const istek = (host: string, proto?: string) =>
  ({ headers: { host, ...(proto ? { 'x-forwarded-proto': proto } : {}) } });

describe('davet adresi istekten türetiliyor', () => {
  it('LAN adresinden gelen istek AYNI makineyi gösteriyor', () => {
    expect(publicWebUrl(istek('192.168.1.20:5180'), undefined, 5174))
      .toBe('http://192.168.1.20:5174');
  });

  it('web portu sunucu portundan AYRI — host portu değiştiriliyor', () => {
    expect(publicWebUrl(istek('10.0.0.5:5180'), undefined, 5174)).toContain(':5174');
    expect(publicWebUrl(istek('10.0.0.5:5180'), undefined, 5174)).not.toContain(':5180');
  });

  it('yapılandırılmış adres KAZANIYOR — dağıtımda alan adı başka olabilir', () => {
    expect(publicWebUrl(istek('192.168.1.20:5180'), 'https://mizansen.example', 5174))
      .toBe('https://mizansen.example');
  });

  it('ters vekil arkasında https korunuyor', () => {
    expect(publicWebUrl(istek('mizansen.example', 'https'), undefined, 5174))
      .toBe('https://mizansen.example:5174');
  });

  /* Host başlığı hiç yoksa elde bir şey yok; localhost'a düşmek TEK
     seçenek ama arayüz onu UYARIYOR — sessizce çalışmayan bir link vermek
     hiç vermemekten kötü. */
  it('host başlığı yoksa localhost — ama bu uyarılan durum', () => {
    const url = publicWebUrl({ headers: {} }, undefined, 5174);
    expect(url).toBe('http://localhost:5174');
    expect(geriDonguMu(url)).toBe(true);
  });
});

describe('geri döngü uyarısı', () => {
  it('paylaşılamayan adresleri tanıyor', () => {
    for (const u of ['http://localhost:5174', 'http://127.0.0.1:5174', 'http://[::1]:5174']) {
      expect(geriDonguMu(u), u).toBe(true);
    }
  });

  it('paylaşılabilir adresleri tanıyor', () => {
    for (const u of ['http://192.168.1.20:5174', 'https://mizansen.example']) {
      expect(geriDonguMu(u), u).toBe(false);
    }
  });

  /* Ayrıştırılamayan adres paylaşılamaz sayılıyor: kullanıcıyı yanlış yönde
     rahatlatmaktansa fazladan uyarmak yeğ. */
  it('bozuk adres uyarılıyor', () => {
    expect(geriDonguMu('bu bir adres değil')).toBe(true);
  });
});

describe('ağdan erişim adresleri', () => {
  /* Sunucu 0.0.0.0'da dinliyor ama kullanıcı hangi adresi paylaşacağını
     bilmiyordu ve localhost paylaşıyordu. */
  it('geri döngü adresleri LİSTEDE YOK — paylaşılamazlar', () => {
    for (const a of yerelAdresler()) {
      expect(a).not.toBe('127.0.0.1');
      expect(a).not.toBe('::1');
    }
  });

  it('hepsi IPv4 — paylaşılan adres okunabilir olmalı', () => {
    for (const a of yerelAdresler()) expect(a).toMatch(/^\d+\.\d+\.\d+\.\d+$/u);
  });
});
