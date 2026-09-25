import React from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { copSirali, copEskimisleriAyir, COP_SAKLAMA_GUNU, type CopOgesi } from '../../model/geridonusum';
import type { Panel } from '../../model/types';
import type { ScriptBlock } from '../../model/script';

/**
 * Geri dönüşüm kutusu sekmesi — §13.2 (`recyclebin`, F8), §15'in ruhu.
 *
 * Silinen panel ve senaryo bloğu kayıtlarını listeler. "Geri getir" ESKİ
 * YERİNE koyar (`doc/mutations.ts` `copGeriGetir`, komşuluk bilgisiyle),
 * "kalıcı sil" AÇIK ONAY ister ve geri alınamaz olduğunu söyler — bu ikisi
 * dışında üçüncü bir yol yok (Karar 2, ikinci silme yolu açılmadı).
 */
export function CopKutusuSekmesi() {
  const doc = useProjectStore((s) => s.doc);
  /* ROL KAPISI — izleyici/yorumcu değiştiremez. Sunucu zaten reddediyor
     ama kapı olmadan değişiklik ekranda OLUYOR, sonra geri sarılıyor:
     kullanıcı sildiğini sanıp geri gelmesini hata sanıyor. */
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const cop = useProjectStore((s) => s.cop);
  const showToast = useUiStore((s) => s.showToast);

  const sirali = copSirali(cop);
  const { silinecek } = copEskimisleriAyir(cop);

  const temizle = () => {
    const n = projectActions.copTemizle(doc);
    // Temizlik SESSİZ olmasın (§15) — kaç kayıt gittiği HER ZAMAN bildiriliyor,
    // 0 olsa bile: "temizlenecek bir şey yoktu" da bir sonuçtur.
    showToast(n > 0 ? tf('%d eski kayıt geri dönüşüm kutusundan temizlendi.', n) : t('Temizlenecek eski kayıt yok.'), 'info');
  };

  const kaliciSil = (oge: CopOgesi) => {
    if (!window.confirm(tf('%s KALICI olarak silinsin mi? Bu işlem GERİ ALINAMAZ.', copOzeti(oge)))) return;
    projectActions.copKaliciSil(doc, oge.id);
  };

  return (
    <section data-testid="cop-kutusu-sekmesi" className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="mzn-etiket">{t('Geri Dönüşüm Kutusu')}</h3>
        <button
          type="button"
          data-testid="cop-temizle"
          onClick={temizle}
          disabled={!duzenlenebilir}
          className="bg-denetim px-2 py-1 text-[11px] text-metin-guclu hover:bg-denetim disabled:opacity-40"
        >
          {t('Temizle')}{silinecek.length > 0 ? ` (${silinecek.length})` : ''}
        </button>
      </div>
      <p className="mb-3 text-[10px] text-metin-cok-zayif">
        {tf('%d günden eski kayıtlar otomatik temizlenir.', COP_SAKLAMA_GUNU)}
      </p>

      {sirali.length === 0 ? (
        <p className="pb-4 text-[11px] text-metin-cok-zayif">{t('Kutu boş.')}</p>
      ) : (
        <ul className="space-y-1.5">
          {sirali.map((oge) => (
            <li key={oge.id} className="bg-denetim p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="mzn-sayi block text-[9px] uppercase text-metin-cok-zayif">
                    {oge.tur === 'panel' ? t('Panel') : t('Senaryo bloğu')} · {tarihFormatla(oge.silinmeTarihi)}
                  </span>
                  <span className="block truncate text-[12px] text-metin-guclu">{copOzeti(oge)}</span>
                </div>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  data-testid={`cop-geri-getir-${oge.id}`}
                  onClick={() => projectActions.copGeriGetir(doc, oge.id)}
                  disabled={!duzenlenebilir}
                  className="flex-1 bg-etkin px-2 py-1 text-[11px] text-metin-guclu hover:bg-denetim"
                >
                  {t('Geri getir')}
                </button>
                <button
                  type="button"
                  data-testid={`cop-kalici-sil-${oge.id}`}
                  onClick={() => kaliciSil(oge)}
                  disabled={!duzenlenebilir}
                  className="px-2 py-1 text-[11px] text-red-400 hover:text-red-300"
                >
                  {t('Kalıcı sil')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function copOzeti(oge: CopOgesi): string {
  if (oge.tur === 'panel') {
    const p = oge.veri as Panel;
    return `${t('Sahne')} ${p.meta.scene || '?'} / ${t('Çekim')} ${p.meta.shot || '?'}`;
  }
  const b = oge.veri as ScriptBlock;
  const metin = b.text.trim();
  return metin ? metin.slice(0, 60) : tf('(boş %s)', b.type);
}

function tarihFormatla(ms: number): string {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
