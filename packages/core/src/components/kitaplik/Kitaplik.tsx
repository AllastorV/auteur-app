import React, { useEffect, useMemo, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { unpackProject } from '../../model/project-io';
import { assetUrlsFrom } from '../../util/assets';
import { createProject } from '../../model/factory';
import type { RecentProject } from '../../platform/types';
import { Ikon, type IkonAdi } from '../Ikon';
import { Toast } from '../Toast';
import { gununSozu, sozKimi, sozMetni } from './sozler';
import { Kitap, KITAP_EN } from './Kitap';
import { YeniProjeDialog, type YeniProjeSecimi } from './YeniProjeDialog';
import { AyarlarDialog } from '../dialogs/AyarlarDialog';

/**
 * KİTAPLIK — uygulamanın giriş ekranı.
 *
 * Program proje AÇIK OLMADAN açılıyor: önce ne üzerinde çalışacağını
 * seçersin, sonra masaya oturursun. Bir kitaba basmak o projeyi düzenleme
 * ekranında açar.
 *
 * ## Yerleşim neden bu
 *
 * Sol sütun SABİT ve dar (352px): kimlik, günün sözü, üç eylem. Sağ taraf
 * rafların kendisi. Eylemleri üstte bir araç çubuğuna koymak, boş
 * kitaplıkta kullanıcıyı ekranın karşı köşesine bakmaya zorlardı; solda
 * sözün altında dururlar ve göz zaten oradadır.
 *
 * ## Raf çizgisi
 *
 * Kitaplar ızgarada yan yana duruyor ve her hücrenin ALT KENARI var.
 * Hücreler yatayda bitişik olduğu için bu kenarlar tek bir sürekli çizgi
 * hâline geliyor — rafın tahtası. Ayrı bir "raf" öğesi çizmek, satır
 * sayısını ikinci kez hesaplamak olurdu (Karar 34'ün buradaki karşılığı).
 */
export function Kitaplik({ onAcildi }: { onAcildi: () => void }) {
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const [projeler, setProjeler] = useState<RecentProject[] | null>(null);
  const [arama, setArama] = useState('');
  const [yeniAcik, setYeniAcik] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);
  const arayuzDili = useUiStore((st) => st.arayuzDili);
  const soz = useMemo(() => gununSozu(), []);

  useEffect(() => {
    platform.listRecentProjects().then(setProjeler).catch(() => setProjeler([]));
  }, [platform]);

  const gorunen = useMemo(() => {
    const liste = projeler ?? [];
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return liste;
    return liste.filter((p) => p.name.toLocaleLowerCase('tr').includes(q));
  }, [projeler, arama]);

  async function ac(yol: string) {
    try {
      const veri = await platform.readProjectFile(yol);
      const paket = await unpackProject(veri);
      useProjectStore.getState().replaceProject(paket.project, {
        filePath: yol,
        assets: assetUrlsFrom(paket.assets),
      });
      onAcildi();
    } catch (err) {
      /* Sessizce yutulmuyor: dosya taşınmış ya da bozulmuş olabilir ve
         kullanıcı neden hiçbir şey olmadığını bilmeli. */
      showToast(tf('Açılamadı: %s', (err as Error).message), 'error');
    }
  }

  async function dosyadanAc() {
    const secim = await platform.openProjectDialog();
    if (!secim) return;
    try {
      const paket = await unpackProject(secim.data);
      useProjectStore.getState().replaceProject(paket.project, {
        filePath: secim.path,
        assets: assetUrlsFrom(paket.assets),
      });
      onAcildi();
    } catch (err) {
      showToast(tf('Açılamadı: %s', (err as Error).message), 'error');
    }
  }

  function yeni(secim: YeniProjeSecimi) {
    useProjectStore.getState().replaceProject(
      createProject({ meta: { name: secim.ad, dokumanTipi: secim.tip } }),
      { filePath: null },
    );
    onAcildi();
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-zemin text-metin-guclu">
      {/* ---------------------------- sol sütun ---------------------------- */}
      <aside className="flex w-[352px] shrink-0 flex-col border-r border-kenar bg-panel px-7 py-7">
        <div className="flex items-center gap-2.5">
          <Ikon ad="menu" boyut={18} renk="var(--mzn-amber)" />
          <span className="text-[15px] font-medium tracking-wide text-metin">Auteur</span>
        </div>

        {/* Söz MARKANIN ALTINDA, sütunun ortasında değil (kullanıcı kararı
            2026-08-27: "yukarı al, ortada garip duruyor"). Ortalanmış hâli
            kısa sözlerde markadan kopuk, havada asılı duruyordu. Boşluk
            artık aşağıda toplanıyor, sözün etrafında değil.

            Punto 19 → 24: karşılama ekranındaki tek uzun metin bu ve küçük
            punto onu dipnot gibi gösteriyordu. */}
        <blockquote className="mt-10" data-testid="kitaplik-soz">
          <p className="text-[24px] leading-[1.35] text-metin-guclu">{sozMetni(soz, arayuzDili)}</p>
          <footer className="mzn-etiket mt-5">{sozKimi(soz, arayuzDili)}</footer>
        </blockquote>
        <div className="flex-1" />

        <nav className="flex flex-col items-start gap-1">
          <Eylem ikon="yeni" etiket={t('Yeni proje')} testId="kitaplik-yeni" onClick={() => setYeniAcik(true)} vurgu />
          <Eylem ikon="ac" etiket={t('Dosyadan aç…')} testId="kitaplik-ac" onClick={() => void dosyadanAc()} />
          {/* Ayarlar BURADAN da açılıyor (kullanıcı isteği 2026-08-27):
              karşılama ekranında hiç menü yok ve kullanıcı dili ya da
              ölçeği değiştirmek için önce bir proje açmak zorunda
              kalıyordu. */}
          <Eylem ikon="ayarlar" etiket={t('Ayarlar')} testId="kitaplik-ayarlar" onClick={() => setAyarlarAcik(true)} />
        </nav>
      </aside>

      {/* ------------------------------ raflar ----------------------------- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[44px] shrink-0 items-center justify-between border-b border-kenar bg-cubuk px-5">
          <span className="mzn-etiket">{t('Kitaplık')}</span>
          {(projeler?.length ?? 0) > 0 && (
            <label className="flex items-center gap-2">
              <Ikon ad="ara" boyut={12} renk="var(--mzn-metin-etiket)" />
              <input
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder={t('Ara')}
                data-testid="kitaplik-arama"
                className="w-40 border-b border-kenar-denetim bg-transparent pb-0.5 text-[12px] text-metin outline-none placeholder:text-metin-cok-zayif focus:border-amber"
              />
            </label>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {projeler === null ? null : gorunen.length === 0 ? (
            <Bos aramaVar={arama.trim().length > 0} onYeni={() => setYeniAcik(true)} />
          ) : (
            <div
              data-testid="raf"
              className="grid"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${KITAP_EN + 40}px, 1fr))` }}
            >
              {gorunen.map((p, i) => (
                <Kitap key={p.path} proje={p} sonAcilan={i === 0 && !arama} onAc={() => void ac(p.path)} />
              ))}
            </div>
          )}
        </div>
      </main>

      {ayarlarAcik && <AyarlarDialog onClose={() => setAyarlarAcik(false)} />}
      {yeniAcik && (
        <YeniProjeDialog onKapat={() => setYeniAcik(false)} onOlustur={yeni} />
      )}
      <Toast />
    </div>
  );
}

function Eylem({
  ikon, etiket, onClick, testId, vurgu,
}: {
  ikon: IkonAdi; etiket: string; onClick: () => void; testId: string; vurgu?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={
        'flex items-center gap-3 px-1 py-2 text-[13px] transition-colors ' +
        (vurgu ? 'text-amber hover:text-metin' : 'text-metin-sonuk hover:text-metin')
      }
    >
      <Ikon ad={ikon} boyut={15} />
      {etiket}
    </button>
  );
}

/**
 * Boş durum.
 *
 * Sadece cümle yazmak yetmiyordu: raf bomboşken ekranın ortasında yüzen bir
 * paragraf, gözün tutunacağı hiçbir şey bırakmıyor ve kullanıcıyı "peki
 * şimdi ne?" ile baş başa koyuyordu. Onun yerine KİTAP BİÇİMİNDE BİR YUVA
 * var: hem eylemin kendisi, hem de metaforu bir bakışta öğretiyor —
 * "projeler buraya kitap olarak gelecek" cümlesini okumadan önce görüyorsun.
 *
 * Yuva kesikli çizgili ve amber DEĞİL: burada henüz bir şey yok, vurgu
 * rengini boş bir yere harcamak onu ucuzlatırdı. Amber yalnız üzerine
 * gelince beliriyor.
 *
 * "Hiç proje yok" ile "arama bir şey bulmadı" AYRI cümleler: ikisini aynı
 * metinle geçmek, aramasını silmesi gereken kullanıcıya kitaplığının boş
 * olduğunu söylemek olurdu — ve orada gösterilecek bir "yeni proje" yuvası
 * da yok, çünkü sorun proje eksikliği değil.
 */
function Bos({ aramaVar, onYeni }: { aramaVar: boolean; onYeni: () => void }) {
  if (aramaVar) {
    return (
      <div className="grid h-full place-items-center px-8" data-testid="kitaplik-bos">
        <p className="text-[13px] text-metin-zayif">{t('Bu adda bir proje yok.')}</p>
      </div>
    );
  }
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6 px-8"
      data-testid="kitaplik-bos"
    >
      <button
        type="button"
        data-testid="bos-yeni"
        onClick={onYeni}
        className="group grid place-items-center border border-dashed border-kenar-denetim text-metin-cok-zayif transition-colors hover:border-amber hover:text-amber"
        style={{ width: KITAP_EN, height: 208 }}
      >
        <span className="flex flex-col items-center gap-2.5">
          <Ikon ad="arti" boyut={22} />
          <span className="text-[12px]">{t('Yeni proje')}</span>
        </span>
      </button>
      <p className="max-w-[320px] text-center text-[12px] leading-relaxed text-metin-etiket">
        {t('Açtığın her proje buraya bir kitap olarak gelir. Diskteki bir dosyayı soldan da açabilirsin.')}
      </p>
    </div>
  );
}
