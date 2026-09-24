import React, { useMemo } from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { senaryoyuCozumle, enUzunYokluk, type SahneIstatistigi } from '../../model/analiz';
import { KATMANLAR, KATMAN_ADLARI, ZAMAN_ADLARI, type ZamanKatmani } from '../../model/zaman-katmani';
import type { ZamanAnahtar } from '../../format/terim';
import { blogaGit } from '../../store/mod';

/**
 * ANALİZ PANOSU — tam ekran genel bakış.
 *
 * Kullanıcı kararı (2026-08-29): pano ÖLÇER, tavsiye vermez. "Senaryonda
 * sorun var" demez; sayar ve gösterir, yorumu yazar yapar.
 *
 * ## Neden tam ekran, neden ızgara
 *
 * On ölçü aynı anda görünüyor; pano bir BAŞLATICI. Bir grafiğe tıklamak
 * onu tam ekran açacak (sonraki aşama) — genel bakışta her hücre özet
 * taşıyor, bütün ayrıntıyı değil.
 *
 * Halkalar sol rayda alt alta toplandı: parça/bütün ölçüleri birbirine
 * benziyor ve dağıtıldıklarında göz her seferinde yeniden ölçek arıyordu.
 *
 * ## Renkler
 *
 * Veri renkleri renk körlüğü denetiminden GEÇMİŞ dizidir (bkz. tasarım
 * kanvası). Amber veri rengi DEĞİL — yalnız vurgu; aynı rengin hem
 * "seçili" hem "bir seri" demesi okuma hatası üretiyordu.
 */

/* Doğrulanmış kategorik dizi — SABİT sıra, asla döngüsel değil. */
const SERI = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/* Karşılaşma yoğunluğu: yeşil → kırmızı, dört kova. Sayı zaten dairenin
   içinde ve boyut da aynı şeyi kodluyor — renk üçüncü, yedek kanal. */
const YOGUNLUK = ['#199e70', '#c9c024', '#e07b1c', '#c22f2f'];
const YOGUNLUK_YAZI = ['#eef1f5', '#16120b', '#16120b', '#eef1f5'];
const kova = (n: number) => (n <= 3 ? 0 : n <= 6 ? 1 : n <= 10 ? 2 : 3);

const KATMAN_RENGI: Record<ZamanKatmani, string> = {
  simdi: '#2f3a47', geri: '#9085e9', ileri: '#199e70', hayal: '#d55181',
};

/** Halka dilimi — dış ve iç yarıçap arasında bir yay. */
function yay(a0: number, a1: number, rd = 70, ri = 44, cx = 88, cy = 88): string {
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  /* TAM ÇEMBER İKİ YAYA BÖLÜNÜYOR.
     SVG yayı başlangıç ve bitiş noktası ÇAKIŞTIĞINDA hiçbir şey çizmez —
     360°'lik bir dilim tam olarak budur. Sonuç: tek değerli her halka
     (tek mekân, tek karakter, tek zaman katmanı) BOŞ çıkıyordu; grafik
     yok olunca "veri yok" değil "bir şey bozuldu" gibi okunuyordu
     (kullanıcı bildirimi 2026-08-30). En sık hâl bu: yeni bir senaryoda
     her dağılım tek değerlidir. */
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const orta = a0 + Math.PI;
    return `${yay(a0, orta, rd, ri, cx, cy)} ${yay(orta, a1, rd, ri, cx, cy)}`;
  }
  const buyuk = a1 - a0 > Math.PI ? 1 : 0;
  const [x1, y1] = p(rd, a0), [x2, y2] = p(rd, a1);
  const [x3, y3] = p(ri, a1), [x4, y4] = p(ri, a0);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${rd} ${rd} 0 ${buyuk} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
    + `L${x3.toFixed(1)} ${y3.toFixed(1)}A${ri} ${ri} 0 ${buyuk} 0 ${x4.toFixed(1)} ${y4.toFixed(1)}Z`;
}

interface Dilim { ad: string; deger: number; renk: string; sec?: Secim }

/**
 * DETAY SEÇİMİ — hangi grafikte neye tıklandı.
 *
 * Tek birlik, çünkü detay panelinin cevabı hep aynı soruya: "bu ölçünün
 * arkasındaki sahneler hangileri". Her grafiğe ayrı bir detay bileşeni
 * yazmak aynı listeyi altı kez yazmak olurdu.
 */
export type Secim =
  | { tur: 'cift'; a: string; b: string }
  | { tur: 'mekan'; yer: string }
  | { tur: 'katman'; katman: ZamanKatmani }
  | { tur: 'karakter'; ad: string }
  | { tur: 'zaman'; zaman: ZamanAnahtar | 'bilinmiyor' }
  | { tur: 'mekanTipi'; ic: boolean };

/** Seçimi başlığa ve sahne listesine çevirir — TEK ev (Karar 2). */
function secimiCoz(
  analiz: ReturnType<typeof senaryoyuCozumle>,
  secim: Secim,
): { baslik: string; alt: string; sahneler: number[] } {
  const sira = (yordam: (s: SahneIstatistigi) => boolean) =>
    analiz.sahneler.filter(yordam).map((x) => x.sira);

  switch (secim.tur) {
    case 'cift': {
      const k = analiz.ciftler.find(
        (c) => (c.a === secim.a && c.b === secim.b) || (c.a === secim.b && c.b === secim.a),
      );
      return {
        baslik: `${secim.a} ⟷ ${secim.b}`,
        alt: t('paylaşılan sahne'),
        sahneler: k?.sahneler ?? [],
      };
    }
    case 'mekan':
      return {
        baslik: secim.yer || t('(başlıksız)'),
        alt: t('mekân'),
        sahneler: analiz.mekanlar.find((m) => m.yer === secim.yer)?.sahneler ?? [],
      };
    case 'katman':
      return {
        baslik: t(KATMAN_ADLARI[secim.katman]),
        alt: t('anlatı düzlemi'),
        sahneler: sira((x) => x.katman === secim.katman),
      };
    case 'karakter':
      return {
        baslik: secim.ad,
        alt: t('konuştuğu sahneler'),
        sahneler: analiz.karakterler.find((k) => k.ad === secim.ad)?.sahneler ?? [],
      };
    case 'zaman':
      return {
        baslik: t(ZAMAN_ADLARI[secim.zaman]),
        alt: t('günün saati'),
        sahneler: sira((x) => (x.zaman ?? 'bilinmiyor') === secim.zaman),
      };
    case 'mekanTipi':
      return {
        baslik: secim.ic ? t('iç') : t('dış'),
        alt: t('mekân tipi'),
        /* `ic === undefined` başlıksız/tanınmayan sahnedir ve İKİSİNE DE
           girmez: bilinmeyeni bir kovaya atmak veri uydurmaktır. */
        sahneler: sira((x) => x.ic === secim.ic),
      };
  }
}

/**
 * Halka. Toplam sıfırsa dilim ÇİZİLMEZ ama bileşen kaybolmaz: boş bir
 * senaryoda grafiğin yok olması "veri yok" değil "bir şey bozuldu" gibi
 * okunur.
 */
function Halka({ dilimler, orta, altYazi, boy = 116 }: {
  dilimler: Dilim[]; orta: string; altYazi: string; boy?: number;
}) {
  const toplam = dilimler.reduce((s, d) => s + d.deger, 0);
  let a = -Math.PI / 2;
  const yollar = dilimler.map((d) => {
    const a0 = a;
    a += toplam > 0 ? (d.deger / toplam) * Math.PI * 2 : 0;
    return { ...d, yol: yay(a0, a) };
  });
  return (
    <svg width={boy} height={boy} viewBox="0 0 176 176" aria-hidden>
      {toplam === 0 && (
        <circle cx={88} cy={88} r={57} fill="none" stroke="var(--mzn-kenar-ic, #1e232a)" strokeWidth={26} />
      )}
      {yollar.map((y) => (
        <path key={y.ad} d={y.yol} fill={y.renk} stroke="var(--mzn-zemin, #0a0c0e)" strokeWidth={2} />
      ))}
      <text x={88} y={86} textAnchor="middle" className="mzn-sayi" fill="currentColor" fontSize={24}>{orta}</text>
      <text x={88} y={103} textAnchor="middle" fill="#6b7381" fontSize={10} letterSpacing={1.4}>{altYazi}</text>
    </svg>
  );
}

/** Halka + yanında okunur liste. Efsanesiz halka renk bilmecesi olurdu. */
function HalkaBolum({
  baslik, alt, dilimler, orta, altYazi, oku, onSec,
}: {
  baslik: string; alt: string; dilimler: Dilim[]; orta: string; altYazi: string;
  oku?: string; onSec?: (secim: Secim) => void;
}) {
  const toplam = dilimler.reduce((s, d) => s + d.deger, 0);
  return (
    <section className="flex flex-1 flex-col border-b border-kenar-ic px-4 py-3 last:border-b-0">
      <h3 className="mzn-etiket">{baslik}</h3>
      <p className="mt-0.5 text-[11px] text-metin-cok-zayif">{alt}</p>
      <div className="flex flex-1 items-center gap-4">
        <Halka dilimler={dilimler} orta={orta} altYazi={altYazi} />
        <ul className="min-w-0 flex-1 space-y-1">
          {dilimler.map((d) => (
            <li key={d.ad}>
              {/* Efsane satırı bir DÜĞMEDİR: dilime karşılık gelen sahneler
                  detayda açılıyor. Halkanın kendisi tıklanabilir olsaydı
                  ince dilimler ulaşılamaz kalırdı — 5 piksellik bir yayı
                  fareyle vurmak kullanıcının işi değil. */}
              <button
                type="button"
                disabled={!d.sec || !onSec}
                data-testid={d.sec ? `halka-sec-${d.ad}` : undefined}
                onClick={() => d.sec && onSec?.(d.sec)}
                className="flex w-full items-center gap-1.5 text-left enabled:hover:text-metin"
              >
                <span className="size-2.5 shrink-0" style={{ background: d.renk }} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-metin-zayif">{d.ad}</span>
                <span className="mzn-sayi text-[10px] text-metin-cok-zayif">
                  {toplam > 0 ? `%${Math.round((d.deger / toplam) * 100)}` : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {oku && <p className="text-[11px] text-metin-cok-zayif">{oku}</p>}
    </section>
  );
}

/**
 * Yan yana iki küçük halka. Aynı soruya ait iki dağılım (mekân tipi ve
 * günün saati) tek bölümde; ayrı bölümler sol rayı taşırıyordu.
 */
function IkiliHalka({ baslik, alt, sol, sag, oku, onSec }: {
  baslik: string; alt: string; sol: Dilim[]; sag: Dilim[];
  oku?: string; onSec?: (secim: Secim) => void;
}) {
  const efsane = (dilimler: Dilim[]) => (
    <ul className="space-y-0.5">
      {dilimler.map((d) => (
        <li key={d.ad}>
          <button
            type="button"
            disabled={!d.sec || !onSec}
            data-testid={d.sec ? `halka-sec-${d.ad}` : undefined}
            onClick={() => d.sec && onSec?.(d.sec)}
            className="flex w-full items-center gap-1.5 text-left enabled:hover:text-metin"
          >
            <span className="size-2 shrink-0" style={{ background: d.renk }} />
            <span className="truncate text-[10px] text-metin-zayif">{d.ad}</span>
            <span className="mzn-sayi text-[10px] text-metin-cok-zayif">{d.deger}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="flex flex-1 flex-col border-b border-kenar-ic px-4 py-3 last:border-b-0">
      <h3 className="mzn-etiket">{baslik}</h3>
      <p className="mt-0.5 text-[11px] text-metin-cok-zayif">{alt}</p>
      <div className="flex flex-1 items-center justify-around gap-2">
        <div className="flex flex-col items-center gap-1.5">
          <Halka dilimler={sol} orta="" altYazi="" boy={82} />
          {efsane(sol)}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <Halka dilimler={sag} orta="" altYazi="" boy={82} />
          {efsane(sag)}
        </div>
      </div>
      {oku && <p className="text-[11px] text-metin-cok-zayif">{oku}</p>}
    </section>
  );
}

/** Nokta dizisi — sıralama ölçüleri için. Çubuktan sakin, aynı bilgi. */
function NoktaDizisi({ satirlar, onSec }: {
  satirlar: { ad: string; deger: string; oran: number; renk: string; sec?: Secim }[];
  onSec?: (secim: Secim) => void;
}) {
  return (
    <ul className="flex flex-1 flex-col justify-center gap-4">
      {satirlar.map((s) => (
        <li
          key={s.ad}
          role={s.sec ? 'button' : undefined}
          data-testid={s.sec ? `nokta-sec-${s.ad}` : undefined}
          onClick={() => s.sec && onSec?.(s.sec)}
          className={`flex items-center gap-2 ${s.sec ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
          <span className="mzn-sayi w-14 shrink-0 truncate text-right text-[10px] text-metin-zayif">{s.ad}</span>
          <span className="relative flex h-3.5 flex-1 items-center">
            <span className="absolute inset-x-0 h-px bg-kenar-ic" />
            <span className="absolute left-0 h-0.5 opacity-50" style={{ width: `${s.oran * 100}%`, background: s.renk }} />
            <span
              className="absolute size-3 rounded-full"
              style={{ left: `${s.oran * 100}%`, marginLeft: -6, background: s.renk, boxShadow: '0 0 0 2px var(--mzn-zemin, #0a0c0e)' }}
            />
          </span>
          <span className="mzn-sayi w-8 shrink-0 text-right text-[11px] text-metin-guclu">{s.deger}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Çizgi grafiği — akış ölçüleri için.
 *
 * Veri ÖBEKLENİYOR: 41 sahne dar bir hücreye sığmıyor, çizgi testere dişi
 * gürültüye dönüşüp ritmi gizliyordu. Genel bakış bir başlatıcı; şekli
 * gösteriyor, sahne sahne ayrıntıyı tam ekran görünümü verecek.
 */
function Cizgi({ degerler, renk, obek = 5, tavan }: {
  degerler: number[]; renk: string; obek?: number;
  /**
   * Y ekseninin ÜST SINIRI. Oran grafiğinde 1 verilir: eksen veriye göre
   * gerilirse %66 ile %64 arasındaki fark ekranda uçurum gibi görünür ve
   * grafik yalan söyler. Sabit tavan, farkı gerçek büyüklüğünde bırakır.
   */
  tavan?: number;
}) {
  if (degerler.length === 0) return null;
  const oblar: number[] = [];
  for (let i = 0; i < degerler.length; i += obek) {
    const d = degerler.slice(i, i + obek);
    oblar.push(d.reduce((s, x) => s + x, 0) / d.length);
  }
  const en = tavan ?? Math.max(...oblar, 0.0001);
  const G = 240, Y = 120, alt = Y - 8;
  const x = (i: number) => (oblar.length === 1 ? G / 2 : (i / (oblar.length - 1)) * (G - 16) + 8);
  const y = (v: number) => alt - (v / en) * (alt - 10);
  const nokta = oblar.map((v, i) => ({ x: x(i), y: y(v) }));
  const cizgi = nokta.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const alan = `M8 ${alt} L${nokta.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} L${G - 8} ${alt} Z`;
  return (
    <svg width="100%" height={Y} viewBox={`0 0 ${G} ${Y}`} preserveAspectRatio="none" aria-hidden>
      <path d={alan} fill={renk} fillOpacity={0.09} />
      <polyline points={cizgi} fill="none" stroke={renk} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {nokta.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={renk} stroke="var(--mzn-zemin, #0a0c0e)" strokeWidth={1.5} />
      ))}
      <line x1={8} y1={alt} x2={G - 8} y2={alt} stroke="#2b313a" strokeWidth={1} />
    </svg>
  );
}

/** Izgara hücresi — kutu YOK, yalnız 1px ayıraç (Kesme Masası dili). */
function Hucre({ baslik, alt, kunye, children }: {
  baslik: string; alt: string; kunye?: string; children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col border-b border-r border-kenar-ic px-4 py-3">
      <h3 className="mzn-etiket">{baslik}</h3>
      <p className="mt-0.5 text-[11px] text-metin-cok-zayif">{alt}</p>
      <div className="flex flex-1 items-center justify-center">{children}</div>
      {kunye && <p className="mzn-sayi text-[11px] text-metin-zayif">{kunye}</p>}
    </section>
  );
}

export function AnalizPanosuDialog({ onClose }: { onClose: () => void }) {
  /* PANO KENDİNE ODAKLANIYOR.
     `onKeyDown` kökte duruyordu ama kök hiç odaklanmıyordu: pano menüden
     açıldığında odak menüde kalıyor ve başlıkta yazan "Esc — çık" hiçbir
     şey yapmıyordu (keşif turunda yakalandı 2026-08-30). Modal'ın kuralı
     zaten buydu: "Escape ve ilk odak diyaloğun KENDİ işi". */
  const kok = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { kok.current?.focus(); }, []);
  /* Seçili çift: genel bakış bir BAŞLATICI, ayrıntı tam ekranda açılıyor.
     Oturumluk durum — hangi çifte baktığın kalıcı bir tercih değil. */
  const [secili, setSecili] = React.useState<Secim | null>(null);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const breakdown = useProjectStore((s) => s.breakdown);
  const belgeDili = useUiStore((s) => s.scriptLang);

  const analiz = useMemo(() => {
    const katmanlar: Record<string, ZamanKatmani> = {};
    const hikayeSiralari: Record<string, number> = {};
    for (const [sceneId, ek] of Object.entries(breakdown ?? {})) {
      katmanlar[sceneId] = ek.zamanKatmani;
      if (ek.hikayeSirasi !== null) hikayeSiralari[sceneId] = ek.hikayeSirasi;
    }
    return senaryoyuCozumle(bloklar ?? [], { dil: belgeDili, katmanlar, hikayeSiralari });
  }, [bloklar, breakdown, belgeDili]);

  const bos = analiz.sahneler.length === 0;

  /* Karakter kimliği renkleri: ad sırası DEĞİL, replik sırası. Aynı karakter
     bütün grafiklerde aynı rengi taşımalı, yoksa göz her hücrede yeniden
     eşleştirme yapar. */
  const renkler = useMemo(
    () => new Map(analiz.karakterler.map((k, i) => [k.ad, SERI[i % SERI.length]] as const)),
    [analiz.karakterler],
  );

  const enCokKarakter = analiz.karakterler.slice(0, 6);
  const kisa = (ad: string) => (ad.length > 6 ? `${ad.slice(0, 5)}…` : ad);

  return (
    /* `fixed inset-0`: Ayarlar paneliyle aynı kabuk — bu bir kesinti değil,
       gidilen bir yer. */
    <div
      ref={kok}
      data-testid="analiz-panosu"
      className="fixed inset-0 z-[80] flex flex-col bg-zemin text-metin-guclu"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      role="dialog"
      aria-label={t('Analiz')}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-kenar bg-cubuk px-3.5">
        <span className="mzn-etiket text-amber">{t('Analiz')}</span>
        <span className="mzn-sayi text-[11px] text-metin-cok-zayif">
          {analiz.sahneler.length} {t('sahne')} · {analiz.toplamKelime} {t('kelime')}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="analiz-kapat"
          onClick={onClose}
          className="text-[12px] text-metin-zayif hover:text-metin"
        >
          {t('Esc — çık')}
        </button>
      </header>

      {bos ? (
        <p className="flex flex-1 items-center justify-center text-[12px] text-metin-cok-zayif">
          {t('Çözümlenecek senaryo yok.')}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* SOL RAY — parça/bütün ölçüleri alt alta */}
          <aside className="flex w-[340px] shrink-0 flex-col border-r border-kenar-ic">
            <HalkaBolum
              baslik={t('Mekân ekonomisi')}
              alt={t('sayfa payı')}
              orta={String(analiz.mekanlar.length)}
              altYazi={t('MEKÂN')}
              onSec={setSecili}
              dilimler={analiz.mekanlar.slice(0, 7).map((m, i) => ({
                ad: m.yer || t('(başlıksız)'), deger: m.kelime, renk: SERI[i % SERI.length],
                sec: { tur: 'mekan', yer: m.yer } as const,
              }))}
            />
            {/* İç/dış ve günün saati TEK bölümde: ikisi de çekim koşulu ve
                ayrı bölümler sol rayı taşırıyordu (ölçüldü — beşinci bölüm
                900 px ekranda alttan kesiliyordu). */}
            <IkiliHalka
              baslik={t('Çekim koşulları')}
              alt={t('mekân tipi · günün saati')}
              /* Sayı değil DAĞILIM pahalıdır: dağınık 12 gece sahnesi 12
                 gece çekimi, kümeli olanı dört. */
              oku={`${analiz.geceKumeleri} ${t('gece kümesi')}`}
              onSec={setSecili}
              sol={[
                { ad: t('iç'), deger: analiz.icSahne, renk: '#3987e5',
                  sec: { tur: 'mekanTipi', ic: true } as const },
                { ad: t('dış'), deger: analiz.disSahne, renk: '#184f95',
                  sec: { tur: 'mekanTipi', ic: false } as const },
              ]}
              sag={[
                { ad: t(ZAMAN_ADLARI.gunduz), deger: analiz.zamanDagilimi.gunduz, renk: '#c98500',
                  sec: { tur: 'zaman', zaman: 'gunduz' } as const },
                { ad: t(ZAMAN_ADLARI.gece), deger: analiz.zamanDagilimi.gece, renk: '#184f95',
                  sec: { tur: 'zaman', zaman: 'gece' } as const },
                { ad: t(ZAMAN_ADLARI.safak), deger: analiz.zamanDagilimi.safak, renk: '#d55181',
                  sec: { tur: 'zaman', zaman: 'safak' } as const },
                { ad: t(ZAMAN_ADLARI.aksam), deger: analiz.zamanDagilimi.aksam, renk: '#9085e9',
                  sec: { tur: 'zaman', zaman: 'aksam' } as const },
                { ad: t(ZAMAN_ADLARI.bilinmiyor), deger: analiz.zamanDagilimi.bilinmiyor, renk: '#2f3a47',
                  sec: { tur: 'zaman', zaman: 'bilinmiyor' } as const },
              ].filter((d) => d.deger > 0)}
            />
            <HalkaBolum
              baslik={t('Zaman katmanı')}
              alt={t('anlatı düzlemi')}
              orta={String(analiz.sahneler.length)}
              altYazi={t('SAHNE')}
              onSec={setSecili}
              dilimler={KATMANLAR.map((k) => ({
                ad: t(KATMAN_ADLARI[k]), deger: analiz.katmanDagilimi[k], renk: KATMAN_RENGI[k],
                sec: { tur: 'katman', katman: k } as const,
              }))}
            />
            <HalkaBolum
              baslik={t('Konuşma dengesi')}
              alt={t('toplam repliğin payı')}
              orta={String(analiz.karakterler.length)}
              altYazi={t('KİŞİ')}
              onSec={setSecili}
              dilimler={enCokKarakter.map((k) => ({
                ad: kisa(k.ad), deger: k.replik, renk: renkler.get(k.ad) ?? SERI[0],
                sec: { tur: 'karakter', ad: k.ad } as const,
              }))}
            />
          </aside>

          {/* SAĞ — ölçüler ızgarası. En fazla 2 SATIR (kullanıcı kararı):
              üçüncü satır kaydırma getirir, genel bakış tek ekranda kalmalı. */}
          <div className="grid min-w-0 flex-1 grid-cols-3 grid-rows-2">
            <Hucre
              baslik={t('Kim kiminle')}
              alt={t('paylaşılan sahne')}
              kunye={
                analiz.hicKarsilasmayan.length > 0
                  ? `${analiz.hicKarsilasmayan.length} ${t('çift hiç karşılaşmıyor')}`
                  : t('her çift en az bir sahne paylaşıyor')
              }
            >
              <KarsilasmaMatrisi analiz={analiz} kisa={kisa} onSec={setSecili} />
            </Hucre>

            <Hucre baslik={t('Replik uzunluğu')} alt={t('medyan kelime')}>
              <NoktaDizisi
                onSec={setSecili}
                satirlar={(() => {
                  const en = Math.max(...enCokKarakter.map((k) => k.replikMedyan), 1);
                  return [...enCokKarakter]
                    .sort((a, b) => b.replikMedyan - a.replikMedyan)
                    .map((k) => ({
                      ad: kisa(k.ad), deger: String(k.replikMedyan),
                      oran: k.replikMedyan / en, renk: renkler.get(k.ad) ?? SERI[0],
                      sec: { tur: 'karakter', ad: k.ad } as const,
                    }));
                })()}
              />
            </Hucre>

            <Hucre baslik={t('Varlık / yokluk')} alt={t('en uzun görünmeme')}>
              <NoktaDizisi
                onSec={setSecili}
                satirlar={(() => {
                  const boslar = enCokKarakter.map((k) => ({ k, b: enUzunYokluk(k) }));
                  const en = Math.max(...boslar.map((x) => x.b), 1);
                  return boslar
                    .sort((a, b) => b.b - a.b)
                    .map(({ k, b }) => ({
                      ad: kisa(k.ad), deger: `${b}`, oran: b / en, renk: renkler.get(k.ad) ?? SERI[0],
                      sec: { tur: 'karakter', ad: k.ad } as const,
                    }));
                })()}
              />
            </Hucre>

            <Hucre
              baslik={t('Sahne ritmi')}
              alt={t('sayfa payı')}
              kunye={`${analiz.sahneler.length} ${t('sahne')}`}
            >
              <SahneSeridi analiz={analiz} />
            </Hucre>

            <Hucre
              baslik={t('Diyalog ↔ aksiyon')}
              alt={t('diyalog satır payı')}
              kunye={(() => {
                const d = analiz.sahneler.reduce((s, x) => s + x.diyalogSatir, 0);
                const a = analiz.sahneler.reduce((s, x) => s + x.aksiyonSatir, 0);
                return d + a > 0 ? `%${Math.round((d / (d + a)) * 100)} ${t('diyalog')}` : t('satır yok');
              })()}
            >
              <Cizgi
                renk="#d95926"
                tavan={1}
                degerler={analiz.sahneler.map((s) => {
                  const top = s.diyalogSatir + s.aksiyonSatir;
                  return top > 0 ? s.diyalogSatir / top : 0;
                })}
              />
            </Hucre>

            <Hucre
              baslik={t('Anlatı ↔ hikâye')}
              alt={t('kesikli çizgi = doğrusal')}
              kunye={
                analiz.katmanDagilimi.simdi === analiz.sahneler.length
                  ? t('etiketlenmemiş — doğrusal görünüyor')
                  : `${analiz.sahneler.length - analiz.katmanDagilimi.simdi} ${t('sahne kaymış')}`
              }
            >
              <AnlatiHikaye analiz={analiz} />
            </Hucre>
          </div>

          {/* Detay SAĞDAN açılıyor, genel bakışın üstünü örtmüyor: seçimi
              yapan matris görünür kalmalı ki çift değiştirmek tek tık olsun. */}
          {secili && (
            <div className="w-[420px] shrink-0">
              <Detay analiz={analiz} secim={secili} onKapat={() => setSecili(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kabarcık matrisi. Daire büyüklüğü VE rengi paylaşılan sahneyi kodluyor;
 * sayı da içinde. Üç kanal aynı şeyi söylüyor — renk körlüğü olan okuyucu
 * için bilgi hiç renge bağlı değil.
 *
 * Çap TAVANLI: tavansız, 30 sahne paylaşan bir çift hücreyi taşırırdı.
 */
function KarsilasmaMatrisi({
  analiz, kisa, onSec,
}: {
  analiz: ReturnType<typeof senaryoyuCozumle>;
  kisa: (a: string) => string;
  onSec: (secim: Secim) => void;
}) {
  const adlar = analiz.karakterler.slice(0, 6).map((k) => k.ad);
  const bul = (a: string, b: string) =>
    analiz.ciftler.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))?.ortak ?? 0;

  if (adlar.length < 2) {
    return <p className="text-[11px] text-metin-cok-zayif">{t('Karşılaşma için en az iki karakter gerek.')}</p>;
  }

  return (
    <div
      data-testid="karsilasma-matrisi"
      className="grid gap-1"
      style={{ gridTemplateColumns: `34px repeat(${adlar.length - 1}, 34px)` }}
    >
      {adlar.slice(1).map((satirAd) => (
        <React.Fragment key={satirAd}>
          <span className="mzn-sayi flex items-center justify-end pr-1 text-[10px] text-metin-zayif">
            {kisa(satirAd)}
          </span>
          {adlar.slice(0, -1).map((sutunAd) => {
            if (adlar.indexOf(sutunAd) >= adlar.indexOf(satirAd)) {
              return <span key={sutunAd} />;
            }
            const n = bul(satirAd, sutunAd);
            const k = kova(n);
            return (
              <span key={sutunAd} className="flex h-[34px] items-center justify-center">
                <button
                  type="button"
                  data-testid={`matris-${satirAd}-${sutunAd}`}
                  onClick={() => onSec({ tur: 'cift', a: sutunAd, b: satirAd })}
                  className="mzn-sayi flex items-center justify-center rounded-full text-[11px]"
                  title={`${satirAd} · ${sutunAd}: ${n}`}
                  style={
                    n === 0
                      ? { width: 15, height: 15, border: '1px dashed #2b313a' }
                      : {
                          width: Math.min(30, 13 + n * 1.2),
                          height: Math.min(30, 13 + n * 1.2),
                          background: YOGUNLUK[k],
                          color: YOGUNLUK_YAZI[k],
                          border: '1px solid rgba(255,255,255,.16)',
                        }
                  }
                >
                  {n === 0 ? '' : n}
                </button>
              </span>
            );
          })}
        </React.Fragment>
      ))}
      {/* Sütun adları: satır adları olup sütun adları olmayan bir matris
          yarım okunur — hangi dairenin kime ait olduğu belirsiz kalır. */}
      <span />
      {adlar.slice(0, -1).map((sutunAd) => (
        <span
          key={sutunAd}
          className="mzn-sayi truncate pt-1 text-center text-[10px] text-metin-zayif"
        >
          {kisa(sutunAd)}
        </span>
      ))}
    </div>
  );
}

/**
 * DETAY — seçilen çiftin paylaştığı sahneler.
 *
 * Kullanıcı kararı (2026-08-29): asıl değer listede. Grafik zaten okundu;
 * gerçek soru "bu 14 sahne hangileri, hangi mekânda, kaçıncı sayfada".
 *
 * Üstteki şerit "nerede buluşuyorlar" sorusunu kapatıyor: 41 sahnenin
 * hepsi, paylaşılanlar vurgulu. Liste hangilerini, şerit nerede olduğunu
 * söylüyor — ikisi ayrı soru.
 */
function Detay({
  analiz, secim, onKapat,
}: {
  analiz: ReturnType<typeof senaryoyuCozumle>;
  secim: Secim;
  onKapat: () => void;
}) {
  const { baslik, alt, sahneler } = secimiCoz(analiz, secim);
  const kume = new Set(sahneler);
  const toplamPay = sahneler.reduce((s, i) => s + (analiz.sahneler[i]?.pay ?? 0), 0);

  return (
    <div
      data-testid="analiz-detay"
      className="flex min-h-0 flex-1 flex-col border-l border-kenar-ic"
    >
      <header className="flex shrink-0 items-baseline gap-3 border-b border-kenar-ic px-4 py-3">
        <span className="min-w-0 truncate text-[15px] font-semibold text-metin-guclu">{baslik}</span>
        <span className="shrink-0 text-[11px] text-metin-etiket">{alt}</span>
        <span className="flex-1" />
        <span className="mzn-sayi text-[13px] text-metin-guclu">{sahneler.length}</span>
        <span className="text-[11px] text-metin-etiket">{t('sahne')}</span>
        <span className="mzn-sayi text-[13px] text-metin-guclu">%{Math.round(toplamPay * 100)}</span>
        <span className="text-[11px] text-metin-etiket">{t('senaryonun')}</span>
        <button
          type="button"
          data-testid="detay-kapat"
          onClick={onKapat}
          className="ml-2 text-[12px] text-metin-zayif hover:text-metin"
        >
          {t('Kapat')}
        </button>
      </header>

      <div className="shrink-0 border-b border-kenar-ic px-4 py-3">
        <h4 className="mzn-etiket mb-2">{t('Senaryoda nerede')}</h4>
        <div className="flex h-8 items-end gap-px">
          {analiz.sahneler.map((s) => (
            <span
              key={`${s.sceneId}-${s.sira}`}
              className="min-w-0 flex-1"
              style={{
                height: kume.has(s.sira) ? '100%' : '38%',
                background: kume.has(s.sira) ? '#e0932f' : '#1e232a',
              }}
            />
          ))}
        </div>
      </div>

      {sahneler.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-[12px] text-metin-cok-zayif">
          {secim.tur === 'cift'
            ? t('Bu ikili hiç aynı sahnede konuşmuyor.')
            : t('Bu seçimde hiç sahne yok.')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
          {sahneler.map((i) => {
            const s = analiz.sahneler[i];
            if (!s) return null;
            /* Çift seçimindeyken ikilinin kendisi "başka kim var" sütununda
               tekrar edilmiyor; öteki seçimlerde bütün konuşanlar görünüyor. */
            const otekiler = secim.tur === 'cift'
              ? s.karakterler.filter((k) => k !== secim.a && k !== secim.b)
              : s.karakterler;
            return (
              <li key={`${s.sceneId}-${s.sira}`}>
                <button
                  type="button"
                  data-testid={`detay-sahne-${s.sira}`}
                  onClick={() => blogaGit(s.ilkBlokId)}
                  className="flex w-full items-center gap-2 border-b border-kenar-ic py-2 text-left hover:bg-denetim"
                >
                  <span className="mzn-sayi w-7 shrink-0 text-[11px] text-metin-cok-zayif">
                    {s.sira + 1}
                  </span>
                  <span className="mzn-sayi min-w-0 flex-1 truncate text-[12px] text-metin-govde">
                    {s.baslik || t('(başlıksız)')}
                  </span>
                  <span className="mzn-sayi w-10 shrink-0 text-right text-[11px] text-metin-zayif">
                    %{(s.pay * 100).toFixed(1)}
                  </span>
                  <span
                    className="mzn-sayi w-16 shrink-0 text-center text-[10px]"
                    style={{ color: s.katman === 'simdi' ? '#5c6472' : KATMAN_RENGI[s.katman] }}
                  >
                    {t(KATMAN_ADLARI[s.katman])}
                  </span>
                  <span className="w-28 shrink-0 truncate text-[11px] text-metin-cok-zayif">
                    {/* Üçüncü kişi yoksa BOŞ bırakılmıyor: her durumun kendi
                        gösterimi var, boşluk "veri eksik" gibi okunur. */}
                    {otekiler.length > 0
                      ? otekiler.join(', ')
                      : secim.tur === 'cift' ? t('yalnız ikisi') : t('konuşan yok')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * ANLATI ↔ HİKÂYE saçılımı.
 *
 * X ekseni senaryodaki sıra, Y ekseni hikâyedeki sıra. Doğrusal bir film
 * kesikli köşegenin üstünde durur; sapan noktalar zaman atlamalarıdır.
 *
 * Hikâye sırası ETİKETLENMEMİŞSE anlatı sırası kullanılıyor — yani
 * etiketlenmemiş senaryo dürüstçe doğrusal görünüyor. Uydurma bir sapma
 * üretmek, olmayan bir bilgiyi varmış gibi göstermek olurdu.
 */
function AnlatiHikaye({ analiz }: { analiz: ReturnType<typeof senaryoyuCozumle> }) {
  const n = analiz.sahneler.length;
  if (n < 2) return <p className="text-[11px] text-metin-cok-zayif">{t('En az iki sahne gerek.')}</p>;

  const siralar = analiz.sahneler.map((s) => s.hikayeSirasi ?? s.sira);
  const enAz = Math.min(...siralar), enCok = Math.max(...siralar);
  const yayilim = enCok - enAz || 1;
  const G = 240, Y = 130;
  const x = (i: number) => 10 + (i / (n - 1)) * (G - 20);
  const y = (v: number) => Y - 12 - ((v - enAz) / yayilim) * (Y - 26);

  return (
    <svg data-testid="anlati-hikaye" width="100%" height={Y} viewBox={`0 0 ${G} ${Y}`} aria-hidden>
      <line x1={10} y1={Y - 12} x2={G - 10} y2={14} stroke="#2f3a47" strokeWidth={1.5} strokeDasharray="4 4" />
      <line x1={10} y1={14} x2={10} y2={Y - 12} stroke="#2b313a" strokeWidth={1} />
      <line x1={10} y1={Y - 12} x2={G - 10} y2={Y - 12} stroke="#2b313a" strokeWidth={1} />
      {analiz.sahneler.map((s, i) => {
        const kaymis = s.katman !== 'simdi';
        return (
          <circle
            key={`${s.sceneId}-${s.sira}`}
            cx={x(i)}
            cy={y(siralar[i])}
            r={kaymis ? 4 : 2.8}
            fill={kaymis ? KATMAN_RENGI[s.katman] : '#3987e5'}
            stroke="var(--mzn-zemin, #0a0c0e)"
            strokeWidth={1.2}
          />
        );
      })}
    </svg>
  );
}

/**
 * Sahne ritmi şeridi. Tıklanabilir: grafik bir poster değil, gezinme
 * aracıdır — çubuğa basınca senaryoda o sahneye gidiliyor.
 */
function SahneSeridi({ analiz }: { analiz: ReturnType<typeof senaryoyuCozumle> }) {
  const en = Math.max(...analiz.sahneler.map((s) => s.pay), 0.0001);
  if (!analiz.sahneler.length) {
    /* BOŞ DURUM AÇIKÇA YAZILIYOR. Boş bir kutu "veri yok" demiyor,
       "bir şey bozuldu" gibi okunuyor (§15.4 sessizlik yasağının
       görsel karşılığı). */
    return (
      <p data-testid="sahne-seridi" className="text-[11px] text-metin-cok-zayif">
        {t('Henüz sahne yok.')}
      </p>
    );
  }
  return (
    <div data-testid="sahne-seridi" className="flex h-full w-full items-end gap-px">
      {analiz.sahneler.map((s) => (
        <button
          key={`${s.sceneId}-${s.sira}`}
          type="button"
          data-testid={`analiz-sahne-${s.sira}`}
          title={`${s.sira + 1}. ${s.baslik || t('(başlıksız)')}`}
          onClick={() => blogaGit(s.ilkBlokId)}
          className="min-w-0 flex-1"
          style={{
            /* ÜST SINIR ŞART: tek sahnede `flex-1` çubuğu bütün şeride
               yayıyor ve grafik dev bir mavi duvara dönüyordu (kullanıcı
               bildirimi 2026-08-30). Çok sahnede zaten bu genişliğin
               altına iniyor, yani sınır yalnız az veride devreye giriyor. */
            maxWidth: 44,
            height: `${Math.max(4, (s.pay / en) * 100)}%`,
            background: s.ic === false ? '#184f95' : '#3987e5',
          }}
        />
      ))}
    </div>
  );
}
