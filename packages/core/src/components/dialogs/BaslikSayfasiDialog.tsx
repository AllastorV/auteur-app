import React, { useState } from 'react';
import { t } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { useProjectStore } from '../../store/project';
import * as M from '../../doc/mutations';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { ORAN, type BaslikSayfasi } from '../../disa/baslik-sayfasi';
import { ILETISIM_SATIR_EN_COK } from '../../model/baslik-sayfasi';

/**
 * Başlık sayfası ekranı — §16.2 borcu, §14 "Başlık sayfası düzenleyici" (F1).
 *
 * Bilgiler PROJEDE saklanır (`baslikSayfasiMap`, §16.2) ve `ExportDialog`
 * dışa aktarımda buradan besleniyor — her seferinde yeniden yazılmıyor.
 *
 * Canlı önizleme `disa/baslik-sayfasi.ts`teki `ORAN` sabitini KULLANIYOR,
 * kendi yerleşim oranlarını YAZMIYOR (Karar 2) — ikinci bir kopya yazılsaydı
 * biri düzeltilip öteki unutulduğunda önizleme PDF'ten sessizce ıraksardı.
 */
export function BaslikSayfasiDialog({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  const kayit = useProjectStore((s) => s.baslikSayfasi);
  const { profil } = useSenaryoProfili();

  // Yerel taslak: alan başına AYRI mutasyon, her tuşta transact açmamak için
  // yalnız değişen alan `onBlur`da yazılır — Y.Map zaten alan bazlı (bkz.
  // `baslikSayfasiGuncelle`), burada yalnız gereksiz transaction sıklığı
  // engelleniyor.
  const [taslak, setTaslak] = useState<BaslikSayfasi>(kayit);
  const alan = (k: keyof BaslikSayfasi, v: string) => setTaslak((t) => ({ ...t, [k]: v }));
  const yaz = (k: keyof BaslikSayfasi) => M.baslikSayfasiGuncelle(doc, { [k]: taslak[k] });

  const iletisim = taslak.iletisim ?? [];
  const iletisimYaz = (satirlar: string[]) => {
    setTaslak((t) => ({ ...t, iletisim: satirlar }));
    M.baslikSayfasiGuncelle(doc, { iletisim: satirlar });
  };

  /* `written by` / `yazan` — `baslikSayfasiCiz`deki AYNI kural (disa/baslik-sayfasi.ts),
     ikinci bir tabloya YAZILMIYOR: tek satırlık bir koşul, ayrı bir sabit
     kütüphanesi gerektirmiyor. */
  const yazanEtiketi = profil.dil === 'tr' ? 'yazan' : 'written by';

  return (
    <Modal title={t('Başlık Sayfası')} onClose={onClose} width={780} footer={<Button variant="primary" onClick={onClose}>{t('Kapat')}</Button>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <Alan etiket={t('Başlık')} testId="baslik-sayfasi-baslik" value={taslak.baslik}
            onChange={(v) => alan('baslik', v)} onBlur={() => yaz('baslik')} />
          <Alan etiket={t('Alt başlık')} testId="baslik-sayfasi-altbaslik" value={taslak.altBaslik ?? ''}
            onChange={(v) => alan('altBaslik', v)} onBlur={() => yaz('altBaslik')} />
          <Alan etiket="Yazar" testId="baslik-sayfasi-yazar" value={taslak.yazar ?? ''}
            onChange={(v) => alan('yazar', v)} onBlur={() => yaz('yazar')} />
          <Alan etiket={t('Sürüm')} testId="baslik-sayfasi-surum" value={taslak.surum ?? ''}
            onChange={(v) => alan('surum', v)} onBlur={() => yaz('surum')}
            placeholder={t('1. taslak, 2026-08-26…')} />

          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-metin-etiket">
              {t('İletişim (sol alt köşe)')}
            </p>
            <div className="space-y-1">
              {[...iletisim, ''].slice(0, ILETISIM_SATIR_EN_COK).map((satir, i) => (
                <input
                  key={i}
                  type="text"
                  data-testid={`baslik-sayfasi-iletisim-${i}`}
                  value={satir}
                  placeholder={t('ör. Ajans adı / telefon / e-posta')}
                  onChange={(e) => {
                    const yeni = [...iletisim];
                    yeni[i] = e.target.value;
                    iletisimYaz(yeni.filter((s, j) => s !== '' || j < iletisim.length));
                  }}
                  className="w-full bg-denetim px-2 py-1 text-xs text-metin outline-none ring-amber focus:ring-1"
                />
              ))}
            </div>
          </div>
        </div>

        <OnizlemeSayfasi bilgi={taslak} yazanEtiketi={yazanEtiketi} cssAilesi={profil.yazi.cssAilesi}
          genislikMm={profil.geometri.sayfaGenislikMm} yukseklikMm={profil.geometri.sayfaYukseklikMm}
          solMm={profil.geometri.solMm} sagMm={profil.geometri.sagMm} />
      </div>
    </Modal>
  );
}

function Alan({
  etiket, testId, value, onChange, onBlur, placeholder,
}: {
  etiket: string; testId: string; value: string; onChange: (v: string) => void;
  onBlur: () => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-metin-etiket">{etiket}</span>
      <input
        type="text"
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full bg-denetim px-2 py-1.5 text-xs text-metin outline-none ring-amber focus:ring-1"
      />
    </label>
  );
}

/**
 * Canlı önizleme — `baslikSayfasiCiz`in PDF'e çizdiğinin ekran karşılığı.
 *
 * Oranlar `ORAN`dan (bkz. yukarı) yüzdeye çevriliyor. PDF y-ekseni ALTTAN
 * yukarı sayar (`y = yükseklik*(1-oran)` demek EKRANDA `top: oran*100%`);
 * `iletisimAlt`/`surumAlt` zaten "alttan" adıyla `bottom` yüzdesi — ikisi
 * `baslikSayfasiCiz`teki İKİ farklı hesabın (bkz. o dosyadaki yorum) birebir
 * aynısı, burada TEKRAR HESAPLANMIYOR, yalnız koordinat sistemi çevriliyor.
 */
function OnizlemeSayfasi({
  bilgi, yazanEtiketi, cssAilesi, genislikMm, yukseklikMm, solMm, sagMm,
}: {
  bilgi: BaslikSayfasi; yazanEtiketi: string; cssAilesi: string;
  genislikMm: number; yukseklikMm: number; solMm: number; sagMm: number;
}) {
  const soranYuzde = (v: number) => `${v * 100}%`;
  return (
    <div
      data-testid="baslik-sayfasi-onizleme"
      className="relative mx-auto w-full self-start bg-[var(--mzn-kagit,#f7f5f0)] text-[var(--mzn-kagit-metin,#1c1a17)] shadow-[0_4px_20px_rgba(0,0,0,.35)]"
      style={{ aspectRatio: `${genislikMm} / ${yukseklikMm}`, fontFamily: cssAilesi }}
    >
      <p className="absolute w-full px-[6%] text-center font-bold uppercase tracking-wide"
        style={{ top: soranYuzde(ORAN.baslikUst), fontSize: '5.5%' }}>
        {bilgi.baslik || t('(başlıksız)')}
      </p>
      {bilgi.altBaslik && (
        <p className="absolute w-full px-[6%] text-center" style={{ top: soranYuzde(ORAN.altBaslikUst), fontSize: '3.2%' }}>
          {bilgi.altBaslik}
        </p>
      )}
      {bilgi.yazar && (
        <>
          <p className="absolute w-full px-[6%] text-center" style={{ top: soranYuzde(ORAN.yazanUst), fontSize: '3.2%' }}>
            {yazanEtiketi}
          </p>
          <p className="absolute w-full px-[6%] text-center" style={{ top: soranYuzde(ORAN.yazarUst), fontSize: '3.2%' }}>
            {bilgi.yazar}
          </p>
        </>
      )}
      {(bilgi.iletisim ?? []).filter(Boolean).length > 0 && (
        <div
          className="absolute text-left leading-snug"
          style={{
            left: `${(solMm / genislikMm) * 100}%`,
            bottom: soranYuzde(ORAN.iletisimAlt),
            fontSize: '2.6%',
          }}
        >
          {(bilgi.iletisim ?? []).filter(Boolean).map((satir, i) => <div key={i}>{satir}</div>)}
        </div>
      )}
      {bilgi.surum && (
        <p
          className="absolute text-right"
          style={{ right: `${(sagMm / genislikMm) * 100}%`, bottom: soranYuzde(ORAN.surumAlt), fontSize: '2.6%' }}
        >
          {bilgi.surum}
        </p>
      )}
    </div>
  );
}
