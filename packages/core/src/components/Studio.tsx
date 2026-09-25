import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { kayitIcinProje } from '../doc/schema';
import { t } from '../dil/arayuz';
import { sunucuMetni } from '../collab/api';
import { useProjectStore, ensureActivePanel, projectActions } from '../store/project';
import { useUiStore } from '../store/ui';
import { useCollabStore } from '../store/collab';
import { usePlatform } from '../platform/context';
import { Toolbar } from './Toolbar';
import { LibraryPanel } from './library/LibraryPanel';
import { ScriptEditor } from './script/ScriptEditor';
import { IkiSutunEditor } from './script/IkiSutunEditor';
import { YeniProjeDialog, type YeniProjeSecimi } from './kitaplik/YeniProjeDialog';
import { OdakKenari } from './script/OdakKenari';
import { CanvasStage } from './canvas/CanvasStage';
import { defaultDrawLayerId } from '../model/layers';
import { Inspector } from './inspector/Inspector';
import { Timeline } from './timeline/Timeline';
import { PanelGrid } from './grid/PanelGrid';
import { Presentation } from './presentation/Presentation';
import { CollapseHandle, Resizer } from './layout/Resizer';
import { ExportDialog } from './dialogs/ExportDialog';
import { SessionDialog } from './dialogs/SessionDialog';
import { RecentDialog } from './dialogs/RecentDialog';
import { CeviriDialog } from './dialogs/CeviriDialog';
import { BaslikSayfasiDialog } from './dialogs/BaslikSayfasiDialog';
import { FonOlusturDialog } from './fon/FonOlusturDialog';
import { FonPaneli } from './fon/FonPaneli';
import { MuhurDialog } from './dialogs/MuhurDialog';
import { useSenaryoProfili } from '../hooks/useSenaryoProfili';
import { kanonikMetin, kayitSonrasiMuhurle } from '../kanit/muhur';
import { KarsilastirDialog } from './dialogs/KarsilastirDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { AyarlarDialog } from './dialogs/AyarlarDialog';
import { AnalizPanosuDialog } from './dialogs/AnalizPanosuDialog';
import { YardimPaneli } from './dialogs/YardimPaneli';
import { YazarlikDialog } from './dialogs/YazarlikDialog';
import { Toast } from './Toast';
import { useBaglamMenusu } from '../hooks/useBaglamMenusu';
import { useSahnePanelBagi } from '../hooks/useSahnePanelBagi';
import { useDilKabugu } from '../hooks/useDilKabugu';
import { useShortcuts } from '../hooks/useShortcuts';
import { useAutosave } from '../hooks/useAutosave';
import { useVeriGuvenligi } from '../hooks/useVeriGuvenligi';
import { useKurtarma } from '../hooks/useKurtarma';
import { RecoveryDialog } from './dialogs/RecoveryDialog';
import { SonYazim, VeriSeridi } from './VeriSeridi';
import { OnarimSeridi } from './OnarimSeridi';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { collectAssets } from '../util/assets';
import { createProject } from '../model/factory';
import { unpackProject } from '../model/project-io';
import { assetUrlsFrom } from '../util/assets';
import { moduDegistir } from '../store/mod';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../model/dokuman-tipi';
import { useDaktilo } from '../hooks/useDaktilo';
const MapWorkspace = React.lazy(() => import('./map/MapWorkspace').then((module) => ({ default: module.MapWorkspace })));

export function Studio() {
  useDaktilo();
  const platform = usePlatform();
  const project = useProjectStore((s) => s.project);
  const doc = useProjectStore((s) => s.doc);
  useEffect(() => { useUiStore.setState({ playing: false, playhead: 0 }); }, [doc]);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const allowed = useProjectStore((s) => s.allowed);
  const scriptRepairs = useProjectStore((s) => s.scriptRepairs);
  // Rol değişimine abone ol — sunucu rolü güncellediğinde arayüz yenilensin.
  useProjectStore((s) => s.role);
  const ui = useUiStore();
  const showToast = useUiStore((s) => s.showToast);
  const denial = useCollabStore((s) => s.lastDenial);
  /* Belge iki sütunlu mu — §6.6. Tipin ADINA değil BAYRAĞINA bakılıyor:
     `id === 'goruntu-ses'` karşılaştırması yarın ikinci bir iki sütunlu tip
     eklendiğinde sessizce eksik kalırdı. */
  const ikiSutunlu = Boolean(
    (dokumanTipi(useProjectStore((s) => s.project.meta.dokumanTipi)) ?? DOKUMAN_TIPLERI.senaryo)
      .ikiSutun,
  );

  /* Tam ekran analiz MAĞAZADA: menüden de, denetçi sekmesindeki
     düğmeden de açılıyor. */
  const analizTamEkran = useUiStore((s) => s.analizTamEkran);
  const analizTamEkranAyarla = useUiStore((s) => s.analizTamEkranAyarla);

  const [dialog, setDialog] = useState<
    null | 'export' | 'session' | 'recent' | 'versions' | 'shortcuts' | 'ceviri'
    | 'karsilastir' | 'yeni-proje' | 'baslik-sayfasi' | 'ayarlar' | 'yazarlik'
    | 'yardim' | 'fon-olustur' | 'fon-paneli' | 'muhur'
  >(null);
  /* Yardımdaki bir düğme kullanıcıyı doğrudan ilgili pencereye götürüyor.
     Hangi konudan gelindiği saklanıyor ki geri dönünce aynı yerde
     bulsun — yardımı okuyup pencereyi açan kullanıcı, kapatınca listenin
     başına atılırsa aradığını yeniden bulmak zorunda kalır. */
  const [yardimKonusu, setYardimKonusu] = useState<string | undefined>(undefined);

  const panel = useMemo(
    () => project.panels.find((p) => p.id === activePanelId) ?? project.panels[0],
    [project.panels, activePanelId],
  );

  useEffect(() => {
    ensureActivePanel();
  }, [project.panels.length]);

  // Yorumcu yalnızca işaretleme katmanına yazabilir. Rol kısıtlıysa aktif
  // katman otomatik olarak işaretleme katmanına alınır; böylece kullanıcı
  // sunucunun reddedeceği bir katmana çizmeye çalışmaz.
  const annotateOnly = !allowed('edit') && allowed('annotate');
  useEffect(() => {
    if (!panel) return;
    const current = panel.layers.find((l) => l.id === ui.activeLayerId);
    if (annotateOnly && current?.kind !== 'annotation') {
      const target = panel.layers.find((l) => l.kind === 'annotation');
      if (target) useUiStore.setState({ activeLayerId: target.id });
      return;
    }
    if (!current && panel.layers.length) {
      useUiStore.setState({ activeLayerId: defaultDrawLayerId(panel.layers, allowed('edit')) });
    }
  }, [panel, ui.activeLayerId, annotateOnly, allowed]);

  const activeLayer = panel?.layers.find((l) => l.id === ui.activeLayerId);
  const canEditActiveLayer =
    allowed('edit') || (allowed('annotate') && activeLayer?.kind === 'annotation');

  /* ----------------------------- dosya ----------------------------- */

  const { profil: muhurProfili } = useSenaryoProfili();

  const doSave = useCallback(
    async (saveAs = false) => {
      const state = useProjectStore.getState();
      if (!state.allowed('export')) {
        showToast(t('Bu rol dışa aktaramaz.'), 'error');
        return;
      }
      // Kayıt sürerken yapılan düzenlemeler dosyaya girmez; "kaydedildi"
      // işaretini yalnızca doküman değişmediyse temizle.
      const saved = state.project;
      const markIfUnchanged = () => {
        if (useProjectStore.getState().project === saved) useProjectStore.getState().markSaved();
      };
      try {
        /* `kayitIcinProje`: `state.project` belgenin ancak dörtte birini
           taşıyor (meta/settings/panels/script). Doğrudan yollamak sözlüğü,
           karakterleri, çekim dökümünü, başlık sayfasını ve iki sütunlu
           belgenin metnini dosyadan DÜŞÜRÜR. */
        const res = await platform.saveProject(
          kayitIcinProje(saved, state.doc),
          collectAssets(state.assetUrls),
          {
            path: state.filePath,
            saveAs,
          },
        );
        if (res.cancelled) return;
        if (res.path) {
          useProjectStore.getState().setFilePath(res.path);
          markIfUnchanged();
          showToast(`${t('Kaydedildi')}: ${res.path}`, 'success');
        } else {
          markIfUnchanged();
          showToast(t('Proje kaydedildi.'), 'success');
        }
        /* KAYITTAN SONRA MÜHÜR. Kaydın kendisi BAŞARILI sayıldıktan sonra
           çalışıyor: mühür alınamadıysa metin yine diskte ve kullanıcı
           kaydını kaybetmiş olmuyor. Hata YUTULMUYOR ama kaydı da
           düşürmüyor — §15.4'ün kanıt yolundaki dengesi bu. */
        try {
          await kayitSonrasiMuhurle(platform.kanit, {
            projeId: saved.meta.id,
            metin: kanonikMetin(saved.script?.blocks ?? [], muhurProfili),
            yazar: useCollabStore.getState().userName,
            etiket: res.path ?? '',
          });
        } catch (err) {
          showToast(`${t('Mühür alınamadı')}: ${(err as Error).message}`, 'error');
        }
      } catch (err) {
        showToast(`${t('Kaydedilemedi')}: ${(err as Error).message}`, 'error');
      }
    },
    [platform, showToast, muhurProfili],
  );

  const doOpen = useCallback(async () => {
    try {
      const picked = await platform.openProjectDialog();
      if (!picked) return;
      const bundle = await unpackProject(picked.data);
      const assets = assetUrlsFrom(bundle.assets);
      useProjectStore.getState().replaceProject(bundle.project, { filePath: picked.path, assets });
      showToast(`${t('Açıldı')}: ${bundle.project.meta.name}`, 'success');
    } catch (err) {
      showToast(`${t('Açılamadı')}: ${(err as Error).message}`, 'error');
    }
  }, [platform, showToast]);

  /**
   * VERİLEN YOLDAKİ projeyi açar — dosya seçtirmeden.
   *
   * `doOpen` ile aynı gövde ama dialog YOK: kullanıcı dosyayı zaten seçti
   * (masaüstünde çift tıkladı) ve ona bir kez daha sormak, yaptığı seçimi
   * yok saymak olurdu (kullanıcı bildirimi 2026-08-26).
   */
  const doOpenPath = useCallback(async (yol: string) => {
    try {
      /* Kaydedilmemiş iş UYARISI: çift tıklama, açık belgeyi kazara
         kapatmanın en kolay yolu ve §15'in koruduğu şey tam olarak bu. */
      if (useProjectStore.getState().dirty
        && !window.confirm(t('Kaydedilmemiş değişiklikler var. Devam edilsin mi?'))) {
        return;
      }
      const data = await platform.readProjectFile(yol);
      const bundle = await unpackProject(data);
      const assets = assetUrlsFrom(bundle.assets);
      useProjectStore.getState().replaceProject(bundle.project, { filePath: yol, assets });
      showToast(`${t('Açıldı')}: ${bundle.project.meta.name}`, 'success');
    } catch (err) {
      /* Sessizce boş bir pencere göstermek YASAK: kullanıcı dosyasının
         açıldığını sanıp üstüne yazabilirdi (§15.4). */
      showToast(`${t('Açılamadı')}: ${(err as Error).message}`, 'error');
    }
  }, [platform, showToast]);

  useEffect(() => {
    if (!platform.onProjeDosyasiAc) return;
    return platform.onProjeDosyasiAc((yol) => { void doOpenPath(yol); });
  }, [platform, doOpenPath]);

  /**
   * Yeni proje — TÜR SEÇTİREREK.
   *
   * Önceden doğrudan `createProject()` çağırıyordu, yani stüdyodan
   * açılan her yeni proje senaryo oluyordu: belge türünü seçebildiğin tek
   * yer kitaplıktı. Aynı eylemin iki farklı sonucu olması, kullanıcının
   * "nereden başlattığına" bağlı gizli bir kural demekti (Karar 2).
   *
   * Kaydedilmemiş iş uyarısı diyalogdan ÖNCE: kullanıcı türünü seçip
   * "Oluştur"a bastıktan sonra "vazgeç" sorusuyla karşılaşmamalı.
   */
  const doNew = useCallback(() => {
    if (useProjectStore.getState().dirty && !window.confirm(t('Kaydedilmemiş değişiklikler var. Devam edilsin mi?'))) {
      return;
    }
    setDialog('yeni-proje');
  }, []);

  /* Kaydedilmemiş iş uyarısı pencereden ÖNCE — `doNew` ile aynı kural:
     kullanıcı kurumunu seçtikten sonra "vazgeç" sorusuyla karşılaşmamalı. */
  const doFonDosyasi = useCallback(() => {
    if (useProjectStore.getState().dirty && !window.confirm(t('Kaydedilmemiş değişiklikler var. Devam edilsin mi?'))) {
      return;
    }
    setDialog('fon-olustur');
  }, []);

  const yeniProjeyiKur = useCallback(
    (secim: YeniProjeSecimi) => {
      useProjectStore.getState().replaceProject(
        createProject({ meta: { name: secim.ad, dokumanTipi: secim.tip } }),
      );
      setDialog(null);
      showToast(`${t('Yeni proje')}: ${secim.ad}`, 'info');
    },
    [showToast],
  );

  useShortcuts({
    onSave: () => void doSave(false),
    onSaveAs: () => void doSave(true),
    onExport: () => setDialog('export'),
    onKisayollar: () => setDialog('shortcuts'),
    onYazarlik: () => setDialog('yazarlik'),
  });
  // §16.4: proje sözlüğü ve denetim dili kabuğa taşınır (web'de sessiz).
  useDilKabugu();
  // §16.4: bağlam menüsünün renderer ucu (ana süreç bu köprüyü çağırır).
  useBaglamMenusu();
  // F5: senaryo sırası değişince bağlı paneller izliyor.
  useSahnePanelBagi();

  // Masaüstü menüsü ile klavye kısayolları aynı davranışı paylaşır.
  useEffect(() => {
    if (!platform.onMenuAction) return;
    return platform.onMenuAction((action) => {
      const store = useProjectStore.getState();
      switch (action) {
        case 'yeni': doNew(); break;
        case 'ac': void doOpen(); break;
        case 'kaydet': void doSave(false); break;
        case 'farkli-kaydet': void doSave(true); break;
        case 'son-projeler': setDialog('recent'); break;
        case 'surum-gecmisi': setDialog('versions'); break;
        case 'disa-aktar': setDialog('export'); break;
        case 'oturum': setDialog('session'); break;
        case 'kisayollar': setDialog('shortcuts'); break;
        case 'yardim': setDialog('yardim'); break;
        case 'ayarlar': setDialog('ayarlar'); break;
        case 'analiz': analizTamEkranAyarla(true); break;
        case 'geri-al': store.undo(); break;
        case 'ileri-al': store.redo(); break;
        case 'yeni-panel':
          if (store.allowed('edit')) projectActions.addPanel();
          break;
        case 'panel-cogalt':
          if (store.allowed('edit')) projectActions.duplicatePanel(store.activePanelId);
          break;
        case 'grid-gorunum':
          moduDegistir(useUiStore.getState().viewMode === 'board' ? 'grid' : 'board');
          break;
        case 'panelleri-gizle':
          useUiStore.setState({ chromeHidden: !useUiStore.getState().chromeHidden });
          break;
        case 'sigdir':
          useUiStore.getState().resetView();
          break;
      }
    });
  }, [platform, doNew, doOpen, doSave]);
  useAutosave(platform.canSaveLocally);
  /* §15.3: açılışta kurtarma denetimi. Yazıcı bu karar VERİLMEDEN
     başlatılmaz — başlatılsaydı henüz oynatılmamış bir günlüğün sonuna yeni
     çerçeveler eklenirdi ve "Yoksay" kullanıcının kendi yeni yazdıklarını da
     arşive gönderirdi. */
  const kurtarma = useKurtarma(platform.canSaveLocally);
  /* §15: otomatik kaydın ALTINDA çalışan çökme koruması. `null` dönerse
     bu kabukta koruma yok ve şerit bunu söylüyor. */
  const veriDurumu = useVeriGuvenligi(platform.canSaveLocally && kurtarma.cozuldu);
  useUnsavedGuard();

  useEffect(() => {
    if (denial) showToast(`${t('Sunucu değişikliği reddetti')}: ${sunucuMetni(denial.reason)}`, 'error');
  }, [denial, showToast]);

  if (!panel) return <EmptyProject canCreate={allowed('edit')} />;

  /* ODAK MODU AYRI BİR MOD DEĞİL — yan panelleri gizleyip yazmaya bırakan
     bir GÖRÜNÜM anahtarı. Bu yüzden kendi ağacını kurmuyor: aynı yerleşim
     çiziliyor, yalnız kabuk saklanıyor.

     Ayrı bir dal olsaydı `ScriptEditor` her açma/kapamada sökülüp yeniden
     kurulurdu — imleç, kaydırma konumu ve geri alma yığını uçardı. Yazarken
     odağa girip çıkmak tam da bunları korumak için var.

     `odak` ile `chromeHidden` yine AYRI anahtar (§16.3): odaktan çıkmak,
     Tab ile gizlediğin panelleri geri getirmemeli. Burada yalnız ikisinin
     etkisi birleşiyor. */
  const odakta = ui.odakModu && ui.viewMode === 'senaryo';
  /* Sunum modu (§13.2) kabuğu odak moduyla AYNI mantıkla gizler — "arayüz
     kaybolur, yalnız iş görünür". `Presentation` kendi tam ekran yüzeyini
     ana bölgeye çiziyor; ikinci bir "kabuğu gizle" anahtarı açmak yerine
     var olan `hidden` ekseni genişletiliyor (Karar 2). */
  const hidden = ui.chromeHidden || odakta || ui.viewMode === 'sunum';

  return (
    <div
      data-testid={odakta ? 'odak-modu-yuzeyi' : undefined}
      className={
        'flex h-full w-full flex-col overflow-hidden text-metin-guclu ' +
        /* Zemin daha da koyu: odadaki tek ışık kağıt. */
        (odakta ? 'bg-[var(--mzn-odak-zemin)]' : 'bg-zemin')
      }
      /* ARAYÜZ ÖLÇEĞİ — `zoom`, `font-size` DEĞİL.
         Eski hâli kökte `font-size` ayarlıyor ve yorumu "bütün ölçüler
         rem/em tabanlı" diyordu. DEĞİLLER: arayüz baştan sona Tailwind
         piksel sınıflarıyla yazılı (`text-[13px]`, `px-3`, `h-[19px]`,
         araç çubuğunda `height: 82`). Piksel kök yazı boyunu umursamaz,
         yani ayar HİÇBİR ŞEY YAPMIYORDU — kullanıcı gerçek pencerede
         bildirdi (2026-08-30).
         `zoom` düzenin tamamını ölçekliyor, birimden bağımsız. Altmış
         dosyayı rem'e çevirmenin karşılığı bu tek satır.
         SENARYO KAĞIDI muaf: `.senaryo-yuzey` karşı-zoom uyguluyor
         (`ScriptEditor`), çünkü sayfa geometrisi milimetreye bağlı ve
         arayüz büyürken sayfa sayısı değişemez — ayarın altındaki yazı
         bunu kullanıcıya söz veriyor. */
      /* ÖLÇEK 1'DE `zoom` HİÇ KONMUYOR. `zoom: 1` kimliğe eşit görünüyor
         ama Chromium'da düzeni ayrı bir yoldan geçiriyor ve alt piksel
         yuvarlaması değişiyor: senaryo kâğıdında motorun 2 satır saydığı
         metni tarayıcı 1 satırda sarıyordu. "1 sayfa ≈ 1 dakika"
         sözleşmesi motor ile DOM'un aynı satırı saymasına dayanıyor
         (`script.spec.ts` "Motor ve tarayıcı aynı satırı sayıyor").
         Varsayılan yol artık byte-byte eski hâli. */
      style={ui.arayuzOlcegi === 1 ? undefined : { zoom: ui.arayuzOlcegi }}
    >
      {/* Araç çubuğu da AYNI süreyle çekiliyor: paneller süzülürken üstün
          birden yok olması hareketi bozuk gösterirdi. Yükseklik iki satır
          (44+38); ölçü tek yerde durmadığı için burada yazılı — DESIGN.md
          "Ölçüler" tablosuyla aynı sayı. */}
      <div
        className="mzn-kabuk-kaydir shrink-0"
        data-gizli={hidden ? 'evet' : 'hayir'}
        style={{ height: hidden ? 0 : 82 }}
      >
        <Toolbar
          veriDurumu={veriDurumu}
          actions={{
            onSave: () => void doSave(false),
            onSaveAs: () => void doSave(true),
            onOpen: () => void doOpen(),
            onNew: doNew,
            onExport: () => setDialog('export'),
            onAnalizPanosu: () => analizTamEkranAyarla(true),
            onSession: () => setDialog('session'),
            onRecent: () => setDialog('recent'),
            onVersions: () => setDialog('versions'),
            onCeviri: () => setDialog('ceviri'),
            onKarsilastir: () => setDialog('karsilastir'),
            onBaslikSayfasi: () => setDialog('baslik-sayfasi'),
            onFonDosyasi: doFonDosyasi,
            onFonPaneli: () => setDialog('fon-paneli'),
            onMuhur: () => setDialog('muhur'),
            onKisayollar: () => setDialog('shortcuts'),
            onAyarlar: () => setDialog('ayarlar'),
            onYardim: () => { setYardimKonusu(undefined); setDialog('yardim'); },
          }}
        />
      </div>

      {/* §15.4: "Bildirimi kaçırmak mümkündür, şeridi kaçırmak değildir."
          Şerit `chromeHidden`'a BAĞLANMAZ — odak modu (§16.3) tam da uzun
          yazma seansı için girilen moddur ve orada saatlerce yazan biri disk
          dolu / izin reddi uyarısını hiç görmezdi. Maliyeti yok: sağlıklı
          durumda `VeriSeridi` zaten `null` döner, yani odak modunun temiz
          ekranı bozulmuyor; şerit yalnız gerçekten sorun varken çiziliyor. */}
      <VeriSeridi durum={veriDurumu} />
      {!hidden && <OnarimSeridi onarimlar={scriptRepairs} />}

      {/* `overflow-hidden`: kayan panel kenarın DIŞINA çıkıyor, orada
          görünmeye devam etmemeli. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* KÜTÜPHANE ÇEKMECESİ — kalıcı sütun değil.
            Kırk manken küçük resmi ekranın üçte birini sürekli işgal
            ediyordu; kullanıcı onları yalnız bir figür yerleştirirken
            açıyor. Panel SÖKÜLMÜYOR, kayıyor: içindeki durum (kaydırma,
            arama, açık sekme) kapanıp açılırken korunuyor. */}
        <aside
          data-testid="kutuphane-cekmecesi"
          className="mzn-kaydir min-w-0 shrink-0"
          data-gizli={hidden || ui.viewMode === 'harita' || !ui.kutuphaneAcik ? 'evet' : 'hayir'}
          aria-hidden={hidden || ui.viewMode === 'harita' || !ui.kutuphaneAcik}
          style={{
            width: ui.leftPanelWidth,
            marginLeft: hidden || ui.viewMode === 'harita' || !ui.kutuphaneAcik ? -ui.leftPanelWidth : 0,
          }}
        >
          <LibraryPanel />
        </aside>
        {!hidden && ui.viewMode !== 'harita' && ui.kutuphaneAcik && (
          <Resizer
            orientation="vertical"
            onResize={(d) =>
              useUiStore.setState({
                leftPanelWidth: Math.max(200, Math.min(560, ui.leftPanelWidth + d)),
              })
            }
            onDoubleClick={() => useUiStore.setState({ kutuphaneAcik: false })}
          />
        )}

        {/* Orta — canvas / grid */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {ui.viewMode === 'board' ? (
              <>
                <CanvasStage panel={panel} editable={canEditActiveLayer} />
              </>
            ) : ui.viewMode === 'senaryo' ? (
              /* Yer imleri ve analiz artık SAĞ DENETÇİNİN sekmeleri: üç ayrı
                 sütun 1440px'te sayfayı ezerdi ve tasarımın "sayfa odaktadır"
                 kararını bozardı.

                 İKİ SÜTUNLU belge (§6.6) AYRI EDİTÖR ister: birimi satır
                 değil çift ve sayfalayıcısı ayrı. Tek editörü iki belge
                 türüne birden hizmet ettirmek, ikisinin de kurallarını
                 birbirine karıştırmak olurdu. Ayrım tipin BAYRAĞINDAN
                 okunuyor, adından değil. */
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  {ikiSutunlu ? <IkiSutunEditor /> : <ScriptEditor />}
                </div>
              </div>
            ) : ui.viewMode === 'harita' ? (
              <React.Suspense fallback={<div data-testid="map-loading" className="flex h-full items-center justify-center bg-[#102c32] text-xs text-metin-zayif">{t('Harita yükleniyor…')}</div>}>
                <MapWorkspace />
              </React.Suspense>
            ) : ui.viewMode === 'sunum' ? (
              <Presentation />
            ) : (
              <PanelGrid editable={allowed('edit')} />
            )}
          </div>

          {/* Zaman çizelgesi panellerin süresini gösterir; senaryo sayfasının
              böyle bir ekseni yok, orada yalnızca yer kaplardı. */}
          {/* Zaman çizelgesi YALNIZ panoda. Kartlar modunda kartların
              kendisi sıranın ta kendisi — altta ikinci bir sıra çizmek aynı
              şeyi iki kez göstermekti. */}
          {!hidden && !ui.timelineCollapsed && ui.viewMode === 'board' && (
            <>
              <Resizer
                orientation="horizontal"
                onResize={(d) =>
                  useUiStore.setState({
                    timelineHeight: Math.max(90, Math.min(400, ui.timelineHeight - d)),
                  })
                }
                onDoubleClick={() => useUiStore.setState({ timelineCollapsed: true })}
              />
              <div className="shrink-0" style={{ height: ui.timelineHeight }}>
                <Timeline editable={allowed('edit')} />
              </div>
            </>
          )}
          {!hidden && ui.viewMode === 'board' && (
            <CollapseHandle
              side="bottom"
              title={ui.timelineCollapsed ? t('Zaman çizelgesi panelini aç') : t('Zaman çizelgesi panelini daralt')}
              collapsed={ui.timelineCollapsed}
              onToggle={() => useUiStore.setState({ timelineCollapsed: !ui.timelineCollapsed })}
            />
          )}
          {/* Kenar bilgisi sayfanın ETRAFINDA: gizlenen panellerin yerine
              geçmiyor, boşluğa yerleşiyor. */}
          {odakta && <OdakKenari durum={veriDurumu} />}
        </main>

        {/* Sağ panel — özellik denetçisi */}
        {!hidden && (
          <>
            <CollapseHandle
              side="right"
              title={ui.rightCollapsed ? t('Özellikler panelini aç') : t('Özellikler panelini daralt')}
              collapsed={ui.rightCollapsed}
              onToggle={() => useUiStore.setState({ rightCollapsed: !ui.rightCollapsed })}
            />
            {!ui.rightCollapsed && (
              <Resizer
                orientation="vertical"
                onResize={(d) =>
                  useUiStore.setState({
                    rightPanelWidth: Math.max(220, Math.min(560, ui.rightPanelWidth - d)),
                  })
                }
                onDoubleClick={() => useUiStore.setState({ rightCollapsed: true })}
              />
            )}
          </>
        )}
        <aside
          data-testid="sag-panel"
          className="mzn-kaydir min-w-0 shrink-0"
          data-gizli={hidden || ui.rightCollapsed ? 'evet' : 'hayir'}
          aria-hidden={hidden || ui.rightCollapsed}
          style={{
            width: ui.rightPanelWidth,
            marginRight: hidden || ui.rightCollapsed ? -ui.rightPanelWidth : 0,
          }}
        >
          <Inspector panel={panel} editable={ui.viewMode === 'board' ? canEditActiveLayer : allowed('edit')} />
        </aside>
      </div>

      {kurtarma.oneri && (
        <RecoveryDialog
          kurtarma={kurtarma.oneri.kurtarma}
          cipaDoc={kurtarma.oneri.cipaDoc}
          onKurtar={kurtarma.kurtar}
          onYoksay={kurtarma.yoksay}
        />
      )}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'session' && <SessionDialog onClose={() => setDialog(null)} />}
      {dialog === 'recent' && <RecentDialog onClose={() => setDialog(null)} />}
      {dialog === 'versions' && <VersionsDialog onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'ayarlar' && <AyarlarDialog onClose={() => setDialog(null)} />}
      {analizTamEkran && <AnalizPanosuDialog onClose={() => analizTamEkranAyarla(false)} />}
      {dialog === 'yardim' && (
        <YardimPaneli
          onClose={() => setDialog(null)}
          baslangicKonusu={yardimKonusu}
          onKomut={(komut) => {
            /* Yardım kapanıp hedef pencere açılıyor: ikisi üst üste
               durursa kullanıcı hangisinin canlı olduğunu anlamaz. */
            switch (komut) {
              case 'ayarlar': setDialog('ayarlar'); break;
              case 'surum-gecmisi': setDialog('versions'); break;
              case 'geri-donus': setDialog('versions'); break;
              case 'kisayollar': setDialog('shortcuts'); break;
              case 'oturum': setDialog('session'); break;
              case 'disa-aktar': setDialog('export'); break;
              case 'yazarlik': setDialog('yazarlik'); break;
            }
          }}
        />
      )}
      {dialog === 'yazarlik' && <YazarlikDialog onClose={() => setDialog(null)} />}
      {dialog === 'yeni-proje' && (
        <YeniProjeDialog onKapat={() => setDialog(null)} onOlustur={yeniProjeyiKur} />
      )}
      {dialog === 'ceviri' && <CeviriDialog onClose={() => setDialog(null)} />}
      {dialog === 'karsilastir' && <KarsilastirDialog onClose={() => setDialog(null)} />}
      {dialog === 'baslik-sayfasi' && <BaslikSayfasiDialog onClose={() => setDialog(null)} />}
      {dialog === 'fon-paneli' && <FonPaneli onClose={() => setDialog(null)} />}
      {dialog === 'muhur' && <MuhurDialog onClose={() => setDialog(null)} />}
      {dialog === 'fon-olustur' && (
        <FonOlusturDialog
          onKapat={() => setDialog(null)}
          onKuruldu={(yeni, sablon) => {
            useProjectStore.getState().replaceProject(yeni);
            setDialog(null);
            showToast(`${t('Fon dosyası')}: ${sablon.ad}`, 'info');
          }}
        />
      )}
      <Toast />
    </div>
  );
}

/**
 * Proje boşken gösterilen durum.
 *
 * Ortak çalışmada yeni katılan istemcinin dokümanı sunucudan gelene kadar
 * boştur; bu ekran o kısa aralığı ve gerçekten boş bir projeyi kapsar.
 */
function EmptyProject({ canCreate }: { canCreate: boolean }) {
  const status = useCollabStore((s) => s.status);
  const waiting = status === 'connecting' || status === 'connected';
  return (
    <div className="grid h-full place-items-center bg-zemin text-metin-zayif">
      <div className="text-center">
        <p className="text-sm">
          {waiting ? t('Proje sunucudan alınıyor…') : t('Bu projede henüz panel yok.')}
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={() => projectActions.addPanel()}
            className="mt-3 bg-amber-zemin px-4 py-2 text-xs font-medium text-white hover:bg-amber-zemin"
          >
            {t('İlk paneli oluştur')}
          </button>
        )}
      </div>
    </div>
  );
}

export { assetUrlsFrom };
