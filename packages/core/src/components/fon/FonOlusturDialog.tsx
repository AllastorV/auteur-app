import React, { useMemo, useState } from 'react';
import { t } from '../../dil/arayuz';
import { Modal, Button } from '../dialogs/Modal';
import { useProjectStore } from '../../store/project';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import { fonSablonlari, type FonSablonu } from '../../fon/sablon';
import { turetmeGirdisiKur } from '../../fon/girdi';
import { fonProjesiKur } from '../../fon/kur';
import type { Project } from '../../model/types';

/**
 * BU SENARYODAN FON DOSYASI OLUŞTUR.
 *
 * Kullanıcı kararı (2026-09-01): fon dosyası ayrı bir belge ve senaryodan
 * ANLIK KOPYA olarak kuruluyor. Bu pencerenin tek işi kurumu seçtirmek —
 * bölüm listesi, hangi bölümün türetilebildiği ve teslim kuralları
 * şablondan geliyor (`fon/sablon.ts`).
 *
 * ## Neden sürüm ve kaynak her satırda yazıyor
 *
 * Kurumların ek listesi YILLIK değişiyor ve yanlış listeyle yapılan
 * başvuru eleniyor (Eurimages'ta bu kural yazılı). Kullanıcı hangi yılın
 * listesine baktığını seçim anında görmeli; "sonra ayarlarda bakarım"
 * diyebileceği bir yer değil burası.
 */

export function FonOlusturDialog({
  onKapat,
  onKuruldu,
}: {
  onKapat: () => void;
  onKuruldu: (proje: Project, sablon: FonSablonu) => void;
}) {
  const [secili, setSecili] = useState(fonSablonlari()[0].id);
  const proje = useProjectStore((s) => s.project);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const breakdown = useProjectStore((s) => s.breakdown);
  const karakterKayitlari = useProjectStore((s) => s.karakterler);
  const lokasyonKayitlari = useProjectStore((s) => s.lokasyonlar);
  const baslikSayfasi = useProjectStore((s) => s.baslikSayfasi);
  const filePath = useProjectStore((s) => s.filePath);
  const { profil } = useSenaryoProfili();

  const sablonlar = fonSablonlari();
  const sablon = sablonlar.find((s) => s.id === secili)!;
  const tip = dokumanTipi(proje.meta.dokumanTipi) ?? DOKUMAN_TIPLERI.senaryo;

  /* Kaç bölüm ÜRETİLİYOR, kaçı elle yazılacak — seçim anında görünmeli.
     "Dosyayı program yazacak" beklentisiyle başlayan kullanıcı, sinopsisi
     kendisinin yazacağını sonradan öğrenmemeli. */
  const sayim = useMemo(() => {
    const uretilen = sablon.bolumler.filter((b) => b.uretilir);
    return {
      toplam: sablon.bolumler.length,
      belgede: uretilen.length,
      turetilen: uretilen.filter((b) => b.kaynak !== 'elle').length,
      harici: sablon.bolumler.length - uretilen.length,
    };
  }, [sablon]);

  function olustur() {
    const yeni = fonProjesiKur({
      sablon,
      /* Girdi `fon/girdi.ts`te kuruluyor: tazeleme yolu da aynı kurucuyu
         çağırıyor, böylece kurulan belge ile tazelenen belge aynı
         veriden besleniyor. */
      girdi: turetmeGirdisiKur({
        bloklar: bloklar ?? [],
        meta: proje.meta,
        tip,
        profil,
        /* BELGE dili şablonun dili — Eurimages dosyası İngilizce çıkıyor,
           kullanıcı Auteur'ü Türkçe kurmuş olsa bile. */
        dil: sablon.dil,
        baslikSayfasi,
        breakdown: breakdown ?? {},
        karakterKayitlari: karakterKayitlari ?? {},
        lokasyonKayitlari: lokasyonKayitlari ?? {},
      }),
      /* Kaydedilmemiş senaryoda `null` — tazeleme o hâlde bir kez soruyor. */
      kaynakYol: filePath,
    });
    onKuruldu(yeni, sablon);
  }

  return (
    <Modal
      title={t('Bu senaryodan fon dosyası oluştur')}
      onClose={onKapat}
      width={560}
      footer={
        <>
          <Button onClick={onKapat}>{t('İptal')}</Button>
          <Button variant="primary" data-testid="fon-olustur" onClick={olustur}>
            {t('Oluştur')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <span className="mzn-etiket">{t('Kurum ve destek türü')}</span>
        <div data-testid="fon-sablon-listesi" className="flex flex-col gap-1.5">
          {sablonlar.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`fon-sablon-${s.id}`}
              aria-pressed={s.id === secili}
              onClick={() => setSecili(s.id)}
              className={
                'flex flex-col items-start gap-0.5 border px-3 py-2.5 text-left transition-colors ' +
                (s.id === secili
                  ? 'border-amber bg-amber-zemin text-amber'
                  : 'border-kenar-denetim bg-denetim text-metin-govde hover:border-[#3a4250]')
              }
            >
              <span className="text-[13px]">{s.ad}</span>
              <span className="text-[10px] leading-snug text-metin-etiket">
                {s.kurum} · {t('sürüm')} {s.surum} · {s.basvuruKanali}
              </span>
            </button>
          ))}
        </div>

        {/* NE ÜRETİLİYOR, NE ÜRETİLMİYOR — seçim anında. */}
        <p data-testid="fon-sayim" className="border-l border-amber-kenar pl-2.5 text-[11px] leading-snug text-metin-ikincil">
          {t('Kurumun ek listesi')}: {sayim.toplam}.{' '}
          {t('Belgede bölüm olarak kurulacak')}: {sayim.belgede}
          {' · '}
          {t('senaryodan taslağı çıkarılacak')}: {sayim.turetilen}
          {sayim.harici > 0 && (
            <>
              {' · '}
              {t('dışarıdan alınacak (noter, oda kaydı vb.)')}: {sayim.harici}
            </>
          )}
        </p>

        {/* ANLIK KOPYA olduğu burada söyleniyor: kullanıcı senaryoyu
            sonradan değiştirdiğinde fon dosyasının kendiliğinden
            güncelleneceğini sanmasın. */}
        <p className="border-t border-kenar-ic pt-3 text-[11px] leading-snug text-metin-etiket">
          {t('Fon dosyası ayrı bir belgedir ve şu anki senaryodan kopyalanır. Senaryo sonradan değişirse fon dosyası kendiliğinden güncellenmez; fon belgesindeki "Senaryodan tazele" düğmesi türetilen bölümleri yeniler, elle yazdıklarına dokunmaz. Kurumun güncel ek listesini başvurudan önce doğrula.')}
        </p>
      </div>
    </Modal>
  );
}
