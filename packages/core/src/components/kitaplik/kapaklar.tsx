import React from 'react';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';

/**
 * VARSAYILAN KİTAP KAPAKLARI.
 *
 * Kullanıcı kendi görselini eklemediğinde kitap boş bir cilt olarak durmasın
 * diye on kapak çizildi: beşi film ailesi, beşi kitap ailesi. Hepsi ÇİZİM —
 * ikon setiyle aynı `stroke` dili, aynı 1.4–2px kalınlık. Fotoğraf ya da
 * hazır görsel kullanılmadı: dosya bağımlılığı getirir, ölçeklenince bozulur
 * ve arayüzün geri kalanının çizgi diliyle konuşmaz.
 *
 * ## Renk İCAT EDİLMEDİ
 *
 * Her kapak koyu cilt zemini + tek amber öğe. On ayrı renk uydurmak
 * DESIGN.md'nin kuralını çiğnerdi; ayrım renkten değil KOMPOZİSYONDAN
 * geliyor — kadraj, huzme, ufuk, kesme, diyafram / satır, kat, ay, merdiven,
 * düğüm. Amber her kapakta tek bir şeye dokunuyor: bakışın gideceği yere.
 *
 * ## "Rasgele" ama projeye SABİT
 *
 * Kullanıcı rastgele atama istedi. Gerçek rastgelelik her yeniden çizimde
 * başka kapak verirdi — kitaplığa her bakışta rafın değişmesi, kapaksız
 * durumdan daha kötüdür: kullanıcı kitabını KAPAĞINDAN tanır. Bu yüzden
 * seçim projenin kimliğinden türetiliyor: aynı proje her zaman aynı kapak,
 * farklı projeler dağılmış kapaklar.
 */

export type KapakAilesi = 'film' | 'kitap';

interface Kapak {
  ad: string;
  ciz: () => React.ReactElement;
}

const EN = 148;
const BOY = 130;

/** Ortak çizim kabı — bütün kapaklar aynı kutuda, aynı zeminde. */
function Tuval({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${EN} ${BOY}`}
      width="100%"
      height="100%"
      fill="none"
      stroke="var(--mzn-metin-cok-zayif)"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

const A = 'var(--mzn-amber)';

/* ------------------------------- film ------------------------------- */

const FILM: readonly Kapak[] = [
  {
    /* KADRAJ — film karesi. Delikler iki kenarda; ortadaki kare amber:
       bakılan şey çerçevenin kendisi değil, içine alınan şey. */
    ad: 'kadraj',
    ciz: () => (
      <Tuval>
        {/* Sol delik sütunu x=22'den başlıyor: 9px'lik SIRT kapağın üstüne
            kapanıyor ve x<16'daki her şey onun altında kalırdı. */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>
            <rect x={22} y={18 + i * 17} width={7} height={10} />
            <rect x={124} y={18 + i * 17} width={7} height={10} />
          </React.Fragment>
        ))}
        <rect x={38} y={32} width={78} height={66} stroke={A} strokeWidth={2} />
      </Tuval>
    ),
  },
  {
    /* HUZME — makinistin ışığı. Tek noktadan açılan koni; perde amber. */
    ad: 'huzme',
    ciz: () => (
      <Tuval>
        <circle cx={22} cy={65} r={3.5} stroke={A} strokeWidth={1.8} />
        <path d="M25 63L118 30M25 67L118 100" />
        <rect x={118} y={28} width={16} height={74} stroke={A} strokeWidth={1.8} />
      </Tuval>
    ),
  },
  {
    /* UFUK — geniş ekran. Üst ve alt bantlar kadrajı söylüyor, güneş amber
       ve ufkun ALTINDA yarısı: gün doğumu mu batımı mı belli değil. */
    ad: 'ufuk',
    ciz: () => (
      <Tuval>
        <path d="M0 30h148M0 100h148" strokeWidth={1.2} />
        <path d="M22 76h104" />
        <path d="M52 76a22 22 0 0144 0" stroke={A} strokeWidth={1.8} />
        <path d="M34 88h28M78 88h40" strokeWidth={1.1} />
      </Tuval>
    ),
  },
  {
    /* MAKARALI PROJEKTÖR. İki makara, aralarında sarkan film, gövde ve
       objektif; amber olan objektif — odadaki ışığın çıktığı yer.

       Ailedeki öteki kapaklar soyut (kadraj, huzme, ufuk, diyafram); bu
       tek NESNE ve seti yere bağlıyor. Aynı yerde önce "kesme", sonra
       "salon", sonra "hareket" denendi; üçü de tutmadı. Soyut bir fikri
       çizgiyle anlatmak, tanınan bir nesneyi çizmekten zordur — ve bu
       kutu 148x130. */
    ad: 'projektor',
    ciz: () => (
      <Tuval>
        {/* Makaralar — dışı, göbeği, üç parmağı. */}
        {[50, 98].map((cx) => (
          <React.Fragment key={cx}>
            <circle cx={cx} cy={34} r={17} strokeWidth={1.5} />
            <circle cx={cx} cy={34} r={5} strokeWidth={1.3} />
            {/* Üç parmak 120° aralıklı: dik çizgi + iki çapraz, göbeğin
                etrafında anahtar deliği gibi okunuyordu. */}
            {[90, 210, 330].map((d) => {
              const r = (d * Math.PI) / 180;
              return (
                <path
                  key={d}
                  d={`M${cx + 6 * Math.cos(r)} ${34 + 6 * Math.sin(r)}L${cx + 13 * Math.cos(r)} ${34 + 13 * Math.sin(r)}`}
                  strokeWidth={1.3}
                />
              );
            })}
          </React.Fragment>
        ))}

        {/* Makaralar arasında sarkan film. */}
        <path d="M50 51C58 66 90 66 98 51" strokeWidth={1.3} />

        {/* Gövde. */}
        <rect x={36} y={64} width={74} height={26} strokeWidth={1.5} />
        <path d="M44 71h14" strokeWidth={1.2} />

        {/* Objektif — ışığın çıktığı yer. */}
        <path d="M110 70l20-6v26l-20-6z" stroke={A} strokeWidth={2} />

        {/* Ayak. */}
        <path d="M73 90v14M58 104h30" strokeWidth={1.4} />
      </Tuval>
    ),
  },
  {
    /* DİYAFRAM — objektifin irisi. Altı bıçak, ortadaki açıklık amber. */
    ad: 'diyafram',
    ciz: () => (
      <Tuval>
        <circle cx={74} cy={65} r={40} />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (Math.PI / 3) * i;
          const b = a + Math.PI / 3;
          return (
            <path
              key={i}
              d={`M${74 + 40 * Math.cos(a)} ${65 + 40 * Math.sin(a)}L${74 + 15 * Math.cos(b)} ${65 + 15 * Math.sin(b)}`}
            />
          );
        })}
        <circle cx={74} cy={65} r={15} stroke={A} strokeWidth={1.8} />
      </Tuval>
    ),
  },
];

/* ------------------------------- kitap ------------------------------- */

const KITAP: readonly Kapak[] = [
  {
    /* SATIRLAR — bir sayfa dolusu metin ve içinde tek amber satır:
       aradığın cümle. */
    ad: 'satirlar',
    ciz: () => (
      <Tuval>
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d={`M30 ${26 + i * 9}h${i === 4 ? 54 : i % 3 === 2 ? 62 : 88}`}
            stroke={i === 4 ? A : undefined}
            strokeWidth={i === 4 ? 1.9 : 1.2}
          />
        ))}
      </Tuval>
    ),
  },
  {
    /* KAT — kıvrılmış sayfa köşesi. Kalınan yer. */
    ad: 'kat',
    ciz: () => (
      <Tuval>
        <path d="M40 22h50l22 22v64H40z" />
        <path d="M90 22v22h22" stroke={A} strokeWidth={1.8} />
        <path d="M52 62h48M52 74h48M52 86h30" strokeWidth={1.2} />
      </Tuval>
    ),
  },
  {
    /* AY — gece yazısı. İnce hilal amber, altında ufuk çizgisi. */
    ad: 'ay',
    ciz: () => (
      <Tuval>
        <path d="M86 30a30 30 0 100 52 24 24 0 010-52z" stroke={A} strokeWidth={1.8} />
        <path d="M18 100h112" />
        <path d="M34 20v6M118 44v6M126 26v6" strokeWidth={1.2} />
      </Tuval>
    ),
  },
  {
    /* PENCERE — roman bir yere açılan kapaktır. Dört bölme, biri amber:
       ışığı yanan tek oda, anlatının içine girdiğin yer.

       Bundan önce burada "merdiven" vardı (kaydırılmış satırlar = bölümler)
       ve KÖTÜYDÜ: merdiven gibi değil, çarpık bir metin bloğu gibi
       okunuyordu — üstelik "satırlar" kapağına da fazla benziyordu.
       Kapakların ayrımı kompozisyondan geliyor, o ayrımı zayıflatan bir
       kompozisyon yerini korumaz. */
    ad: 'pencere',
    ciz: () => (
      <Tuval>
        <rect x={46} y={22} width={56} height={78} strokeWidth={1.6} />
        <path d="M74 22v78M46 61h56" strokeWidth={1.4} />
        <rect x={76} y={24} width={24} height={35} fill={A} stroke={A} strokeWidth={1.6} />
        <path d="M36 106h76" strokeWidth={1.6} />
      </Tuval>
    ),
  },
  {
    /* İSTİF — üst üste yatan kitaplar. Bu ailede eksik olan kayıt ZAMANDI:
       satırlar metni, kat kalınan yeri, ay geceyi, pencere başka bir yeri
       söylüyordu; istif BİRİKMİŞ İŞİ söylüyor. Her cildin sol kenarındaki
       kısa dikey çizgi sırtı; amber olan yığındaki senin kitabın.

       Bundan önce burada "düğüm" vardı (kendi üstünden geçen tek çizgi) —
       kullanıcı seçmedi ve haklıydı: çizgi "olay örgüsü" demiyor, rastgele
       bir kıvrım gibi duruyordu. */
    ad: 'istif',
    ciz: () => {
      /* Genişlikler ve kaymalar GENİŞ aralıkta değişiyor. İlk denemede
         hepsi birbirine yakındı ve yığın değil, barkod gibi okunuyordu:
         gerçek bir istif düzensizdir, düzeni onu yığın olmaktan çıkarır. */
      const CILT = [
        { y: 100, x: 26, w: 96, h: 12 },
        { y: 85, x: 38, w: 72, h: 12 },
        { y: 70, x: 31, w: 88, h: 13, amber: true },
        { y: 56, x: 45, w: 58, h: 11 },
        { y: 41, x: 35, w: 78, h: 12 },
        { y: 27, x: 52, w: 44, h: 10 },
      ];
      return (
        <Tuval>
          {CILT.map((c) => (
            <React.Fragment key={c.y}>
              <rect
                x={c.x}
                y={c.y}
                width={c.w}
                height={c.h}
                stroke={c.amber ? A : undefined}
                strokeWidth={c.amber ? 2 : 1.3}
              />
              {/* Her cildin sol kenarındaki kısa dikey çizgi: sırtı. */}
              <path
                d={`M${c.x + 5} ${c.y + 2.5}v${c.h - 5}`}
                stroke={c.amber ? A : undefined}
                strokeWidth={1.3}
              />
            </React.Fragment>
          ))}
        </Tuval>
      );
    },
  },
];

const AILELER: Record<KapakAilesi, readonly Kapak[]> = { film: FILM, kitap: KITAP };

/**
 * Belge tipinin kapak ailesi.
 *
 * `sayfaDakika` ekseninden türetiliyor, ayrı bir liste tutulmuyor: sayfası
 * dakika ölçen belge oynanan bir iştir (senaryo, dizi, sahne, radyo),
 * ötekiler okunan (roman, çizgi roman, düz metin). Yeni bir tip eklendiğinde
 * kapak ailesini de ayrıca yazmayı unutmak diye bir şey olmuyor (Karar 2).
 */
export function kapakAilesi(tipAdi: string | undefined): KapakAilesi {
  const tip = dokumanTipi(tipAdi) ?? DOKUMAN_TIPLERI.senaryo;
  return tip.sayfaDakika ? 'film' : 'kitap';
}

/**
 * Anahtardan sabit bir sayı — aynı girdi her zaman aynı sonuç.
 *
 * `Math.random` DEĞİL: kapak projenin kimliğinin parçası. Rastgele olsaydı
 * her yeniden çizimde raf değişir, kullanıcı kitabını tanıyamazdı.
 */
function ozet(anahtar: string): number {
  let h = 2166136261;
  for (let i = 0; i < anahtar.length; i++) {
    h ^= anahtar.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Projenin varsayılan kapağı — tipine göre aile, kimliğine göre seçim. */
export function varsayilanKapak(tipAdi: string | undefined, anahtar: string): React.ReactElement {
  const aile = AILELER[kapakAilesi(tipAdi)];
  return aile[ozet(anahtar) % aile.length].ciz();
}

/** Yalnız testler ve önizleme için: bir ailenin bütün kapakları. */
export function aileKapaklari(aile: KapakAilesi): readonly { ad: string; ciz: () => React.ReactElement }[] {
  return AILELER[aile];
}
