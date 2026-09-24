/**
 * Kontrol noktası seyrelmesi — §15.2.2'nin 3. katmanı.
 *
 * **Sabit sayı değil, seyrelen zaman ölçeği.** Spec'in gerekçesi: bir hata
 * fark edilene kadar dakikalar değil bazen günler geçer. "Son 10 nokta"
 * tutmak yoğun bir seansta bir saatlik geri dönüş penceresi demektir;
 * seyrelme aynı disk maliyetiyle 30 günlük pencere verir.
 *
 * Saf modül: dosya sistemi bilmez, yalnız zaman damgalarına bakar.
 */

export const SAAT_MS = 3_600_000;
export const GUN_MS = 86_400_000;

/** Son 1 saat: her kontrol noktası saklanır. */
export const TAZE_PENCERE_MS = SAAT_MS;
/** Son 24 saat: saatte bir. */
export const SAATLIK_PENCERE_MS = 24 * SAAT_MS;
/** Son 30 gün: günde bir. */
export const GUNLUK_PENCERE_MS = 30 * GUN_MS;

export interface KontrolNoktasi {
  id: string;
  /** ms epoch. */
  zaman: number;
  /**
   * Kullanıcının KAYDETTİĞİ taslak. §15.2.2: "süresiz — asla silinmez".
   * Otomatik noktalardan farkı budur.
   */
  taslak?: boolean;
}

export interface SeyrelmeSonucu {
  tutulan: KontrolNoktasi[];
  silinen: KontrolNoktasi[];
}

/**
 * Politikayı uygular.
 *
 * Kova sınırları YAŞA değil MUTLAK zamana göre hesaplanır
 * (`floor(zaman / SAAT_MS)`). Yaşa göre hesaplansaydı kovalar her çağrıda
 * kayardı ve aynı nokta bir çağrıda tutulup diğerinde silinebilirdi; kararın
 * tek yönlü ilerlemesi (bir kez tutulan, yaşı ilerlemeden silinmez) buna
 * bağlıdır.
 *
 * Her kovanın EN YENİ noktası tutulur. Kayıt döndürme araçlarının yerleşik
 * seçimi budur; en eskiyi tutmak, o penceredeki en güncel duruma dönmeyi
 * imkânsız kılardı.
 */
export function seyrelt(
  noktalar: readonly KontrolNoktasi[],
  simdi: number,
): SeyrelmeSonucu {
  const sirali = [...noktalar].sort((a, b) => b.zaman - a.zaman);
  const tutulanIdler = new Set<string>();

  /* EN YENİ NOKTA HER ZAMAN TUTULUR — yaşı ne olursa olsun.
     Guard olmasaydı: uygulama 40 gün sonra açıldığında bütün noktalar
     30 günden eski olur ve politika HEPSİNİ silerdi. Projenin tek yedeği
     o anda yok edilirdi. */
  if (sirali.length) tutulanIdler.add(sirali[0].id);

  const saatKovalari = new Set<number>();
  const gunKovalari = new Set<number>();

  for (const n of sirali) {
    if (n.taslak) {
      tutulanIdler.add(n.id);
      continue;
    }
    /* Negatif yaş = saat geriye atlamış ya da damga gelecekte. İş silinmez;
       şüpheli bir saat yüzünden veri kaybetmek kabul edilemez. */
    const yas = simdi - n.zaman;
    if (yas < TAZE_PENCERE_MS) {
      tutulanIdler.add(n.id);
      continue;
    }
    if (yas < SAATLIK_PENCERE_MS) {
      const kova = Math.floor(n.zaman / SAAT_MS);
      if (!saatKovalari.has(kova)) {
        saatKovalari.add(kova);
        tutulanIdler.add(n.id);
      }
      continue;
    }
    if (yas < GUNLUK_PENCERE_MS) {
      const kova = Math.floor(n.zaman / GUN_MS);
      if (!gunKovalari.has(kova)) {
        gunKovalari.add(kova);
        tutulanIdler.add(n.id);
      }
      continue;
    }
    // 30 günden eski otomatik nokta: düşer.
  }

  return {
    tutulan: sirali.filter((n) => tutulanIdler.has(n.id)),
    silinen: sirali.filter((n) => !tutulanIdler.has(n.id)),
  };
}

/* ------------------------------------------------------------------ */
/* Arşiv budaması — §15.3'ün "sil değil taşı" kuralının diğer ucu       */
/* ------------------------------------------------------------------ */

/**
 * "Yoksay" ve "oturumu kapat" veriyi SİLMEZ, arşive taşır (§15.3). Doğru
 * karar, ama arşive hiç dokunulmazsa sınırsız büyür: her yoksayma bir dosya,
 * her kapatılan oda bir dizin bırakır ve orada sonsuza kadar durur.
 *
 * Politika iki kurallı ve KASITEN cömert:
 *  - Yaş sınırından genç olan her şey TUTULUR.
 *  - Yaşı ne olursa olsun EN YENİ birkaç kayıt tutulur.
 *
 * İkinci kural olmasaydı altı ay sonra dönen bir kullanıcı boş arşiv
 * bulurdu — `seyrelt`'in "en yeni nokta her zaman tutulur" kuralıyla aynı
 * gerekçe. Sayı değil YAŞ birincil ölçüt: "son 10 tanesini tut" diyen bir
 * politika, yoğun bir günde altı ay birikmiş arşivi bir öğleden sonrada
 * süpürürdü.
 */
export interface ArsivKaydi {
  id: string;
  zaman: number;
}

export function arsivBudamasi(
  kayitlar: readonly ArsivKaydi[],
  simdi: number,
  yasSiniri: number = GUNLUK_PENCERE_MS,
  enAzTutulan = 5,
): { tutulan: ArsivKaydi[]; silinen: ArsivKaydi[] } {
  const sirali = [...kayitlar].sort((a, b) => b.zaman - a.zaman);
  const tutulan: ArsivKaydi[] = [];
  const silinen: ArsivKaydi[] = [];

  sirali.forEach((k, sira) => {
    const genc = simdi - k.zaman < yasSiniri;
    if (genc || sira < enAzTutulan) tutulan.push(k);
    else silinen.push(k);
  });

  return { tutulan, silinen };
}
