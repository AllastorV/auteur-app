import { useEffect, useState } from 'react';
import { usePlatform } from '../platform/context';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';
import { birlestir, kimYazdi, type YazarlikKaydi } from '../veri/yazarlik';

/**
 * "Kim ne yazdı" penceresinin arayüz mantığı — GÖRSELDEN AYRI, aynı desen
 * `useGeriDonusNoktalari` ile: bileşen yalnız ÇİZER, sıralama/birleştirme/
 * sorgu burada yaşıyor.
 *
 * Web kabuğunda (`platform.yazarlik === null`) `destekleniyor: false` —
 * arayüz "yalnızca masaüstü" demeli, `window`'a bakmadan.
 */
export interface YazarlikGunluguDurumu {
  destekleniyor: boolean;
  yukleniyor: boolean;
  /** Birleştirilmiş, EN YENİDEN ESKİYE sıralı kayıtlar — "geçen hafta kim ne yaptı". */
  kayitlar: readonly YazarlikKaydi[];
  /** İmleç şu an bir satırda mı — değilse sorunun cevabı yok, "bilinmiyor" değil. */
  imlecVar: boolean;
  /** İmleçteki satırı yazan — bulunamazsa `null` (uydurma isim YOK, çağıran "bilinmiyor" gösterir). */
  imlecYazari: { yazar: string; zaman: number } | null;
}

export function useYazarlikGunlugu(): YazarlikGunluguDurumu {
  const platform = usePlatform();
  const yazarlikYuzeyi = platform.yazarlik;
  const projeId = useProjectStore((s) => s.project.meta.id);
  const scriptCursor = useUiStore((s) => s.scriptCursor);

  const [ham, setHam] = useState<YazarlikKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    if (!yazarlikYuzeyi || !projeId) {
      setHam([]);
      return;
    }
    setYukleniyor(true);
    yazarlikYuzeyi
      .oku(projeId)
      .then(setHam)
      .catch(() => setHam([]))
      .finally(() => setYukleniyor(false));
  }, [yazarlikYuzeyi, projeId]);

  /* `kimYazdi` KRONOLOJİK sıralı bekliyor — `ham` tam da bu sırada
     (`oku()` dosya sırasını, yani yazılış sırasını verir). Görüntülenecek
     liste ise birleştirilip TERSİNE çevriliyor; ikisi için ayrı türetme. */
  const kayitlar = [...birlestir(ham)].sort((a, b) => b.zaman - a.zaman);
  const imlecYazari = scriptCursor ? kimYazdi(ham, scriptCursor) : null;

  return {
    destekleniyor: yazarlikYuzeyi !== null,
    yukleniyor,
    kayitlar,
    imlecVar: Boolean(scriptCursor),
    imlecYazari,
  };
}
