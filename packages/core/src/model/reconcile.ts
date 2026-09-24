import type { ScriptBlock } from './script';

/**
 * Senaryo yeniden içe aktarıldığında eski kimlikleri yeni bloklara devreder.
 *
 * İki geçiş:
 *   1) Tekil çapa (patience diff çekirdeği) — yalnız İKİ TARAFTA DA tam bir
 *      kez geçen `tip + metin` anahtarı çapa olur, çapalar `prev` indeksine
 *      göre artan olacak şekilde en uzun artan altdiziye indirgenir.
 *   2) Çapalar arası boşluklarda tip + sıra hizalaması — metni değişmiş ama
 *      yapıdaki yeri aynı olan bloklar kimliğini korur.
 *
 * Eşleşmeyen yeni bloklar kendi taze kimliğiyle kalır; eşleşmeyen eski
 * bloklar düşer (silinmiş sayılır).
 *
 * Bu, DÜZENLEME yolunun değil İÇE AKTARIM yolunun çözümüdür. Canlı
 * düzenlemede kimlik ProseMirror düğüm attribute'unda taşınır (F1) ve
 * hizalamaya hiç ihtiyaç duyulmaz.
 */
export function reconcileScript(prev: ScriptBlock[], next: ScriptBlock[]): ScriptBlock[] {
  // Kopya döndürülür: her yolda aynı sözleşme geçerli olsun ki çağıran dönen
  // listeyi yerinde değiştirdiğinde `next` etkilenmesin.
  if (prev.length === 0) return next.map((b) => ({ ...b }));

  const sonuc = next.map((b) => ({ ...b }));

  /* --- 1. geçiş: tekil çapa (patience diff çekirdeği) ----------------- */
  // Anahtar TEKRAR SONEKİ TAŞIMAZ — `fp` sayacı konumsaldır (`fp`, `fp_2`, …).
  // AYŞE üç kez geçen bir senaryonun başına bir AYŞE daha eklenince aşağıdaki
  // her tekrarın sayacı bir kayar; konumdan bağımsız `fp` eşleşmesi kimlikleri
  // o karakterin bütün blokları boyunca bir blok kaydırırdı: panel, yazarın hiç
  // yazmadığı bir repliğe sessizce otururdu (K-1).
  const anahtar = (b: ScriptBlock) => b.type + '\u0000' + b.text;

  /** anahtar → tek geçtiği index; birden çok geçiyorsa -1. */
  const tekilKonum = (liste: ScriptBlock[]) => {
    const m = new Map<string, number>();
    liste.forEach((b, i) => {
      const k = anahtar(b);
      m.set(k, m.has(k) ? -1 : i);
    });
    return m;
  };
  const prevKonum = tekilKonum(prev);
  const nextKonum = tekilKonum(sonuc);

  // Yalnız İKİ TARAFTA DA tam bir kez geçen anahtar çapa olabilir. Tekrarlı
  // anahtar belirsizdir — kaymanın kaynağı tam da orasıdır. Tip anahtarın
  // içindedir, ayrı bir tip koşuluna gerek kalmaz.
  const adaylar: { s: number; p: number }[] = [];
  for (const [k, s] of nextKonum) {
    if (s < 0) continue;
    const p = prevKonum.get(k);
    if (p === undefined || p < 0) continue;
    adaylar.push({ s, p });
  }
  adaylar.sort((a, b) => a.s - b.s);

  // LIS SINIR BELİRLER, KİMLİK SİLMEZ. Boşluk iskeleti `prev` indeksine göre de
  // ARTAN çapalardan kurulmalı; monotonik olmayanları en uzun artan altdizi
  // (patience sorting) iskeletin DIŞINDA bırakır. Greedy eleme erken bir aykırı
  // çapa uğruna uzun bir doğru diziyi atabilirdi.
  // Yer değiştiren blok böylece iskeletin dışında kalır ama KİMLİĞİNİ TAŞIR:
  // anahtarı iki tarafta da tekil olduğu için devir belirsiz değildir (tek
  // kaynak, tek hedef). Yazar bir sahneyi taşıdığında storyboard paneli kopmaz.
  const yigin: number[] = []; // yükseklik → o yükseklikte biten son aday
  const oncekiAday = new Array<number>(adaylar.length).fill(-1);
  for (let i = 0; i < adaylar.length; i++) {
    let alt = 0;
    let ust = yigin.length;
    while (alt < ust) {
      const orta = (alt + ust) >> 1;
      if (adaylar[yigin[orta]].p < adaylar[i].p) alt = orta + 1;
      else ust = orta;
    }
    oncekiAday[i] = alt > 0 ? yigin[alt - 1] : -1;
    yigin[alt] = i;
  }

  /** sonuc index → prev index */
  const eslesme = new Map<number, number>();
  const prevKullanildi = new Array<boolean>(prev.length).fill(false);

  // Her tekil aday kimliğini devreder — LIS'te olsun olmasın. Anahtar iki
  // tarafta da tam bir kez geçtiği için `s` de `p` de adaylar arasında
  // benzersizdir: aynı kimlik iki bloğa gidemez.
  for (const a of adaylar) {
    eslesme.set(a.s, a.p);
    prevKullanildi[a.p] = true;
  }

  /* --- 2. geçiş: çapalar arası boşlukların hizalanması ---------------- */
  // Boşluk sınırları YALNIZ LIS zinciridir: `s` ve `p` birlikte artar, böylece
  // aralıklar ayrık kalır. LIS dışı adaylar sınır değildir (aralıkları
  // çakıştırırlardı) ama kimliklerini yukarıda çoktan aldılar.
  const capalar: number[] = [];
  for (let i = yigin.length ? yigin[yigin.length - 1] : -1; i >= 0; i = oncekiAday[i]) {
    capalar.push(adaylar[i].s);
  }
  capalar.reverse();

  // Her boşluk için (sonuc tarafında) karşılık gelen prev aralığını bul.
  let oncekiSonuc = -1;
  let oncekiPrev = -1;
  const bosluklar: { sBas: number; sSon: number; pBas: number; pSon: number }[] = [];

  for (const c of capalar) {
    bosluklar.push({ sBas: oncekiSonuc + 1, sSon: c, pBas: oncekiPrev + 1, pSon: eslesme.get(c)! });
    oncekiSonuc = c;
    oncekiPrev = eslesme.get(c)!;
  }
  // Son çapadan sonrası da bir boşluktur; hiç çapa yoksa bu tek boşluk
  // listenin tamamını kapsar ve hizalama saf tip+sıra eşlemesine döner.
  bosluklar.push({ sBas: oncekiSonuc + 1, sSon: sonuc.length, pBas: oncekiPrev + 1, pSon: prev.length });

  // `prevKullanildi` filtresi YÜK TAŞIR — bozmayın: 1. geçişin devrettiği prev
  // index'leri boşluk havuzuna GİREMEZ. LIS dışı adayların prev index'leri bir
  // boşluğun aralığının TAM İÇİNDE kalır; filtre kalkarsa o kimlik ikinci kez,
  // bu kez alakasız bir bloğa dağıtılır — sessiz veri bozulması.
  // (Boşlukların prev aralıkları LIS sayesinde ayrık; havuzu döngü içinde
  // kurmak artık korumanın parçası değil, yalnız yazımın en kısa hali.)
  for (const g of bosluklar) {
    const havuz: number[] = [];
    for (let j = g.pBas; j < g.pSon; j++) if (!prevKullanildi[j]) havuz.push(j);

    for (let i = g.sBas; i < g.sSon; i++) {
      if (eslesme.has(i)) continue;
      // Aynı tipte, sıradaki ilk eşleşmemiş eski bloğu bul.
      const k = havuz.findIndex((j) => prev[j].type === sonuc[i].type);
      if (k === -1) continue;
      const j = havuz.splice(k, 1)[0];
      eslesme.set(i, j);
      prevKullanildi[j] = true;
    }
  }

  /* --- kimlikleri devret ---------------------------------------------- */
  // Yineleme sırası önemsizdir: `eslesme` her sonuc index'ini anahtar olarak
  // bir kez tutar ve `prevKullanildi` her prev index'inin tek kullanımını
  // garantiler — devir tek yönlü ve çakışmasızdır.
  for (const [i, j] of eslesme) {
    sonuc[i].id = prev[j].id;
    sonuc[i].sceneId = prev[j].sceneId;
  }

  /* Sahne kimliği tutarlılığı: bir sahnenin başlığı devraldıysa o sahnenin
     bütün blokları aynı kimliği kullanmalı. Sahne başlıklarından yürüyerek
     düzelt. */
  // İlk sahne başlığından önceki bloklar için tohum: kimlik DEVRALMIŞ bir blok
  // varsa onunki kullanılır. Eşleşmemiş bloğun sceneId'si taze bir uid'dir ve
  // kalıcı olanı ezmemeli (k-1).
  let aktifSahne = '';
  for (let i = 0; i < sonuc.length && sonuc[i].type !== 'scene'; i++) {
    if (eslesme.has(i)) {
      aktifSahne = sonuc[i].sceneId;
      break;
    }
  }
  if (!aktifSahne) aktifSahne = sonuc[0]?.sceneId ?? '';
  for (const b of sonuc) {
    if (b.type === 'scene') aktifSahne = b.sceneId;
    else b.sceneId = aktifSahne;
  }

  return sonuc;
}
