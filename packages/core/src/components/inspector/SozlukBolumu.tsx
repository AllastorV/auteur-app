import React, { useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { usePlatform } from '../../platform/context';
import * as M from '../../doc/mutations';
import { sozlugeUygun } from '../../dil/sozluk';

/**
 * Proje sözlüğü — §16.4.
 *
 * Sözlük BELGEDE yaşıyor (`sozluk` kökü, korumalı izdüşümde): karakter ve
 * mekân adları projeye aittir, makineye değil. Ortak çalışan da aynı sözlüğü
 * görür, yoksa herkes aynı adı ayrı ayrı eklerdi.
 *
 * Yazım denetimi KABUĞA bağlı ve web'de yok. Panel bunu SÖYLÜYOR: kullanıcı
 * eklediği kelimenin bir işe yaradığını sanmamalı (§15.4'ün ruhu — vaat
 * edilen yetenek gerçek olmalı).
 */
export function SozlukBolumu() {
  const platform = usePlatform();
  const sozluk = useProjectStore((s) => s.sozluk);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const [girdi, setGirdi] = useState('');
  const [hata, setHata] = useState<string | null>(null);

  const denetimVar = Boolean(platform.dil);
  const kelimeler = Object.values(sozluk).sort((a, b) => a.localeCompare(b, 'tr'));

  const ekle = () => {
    /* Uygunsuz kelime SESSİZCE YUTULMUYOR: kullanıcı eklediğini sanıp
       kırmızı altçizginin sürmesine şaşırırdı. */
    if (!sozlugeUygun(girdi)) {
      setHata(t('Kelime boş olamaz, harf içermeli ve 64 karakteri aşmamalı.'));
      return;
    }
    M.sozlugeEkle(useProjectStore.getState().doc, girdi);
    setGirdi('');
    setHata(null);
  };

  return (
    <section data-testid="sozluk-bolumu" className="border border-kenar-ic p-2">
      <h3 className="mb-1.5 text-[11px] font-semibold text-metin-govde">{t('Proje sözlüğü')}</h3>

      {!denetimVar && (
        <p
          data-testid="denetim-yok"
          className="mb-1.5 bg-amber-900/40 px-1.5 py-1 text-[10px] leading-snug text-amber-200"
        >
          {t('Bu sürümde yazım denetimi yok — eklediğin kelimeler projeyle birlikte saklanır ve masaüstü uygulamasında etkili olur.')}
        </p>
      )}

      <div className="flex gap-1">
        <input
          data-testid="sozluk-girdi"
          aria-label={t('Sözlüğe eklenecek kelime')}
          value={girdi}
          disabled={!duzenlenebilir}
          placeholder={t('Kelime ekle')}
          className="min-w-0 flex-1 bg-denetim px-1 py-0.5 text-[11px] text-metin-guclu disabled:opacity-40"
          onChange={(e) => { setGirdi(e.target.value); setHata(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ekle(); } }}
        />
        <button
          type="button"
          data-testid="sozluk-ekle"
          disabled={!duzenlenebilir}
          className="bg-denetim px-2 text-[11px] text-metin-guclu disabled:opacity-40"
          onClick={ekle}
        >
          {t('Ekle')}
        </button>
      </div>

      {hata && (
        <p data-testid="sozluk-hata" className="mt-1 text-[10px] text-amber-400">{hata}</p>
      )}

      {kelimeler.length === 0 ? (
        <p className="mt-2 text-[10px] text-metin-etiket">{t('Sözlükte kelime yok.')}</p>
      ) : (
        <ul data-testid="sozluk-listesi" className="mt-2 flex flex-wrap gap-1">
          {kelimeler.map((k) => (
            <li
              key={k}
              className="flex items-center gap-1 bg-denetim px-1.5 py-0.5 text-[10px] text-metin-guclu"
            >
              {k}
              <button
                type="button"
                data-testid={`sozluk-sil-${k}`}
                aria-label={tf('%s kelimesini sözlükten çıkar', k)}
                disabled={!duzenlenebilir}
                className="text-metin-etiket hover:text-metin-guclu disabled:opacity-40"
                onClick={() => M.sozluktenCikar(useProjectStore.getState().doc, k)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
