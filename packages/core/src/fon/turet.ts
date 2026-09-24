import type { ScriptBlock } from '../model/script';
import type { SenaryoAnalizi } from '../model/analiz';
import type { YapiIstatistigi } from '../model/yapi';
import type { DokumanTipi } from '../model/dokuman-tipi';
import type { BaslikSayfasi } from '../disa/baslik-sayfasi';
import type { ProjectMeta } from '../model/types';
import type { BreakdownEki } from '../model/breakdown';
import type { KarakterSatiri } from '../model/karakter';
import type { LokasyonSatiri } from '../model/lokasyon';
import type { DilAdi } from '../format/profil';
import { TERIMLER } from '../format/terim';
import type { FonKaynak } from './sablon';

/**
 * FON DOSYASI TASLAK ÜRETİCİLERİ — deterministik, LLM yok.
 *
 * ## Neyi üretir, neyi ÜRETMEZ
 *
 * Bu modülün en önemli özelliği yapmadığı şey: **sinopsis yazmaz.**
 * Sinopsis, yazar/yönetmen görüşü, biyografi, bütçe rakamı ve finans planı
 * senaryodan TÜRETİLEMEZ; onları üretiyormuş gibi yapmak kullanıcıya
 * kendi projesi hakkında uydurma bir metin vermek olurdu. `kaynak: 'elle'`
 * için burası `null` dönüyor ve arayüz "Taslak üret" düğmesini HİÇ
 * çizmiyor — pasif değil, yok. Gri bir düğme bir kez tıklanır ve
 * "bozuk" denir.
 *
 * ## Tretman neden özet değil iskelet
 *
 * Üretilen şey sahnelerin ÖZETİ değil, sahne başına başlık + ölçüm + bir
 * boş satır. Özet çıkarmak metni ANLAMAYI gerektirir; elimizdeki tek kesin
 * veri yapıdır. İskelet dürüsttür: çatıyı kurar, eti yazara bırakır.
 *
 * ## Neden dizge dizisi döner
 *
 * Çağıran (`fon/kur.ts`) her paragrafı bir `paragraf` bloğu yapıyor. Tek
 * bir metin dönseydi çağıran onu yeniden bölerdi — az önce ürettiğimiz
 * yapıyı ayrıştırmak, bilgiyi kaybedip geri aramaktır.
 *
 * Etiketler `TERIMLER[dil].fon`dan: metin belgeye giriyor, belge kuruma
 * gidiyor (`DokumEtiketleri` ile aynı gerekçe).
 */

export interface TuretmeGirdisi {
  bloklar: readonly ScriptBlock[];
  analiz: SenaryoAnalizi;
  yapi: YapiIstatistigi;
  /** KAYNAK senaryonun doküman tipi — `sayfaDakika` buradan okunuyor. */
  tip: DokumanTipi;
  baslikSayfasi: BaslikSayfasi;
  meta: ProjectMeta;
  /** `sceneId` → sahne başına yapım verisi. */
  breakdown: Readonly<Record<string, BreakdownEki>>;
  karakterler: readonly KarakterSatiri[];
  lokasyonlar: readonly LokasyonSatiri[];
  /** BELGE dili — fon şablonunun dili. */
  dil: DilAdi;
}

/** Yüzde — `0.1234` → `12`. Sıfıra yuvarlanan pay yine `0` yazılır. */
function yuzde(pay: number): number {
  return Math.round(pay * 100);
}

/** `updatedAt` → `YYYY-MM-DD`. Yerel saat dilimine bağlı DEĞİL. */
function isoTarih(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function kunye(g: TuretmeGirdisi): string[] {
  const F = TERIMLER[g.dil].fon;
  const satirlar: string[] = [];
  const baslik = g.baslikSayfasi.baslik.trim() || g.meta.name.trim();
  if (baslik) satirlar.push(baslik);
  const yazar = (g.baslikSayfasi.yazar ?? g.meta.author).trim();
  if (yazar) satirlar.push(`${F.yazar}: ${yazar.split('\n').join(', ')}`);
  satirlar.push(`${F.tarih}: ${g.baslikSayfasi.tarih?.trim() || isoTarih(g.meta.updatedAt)}`);
  satirlar.push(`${F.toplamSayfa}: ${g.yapi.toplamSayfa}`);
  /* SÜRE YALNIZ SAYFA=DAKİKA GEÇERLİYSE. Romanda ya da iki sütunlu
     belgede sayfa sayısını dakikaya çevirmek, yazara olmayan bir bilgi
     vermek olurdu — `sayfaDakika` bayrağı tam olarak bunun için var. */
  satirlar.push(
    g.tip.sayfaDakika
      ? `${F.sure}: ~${g.yapi.toplamSayfa} ${TERIMLER[g.dil].dokum.dakikaKisa}`
      : F.sureOlculemez,
  );
  return satirlar;
}

function sahneListesi(g: TuretmeGirdisi): string[] {
  const T = TERIMLER[g.dil];
  const F = T.fon;
  const satirlar: string[] = [F.sahneListesi];
  for (const s of g.analiz.sahneler) {
    const parcalar: string[] = [];
    if (s.ic !== undefined) parcalar.push(s.ic ? T.mekan.ic : T.mekan.dis);
    if (s.zaman) parcalar.push(T.zaman[s.zaman]);
    parcalar.push(`${s.kelime} ${F.kelime}`);
    parcalar.push(`%${yuzde(s.pay)}`);
    const baslik = s.baslik.trim() || s.yer;
    satirlar.push(`${s.sira + 1}. ${baslik} — ${parcalar.join(' · ')}`);
    /* BOŞ SATIR DEĞİL, SORU. Boş bırakılsaydı kullanıcı orada bir şey
       beklendiğini görmezdi; iskeletin işi tam olarak yeri göstermek. */
    satirlar.push(F.neOluyor);
  }
  return satirlar;
}

function karakterDosyasi(g: TuretmeGirdisi): string[] {
  const F = TERIMLER[g.dil].fon;
  const satirlar: string[] = [F.karakterDosyasi];
  const aciklamalar = new Map(g.karakterler.map((k) => [k.ad, k.aciklama]));
  for (const k of g.analiz.karakterler) {
    const olcum = [
      `${k.replik} ${F.replik}`,
      `${k.kelime} ${F.kelime}`,
      `${F.sahneAraligi} ${k.ilkSahne + 1}–${k.sonSahne + 1}`,
      `%${yuzde(k.replikPayi)}`,
    ].join(' · ');
    satirlar.push(`${k.ad} — ${olcum}`);
    const aciklama = aciklamalar.get(k.ad)?.trim();
    if (aciklama) satirlar.push(aciklama);
  }
  /* Senaryoda hiç konuşmayan ama KAYITLI karakter de listeye giriyor:
     `karakterSatirlari` iki yönlü birleştiriyor ve figüran/sessiz rol
     başvuruda yok sayılamaz. */
  const konusan = new Set(g.analiz.karakterler.map((k) => k.ad));
  for (const k of g.karakterler) {
    if (konusan.has(k.ad)) continue;
    satirlar.push(k.aciklama.trim() ? `${k.ad} — ${k.aciklama.trim()}` : k.ad);
  }
  return satirlar;
}

function mekanListesi(g: TuretmeGirdisi): string[] {
  const T = TERIMLER[g.dil];
  const F = T.fon;
  const satirlar: string[] = [F.mekanListesi];
  const tipler = new Map(g.lokasyonlar.map((l) => [l.ad.toLocaleUpperCase(g.dil === 'tr' ? 'tr' : 'en'), l.tip]));
  for (const m of g.analiz.mekanlar) {
    const tip = tipler.get(m.yer);
    const parcalar = [
      `${m.sahneSayisi} ${F.sahneSayisi}`,
      `%${yuzde(m.pay)}`,
    ];
    if (tip) parcalar.unshift(tip === 'ic' ? T.mekan.ic : T.mekan.dis);
    satirlar.push(`${m.yer} — ${parcalar.join(' · ')}`);
  }
  return satirlar;
}

function butceSinyalleri(g: TuretmeGirdisi): string[] {
  const T = TERIMLER[g.dil];
  const F = T.fon;
  const D = T.dokum;
  /* İLK SATIR SABİT VE UYARI. Bu bölüm bir bütçe gibi okunabilir ve
     yanlış okunması pahalıdır: kuruma giden dosyada "bütçe" başlığı
     altında rakam olmayan bir liste durur. */
  const satirlar: string[] = [F.butceSinyalleri, F.butceUyarisi];
  satirlar.push(`${F.toplamMekan}: ${g.analiz.mekanlar.length}`);
  satirlar.push(`${F.icDisDagilimi}: ${g.analiz.icSahne} / ${g.analiz.disSahne}`);
  satirlar.push(`${F.geceKumesi}: ${g.analiz.geceKumeleri}`);

  const topla = (sec: (e: BreakdownEki) => string[]): string[] => {
    const kume = new Set<string>();
    for (const e of Object.values(g.breakdown)) for (const v of sec(e)) {
      const kirpik = v.trim();
      if (kirpik) kume.add(kirpik);
    }
    return [...kume].sort((a, b) => a.localeCompare(b, g.dil));
  };
  for (const [etiket, degerler] of [
    [D.ozelEsya, topla((e) => e.ozelEsya)],
    [D.kostum, topla((e) => e.kostum)],
    [D.efekt, topla((e) => e.efekt)],
  ] as [string, string[]][]) {
    satirlar.push(`${etiket}: ${degerler.length ? degerler.join(', ') : D.yok}`);
  }
  return satirlar;
}

/**
 * Bölümün taslağını üretir. `kaynak: 'elle'` ise **`null`** —
 * türetilemeyeni üretiyormuş gibi yapmaz.
 */
export function taslakUret(kaynak: FonKaynak, girdi: TuretmeGirdisi): readonly string[] | null {
  switch (kaynak) {
    case 'elle': return null;
    case 'kunye': return kunye(girdi);
    case 'sahne-listesi': return sahneListesi(girdi);
    case 'karakterler': return karakterDosyasi(girdi);
    case 'mekanlar': return mekanListesi(girdi);
    case 'butce-sinyalleri': return butceSinyalleri(girdi);
  }
}
