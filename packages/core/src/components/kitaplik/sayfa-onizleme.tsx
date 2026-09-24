import React from 'react';
import type { DokumanTipiAdi } from '../../model/dokuman-tipi';

/**
 * SAYFA ÖNİZLEMELERİ — belgenin türünü ADIYLA değil BİÇİMİYLE gösterir.
 *
 * Yeni proje penceresinde tür seçilirken sorulan asıl soru "roman ne
 * demek" değil, "seçersem sayfa neye benzeyecek". Ad ve tek satırlık
 * açıklama bunu ancak tarif eder; minyatür GÖSTERİR — iki sütunlu belge
 * ile tek sütunlu belge arasındaki farkı okumadan görürsün.
 *
 * Neden ikon değil: `Ikon.tsx` çizgi setinde sekiz doküman tipini
 * birbirinden ayıracak sekiz sembol yok ve uydurulmuş semboller (daktilo,
 * kitap, mikrofon) türü değil KATEGORİYİ anlatırdı — oysa ayrım
 * yerleşimde. Emoji zaten yasak: platformdan platforma başka çizilir ve
 * tasarımın çizgi kalınlığına oturmaz.
 *
 * Renk DESIGN.md'den: kağıt `#f7f5f0`, mürekkep `#1c1a17`. Karanlık
 * kabuğun içinde tek ışık yine sayfa — kartların hepsi bir masaya
 * dizilmiş sayfa gibi durur. Yeni renk icat edilmiyor.
 */

const KAGIT = '#f7f5f0';
const MUREKKEP = '#1c1a17';

/**
 * Gövde satırı — okunmayan, yalnız ritmi gösteren mürekkep izi.
 *
 * `guclu` satırlar (sahne başlığı, karakter adı, bölüm başlığı) hem DAHA
 * KOYU hem DAHA KALIN. ÖLÇÜLDÜ: ilk turda fark yalnız opaklıktaydı (.52
 * karşı .2) ve 44 piksel genişliğinde bir minyatürde beş tip birbirinden
 * ayırt edilemiyordu — başlık, başlık gibi durmuyordu.
 */
function Satir({ x, y, w, guclu }: { x: number; y: number; w: number; guclu?: boolean }) {
  return (
    <rect
      x={x} y={y} width={w}
      height={guclu ? 2.2 : 1.6}
      fill={MUREKKEP}
      opacity={guclu ? 0.72 : 0.28}
    />
  );
}

/** Sekiz tipin her biri için sayfanın kendi ritmi. */
const CIZIMLER: Record<DokumanTipiAdi, React.ReactNode> = {
  /* Amerikan tek sütun: sahne başlığı sola dayalı ve güçlü, aksiyon tam
     genişlik, diyalog ortada dar bir sütun. */
  senaryo: (
    <>
      <Satir x={7} y={8} w={20} guclu />
      <Satir x={7} y={14} w={30} />
      <Satir x={7} y={18} w={25} />
      <Satir x={18} y={26} w={9} guclu />
      <Satir x={15} y={30} w={15} />
      <Satir x={15} y={34} w={12} />
      <Satir x={7} y={42} w={29} />
      <Satir x={7} y={46} w={19} />
    </>
  ),
  /* Dizi = senaryo + üstünde bölüm katmanı: ortalanmış başlık ve altında
     tam genişlik bir çizgi. */
  dizi: (
    <>
      <Satir x={15} y={7} w={14} guclu />
      <rect x={7} y={12} width={30} height={0.8} fill={MUREKKEP} opacity={0.3} />
      <Satir x={7} y={18} w={19} guclu />
      <Satir x={7} y={24} w={30} />
      <Satir x={18} y={32} w={9} guclu />
      <Satir x={15} y={36} w={15} />
      <Satir x={15} y={40} w={11} />
      <Satir x={7} y={47} w={26} />
    </>
  ),
  /* Sahne oyunu: aksiyonun yerinde SAHNE YÖNERGESİ — daha içeride ve
     daha soluk, çünkü kameranın gördüğü değil oyuncuya verilen yönerge. */
  'sahne-oyunu': (
    <>
      <Satir x={15} y={7} w={14} guclu />
      <Satir x={13} y={15} w={20} />
      <Satir x={13} y={19} w={15} />
      <Satir x={18} y={27} w={9} guclu />
      <Satir x={9} y={31} w={27} />
      <Satir x={9} y={35} w={24} />
      <Satir x={18} y={42} w={9} guclu />
      <Satir x={9} y={46} w={21} />
    </>
  ),
  /* Radyo oyunu: diyalog ağırlıklı, ve sol marjda ses/müzik bloklarının
     kare işaretleri — anlatının yarısı onlarda. */
  'radyo-oyunu': (
    <>
      <Satir x={7} y={8} w={18} guclu />
      <rect x={7} y={15} width={2.6} height={2.6} fill={MUREKKEP} opacity={0.5} />
      <Satir x={12} y={15.5} w={20} />
      <Satir x={18} y={23} w={9} guclu />
      <Satir x={15} y={27} w={16} />
      <Satir x={15} y={31} w={12} />
      <rect x={7} y={37} width={2.6} height={2.6} fill={MUREKKEP} opacity={0.5} />
      <Satir x={12} y={37.5} w={17} />
      <Satir x={18} y={44} w={9} guclu />
      <Satir x={15} y={48} w={14} />
    </>
  ),
  /* Roman: bölüm başlığı ortada, sonra tam genişlik paragraf — ilk satır
     girintili. Sayfa burada süre ölçmez, ritim de düzdür. */
  roman: (
    <>
      <Satir x={17} y={8} w={10} guclu />
      <Satir x={11} y={17} w={26} />
      <Satir x={7} y={21} w={30} />
      <Satir x={7} y={25} w={30} />
      <Satir x={7} y={29} w={22} />
      <Satir x={11} y={36} w={26} />
      <Satir x={7} y={40} w={30} />
      <Satir x={7} y={44} w={27} />
      <Satir x={7} y={48} w={16} />
    </>
  ),
  /* Çizgi roman: birim sahne değil SAYFA; sayfanın içinde kareler,
     karenin içinde balon. */
  'cizgi-roman': (
    <>
      <rect x={7} y={8} width={30} height={15} fill="none" stroke={MUREKKEP} strokeWidth={0.9} opacity={0.42} />
      <rect x={7} y={26} width={14} height={13} fill="none" stroke={MUREKKEP} strokeWidth={0.9} opacity={0.42} />
      <rect x={23} y={26} width={14} height={13} fill="none" stroke={MUREKKEP} strokeWidth={0.9} opacity={0.42} />
      <rect x={7} y={42} width={30} height={9} fill="none" stroke={MUREKKEP} strokeWidth={0.9} opacity={0.42} />
      <ellipse cx={16} cy={14} rx={5} ry={3.2} fill={MUREKKEP} opacity={0.22} />
      <Satir x={26} y={31} w={8} />
    </>
  ),
  /* Düz metin: tek blok, tek ritim. Biçim dayatmayan boş sayfa. */
  'duz-metin': (
    <>
      <Satir x={7} y={10} w={30} />
      <Satir x={7} y={16} w={30} />
      <Satir x={7} y={22} w={26} />
      <Satir x={7} y={30} w={30} />
      <Satir x={7} y={36} w={30} />
      <Satir x={7} y={42} w={21} />
    </>
  ),
  /* Fon başvuru dosyası: numaralı ek başlıkları ve altlarında düz
     paragraf. Sayfanın kenarında sayı var — bu bir form, bir anlatı değil. */
  'fon-dosyasi': (
    <>
      <rect x={7} y={8} width={2} height={2.2} fill={MUREKKEP} opacity={0.72} />
      <Satir x={11} y={8} w={17} guclu />
      <Satir x={7} y={14} w={30} />
      <Satir x={7} y={18} w={24} />
      <rect x={7} y={26} width={2} height={2.2} fill={MUREKKEP} opacity={0.72} />
      <Satir x={11} y={26} w={13} guclu />
      <Satir x={7} y={32} w={30} />
      <Satir x={7} y={36} w={30} />
      <Satir x={7} y={40} w={19} />
      <rect x={7} y={48} width={2} height={2.2} fill={MUREKKEP} opacity={0.72} />
      <Satir x={11} y={48} w={15} guclu />
    </>
  ),
  /* Fransız (iki sütun): solda görüntü, sağda ses; sahne başlığı ikisine
     birden düşer. Ayrım tam olarak BU — ve ancak görünce anlaşılır. */
  'goruntu-ses': (
    <>
      <Satir x={7} y={8} w={30} guclu />
      <rect x={22} y={14} width={0.8} height={37} fill={MUREKKEP} opacity={0.3} />
      <Satir x={7} y={17} w={12} />
      <Satir x={7} y={21} w={13} />
      <Satir x={7} y={25} w={9} />
      <Satir x={25} y={17} w={7} guclu />
      <Satir x={25} y={21} w={11} />
      <Satir x={25} y={25} w={8} />
      <Satir x={7} y={35} w={13} />
      <Satir x={7} y={39} w={10} />
      <Satir x={25} y={35} w={7} guclu />
      <Satir x={25} y={39} w={11} />
      <Satir x={25} y={43} w={9} />
    </>
  ),
};

export function SayfaOnizleme({ tip, boyut = 66 }: { tip: DokumanTipiAdi; boyut?: number }) {
  return (
    <svg
      data-testid={`sayfa-onizleme-${tip}`}
      width={(boyut * 44) / 58}
      height={boyut}
      viewBox="0 0 44 58"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={44} height={58} fill={KAGIT} />
      {CIZIMLER[tip]}
    </svg>
  );
}
