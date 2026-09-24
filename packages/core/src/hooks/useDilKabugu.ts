import { useEffect } from 'react';
import { usePlatform } from '../platform/context';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';

/**
 * Proje sözlüğünü ve denetim dilini KABUĞA taşır — §16.4.
 *
 * Sözlük belgede yaşıyor ama denetleyici kabukta: ikisi bağlanmazsa kullanıcı
 * kelimeyi ekler, listede görür ve kırmızı altçizginin sürmesine şaşırır.
 * Bağ TEK yönlü: belge kaynak, kabuk ayna. Ters yön (kabuğun sözlüğünü
 * belgeye çekmek) kullanıcının başka projelerde eklediği kelimeleri bu
 * projeye sızdırırdı.
 *
 * Yükleme her değişimde YENİDEN yapılıyor. Chromium'un özel sözlüğü kalıcı
 * ve uygulama geneli olduğu için "sil ve yeniden yaz" mümkün değil; en
 * kötüsü eski projelerin adları da kabul edilmiş kalır. Bu, kırmızı
 * altçizginin YANLIŞ yerde çıkmamasına yeğlendi: kullanıcı yanlış kabul
 * edilen bir kelimeyi fark etmez, yanlış işaretlenen bir kelime ise her
 * seferinde dikkatini böler.
 */
export function useDilKabugu(): void {
  const platform = usePlatform();
  const sozluk = useProjectStore((s) => s.sozluk);
  const dil = useUiStore((s) => s.scriptLang);

  useEffect(() => {
    const kabuk = platform.dil;
    if (!kabuk) return;
    const kelimeler = Object.values(sozluk);
    if (!kelimeler.length) return;
    /* Hata YUTULMUYOR ama arayüzü de kilitlemiyor: denetim bir kolaylık,
       veri yolu değil. Kullanıcı yazmaya devam edebilmeli. */
    void kabuk.sozlugüYükle(kelimeler).catch((hata: unknown) =>
      useUiStore.getState().showToast(
        `Sözlük denetleyiciye yüklenemedi: ${hata instanceof Error ? hata.message : String(hata)}`,
        'error',
      ),
    );
  }, [platform, sozluk]);

  useEffect(() => {
    const kabuk = platform.dil;
    if (!kabuk) return;
    let iptal = false;
    void (async () => {
      /* Desteklenen diller KABUKTAN soruluyor: sabit bir liste,
         `setSpellCheckerLanguages`'in fırlatacağı bir dili kullanıcıya
         seçtirmek olurdu (bkz. `dil/denetim.ts`). */
      const mevcut = await kabuk.denetimDilleri();
      if (iptal) return;
      const secilen = mevcut.filter((d) => d === dil || d.startsWith(`${dil}-`));
      if (secilen.length) await kabuk.denetimDilleriniAyarla(secilen);
    })().catch(() => {
      /* Dil ayarlanamadıysa denetim varsayılan dilde sürer; kullanıcıyı
         uyarmak burada gürültü olurdu — yazdığı hiçbir şey kaybolmuyor. */
    });
    return () => { iptal = true; };
  }, [platform, dil]);
}
