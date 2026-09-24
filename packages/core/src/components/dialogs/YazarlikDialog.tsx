import React from 'react';
import { t } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useYazarlikGunlugu } from '../../hooks/useYazarlikGunlugu';
import { insanaGoreZaman } from '../../util/zaman';
import { colorForUser } from '../../util/color';
import { Ikon } from '../Ikon';

/**
 * "Kim ne yazdı" penceresi — iki soru, tek ekran: "geçen hafta kim ne yaptı"
 * (liste) ve "bu satırı kim yazdı" (imleç sorgusu).
 *
 * Görsel dil `VersionsDialog`nin "Geri dönüş noktaları" sekmesinden (kullanıcı
 * seçimi "E2"): BİTİŞİK BLOK liste (kartlar arası boşluk yok, ince ayırıcı) ve
 * TAM GENİŞLİK şerit. Mantık `useYazarlikGunlugu`da; bu bileşen yalnız ÇİZER.
 */
export function YazarlikDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const durum = useYazarlikGunlugu();

  if (!platform.yazarlik) {
    return (
      <Modal title={t('Kim Ne Yazdı')} onClose={onClose} footer={<Button onClick={onClose}>{t('Kapat')}</Button>}>
        <p data-testid="yazarlik-desteklenmiyor" className="py-6 text-center text-[12px] text-metin-etiket">
          {t('Bu bölüm yalnızca masaüstü uygulamasında kullanılabilir.')}
        </p>
      </Modal>
    );
  }

  return (
    <Modal title={t('Kim Ne Yazdı')} onClose={onClose} footer={<Button onClick={onClose}>{t('Kapat')}</Button>}>
      <div className="-mx-4 -mt-3">
        {/* Tam genişlik uyarı şeridi (VersionsDialog'daki güvence şeridiyle
            AYNI sınıflar) — yazarlık kaydı BUGÜNDEN itibaren tutuluyor,
            eski satırlar için sessizce boş göstermek yerine bu açıklanıyor. */}
        <div
          data-testid="yazarlik-uyari"
          className="flex items-start gap-2.5 border-b border-amber-kenar bg-amber-zemin px-4 py-3"
        >
          <Ikon ad="uyari" boyut={14} renk="var(--mzn-amber)" />
          <p className="text-[12px] leading-relaxed text-metin-govde">
            {t('Yazarlık kaydı')} <b className="font-semibold text-amber">{t('bugünden itibaren')}</b>{' '}
            {t('tutuluyor — bu tarihten önce yazılmış satırlar için bilgi yok.')}
          </p>
        </div>

        <div className="space-y-4 px-4 pt-3">
          <section>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-metin-etiket">
              {t('Bu satırı kim yazdı')}
            </h3>
            {!durum.imlecVar && (
              <p data-testid="yazarlik-imlec-yok" className="text-[12px] text-metin-etiket">
                {t('İmleç şu an bir satırda değil.')}
              </p>
            )}
            {durum.imlecVar && !durum.imlecYazari && (
              <p data-testid="yazarlik-imlec-bilinmiyor" className="text-[12px] text-metin-etiket">
                Bilinmiyor.
              </p>
            )}
            {durum.imlecVar && durum.imlecYazari && (
              <p data-testid="yazarlik-imlec-yazar" className="text-[12px] text-metin-govde">
                <span
                  data-testid="yazarlik-imlec-yazar-ad"
                  className="font-medium"
                  style={{ color: colorForUser(durum.imlecYazari.yazar) }}
                >
                  {durum.imlecYazari.yazar}
                </span>
                {' · '}
                {insanaGoreZaman(durum.imlecYazari.zaman)}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-metin-etiket">
              {t('Geçen hafta kim ne yaptı')}
            </h3>
            {durum.yukleniyor && (
              <p data-testid="yazarlik-yukleniyor" className="text-[11px] text-metin-zayif">
                {t('Yükleniyor…')}
              </p>
            )}
            {!durum.yukleniyor && durum.kayitlar.length === 0 && (
              <p data-testid="yazarlik-bos" className="py-6 text-center text-[12px] text-metin-etiket">
                {t('Henüz kayıt yok; program yazdıkça birikir.')}
              </p>
            )}
            {!durum.yukleniyor && durum.kayitlar.length > 0 && (
              <ul data-testid="yazarlik-liste" className="border border-kenar-ic">
                {durum.kayitlar.map((kayit, i) => (
                  <li
                    key={`${kayit.yazar}-${kayit.zaman}`}
                    data-testid={`yazarlik-kayit-${i}`}
                    className={'px-3 py-2.5 bg-cubuk ' + (i > 0 ? 'border-t border-kenar-ic' : '')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        data-testid={`yazarlik-kayit-yazar-${i}`}
                        className="truncate text-[13px] font-medium"
                        style={{ color: colorForUser(kayit.yazar) }}
                      >
                        {kayit.yazar}
                      </span>
                      <span className="mzn-sayi shrink-0 text-[10px] text-metin-etiket">
                        {kayit.bloklar.length} {t('satır')}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-metin-zayif">{insanaGoreZaman(kayit.zaman)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
