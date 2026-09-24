import React, { useMemo } from 'react';
/* Yerel `t` TERİM TABLOSU (dile göre döküm başlıkları) — çeviri işlevi
   takma adla alınıyor ki ikisi çakışmasın. */
import { t as ceviri } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { usePlatform } from '../../platform/context';
import { blogaGit } from '../../store/mod';
import * as M from '../../doc/mutations';
import { breakdownSatirlariniCikar, type BreakdownSatiri } from '../../model/breakdown';
import { katmanCoz, KATMANLAR, KATMAN_ADLARI } from '../../model/zaman-katmani';
import { safeFileName } from '../../model/project-io';
import { breakdownCsvYaz, breakdownMarkdownYaz } from '../../disa/breakdown';
import { TERIMLER } from '../../format/terim';
import type { DilAdi } from '../../format/profil';
import { downloadBlob } from '../../util/indir';

/**
 * Çekim dökümü (breakdown) sekmesi — §13.2 borcu (F8).
 *
 * OTOMATİK toplanan (karakter, mekân, iç/dış, zaman — `model/breakdown.ts`)
 * ile ELLE girilen (özel eşya, kostüm, efekt, süre tahmini, notlar) AYRI
 * bölümde gösteriliyor: kullanıcı hangisinin kendi kararı olduğunu bilmeli
 * (görev tanımı). `KadroSekmesi` ile aynı desen: gezinme `blogaGit`.
 */
export function BreakdownSekmesi() {
  const doc = useProjectStore((s) => s.doc);
  const bloklar = useProjectStore((s) => s.project.script?.blocks) ?? [];
  const breakdown = useProjectStore((s) => s.breakdown);
  const proje = useProjectStore((s) => s.project);
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const dil = useUiStore((s) => s.scriptLang);

  const satirlar = useMemo(
    () => breakdownSatirlariniCikar(bloklar, dil, breakdown),
    [bloklar, dil, breakdown],
  );

  const disaAktar = async (bicim: 'csv' | 'md') => {
    const metin = bicim === 'csv' ? breakdownCsvYaz(satirlar, dil) : breakdownMarkdownYaz(satirlar, dil);
    const ad = `${safeFileName(proje.script.name || proje.meta.name)}_dokum.${bicim}`;
    const bytes = new TextEncoder().encode(metin);
    if (platform.dosyaKaydet) {
      const res = await platform.dosyaKaydet({
        bytes, dosyaAdi: ad, turAdi: bicim === 'csv' ? 'CSV' : 'Markdown', uzantilar: [bicim],
      });
      if (res.cancelled) showToast(ceviri('Dışa aktarma iptal edildi.'), 'info');
      else if (res.path) showToast(`Kaydedildi: ${res.path}`, 'success');
      return;
    }
    downloadBlob(new Blob([bytes as BlobPart], { type: 'text/plain' }), ad);
    showToast(`${ad} indirildi.`, 'success');
  };

  return (
    <section data-testid="breakdown-sekmesi" className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="mzn-etiket">{ceviri('Çekim dökümü')}</h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            data-testid="breakdown-disa-csv"
            onClick={() => void disaAktar('csv')}
            className="mzn-denetim px-2 py-1 text-[10px]"
          >
            CSV
          </button>
          <button
            type="button"
            data-testid="breakdown-disa-md"
            onClick={() => void disaAktar('md')}
            className="mzn-denetim px-2 py-1 text-[10px]"
          >
            Markdown
          </button>
        </div>
      </div>

      {satirlar.length === 0 ? (
        <p className="pb-4 text-[11px] text-metin-cok-zayif">{ceviri('Senaryoda hiç sahne yok.')}</p>
      ) : (
        <ul className="space-y-3">
          {satirlar.map((satir) => (
            <BreakdownSatirKarti
              key={satir.sceneId || satir.sira}
              satir={satir}
              onDegis={(patch) => M.breakdownEkiGuncelle(doc, satir.sceneId, patch)}
              dil={dil}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function listeGirdisi(deger: string): string[] {
  return deger.split(',').map((s) => s.trim()).filter(Boolean);
}

function BreakdownSatirKarti({
  satir,
  onDegis,
  dil,
}: {
  satir: BreakdownSatiri;
  onDegis: (patch: Partial<BreakdownSatiri['ek']>) => void;
  dil: DilAdi;
}) {
  const t = TERIMLER[dil];
  return (
    <li data-testid={`breakdown-sahne-${satir.sira}`} className="border border-kenar-ic p-2">
      <button
        type="button"
        data-testid={`breakdown-git-${satir.sira}`}
        disabled={!satir.ilkBlokId}
        onClick={() => satir.ilkBlokId && blogaGit(satir.ilkBlokId)}
        className="mb-1.5 block w-full truncate text-left text-[12px] font-medium text-metin-guclu disabled:opacity-40"
      >
        {satir.sira + 1}. {ceviri(satir.baslik)}
      </button>

      {/* OTOMATİK — senaryodan türüyor, elle değiştirilemez. */}
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-metin-cok-zayif">
        <span className="mzn-sayi uppercase">{ceviri('Otomatik')}</span>
        {satir.mekan && <span>{t.mekan[satir.icDis]} · {satir.mekan}</span>}
        {satir.zaman && <span>{t.zaman[satir.zaman]}</span>}
        {satir.karakterler.length > 0 && <span>{satir.karakterler.join(', ')}</span>}
      </div>

      {/* ELLE — Yjs'te sceneId'yle saklanır, senaryodan türemez. */}
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-[10px] text-metin-etiket">
          <span className="mzn-sayi w-20 shrink-0 uppercase">{ceviri('Süre (dk)')}</span>
          <input
            type="number"
            min={0}
            data-testid={`breakdown-sure-${satir.sira}`}
            value={satir.ek.sureTahmini ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onDegis({ sureTahmini: v === '' ? null : Number(v) });
            }}
            className="w-16 bg-denetim px-1.5 py-0.5 text-[11px] text-metin outline-none"
          />
        </label>

        {/* ZAMAN KATMANI — analiz panosunun tek elle girilen ölçüsü.
            Burada duruyor çünkü geriye dönüş bir YAPIM verisidir: kostümü,
            makyajı, grade'i değiştirir. Ayrı bir etiketleme ekranı açmak
            aynı sahneyi iki yerde işaretlemek olurdu. */}
        <label className="flex items-center gap-1.5 text-[10px] text-metin-etiket">
          <span className="mzn-sayi w-20 shrink-0 uppercase">{ceviri('Zaman')}</span>
          <select
            data-testid={`breakdown-katman-${satir.sira}`}
            value={satir.ek.zamanKatmani}
            onChange={(e) => onDegis({ zamanKatmani: katmanCoz(e.target.value) })}
            className="bg-denetim px-1.5 py-0.5 text-[11px] text-metin outline-none"
          >
            {KATMANLAR.map((k) => (
              <option key={k} value={k}>{ceviri(KATMAN_ADLARI[k])}</option>
            ))}
          </select>
          {satir.ek.zamanKatmani !== 'simdi' && (
            <>
              <span className="mzn-sayi shrink-0 uppercase">{ceviri('Hikâye sırası')}</span>
              <input
                type="number"
                data-testid={`breakdown-hikaye-${satir.sira}`}
                value={satir.ek.hikayeSirasi ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onDegis({ hikayeSirasi: v === '' ? null : Number(v) });
                }}
                className="w-14 bg-denetim px-1.5 py-0.5 text-[11px] text-metin outline-none"
              />
            </>
          )}
        </label>

        <ListeAlani
          etiket={ceviri('Özel eşya')}
          testId={`breakdown-esya-${satir.sira}`}
          deger={satir.ek.ozelEsya}
          onDegis={(v) => onDegis({ ozelEsya: v })}
        />
        <ListeAlani
          etiket={ceviri('Kostüm')}
          testId={`breakdown-kostum-${satir.sira}`}
          deger={satir.ek.kostum}
          onDegis={(v) => onDegis({ kostum: v })}
        />
        <ListeAlani
          etiket={ceviri('Efekt')}
          testId={`breakdown-efekt-${satir.sira}`}
          deger={satir.ek.efekt}
          onDegis={(v) => onDegis({ efekt: v })}
        />
        <label className="flex items-start gap-1.5 text-[10px] text-metin-etiket">
          <span className="mzn-sayi w-20 shrink-0 uppercase pt-0.5">{ceviri('Notlar')}</span>
          <textarea
            data-testid={`breakdown-notlar-${satir.sira}`}
            value={satir.ek.notlar}
            onChange={(e) => onDegis({ notlar: e.target.value })}
            rows={2}
            className="w-full min-w-0 flex-1 bg-denetim px-1.5 py-1 text-[11px] text-metin outline-none"
          />
        </label>
      </div>
    </li>
  );
}

/** Virgülle ayrılmış serbest metin listesi — özel eşya/kostüm/efekt ÜÇÜ de aynı girdi şekli. */
function ListeAlani({
  etiket, testId, deger, onDegis,
}: {
  etiket: string; testId: string; deger: string[]; onDegis: (v: string[]) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-metin-etiket">
      <span className="mzn-sayi w-20 shrink-0 uppercase">{etiket}</span>
      <input
        type="text"
        data-testid={testId}
        defaultValue={deger.join(', ')}
        placeholder={ceviri('virgülle ayır')}
        onBlur={(e) => onDegis(listeGirdisi(e.target.value))}
        className="w-full min-w-0 flex-1 bg-denetim px-1.5 py-0.5 text-[11px] text-metin outline-none"
      />
    </label>
  );
}
