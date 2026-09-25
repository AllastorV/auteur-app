import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { usePlatform } from '../platform/context';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';
import { useSenaryoProfili } from './useSenaryoProfili';
import { readScript } from '../doc/schema';
import { kontrolNoktasinaDon, type GeriDonusKabugu } from '../veri/geri-donus';
import { noktaOzetiCikar, type NoktaOzeti } from '../veri/nokta-ozeti';
import type { CipaKaydi } from '../platform/types';
import { t, tf } from '../dil/arayuz';

/**
 * §15.2.2'nin arayüz mantığı — GÖRSELDEN AYRI.
 *
 * Ekran ("Geri dönüş noktaları" sekmesi) buradaki durumu ÇİZER; sıralama,
 * tembel çözme, özet ve dönüş akışı burada yaşıyor. Görsel tur bu dosyaya
 * dokunmadan yeniden çizilebilir.
 *
 * Web kabuğunda (`platform.veriGuvenligi === null`) `destekleniyor: false` —
 * arayüz bölümü hiç göstermemeli ya da "yalnızca masaüstü" demeli, `window`'a
 * bakmadan.
 */
export interface GeriDonusDurumu {
  destekleniyor: boolean;
  noktalar: readonly CipaKaydi[];
  yukleniyor: boolean;
  hata: string | null;

  secilenId: string | null;
  ozet: NoktaOzeti | null;
  ozetYukleniyor: boolean;
  /** Noktayı SEÇER ve özetini TEMBEL çözer — liste açılışında hiçbir şey çözülmez. */
  sec: (id: string) => void;

  donusBusy: boolean;
  /**
   * Verilen noktaya döner. Önce güvenlik noktası, sonra yükleme (§15.2.2).
   *
   * `id` PARAMETRE — `secilenId` durumuna güvenmiyor: "seç" (`sec`) yalnız
   * önizleme metnini tetikler ve React durumu bir sonraki render'a kadar
   * güncellenmez. Aynı tık işleyicisinde önce `sec(id)` sonra `donusYap()`
   * çağrılsaydı ikincisi ESKİ (henüz güncellenmemiş) seçim değerini
   * görürdü. Düğme tek başına çalışabiliyor — önce seçmek ZORUNLU değil.
   */
  donusYap: (id: string) => Promise<boolean>;
}

export function useGeriDonusNoktalari(): GeriDonusDurumu {
  const platform = usePlatform();
  const kabukYuzeyi = platform.veriGuvenligi;
  const projeId = useProjectStore((s) => s.project.meta.id);
  const role = useProjectStore((s) => s.role);
  const showToast = useUiStore((s) => s.showToast);
  const { profil } = useSenaryoProfili();
  const mevcutBloklari = useProjectStore((s) => s.project.script?.blocks) ?? [];

  const [noktalar, setNoktalar] = useState<CipaKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const [secilenId, setSecilenId] = useState<string | null>(null);
  const [ozet, setOzet] = useState<NoktaOzeti | null>(null);
  const [ozetYukleniyor, setOzetYukleniyor] = useState(false);

  const [donusBusy, setDonusBusy] = useState(false);

  const yenile = useCallback(() => {
    if (!kabukYuzeyi || !projeId) {
      setNoktalar([]);
      return;
    }
    setYukleniyor(true);
    setHata(null);
    kabukYuzeyi
      .cipaHalkasi(projeId)
      /* Kabuk zaten yeniden-eskiye veriyor (bkz. `gunluk-deposu.ts`
         `halka()`); yine de burada da sıralanıyor çünkü bu, arayüzün
         DAYANDIĞI bir sözleşme — kabuk tarafı sessizce değişirse liste
         yanlış sırada kalmamalı. */
      .then((halka) => setNoktalar([...halka].sort((a, b) => b.zaman - a.zaman)))
      .catch(() => setHata(t('Geri dönülecek anlar okunamadı.')))
      .finally(() => setYukleniyor(false));
  }, [kabukYuzeyi, projeId]);

  useEffect(yenile, [yenile]);

  const sec = useCallback(
    (id: string) => {
      setSecilenId(id);
      setOzet(null);
      if (!kabukYuzeyi || !projeId) return;
      setOzetYukleniyor(true);
      void (async () => {
        let doc: Y.Doc | null = null;
        try {
          const bayt = await kabukYuzeyi.cipaOku(projeId, id);
          doc = new Y.Doc();
          Y.applyUpdate(doc, bayt, 'nokta-onizleme');
          const { blocks } = readScript(doc);
          setOzet(noktaOzetiCikar(blocks, mevcutBloklari, profil));
        } catch {
          /* Önizleme çözülemedi — dönüş yine de denenebilir, `kontrolNoktasinaDon`
             kendi hata mesajını üretir. Burada sessiz kalmak arayüzü kilitlemez. */
          setOzet(null);
        } finally {
          doc?.destroy();
          setOzetYukleniyor(false);
        }
      })();
    },
    [kabukYuzeyi, projeId, mevcutBloklari, profil],
  );

  const donusYap = useCallback(async (id: string) => {
    if (!kabukYuzeyi || !projeId) return false;
    setDonusBusy(true);
    try {
      const kabuk: GeriDonusKabugu = {
        /* SEYRELTMESİZ: bu yazımın hemen ardından hedef nokta okunacak ve
           seyreltme, birazdan okunacak o noktayı budayabilir. */
        guvenlikNoktasiYaz: (cipa) => kabukYuzeyi.cipaYazVeGunlugeKes(projeId, cipa, false),
        noktaOku: (noktaId) => kabukYuzeyi.cipaOku(projeId, noktaId),
      };
      const sonuc = await kontrolNoktasinaDon(useProjectStore.getState().doc, id, kabuk);
      useProjectStore.getState().attachDoc(sonuc.doc, role);
      /* Çıpa görsellerin baytlarını taşımıyor (varlık deposu); deposundan
         silinmiş bir görsel geri gelmez. Belge AÇILDI — kullanıcı bunu
         GÖRMELİ, boş kareyi kendi keşfetmemeli (§15.4 sessiz başarısızlık
         yasağı). Sorulamıyorsa dönüşün kendisi başarılı sayılır: bildirim
         eksikliği, işi geri almak için sebep değil. */
      let eksik: string[] = [];
      try {
        eksik = (await kabukYuzeyi.eksikVarliklar?.(projeId, id)) ?? [];
      } catch {
        /* yoksay — aşağıdaki mesaj eksiksiz dönüşünkiyle aynı kalır */
      }
      if (eksik.length) {
        showToast(tf('Bu ana dönüldü — %d görselin dosyası bulunamadı.', eksik.length), 'error');
      } else {
        showToast(t('Bu ana dönüldü.'), 'success');
      }
      setSecilenId(null);
      setOzet(null);
      yenile();
      return true;
    } catch (hata) {
      /* Ham hata (dosya yolu, ENOENT vb.) kullanıcıya GÖSTERİLMEZ — panikteki
         biri onunla ne yapacağını bilmez. Teknik ayrıntı konsola gidiyor
         (§15.4 sessizce yutmama), arayüz ne olduğunu ve durumun güvenli
         olduğunu söylüyor: `kontrolNoktasinaDon` başarısızlıkta MEVCUT
         belgeye hiç dokunmuyor. */
      console.error('Kontrol noktasına dönüş başarısız:', hata);
      /* Hedef GERÇEKTEN kaybolmuş olabilir: 5 dakikalık normal bir çıpa
         yazımı, liste çizildikten sonra 30 günü aşmış bir noktayı budamış
         olabilir. Kararı halkayı yeniden okuyarak veriyoruz; hata METNİNE
         bakmak (ENOENT vb.) platforma ve dile göre değişir, yanlış dalı
         seçerdi. Liste her hâlükârda yenileniyor — bayat bir satır kalırsa
         kullanıcı aynı hataya bir daha basar. */
      let kayip = false;
      try {
        const halka = await kabukYuzeyi.cipaHalkasi(projeId);
        kayip = !halka.some((c) => c.id === id);
      } catch {
        /* Halka da okunamıyorsa genel mesaj zaten doğru olan. */
      }
      showToast(
        kayip
          ? t('Bu an artık yok — liste yenilendi. Şu anki hâlin değişmedi.')
          : t('Bu ana dönülemedi. Şu anki hâlin değişmedi, güvenle devam edebilirsin.'),
        'error',
      );
      yenile();
      return false;
    } finally {
      setDonusBusy(false);
    }
  }, [kabukYuzeyi, projeId, role, showToast, yenile]);

  return {
    destekleniyor: kabukYuzeyi !== null,
    noktalar,
    yukleniyor,
    hata,
    secilenId,
    ozet,
    ozetYukleniyor,
    sec,
    donusBusy,
    donusYap,
  };
}
