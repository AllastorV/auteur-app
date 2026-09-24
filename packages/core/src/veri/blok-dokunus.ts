/**
 * "Bu yazımda hangi bloklara dokunuldu" — editörden yazıcıya giden ince kanal.
 *
 * Neden ayrı bir modül: bilgiyi üreten yer ProseMirror eklentisi
 * (`editor/imlec.ts`), tüketen yer §15 yazıcısı (`veri/yazici.ts`) ve ikisi
 * arasında React ağacı var. Geri çağrıyı bileşenden bileşene taşımak, yazarlık
 * kaydını yaşayan editörün prop zincirine bağlamak olurdu; o zincirin bir
 * halkası değişince kayıt SESSİZCE durur ve kimse fark etmez.
 *
 * Kanal KASITEN aptal: sıraya almıyor, tamponlamıyor, birleştirmiyor.
 * Birleştirme yazıcının işi (`birlestir`, 30 sn penceresi) ve orada
 * ölçülüyor; burada da yapılsaydı aynı kural iki yerde yaşardı.
 *
 * Dinleyicisi yoksa yayın sessizce düşer — masaüstü kabuğu olmayan tarayıcıda
 * yazarlık günlüğü zaten yok ve editörün bunu bilmesi gerekmiyor.
 */

export type BlokDokunusDinleyici = (blokIdler: readonly string[]) => void;

let dinleyiciler: BlokDokunusDinleyici[] = [];

export function blokDokunusuDinle(dinleyici: BlokDokunusDinleyici): () => void {
  dinleyiciler = [...dinleyiciler, dinleyici];
  return () => {
    dinleyiciler = dinleyiciler.filter((d) => d !== dinleyici);
  };
}

export function blokDokunusuYayinla(blokIdler: readonly string[]): void {
  if (!blokIdler.length) return;
  /* Kopya üzerinden geziliyor: bir dinleyici yayın sırasında aboneliğini
     bırakırsa dizinin altı oyulur ve sonraki dinleyici atlanırdı. */
  for (const d of [...dinleyiciler]) {
    try {
      d(blokIdler);
    } catch {
      /* Yazarlık kaydı EN İYİ ÇABA: bir dinleyicinin hatası yazma yolunu
         durduramaz. §15'in koruduğu şey metin, bu kanal değil. */
    }
  }
}

/** Yalnız test içindir — dinleyici sızıntısı testler arasında taşınmasın. */
export function blokDokunusuSifirla(): void {
  dinleyiciler = [];
}
