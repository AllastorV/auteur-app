import React, { useCallback, useMemo, useState } from 'react';
import { arayuzDili, t, tf } from '../../dil/arayuz';
import { downloadBlob } from '../../util/indir';
import { Modal, Button } from './Modal';
import { Ikon, type IkonAdi } from '../Ikon';
import { useProjectStore } from '../../store/project';
import { etkinRevizyon, revizyonIsaretleriniOku } from '../../doc/mutations';
import { RENK_ZEMINI, ustbilgiMetni } from '../../model/revizyon';
import { ustbilgiMetniArayuz } from '../../dil/revizyon';
import { dokumanTipi } from '../../model/dokuman-tipi';
import { useUiStore } from '../../store/ui';
import { usePlatform } from '../../platform/context';
import { EXPORT_RESOLUTIONS, exportSize, type ExportResolutionId } from '../../data/aspect';
import { buildPngSequence, zipFrames, dataUrlToUint8 } from '../../export/png';
import {
  MAX_TRANSFER_BYTES,
  buildAnimatic,
  segmentsByteSize,
  segmentsDuration,
} from '../../export/animatic';
import { renderPanelToDataURL } from '../../export/renderPanel';
import { dosyaAdiDegiskenleri, safeFileName } from '../../model/project-io';
import { pdfPaketiKur, type Kapsam } from '../../disa/paket';
import type { StoryboardKare } from '../../disa/storyboard-pdf';
import { pdfYaziTipleri } from '../../disa/yazitipi';
import { fountainYaz } from '../../disa/fountain';
import { duzYaz } from '../../disa/duz';
import { docxYaz } from '../../disa/docx';
import { VARSAYILAN_FILIGRAN } from '../../disa/pdf';
import { fdxYaz } from '../../disa/fdx';
import { totalDuration, formatDuration } from '../../model/timeline';
import { uid } from '../../util/id';
import type { Panel } from '../../model/types';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';

/** Kapsam → biçim. §16.2'nin üç satırlık tablosu. */
type SenaryoBicim = 'pdf' | 'fountain' | 'fdx' | 'docx' | 'markdown' | 'metin';
type StoryboardBicim = 'pdf' | 'png' | 'video';

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye; gerekçenin
   tamamı `i18n-kapsam.test.ts`teki `donmusCeviriler` başlığında. */
const SENARYO_BICIMLERI = (): { id: SenaryoBicim; etiket: string; uzanti: string; tur: string }[] => [
  { id: 'pdf', etiket: 'PDF', uzanti: 'pdf', tur: t('PDF belgesi') },
  { id: 'fountain', etiket: 'Fountain (.fountain)', uzanti: 'fountain', tur: t('Fountain metni') },
  { id: 'fdx', etiket: 'Final Draft (.fdx)', uzanti: 'fdx', tur: t('Final Draft senaryosu') },
  /* §16.2 borcu: bu üçü listede sayılıyordu ama yazılmamıştı. Roman
     yazarının istediği çıktı tam olarak bunlar — Fountain senaryo
     işaretlemesi taşıyor, FDX ikili bir sektör biçimi. */
  { id: 'docx', etiket: 'Word (.docx)', uzanti: 'docx', tur: t('Word belgesi') },
  { id: 'markdown', etiket: 'Markdown (.md)', uzanti: 'md', tur: t('Markdown metni') },
  { id: 'metin', etiket: t('Düz metin (.txt)'), uzanti: 'txt', tur: t('Düz metin') },
];

/** Metin tabanlı biçimler — panel görseli taşımayanlar. */
const METIN_BICIMLERI = new Set<SenaryoBicim>(['fountain', 'fdx', 'markdown', 'metin']);

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const allowed = useProjectStore((s) => s.allowed);
  /* İki sütunlu metin PROJENİN İÇİNDE değil, mağazanın ayrı alanında. */
  const ciftler = useProjectStore((s) => s.ciftler);
  /* §16.2 ekranı — kayıt PROJEDE, sabit proje adından DEĞİL (görev tanımı). */
  const baslikSayfasiKaydi = useProjectStore((s) => s.baslikSayfasi);
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);

  /* Kapsam varsayılanı AÇIK EKRANDAN gelir: senaryo yazarken dışa aktar denince
     istenen şey senaryodur. §16.2 birlikte aktarımın varsayılan OLMAMASINI
     şart koşuyor. */
  const [kapsam, setKapsam] = useState<Kapsam>(
    useUiStore.getState().viewMode === 'senaryo' ? 'senaryo' : 'storyboard',
  );
  const [senaryoBicim, setSenaryoBicim] = useState<SenaryoBicim>('pdf');
  const [storyboardBicim, setStoryboardBicim] = useState<StoryboardBicim>('png');
  const [resolution, setResolution] = useState<ExportResolutionId>('1080p');
  const [transparent, setTransparent] = useState(false);
  const [template, setTemplate] = useState(() => dosyaAdiDegiskenleri(arayuzDili()).varsayilan);
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [fps, setFps] = useState<24 | 25 | 30>(project.settings.fps);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const doc = useProjectStore((se) => se.doc);
  /* Ayıraç seçeneği YALNIZ iki sütunlu belgede anlamlı. Her belgede
     göstermek, tek sütunlu senaryoda hiçbir şey yapmayan bir kutu
     demek olurdu. */
  const ikiSutunlu = Boolean(dokumanTipi(project.meta.dokumanTipi)?.ikiSutun);
  /* `useMemo` YOK: belge açıkken işaret eklenebilir ve önbelleğe alınmış bir
     küme bayat kalırdı — kullanıcı işaretlediği satırı çıktıda bulamazdı.
     Maliyet önemsiz (bir harita gezintisi), bayatlık ise sessiz bir hata. */
  const etkinRev = etkinRevizyon(doc);
  /* YALNIZ etkin revizyonun işaretleri: yıldız "bu dağıtımda ne değişti"
     sorusunu cevaplar. Bütün geçmiş işaretler basılsaydı sayfa, aylar
     önce değişmiş satırlarla dolardı. */
  const etkinIsaretler = etkinRev
    ? new Set(
        [...revizyonIsaretleriniOku(doc)]
          .filter(([, rev]) => rev === etkinRev.id)
          .map(([id]) => id),
      )
    : new Set<string>();

  /* §16.2 PDF seçenekleri. Hepsi VARSAYILAN KAPALI: filigranlı ya da eksik
     sayfalı bir dosya kazayla teslim edilirse geri alınamaz. */
  const [baslikSayfasiAcik, setBaslikSayfasiAcik] = useState(false);
  const [aralikAcik, setAralikAcik] = useState(false);
  const [aralikIlk, setAralikIlk] = useState(1);
  const [aralikSon, setAralikSon] = useState(1);
  const [filigranAcik, setFiligranAcik] = useState(false);
  const [filigranMetin, setFiligranMetin] = useState('');
  const [filigranOpaklik, setFiligranOpaklik] = useState(VARSAYILAN_FILIGRAN.opaklik);
  const [filigranAci, setFiligranAci] = useState(VARSAYILAN_FILIGRAN.aci);
  /* VARSAYILAN KAPALI: çizgi ekranda yazarken yardımcı, teslim edilen
     sayfada kötü duruyor (kullanıcı kararı). Dialogun genel kuralıyla da
     uyumlu — kimse istemeden fazladan mürekkep basmıyor. */
  const [ortaCizgi, setOrtaCizgi] = useState(false);
  const [revizyonAcik, setRevizyonAcik] = useState(false);
  /* Bu tek seçenek VARSAYILAN AÇIK, çünkü "revizyon bas" diyen kullanıcının
     istediği şey neredeyse her zaman dağıtılacak sayfalardır. Yine de
     revizyon basımının KENDİSİ varsayılan kapalı: kimse istemeden renkli
     sayfa teslim etmiyor. */
  const [yalnizIsaretli, setYalnizIsaretli] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' });
  const cancelRef = React.useRef({ cancelled: false });
  const jobRef = React.useRef<string>('');

  const cancelCurrent = React.useCallback(() => {
    cancelRef.current.cancelled = true;
    if (jobRef.current) {
      void platform.cancelExport(jobRef.current);
      void platform.discardVideoFrames?.(jobRef.current);
    }
  }, [platform]);

  const kagit = useUiStore((s) => s.scriptPaper);
  /* Profil TEK yerden: presetsiz kurulsaydı PDF, editörden farklı sayıda
     sayfa üretirdi — bu ekranın kendisi "sayfa sayısı editördekiyle aynı"
     diye YAZIYOR (Karar 34). */
  const { profil } = useSenaryoProfili();

  const size = useMemo(() => exportSize(project.settings.aspect, resolution), [project.settings.aspect, resolution]);
  const timelineTotal = useMemo(() => totalDuration(project.panels), [project.panels]);

  const renderPanel = useCallback(
    (panel: Panel) =>
      renderPanelToDataURL(panel, {
        width: size.width,
        height: size.height,
        transparent: storyboardBicim === 'png' ? transparent : false,
      }),
    [size.width, size.height, transparent, storyboardBicim],
  );

  const exportPng = useCallback(async () => {
    setBusy(true);
    cancelRef.current = { cancelled: false };
    try {
      const frames = await buildPngSequence(project, {
        fileNameTemplate: template,
        transparent,
        renderPanel,
        signal: cancelRef.current,
        onProgress: (done, total) =>
          setProgress({ done, total, message: tf('Panel %d/%d işleniyor…', done, total) }),
      });
      if (cancelRef.current.cancelled) {
        showToast(t('Dışa aktarma iptal edildi.'), 'info');
        return;
      }
      const zipName = `${safeFileName(project.meta.name)}_PNG.zip`;
      if (platform.kind === 'desktop') {
        const res = await platform.exportPngZip({ frames, zipName });
        if (res.path) showToast(tf('PNG dizisi kaydedildi: %s', res.path), 'success');
      } else {
        const bytes = await zipFrames(frames, `${project.meta.name} — ${frames.length} panel`);
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), zipName);
        showToast(tf('%d panel ZIP olarak indirildi.', frames.length), 'success');
      }
      onClose();
    } catch (err) {
      showToast(tf('Dışa aktarma hatası: %s', (err as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  }, [project, template, transparent, renderPanel, platform, showToast, onClose]);

  const exportVideo = useCallback(async () => {
    setBusy(true);
    cancelRef.current = { cancelled: false };
    const jobId = uid('job');
    jobRef.current = jobId;
    try {
      setProgress({ done: 0, total: project.panels.length, message: t('Kareler hazırlanıyor…') });

      // Kabuk destekliyorsa kareler üretildikçe diske akıtılır: ne renderer
      // ne de ana süreç tüm kare setini bellekte tutar.
      const streaming = typeof platform.pushVideoFrame === 'function';
      const segments = await buildAnimatic(project, {
        fps,
        width: size.width,
        height: size.height,
        renderPanel,
        signal: cancelRef.current,
        onProgress: (done, total) =>
          setProgress({ done, total, message: tf('Panel %d/%d işleniyor…', done, total) }),
        onSegment: streaming
          ? (segment, index) =>
              platform.pushVideoFrame!({
                jobId,
                index,
                dataUrl: segment.dataUrl,
                duration: segment.duration,
              })
          : undefined,
      });
      if (cancelRef.current.cancelled) {
        void platform.discardVideoFrames?.(jobId);
        showToast(t('Dışa aktarma iptal edildi.'), 'info');
        return;
      }

      if (!streaming) {
        // Kareler ana sürece tek mesajda geçecek; çok büyük bir yük uygulamayı
        // yanıt veremez hale getirir. Kilitlenmek yerine ne yapılacağını söyle.
        const payloadBytes = segmentsByteSize(segments);
        if (payloadBytes > MAX_TRANSFER_BYTES) {
          const mb = Math.round(payloadBytes / (1024 * 1024));
          throw new Error(
            tf('Kare verisi çok büyük (~%d MB). Çözünürlüğü düşürün, FPS\'i azaltın ya da geçiş sürelerini kısaltın.', mb),
          );
        }
      }

      const built = segmentsDuration(segments);
      const drift = Math.abs(built - timelineTotal);
      if (drift > 0.1) {
        // Kabul kriteri: ±100 ms. Aşılırsa kullanıcı uyarılır.
        showToast(
          tf('Uyarı: kare listesi süresi zaman çizelgesinden %s ms sapıyor.', (drift * 1000).toFixed(0)),
          'error',
        );
      }

      setProgress({ done: 0, total: 100, message: t('Video kodlanıyor…') });
      const res = await platform.exportVideo({
        jobId,
        fps,
        width: size.width,
        height: size.height,
        format,
        // Akıtıldıysa kare verisi burada taşınmaz.
        segments: streaming ? [] : segments,
        audioPath,
        expectedDuration: timelineTotal,
      });
      if (res.path) showToast(tf('Animatik kaydedildi: %s', res.path), 'success');
      else if (!res.cancelled) showToast(t('Video kaydedilmedi.'), 'info');
      onClose();
    } catch (err) {
      // Yarıda kalan işin diske yazılmış kareleri temizlenmeli.
      void platform.discardVideoFrames?.(jobId);
      showToast(tf('Video hatası: %s', (err as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  }, [project, fps, size, renderPanel, platform, format, audioPath, timelineTotal, showToast, onClose]);

  /**
   * Tek dosyayı kabuğa ya da tarayıcı indirmesine verir.
   *
   * Masaüstünde kullanıcı kayıt yerini seçer; web'de öyle bir API yok ve
   * indirme klasörüne düşer. Web'de "kaydedildi: <yol>" demek kullanıcıya
   * dosyanın nereye gittiğini YANLIŞ anlatırdı.
   */
  const dosyayiVer = useCallback(
    async (bytes: Uint8Array, dosyaAdi: string, turAdi: string, uzanti: string, mime: string) => {
      if (platform.dosyaKaydet) {
        const res = await platform.dosyaKaydet({ bytes, dosyaAdi, turAdi, uzantilar: [uzanti] });
        if (res.cancelled) showToast(t('Dışa aktarma iptal edildi.'), 'info');
        else if (res.path) showToast(tf('Kaydedildi: %s', res.path), 'success');
        return !res.cancelled;
      }
      downloadBlob(new Blob([bytes as BlobPart], { type: mime }), dosyaAdi);
      showToast(tf('%s indirildi.', dosyaAdi), 'success');
      return true;
    },
    [platform, showToast],
  );

  /** DOCX — ikili, `duzYaz` yolundan geçmiyor. */
  const docxAktar = useCallback(async () => {
    setBusy(true);
    try {
      const bayt = await docxYaz(project.script.blocks, profil, {
        baslik: project.script.name || project.meta.name,
        yazar: project.meta.author,
      });
      const ad = `${safeFileName(project.script.name || project.meta.name)}.docx`;
      if (await dosyayiVer(bayt, ad, t('Word belgesi'), 'docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) onClose();
    } catch (err) {
      showToast(tf('Dışa aktarım başarısız: %s', (err as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  }, [project, profil, dosyayiVer, onClose, showToast]);

  /** Fountain / FDX / Markdown / düz metin — saf metin, panel üretimi gerekmez. */
  const senaryoMetniAktar = useCallback(async () => {
    setBusy(true);
    try {
      const bloklar = project.script.blocks;
      const bicim = SENARYO_BICIMLERI().find((b) => b.id === senaryoBicim)!;
      let metin: string;
      if (senaryoBicim === 'markdown' || senaryoBicim === 'metin') {
        metin = duzYaz(bloklar, {
          profil,
          markdown: senaryoBicim === 'markdown',
          /* Tip etiketi YALNIZ düz metinde: Markdown'da yapı zaten başlık ve
             alıntı işaretleriyle taşınıyor, ikisi birden okunmaz olurdu. */
          tipEtiketi: senaryoBicim === 'metin',
        });
      } else if (senaryoBicim === 'fountain') {
        const cikti = fountainYaz(bloklar);
        /* Yuvarlanabilirlik İDDİA edilmiyor, ölçülüyor. Tutmayan blok varsa
           kullanıcı bunu dosyayı teslim etmeden ÖNCE bilmeli. */
        if (cikti.tutmayan.length > 0) {
          showToast(
            tf('%d blok Fountain\'da tipini koruyamadı (ilki: %s). Dosya yine de yazıldı.', cikti.tutmayan.length, cikti.tutmayan[0].beklenen),
            'error',
          );
        }
        metin = cikti.metin;
      } else {
        metin = fdxYaz(bloklar);
      }
      const ad = `${safeFileName(project.script.name || project.meta.name)}.${bicim.uzanti}`;
      if (await dosyayiVer(new TextEncoder().encode(metin), ad, bicim.tur, bicim.uzanti, 'text/plain'))
        onClose();
    } catch (err) {
      showToast(tf('Dışa aktarma hatası: %s', (err as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  }, [project, senaryoBicim, dosyayiVer, showToast, onClose]);

  /** PDF — kapsama göre senaryo, storyboard ya da ikisi tek dosyada. */
  const pdfAktar = useCallback(async () => {
    setBusy(true);
    cancelRef.current = { cancelled: false };
    try {
      let kareler: StoryboardKare[] = [];
      if (kapsam !== 'senaryo') {
        if (project.panels.length === 0) {
          throw new Error(t('Storyboard boş — aktarılacak panel yok.'));
        }
        setProgress({ done: 0, total: project.panels.length, message: t('Paneller çiziliyor…') });
        const frames = await buildPngSequence(project, {
          transparent: false,
          renderPanel,
          signal: cancelRef.current,
          onProgress: (done, total) =>
            setProgress({ done, total, message: tf('Panel %d/%d çiziliyor…', done, total) }),
        });
        if (cancelRef.current.cancelled) {
          showToast(t('Dışa aktarma iptal edildi.'), 'info');
          return;
        }
        kareler = frames.map((f, i) => {
          const meta = project.panels[i].meta;
          return {
            dataUrl: f.dataUrl,
            sahne: meta.scene,
            cekim: meta.shot,
            sure: meta.duration,
            not: meta.dialogue || meta.action,
          };
        });
      }

      setProgress({ done: 0, total: 1, message: t('PDF kuruluyor…') });
      const paket = await pdfPaketiKur({
        kapsam,
        profil,
        /* Yazı PROFİLDEN: sabit çağrılsaydı roman Courier gömülü basılır ve
           ekranda Times gören yazar teslim dosyasında başka bir sayfa sayısı
           bulurdu — hem de ancak yayıncı sayınca. */
        yaziTipleri: await pdfYaziTipleri(profil.yazi.id),
        aralik: aralikAcik ? { ilk: aralikIlk, son: aralikSon } : null,
        filigran: filigranAcik && filigranMetin
          ? { ...VARSAYILAN_FILIGRAN, metin: filigranMetin, opaklik: filigranOpaklik, aci: filigranAci }
          : null,
        ortaCizgi,
        revizyon:
          revizyonAcik && etkinRev
            ? {
                zemin: RENK_ZEMINI[etkinRev.renk],
                ustbilgi: ustbilgiMetni(etkinRev),
                isaretler: etkinIsaretler,
                yalnizIsaretli,
              }
            : null,
        /* §16.2 ekranı: kayıt PROJEDE saklanır (`baslikSayfasi`), burada
           yeniden yazılmıyor. Kayıttaki alan boşsa proje adına/yazarına
           DÜŞÜYOR — ekran hiç ziyaret edilmemiş projede eski davranış
           (proje adı) korunuyor, boş bir sayfa üretmiyor. */
        baslikSayfasi: baslikSayfasiAcik
          ? {
              ...baslikSayfasiKaydi,
              baslik: baslikSayfasiKaydi.baslik || project.script.name || project.meta.name,
              yazar: baslikSayfasiKaydi.yazar || project.meta.author,
            }
          : null,
        bloklar: project.script.blocks,
        /* İki sütunlu belgenin metni AYRI depoda. İkisi de veriliyor;
           hangisinin çizileceğine doküman tipine bakarak `pdfPaketiKur`
           karar veriyor — burada bir daha sorulmuyor (Karar 2). */
        ciftler,
        dokumanTipi: project.meta.dokumanTipi,
        kareler,
        baslik: project.script.name || project.meta.name,
        yazar: project.meta.author,
      });

      const ekler =
        kapsam === 'senaryo' ? '' : kapsam === 'storyboard' ? '_storyboard' : '_senaryo-storyboard';
      const ad = `${safeFileName(project.meta.name)}${ekler}.pdf`;
      /* İstendi ama UYGULANMADI (iki sütunlu belge) — sessizce beyaz sayfa
         teslim etmek, ekibin revizyonu gözden kaçırmasına yol açar (§15.4). */
      if (revizyonAcik && etkinRev && !paket.revizyonUygulandi) {
        showToast(
          t('Revizyon basımı iki sütunlu belgeye uygulanmadı — sayfalar beyaz basıldı.'),
          'error',
        );
      }
      if (await dosyayiVer(paket.pdf, ad, t('PDF belgesi'), 'pdf', 'application/pdf')) onClose();
    } catch (err) {
      showToast(tf('PDF hatası: %s', (err as Error).message), 'error');
    } finally {
      setBusy(false);
    }
  /* BÜTÜN SEÇENEKLER BURADA OLMAK ZORUNDA.
     Dizi eskiden yalnız `[kapsam, project, profil, renderPanel, dosyayiVer,
     showToast, onClose, baslikSayfasiKaydi]` idi ve sonuç ölçüldü: geri
     çağrı İLK render'da, her seçenek `false`ken donuyordu. Kullanıcı
     "Başlık sayfası ekle"yi işaretliyor, ekran güncelleniyor, ama PDF'i
     üreten fonksiyon hâlâ ilk hâli görüyordu — başlık sayfası, filigran
     ve sayfa aralığı ÇIKTIYA HİÇ GİTMİYORDU ve hiçbir hata bildirilmiyordu.
     Gerçek uygulamada üretilen dosyalar incelenerek bulundu; arayüz
     testleri kutunun işaretlendiğini doğruluyor, çıktıya ulaştığını
     doğrulamıyordu.

     Yeni bir seçenek eklendiğinde BURAYA da eklenmeli. */
  }, [
    kapsam, project, profil, renderPanel, dosyayiVer, showToast, onClose,
    baslikSayfasiKaydi, baslikSayfasiAcik,
    aralikAcik, aralikIlk, aralikSon,
    filigranAcik, filigranMetin, filigranOpaklik, filigranAci,
    ortaCizgi, revizyonAcik, yalnizIsaretli, etkinRev, etkinIsaretler,
    ciftler, storyboardBicim, senaryoBicim,
  ]);

  /** Kapsam + biçim → çalıştırılacak yol ve düğme yazısı. */
  const eylem = useMemo(() => {
    if (kapsam === 'ikisi') return { calistir: pdfAktar, etiket: t('PDF oluştur (senaryo + storyboard)') };
    if (kapsam === 'senaryo') {
      if (senaryoBicim === 'pdf') return { calistir: pdfAktar, etiket: t('Senaryo PDF oluştur') };
      if (senaryoBicim === 'docx') return { calistir: docxAktar, etiket: t('Word belgesi oluştur') };
      const b = SENARYO_BICIMLERI().find((x) => x.id === senaryoBicim)!;
      return { calistir: senaryoMetniAktar, etiket: tf('%s oluştur', b.etiket) };
    }
    if (storyboardBicim === 'pdf') return { calistir: pdfAktar, etiket: t('Storyboard PDF oluştur') };
    if (storyboardBicim === 'video') return { calistir: exportVideo, etiket: t('Animatik oluştur') };
    return { calistir: exportPng, etiket: t('PNG dizisi oluştur') };
  }, [kapsam, senaryoBicim, storyboardBicim, pdfAktar, docxAktar, senaryoMetniAktar, exportVideo, exportPng]);

  React.useEffect(() => platform.onExportProgress((p) => {
    if (p.jobId !== undefined) setProgress({ done: p.percent, total: 100, message: p.message });
  }), [platform]);

  if (!allowed('export')) {
    return (
      <Modal title={t('Dışa Aktar')} onClose={onClose}>
        <p className="text-amber-300">
          {t('Bu roldeki kullanıcılar dışa aktarma yapamaz. Yalnızca')} <strong>{t('Sahip')}</strong> {t('rolü dışa aktarabilir.')}
        </p>
      </Modal>
    );
  }

  return (
    <Panel
      onClose={busy ? cancelCurrent : onClose}
      altlik={
        busy ? (
          <button
            type="button"
            onClick={cancelCurrent}
            className="w-full bg-denetim px-3 py-3 text-[13px] font-medium text-kirmizi hover:bg-etkin"
          >
            {t('İptal et')}
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="disa-aktar-uret"
              onClick={eylem.calistir}
              className="w-full bg-amber px-3 py-3 text-[13.5px] font-semibold text-amber-uzeri hover:bg-amber-hover"
            >
              {eylem.etiket}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 text-[12.5px] text-metin-sonuk hover:text-metin-govde"
            >
              {t('Vazgeç')}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {/* §16.2 — pencerenin İLK seçimi *ne* aktarılacağıdır. Senaryo
            yapımcıya/festivale, storyboard sete gider; tek bir "projeyi aktar"
            düğmesi kullanıcıyı istemediği yarısını taşımaya zorlardı. */}
        <Field label={t('Ne aktarılacak')}>
          {/* İKON KARTLARI: eskiden üç ince metin düğmesiydi ve seçili olan
              ancak renk farkından anlaşılıyordu. İkonlar projenin ÇİZGİ
              setinden — emoji farklı platformda farklı çizilir ve
              tasarımın kalınlığına oturmaz (`Ikon.tsx`). */}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['senaryo', t('Senaryo'), 'sayfa'],
              ['storyboard', 'Storyboard', 'kareler'],
              ['ikisi', t('İkisi'), 'sayfa-kare'],
            ] as [Kapsam, string, IkonAdi][]).map(([k, etiket, ikon]) => (
              <button
                key={k}
                type="button"
                data-testid={`kapsam-${k}`}
                disabled={busy}
                onClick={() => setKapsam(k)}
                className={
                  'flex flex-col items-center gap-1.5 rounded-sm border px-2 py-3 text-[12.5px] transition ' +
                  (kapsam === k
                    ? 'border-amber bg-amber-zemin text-amber'
                    : 'border-kenar-denetim bg-denetim text-metin-govde hover:border-[#3a4250]')
                }
              >
                <Ikon ad={ikon} boyut={20} />
                {etiket}
              </button>
            ))}
          </div>
        </Field>

        {kapsam === 'senaryo' && (
          <Field label={t('Biçim')}>
            <select
              data-testid="senaryo-bicim"
              value={senaryoBicim}
              disabled={busy}
              onChange={(e) => setSenaryoBicim(e.target.value as SenaryoBicim)}
              className={SECIM}
            >
              {SENARYO_BICIMLERI().map((b) => (
                <option key={b.id} value={b.id}>
                  {b.etiket}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-metin-etiket">
              {senaryoBicim === 'pdf'
                ? `${kagit === 'a4' ? 'A4' : 'US Letter'} · ${t('sayfa sayısı editördekiyle aynı')}`
                : senaryoBicim === 'docx'
                  /* Sayfa sayısı GARANTİ EDİLMİYOR: Word kendi sayfalamasını
                     yapıyor. Söylememek, kullanıcının PDF'teki sözleşmenin
                     burada da geçerli olduğunu sanmasına yol açardı. */
                  ? `${profil.yazi.ad} · ${t('ölçüler aynı, sayfalamayı Word yapar')}`
                  : t('Düz metin — panel görselleri taşınmaz.')}
            </p>
          </Field>
        )}

        {/* PDF SEÇENEKLERİ (§16.2 borcu). Yalnız PDF yolunda çizilir:
            Fountain'a filigran basmanın karşılığı yok. Hepsi VARSAYILAN
            KAPALI — filigranlı ya da eksik sayfalı bir dosya kazayla teslim
            edilirse geri alınamaz. */}
        {senaryoBicim === 'pdf' && kapsam !== 'storyboard' && (
          <Field label={t('PDF seçenekleri')}>
            <div className="space-y-1.5">
              <Anahtar
                testid="baslik-sayfasi-ac"
                acik={baslikSayfasiAcik}
                pasif={busy}
                onDegis={setBaslikSayfasiAcik}
                etiket={t('Başlık sayfası ekle')}
              />

              {ikiSutunlu && (
                <Anahtar
                  testid="orta-cizgi"
                  acik={ortaCizgi}
                  pasif={busy}
                  onDegis={setOrtaCizgi}
                  etiket={t('Sütun ayıracını bas')}
                  ipucu={t('çıktıda varsayılan olarak yok')}
                />
              )}

              {etkinRev ? (
                <Anahtar
                  testid="revizyon-ac"
                  acik={revizyonAcik}
                  pasif={busy}
                  onDegis={setRevizyonAcik}
                  etiket={t('Revizyon olarak bas')}
                  ipucu={
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        data-testid="revizyon-renk"
                        className="inline-block h-3 w-3 rounded-sm border border-cizgi"
                        style={{
                          background: `rgb(${RENK_ZEMINI[etkinRev.renk]
                            .map((k) => Math.round(k * 255))
                            .join(',')})`,
                        }}
                      />
                      {ustbilgiMetniArayuz(etkinRev)}
                    </span>
                  }
                />
              ) : (
                <p className="text-[11px] text-metin-sonuk" data-testid="revizyon-yok">
                  {t('Revizyon yok — renkli sayfa basmak için önce bir revizyon açın.')}
                </p>
              )}

              {revizyonAcik && etkinRev && (
                <div className="ml-5">
                  <Anahtar
                    testid="yalniz-isaretli"
                    acik={yalnizIsaretli}
                    pasif={busy}
                    onDegis={setYalnizIsaretli}
                    etiket={t('Yalnız işaretli sayfalar')}
                    ipucu={
                      <span data-testid="isaret-sayisi">
                        {etkinIsaretler.size
                          ? `${etkinIsaretler.size} ${t('işaretli satır')}`
                          : yalnizIsaretli
                            ? t('hiç işaret yok — çıktı boş olur')
                            : t('hiç işaret yok — sayfalar renksiz basılır')}
                      </span>
                    }
                  />
                </div>
              )}

              <Anahtar
                testid="aralik-ac"
                acik={aralikAcik}
                pasif={busy}
                onDegis={setAralikAcik}
                etiket={t('Sayfa aralığı')}
              />
              {aralikAcik && (
                <div className="mzn-sayi ml-5 flex items-center gap-2 pb-1">
                  <input
                    type="number"
                    min={1}
                    data-testid="aralik-ilk"
                    value={aralikIlk}
                    disabled={busy}
                    onChange={(e) => setAralikIlk(Number(e.target.value))}
                    className="w-16 rounded-sm border border-kenar-denetim bg-denetim px-2 py-1.5 text-[13px] outline-none focus:border-amber"
                  />
                  <span aria-hidden className="text-metin-etiket">{'\u2013'}</span>
                  <input
                    type="number"
                    min={1}
                    data-testid="aralik-son"
                    value={aralikSon}
                    disabled={busy}
                    onChange={(e) => setAralikSon(Number(e.target.value))}
                    className="w-16 rounded-sm border border-kenar-denetim bg-denetim px-2 py-1.5 text-[13px] outline-none focus:border-amber"
                  />
                </div>
              )}

              <Anahtar
                testid="filigran-ac"
                acik={filigranAcik}
                pasif={busy}
                onDegis={setFiligranAcik}
                etiket={t('Filigran')}
              />
              {filigranAcik && (
                <div className="space-y-2 pb-1 pl-5">
                  <input
                    type="text"
                    data-testid="filigran-metin"
                    value={filigranMetin}
                    disabled={busy}
                    placeholder={t('Alıcının adı ya da TASLAK')}
                    onChange={(e) => setFiligranMetin(e.target.value)}
                    className="w-full rounded-sm border border-kenar-denetim bg-denetim px-2.5 py-2 text-[13px] outline-none focus:border-amber"
                  />
                  <label className="flex items-center gap-2.5 text-[12px] text-metin-sonuk">
                    {t('Koyuluk')}
                    <input
                      type="range"
                      min={0.04}
                      max={0.4}
                      step={0.02}
                      data-testid="filigran-opaklik"
                      value={filigranOpaklik}
                      disabled={busy}
                      onChange={(e) => setFiligranOpaklik(Number(e.target.value))}
                      className="flex-1 accent-[var(--mzn-amber)]"
                    />
                  </label>
                  <label className="flex items-center gap-2.5 text-[12px] text-metin-sonuk">
                    {t('Açı')}
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={1}
                      data-testid="filigran-aci"
                      value={filigranAci}
                      disabled={busy}
                      onChange={(e) => setFiligranAci(Number(e.target.value))}
                      className="flex-1 accent-[var(--mzn-amber)]"
                    />
                    <span className="mzn-sayi">{filigranAci}{'\u00b0'}</span>
                  </label>
                  <p className="text-[10px] text-metin-cok-zayif">
                    {t('Metnin ALTINA basılır: kopyayı işaretler, okumayı engellemez.')}
                  </p>
                </div>
              )}
            </div>
          </Field>
        )}

        {kapsam === 'storyboard' && (
          <Field label={t('Biçim')}>
            <select
              data-testid="storyboard-bicim"
              value={storyboardBicim}
              disabled={busy}
              onChange={(e) => setStoryboardBicim(e.target.value as StoryboardBicim)}
              className={SECIM}
            >
              <option value="png">{t('PNG dizisi (ZIP)')}</option>
              <option value="pdf">{t('PDF (panel ızgarası)')}</option>
              <option value="video">{t('Animatik video')}</option>
            </select>
          </Field>
        )}

        {kapsam === 'ikisi' && (
          <p className="bg-etkin/60 px-3 py-2 text-[11px] text-metin-zayif">
            {t('Tek PDF: önce senaryo, arkasında storyboard panelleri. Senaryo sayfaları editördekiyle aynı sayıda kalır.')}
          </p>
        )}

        {kapsam !== 'senaryo' && (
        <Field label={t('Çözünürlük')}>
          <select
            value={resolution}
            disabled={busy}
            onChange={(e) => setResolution(e.target.value as ExportResolutionId)}
            className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
          >
            {EXPORT_RESOLUTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-metin-etiket">
            {t('Çıktı')}: {size.width}×{size.height} px · {project.settings.aspect}
          </p>
        </Field>
        )}

        {kapsam === 'storyboard' && storyboardBicim === 'png' && (
          <>
            <Field label={t('Dosya adı şablonu')}>
              <input
                value={template}
                disabled={busy}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
              />
              <p className="mt-1 text-[10px] text-metin-etiket">
                {t('Değişkenler')}: {dosyaAdiDegiskenleri(arayuzDili()).adlar.map((a) => `{${a}}`).join(' ')} — {t('örn.')} S1_C3.png
              </p>
            </Field>
            <label className="flex items-center gap-2 text-xs text-metin-govde">
              <input
                type="checkbox"
                checked={transparent}
                disabled={busy}
                onChange={(e) => setTransparent(e.target.checked)}
                className="accent-[var(--mzn-amber)]"
              />
              {t('Şeffaf arka plan (panel zemini çizilmez)')}
            </label>
          </>
        )}

        {kapsam === 'storyboard' && storyboardBicim === 'video' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Biçim')}>
                <select
                  value={format}
                  disabled={busy}
                  onChange={(e) => setFormat(e.target.value as 'mp4' | 'webm')}
                  className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
                >
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="webm">WebM (VP9)</option>
                </select>
              </Field>
              <Field label="FPS">
                <select
                  value={fps}
                  disabled={busy}
                  onChange={(e) => setFps(Number(e.target.value) as 24 | 25 | 30)}
                  className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
                >
                  {[24, 25, 30].map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={t('Ses dosyası (opsiyonel)')}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate bg-denetim px-2 py-1.5 text-[11px] text-metin-zayif">
                  {audioPath ?? t('Seçilmedi')}
                </span>
                <Button
                  disabled={busy || !platform.pickAudioFile}
                  onClick={async () => {
                    const p = await platform.pickAudioFile?.();
                    if (p) setAudioPath(p);
                  }}
                >
                  {t('Seç')}
                </Button>
                {audioPath && <Button onClick={() => setAudioPath(null)}>{t('Kaldır')}</Button>}
              </div>
              {!platform.canExportVideo && (
                <p className="mt-1 text-[10px] text-amber-400">
                  {t('Video dışa aktarma yalnızca masaüstü uygulamasında kullanılabilir (gömülü ffmpeg).')}
                </p>
              )}
            </Field>

            <p className="bg-etkin/60 px-3 py-2 text-[11px] text-metin-zayif">
              {t('Zaman çizelgesi toplamı:')} <strong className="text-metin-guclu">{formatDuration(timelineTotal)}</strong>{' '}
              {tf('(%s sn) · %d panel. Geçişler kare kare üretilir; çıktı süresi bu değerle ±100 ms içinde eşleşir.', timelineTotal.toFixed(3), project.panels.length)}
            </p>
          </>
        )}

        {busy && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden bg-denetim">
              <div
                className="h-full bg-amber-zemin transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-metin-zayif">{progress.message}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/**
 * Biçim açılır listelerinin sınıfı.
 *
 * Panel yeniden tasarlanırken (2026-08-30) satırlar ve anahtarlar
 * büyütülmüştü ama bu iki `select` 11px/py-1.5 kalmıştı — kullanıcının
 * "yazı ve tuşlar çok küçük" şikâyeti tam olarak bunu da kapsıyordu.
 * Sabit olarak duruyor ki ikisi bir daha ayrışmasın.
 */
const SECIM =
  'w-full rounded-sm border border-kenar-denetim bg-denetim px-2.5 py-2 text-[13px] ' +
  'outline-none focus:border-amber';

/**
 * DIŞA AKTAR PANELİ — ekranın ORTASINDA değil, düğmesinin ALTINDA.
 *
 * Ortada açılan bir pencere, kullanıcıyı çalıştığı yerden koparıp
 * "kesinti" diliyle konuşuyordu; dışa aktarım bir kesinti değil, gidilen
 * bir yer. Panel araç çubuğunun altından başlıyor ve sağ kenara
 * yapışıyor — `AnalizPanosuDialog` ve Ayarlar paneliyle aynı kabuk dili
 * (kullanıcı kararı 2026-08-30).
 *
 * Tam yükseklik seçildi: yüzen bir kartta kapsam + biçim + beş seçenek
 * kaydırma istiyordu ve filigran/aralık alt alanları açılınca liste
 * kırpılıyordu.
 */
function Panel({
  children, altlik, onClose,
}: { children: React.ReactNode; altlik: React.ReactNode; onClose: () => void }) {
  const kok = React.useRef<HTMLDivElement>(null);
  /* Escape ve ilk odak panelin KENDİ işi — `Modal`ın kuralı, `AnalizPanosu`
     bunu unutmuş ve "Esc — çık" yalan söylemişti. */
  React.useEffect(() => { kok.current?.focus(); }, []);
  return (
    <div
      ref={kok}
      role="dialog"
      aria-label={t('Dışa Aktar')}
      tabIndex={-1}
      data-testid="disa-aktar-paneli"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="fixed right-0 top-[var(--cubuk-yukseklik,84px)] bottom-0 z-[70] flex w-[380px]
        flex-col border-l border-kenar bg-panel shadow-[-18px_0_44px_rgba(0,0,0,.45)] outline-none"
    >
      <div className="flex shrink-0 items-center border-b border-kenar px-4 py-3">
        <h2 className="text-[14px] font-semibold text-metin-guclu">{t('Dışa Aktar')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Kapat')}
          className="ml-auto text-metin-etiket hover:text-metin-govde"
        >
          <Ikon ad="kapat" boyut={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      <div className="shrink-0 border-t border-kenar bg-cubuk px-4 py-3">{altlik}</div>
    </div>
  );
}

/**
 * Açık/kapalı ANAHTARI.
 *
 * Kutucuk 13px'ti ve kullanıcı "fark bile etmiyorum" dedi (2026-08-30).
 * Anahtar kapalıyken de görünür bir nesne; satırın tamamı 38px ve
 * tıklanabilir.
 *
 * Girdi DOM'DA KALIYOR (saydam ama tam boy): ekran okuyucu onu görüyor ve
 * `data-testid` üzerinden sürülebiliyor. `sr-only` yapılsaydı testler ve
 * yardımcı teknoloji için tıklanamaz olurdu.
 */
function Anahtar({
  testid, acik, pasif, onDegis, etiket, ipucu,
}: {
  testid: string; acik: boolean; pasif?: boolean;
  onDegis: (v: boolean) => void; etiket: string; ipucu?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-sm px-1 py-2 hover:bg-etkin">
      <span className="relative inline-flex h-[19px] w-[34px] shrink-0 items-center">
        <input
          type="checkbox"
          data-testid={testid}
          checked={acik}
          disabled={pasif}
          onChange={(e) => onDegis(e.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span
          /* AÇIK İZ BELİRGİN OLMALI. Ölçüldü: `amber-zemin` (42,33,24) ile
             kapalı iz (26,31,38) arasındaki fark göz için yok denecek
             kadar az; açık/kapalı ayrımı tek küçük topuza kalıyordu.
             `amber-kenar` (67,51,31) sıcak ve fark edilir, hâlâ kâğıdı
             bastırmayacak kadar sakin. */
          className="pointer-events-none h-[19px] w-[34px] rounded-full border border-kenar-denetim
            bg-denetim transition-colors peer-checked:border-amber peer-checked:bg-amber-kenar"
        />
        <span
          className="pointer-events-none absolute left-[3px] h-[13px] w-[13px] rounded-full
            bg-metin-zayif transition-all peer-checked:left-[18px] peer-checked:bg-amber"
        />
      </span>
      <span className="text-[13px] text-metin-govde">{etiket}</span>
      {ipucu ? <span className="ml-auto text-[11.5px] text-metin-etiket">{ipucu}</span> : null}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-metin-etiket">{label}</p>
      {children}
    </div>
  );
}

export { downloadBlob, dataUrlToUint8 };
