import { Plugin } from 'prosemirror-state';

/**
 * DAKTİLO KAYDIRMASI — imleç ekranın ortasında kalır.
 *
 * Kağıt aşağı kayar, göz sabit bir yükseklikte kalır. Uzun bir sahnede
 * satırlar ekranın altına doğru sürüklenmez; yazarın bakışı hep aynı
 * noktada durur. STARC'ta `application/use-typewriter-scrolling`.
 *
 * ## Neden `scrollIntoView` değil
 *
 * Tarayıcının `scrollIntoView({block:'center'})` çağrısı ANİMASYONLU
 * olabiliyor ve her tuş vuruşunda tetiklendiğinde kaydırma sürekli
 * "yakalamaya çalışan" bir gecikme üretiyor. Hedef konum doğrudan
 * `scrollTop`a yazılıyor: tek kare, gecikme yok.
 *
 * ## Sapma eşiği
 *
 * İmleç zaten ortaya yakınsa hiç kaydırılmıyor. Eşiksiz sürüm her tuşta
 * bir piksel oynatır ve metin titrer; göz bunu okuma sırasında fark eder.
 *
 * ## Kapalıyken hiçbir şey yapmıyor
 *
 * Ayar `acikMi()` ile HER çağrıda okunuyor; eklenti listesi yeniden
 * kurulmuyor — kurulsaydı imleç ve kaydırma konumu düşerdi (aynı gerekçe
 * `odak.ts` ve `akilli-duzeltme.ts`te de yazılı).
 */

/** İmleç bu kadar pikselden az saparsa kaydırma yapılmaz — titreme önlemi. */
const ESIK_PX = 24;

/** Ekranın hangi yüksekliğinde tutulacağı (0 = üst, 1 = alt). */
const HEDEF_ORAN = 0.42;

/** Kaydırılabilir ata öğe — senaryo yüzeyi. */
function yuzeyBul(oge: HTMLElement | null): HTMLElement | null {
  for (let o = oge; o; o = o.parentElement) {
    if (o.classList?.contains('senaryo-yuzey')) return o;
  }
  return null;
}

export function daktiloKaydirmaEklentisi(acikMi: () => boolean): Plugin {
  return new Plugin({
    view(gorunum) {
      const uygula = () => {
        if (!acikMi()) return;
        const yuzey = yuzeyBul(gorunum.dom as HTMLElement);
        if (!yuzey) return;
        /* `coordsAtPos` görünüm alanına göre piksel veriyor; yüzeyin kendi
           kutusuna çevirmek için farkı alıyoruz. */
        let imlec;
        try {
          imlec = gorunum.coordsAtPos(gorunum.state.selection.head);
        } catch {
          /* Konum geçici olarak belge dışındaysa (işlem ortası) atla. */
          return;
        }
        const kutu = yuzey.getBoundingClientRect();
        const hedefY = kutu.top + kutu.height * HEDEF_ORAN;
        const sapma = imlec.top - hedefY;
        if (Math.abs(sapma) < ESIK_PX) return;
        yuzey.scrollTop += sapma;
      };

      return {
        update(_g, oncekiDurum) {
          /* Yalnız imleç ya da belge değiştiyse: her güncellemede kaydırmak
             (ör. dekorasyon yenilenmesi) kullanıcının elle kaydırdığı yeri
             geri alırdı. */
          const durum = gorunum.state;
          if (durum.doc === oncekiDurum.doc && durum.selection.eq(oncekiDurum.selection)) return;
          uygula();
        },
      };
    },
  });
}
