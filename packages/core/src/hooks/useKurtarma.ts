import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useProjectStore } from '../store/project';
import { usePlatform } from '../platform/context';
import { useUiStore } from '../store/ui';
import { oturumuKurtar, type OturumKurtarma } from '../veri/anlik';
import { assetsMap } from '../doc/schema';
import { t, tf } from '../dil/arayuz';

/**
 * Açılışta kurtarma denetimi — §15.3.
 *
 * "Program **sessizce oynatmaz, sorar**." Bu kanca soruyu hazırlar; kararı
 * kullanıcı verir.
 *
 * ## Sıra kritik
 * Günlük yazıcısı bu karar VERİLMEDEN başlatılmamalı. Başlatılsaydı, henüz
 * oynatılmamış bir günlüğün sonuna yeni çerçeveler eklenirdi: kullanıcı
 * "Yoksay" derse arşive kendi yeni yazdıkları da giderdi, "Kurtar" derse
 * çerçeveler iki kez oynatılırdı. Çağıran bu yüzden yazıcıyı
 * `cozuldu === true` olana kadar bekletir.
 */
export interface KurtarmaOnerisi {
  kurtarma: OturumKurtarma;
  /** Günlük oynatılmadan ÖNCEki durum — "Farkı gör" bunun üzerine hesaplar. */
  cipaDoc: Y.Doc;
}

export interface KurtarmaDurumu {
  /** Denetim bitti mi. Bitene kadar yazıcı BAŞLATILMAZ. */
  cozuldu: boolean;
  oneri: KurtarmaOnerisi | null;
  kurtar: () => void;
  yoksay: () => void;
}

export function useKurtarma(enabled: boolean): KurtarmaDurumu {
  const platform = usePlatform();
  const projeId = useProjectStore((s) => s.project.meta.id);
  const role = useProjectStore((s) => s.role);
  /* Bayrak DEĞİL, "hangi proje için çözüldü": `cozuldu` türetilmiş bir
     değerdir ve boolean olarak saklanınca ÖZNESİNDEN kopar. Kopunca ikinci
     proje açılışında önceki projeden kalma `true` ile gelir, günlük yazıcısı
     kurtarma denetimi daha diski okurken başlar ve iki oturumun çerçeveleri
     aynı günlükte birleşir (Yjs çakıştırmaz, BİRLEŞTİRİR — kullanıcı metnini
     çift görür). Kimliğe bağlayınca proje değişimi bayrağı kendiliğinden
     düşürür; sıfırlama penceresi hiç oluşmaz. */
  const [cozulenProje, setCozulenProje] = useState<string | null>(null);
  const cozuldu = cozulenProje === projeId;
  const setCozuldu = useCallback(() => setCozulenProje(projeId), [projeId]);
  const [oneri, setOneri] = useState<KurtarmaOnerisi | null>(null);
  const denetlenen = useRef<string | null>(null);

  useEffect(() => {
    const kabuk = platform.veriGuvenligi;
    if (!enabled || !kabuk || !projeId) {
      setCozuldu();
      return;
    }
    if (denetlenen.current === projeId) return;
    denetlenen.current = projeId;

    let iptal = false;
    void (async () => {
      try {
        const gunluk = await kabuk.gunlukOku(projeId);
        if (iptal) return;
        if (!gunluk || !gunluk.length) {
          setCozuldu();
          return;
        }
        const halka = await kabuk.cipaHalkasi(projeId);
        if (iptal) return;
        /* `ilkSaglamKayit` SENKRON bir okuyucu ister (tembel: bozuk dosya
           okunmaya kadar açılmaz), kabuk yüzeyi ise asenkron. Halka en fazla
           birkaç kayıt olduğu için önden okunup belleğe alınır. Alternatif,
           saf çekirdeği asenkron yapmaktı — dosya sistemi bilmeyen bir modüle
           Promise bulaştırmak olurdu. Okunamayan çıpa haritaya girmez ve
           `okunamadi` diye elenir. */
        const cipalar = new Map<string, Uint8Array>();
        /* Seçilen çıpanın varlık baytları AYRI tutulur: geri koyma günlük
           oynatmasından SONRA çekirdekte yapılır. Birleşik okunsaydı geri
           koyan öğeler günlükteki düzenlemelerle yarışır, ~%50 eski görsel
           kazanır ve silinen görsel dirilirdi (tarama bulgusu 1 — kalıcı
           testi tests/cipa-varlik-deposu.test.ts). Parçalı okuma OPSİYONEL:
           desteklemeyen kabukta (web) eski birleşik yol sürer. */
        const varlikPaketleri = new Map<
          string,
          { varliklar: Record<string, string>; ogeler: Record<string, number[]> }
        >();
        for (const c of halka) {
          try {
            if (kabuk.cipaParcaliOku) {
              const parca = await kabuk.cipaParcaliOku(projeId, c.id);
              cipalar.set(c.id, parca.govde);
              varlikPaketleri.set(c.id, { varliklar: parca.varliklar, ogeler: parca.ogeler ?? {} });
            } else {
              cipalar.set(c.id, await kabuk.cipaOku(projeId, c.id));
            }
          } catch {
            /* elenecek */
          }
        }
        if (iptal) return;
        const kurtarma = oturumuKurtar(
          halka.map((c) => ({
            id: c.id,
            oku: () => {
              const b = cipalar.get(c.id);
              if (!b) throw new Error(`Cipa okunamadi: ${c.id}`);
              return b;
            },
          })),
          gunluk,
          projeId,
          (cipaId) => varlikPaketleri.get(cipaId),
        );
        /* Günlük var ama hiçbir güncelleme uygulanamadıysa sorulacak bir şey
           yok: kullanıcıyı boş bir kararla karşılamak yerine günlük sessizce
           ARŞİVLENİR (silinmez — §15.3). */
        /* Uygulanabilir iş yoksa pencere AÇILMAZ: `sureMetni` bu durumda
           "kaydedilmemiş iş yok" der, yani kullanıcıya boş bir karar
           sunulurdu. Günlük yine de SİLİNMEZ, arşive taşınır (§15.3).

           Ama çerçeveler VARDI da hiçbiri uygulanamadıysa bu sessiz
           geçilmez: sağlaması tutan çerçeveler kullanıcının yazdıklarıdır ve
           uygulanamamaları bir arıza işaretidir. Arşivin yerini bilmeyen
           kullanıcı onları hiç arayamazdı. */
        if (kurtarma.uygulanan === 0) {
          const hedef = await kabuk.gunluguArsivle(projeId);
          if (!iptal && kurtarma.cozumlenen > 0) {
            useUiStore.getState().showToast(
              hedef
                ? tf('Önceki oturumdan %d kayıt bulundu ama hiçbiri uygulanamadı. Günlük silinmedi, arşive alındı: %s.', kurtarma.cozumlenen, hedef)
                : tf('Önceki oturumdan %d kayıt bulundu ama hiçbiri uygulanamadı. Günlük silinmedi, arşive alındı.', kurtarma.cozumlenen),
              'error',
            );
          }
          if (!iptal) setCozuldu();
          return;
        }
        const cipaDoc = new Y.Doc();
        const secilenBayt = kurtarma.cipa ? cipalar.get(kurtarma.cipa) : undefined;
        if (secilenBayt) {
          try {
            Y.applyUpdate(cipaDoc, secilenBayt, 'kurtarma');
            /* Parçalı okunduysa gövde varlıksız — fark görünümü için geri
               konur. Burada günlük OYNATILMIYOR, yarış yok. */
            const paket = kurtarma.cipa ? varlikPaketleri.get(kurtarma.cipa) : undefined;
            if (paket) {
              const assets = assetsMap(cipaDoc);
              cipaDoc.transact(() => {
                for (const [id, icerik] of Object.entries(paket.varliklar)) assets.set(id, icerik);
              }, 'kurtarma');
            }
          } catch {
            /* Çıpa okunamadıysa fark boş bir belgeye göre hesaplanır — yine de
               kurtarmayı engellemez. */
          }
        }
        if (!iptal) setOneri({ kurtarma, cipaDoc });
      } catch (hata) {
        /* Uygulama AÇILMAYA devam eder ama SESSİZ KALMAZ. Kurtarmayı
           engellemek, kurtarılacak bir şey olmadığı hâlde uygulamayı
           kilitlemek olurdu.

           Günlük ORTADA BIRAKILMAZ, arşive taşınır (§15.3 "sil değil
           taşı"): kapı açılınca yazıcı yeni belgeyi hemen çıpalayıp
           günlüğü KESİYOR (useVeriGuvenligi açılış çıpası) — incelenmemiş
           çerçeveler yerinde bırakılsaydı o kesme onları arşivsiz
           silerdi. Arşivleme de başarısızsa (bozuk disk) günlük yerinde
           kalır; aynı bozuk disk çıpa yazımını da düşüreceği için kesme
           zaten gerçekleşmez. */
        if (!iptal) {
          const hedef = await kabuk.gunluguArsivle(projeId).catch(() => null);
          useUiStore.getState().showToast(
            `${tf('Çökme kurtarma denetimi yapılamadı: %s', hata instanceof Error ? hata.message : String(hata))}. ${
              hedef ? tf('Önceki oturumun günlüğü arşive alındı: %s', hedef) : t('Önceki oturumun günlüğü yerinde duruyor.')}`,
            'error',
          );
          setCozuldu();
        }
      }
    })();
    return () => { iptal = true; };
  }, [enabled, platform, projeId]);

  const kurtar = useCallback(async () => {
    if (!oneri) return;
    const kabuk = platform.veriGuvenligi;
    useProjectStore.getState().attachDoc(oneri.kurtarma.doc, role);
    /* Kurtarılan durum hemen çıpalanır ve günlük kesilir: aksi hâlde bir
       sonraki açılışta AYNI günlük yeniden sorulurdu. */
    /* Hata YUTULMAZ (§15.4). Burası hatanın en pahalı olduğu an: kullanıcı
       "Kurtar"a bastı, kurtarıldığını sanıyor; çıpa yazılamadıysa günlük de
       kesilmemiştir ve aynı günlük bir sonraki açılışta yeniden sorulacaktır.
       Sessiz kalmak, kullanıcıya korunduğunu sandırmak olurdu. */
    setOneri(null);
    /* Çıpa yazımı BEKLENİYOR ve kapı ondan SONRA açılıyor: ateşle-unut
       bırakılsaydı günlük yazıcısı (kapı `cozuldu`'ya bağlı) daha kesilmemiş
       günlüğe yazmaya başlar, kesme sonradan gelir ve o çerçeveler
       kaybolurdu. */
    try {
      await kabuk?.cipaYazVeGunlugeKes(projeId, Y.encodeStateAsUpdate(oneri.kurtarma.doc));
    } catch (hata) {
      /* Çıpa yazılamadı → günlük KESİLMEDİ. Yazıcı açılırsa yabancı soydan
         çerçevelerin üstüne yazar ve sonraki açılışta ikisi birleşir. Günlüğü
         arşive taşı (SİLME — §15.3): yeni oturum temiz bir günlükle başlar,
         eski çerçeveler duruyor. */
      await kabuk?.gunluguArsivle(projeId).catch(() => {});
      useUiStore.getState().showToast(
        `${tf('Kurtarma diske yazılamadı: %s', hata instanceof Error ? hata.message : String(hata))}. ${t('Önceki günlük arşive alındı.')}`,
        'error',
      );
    }
    setCozuldu();
  }, [oneri, platform, projeId, role, setCozuldu]);

  const yoksay = useCallback(() => {
    void platform.veriGuvenligi?.gunluguArsivle(projeId).catch((hata: unknown) =>
      useUiStore.getState().showToast(
        tf('Günlük arşivlenemedi: %s', hata instanceof Error ? hata.message : String(hata)),
        'error',
      ),
    );
    setOneri(null);
    setCozuldu();
  }, [platform, projeId]);

  return { cozuldu, oneri, kurtar, yoksay };
}
