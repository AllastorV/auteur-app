// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fdxYaz, xmlKacir } from '@storyboard/core/disa/fdx';
import { parseFdx, type ScriptBlock, type ScriptBlockType } from '@storyboard/core/model/script';

let sayac = 0;
const b = (type: ScriptBlockType, text: string, scene = ''): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene, sceneId: '',
});

const SAHNE: ScriptBlock[] = [
  b('scene', 'İÇ. ESKİ APARTMAN - KORİDOR - GECE', '1'),
  b('action', 'Ayşe kapıyı yavaşça iter.'),
  b('character', 'AYŞE'),
  b('parenthetical', '(fısıltıyla)'),
  b('dialogue', 'Kimse yok, emin misin?'),
  b('transition', 'KES'),
];

describe('FDX dışa aktarımı yuvarlanıyor', () => {
  it('tipler ve metinler birebir geri geliyor', () => {
    const okunan = parseFdx(fdxYaz(SAHNE));
    expect(okunan.map((x) => x.type)).toEqual(SAHNE.map((x) => x.type));
    expect(okunan.map((x) => x.text)).toEqual(SAHNE.map((x) => x.text));
  });

  it('sahne numarası korunuyor', () => {
    expect(parseFdx(fdxYaz(SAHNE))[0].scene).toBe('1');
  });

  it('boş senaryo geçerli ama boş bir belge verir', () => {
    expect(parseFdx(fdxYaz([]))).toEqual([]);
  });

  it('Türkçe harfler bozulmadan geçiyor', () => {
    const metin = 'Şişli’de ığdır çöreği: ĞÜŞİÖÇ ğüşiöç';
    expect(parseFdx(fdxYaz([b('action', metin)]))[0].text).toBe(metin);
  });
});

describe('XML güven sınırı', () => {
  /* `&` sonraya bırakılsaydı kendi ürettiğimiz `&lt;` dizileri yeniden
     kaçırılıp `&amp;lt;` olurdu — kullanıcının metni bozulurdu. */
  it('ampersan İLK kaçırılır, çift kaçış olmaz', () => {
    expect(xmlKacir('a & b < c')).toBe('a &amp; b &lt; c');
    expect(xmlKacir('&lt;')).toBe('&amp;lt;');
  });

  /* Kaçırılmazsa metindeki bir `<` etiketi erken kapatır ve dosya AÇILAMAZ
     hâle gelir — teslim edilen dosyanın sessizce ölmesi budur. */
  it('metindeki açılı ayraç dosyayı bozmuyor', () => {
    const metin = 'Ayşe <b>bağırır</b> & kaçar';
    const xml = fdxYaz([b('action', metin)]);
    expect(parseFdx(xml)[0].text).toBe(metin);
  });

  it('tırnak içeren metin de yuvarlanıyor', () => {
    const metin = 'Kapıda "YASAK" yazıyor';
    expect(parseFdx(fdxYaz([b('action', metin)]))[0].text).toBe(metin);
  });

  it('sahne numarasındaki özel karakter kaçırılıyor', () => {
    const xml = fdxYaz([b('scene', 'İÇ. ODA', '1<a"')]);
    expect(xml).toContain('Number="1&lt;a&quot;"');
    expect(parseFdx(xml)[0].scene).toBe('1<a"');
  });

  /* XML 1.0 bu karakterleri KAÇIRILMIŞ olsalar bile kabul etmez; dosya
     geçersiz olurdu. Yapıştırma yoluyla metne karışabiliyorlar. */
  it('XML dışı denetim karakterleri ayıklanıyor', () => {
    const kirli = 'Ayşe' + String.fromCharCode(0x0c) + 'girer' + String.fromCharCode(0x00);
    const xml = fdxYaz([b('action', kirli)]);
    expect(xml).not.toContain(String.fromCharCode(0x0c));
    expect(parseFdx(xml)[0].text).toBe('Ayşegirer');
  });

  /* Gövde metni ile sahne numarası AYNI sınırda: numara STARC içe
     aktarımında doğrudan XML'den taşınıyor (`ice/starc.ts`). Kaçış tek
     başına yetmez — XML 1.0 bu karakterleri kaçırılmış hâlde de kabul
     etmez ve Final Draft dosyayı hiç açamaz. */
  it('sahne NUMARASINDAKİ denetim karakteri de ayıklanıyor', () => {
    const xml = fdxYaz([b('scene', 'İÇ. ODA', '1' + String.fromCharCode(0x0c))]);
    expect(xml).not.toContain(String.fromCharCode(0x0c));
    expect(parseFdx(xml)[0].scene).toBe('1');
  });

  it('sahne numarası NFC normalize ediliyor — gövdeyle aynı kural', () => {
    // 'İ' ayrık biçimde: I + birleştirici nokta.
    const ayrik = 'I' + String.fromCharCode(0x0307) + '1';
    const xml = fdxYaz([b('scene', 'İÇ. ODA', ayrik)]);
    expect(parseFdx(xml)[0].scene).toBe(ayrik.normalize('NFC'));
  });

  it('sekme ve satır sonu KORUNUYOR', () => {
    const metin = 'bir\tiki';
    expect(parseFdx(fdxYaz([b('action', metin)]))[0].text).toBe(metin);
  });
});
