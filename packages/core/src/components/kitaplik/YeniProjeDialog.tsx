import React, { useState } from 'react';
import { t } from '../../dil/arayuz';
import { Modal, Button } from '../dialogs/Modal';
import { DOKUMAN_TIPLERI, type DokumanTipi, type DokumanTipiAdi } from '../../model/dokuman-tipi';
import { SayfaOnizleme } from './sayfa-onizleme';

/**
 * YENİ PROJE — biçim BURADA seçiliyor.
 *
 * ## Neden yazım panelinde değil
 *
 * Kullanıcı kararı: "presetler yazımdan değil, yeni hikaye oluştururken
 * hikayenin türü kısmından seçilsin." Doğru yer de burası — §16.3 yazı
 * tipini, puntoyu ve satır aralığını EZİLEMEZ kılıyor çünkü sayfa≈dakika
 * sözleşmesi onlara dayanıyor. Belgenin türü ve sayfa düzeni de aynı
 * sözleşmenin parçası: yazarken değiştirilebilen bir ayar olsalardı, yazılmış
 * yüz sayfa bir tık sonra başka bir uzunluğa dönüşürdü.
 *
 * Seçim projeye YAZILIYOR, oturuma değil: ortak çalışan da aynı biçimi görmeli.
 *
 * ## Neden açılır liste değil kart
 *
 * Kullanıcı tespiti (2026-09-01): *"dropdown menüler ve arayüzü çok basit ve
 * özensiz duruyor."* Haklıydı ve sebebi ölçüldü: `ExportDialog` ve
 * `AyarlarDialog` 2026-08-27 turunda büyütülüp yeniden yazılırken bu pencere
 * eski dilde kalmıştı (`mzn-denetim px-2 py-1.5` — o turda tam olarak
 * "yazı ve tuşlar çok küçük" diye şikâyet edilen ölçü).
 *
 * Ama asıl kusur ölçü değildi: sekiz satırlık bir `<select>` türü ADIYLA
 * sorar, oysa seçen kişinin bilmek istediği YERLEŞİMDİR. Kartlar sayfanın
 * minyatürünü gösteriyor (`sayfa-onizleme.tsx`); iki sütunlu belge ile tek
 * sütunlu belge arasındaki fark okunmadan görülüyor.
 *
 * ## Neden iki grup — ve neden BU iki grup
 *
 * Ayrım `sayfaDakika`dan TÜRETİLİYOR, elle yazılmış bir taksonomi değil.
 * Sebebi PRODUCT.md'nin birinci taşıyıcı sözleşmesi: "1 sayfa ≈ 1 dakika".
 * Bir belgede bu sözleşmenin geçerli olup olmaması, tür seçiminin en ağır
 * sonucudur — romanda sayfa sayısı bir uzunluktur, senaryoda bir süredir.
 * Kullanıcı türü seçerken bunu da öğreniyor.
 *
 * ## Boş ad neden hâlâ reddedilmiyor
 *
 * `Oluştur`u pasifleştirmek düşünüldü ve bırakıldı: `İsimsiz` yer tutucusu
 * zaten ne olacağını söylüyor ve boş adla proje açmak bir hata değil, hızlı
 * başlangıç. (Ayrıca `tests/e2e/kesif-animatik.spec.ts` ad yazmadan
 * oluşturuyor — kuralı sırf katılık olsun diye eklemek turu kırardı.)
 */
export interface YeniProjeSecimi {
  ad: string;
  tip: string;
}

/**
 * FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın.
 *
 * Modül kapsamında `const X = [{ etiket: t(...) }]` yazılırsa `t()` yalnız
 * içe aktarımda bir kez çağrılır ve kabuk dili değişince etiket ilk dilde
 * çakılı kalır. `i18n-kapsam.test.ts`'teki `donmusCeviriler` bunu zorluyor.
 */
const GRUPLAR = (): { etiket: string; tipler: DokumanTipi[] }[] => {
  /* TÜRETİLEN tipler burada YOK: fon başvuru dosyası boş bir kabuk olarak
     seçilse kullanıcı bomboş bir belge alır. Kurulum yolu tek — açık
     senaryodan "Bu senaryodan fon dosyası oluştur". */
  const hepsi = Object.values(DOKUMAN_TIPLERI).filter((d) => !d.turetilen);
  return [
    { etiket: t('bir sayfa ≈ bir dakika'), tipler: hepsi.filter((d) => d.sayfaDakika) },
    { etiket: t('sayfa süreyi ölçmez'), tipler: hepsi.filter((d) => !d.sayfaDakika) },
  ];
};

export function YeniProjeDialog({
  onKapat,
  onOlustur,
}: {
  onKapat: () => void;
  onOlustur: (secim: YeniProjeSecimi) => void;
}) {
  const [ad, setAd] = useState('');
  const [tip, setTip] = useState<DokumanTipiAdi>('senaryo');

  const secilenTip = DOKUMAN_TIPLERI[tip];

  function olustur() {
    onOlustur({ ad: ad.trim() || t('İsimsiz'), tip });
  }

  return (
    <Modal
      title={t('Yeni proje')}
      onClose={onKapat}
      width={640}
      footer={
        <>
          <Button onClick={onKapat}>{t('İptal')}</Button>
          <Button variant="primary" data-testid="yeni-proje-olustur" onClick={olustur}>
            {t('Oluştur')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          olustur();
        }}
      >
        <div className="flex flex-col gap-3">
          <span className="mzn-etiket">{t('Belgenin türü')}</span>

          {/* Kap testid'i KORUNUYOR: `kitaplik.test.tsx` diyaloğun açıldığını
              bununla ölçüyor ve o iddia türün nasıl seçildiğinden bağımsız. */}
          <div data-testid="yeni-proje-tip" className="flex flex-col gap-3">
            {GRUPLAR().map((grup) => (
              <div key={grup.etiket} className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-metin-cok-zayif">
                  {grup.etiket}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {grup.tipler.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      data-testid={`yeni-proje-tip-${d.id}`}
                      aria-pressed={tip === d.id}
                      onClick={() => setTip(d.id)}
                      className={
                        'flex flex-col items-center gap-2 border px-2 pb-2 pt-2.5 text-[12px] leading-tight transition-colors ' +
                        (tip === d.id
                          ? 'border-amber bg-amber-zemin text-amber'
                          : 'border-kenar-denetim bg-denetim text-metin-govde hover:border-[#3a4250]')
                      }
                    >
                      <SayfaOnizleme tip={d.id} />
                      <span className="text-center">{t(d.ad)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Seçimin NE DEĞİŞTİRDİĞİ tek satırda: sekiz kartın her birine
              açıklama koymak ızgarayı okunmaz yapardı, açıklamayı hiç
              koymamak da "roman seçersem ne olur" sorusunu cevapsız
              bırakırdı. Yer seçilenin altı — soru orada soruluyor. */}
          <p
            data-testid="yeni-proje-aciklama"
            className="min-h-[30px] border-l border-amber-kenar pl-2.5 text-[11px] leading-snug text-metin-ikincil"
          >
            {t(secilenTip.aciklama)}
            <span className="text-metin-etiket">
              {' · '}
              {t('Yapı birimi')}: {t(secilenTip.yapiAdi)}
            </span>
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="mzn-etiket">{t('Proje adı')}</span>
          <input
            data-testid="yeni-proje-ad"
            value={ad}
            autoFocus
            onChange={(e) => setAd(e.target.value)}
            placeholder={t('İsimsiz')}
            className="border border-kenar-denetim bg-denetim px-2.5 py-2 text-[13px] text-metin-guclu outline-none placeholder:text-metin-cok-zayif focus:border-amber"
          />
        </label>

        {/* Biçimin BİR KEZ seçildiği burada söyleniyor; kullanıcı sonradan
            arayışa çıkıp bulamadığında bunu bir eksiklik sanmasın. */}
        <p className="border-t border-kenar-ic pt-3 text-[11px] leading-snug text-metin-etiket">
          {t('Tür ve sayfa düzeni projenin kimliğidir; yazarken değişmez. Sayfa sayısı — ve senaryoda süre — bu seçime dayanıyor.')}
        </p>
      </form>
    </Modal>
  );
}
