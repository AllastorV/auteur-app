import React from 'react';
import { t } from '../../dil/arayuz';
import { useUiStore } from '../../store/ui';
import { SozlukBolumu } from './SozlukBolumu';
import { useProjectStore } from '../../store/project';
import * as M from '../../doc/mutations';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import { AMERIKAN_BLOKLAR, profilOlustur } from '../../format/profil';
import type { DilAdi } from '../../format/profil';
import type { KagitAdi } from '../../format/izgara';
import { presetUygula, type BlokPreseti } from '../../format/preset';
import { girintiSutun } from '../../format/ekran';
import { BLOK_ETIKETLERI, type ScriptBlockType } from '../../model/script';
import { Ikon } from '../Ikon';
import { SAYFA_RENKLERI, SAYFA_RENGI_ADLARI, type SayfaRengi } from '../../format/sayfa-rengi';
import type { NumaraKenari, SureYontemi } from '../../format/senaryo-ayarlari';

/**
 * Yazım sekmesi — §16.3.
 *
 * Ezilemez alanlar (yazı tipi, punto, satır aralığı) BURADA GÖSTERİLİR ama
 * kapalıdır ve yanında nedeni yazar. Spec'in sözü: "Ezilmeye çalışılırsa
 * arayüz **nedenini söyleyerek** reddeder." Denetimi hiç göstermemek daha
 * kolay olurdu ama kullanıcı "neden Courier'den çıkamıyorum?" sorusunun
 * cevabını hiçbir yerde bulamazdı.
 */

/* Etiketler `BLOK_ETIKETLERI`'nden TÜRETİLİYOR, elle yazılmıyor: bu tablo
   sağ tık menüsündekiyle ayrışmıştı ("Parantezik" ↔ "Parantez") ve kullanıcı
   aynı blok tipini iki ayrı adla görüyordu. Sıra `BLOK_TIPLERI`'nin sırası. */
/* YALNIZ profilde tanımlı bloklar listeleniyor: senaryo yazan birine roman
   bloğunun girintisini ayarlatmak, ayarın hiçbir yere yazılmadığı bir
   kutu göstermek olurdu. */
const TIPLER: { tip: ScriptBlockType; etiket: string }[] = (
  Object.keys(AMERIKAN_BLOKLAR) as ScriptBlockType[]
).map((tip) => ({ tip, etiket: BLOK_ETIKETLERI[tip] }));

/** Ezilemez alanların kullanıcıya gösterilen gerekçeleri — tek kaynaktan. */
const EZILEMEZ_ALANLAR = ['yaziTipi', 'punto', 'satirAraligi'] as const;
/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye; gerekçenin
   tamamı `i18n-kapsam.test.ts`teki `donmusCeviriler` başlığında. */
const EZILEMEZ_ETIKET = (): Record<(typeof EZILEMEZ_ALANLAR)[number], string> => ({
  yaziTipi: t('Yazı tipi'),
  punto: t('Punto'),
  satirAraligi: t('Satır aralığı'),
});

export function YazimSekmesi() {
  const presetler = useUiStore((s) => s.scriptPresetler);
  const kagit = useUiStore((s) => s.scriptPaper);
  const sayfaRengi = useUiStore((s) => s.scriptSayfaRengi);
  const numara = useUiStore((s) => s.numaraAyari);
  const sureklilik = useUiStore((s) => s.sayfaSonuSurekliligi);
  const sure = useUiStore((s) => s.sureAyari);
  const aktifTip = (dokumanTipi(useProjectStore((s) => s.project.meta.dokumanTipi))
    ?? DOKUMAN_TIPLERI.senaryo).id;
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const dil = useUiStore((s) => s.scriptLang);
  const taban = profilOlustur('amerikan', kagit, dil).bloklar;

  const degistir = (tip: ScriptBlockType, yama: BlokPreseti) => {
    useUiStore.setState((s) => ({
      scriptPresetler: { ...s.scriptPresetler, [tip]: { ...s.scriptPresetler[tip], ...yama } },
    }));
  };

  /* Ezilemez alanların gerekçeleri motordan OKUNUR, burada yeniden
     yazılmaz: iki yerde durursa biri değişince diğeri sessizce eskir. */
  const redSebepleri = presetUygula(AMERIKAN_BLOKLAR.action!, {
    yaziTipi: 'x', punto: 1, satirAraligi: 1,
  }).redler;

  return (
    <div data-testid="yazim-sekmesi" className="flex flex-col gap-3 text-xs">
      {/* Sabit ölçüler, kağıt boyutu ve dil AYARLAR
          penceresine taşındı (kullanıcı kararı 2026-08-27): "anlık ulaşmak
          gerekmeyen ayarları genel ayarlara taşı". Burada yalnız YAZARKEN
          gereken iki şey kaldı — hangi biçimde yazdığın ve proje sözlüğü. */}

      {/* Doküman tipi ve sayfa düzeni — SEÇİLEMEZ, yalnız GÖSTERİLİR.
          Kullanıcı kararı: biçim projeyi yaratırken seçilir, yazarken değil.
          Buradan da değiştirilebilseydi ikinci bir ev olurdu (Karar 2) ve
          asıl kötüsü: yazılmış yüz sayfa bir tık sonra başka bir uzunluğa
          dönerdi. Yine de GÖRÜNÜYOR — hangi biçimde yazdığını bilmeden
          yazmak, sayfa sayısının ne anlama geldiğini bilmemektir. */}
      <section data-testid="dokuman-tipi-bolumu" className="border border-kenar-ic p-2">
        <h3 className="mb-1.5 text-[11px] font-semibold text-metin-govde">{t('Belgenin biçimi')}</h3>
        <p data-testid="dokuman-tipi-degeri" className="text-[12px] text-metin">
          {t(DOKUMAN_TIPLERI[aktifTip].ad)}
        </p>
        <p className="mt-1 text-[10px] leading-snug text-metin-etiket">
          {t('Yapı birimi')}: {t(DOKUMAN_TIPLERI[aktifTip].yapiAdi)}
          {!DOKUMAN_TIPLERI[aktifTip].sayfaDakika && t(' · sayfa süreyi ölçmez')}
          {' · '}{t('proje yaratılırken seçildi')}
        </p>
      </section>

      {/* SAYFA RENGİ — dört sabit seçenek, serbest renk yok.
          Kullanıcı düzeltmesi (2026-08-28): bu ayar genel Ayarlar'a
          taşınmıştı, YANLIŞTI. Sayfa rengi YAZARKEN değiştirilen bir
          şeydir — göz yorulunca sepyaya, gece siyaha geçilir. "Anlık
          ulaşmak gerekmeyen ayarlar" kuralı buna uymuyor; burası evi. */}
      <section data-testid="sayfa-rengi-bolumu" className="border border-kenar-ic p-2">
        <h3 className="mb-1.5 text-[11px] font-semibold text-metin-govde">{t('Sayfa rengi')}</h3>
        <div className="flex items-center gap-1.5" role="group" aria-label={t('Sayfa rengi')}>
          {(Object.keys(SAYFA_RENKLERI) as SayfaRengi[]).map((ad) => {
            const p = SAYFA_RENKLERI[ad];
            const secili = sayfaRengi === ad;
            return (
              <button
                key={ad}
                type="button"
                data-testid={`sayfa-rengi-${ad}`}
                title={SAYFA_RENGI_ADLARI[ad]}
                aria-label={`${t('Sayfa rengi')}: ${SAYFA_RENGI_ADLARI[ad]}`}
                aria-pressed={secili}
                onClick={() => useUiStore.setState({ scriptSayfaRengi: ad })}
                className={
                  'flex h-7 w-9 items-center justify-center border text-[11px] transition-colors '
                  + (secili ? 'border-amber ring-1 ring-amber' : 'border-kenar-ic hover:border-metin-zayif')
                }
                style={{ backgroundColor: p.kagit, color: p.metin }}
              >
                A
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-metin-etiket">
          {t('Yalnız ekranda — dışa aktarım her zaman beyaz sayfaya siyah yazıdır.')}
        </p>
      </section>

      <SozlukBolumu />





      {/* Preset bolumleri KALDIRILDI (kullanici karari 2026-08-27):
          presetler sabittir, kullanici dokunmaz. Sabit olculer bolumu
          zaten kilitli alanlarin GEREKCESINI gosteriyor; blok bazli
          kalin/italik/buyuk ve bosluk ayarlari artik yok. */}

      <button
        type="button"
        data-testid="presetleri-sifirla"
        onClick={() => useUiStore.setState({ scriptPresetler: {} })}
        className="self-start bg-denetim px-2 py-1 text-[11px] text-metin-govde hover:bg-denetim"
      >
        {t('Varsayılana dön')}
      </button>
    </div>
  );
}
