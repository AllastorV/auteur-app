import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/project';
import { usePlatform } from '../platform/context';
import { useCollabStore } from '../store/collab';
import { GunlukYazici, type YaziciDurumu, type YaziciKabugu } from '../veri/yazici';
import { blokDokunusuDinle } from '../veri/blok-dokunus';

/**
 * §15 veri güvenliği katmanını çalıştırır.
 *
 * `useAutosave`'in YERİNE geçmez, ALTINA girer: otomatik kayıt kullanıcıya
 * dönük proje dosyasını tazeler (60 sn), bu katman ise çökme korumasını
 * sağlar (~1 sn günlük + 5 dk çıpa). §15.1'in eleştirdiği 60 saniyelik
 * pencereyi kapatan budur.
 *
 * Durum `null` dönerse bu kabukta koruma YOKTUR ve arayüz bunu söylemek
 * zorundadır (§15.4).
 */
export function useVeriGuvenligi(enabled: boolean): YaziciDurumu | null {
  const platform = usePlatform();
  const doc = useProjectStore((s) => s.doc);
  const projeId = useProjectStore((s) => s.project.meta.id);
  const [durum, setDurum] = useState<YaziciDurumu | null>(null);

  useEffect(() => {
    const kabukYuzeyi = platform.veriGuvenligi;
    if (!enabled || !kabukYuzeyi || !projeId) {
      setDurum(null);
      return;
    }
    const yazarlikYuzeyi = platform.yazarlik;
    const kabuk: YaziciKabugu = {
      gunlugeEkle: (c) => kabukYuzeyi.gunlugeEkle(projeId, c),
      cipaYazVeGunlugeKes: (c) => kabukYuzeyi.cipaYazVeGunlugeKes(projeId, c),
      /* Yazarlık günlüğü OPSİYONEL — kabuk yoksa (`platform.yazarlik === null`,
         ör. web) yazıcı izlemeyi kendiliğinden atlıyor. */
      yazarlikEkle: yazarlikYuzeyi
        ? (kayitlar) => yazarlikYuzeyi.ekle(projeId, kayitlar)
        : undefined,
    };
    /* Yazar adı HER ÇAĞRIDA store'dan taze okunuyor: `useCollabStore`'a
       ABONE OLMUYORUZ çünkü ad değişimi bu efekti yeniden kurmamalı — yazıcı
       zaten çalışırken oturuma sonradan katılan/adını değiştiren kullanıcının
       BİR SONRAKİ boşaltmada güncel adı görmesi yeterli. */
    const yazici = new GunlukYazici(doc, kabuk, {
      yazar: () => useCollabStore.getState().userName,
    });
    const birak = yazici.onDurum(setDurum);
    /* Editörden gelen "hangi bloklara dokunuldu" bilgisi yazıcıya burada
       bağlanıyor. Bağlanmazsa yazarlık günlüğü sessizce BOŞ kalır —
       dosyalar yazılır, sorgu hep null döner ve kimse fark etmez. */
    const birakDokunus = blokDokunusuDinle((blokIdler) =>
      yazici.blokDokunusuBildir(blokIdler),
    );
    yazici.baslat();
    /* AÇILIŞ ÇIPASI — belge her DEĞİŞTİĞİNDE (ilk açılış, sürüm geri
       yükleme, geri dönüş noktası, aynı projeyi yeniden açma) yeni belge
       hemen çıpalanır ve günlük kesilir.

       Bu satır yokken üç yoldan ikisi çıpasız kalıyordu ve sonuçları
       ÖLÇÜLDÜ (belge-degisimi-cipa.test.tsx): `replaceProject` yeni bir
       Yjs soyu kurar; eski soylu çıpanın üstüne yeni soylu günlük
       oynatılınca Yjs çakıştırmaz, BİRLEŞTİRİR — bütün metin çiftlenir.
       Aynı soylu geri dönüşte ise halkanın en yeni noktası "dönülmeden
       önceki durum" olarak kalır ve bir sonraki kurtarma dönüşü sessizce
       geri alır. Kural TEK EVDE (Karar 2): belge değişimini gören tek yer
       bu efekt — her yol (VersionsDialog, donusYap, Studio) ayrı ayrı
       çıpalasaydı biri unutulurdu; biri zaten unutulmuştu.

       Günlüğü kesmek burada GÜVENLİ: bu efekt `kurtarma.cozuldu`
       kapısının arkasında, yani incelenmemiş bir günlük bu noktaya
       gelemez (kurtarıldı ya da arşivlendi — bkz. useKurtarma). */
    void yazici.cipaAl();
    setDurum(yazici.durum());

    return () => {
      birak();
      birakDokunus();
      /* Kapanışta SON kez boşalt VE ÇIPALA: son saniyenin yazısı
         zamanlayıcıyı beklemeden diske gitmeli (`cipaAl` önce `bosalt`
         çağırır), belgenin son hâli de halkaya girmeli — girmezse eski
         belgenin son ≤5 dakikası yalnız günlükte kalır ve yukarıdaki
         açılış çıpası yeni belge için günlüğü kestiğinde o iş kaybolurdu.
         Yazarlığın kasıtla AÇIK bıraktığı son kayıt da burada ZORLA
         yazılır — yoksa son birkaç saniyenin "kim yazdı" bilgisi sessizce
         kaybolur. */
      void yazici
        .cipaAl()
        .then(() => yazici.yazarlikZorlaBosalt())
        .finally(() => yazici.durdur());
    };
  }, [enabled, platform, doc, projeId]);

  return durum;
}
