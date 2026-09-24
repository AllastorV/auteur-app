import { describe, expect, it } from 'vitest';
import { VARSAYILAN_FILIGRAN, filigranYerlesimi, type Filigran } from '@storyboard/core/disa/pdf';

/**
 * FİLİGRAN YERLEŞİMİ — sabit punto, sabit köşe hatası.
 *
 * Filigran gövde puntosunun sabit bir katıyla ve sayfanın %16/%28
 * noktasından çiziliyordu. Metnin UZUNLUĞU hesaba katılmıyordu: "TASLAK"
 * sayfanın sol altında küçücük kalıyor, uzun bir ad kenardan taşıyordu.
 * Kullanıcı gerçek çıktıda gördü (2026-08-30): "kısa yazılınca sol altta
 * kalıyor, her türlü uçtan uca ve ortalı olmalı".
 *
 * Ölçüt GEOMETRİ, PDF değil: fonksiyon saf, genişliği çağıran veriyor.
 * Eski hâli ancak dosya açılıp gözle bakılarak görülebilirdi.
 */

const G = 612; // Letter genişlik (pt)
const Y = 792; // Letter yükseklik (pt)

/** Eşgenişlikli varsayım: her karakter 0.6 em. Gerçek font da doğrusal. */
const genislik = (metin: string) => (punto: number) => metin.length * 0.6 * punto;

const fil = (o: Partial<Filigran> = {}): Filigran => ({ ...VARSAYILAN_FILIGRAN, ...o });

/** Metnin iki ucu — dönme uygulanmış hâliyle. */
function uclar(metin: string, f: Filigran) {
  const y = filigranYerlesimi(f, G, Y, genislik(metin));
  const uzunluk = genislik(metin)(y.punto);
  const rad = (f.aci * Math.PI) / 180;
  return {
    ...y,
    uzunluk,
    bas: { x: y.x, y: y.y },
    son: { x: y.x + uzunluk * Math.cos(rad), y: y.y + uzunluk * Math.sin(rad) },
  };
}

describe('filigranYerlesimi', () => {
  it('kısa ve uzun metin AYNI uzunluğu kaplar — punto metinden türüyor', () => {
    const kisa = uclar('TASLAK', fil());
    const uzun = uclar('GİZLİ — DAĞITILAMAZ KOPYA', fil());
    /* ESKİ DAVRANIŞ BURADA ÖLÜR: sabit punto ile kısa metin uzunun
       dörtte biri kadar yer kaplıyordu. */
    expect(Math.abs(kisa.uzunluk - uzun.uzunluk)).toBeLessThan(1);
    /* Ve kısa metin BÜYÜK puntoya çıkmak zorunda. */
    expect(kisa.punto).toBeGreaterThan(uzun.punto * 2);
  });

  it('metnin ortası sayfanın ortasındadır', () => {
    for (const metin of ['TASLAK', 'G', 'ÇOK UZUN BİR FİLİGRAN METNİ 2026']) {
      const u = uclar(metin, fil());
      const ortaX = (u.bas.x + u.son.x) / 2;
      const ortaY = (u.bas.y + u.son.y) / 2;
      expect(Math.abs(ortaX - G / 2), `${metin} yatay orta`).toBeLessThan(u.punto);
      expect(Math.abs(ortaY - Y / 2), `${metin} dikey orta`).toBeLessThan(u.punto);
    }
  });

  it('sayfadan TAŞMAZ', () => {
    for (const aci of [0, 15, 38, 60, 90, -38]) {
      const u = uclar('GİZLİ KOPYA', fil({ aci }));
      for (const nokta of [u.bas, u.son]) {
        expect(nokta.x, `açı ${aci} x`).toBeGreaterThanOrEqual(-1);
        expect(nokta.x, `açı ${aci} x`).toBeLessThanOrEqual(G + 1);
        expect(nokta.y, `açı ${aci} y`).toBeGreaterThanOrEqual(-1);
        expect(nokta.y, `açı ${aci} y`).toBeLessThanOrEqual(Y + 1);
      }
    }
  });

  it('yatayda sayfa genişliğini, dikeyde yüksekliğini ölçü alır', () => {
    /* 0° ve 90° bölenlerden birini sıfıra götürüyor; o eksenin
       KISITLAMAMASI gerekiyor, sıfıra bölüp NaN üretmemesi değil. */
    const yatay = uclar('X', fil({ aci: 0 }));
    expect(yatay.uzunluk).toBeCloseTo(G * VARSAYILAN_FILIGRAN.dolulukOrani, 5);
    const dikey = uclar('X', fil({ aci: 90 }));
    expect(dikey.uzunluk).toBeCloseTo(Y * VARSAYILAN_FILIGRAN.dolulukOrani, 5);
  });

  it('boş metinde punto patlamıyor', () => {
    /* Genişlik sıfırken oran sonsuza giderdi; çizim yolu boş metni zaten
       atlıyor ama fonksiyon kendi başına da sağlam kalmalı. */
    const y = filigranYerlesimi(fil(), G, Y, () => 0);
    expect(Number.isFinite(y.punto)).toBe(true);
    expect(Number.isFinite(y.x)).toBe(true);
    expect(Number.isFinite(y.y)).toBe(true);
  });

  it('dolulukOrani sınırlanıyor — 1.4 istense de sayfayı aşmaz', () => {
    const u = uclar('TASLAK', fil({ dolulukOrani: 1.4 }));
    expect(u.uzunluk).toBeLessThanOrEqual(Math.min(G / Math.cos(38 * Math.PI / 180),
      Y / Math.sin(38 * Math.PI / 180)) + 1);
  });
});
