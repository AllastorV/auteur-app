import React from 'react';
import { Group, Line, Path, Rect } from 'react-konva';
import { REHBER_OPAKLIK, REHBER_RENK, type FrameGuideSettings } from '../../model/types';
import { goldenSpiralGeometry } from '../../render/goldenSpiral';

interface Props {
  width: number;
  height: number;
  guides: FrameGuideSettings;
}

/**
 * Çerçeve rehberleri — kompozisyon kuralları ve güvenli alanlar.
 *
 * ## Renk KULLANICININ
 *
 * Önceden üç renk koda gömülüydü (gök mavisi, sarı, pembe): üçü de paletin
 * dışındaydı ve hiçbiri değiştirilemiyordu. Artık tek renk + tek opaklık
 * hepsini yönetiyor; kullanıcı çizimine göre ayarlıyor — açık bir kare
 * üzerinde açık mavi rehber görünmez, koyu bir karede koyu rehber de.
 *
 * Güvenli alanlar renkten değil ÇİZGİ DESENİNDEN ayrılıyor: aksiyon uzun
 * kesikli, başlık kısa kesikli, kompozisyon kuralları sürekli. Desen
 * ayrımı kullanıcı rengi değiştirdiğinde de ayakta kalır; renk ayrımı
 * kalmazdı.
 *
 * ## Kurallar
 *
 * Üçler kuralı yanında altın oran, altın spiral, çapraz yöntem, harmonik
 * üçgenler ve simetri ekseni. Hepsi aynı çerçeve ölçüsünden türüyor —
 * ikinci bir geometri hesabı yok.
 */
export const FrameGuides = React.memo(function FrameGuides({ width, height, guides }: Props) {
  if (!guides.enabled) return null;

  const renk = guides.renk ?? REHBER_RENK;
  const opaklik = guides.opaklik ?? REHBER_OPAKLIK;
  const ortak = { stroke: renk, opacity: opaklik, listening: false as const };

  const items: React.ReactNode[] = [];

  /* --------------------------- üçler kuralı --------------------------- */
  if (guides.thirds) {
    for (let i = 1; i < 3; i++) {
      items.push(
        <Line key={`tv${i}`} points={[(width * i) / 3, 0, (width * i) / 3, height]} strokeWidth={1} {...ortak} />,
        <Line key={`th${i}`} points={[0, (height * i) / 3, width, (height * i) / 3]} strokeWidth={1} {...ortak} />,
      );
    }
  }

  /* --------------------------- altın oran ----------------------------- */
  if (guides.altinOran) {
    /* 1 : 0,618 : 1 — kenarlardan içeri 0,382 ve 0,618. Üçler kuralının
       çizgileri 0,333/0,667'de; ikisi birlikte açıkken aradaki fark
       görülebilsin diye ölçüler yuvarlanmıyor. */
    for (const o of [0.382, 0.618]) {
      items.push(
        <Line key={`av${o}`} points={[width * o, 0, width * o, height]} strokeWidth={1} {...ortak} />,
        <Line key={`ah${o}`} points={[0, height * o, width, height * o]} strokeWidth={1} {...ortak} />,
      );
    }
  }

  /* --------------------------- altın spiral --------------------------- */
  if (guides.altinSpiral) {
    items.push(
      <Path key="spiral" data={goldenSpiralGeometry(width, height).path} strokeWidth={1.2} {...ortak} />,
    );
  }

  /* --------------------------- çapraz yöntem -------------------------- */
  if (guides.capraz) {
    /* Dört köşeden 45°. Kare olmayan çerçevede çizgiler karşı kenara
       varmadan biter — yöntem zaten kısa kenarla sınırlıdır. */
    const k = Math.min(width, height);
    items.push(
      <Line key="c1" points={[0, 0, k, k]} strokeWidth={1} {...ortak} />,
      <Line key="c2" points={[width, 0, width - k, k]} strokeWidth={1} {...ortak} />,
      <Line key="c3" points={[0, height, k, height - k]} strokeWidth={1} {...ortak} />,
      <Line key="c4" points={[width, height, width - k, height - k]} strokeWidth={1} {...ortak} />,
    );
  }

  /* ------------------------ harmonik üçgenler ------------------------- */
  if (guides.harmonik) {
    /* Ana köşegen ve öteki iki köşeden ona inen dikler. Dik ayağı:
       köşegen üzerindeki izdüşüm. */
    const d2 = width * width + height * height;
    const ayak = (px: number, py: number) => {
      const t = (px * width + py * height) / d2;
      return [width * t, height * t];
    };
    const [ax, ay] = ayak(width, 0);
    const [bx, by] = ayak(0, height);
    items.push(
      <Line key="h0" points={[0, 0, width, height]} strokeWidth={1} {...ortak} />,
      <Line key="h1" points={[width, 0, ax, ay]} strokeWidth={1} {...ortak} />,
      <Line key="h2" points={[0, height, bx, by]} strokeWidth={1} {...ortak} />,
    );
  }

  /* --------------------------- simetri ekseni ------------------------- */
  if (guides.simetri) {
    items.push(
      <Line key="sv" points={[width / 2, 0, width / 2, height]} strokeWidth={1} {...ortak} />,
      <Line key="sh" points={[0, height / 2, width, height / 2]} strokeWidth={1} {...ortak} />,
    );
  }

  /* --------------------------- güvenli alanlar ------------------------ */
  if (guides.actionSafe) {
    const mx = width * 0.05;
    const my = height * 0.05;
    items.push(
      <Rect
        key="action"
        x={mx} y={my} width={width - mx * 2} height={height - my * 2}
        strokeWidth={1.5} dash={[10, 6]} {...ortak}
      />,
    );
  }

  if (guides.titleSafe) {
    const mx = width * 0.1;
    const my = height * 0.1;
    items.push(
      <Rect
        key="title"
        x={mx} y={my} width={width - mx * 2} height={height - my * 2}
        strokeWidth={1.5} dash={[4, 5]} {...ortak}
      />,
    );
  }

  /* --------------------------- merkez çapraz -------------------------- */
  if (guides.centerCross) {
    const s = Math.min(width, height) * 0.06;
    items.push(
      <Line key="cx" points={[width / 2 - s, height / 2, width / 2 + s, height / 2]} strokeWidth={1.5} {...ortak} />,
      <Line key="cy" points={[width / 2, height / 2 - s, width / 2, height / 2 + s]} strokeWidth={1.5} {...ortak} />,
    );
  }

  return <Group listening={false} clipX={0} clipY={0} clipWidth={width} clipHeight={height}>{items}</Group>;
});
