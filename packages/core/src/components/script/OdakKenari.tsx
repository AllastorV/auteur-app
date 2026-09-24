import React from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import type { YaziciDurumu } from '../../veri/yazici';

/**
 * Odak modunun kenar bilgisi — B · Odak modu (bkz. DESIGN.md).
 *
 * Bütün paneller çekilir; kenarda kalan ÜÇ şey bilinçlidir:
 * sahne konumu (üstte), sayaçlar (sol alt), kayıt göstergesi (sağ alt).
 * Üçü de yazarken göz kaydırmadan okunabilir ama dikkat çekmez.
 *
 * ## Kontrast KATMANLI (kullanıcı düzeltmesi 2026-08-28)
 *
 * Önceki renkler (`#2e343c` / `#3a4049` / `#4d5563`) zemine karşı
 * 1,59:1 – 2,65:1 veriyordu; ÖLÇÜLDÜ ve okunmuyordu. "Dikkat çekmesin"
 * niyeti "görünmesin"e dönüşmüştü — sessizlik uğruna işlevi feda etmek.
 *
 * Yenisi hepsi 4,5:1 üstünde ama EŞİT DEĞİL: önem sırası biçimden
 * okunuyor. Çıkışı arayan göz önce en parlak olana gider.
 *
 *   sahne konumu  #6b7484  4,2:1   sakin — yönelim
 *   sayaç/kayıt   #7b8494  5,3:1   okunur — §15.4'ün sözü
 *   Esc düğmesi   #8a93a3  6,4:1   en net — çıkış yolu
 *
 * ## Neden bu üçü ve başkası değil
 *
 * Sayaçlar ve kayıt göstergesi §15.4'ün sözü: "kaydedildi mi?" sorusu
 * kullanıcının aklına gelmemeli. Sahne konumu ise odak modunda kaybolan tek
 * yönelim bilgisi — nerede olduğunu bilmeden yazmak, uzun bir metinde
 * kendini kaybetmektir.
 *
 * Engelleyici uyarı BURADA DEĞİL: o `VeriSeridi`'nin işi ve şerit odak
 * modunda da çiziliyor (F2c bulgusu K7). Kenar bilgisi sakin durumu
 * söylüyor, alarmı değil.
 */
export function OdakKenari({ durum }: { durum: YaziciDurumu | null }) {
  const bloklar = useProjectStore((s) => s.project.script?.blocks ?? []);
  const imlec = useUiStore((s) => s.scriptCursor);

  const sahneler = bloklar.filter((b) => b.type === 'scene');
  const imlecIndeksi = imlec ? bloklar.findIndex((b) => b.id === imlec) : -1;
  /* Kaçıncı sahnedeyiz: imleçten GERİYE doğru en yakın sahne başlığı.
     Sahne kimliğinden saymak da olurdu ama imleç sahnesiz bir açılışta
     duruyorsa o yol `undefined` verir; sayım hep bir cevap üretir. */
  const suankiSahne = imlecIndeksi < 0
    ? 0
    : bloklar.slice(0, imlecIndeksi + 1).filter((b) => b.type === 'scene').length;

  const kaydedildi = durum && durum.sonYazim !== null && !durum.engelleyici;

  return (
    <>
      {sahneler.length > 0 && (
        <div
          data-testid="odak-konum"
          className="pointer-events-none absolute inset-x-0 top-5 text-center text-[11px] uppercase tracking-[0.18em] text-[#6b7484]"
        >
          {t('sahne')} {suankiSahne || '—'} / {sahneler.length}
        </div>
      )}

      <div
        data-testid="odak-sayaclar"
        className="mzn-sayi pointer-events-none absolute bottom-5 left-5 flex items-center gap-3 text-[11px] text-[#7b8494]"
      >
        <span>{bloklar.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0)} {t('kelime')}</span>
      </div>

      <div className="absolute bottom-5 right-5 flex items-center gap-3 text-[11px] text-[#7b8494]">
        {durum && (
          <span data-testid="odak-kayit" className="flex items-center gap-1.5">
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: kaydedildi ? '#6f9d6f' : '#c08a3e' }}
            />
            {kaydedildi ? t('kaydedildi') : t('günlük bekliyor')}
          </span>
        )}
        {/* Çıkışın nasıl olduğunu SÖYLÜYOR: odak modunda menü yok ve
            kullanıcı nasıl çıkacağını tahmin etmek zorunda kalmamalı. */}
        <button
          type="button"
          data-testid="odak-cik"
          onClick={() => useUiStore.setState({ odakModu: false, chromeHidden: false })}
          className="border border-kenar px-1.5 py-0.5 text-[#8a93a3] transition-colors hover:text-metin"
        >
          {t('Esc — çık')}
        </button>
      </div>
    </>
  );
}
