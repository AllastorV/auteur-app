import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { unpackProject } from '../../model/project-io';
import * as M from '../../doc/mutations';
import {
  bloklariKarsilastir,
  farkOzeti,
  sahnelereBol,
  type BlokFarki,
} from '../../model/karsilastir';
import type { HistoryVersion } from '../../platform/types';
import type { ScriptBlock } from '../../model/script';

/**
 * İki sürümü karşılaştırma ve SEÇEREK geri getirme — F3.
 *
 * ## Neden "seçerek"
 *
 * Sürüm geçmişi bugüne kadar hepsi-ya-da-hiçbiri idi: bir sahneyi geri
 * istemek için bütün belgeyi geri almak gerekiyordu ve aradaki bütün iş
 * gidiyordu. Yazarın gerçek ihtiyacı "şu sahneyi dünkü hâline döndür".
 *
 * ## Geri getirme MEVCUT belgeye uygulanıyor
 *
 * Eski sürümü yüklemek değil, seçilen blokları mevcut belgeye YAZMAK.
 * Yüklemek olsaydı seçilmeyen her şey de eski hâline dönerdi — "seçerek"
 * sözü tutulmazdı. Uygulama tek `setScript` çağrısı, yani tek geri alma
 * adımı: yanlış seçim ucuz.
 */
export function KarsilastirDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const projectId = useProjectStore((s) => s.project.meta.id);
  const showToast = useUiStore((s) => s.showToast);
  const mevcut = useProjectStore((s) => s.project.script?.blocks ?? []);

  const [surumler, setSurumler] = useState<HistoryVersion[]>([]);
  const [secilenId, setSecilenId] = useState<string>('');
  const [eskiBloklar, setEskiBloklar] = useState<ScriptBlock[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [secim, setSecim] = useState<Set<string>>(new Set());

  useEffect(() => {
    platform.listVersions(projectId).then(setSurumler).catch(() => setSurumler([]));
  }, [platform, projectId]);

  useEffect(() => {
    if (!secilenId) { setEskiBloklar(null); return; }
    let iptal = false;
    setYukleniyor(true);
    setHata(null);
    void (async () => {
      try {
        const veri = await platform.restoreVersion(projectId, secilenId);
        if (!veri) throw new Error(t('Sürüm okunamadı.'));
        const paket = await unpackProject(veri);
        if (!iptal) setEskiBloklar(paket.project.script?.blocks ?? []);
      } catch (err) {
        if (!iptal) setHata(err instanceof Error ? err.message : String(err));
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [platform, projectId, secilenId]);

  const farklar = useMemo(
    () => (eskiBloklar ? bloklariKarsilastir(eskiBloklar, mevcut) : []),
    [eskiBloklar, mevcut],
  );
  const sahneler = useMemo(() => sahnelereBol(farklar), [farklar]);
  const ozet = useMemo(() => farkOzeti(farklar), [farklar]);

  const cevir = (blockId: string) =>
    setSecim((s) => {
      const y = new Set(s);
      if (y.has(blockId)) y.delete(blockId); else y.add(blockId);
      return y;
    });

  /**
   * Seçilen blokları ESKİ hâline döndürür.
   *
   * Üç durum ayrı: değişen blok eski metnine döner, silinen blok eski
   * yerine geri konur, eklenen blok kaldırılır. "Eski listeyi yaz" demek
   * seçilmeyenleri de geri alırdı.
   */
  const geriGetir = useCallback(() => {
    if (!eskiBloklar || !secim.size) return;
    const eskiIndeks = new Map(eskiBloklar.map((b, i) => [b.id, { blok: b, sira: i }]));
    const sonuc: ScriptBlock[] = [];

    /* Silinenler eski KOMŞULUKLARINA geri konuyor: sona eklemek, geri
       getirilen sahneyi belgenin sonunda bırakırdı. */
    const geriGelecek = eskiBloklar.filter(
      (b) => secim.has(b.id) && !mevcut.some((m) => m.id === b.id),
    );
    let sonrakiGeri = 0;

    for (const blok of mevcut) {
      while (
        sonrakiGeri < geriGelecek.length &&
        eskiIndeks.get(geriGelecek[sonrakiGeri].id)!.sira < (eskiIndeks.get(blok.id)?.sira ?? Infinity)
      ) {
        sonuc.push({ ...geriGelecek[sonrakiGeri] });
        sonrakiGeri++;
      }
      if (!secim.has(blok.id)) { sonuc.push(blok); continue; }
      const eski = eskiIndeks.get(blok.id);
      // Eski sürümde yoksa bu blok EKLENMİŞ demektir: geri getirmek = kaldırmak.
      if (eski) sonuc.push({ ...eski.blok });
    }
    for (; sonrakiGeri < geriGelecek.length; sonrakiGeri++) {
      sonuc.push({ ...geriGelecek[sonrakiGeri] });
    }

    M.setScript(useProjectStore.getState().doc, {
      name: useProjectStore.getState().project.script?.name ?? '',
      blocks: sonuc,
    });
    showToast(tf('%d satır geri getirildi.', secim.size), 'success');
    setSecim(new Set());
  }, [eskiBloklar, mevcut, secim, showToast]);

  return (
    <Modal
      title={t('Sürümleri karşılaştır')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Kapat')}</Button>
          <Button
            variant="primary"
            data-testid="secileni-geri-getir"
            disabled={!secim.size}
            onClick={geriGetir}
          >
            {t('Seçileni geri getir')}{secim.size ? ` (${secim.size})` : ''}
          </Button>
        </>
      }
    >
      {/* SÜRÜM YOKKA boş bir açılır liste gösterilmiyor.
          Kullanıcı "Seç…" yazan ama içi boş bir kutuya bakıp neyi yanlış
          yaptığını düşünürdü; sorun onda değil, karşılaştırılacak bir şey
          henüz yok. Sürüm geçmişi diyaloğu aynı durumu zaten böyle
          söylüyor — iki yer aynı dili konuşuyor. */}
      {surumler.length === 0 ? (
        <p data-testid="karsilastir-bos" className="py-4 text-center text-[12px] leading-relaxed text-metin-zayif">
          {t('Karşılaştırılacak sürüm yok.')}<br />
          {t('Proje 60 saniyede bir otomatik kaydedilir; ilk sürüm oluştuğunda burada listelenir.')}
        </p>
      ) : (
      <label className="mb-2 flex items-center gap-2">
        <span className="mzn-etiket shrink-0">{t('Sürüm')}</span>
        <select
          data-testid="karsilastir-surum"
          value={secilenId}
          className="mzn-denetim min-w-0 flex-1 px-1.5 py-1 text-[12px]"
          onChange={(e) => { setSecilenId(e.target.value); setSecim(new Set()); }}
        >
          <option value="">{t('Seç…')}</option>
          {surumler.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} · {new Date(v.savedAt).toLocaleString('tr-TR')}
            </option>
          ))}
        </select>
      </label>
      )}

      {yukleniyor && <p className="text-[11px] text-metin-zayif">{t('Sürüm okunuyor…')}</p>}
      {hata && <p data-testid="karsilastir-hata" className="text-[11px] text-amber-400">{hata}</p>}

      {eskiBloklar && !ozet.fark && (
        <p data-testid="fark-yok" className="py-4 text-center text-[11px] text-metin-etiket">
          {t('Bu sürümle aradaki senaryo farkı yok.')}
        </p>
      )}

      {eskiBloklar && ozet.fark && (
        <>
          <p data-testid="fark-ozeti" className="mb-2 text-[11px] text-metin-zayif">
            {tf('%d eklendi · %d silindi · %d değişti', ozet.eklenen, ozet.silinen, ozet.degisen)}
            {ozet.tasinan > 0 && ` · ${tf('%d taşındı', ozet.tasinan)}`}
          </p>
          <div className="max-h-80 overflow-y-auto">
            {sahneler.filter((s) => s.degisti).map((sahne, i) => (
              <section key={`${sahne.sceneId}-${i}`} className="mb-2">
                <h3 className="mb-1 text-[11px] font-semibold text-amber-300">
                  {sahne.baslik || t('(başlıksız sahne)')}
                </h3>
                <ul className="space-y-0.5">
                  {sahne.bloklar.filter((f) => f.tur !== 'ayni').map((f) => (
                    <li key={f.blockId}>
                      <label className="flex items-start gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          data-testid={`fark-sec-${f.blockId}`}
                          checked={secim.has(f.blockId)}
                          onChange={() => cevir(f.blockId)}
                        />
                        <FarkSatiri fark={f} />
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const ETIKET = () => ({
  eklendi: { ad: t('yeni'), renk: 'text-emerald-400' },
  silindi: { ad: t('silindi'), renk: 'text-red-400' },
  degisti: { ad: t('değişti'), renk: 'text-amber-400' },
  tasindi: { ad: t('taşındı'), renk: 'text-amber' },
  ayni: { ad: '', renk: '' },
}) as const;

/**
 * Tek satırlık fark gösterimi.
 *
 * Değişen blokta İKİ metin de gösteriliyor: yalnız yenisini göstermek,
 * kullanıcıya neyi geri getireceğini söylemezdi.
 */
function FarkSatiri({ fark }: { fark: BlokFarki }) {
  const e = ETIKET()[fark.tur];
  return (
    <span className="min-w-0 flex-1">
      <span className={`mr-1 text-[10px] ${e.renk}`}>[{e.ad}]</span>
      {fark.tur === 'degisti' ? (
        <>
          <span className="text-metin-etiket line-through">{fark.onceki!.text}</span>
          <span className="mx-1 text-metin-cok-zayif">→</span>
          <span className="text-metin-guclu">{fark.sonraki!.text}</span>
        </>
      ) : (
        <span className={fark.tur === 'silindi' ? 'text-metin-etiket' : 'text-metin-guclu'}>
          {(fark.sonraki ?? fark.onceki)!.text}
        </span>
      )}
    </span>
  );
}
