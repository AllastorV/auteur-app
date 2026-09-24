import { Plugin } from 'prosemirror-state';

/**
 * AKILLI YAZIM DÜZELTMELERİ — STARC'ın altı ayrı ayarı, TEK pakette.
 *
 * Kullanıcı kararı (2026-08-27): "birleştirilebilen varsa tek ayar olarak
 * ekle." STARC'ta bunlar altı ayrı onay kutusu (`Correct DOuble CApitals`,
 * `Capitalize single "i"`, üç nokta, kıvırcık tırnak, uzun tire, çoklu
 * boşluk); hepsi AYNI sınıftan — yazarken metni sessizce düzelten kurallar.
 * Altı kutu altı karar demek; kullanıcı hepsini birlikte açar ya da
 * kapatır. Tek anahtar.
 *
 * ## `Capitalize single "i"` UYGULANMIYOR — bilerek
 *
 * STARC bunu yapıyor ama Türkçede YANLIŞ: `i`nin büyüğü `İ`, `I` değil.
 * Türkçe bir metinde tek başına "i" yazan biri zamir değil harf yazıyordur.
 * Dile göre değişen bir kural "tek anahtar" sözünü kırardı; pakete hiç
 * alınmadı.
 *
 * ## Neden yeni bağımlılık YOK
 *
 * `prosemirror-inputrules` bu işin hazır paketi ama kurulu değil ve
 * gereken şey ProseMirror'ın kendi `handleTextInput` kancasıyla otuz
 * satırda yazılıyor. Kancanın ek faydası: kural listesi SABİT kalırken
 * ayar okunabiliyor (aşağıya bak).
 *
 * ## Ayar değişimi görünümü YENİDEN KURMUYOR
 *
 * Eklenti her zaman kurulu; açık/kapalı bilgisini `acikMi()` ile HER
 * çağrıda okuyor. Eklenti listesini ayara göre yeniden yapılandırmak
 * görünümü yeniden kurar, bu da imleci ve kaydırma konumunu düşürür
 * (aynı gerekçe `odak.ts`te de yazılı) — bir ayarı açmanın bedeli
 * yazının yerini kaybetmek olamaz.
 *
 * ## Geri alınabilir
 *
 * Her düzeltme normal bir işlem: Ctrl+Z ile geri alınır. Program
 * kullanıcının yazdığını kendi bildiğiyle değiştiriyorsa bunu geri
 * alınabilir yapmak zorunda (§15.4'ün ruhu).
 */

/* Türkçe harfler AÇIKÇA sayılıyor: `\p{Lu}` Node'un ICU derlemesine göre
   değişebiliyor ve bir platformda sessizce farklı davranan kural, ekipteki
   iki kişiye farklı metin yazdırırdı. */
const BUYUK = 'A-ZÇĞİÖŞÜ';
const KUCUK = 'a-zçğıöşü';

export interface Duzeltme {
  /** Eşleşen desen — imlecin SOLUNDAKİ metne (yeni karakter dahil) uygulanır. */
  desen: RegExp;
  /** Eşleşmeyi neyle değiştireceği. */
  degistir: (eslesme: RegExpMatchArray) => string;
}

/**
 * Kural tablosu — TEK EV. Sıra önemli: özel durum (açılış tırnağı) genel
 * durumdan (kapanış tırnağı) ÖNCE gelmeli, yoksa hepsi kapanış olurdu.
 */
export const DUZELTMELER: readonly Duzeltme[] = [
  /* İKİ BÜYÜK HARF: `MErhaba` → `Merhaba`. Yalnız sözcük BAŞINDA ve
     ardından küçük harf gelirse — `TSK`, `İÇ.` gibi kısaltmalar ve tamamı
     büyük sahne başlıkları elenir. */
  {
    desen: new RegExp(`([${BUYUK}])([${BUYUK}])([${KUCUK}])$`, 'u'),
    degistir: (m) => m[1] + m[2].toLocaleLowerCase('tr') + m[3],
  },
  /* Üç nokta → tek karakter: sektörde replik kesintisi bu karakterle ve
     üç ayrı nokta satır sonunda bölünebiliyor. */
  { desen: /\.\.\.$/, degistir: () => '…' },
  /* İki tire → uzun tire (ara söz, kesinti). */
  { desen: /--$/, degistir: () => '—' },
  /* Kıvırcık tırnaklar — yön ÖNCEKİ karakterden. */
  { desen: /(^|[\s([{«—–-])"$/u, degistir: (m) => m[1] + '“' },
  { desen: /"$/, degistir: () => '”' },
  { desen: /(^|[\s([{«—–-])'$/u, degistir: (m) => m[1] + '‘' },
  { desen: /'$/, degistir: () => '’' },
  /* ÇOKLU BOŞLUK: ikinci boşluk yutuluyor. Senaryo ızgarasında iki boşluk
     bir karakter kaydırır ve sayfa sonunu değiştirebilir — daktilo
     alışkanlığıyla cümle sonuna iki boşluk koyan yazar sayfa sayısını
     farkında olmadan bozar. */
  { desen: /(\S) {2}$/, degistir: (m) => m[1] + ' ' },
];

/**
 * İmlecin solundaki metne kuralları uygular. Eşleşme yoksa `null`.
 *
 * SAF: ProseMirror bilmiyor, yalnız dizge alıyor — kuralların tamamı
 * burada tek tek sınanabiliyor.
 */
export function duzeltmeUygula(solMetin: string): { yeni: string; kesilen: number } | null {
  for (const { desen, degistir } of DUZELTMELER) {
    const m = solMetin.match(desen);
    if (!m) continue;
    const yeni = degistir(m);
    if (yeni === m[0]) continue;
    return { yeni, kesilen: m[0].length };
  }
  return null;
}

/** Kurala bakılacak en uzun sol bağlam — en uzun desen 3 karakter + 1 sınır. */
const BAGLAM = 8;

export function akilliDuzeltmeEklentisi(acikMi: () => boolean): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, bas, son, metin) {
        if (!acikMi()) return false;
        /* Yalnız TEK karakterlik girişte: yapıştırma ve IME bileşimi
           dokunulmadan geçiyor — yapıştırılan bir metni yeniden yazmak
           kullanıcının getirdiği içeriği değiştirmek olurdu. */
        if (metin.length !== 1) return false;
        /* SEÇİM VARKEN atlanıyor: seçili metin silinip yerine yazılıyor ve
           sol bağlam hesabı o silmeyi görmüyor — yanlış aralığı keserdi. */
        if (bas !== son) return false;

        const blokBasi = view.state.selection.$head.start();
        const sol = view.state.doc.textBetween(Math.max(blokBasi, bas - BAGLAM), bas) + metin;
        const sonuc = duzeltmeUygula(sol);
        if (!sonuc) return false;

        const kesBas = bas + metin.length - sonuc.kesilen;
        view.dispatch(
          view.state.tr.insertText(sonuc.yeni, Math.max(blokBasi, kesBas), son),
        );
        return true;
      },
    },
  });
}
