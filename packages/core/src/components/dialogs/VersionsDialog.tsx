import React, { useCallback, useEffect, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { unpackProject } from '../../model/project-io';
import { guvenlikNoktasiAl } from '../../veri/geri-donus';
import { assetUrlsFrom } from '../../util/assets';
import { insanaGoreZaman } from '../../util/zaman';
import { useGeriDonusNoktalari } from '../../hooks/useGeriDonusNoktalari';
import { Ikon } from '../Ikon';
import { colorForUser } from '../../util/color';
import type { HistoryVersion } from '../../platform/types';

type Sekme = 'surumler' | 'noktalar';

/**
 * Sürüm geçmişi VE geri dönüş noktaları — tek pencere, iki bölüm.
 *
 * AYRI bir pencere açılmadı: ikisi de aynı soruyu cevaplıyor ("geriye
 * dönmek"), ayrı pencere ikinci bir tasarım dili demek olurdu. §15.2.2'nin
 * mantığı (sıralama, tembel çözme, özet, dönüş akışı) burada değil —
 * `useGeriDonusNoktalari` kancasında yaşıyor; bu bileşen yalnız ÇİZER.
 */
export function VersionsDialog({ onClose }: { onClose: () => void }) {
  const [sekme, setSekme] = useState<Sekme>('surumler');

  const platform = usePlatform();
  const projectId = useProjectStore((s) => s.project.meta.id);
  const showToast = useUiStore((s) => s.showToast);
  const [versions, setVersions] = useState<HistoryVersion[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    platform.listVersions(projectId).then(setVersions).catch(() => setVersions([]));
  }, [platform, projectId]);

  useEffect(refresh, [refresh]);

  const restore = async (versionId: string) => {
    const kabuk = platform.veriGuvenligi;
    const uyari = kabuk
      ? t('Bu sürüme dönülsün mü? Mevcut durum önce bir kontrol noktasına yazılacak.')
      : t('Bu sürüme dönülsün mü? Kaydedilmemiş değişiklikler kaybolur.');
    if (!window.confirm(uyari)) return;
    setBusy(true);
    try {
      /* §15.2.2: "Geri dönmek mevcut durumu SİLMEZ: geri dönmeden hemen önce
         otomatik bir kontrol noktası daha yazılır, yani geri dönüşten de geri
         dönülebilir." `replaceProject` yeni bir `Y.Doc` kurup
         `undoManager.destroy()` çağırıyor — bu noktadan sonra geri alma da
         yok. Güvenlik noktası YAZILAMAZSA dönüş İPTAL: hatayı sonradan
         bildirmek, iş çoktan gittikten sonra bildirmek olurdu. */
      if (kabuk) {
        await guvenlikNoktasiAl(useProjectStore.getState().doc, (cipa) =>
          kabuk.cipaYazVeGunlugeKes(projectId, cipa),
        );
      }
      const data = await platform.restoreVersion(projectId, versionId);
      if (!data) {
        showToast(t('Sürüm okunamadı.'), 'error');
        return;
      }
      const bundle = await unpackProject(data);
      useProjectStore.getState().replaceProject(bundle.project, {
        assets: assetUrlsFrom(bundle.assets),
      });
      showToast(t('Sürüm geri yüklendi.'), 'success');
      onClose();
    } catch (err) {
      showToast(tf('Geri yüklenemedi: %s', (err as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('Sürüm Geçmişi')}
      onClose={onClose}
      footer={
        sekme === 'surumler' ? (
          <>
            <Button onClick={refresh}>{t('Yenile')}</Button>
            <Button onClick={onClose}>{t('Kapat')}</Button>
          </>
        ) : (
          <Button onClick={onClose}>{t('Kapat')}</Button>
        )
      }
    >
      <div data-testid="versions-sekmeleri" className="mb-3 flex shrink-0 border-b border-kenar-ic">
        {(
          [
            ['surumler', t('Sürümler')],
            ['noktalar', t('Geri dönüş noktaları')],
          ] as const
        ).map(([id, ad]) => (
          <button
            key={id}
            type="button"
            data-testid={`versions-sekme-${id}`}
            onClick={() => setSekme(id)}
            aria-current={sekme === id}
            className={
              'flex-1 px-2 py-2 text-[12px] transition-colors ' +
              (sekme === id
                ? 'border-b-2 border-amber bg-etkin text-metin'
                : 'text-metin-zayif hover:text-metin-guclu')
            }
          >
            {ad}
          </button>
        ))}
      </div>

      {sekme === 'surumler' ? (
        <>
          <p className="mb-2 text-[11px] text-metin-etiket">
            {t('Proje 60 saniyede bir otomatik kaydedilir; son 10 sürüm yerelde saklanır.')}
          </p>
          {!versions.length && <p className="py-6 text-center text-xs text-metin-etiket">{t('Henüz sürüm yok.')}</p>}
          <ul className="space-y-1">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-2 border border-kenar-denetim bg-etkin/60 px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-metin">{v.label}</p>
                  <p className="truncate text-[10px] text-metin-etiket">
                    {new Date(v.savedAt).toLocaleString('tr-TR')} · {(v.size / 1024).toFixed(0)} KB
                    {/* Yazan bilgisi eş dosyası olmayan eski sürümlerde YOK — uydurma
                        isim yazılmaz, bu satır o zaman hiç eklenmez. Renk tek başına
                        taşıyıcı değil: ad metin olarak da yazılıyor (renk körü kullanıcı). */}
                    {v.savedBy && (
                      <>
                        {' · '}
                        <span
                          data-testid={`versions-yazan-${v.id}`}
                          className="font-medium"
                          style={{ color: colorForUser(v.savedBy) }}
                        >
                          {v.savedBy}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Button variant="primary" disabled={busy} onClick={() => restore(v.id)}>
                  {t('Geri yükle')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <NoktalarBolumu onClose={onClose} />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Geri dönüş noktaları — §15.2.2. Panikteyken açılan bir ekran: jargon
   yok, tek birincil eylem, güvence metni önde. Mantık `useGeriDonusNoktalari`
   kancasında; burada yalnız ÇİZİM var — görsel tur bu bileşene dokunur,
   kancaya dokunmaz. */
/* ------------------------------------------------------------------ */

const GUVENCE = (): string =>
  t('Geri dönmek yazdıklarını silmez — dönmeden önce şu anki hâlin de kaydedilir, istersen buraya geri gelebilirsin.');

function NoktalarBolumu({ onClose }: { onClose: () => void }) {
  const durum = useGeriDonusNoktalari();

  if (!durum.destekleniyor) {
    return (
      <p data-testid="noktalar-desteklenmiyor" className="py-6 text-center text-[12px] text-metin-etiket">
        {t('Bu bölüm yalnızca masaüstü uygulamasında kullanılabilir.')}
      </p>
    );
  }

  const tikla = async (id: string) => {
    if (!window.confirm(`${GUVENCE()}\n\n${t('Şimdi bu ana dönülsün mü?')}`)) return;
    const tamam = await durum.donusYap(id);
    if (tamam) onClose();
  };

  return (
    <div data-testid="noktalar-bolumu" className="-mx-4 -mt-3">
      {/* GÜVENCE — kenar boşluğu YOK, tam genişlik (kullanıcı seçimi "E2").
          Kutu olarak durduğunda üçüncü açılışta göz onu atlamayı öğreniyor;
          pencerenin bir KATMANI olduğunda atlanacak bir bildirim değil,
          ekranın kendi yapısı gibi okunuyor. Bu ekranın en önemli cümlesi:
          panikteki kullanıcı cevabı görmeden düğmeye basmıyor. */}
      <div
        data-testid="nokta-guvence"
        className="flex items-start gap-2.5 border-b border-amber-kenar bg-amber-zemin px-4 py-3"
      >
        <Ikon ad="kilitli" boyut={14} renk="var(--mzn-amber)" />
        <p className="text-[12px] leading-relaxed text-metin-govde">
          <b className="font-semibold text-amber">{t('Hiçbir şey kaybolmaz.')}</b> {GUVENCE()}
        </p>
      </div>

      <div className="px-4 pt-3">
        {durum.yukleniyor && <p className="text-[11px] text-metin-zayif">{t('Yükleniyor…')}</p>}
        {durum.hata && (
          <p data-testid="noktalar-hata" className="text-[11px] text-amber">
            {durum.hata}
          </p>
        )}

        {!durum.yukleniyor && !durum.hata && durum.noktalar.length === 0 && (
          <p data-testid="noktalar-bos" className="py-6 text-center text-[12px] text-metin-etiket">
            {t('Henüz geri dönülecek bir an yok — program yazdıkça birikir.')}
          </p>
        )}

        {/* BİTİŞİK BLOK: kartlar arasında boşluk yok, ince ayırıcı var.
            Ayrı ayrı duran kartlar "ayrı nesneler" der; bunlar tek bir
            geçmişin parçaları. */}
        <ul className="border border-kenar-ic">
          {durum.noktalar.map((nokta, sira) => {
            const secili = durum.secilenId === nokta.id;
            return (
              <li
                key={nokta.id}
                data-testid={`nokta-${nokta.id}`}
                className={
                  'px-3 py-2.5 ' +
                  (sira > 0 ? 'border-t border-kenar-ic ' : '') +
                  (secili ? 'bg-etkin' : 'bg-cubuk')
                }
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`nokta-onizle-${nokta.id}`}
                    onClick={() => durum.sec(nokta.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[13px] font-medium text-metin">
                      {insanaGoreZaman(nokta.zaman)}
                    </p>
                    <p className="mzn-sayi text-[10px] text-metin-etiket">
                      {new Date(nokta.zaman).toLocaleTimeString('tr-TR')}
                    </p>
                  </button>
                  <Button
                    variant="primary"
                    disabled={durum.donusBusy}
                    data-testid={`nokta-don-${nokta.id}`}
                    onClick={() => tikla(nokta.id)}
                  >
                    {t('Bu ana dön')}
                  </Button>
                </div>
                {secili && (
                  <p
                    data-testid={`nokta-ozet-${nokta.id}`}
                    className="mt-1.5 text-[10.5px] text-metin-zayif"
                  >
                    {durum.ozetYukleniyor ? t('Karşılaştırılıyor…') : (durum.ozet?.metin ?? '')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
