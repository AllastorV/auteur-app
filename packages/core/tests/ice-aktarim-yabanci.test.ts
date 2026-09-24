// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseFdx, parseFountain } from '@storyboard/core/model/script';

/**
 * YABANCI DOSYA SADAKATİ.
 *
 * Gidiş-dönüş turu yalnız KENDİ yazdığımızı geri okuyabildiğimizi kanıtlar.
 * Asıl sınav başka programın ürettiği dosyadır: Final Draft'ın başlık sayfası,
 * `General`/`Shot` paragrafları, Fountain'ın ikili diyalog ve ortalama
 * işaretleri. Bunlar sessizce düşerse yazar metnini kaybettiğini
 * FARK ETMEZ — kural: kayıp varsa görünür olacak.
 *
 * Dosya içerikleri ÜRETİLMİŞTİR; gerçek senaryodan alıntı yok.
 */

describe('Final Draft — yabancı dosya', () => {
  const FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="General"><Text>Bir üretim notu.</Text></Paragraph>
    <Paragraph Type="Scene Heading" Number="1"><Text>İÇ. ATÖLYE - GECE</Text></Paragraph>
    <Paragraph Type="Shot"><Text>YAKIN PLAN - ELLER</Text></Paragraph>
    <Paragraph Type="Action"><Text>Torna tezgâhı döner.</Text></Paragraph>
    <Paragraph Type="Character"><Text>USTA</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Tut şunu sıkı.</Text></Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Action"><Text>ÖRNEK SENARYO</Text></Paragraph>
      <Paragraph Type="Action"><Text>yazan Bir Yazar</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`;

  const bloklar = parseFdx(FDX);
  const metinler = bloklar.map((b) => b.text);

  it('başlık sayfası senaryo gövdesine KARIŞMIYOR', () => {
    expect(metinler).not.toContain('ÖRNEK SENARYO');
    expect(metinler).not.toContain('yazan Bir Yazar');
  });

  it('tanınmayan paragraf tipi SESSİZCE DÜŞMÜYOR — metin korunuyor', () => {
    expect(metinler).toContain('Bir üretim notu.');
    expect(metinler).toContain('YAKIN PLAN - ELLER');
  });

  it('tanınmayan tip aksiyona düşürülüyor', () => {
    const not = bloklar.find((b) => b.text === 'Bir üretim notu.');
    const plan = bloklar.find((b) => b.text === 'YAKIN PLAN - ELLER');
    expect(not?.type).toBe('action');
    expect(plan?.type).toBe('action');
  });

  it('bilinen tipler doğru okunuyor', () => {
    expect(bloklar.map((b) => b.type)).toEqual([
      'action',
      'scene',
      'action',
      'action',
      'character',
      'dialogue',
    ]);
  });
});

describe('Fountain — yabancı işaretler metni BOZMUYOR', () => {
  it('ikili diyalog işareti (^) karakter adına yapışmıyor', () => {
    const b = parseFountain('İÇ. ODA - GÜN\n\nAYŞE\nBen gidiyorum.\n\nMERT ^\nBen kalıyorum.\n');
    const adlar = b.filter((x) => x.type === 'character').map((x) => x.text);
    expect(adlar).toEqual(['AYŞE', 'MERT']);
  });

  it('ortalanmış metin (>...<) işaretsiz okunuyor', () => {
    const b = parseFountain('İÇ. ODA - GÜN\n\n>SON<\n');
    const son = b[b.length - 1];
    expect(son.text).toBe('SON');
    expect(son.type).toBe('action');
  });

  it('şarkı sözü (~) işaretsiz okunuyor', () => {
    const b = parseFountain('İÇ. ODA - GÜN\n\n~Bir zamanlar bir yerde\n');
    expect(b[b.length - 1].text).toBe('Bir zamanlar bir yerde');
  });

  it('zorlanmış aksiyon (!) diyalog akışı içinde de işaretsiz', () => {
    const b = parseFountain('İÇ. ODA - GÜN\n\nAYŞE\nGel.\n!Kapı çarpar.\n');
    expect(b.map((x) => x.text)).toContain('Kapı çarpar.');
    expect(b.map((x) => x.text)).not.toContain('!Kapı çarpar.');
  });

  it('sayfa sonu (===) blok üretmiyor', () => {
    const b = parseFountain('İÇ. ODA - GÜN\n\n===\n\nDIŞ. SOKAK - GÜN\n');
    expect(b.map((x) => x.text)).toEqual(['İÇ. ODA - GÜN', 'DIŞ. SOKAK - GÜN']);
  });
});
