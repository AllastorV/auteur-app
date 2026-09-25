import React, { useMemo, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { Modal, Button } from '../dialogs/Modal';
import { downloadBlob } from '../../util/indir';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { useSenaryoProfili, senaryoProfiliKur } from '../../hooks/useSenaryoProfili';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import { safeFileName, unpackProject } from '../../model/project-io';
import { setScript, updateSettings } from '../../doc/mutations';
import { pdfYaziTipleri } from '../../disa/yazitipi';
import { fonSablonu } from '../../fon/sablon';
import { fonDenetle, type FonBolumDurumu } from '../../fon/denetle';
import { turetmeGirdisiDosyadan } from '../../fon/girdi';
import { fonTazele } from '../../fon/tazele';
import { fonPaketiKur } from '../../fon/paket';

/**
 * FON DOSYASI KONTROL LİSTESİ.
 *
 * ## Tazeleme neden bölüm bölüm değil, TEK düğme
 *
 * Bölüm başına "taslak üret" düğmesi, kullanıcıya beş ayrı tıklama ve
 * "hangilerine bastım" muhasebesi yükler. Kaynak senaryo değiştiğinde
 * türetilen bölümlerin HEPSİ eskir; tek düğme işin tamamını yapıyor ve
 * sonucunda neyin yenilendiğini adıyla söylüyor. Elle yazılan bölümlere
 * dokunulmadığı için "yanlışlıkla basarım" riski de yok.
 *
 * Kaynak dosya yolu belgede kayıtlı (`settings.fonKaynak`), o yüzden mutlu
 * yolda hiçbir şey seçtirilmiyor. Yol kaybolmuşsa BİR KEZ soruluyor ve
 * öğrenilen yol belgeye yazılıyor — ikinci kez sorulmuyor.
 *
 * ## Neden yeni bir denetçi sekmesi değil
 *
 * `denetci-sekme.test.ts` `SEKME_GRUPLARI.length <= 4` sözleşmesini
 * zorluyor ve 268 pikselde bu liste okunmaz. Analiz panosuyla aynı yol:
 * menüden açılan bir pencere.
 */

/** `YYYY-MM-DD HH:MM` — yerel saat. */
function tarihYaz(ms: number): string {
  const d = new Date(ms);
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

function Rozet({ durum }: { durum: FonBolumDurumu }) {
  const [metin, sinif] = !durum.belgede
    ? [t('bulunamadı'), 'border-[#5c2b28] bg-[#2a1817] text-[#d98078]']
    : durum.asim
      ? [t('sınır aşıldı'), 'border-amber-kenar bg-amber-zemin text-amber']
      : durum.dolu
        ? [t('dolu'), 'border-kenar-denetim bg-denetim text-kayitli']
        : [t('boş'), 'border-kenar-denetim bg-denetim text-metin-zayif'];
  return <span className={`shrink-0 border px-1.5 py-0.5 text-[10px] ${sinif}`}>{metin}</span>;
}

export function FonPaneli({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const proje = useProjectStore((s) => s.project);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const { profil } = useSenaryoProfili();

  const sablon = fonSablonu(proje.settings.fonSablonu);
  const tip = dokumanTipi(proje.meta.dokumanTipi) ?? DOKUMAN_TIPLERI['fon-dosyasi'];
  const kaynak = proje.settings.fonKaynak;

  const denetim = useMemo(
    () => (sablon ? fonDenetle(sablon, bloklar ?? [], tip, profil) : null),
    [sablon, bloklar, tip, profil],
  );

  /* ŞABLONSUZ BELGE SESSİZ KALMIYOR: `settings.fonSablonu` düşerse (eski
     dosya, elle düzenlenmiş proje) liste neyi eksik sayacağını bilemez ve
     bunu söylemek zorundadır (§15.4). */
  if (!sablon || !denetim) {
    return (
      <Modal title={t('Fon dosyası')} onClose={onClose} width={520}>
        <p data-testid="fon-sablonsuz" className="text-[13px] leading-snug text-metin-govde">
          {t('Bu belgede fon şablonu kayıtlı değil; kontrol listesi kurulamıyor. Belgeyi senaryodan yeniden oluşturman gerekiyor.')}
        </p>
      </Modal>
    );
  }

  /**
   * Kaynak senaryoyu okur ve türetilen bölümleri yeniler.
   *
   * Yol belgede kayıtlı; yoksa ya da dosya okunamıyorsa BİR KEZ soruluyor
   * ve öğrenilen yol belgeye yazılıyor. Açılan dosyanın kimliği kaynakla
   * tutmuyorsa sessizce devam edilmiyor — yanlış senaryodan türetilen bir
   * başvuru dosyası, hiç türetilmemiş olandan kötüdür.
   */
  async function tazeleSimdi() {
    if (!kaynak) return;
    setBusy(true);
    try {
      let yol = kaynak.yol;
      let veri: Uint8Array | null = null;
      if (yol) {
        try { veri = await platform.readProjectFile(yol); } catch { veri = null; }
      }
      if (!veri) {
        const secim = await platform.openProjectDialog();
        if (!secim) { showToast(t('Tazeleme iptal edildi.'), 'info'); return; }
        yol = secim.path;
        veri = secim.data;
      }
      const bundle = await unpackProject(veri);
      if (bundle.project.meta.id !== kaynak.projeId
        && !window.confirm(t('Seçilen dosya bu fon belgesinin kaynağı değil. Yine de bundan tazelensin mi?'))) {
        return;
      }

      const ui = useUiStore.getState();
      /* Sayfa sayıları KAYNAK senaryonun profiliyle ölçülüyor: açık fon
         belgesinin profili başka bir doküman tipinin profili ve onunla
         ölçmek yanlış sayı üretirdi. */
      const kaynakProfil = senaryoProfiliKur({
        tipAdi: bundle.project.meta.dokumanTipi,
        belgeDili: bundle.project.settings.belgeDili,
        kagit: ui.scriptPaper,
        tercihDili: ui.scriptLang,
        presetler: ui.scriptPresetler,
        yaziAdi: ui.scriptYazi,
        solSutun: ui.scriptSolSutun,
      }).profil;
      const kaynakTip = dokumanTipi(bundle.project.meta.dokumanTipi) ?? DOKUMAN_TIPLERI.senaryo;
      const girdi = turetmeGirdisiDosyadan(bundle.project, kaynakTip, kaynakProfil, sablon!.dil);

      const sonuc = fonTazele(sablon!, bloklar ?? [], girdi, tip, profil);
      const doc = useProjectStore.getState().doc;
      if (!doc) throw new Error(t('Belge açık değil.'));
      setScript(doc, { name: proje.script.name, blocks: sonuc.bloklar });
      updateSettings(doc, {
        fonKaynak: {
          projeId: bundle.project.meta.id,
          ad: bundle.project.meta.name,
          yol,
          turetildi: Date.now(),
        },
      });

      /* NE YENİLENDİĞİ SAYILIYOR: "tazelendi" deyip hiçbir şey
         değiştirmemiş olmak sessiz başarısızlığın kibar hâli (§15.4). */
      if (sonuc.yenilenen.length === 0) {
        showToast(t('Yenilenecek türetilmiş bölüm bulunamadı.'), 'info');
      } else {
        showToast(`${t('Tazelendi')}: ${sonuc.yenilenen.join(', ')}`, 'success');
      }
      if (sonuc.bulunamayan.length > 0) {
        showToast(`${t('Belgede bulunamadığı için atlandı')}: ${sonuc.bulunamayan.join(', ')}`, 'info');
      }
    } catch (err) {
      showToast(`${t('Tazelenemedi')}: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function paketiVer() {
    setBusy(true);
    try {
      const paket = await fonPaketiKur({
        sablon: sablon!,
        denetim: denetim!,
        profil,
        yaziTipleri: await pdfYaziTipleri(profil.yazi.id),
        baslik: proje.script.name || proje.meta.name,
        yazar: proje.meta.author,
      });
      const ad = `${safeFileName(proje.meta.name)}-${sablon!.id}.zip`;
      const bytes = paket.zip;
      if (platform.dosyaKaydet) {
        const res = await platform.dosyaKaydet({
          bytes, dosyaAdi: ad, turAdi: t('Başvuru paketi'), uzantilar: ['zip'],
        });
        if (res.cancelled) showToast(t('Dışa aktarma iptal edildi.'), 'info');
        else if (res.path) showToast(tf('Kaydedildi: %s', res.path), 'success');
      } else {
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), ad);
        showToast(tf('%s indirildi.', ad), 'success');
      }
    } catch (err) {
      /* SESSİZ BAŞARISIZLIK YASAK: paket üretilemediyse kullanıcı bunu
         bilmeli — "bir şey oldu ama ne" en pahalı hâl. */
      showToast(`${t('Paket üretilemedi')}: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('Fon dosyası')}
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>{t('Kapat')}</Button>
          {/* KAYNAK YOKSA DÜĞME DE YOK: eski bir belgede `fonKaynak` hiç
              yazılmamış olabilir ve tazelemenin okuyacağı bir şey yok.
              Gri bir düğme bir kez tıklanır ve "bozuk" denir. */}
          {kaynak && (
            <Button data-testid="fon-tazele" disabled={busy} onClick={() => void tazeleSimdi()}>
              {t('Senaryodan tazele')}
            </Button>
          )}
          <Button variant="primary" data-testid="fon-paket" disabled={busy} onClick={() => void paketiVer()}>
            {t('Paket oluştur')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* ŞERİT HER ZAMAN GÖRÜNÜR: kurumun listesi yıllık değişiyor ve
            yanlış listeyle yapılan başvuru eleniyor. */}
        <p data-testid="fon-serit" className="border-l border-amber-kenar pl-2.5 text-[11px] leading-snug text-metin-ikincil">
          {sablon.ad} · {sablon.kurum}
          <br />
          {t('sürüm')} {sablon.surum} · {sablon.kaynak.url} ({sablon.kaynak.erisim})
          <br />
          <span className="text-metin-etiket">
            {t('Kurumun ek listesi yıllık değişiyor. Başvurudan önce güncel listeyi kurumdan doğrula.')}
          </span>
        </p>

        {/* BELGE ANLIK KOPYA: hangi senaryodan, ne zaman türetildiği
            görünmeden kullanıcı elindekinin güncel olup olmadığını
            bilemez. */}
        {kaynak && (
          <p data-testid="fon-kaynak" className="text-[11px] leading-snug text-metin-etiket">
            {t('Kaynak senaryo')}: {kaynak.ad} · {tarihYaz(kaynak.turetildi)}{' '}
            {t('tarihinde türetildi')}.{' '}
            {t('"Senaryodan tazele" yalnız türetilen bölümleri yeniler; elle yazdıkların olduğu gibi kalır.')}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="mzn-etiket">{t('Belgedeki bölümler')}</span>
          <ul data-testid="fon-bolum-listesi" className="flex flex-col">
            {denetim.durumlar.map((d) => (
              <li
                key={d.ornek.id}
                data-testid={`fon-bolum-${d.ornek.id}`}
                className="flex items-center gap-2 border-b border-kenar-ic py-1.5 text-[12px] text-metin-govde last:border-b-0"
              >
                <span className="flex-1 leading-snug">
                  {d.ornek.ad}
                  {!d.bolum.zorunlu && <span className="text-metin-etiket"> ({t('varsa')})</span>}
                </span>
                {d.belgede && (
                  <span className="mzn-sayi shrink-0 text-[11px] text-metin-etiket">
                    {d.sayfa} {t('sayfa')}
                    {d.bolum.sinir?.birim === 'sayfa' && ` / ${d.bolum.sinir.azami}`}
                  </span>
                )}
                <Rozet durum={d} />
              </li>
            ))}
          </ul>
        </div>

        {/* Auteur'ün ÜRETMEDİĞİ ekler ayrı listede ve gizlenmiyor: eksik ek
            başvuruyu düşürüyor ve unutulmaları en pahalı hata. */}
        {denetim.harici.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="mzn-etiket">{t('Dışarıdan alınacak ekler (Auteur üretmez)')}</span>
            <ul data-testid="fon-harici-listesi" className="flex flex-col gap-0.5 text-[11px] leading-snug text-metin-ikincil">
              {denetim.harici.map((b) => (
                <li key={b.id}>
                  {b.ad}
                  {!b.zorunlu && <span className="text-metin-etiket"> ({t('varsa')})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
