import type { ScriptBlock, ScriptBlockType } from '../model/script';

/**
 * Final Draft (.fdx) dışa aktarımı.
 *
 * Yazma tarafı DOMParser İSTEMEZ (okuma tarafı ister): dizge kurmak için
 * tarayıcıya ihtiyaç yok ve bu, dışa aktarımın sunucuda ya da toplu işte de
 * koşabilmesi demek.
 */

/** `model/script.ts`'teki `FDX_TYPES`'ın TERSİ. */
/* FDX YALNIZ senaryo bloklarını tanıyor: roman ya da çizgi roman
   blokları Final Draft'ta karşılığı olmayan tiplerdir. Kısmi kayıt bunu
   TİPTE söylüyor; karşılığı olmayan blok dışa aktarımda `action`'a
   düşürülüyor ve düşürüldüğü RAPOR EDİLİYOR. */
const FDX_ADI: Partial<Record<ScriptBlockType, string>> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
};

/**
 * XML metin kaçışı.
 *
 * `&` İLK sırada olmak zorunda: sonraya bırakılsaydı kendi ürettiğimiz
 * `&lt;` dizileri yeniden kaçırılıp `&amp;lt;` olurdu ve kullanıcının metni
 * bozulurdu.
 *
 * `<` ve `>` kaçırılmazsa metindeki bir `<` etiketi erken kapatır ve dosya
 * AÇILAMAZ hâle gelir — teslim edilen dosyanın sessizce ölmesi budur.
 */
export function xmlKacir(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** XML 1.0'ın kabul ettiği tek denetim karakterleri. */
const IZINLI_DENETIM = new Set([0x09, 0x0a, 0x0d]);

/**
 * XML'in kabul etmediği denetim karakterlerini ayıklar.
 *
 * Kaçırılmış olsalar bile XML 1.0 onları kabul etmez ve dosya geçersiz olur.
 * Yapıştırma yoluyla metne karışabilirler (kimi PDF çıkarımları `\f` ve `\v`
 * bırakır), o yüzden burası bir güven sınırıdır.
 *
 * REGEX KULLANILMIYOR, kod noktası süzülüyor: denetim karakterlerini regex
 * içinde yazmak kaçış hatasına açık ve bu dosyada bir kaçış hatası doğrudan
 * "kullanıcının teslim ettiği dosya açılmıyor" demek.
 */
function denetimTemizle(s: string): string {
  let cikti = '';
  for (const ch of s) {
    const kod = ch.codePointAt(0) ?? 0;
    if (kod < 0x20 && !IZINLI_DENETIM.has(kod)) continue;
    cikti += ch;
  }
  return cikti;
}

export function fdxYaz(bloklar: readonly ScriptBlock[]): string {
  const satirlar: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>',
  ];

  for (const b of bloklar) {
    const metin = xmlKacir(denetimTemizle(b.text.normalize('NFC')));
    /* Sahne numarası da gövde metniyle AYNI sınırdan geçer: STARC içe
       aktarımı bu alanı doğrudan XML'den taşıyor, yani içinde XML 1.0'ın
       yasakladığı bir denetim karakteri olabilir. Temizlenmezse öznitelik
       geçersiz olur ve Final Draft dosyayı hiç açamaz — teslim edilen
       dosyanın sessizce ölmesi budur. */
    const sahneNo =
      b.type === 'scene' && b.scene
        ? ` Number="${xmlKacir(denetimTemizle(b.scene.normalize('NFC')))}"`
        : '';
    satirlar.push(`    <Paragraph Type="${FDX_ADI[b.type]}"${sahneNo}>`);
    satirlar.push(`      <Text>${metin}</Text>`);
    satirlar.push('    </Paragraph>');
  }

  satirlar.push('  </Content>', '</FinalDraft>');
  return satirlar.join('\n') + '\n';
}
