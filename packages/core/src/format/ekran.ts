import { BLOK_ETIKETLERI, type ScriptBlock, type ScriptBlockType } from '../model/script';
import { t } from '../dil/arayuz';
import { BASLIK_PUNTO } from '../disa/baslik-sayfasi';
import { AYIRICI_SATIR, IKI_SUTUN } from './iki-sutun';
import { IZGARA, KARAKTER_MM, SATIR_MM } from './izgara';
import { satirYuksekligiMm, type BlokStili, type FormatProfili } from './profil';
import { sayfala, type Sayfa } from './sayfala';
/* Sönme süresi EKLENTİDEN geliyor, burada bir kez daha yazılmıyor: CSS
   geçişi bitmeden dekorasyon düşerse şerit sönmeden kaybolur, sonra düşerse
   görünmez bir çizgi kağıtta asılı kalır. İki sayı tek evde (Karar 2). */
import { SERIT_SOLMA_MS } from '../editor/imlec';
/* Etiket yazısının rengi de paletin evinden: kontrast iddiası
   (`ETIKET_YAZISI` ile paletin her üyesi arasında en az 4,5:1) ancak CSS
   aynı değeri kullanırsa gerçek olur. */
import { ETIKET_YAZISI } from '../util/color';

/**
 * Ölçülen sayfa geometrisinin EKRAN karşılığı.
 *
 * Bu modül saf: DOM'a dokunmaz, React bilmez. Gerekçe §6.2'nin sözleşmesiyle
 * aynı — sayfa geometrisi tek yerde yaşar ve tarayıcısız test edilir. Bileşen
 * yalnızca burada üretilen değerleri yerleştirir.
 *
 * **Yatay `ch`, dikey `mm`.** Sarma genişliği karakter cinsindendir (motor da
 * öyle sarar), sayfa ve satır yüksekliği kağıt ölçüsüdür. İkisini karıştırmak
 * — örneğin sütunu mm ile vermek — yazı tipi metrikleri birazcık kaysa bile
 * DOM'un motordan FARKLI yerde sarmasına yol açar ve ekrandaki sayfa sayısı
 * sessizce ıraksardı.
 */

/**
 * Courier ailesinde bir karakterin em'e oranı — bir YAZI TİPİ metriğidir,
 * ızgara sabiti değil.
 *
 * `KARAKTER_MM / 0,6` tesadüfen `SATIR_MM`'e eşittir (Courier 12pt: yatayda
 * 10 karakter/inç, dikeyde 6 satır/inç, 12pt = 1/6 inç). Bu eşitliğe
 * DAYANMAK yerine türetiyoruz: `font-size: SATIR_MM` yazmak, yazı tipi
 * değiştiğinde ilişkiyi görünmez kılardı. Eşitlik testte iddia edilir, kodda
 * varsayılmaz.
 */
export const COURIER_EN_ORANI = 0.6;

/** Courier 12pt'nin punto karşılığı, mm. */
export const YAZI_MM = KARAKTER_MM / COURIER_EN_ORANI;

/**
 * Bir blok stilinin girintileri, KARAKTER cinsinden.
 *
 * GÜVEN SINIRI: her girinti tek tek tam karakter olmak ZORUNDA.
 * `sutunGenisligi` yalnız TOPLAMI doğrular — `sol=1,27` + `sag=1,27` toplamda
 * bir karaktere denk gelir ve oradan geçer, ama ekranda metin karakter
 * ızgarasının yarım hücre dışına oturur. Motor tam sütunlarla sarar; yarım
 * hücre girinti ekranı motordan ayırır.
 */
export function girintiSutun(stil: BlokStili): { sol: number; sag: number } {
  const cevir = (mm: number, ad: string): number => {
    const sutun = mm / KARAKTER_MM;
    const yuvarlak = Math.round(sutun);
    if (Math.abs(sutun - yuvarlak) > 1e-9) {
      throw new Error(`Girinti tam karakter degil: ${ad}=${mm} -> ${sutun} sutun`);
    }
    return yuvarlak;
  };
  return { sol: cevir(stil.solMm, 'sol'), sag: cevir(stil.sagMm, 'sag') };
}

/** CSS özel değişkeni adı — blok tipi başına girinti. */
const girintiAdi = (tip: ScriptBlockType) => `--girinti-${tip}`;
const cekmeAdi = (tip: ScriptBlockType) => `--cekme-${tip}`;
const bosAdi = (tip: ScriptBlockType) => `--bos-${tip}`;

/**
 * Sayfanın CSS özel değişkenleri.
 *
 * Her uzunluk TEK bir `--birim` üzerinden hesaplanır. Yakınlaştırma o birimi
 * değiştirir: `transform: scale()` DEĞİL. Dönüşüm contenteditable'da imleç
 * dikdörtgenlerini ve seçim kutularını bozar; birim değiştirmek düzeni
 * gerçekten yeniden akıtır. §16.1'in "yakınlaştırma sayfa genişliğini değil
 * ölçeği değiştirir, satır sonları asla kaymaz" kuralı da böyle tutar:
 * sütun `ch` cinsinden olduğu için yazı boyutuyla birlikte ölçeklenir ve
 * sarma noktaları aynı kalır.
 */
export function sayfaDegiskenleri(profil: FormatProfili, olcek: number): Record<string, string> {
  if (!Number.isFinite(olcek) || olcek <= 0) {
    throw new Error(`Olcek pozitif olmali: ${olcek}`);
  }
  const g = profil.geometri;
  const mm = (deger: number) => `calc(${deger} * var(--birim))`;
  const degiskenler: Record<string, string> = {
    '--birim': `${olcek}mm`,
    '--sayfa-genislik': mm(g.sayfaGenislikMm),
    /* Kapak sayfasi TAM SAYFA yuksekligindedir (icerik akmaz); senaryo
       kagidi ise icerige gore uzar. Degisken ikisinde de ayni geometriden. */
    '--sayfa-yukseklik': mm(g.sayfaYukseklikMm),
    '--sayfa-sol': mm(g.solMm),
    '--sayfa-sag': mm(g.sagMm),
    '--sayfa-ust': mm(g.ustMm),
    '--sayfa-alt': mm(g.altMm),
    /* Satır yüksekliği YAZIDAN: Courier'de 1/6 inç, çift aralıklı Times'ta
       iki katı. Sabit `SATIR_MM` kalsaydı roman satırları üst üste binerdi. */
    '--satir': mm(satirYuksekligiMm(profil.yazi)),
    '--yazi': mm(YAZI_MM),
    /* Kapak başlığı gövdeden büyük; sayı TEK EVDE (`BASLIK_PUNTO`) ve
       ekran onu buradan okuyor — CSS'e gömülseydi PDF ile ıraksardı. */
    '--kapak-baslik': mm(YAZI_MM * (BASLIK_PUNTO / 12)),
    '--yazi-ailesi': profil.yazi.cssAilesi,
  };

  /* GENİŞLİK BİRİMİ YAZIYA BAĞLI. `ch` (karakter genişliği) yalnız
     eşgenişlikli yazıda anlamlı; orantılı yazıda `ch` "0" rakamının
     genişliğidir ve metnin gerçek genişliğiyle ilgisi yoktur — girintiler
     motorun ölçtüğü yere oturmaz ve §17'de yeni kapattığımız kayma geri
     gelirdi. */
  const ch = profil.yazi.esgenislik;
  const olcu = (sutun: number) => (ch ? `${sutun}ch` : mm(sutun * KARAKTER_MM));
  degiskenler['--sutun'] = olcu(IZGARA.sutun);
  /* İki sütunlu belgenin bölünmesi CSS DEĞİŞKENİNDEN: sabit olarak
     gömülseydi kullanıcı oranı değiştirdiğinde sütun çizgisi metnin
     ortasından geçerdi. */
  const b = profil.ikiSutun;
  degiskenler['--iki-sutun-sol'] = olcu(b.sol);
  degiskenler['--iki-sutun-sag'] = olcu(b.sag);
  degiskenler['--iki-sutun-ayrac'] = String((b.sol + b.oluk / 2) / IZGARA.sutun);
  for (const [tip, stil] of Object.entries(profil.bloklar) as [ScriptBlockType, BlokStili][]) {
    const { sol, sag } = girintiSutun(stil);
    degiskenler[girintiAdi(tip)] = olcu(sol);
    degiskenler[cekmeAdi(tip)] = olcu(sag);
    degiskenler[bosAdi(tip)] = `calc(${stil.oncekiBosSatir} * var(--satir))`;
  }
  return degiskenler;
}

/**
 * Blok tipi başına, profilden türetilen kural gövdesi.
 *
 * Girintiler VERİDİR (§6.4) — Tailwind sınıflarına gömülemez. F1b-3 öncesi
 * salt-okunur görüntüleyici `pl-16`/`pl-14`/`pl-10` yazıyordu; o sayılar
 * hiçbir ölçüye bağlı değildi ve profil değişince sessizce yanlış kalıyordu.
 */
export function blokKurallari(profil: FormatProfili): string {
  const satirlar: string[] = [];
  for (const [tip, stil] of Object.entries(profil.bloklar) as [ScriptBlockType, BlokStili][]) {
    const hiza = stil.hiza === 'sag' ? 'right' : stil.hiza === 'orta' ? 'center' : 'left';
    satirlar.push(
      /* YER TUTUCU: boş blokta preset adı sönük yazıyor.
         Etiket `BLOK_ETIKETLERI`'nden geliyor, elle yazılmıyor — blok adı
         değişince ekrandaki yazı da değişsin (Karar 2). `user-select:none`
         ve `pointer-events:none` şart: yer tutucu SEÇİLEBİLİR olsaydı
         kopyalanır ve belgeye yapıştırılabilirdi. */
      `.senaryo-metin [data-tip="${tip}"][data-bos]::before{` +
        `content:'${t(BLOK_ETIKETLERI[tip] ?? tip).replace(/'/gu, "\\'")}';` +
        `color:var(--mzn-kagit-sonuk,#a49d90);opacity:.45;` +
        /* AKIŞTA duruyor, `position:absolute` DEĞİL: mutlak konumlandırma
           yer tutucuyu bloğun girintisinden ve hizasından koparıyor, sayfada
           rastgele yerlerde görünüyordu (kullanıcı bildirimi). Akışta
           kaldığında satırın kendi girintisini ve hizasını miras alıyor. */
        `pointer-events:none;user-select:none;` +
        `}`,
      /* DÜZENLEME ŞERİDİ, blok tipi başına. Sol konum burada üretiliyor
         çünkü şeridin KAĞIDIN sol marjında durması gerekiyor ve bloğun
         kendi girintisi tipe göre değişiyor: sabit bir `left` yazılsaydı
         şerit diyalogda içeride, sahne başlığında dışarıda çıkardı. Aynı
         girinti değişkeni (`--girinti-*`) hem metni hem şeridi
         konumlandırıyor — ikinci bir kaynak yok (Karar 2). */
      `.senaryo-metin [data-tip="${tip}"].mzn-serit::after{` +
        `left:calc(-1 * var(--sayfa-sol) - var(${girintiAdi(tip)}) + var(--birim));` +
        `}`,
      `.senaryo-metin [data-tip="${tip}"]{` +
        `margin-left:var(${girintiAdi(tip)});` +
        `margin-right:var(${cekmeAdi(tip)});` +
        `margin-top:var(${bosAdi(tip)});` +
        `text-align:${hiza};` +
        `text-transform:${stil.buyukHarf ? 'uppercase' : 'none'};` +
        `font-weight:${stil.kalin ? '700' : '400'};` +
        `font-style:${stil.italik ? 'italic' : 'normal'};` +
        `}`,
    );
  }
  return satirlar.join('\n');
}

/**
 * Profilden bağımsız, sabit sayfa kuralları.
 *
 * `white-space: pre-wrap` — motorun sarma kuralıyla TAM örtüşmez ve bu
 * BİLİNÇLİ: motor ardışık boşlukları tek boşluğa indirir (§6.2), `pre-wrap`
 * korur. `normal` seçilseydi satır sonuna basılan boşluk ekranda hiç
 * görünmez, imleç ilerlemez ve yazmak kırılırdı. Ayrışma yalnız ARDIŞIK
 * boşlukta doğar; sayfa SAYISI zaten motordan geldiği için sayı hiçbir
 * durumda yalan söylemez, yalnız çizilen sınır çizgisinin YERİ kayar.

 * Kayma KÜMÜLATİFTİR, sabit değil: ardışık boşluk taşıyan her blok farkı
 * bir miktar daha büyütür. Ölçüldü — `'A' + 70 boşluk + 'B'` biçiminde 12
 * blok taşıyan bir senaryoda kesik çizgi gerçek içerikten ~12 satır (≈5 cm)
 * yukarıda çizilir. Yorumun eski hâli bunu "bir satır" diye tarif ediyordu;
 * okuyan kişi sınırın en fazla bir satır şaşabileceğini sanırdı.
 *
 * `overflow-wrap: anywhere` motorun "sütuna sığmayan tek kelime BÖLÜNÜR"
 * kuralının DOM karşılığıdır; olmazsa uzun kelime sayfayı taşırır.
 */
export const SABIT_SAYFA_CSS = `
.senaryo-yuzey{overflow:auto;display:flex;justify-content:center;
  /* align-items:flex-start ŞART.
     Flex'in varsayılanı stretch ve kağıdı YÜZEYİN yüksekliğine geriyordu:
     ÖLÇÜLDÜ — 90 satırlık bir belgede kağıt 526 px'te kalıyor, metin 2896 px
     oluyor ve ikinci sayfadan sonrası kağıdın DIŞINA, koyu zemine düşüyordu.
     Kullanıcı bunu gerçek pencerede gördü: "ikinci sayfaya geçince kanvas yok,
     şeffaf bir yüzeye yazıyor."
     Tek sayfalık belgelerde görünmüyordu çünkü içerik zaten yüzeyden kısaydı;
     hata belgeyi uzatan herkesi vuruyordu. */
  align-items:flex-start;
  padding:calc(7 * var(--birim)) calc(4 * var(--birim));background:var(--mzn-sayfa-alani,#0a0c0e);}
/* Yüzey artık BİRDEN ÇOK kağıt taşıyor (kapak + senaryo): sütun yönü ve
   yatay ortalama. align-items:flex-start yukarıdaki stretch tuzağı için
   satır yönünde şarttı; sütunda o eksen YATAY olduğu için center ile
   eziliyor ve dikey stretch zaten oluşmuyor. */
.senaryo-yuzey{flex-direction:column;align-items:center;
  /* SAFE center ŞART, düz center DEĞİL.
     İlk kural satır yönündeyken justify-content:center YATAY ortalıyordu;
     yön sütuna dönünce aynı bildirim DİKEY ortalamaya geçti ve kağıt
     yüzeyden uzun olduğunda ÜSTÜNÜ kırpıyordu — kırpılan kısım kaydırma
     ile de geri gelmiyor (taşan flex içeriğinde bilinen tuzak).
     ÖLÇÜLDÜ: iki sayfalık kısa bir belgede kağıdın tepesi yüzeyin 109 px
     üstünde kalıyor ve senaryonun İLK SATIRLARI hiç görünmüyordu; kağıt
     bomboş sanılıyordu (2026-08-30, sayfa başı turunda çıktı).
     'safe' taşma anında hizalamayı start'a düşürür: kısa belge ortada
     kalır, uzun belge baştan başlar. */
  justify-content:safe center;
  gap:calc(4 * var(--birim));}
/* ---- KAPAK SAYFASI (ilk sayfa, yerinde düzenlenir) ---------------- */
/* Kağıtla AYNI yüzey: genişlik, renk, gölge senaryo kağıdından. Fark
   yalnız SABİT yükseklik — kapakta içerik akmaz, sayfa hep tam boy. */
.kapak-kagit{position:relative;flex:0 0 auto;
  width:var(--sayfa-genislik);height:var(--sayfa-yukseklik);
  background:var(--mzn-kagit,#f7f5f0);color:var(--mzn-kagit-metin,#1c1a17);
  box-shadow:0 calc(1.6 * var(--birim)) calc(7 * var(--birim)) rgba(0,0,0,.55);}
/* Alanlar KAĞIDIN ÜSTÜNDE yüzer: konumları ORAN tablosundan geliyor (satır içi
   stil), ölçüleri buradan. Zemin şeffaf — kullanıcı bir form değil, SAYFA
   görüyor; kutu kenarlığı yalnız odaklanınca beliriyor. */
.kapak-alan{position:absolute;background:transparent;border:0;outline:0;
  font-family:var(--yazi-ailesi,'Courier Prime','Courier New',Courier,monospace);
  font-size:var(--yazi);line-height:var(--satir);color:inherit;
  padding:0 calc(.4 * var(--birim));margin:0;resize:none;overflow:hidden;}
.kapak-alan::placeholder{color:var(--mzn-kagit-sonuk,#a49d90);opacity:.65;}
.kapak-alan:focus{box-shadow:0 0 0 1px var(--mzn-amber,#e0932f);border-radius:2px;}
.kapak-alan[readonly]{cursor:default;}
.kapak-orta{left:var(--sayfa-sol);right:var(--sayfa-sag);
  width:auto;text-align:center;}
.kapak-baslik{font-weight:700;text-transform:uppercase;
  font-size:var(--kapak-baslik);line-height:1.2;}
.kapak-yazar{text-align:center;}
.kapak-yazan{position:absolute;left:var(--sayfa-sol);right:var(--sayfa-sag);
  text-align:center;font-family:var(--yazi-ailesi);font-size:var(--yazi);
  line-height:var(--satir);pointer-events:none;}
.kapak-sol{left:var(--sayfa-sol);width:45%;text-align:left;}
.kapak-sag{right:var(--sayfa-sag);width:35%;text-align:right;}
/* ---- DAKTİLO MODU ------------------------------------------------- */
/* STARC'ın ÜÇ ayrı ayarı tek pakette (kullanıcı kararı 2026-08-27):
   imleç ekranın ortasında kalır (kaydırma JS tarafında), yazılan satır
   vurgulanır, öteki paragraflar hafifçe söner. Üçü de aynı amaca hizmet
   ediyor ve pratikte birlikte açılıyor.

   Seçiciler ODAK MODUYLA aynı kancaları kullanıyor ([data-tip] ve
   .odakli, odak.ts'in verdiği dekorasyon): ikinci bir dekorasyon
   eklentisi yazmak aynı bilgiyi iki yerde hesaplamak olurdu (Karar 2).
   Sönme bir OPAKLIK değişimi, düzen değişimi DEĞİL — blokları gizlemek
   satır sonlarını kaydırır ve sayfa ≈ dakika sözleşmesi ekranda yalan
   söylerdi. Odak modundan farkı: orada sönme .28 (yalnız o satır okunur),
   burada .45 — yazarken çevre görünür kalmalı. */
.senaryo-yuzey[data-daktilo="acik"] .senaryo-metin [data-tip]{opacity:.45;
  transition:opacity 140ms ease-out;}
.senaryo-yuzey[data-daktilo="acik"] .senaryo-metin .odakli{opacity:1;
  /* Vurgu kağıdın KENDİ mürekkebinden: sabit bir renk açık ve koyu sayfa
     renklerinde farklı davranırdı (bkz. format/sayfa-rengi.ts). */
  background:color-mix(in srgb, currentColor 5%, transparent);
  box-shadow:0 0 0 calc(.4 * var(--birim)) color-mix(in srgb, currentColor 5%, transparent);}
/* Daktilo kaydırmasında kağıdın ALTINDA ekran boşluğu gerekiyor: son satır
   da ekranın ortasına gelebilmeli, yoksa belge sonunda imleç aşağıda kalır. */
.senaryo-yuzey[data-daktilo="acik"]::after{content:'';flex:0 0 auto;
  height:45vh;pointer-events:none;}
/* ---- SAHNE / DİYALOG NUMARASI ------------------------------------- */
/* Kenar boşluğunda, MUTLAK konumda: satır genişliğini ve satır sayısını
   etkilemiyor, yani sayfa sayısı bu ayardan bağımsız kalıyor. Numaralar
   dekorasyondan geliyor (editor/numara-eklenti.ts) — belgede yoklar,
   seçilemezler, kopyalanan metne karışmazlar. */
.senaryo-metin [data-no-sol]::before{content:attr(data-no-sol);
  position:absolute;left:calc(-1 * var(--sayfa-sol) + 0.6 * var(--birim));
  width:calc(var(--sayfa-sol) - 1.2 * var(--birim));text-align:right;
  color:var(--mzn-kagit-sonuk,#a49d90);pointer-events:none;user-select:none;}
.senaryo-metin [data-no-sag]::after{content:attr(data-no-sag);
  position:absolute;right:calc(-1 * var(--sayfa-sag) + 0.6 * var(--birim));
  width:calc(var(--sayfa-sag) - 1.2 * var(--birim));text-align:left;
  color:var(--mzn-kagit-sonuk,#a49d90);pointer-events:none;user-select:none;}
.senaryo-metin [data-no-sol],.senaryo-metin [data-no-sag]{position:relative;}
/* ---- REVİZYON İŞARETİ ---------------------------------------------- */
/* İşaretli satır: zemin revizyonun kâğıt renginde, sağ kenar boşluğunda
   yıldız. İKİSİ DE DÜZENİ DEĞİŞTİRMİYOR — zemin bir boya, yıldız mutlak
   konumda; satır genişliği ve satır sayısı aynı kalıyor, yani sayfa ≈
   dakika sözleşmesi bozulmuyor (numara ayarındaki kararın aynısı).

   Zemin OPAKLIKLA değil kâğıdın rengiyle karıştırılarak kuruluyor
   (color-mix): koyu sayfa renginde düz bir pastel zemin metni okunmaz
   kılardı.

   ORAN ÖLÇÜLDÜ, göz kararı değil. %26'da zemin kâğıttan ancak 18 birim
   ayrılıyordu ve gerçek uygulamada mavi yerine soluk gri okunuyordu
   (ekran görüntüsüyle doğrulandı). %50'de ayrım 35 birime çıkıyor, metin
   kontrastı 13,5:1 kalıyor — AAA gövde eşiği 7:1. Daha yükseği uzun bir
   revizyonda sayfayı alacalı gösterir. */
.senaryo-metin [data-revizyon]{position:relative;
  background:color-mix(in srgb, var(--revizyon-renk, #B8D4EE) 50%, transparent);
  box-shadow:0 0 0 calc(.3 * var(--birim))
    color-mix(in srgb, var(--revizyon-renk, #B8D4EE) 50%, transparent);}
.senaryo-metin [data-revizyon]::after{content:'*';
  position:absolute;right:calc(-1 * var(--sayfa-sag) + 0.6 * var(--birim));
  width:calc(var(--sayfa-sag) - 1.2 * var(--birim));text-align:left;
  color:var(--mzn-kagit-metin,#1c1a17);font-weight:700;
  pointer-events:none;user-select:none;}
.senaryo-metin [data-revizyon="beyaz"]{--revizyon-renk:#FFFFFF;}
.senaryo-metin [data-revizyon="mavi"]{--revizyon-renk:#B8D4EE;}
.senaryo-metin [data-revizyon="pembe"]{--revizyon-renk:#F7C6D8;}
.senaryo-metin [data-revizyon="sari"]{--revizyon-renk:#F3EA8F;}
.senaryo-metin [data-revizyon="yesil"]{--revizyon-renk:#BEDFB6;}
.senaryo-metin [data-revizyon="altin"]{--revizyon-renk:#F0CE6B;}
.senaryo-metin [data-revizyon="devetuyu"]{--revizyon-renk:#E8DBB4;}
.senaryo-metin [data-revizyon="somon"]{--revizyon-renk:#F5BE9A;}
.senaryo-metin [data-revizyon="visne"]{--revizyon-renk:#DFA3B6;}
.senaryo-metin [data-revizyon="tan"]{--revizyon-renk:#D9C0A3;}
/* ELLE SAYFA BAŞI (Ctrl+Enter) — Word'ün kesikli "Sayfa Sonu" çizgisi.

   İŞARET METNİN ÜSTÜNDE, yeni sayfanın başında DEĞİL: kullanıcı çizgiyi
   bıraktığı yerde görmeli, iki sayfa aşağıda değil. ::before kutunun
   İÇİNDE çiziliyor (position:relative + negatif üst kaydırma), çünkü
   bloğun kendi yüksekliğini artırmak metnin ızgara hizasını bozardı —
   sayfa motoru mm ile ölçüyor, ekran onu taklit etmek zorunda.

   Bu blok bir ŞABLON DİZGİSİNİN içinde: buraya ters tırnak KONULAMAZ,
   literali kapatır (ölçüldü, derleyici yedi hata verdi).

   Renk kâğıt metninin soluğu: çizgi bir NOT, metnin kendisi değil. */
.senaryo-metin [data-elle-sayfa]{position:relative;}
.senaryo-metin [data-elle-sayfa]::before{content:'';position:absolute;
  left:0;right:0;top:calc(-0.5 * var(--satir));height:0;pointer-events:none;
  border-top:1px dashed color-mix(in srgb, var(--mzn-kagit-metin,#1c1a17) 45%, transparent);}
.senaryo-metin [data-elle-sayfa]::after{content:var(--elle-sayfa-etiket,'SAYFA BAŞI');position:absolute;
  right:0;top:calc(-1.1 * var(--satir));
  font-size:calc(0.62 * var(--yazi));letter-spacing:.08em;
  color:color-mix(in srgb, var(--mzn-kagit-metin,#1c1a17) 55%, transparent);
  background:var(--mzn-kagit,#f7f5f0);padding:0 calc(.6 * var(--birim));
  pointer-events:none;user-select:none;}
/* Aynı blok hem revize hem sayfa başı olabilir; ::after'ı revizyon
   yıldızı kullanıyor. Çakışmada YILDIZ KAZANIR (sektör çıktısında
   revizyon işareti yasal bir işaret, sayfa başı yalnız düzen notu) ve
   kesikli çizgi tek başına kalır — yani ikisi de görünür kalır. */
.senaryo-metin [data-elle-sayfa][data-revizyon]::after{content:'*';
  right:calc(-1 * var(--sayfa-sag) + 0.6 * var(--birim));top:0;
  background:none;font-size:var(--yazi);letter-spacing:normal;
  color:var(--mzn-kagit-metin,#1c1a17);}
/* Kağıt odadaki TEK ışık: koyu kabukta tek gölgeli yüzey odur. Gölge
   kabukta yok, yalnız burada. */
/* SÜREKLİLİK SATIRI — belgede olmayan, sayfalayıcının ürettiği metin.
   pointer-events yok ŞART: düzenlenemez olduğu tip tanımında yazılı,
   tıklanabilir olsaydı kullanıcı imleci oraya koymayı dener ve olmayan
   bir satırı silmeye çalışırdı. */
.senaryo-sureklilik{position:absolute;left:var(--sayfa-sol);
  font-family:inherit;font-size:var(--yazi);line-height:var(--satir);
  pointer-events:none;user-select:none;opacity:.75;}
.senaryo-sureklilik[data-tur="devami-var"]{margin-left:calc(35 * var(--karakter));}
.senaryo-sureklilik[data-tur="devam"]{margin-left:calc(22 * var(--karakter));}
.senaryo-kagit{position:relative;flex:0 0 auto;width:var(--sayfa-genislik);
  background:var(--mzn-kagit,#f7f5f0);color:var(--mzn-kagit-metin,#1c1a17);
  padding:var(--sayfa-ust) var(--sayfa-sag) var(--sayfa-alt) var(--sayfa-sol);
  box-shadow:0 calc(1.6 * var(--birim)) calc(7 * var(--birim)) rgba(0,0,0,.55);}
.senaryo-metin{position:relative;width:var(--sutun);
  /* Yazı ailesi PROFİLDEN: motor hangi yazıyla ölçüyorsa ekran onu çizmeli,
     yoksa satır sayıları ıraksar (§17'de kapatılan kayma). */
  font-family:var(--yazi-ailesi,'Courier Prime','Courier New',Courier,monospace);
  font-size:var(--yazi);line-height:var(--satir);
  white-space:pre-wrap;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;
  /* BOŞ BELGE DE BİR KUTUDUR. İzleyici ve yorumcu rolünde ilk blok
     YAZILMIYOR (bilinçli: salt okur rol belgeyi değiştiremez) ve blok
     yoksa ProseMirror hiç çocuk çizmiyor — kutu sıfır yükseklikte kalıyor,
     yani kağıt açık ama metin alanı GÖRÜNMEZ. E2E'de yakalandı: yorumcu
     olarak katılan istemcide senaryo-editor kutusu "hidden" ölçülüyordu.
     Bir satırlık taban, düzeni hiçbir dolu belgede etkilemiyor. */
  min-height:var(--satir);
  outline:none;}
.senaryo-metin [data-tip]{margin-bottom:0;}
/* Sayfa üstbilgisi: solda proje, sağda sayfa numarası. Kağıdın kendi
   dilinde — sönük mürekkep, Courier. */
.senaryo-ustbilgi{position:absolute;left:var(--sayfa-sol);right:var(--sayfa-sag);
  top:calc(.42 * var(--sayfa-ust));display:flex;justify-content:space-between;
  font-family:'Courier Prime','Courier New',Courier,monospace;
  font-size:calc(.8 * var(--yazi));color:var(--mzn-kagit-sonuk,#a49d90);
  pointer-events:none;user-select:none;}
/* Sayfa BAŞINDAKİ blok öncesi boş satır bırakmaz — motor da yutuyor (§6.2).
   İlk blok her zaman sayfa başıdır; gerisini eklenti işaretler. */
.senaryo-metin [data-tip]:first-child{margin-top:0;}
/* Sayfa başındaki blok: önündeki boş satır düşer (yukarıdaki kural) VE
   önceki sayfanın kullanılmayan satırları kadar aşağı iner. Dolgu
   --sayfa-dolgu ile eklentiden geliyor; verilmezse 0, yani eski
   davranış. Böylece erken kapanan sayfanın kalanı ekranda da BOŞ görünür
   ve kağıt PDF ile aynı şeyi gösterir. */
/* ÖZGÜLLÜK ŞART: [data-tip] de yazılıyor.
   blokKurallari(profil) her blok tipi için .senaryo-metin [data-tip="x"]
   kuralı üretiyor ve o metin SABIT_SAYFA_CSS'ten SONRA ekleniyor. Eşit
   özgüllükte sonraki kazanır — yani sade .sayfa-basi kuralı SESSİZCE
   ÖLÜYDU (ölçüldü: sayfa başı bloğun hesaplanan margin-top'u 0 değil 16px
   çıktı; kural hiç uygulanmamış). Bir sınıf daha eklemek özgüllüğü
   0,3,0'a çıkarıyor.
   Bu blok bir ŞABLON DİZGİSİNİN içinde: ters tırnak literali kapatır. */
.senaryo-metin [data-tip].sayfa-basi{margin-top:calc(var(--sayfa-dolgu,0) * var(--satir));}
/* Odak modu: SÖNME bir opaklık değişimidir, düzen değişimi değil. Blokları
   gizlemek ya da daraltmak satır sonlarını ve sayfa sınırlarını kaydırır,
   sayfa ≈ dakika sözleşmesi ekranda yalan söylerdi. */
.senaryo-yuzey[data-odak="acik"] .senaryo-metin [data-tip]{opacity:.28;transition:opacity 140ms;}
.senaryo-yuzey[data-odak="acik"] .senaryo-metin .odakli{opacity:1;}
.senaryo-sinirlar{position:absolute;inset:0;pointer-events:none;}
.senaryo-sinir{position:absolute;left:0;right:0;border-top:1px dashed rgba(28,26,23,.22);}
/* Kenar işareti KAĞIDIN dışında, sol marjda: metnin içine girseydi satır
   sonlarını kaydırır ve sayfa sayısı ekranda yalan söylerdi. Köşe
   yuvarlaması yok — tasarımın tek istisnası durum noktalarıdır. */
.senaryo-im{position:absolute;left:calc(-.55 * var(--sayfa-sol));width:calc(.26 * var(--sayfa-sol));
  height:calc(.62 * var(--satir));pointer-events:auto;cursor:pointer;
  transition:transform 120ms;}
.senaryo-im:hover{transform:scaleX(1.5);}
.senaryo-im[data-renk="sarı"]{background:#d8a41a;}
.senaryo-im[data-renk="kırmızı"]{background:#c2453a;}
.senaryo-im[data-renk="mavi"]{background:#3a6fc2;}
.senaryo-im[data-renk="yeşil"]{background:#3f8f52;}
.senaryo-im[data-renk="mor"]{background:#8a4fbf;}
/* ── ORTAK ÇALIŞMA ───────────────────────────────────────────────────
   Uzak yazarın imleci, seçimi ve düzenleme şeridi. Renk her yazara özel ve
   JS'ten geliyor (--imlec-renk / --serit-renk); burada duran yalnız
   GEOMETRİ. Üçü de kağıda BASILMAZ: PDF metinden çiziliyor, DOM'dan değil.

   HİÇBİRİ AKIŞA GENİŞLİK EKLEMEZ. İmleç kökü boş bir inline ve içindeki
   her şey mutlak konumlu; şerit ::after. Akışta yer kaplayan bir imleç
   satır sonlarını kaydırır ve sayfa sayısı ekranda yalan söylerdi (§6.2). */
.senaryo-metin .mzn-imlec{position:relative;display:inline;}
.senaryo-metin .mzn-imlec::before{content:'';position:absolute;left:-1px;top:-.1em;
  width:2px;height:1.2em;background:var(--imlec-renk);pointer-events:none;}
/* Ad etiketi imlecin ÜSTÜNDE — yanında olsaydı yazılan harfi kapatırdı.
   text-transform ve font-style AÇIKÇA sıfırlanıyor: sahne başlığı ve
   karakter blokları versal, parantez içi italik; miras alsaydı ad bağırır
   ya da eğilirdi. Kişi adı bir blok tipi değildir. */
.senaryo-metin .mzn-imlec-ad{position:absolute;left:-1px;bottom:1.15em;
  padding:0 .35em;white-space:nowrap;font-size:.62em;line-height:1.35;
  font-family:var(--mzn-yazi,'IBM Plex Sans Condensed',ui-sans-serif,sans-serif);
  text-transform:none;font-style:normal;font-weight:500;
  background:var(--imlec-renk);color:${ETIKET_YAZISI};
  pointer-events:none;user-select:none;}
/* Şerit: bloğun sol marjında 2 px. Dört saniye tam parlaklıkta durur,
   sonra data-serit-solan ile söner — sönme bir GEÇİŞ, animasyon değil:
   animasyon aynı bloğa yeniden yazıldığında baştan başlamaz, geçiş
   özniteliği geri alındığı an kendiliğinden geri döner. */
.senaryo-metin .mzn-serit{position:relative;}
.senaryo-metin .mzn-serit::after{content:'';position:absolute;top:0;bottom:0;width:2px;
  background:var(--serit-renk);opacity:1;transition:opacity ${SERIT_SOLMA_MS}ms linear;
  pointer-events:none;}
.senaryo-metin .mzn-serit[data-serit-solan]::after{opacity:0;}
.senaryo-sinir span{position:absolute;right:calc(.5 * var(--sayfa-sag));
  top:calc(-1.15 * var(--satir));font-size:calc(.8 * var(--yazi));
  font-family:'Courier Prime','Courier New',Courier,monospace;color:var(--mzn-kagit-sonuk,#a49d90);}
`;

/**
 * Her bloğun İLK GÖRÜNÜR satırının, belgenin başından itibaren satır ofseti.
 *
 * Sayfa sınırlarıyla AYNI kaynaktan (`sayfala` çıktısı) türetiliyor: kenar
 * işaretinin yeri ile sayfa numarasının yeri aynı hesabı paylaşmazsa ikisi
 * ekranda birbirinden kayar ve hangisinin doğru olduğu anlaşılmaz (Karar 34
 * ile aynı gerekçe, bir katman aşağıda).
 *
 * Ayırıcı satırlar (`satirIndex < 0`) ATLANIYOR: işaret bloğun boşluğuna
 * değil METNİNE hizalanmalı.
 */
export function blokSatirOfsetleri(
  sayfalar: readonly Sayfa[],
  satirSayisi: number,
): Map<string, number> {
  const ofsetler = new Map<string, number>();
  for (const sayfa of sayfalar) {
    /* OFSET FİZİKSEL SAYFADAN, akan satır toplamından DEĞİL. Erken kapanan
       bir sayfanın (elle sayfa başı, yetim koruması) kalan satırları
       ekranda da yer kaplıyor; kenar işaretleri metinle birlikte inmezse
       yer imi kendi satırının üstünde kalırdı. */
    let ofset = (sayfa.no - 1) * satirSayisi;
    for (const satir of sayfa.satirlar) {
      if (satir.satirIndex >= 0 && !ofsetler.has(satir.blockId)) {
        ofsetler.set(satir.blockId, ofset);
      }
      ofset++;
    }
  }
  return ofsetler;
}

/** Sayfa sınırının ekranda nereye çizileceğini anlatan kayıt. */
export interface SayfaSiniri {
  /** Sınırın BAŞLATTIĞI sayfa numarası (ilk sayfanın sınırı yoktur). */
  sayfaNo: number;
  /** Sınırın oturduğu blok. */
  blockId: string;
  /** Blok içinde kaçıncı satırda — 0 ise blok sınırında. */
  satirIndex: number;
  /**
   * Metin bloğunun tepesinden kaç SATIR aşağıda.
   *
   * DOM ÖLÇÜLMEZ (`offsetTop`, `getBoundingClientRect`, `ResizeObserver` yok).
   * Her satır tam `SATIR_MM` yüksekliğinde ve sayfa başı blokların önündeki
   * boş satırlar hem motorda hem ekranda düşürüldüğü için DOM satır sayısı
   * motorunkiyle BİREBİRDİR; ofset saf toplamdan çıkar. Ölçüme dönmek,
   * §6.2'nin "sayfalama aritmetiktir, DOM ölçümü gerekmez" kuralını
   * render tarafından geri deldirmek olurdu.
   */
  satirOfseti: number;
}

/**
 * Motorun sayfalarını, ekranda çizilecek sınırlara çevirir.
 *
 * SAYFA SAYISI EKRANDAN TÜRETİLMEZ (Karar 34): sınırlar `sayfala`'nın
 * çıktısından okunur, `ceil(domYukseklik / sayfaYukseklik)` gibi ikinci bir
 * hesap yoktur. §6.2 "editör, PDF ve analiz aynı sayıyı verir" sözleşmesi
 * ancak tek kaynak varsa YAPISAL kalır.
 *
 * `satirIndex` KISKAÇLANMAZ. Önce `Math.max(0, …)` yazılmıştı; ölçüldü ki
 * hiçbir test onu öldürmüyor — çünkü `sayfala` sayfayı, boşluklar + en az bir
 * gövde satırı sığmıyorsa ÖNCEDEN kapatıyor, dolayısıyla bir sayfa ayırıcı
 * satırla başlayamıyor. Ama kıskaç yalnız ölü değil, tetiklense YANLIŞ olurdu:
 * `-1`'i `0`'a çekmek o bloğu SAYFA BAŞI sayardı ve motorun KORUDUĞU boşluğu
 * ekranda düşürürdü. Değeri olduğu gibi taşımak, o durumda doğru davranışı
 * kendiliğinden verir.
 */
export function sayfaSinirlari(
  sayfalar: readonly Sayfa[],
  satirSayisi: number,
): SayfaSiniri[] {
  const sinirlar: SayfaSiniri[] = [];
  for (let i = 1; i < sayfalar.length; i++) {
    const ilk = sayfalar[i].satirlar[0];
    if (!ilk) continue;
    sinirlar.push({
      sayfaNo: sayfalar[i].no,
      blockId: ilk.blockId,
      satirIndex: ilk.satirIndex,
      /* SAYFA i HER ZAMAN i*satirSayisi'de başlar. Eskiden akan satır
         toplamıydı ve sayfa dolu kapandığı sürece aynı sayıyı veriyordu;
         erken kapanan sayfada (elle sayfa başı, yetim koruması) sınır
         metnin ortasına düşüyor, kağıdın kalan yarısı boş kalıyordu. */
      satirOfseti: i * satirSayisi,
    });
  }
  return sinirlar;
}

/**
 * Sayfa başındaki blokların önüne konacak DOLGU satır sayısı.
 *
 * Ekranda kağıt sürekli bir yüzey; satırlar akıyor. Bir sayfa erken
 * kapandığında (kullanıcı Ctrl+Enter dedi ya da yetim koruması sahne
 * başlığını attı) sonraki blok akışta hemen alta geliyordu — PDF'te
 * yeni sayfanın tepesinde olan blok ekranda önceki sayfanın ortasında
 * duruyordu. Dolgu bu farkı kapatıyor.
 *
 * Yalnız POZİTİF dolgular dönüyor: sıfır olanı yazmak her sayfa başına
 * karşılıksız bir stil eklerdi.
 */
/** Ekranda çizilecek süreklilik satırı. */
export interface SureklilikSatiri {
  anahtar: string;
  metin: string;
  /** Kâğıdın tepesinden kaç satır aşağıda. */
  satirOfseti: number;
  tur: 'devami-var' | 'devam';
}

/**
 * SÜREKLİLİK SATIRLARININ EKRAN KONUMLARI.
 *
 * Bu satırlar BELGEDE YOK — sayfalayıcı üretiyor (bkz. `SayfaSatiri.
 * surekliligi`). Ama yer KAPLIYORLAR: ekranın blok konumları da aynı
 * sayfalardan türediği için satırlar sayılıyor, yalnız çizilmiyordu.
 * Sonuç: ayar açıkken PDF'te "(DEVAMI VAR)" yazan yerde ekranda BOŞLUK
 * kalıyordu — "gördüğün şey basılan şeydir" sözünün kırıldığı yer
 * (ajan taraması 2026-08-31).
 *
 * Sayfa sınırlarıyla AYNI ofset kaynağı kullanılıyor; ayrı hesaplansaydı
 * ikisi ekranda birbirinden kayardı.
 */
export function sureklilikSatirlari(
  sayfalar: readonly Sayfa[],
  satirSayisi: number,
): SureklilikSatiri[] {
  const cikti: SureklilikSatiri[] = [];
  for (const sayfa of sayfalar) {
    const taban = (sayfa.no - 1) * satirSayisi;
    sayfa.satirlar.forEach((satir, i) => {
      if (!satir.surekliligi) return;
      cikti.push({
        anahtar: `${sayfa.no}-${i}`,
        metin: satir.metin,
        satirOfseti: taban + i,
        tur: satir.surekliligi,
      });
    });
  }
  return cikti;
}

export function sayfaDolgulari(
  sayfalar: readonly Sayfa[],
  satirSayisi: number,
): Map<string, number> {
  const dolgular = new Map<string, number>();
  for (let i = 1; i < sayfalar.length; i++) {
    const ilk = sayfalar[i].satirlar[0];
    /* Blok ORTASINDA bölünen sayfada dolgu YOK: blok zaten önceki sayfada
       başladı, kendi satırları boşluğu doldurdu. */
    if (!ilk || ilk.satirIndex !== 0) continue;
    const dolgu = satirSayisi - sayfalar[i - 1].satirlar.length;
    if (dolgu > 0) dolgular.set(ilk.blockId, dolgu);
  }
  return dolgular;
}

export interface Sayaclar {
  kelime: number;
  karakter: number;
  sayfa: number;
}

/**
 * Metnin kelime ve karakter sayısı.
 *
 * NFC — `sarmala` ile aynı gerekçe (§6.2): NFD gelen Türkçe harf iki kod
 * birimi sayılır ve karakter sayacı görünüşte aynı metin için farklı sayı
 * verir. Bu, format modülüne ÜÇÜNCÜ bir metin giriş noktasıdır; §6.2'nin
 * tetik koşullu borcu burada tetiklenmiştir ve normalizasyon giriş noktasına
 * konmuştur.
 */
export function metinSayaclari(metin: string): { kelime: number; karakter: number } {
  const nfc = metin.normalize('NFC');
  return {
    kelime: nfc.split(/\s+/).filter(Boolean).length,
    karakter: nfc.length,
  };
}

/**
 * `sayfalar` DIŞARIDAN verilebilir: editör eklentisi sayfaları zaten
 * hesaplıyor, ikinci kez sayfalamak uzun senaryoda tuş başına ödenen bir
 * bedel olurdu. Verilmezse burada hesaplanır — sayfa sayısı HER İKİ durumda
 * da `sayfala`'dan gelir, ikinci bir formül yoktur (Karar 34).
 */
export function sayaclar(
  bloklar: readonly ScriptBlock[],
  profil: FormatProfili,
  sayfalar: readonly Sayfa[] = sayfala(bloklar, profil),
): Sayaclar {
  let kelime = 0;
  let karakter = 0;
  for (const b of bloklar) {
    const s = metinSayaclari(b.text);
    kelime += s.kelime;
    karakter += s.karakter;
  }
  /* Dışarıdan verilen `sayfalar` AYNI bloklardan gelmiş olmalı. Bayat ya da
     başka profille üretilmiş bir liste geçirilirse durum çubuğundaki "N
     sayfa" sessizce yalan söylerdi — ne hata ne uyarı. Ucuz denetim: sayfa
     satırlarındaki blok kimlikleri bloklar kümesinin içinde mi. */
  if (sayfalar.length) {
    const kimlikler = new Set(bloklar.map((b) => b.id));
    for (const sy of sayfalar) {
      for (const l of sy.satirlar) {
        if (!kimlikler.has(l.blockId)) {
          throw new Error(`Sayac sayfalari BASKA bir senaryodan: ${l.blockId}`);
        }
      }
    }
  }
  return { kelime, karakter, sayfa: sayfalar.length };
}

/**
 * İKİ SÜTUNLU BELGE (§6.6) — ekran kuralları.
 *
 * Kağıt, marj ve satır yüksekliği tek sütunlu sayfayla AYNI değişkenlerden
 * geliyor (`--satir`, `--sayfa-*`): §6.6'nın "ortak olan" listesi tam olarak
 * bu — kağıt geometrisi, Courier, ızgara disiplini. Ayrı bir ölçü seti
 * kursaydık iki belge türü aynı kağıda farklı basardı.
 */
/* Sayılar `IKI_SUTUN` ve `AYIRICI_SATIR` sabitlerinden ENJEKTE ediliyor:
   elle yazılsaydı sütun bölünmesi değiştiğinde ekran ile sayfalayıcı
   sessizce ıraksardı (Karar 2). */
export const IKI_SUTUN_CSS = `
.senaryo-kagit.iki-sutun{display:flex;flex-direction:column;gap:calc(${AYIRICI_SATIR} * var(--satir));}
.iki-sutun-satir{position:relative;display:block;}
.iki-sutun-satir textarea{
  display:block;border:0;padding:0;margin:0;resize:none;
  /* İÇERİĞE GÖRE BÜYÜR. Yükseklik sayfalayıcıdan sabitlenirken metin
     KIRPILIYORDU: tarayıcının sarması ile sarmala() bir satır ayrışabiliyor
     (boşluk işleme farkı) ve fark metnin başını görünmez yapıyordu. Yazının
     ekranda kaybolması kabul edilemez — sayfa SAYISI yine sayfalayıcıdan
     geliyor (Karar 34), kutu yüksekliği ise içeriğin kendisinden. */
  field-sizing:content;overflow:hidden;
  background:transparent;color:var(--mzn-kagit-metin);
  /* Yazı tipi ACIKCA yazılıyor, font:inherit ile DEĞİL.
     ÖLÇÜLDÜ: inherit ile kutu arayüz yazı tipini 16px alıyordu (Courier
     değil) — karakter genişliği 11.68px çıkıyor, satıra 42 karakter
     sığıyordu ve sayfalayıcının saydığı 28 sütunla ıraksıyordu. Ekran ile
     PDF'in aynı sayıyı vermesi buna bağlı. Tek sütunlu .senaryo-metin
     ile AYNI üçlü. */
  font-family:'Courier Prime','Courier New',Courier,monospace;
  font-size:var(--yazi);line-height:var(--satir);
  white-space:pre-wrap;overflow-wrap:anywhere;outline:none;
}
.iki-sutun-satir textarea::placeholder{color:var(--mzn-kagit-sonuk);}
/* Presetlerin görünümü — Amerikan formatın dili, sağ sütuna sığdırılmış.
   Ayrımı GİRİNTİ ve BİÇİM yapıyor, etiket değil: okuyucu üç satırın
   hangisinin kim, hangisinin nasıl, hangisinin ne olduğunu bir bakışta
   ayırt etmeli. */
.iki-sutun-scene{text-transform:uppercase;font-weight:700;}
.iki-sutun-character{text-transform:uppercase;}
.iki-sutun-parenthetical{font-style:italic;}
.iki-sutun-transition{text-transform:uppercase;}
/* Preset seçici satırın SOL kenarında, kağıdın dışında — kağıda basılan
   şey metindir, denetim değil. */
.iki-sutun-preset{
  height:18px;border:0;background:transparent;
  font-family:var(--mzn-yazi);font-size:10px;color:var(--mzn-kagit-sonuk);
  cursor:pointer;max-width:96px;
}
.iki-sutun-preset:hover{color:var(--mzn-kagit-metin);}
/* SÜTUN AYRACI sayfanın tamamında, tek bir dikey çizgi.
   Girdiler kaskat indiği için satır satır beliren bir ayraç kesik kesik
   görünürdü; oysa iki sütun belgenin TÜMÜ boyunca vardır — okuyucu hangi
   sütunda olduğunu satıra bakmadan bilmeli. Kağıda BASILMIYOR: PDF yolu
   yalnız metin çiziyor, bu ekran yardımı. */
.senaryo-kagit.iki-sutun{position:relative;}
.senaryo-kagit.iki-sutun::before{
  content:'';position:absolute;top:var(--sayfa-ust);bottom:var(--sayfa-alt);
  left:calc(var(--sayfa-sol) + (var(--sayfa-genislik) - var(--sayfa-sol) - var(--sayfa-sag))
       * var(--iki-sutun-ayrac));
  width:1px;background:var(--mzn-kagit-sonuk);opacity:.28;
}
.iki-sutun-eylem{position:absolute;right:calc(-1 * var(--sayfa-sag) + 2px);top:0;
  display:flex;gap:2px;opacity:0;transition:opacity 150ms;}
.iki-sutun-satir:hover .iki-sutun-eylem,
.iki-sutun-satir:focus-within .iki-sutun-eylem{opacity:1;}
.iki-sutun-eylem button{display:flex;align-items:center;justify-content:center;
  width:18px;height:18px;color:var(--mzn-kagit-sonuk);}
.iki-sutun-eylem button:hover{color:var(--mzn-kagit-metin);}
.iki-sutun-eylem button[data-yikici]:hover{color:#a8443c;}
.iki-sutun-kuyruk{display:flex;gap:6px;padding-top:calc(2 * var(--satir));}
.iki-sutun-bos{color:var(--mzn-kagit-sonuk);display:flex;flex-direction:column;gap:12px;}
.iki-sutun-bos b{color:var(--mzn-kagit-metin);}
.iki-sutun-bos-eylem{display:flex;gap:6px;padding-top:8px;}
/* Sayfa sınırı tek sütunlu sayfadakiyle AYNI dil. */
.iki-sutun-sinir{position:relative;height:0;border-top:1px dashed var(--mzn-kagit-sonuk);
  margin:calc(1 * var(--satir)) 0;}
.iki-sutun-sinir span{position:absolute;right:0;top:calc(-.75 * var(--satir));
  font-size:calc(.62 * var(--yazi));color:var(--mzn-kagit-sonuk);}
`;
