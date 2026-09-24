import React from 'react';
import { t } from '../dil/arayuz';
import { SonYazim } from './VeriSeridi';
import { KayitDurumu } from './KayitDurumu';
import type { YaziciDurumu } from '../veri/yazici';
import { useProjectStore } from '../store/project';
import { useUiStore, type Tool } from '../store/ui';
import { useCollabStore } from '../store/collab';
import { colorForUser } from '../util/color';
import { ROLE_LABELS } from '../model/types';
import { formatDuration, totalDuration } from '../model/timeline';
import { moduDegistir } from '../store/mod';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../model/dokuman-tipi';
import { Ikon, type IkonAdi } from './Ikon';
import { AMERIKAN_BLOKLAR } from '../format/profil';
import { EZILEMEZ_GEREKCE, presetUygula } from '../format/preset';
import { YAZI_TIPLERI, type YaziTipiAdi } from '../format/yazi';
import { useSenaryoProfili } from '../hooks/useSenaryoProfili';
import { presetKomutu } from '../editor/preset';
import { komutCalistir } from '../editor/gorunum';
import { BLOK_ETIKETLERI, type ScriptBlockType } from '../model/script';
import { RevizyonSeridi } from './script/RevizyonSeridi';

/**
 * Uygulama kabuğu — B · Kesme Masası, iki satır (bkz. DESIGN.md).
 *
 * SATIR 1 sabittir: menü · proje kimliği · MOD SEKMELERİ (mutlak ortalı) ·
 * odak modu · kaydet/dışa aktar.
 *
 * SATIR 2 MODA GÖRE değişir. Senaryo modunda biçim araçları ve format
 * eksenleri; pano/kartlar modunda çizim araçları. Tek çubukta hepsini
 * göstermek, kullanıcıya o an kullanamayacağı on beş denetim sunmak olurdu.
 */

interface ToolDef {
  id: Tool;
  label: string;
  ikon: IkonAdi;
  shortcut?: string;
}

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const TOOLS = (): ToolDef[] => [
  { id: 'select', label: t('Seç'), ikon: 'sec', shortcut: 'V' },
  { id: 'pen', label: t('Kalem'), ikon: 'kalem', shortcut: 'B' },
  { id: 'brush', label: t('Fırça'), ikon: 'firca' },
  { id: 'eraser', label: t('Silgi'), ikon: 'silgi', shortcut: 'E' },
  { id: 'rect', label: t('Dikdörtgen'), ikon: 'dikdortgen', shortcut: 'R' },
  { id: 'ellipse', label: t('Elips'), ikon: 'elips' },
  { id: 'line', label: t('Çizgi'), ikon: 'cizgi', shortcut: 'L' },
  { id: 'arrow', label: t('Ok'), ikon: 'oklu-cizgi', shortcut: 'A' },
  { id: 'polygon', label: t('Çokgen'), ikon: 'cokgen' },
  { id: 'text', label: t('Metin'), ikon: 'metin', shortcut: 'T' },
  { id: 'fill', label: t('Kova doldurma'), ikon: 'kova' },
  { id: 'lasso', label: t('Kement seçim'), ikon: 'kement' },
  { id: 'eyedropper', label: t('Damlalık'), ikon: 'damlalik' },
];

/**
 * §7'nin modları. Sıra tasarımdaki sıradır.
 *
 * `sunum` BURADA YOK: sekme kalıcı bir çalışma alanı değil, "Sunum modu"
 * düğmesiyle (aşağıda, satır 1) AÇILAN tam ekran bir sunuş — odak modunun
 * kendi düğmesiyle açılmasıyla aynı desen. Sekmelerden biri olsaydı
 * kullanıcı "içinde çalıştığı" bir sekme sanır, oysa orada düzenleme yok.
 */
const MODLAR = (): { id: 'senaryo' | 'board' | 'grid' | 'harita'; ad: string }[] => [
  { id: 'senaryo', ad: t('Senaryo') },
  { id: 'grid', ad: t('Kartlar') },
  { id: 'board', ad: 'Storyboard' },
  { id: 'harita', ad: 'World Map' },
];

export interface ToolbarActions {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
  onExport: () => void;
  onAnalizPanosu: () => void;
  onSession: () => void;
  onRecent: () => void;
  onVersions: () => void;
  onCeviri: () => void;
  onKisayollar: () => void;
  onYardim: () => void;
  onAyarlar: () => void;
  onKarsilastir: () => void;
  onBaslikSayfasi: () => void;
  onFonDosyasi: () => void;
  onFonPaneli: () => void;
  onMuhur: () => void;
}

export function Toolbar({
  actions,
  veriDurumu = null,
}: {
  actions: ToolbarActions;
  /* §15.4: son yazımın anı ÜST ÇUBUKTA her zaman görünür — "kaydedildi mi?"
     sorusu kullanıcının aklına gelmemeli. */
  veriDurumu?: YaziciDurumu | null;
}) {
  const ui = useUiStore();
  const project = useProjectStore((s) => s.project);
  const dirty = useProjectStore((s) => s.dirty);
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const allowed = useProjectStore((s) => s.allowed);
  const role = useProjectStore((s) => s.role);
  const status = useCollabStore((s) => s.status);
  const participants = useCollabStore((s) => s.participants);
  /* KENDİ RENGİ — kullanıcı kararı: "kendi imlecin de kendi renginde".
     Rengi kağıtta gören ama nereden geldiğini bilmeyen kişi, o rengin
     KENDİSİ olduğunu ancak burada öğreniyor. Değer `colorForUser`'dan,
     `participants` listesinden DEĞİL: liste yalnız bağlıyken doluyor,
     oysa tek yazıcı da kendi (varsayılan) rengini görmeli. */
  const benimRenk = colorForUser(useCollabStore((s) => s.userId));
  const tip = dokumanTipi(project.meta.dokumanTipi) ?? DOKUMAN_TIPLERI.senaryo;

  // Yorumcu rolü de çizim yapabilir — ancak yalnızca işaretleme katmanına.
  const canDraw = allowed('edit') || allowed('annotate');
  const senaryoModu = ui.viewMode === 'senaryo';
  const kutuphaneAcik = ui.kutuphaneAcik;
  const kartModu = ui.viewMode === 'grid';
  const aracsizMod = kartModu || ui.viewMode === 'harita';
  /* İki sütunlu belgenin blok tipi YOK (§6.6: birimi görüntü/ses çifti):
     blok preseti açılır listesi BOŞ çiziliyordu ve K/İ/AB blok presetine
     yazıyor, yani hiçbir şeye. Boş bir liste, doldurulacakmış gibi
     görünen bir denetimdir. */
  const ikiSutunBelge = Boolean(
    (dokumanTipi(project.meta.dokumanTipi) ?? DOKUMAN_TIPLERI.senaryo).ikiSutun,
  );

  return (
    <header className="shrink-0">
      {/* ── SATIR 1 — uygulama çubuğu ─────────────────────────────── */}
      <div className="relative flex h-11 items-center justify-between border-b border-kenar bg-cubuk px-3.5">
        {/* Mod sekmeleri MUTLAK ortalı olduğu için yan gruplar onların ALTINA
            girebiliyordu: 1440 px'te "3D model yok" rozeti "Storyboard"
            sekmesinin üstüne biniyor ve iki yazı iç içe okunamaz hale
            geliyordu (ölçüldü, x≈825-910). Sınır sekmelerin yarı genişliği
            kadar geri çekiliyor; taşan ad zaten kırpılıyor. */}
        <div className="flex min-w-0 max-w-[calc(50%-190px)] items-center gap-3">
          {/* Menü kırpma kutusunun DIŞINDA: açılan panel mutlak konumlu ve
              başlıktan aşağı taşıyor. Kırpma bu sarmalayıcıya konsaydı panel
              görünmez olurdu — düğme çalışır, hiçbir şey açılmaz. */}
          <UygulamaMenusu actions={actions} />

          <div className="flex min-w-0 items-center gap-3 overflow-hidden">
          <span className="h-[18px] w-px bg-kenar-denetim" />

          <span className="max-w-[220px] truncate text-[15px] font-medium text-metin" title={project.meta.name}>
            {project.meta.name || t('Adsız')}
          </span>

          <span className="mzn-rozet" title={`${t('Doküman tipi')} — ${t(tip.ad)}`}>{t(tip.ad)}</span>

          <SonYazim durum={veriDurumu} />

          {!veriDurumu && (
            /* Kabuk yoksa bile kullanıcı kaydedilmemiş iş olduğunu görmeli.
               Yazı kalktı, yerini gösterge aldı; durum adı `aria-label`de
               duruyor, yani ekran okuyucu için kaybolmadı. */
            <KayitDurumu durum={dirty ? 'yaziliyor' : 'kaydedildi'} />
          )}
          </div>
        </div>

        {/* Mod sekmeleri MUTLAK ortalı: solun ve sağın genişliği değişince
            sekmeler kaymamalı — kas hafızası buna dayanıyor. */}
        <nav className="absolute left-1/2 flex h-11 -translate-x-1/2 items-center" aria-label={t('Mod')}>
          {MODLAR().map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`mod-${m.id}`}
              onClick={() => moduDegistir(m.id)}
              aria-current={ui.viewMode === m.id}
              className={
                'flex h-11 items-center px-4 text-[13px] transition-colors ' +
                (ui.viewMode === m.id
                  ? 'border-b-2 border-amber bg-etkin text-metin'
                  : 'text-metin-zayif hover:text-metin-guclu')
              }
            >
              {m.ad}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 max-w-[calc(50%-190px)] items-center justify-end gap-2 overflow-hidden">

          <button
            type="button"
            onClick={actions.onSession}
            title={t('Ortak çalışma oturumu')}
            className={
              'flex items-center gap-1.5 px-2.5 py-1 text-xs ' +
              (status === 'connected' ? 'mzn-etkin' : 'mzn-denetim')
            }
          >
            <span
              data-testid="benim-renk"
              data-renk={benimRenk}
              title={t('Ortak çalışmada senin rengin')}
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: benimRenk }}
            />
            {status === 'connected' ? `${t('Oturum')} · ${participants.length}` : t('Oturum')}
          </button>

          <span className="text-[11px] text-metin-cok-zayif" title={t('Rol sunucu tarafından zorunlu kılınır')}>
            {t(ROLE_LABELS[role])}
          </span>

          {senaryoModu && <button
            type="button"
            data-testid="odak-modu"
            onClick={() => useUiStore.setState({ odakModu: true, chromeHidden: true })}
            title={t('Odak modu (F) — yalnız senaryo görünümünde')}
            className="mzn-denetim flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            <Ikon ad="odak" boyut={13} />
            {t('Odak modu')}
          </button>}

          {/* Sunum yalnız panel gösteren modlarda anlamlıdır. */}
          {!senaryoModu && ui.viewMode !== 'harita' && <button
            type="button"
            data-testid="sunum-modu"
            onClick={() => moduDegistir('sunum')}
            title={t('Sunum modu — panelleri tam ekran sırayla göster')}
            className="mzn-denetim flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {'▶ '}{t('Sunum')}
          </button>}

          {/* Birincil eylem: bölünmüş düğme, tek dolu amber yüzey. */}
          <div className="flex items-stretch">
            <button
              type="button"
              onClick={actions.onSave}
              disabled={!allowed('export')}
              title={t('Kaydet (Ctrl+S)')}
              className="mzn-birincil flex items-center gap-1.5 px-3 py-1.5 text-[13px]"
            >
              <Ikon ad="kaydet" boyut={13} renk="var(--mzn-amber-uzeri)" />
              {t('Kaydet')}{dirty ? ' •' : ''}
            </button>
            <span className="w-px bg-[var(--mzn-amber-ayirici)]" />
            <button
              type="button"
              data-testid="disa-aktar-dugmesi"
              onClick={actions.onExport}
              disabled={!allowed('export')}
              title={t('Dışa aktar')}
              className="mzn-birincil flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]"
            >
              <Ikon ad="disa-aktar" boyut={13} renk="var(--mzn-amber-uzeri)" />
              {t('Dışa aktar')}
            </button>
          </div>
        </div>
      </div>

      {/* ── SATIR 2 — biçim / araç çubuğu, moda göre ──────────────── */}
      <div className="flex h-[38px] items-center justify-between border-b border-kenar bg-cubuk px-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <IkonGrubu>
            <IkonDugme ad="yeni" baslik={t('Yeni proje')} onClick={actions.onNew} />
            <IkonDugme ad="ac" baslik={t('Proje aç (.sbp)')} onClick={actions.onOpen} />
            <IkonDugme ad="kaydet" baslik={t('Farklı kaydet')} onClick={actions.onSaveAs} pasif={!allowed('export')} />
          </IkonGrubu>

          <Ayirici />

          <IkonGrubu>
            <IkonDugme ad="geri" baslik={t('Geri al (Ctrl+Z)')} onClick={undo} pasif={!canUndo} />
            <IkonDugme ad="ileri" baslik={t('İleri al (Ctrl+Y)')} onClick={redo} pasif={!canRedo} />
          </IkonGrubu>

          <Ayirici />

          {/* Kartlar modunda çizim araçları ve kütüphane YOK: orada çizim
              yapılmıyor ve karta figür sürüklenmiyor. Tıklanabilir ama
              hiçbir işe yaramayan denetim, olmayan bir yeteneği vaat eder.
              Sayfa düzeni denetimleri kartların kendi başlığında duruyor. */}
          {aracsizMod || ikiSutunBelge ? null : senaryoModu ? (
            /* Senaryo modunda satır 2 BİÇİM çubuğudur (tasarım): blok
               preseti, yazı tipi, punto, kalın/italik/büyük harf. Özellik
               komutları (geçmiş, karşılaştır, çevir) buraya değil UYGULAMA
               MENÜSÜNE ait — biçim çubuğunda dururlarsa yazarın en sık
               dokunduğu denetimleri kenara iterler. */
            <BicimDenetimleri />
          ) : (
            <>
              {/* Kütüphane çekmecesinin anahtarı. Kütüphane kalıcı sütun
                  değil (yer imlerindeki kuralın aynısı: sürekli açık
                  kalmasın, bir simgeden açılıp kapansın) — o yüzden onu
                  açacak bir yer gerekiyor ve burası, araçların yanı. */}
              <button
                type="button"
                data-testid="kutuphane-anahtari"
                aria-pressed={kutuphaneAcik}
                title={t('Kütüphane (figür, poz, obje, şablon)')}
                onClick={() => useUiStore.setState({ kutuphaneAcik: !kutuphaneAcik })}
                className={
                  'flex h-[26px] items-center gap-1.5 px-2 text-[12px] ' +
                  (kutuphaneAcik ? 'mzn-etkin' : 'mzn-denetim')
                }
              >
                <Ikon ad="menu" boyut={13} />
                {t('Kütüphane')}
              </button>

              <Ayirici />

              {/* Çizim araçları — yalnız çizilen modlarda. */}
              <div className="flex items-center gap-px">
                {TOOLS().map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
                    aria-label={t.label}
                    aria-pressed={ui.tool === t.id}
                    disabled={!canDraw && t.id !== 'select'}
                    onClick={() => useUiStore.getState().setTool(t.id)}
                    className={
                      'flex h-6 w-[26px] items-center justify-center transition-colors disabled:opacity-30 ' +
                      (ui.tool === t.id ? 'mzn-etkin' : 'text-metin-sonuk hover:text-metin')
                    }
                  >
                    <Ikon ad={t.ikon} boyut={15} />
                  </button>
                ))}
              </div>

              <Ayirici />

              <span title={t('Kontur rengi')} aria-label={t('Kontur rengi')}
                className="ml-1 h-5 w-5 shrink-0 rounded-sm border border-kenar-denetim"
                style={{ backgroundColor: ui.strokeColor }} />
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {senaryoModu ? (
            <>
            <RevizyonSeridi duzenlenebilir={allowed('edit')} />
            {/* Format eksenleri dar ekranda Ayarlar'da erişilebilir. */}
            <div className="hidden items-center lg:flex">
              <span className="mzn-denetim flex items-center gap-1.5 px-2.5 py-1 text-xs">
                <Ikon ad="sayfa" boyut={12} renk="var(--mzn-metin-etiket)" />
                {tip.ikiSutun ? t('Fransız') : t('Amerikan')}
              </span>
              <select
                data-testid="kagit-sec-cubuk"
                aria-label={t('Kağıt')}
                value={ui.scriptPaper}
                onChange={(e) => useUiStore.setState({ scriptPaper: e.target.value as 'letter' | 'a4' })}
                className="mzn-denetim mzn-sayi border-l-0 px-2.5 py-1 text-[11px]"
              >
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </div>
            </>
          ) : ui.viewMode === 'harita' ? null : (
            <div className="flex items-center gap-1.5">
              <span className="mzn-sayi text-[11px] text-metin-zayif">
                {formatDuration(totalDuration(project.panels))}
              </span>
              <Ayirici />
              <IkonDugme ad="eksi" baslik={t('Uzaklaş')} onClick={() => useUiStore.getState().setZoom(ui.zoom / 1.2)} />
              <button
                type="button"
                onClick={() => useUiStore.getState().resetView()}
                title="%100"
                className="mzn-sayi min-w-[38px] text-center text-[11px] text-metin-guclu"
              >
                %{Math.round(ui.zoom * 100)}
              </button>
              <IkonDugme ad="arti" baslik={t('Yakınlaş')} onClick={() => useUiStore.getState().setZoom(ui.zoom * 1.2)} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Biçim denetimleri — satır 2, senaryo modu.
 *
 * ## Yazı tipi ve punto KİLİTLİ gösteriliyor
 *
 * Tasarımda ikisi de açılır liste. Ürün gerçeği bunları EZİLEMEZ kılıyor
 * (§16.3): Courier ve punto 12, sayfa≈dakika sözleşmesini taşıyor.
 * Düzenlenebilir bir liste göstermek kullanıcıya değiştirebileceği yalanını
 * söylerdi; tamamen gizlemek tasarımın ritmini bozar ve "yazı tipini neden
 * göremiyorum" sorusunu doğururdu. Çözüm: göster, ama kilitli ve NEDENİYLE.
 * Neden motordan okunuyor, burada yeniden yazılmıyor (Karar 2).
 *
 * ## `U` yok
 *
 * Tasarımda B I U var; modelde altı çizili YOK. Çalışmayan bir düğme
 * koymaktansa gerçekten çalışan üçünü koyuyoruz: kalın, italik, büyük harf.
 */
/**
 * Uygulama menüsü — satır 1, sol.
 *
 * Seyrek kullanılan ama gerçek komutlar burada yaşıyor: sürüm geçmişi,
 * karşılaştırma, çeviri, kısayollar. Biçim çubuğunda dururlarsa yazarın en
 * sık dokunduğu denetimleri (blok preseti, kalın/italik) kenara iterler;
 * tasarımın 2. satırı BİÇİM çubuğudur, komut çubuğu değil.
 *
 * Dış tıklama ve Esc ile kapanıyor: açık kalan bir menü, altındaki sayfayı
 * tıklanamaz yapar ve kullanıcı neden yazamadığını anlamaz.
 */
function UygulamaMenusu({ actions }: { actions: ToolbarActions }) {
  const disaAktarabilir = useProjectStore((s) => s.allowed('export'));
  const [acik, setAcik] = React.useState(false);
  const [konum, setKonum] = React.useState<{ sol: number; ust: number } | null>(null);
  const kok = React.useRef<HTMLDivElement>(null);
  const senaryoModu = useUiStore((s) => s.viewMode === 'senaryo');
  /* Fon kontrol listesi YALNIZ fon belgesinde anlamlı: senaryoda açılsaydı
     "bu belgede fon şablonu yok" diyen boş bir pencere olurdu. */
  const fonBelgesi = useProjectStore((s) => s.project.meta.dokumanTipi === 'fon-dosyasi');

  /**
   * Panel SABİT konumlu (`fixed`), akış içinde `absolute` değil.
   *
   * Gerekçe ölçülmüş bir hata: kabuğu saran `.mzn-kabuk-kaydir` yüksekliği
   * 82 px'e sabitlenmiş ve `overflow: hidden` taşıyor — gizleme hareketi
   * için gerekli. `absolute` panel o kutuya takılıyordu: düğme çalışıyor,
   * durum değişiyor, panel DOM'da duruyor ve kullanıcı hiçbir şey
   * görmüyordu. Kırpmayı kaldırmak gizleme hareketini bozardı; `fixed`
   * öğe ise kırpan ataya hiç bakmıyor.
   *
   * ⚠ TAVAN: `fixed`, `transform`/`filter`/`perspective` taşıyan bir ata
   * altında yeniden kırpılır. Kabuğun atalarında bugün öyle bir özellik
   * yok; eklenirse panel portala taşınmalı.
   */
  const konumlandir = React.useCallback(() => {
    const r = kok.current?.getBoundingClientRect();
    if (r) setKonum({ sol: r.left, ust: r.bottom });
  }, []);

  React.useEffect(() => {
    if (!acik) return;
    const disari = (e: MouseEvent) => {
      if (!kok.current?.contains(e.target as Node)) setAcik(false);
    };
    const kacis = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    /* Pencere boyutu ya da kaydırma değişince sabit konum bayatlar. */
    const bayatla = () => setAcik(false);
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', kacis);
    window.addEventListener('resize', bayatla);
    window.addEventListener('scroll', bayatla, true);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', kacis);
      window.removeEventListener('resize', bayatla);
      window.removeEventListener('scroll', bayatla, true);
    };
  }, [acik]);

  const ogeler: { ad: string; calistir: () => void; ayrikBasla?: boolean; pasif?: boolean }[] = [
    { ad: t('Yeni proje'), calistir: actions.onNew },
    { ad: t('Aç…'), calistir: actions.onOpen },
    { ad: t('Son açılanlar…'), calistir: actions.onRecent },
    { ad: t('Kaydet'), calistir: actions.onSave, ayrikBasla: true, pasif: !disaAktarabilir },
    { ad: t('Farklı kaydet…'), calistir: actions.onSaveAs, pasif: !disaAktarabilir },
    { ad: t('Dışa aktar…'), calistir: actions.onExport, pasif: !disaAktarabilir },
    { ad: t('Başlık sayfası…'), calistir: actions.onBaslikSayfasi, pasif: !senaryoModu },
    { ad: t('Sürüm geçmişi…'), calistir: actions.onVersions, ayrikBasla: true },
    { ad: t('Mühür ve kanıt…'), calistir: actions.onMuhur },
    { ad: t('Sürümleri karşılaştır…'), calistir: actions.onKarsilastir },
    { ad: t('Senaryoyu çevir…'), calistir: actions.onCeviri, pasif: !senaryoModu },
    /* FON DOSYASI: senaryo modunda anlamlı — kurulacak belge bu senaryodan
       türetiliyor. Menüden geçmesi ZORUNLU: yerel menü yalnız Electron'da
       var ve buradan geçmeyen her eyleme web kabuğunda hiç ulaşılamıyor
       (analiz panosu ve ayarlar için verilen kararın aynısı). */
    { ad: t('Bu senaryodan fon dosyası oluştur…'), calistir: actions.onFonDosyasi, pasif: !senaryoModu || fonBelgesi },
    { ad: t('Fon dosyası kontrol listesi…'), calistir: actions.onFonPaneli, pasif: !fonBelgesi },
    /* ANALİZ PANOSU: masaüstünün YEREL menüsünde vardı (Ctrl+Shift+A) ama
       uygulama içi menüde yoktu — yani web kabuğunda hiç ulaşılamıyordu ve
       masaüstünde bile kullanıcı onu bulamıyordu (bildirim 2026-08-30).
       Kısayol listesi ve ayarlar için verilen kararın aynısı. */
    { ad: t('Analiz panosu…'), calistir: actions.onAnalizPanosu, pasif: !senaryoModu },
    { ad: t('Ortak çalışma oturumu…'), calistir: actions.onSession, ayrikBasla: true },
    /* Kısayol listesi buraya kadar YALNIZ Electron'un yerel menüsünden
       açılabiliyordu — yani web derlemesinde hiç ulaşılamıyordu ve
       masaüstünde bile kimsenin bakmadığı bir yerdeydi. */
    /* YARDIM kısayolların ÜSTÜNDE: bir soruna düşen kullanıcı önce
       "yardım" arar, "klavye kısayolları" değil. */
    { ad: t('Yardım'), calistir: actions.onYardim, ayrikBasla: true },
    { ad: t('Klavye kısayolları'), calistir: actions.onKisayollar },
    /* Ayarlar menüden de açılıyor (Ctrl+,) ama menü YALNIZ masaüstünde
       var: buradan geçmeseydi tarayıcı kabuğunda ses ayarına hiç
       ulaşılamazdı. */
    { ad: t('Ayarlar'), calistir: actions.onAyarlar },
  ];

  return (
    <div className="relative" ref={kok}>
      <button
        type="button"
        data-testid="uygulama-menusu"
        aria-haspopup="menu"
        aria-expanded={acik}
        onClick={() => { konumlandir(); setAcik((a) => !a); }}
        title={t('Uygulama menüsü')}
        aria-label={t('Uygulama menüsü')}
        className="flex items-center gap-1.5 px-1.5 py-1 text-metin-etiket hover:text-metin"
      >
        <Ikon ad="menu" boyut={17} renk="var(--mzn-amber)" />
        <Ikon ad="ok-asagi" boyut={9} />
      </button>

      {acik && konum && (
        <div
          role="menu"
          data-testid="uygulama-menusu-liste"
          style={{ position: 'fixed', left: konum.sol, top: konum.ust + 1 }}
          className="z-50 min-w-[224px] border border-kenar-denetim bg-cubuk py-1 shadow-[0_18px_40px_rgba(0,0,0,.55)]"
        >
          {ogeler.map((o) => (
            <React.Fragment key={o.ad}>
              {o.ayrikBasla && <div className="my-1 h-px bg-kenar-ic" />}
              <button
                type="button"
                role="menuitem"
                disabled={o.pasif}
                onClick={() => { setAcik(false); o.calistir(); }}
                className="block w-full px-3.5 py-1.5 text-left text-xs text-metin-govde transition-colors hover:bg-etkin hover:text-metin disabled:text-metin-cok-zayif disabled:hover:bg-transparent"
              >
                {o.ad}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function BicimDenetimleri() {
  const { profil } = useSenaryoProfili();
  const presetler = useUiStore((s) => s.scriptPresetler);
  const imlec = useUiStore((s) => s.scriptCursor);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const tip = dokumanTipi(useProjectStore((s) => s.project.meta.dokumanTipi))
    ?? DOKUMAN_TIPLERI.senaryo;

  /* Denetimler İMLEÇTEKİ bloğun tipine bağlı: "kalın mı" sorusunun cevabı
     hangi blokta olduğuna göre değişir. İmleç yoksa tipin varsayılan bloğu. */
  const imlectekiBlok = imlec ? bloklar?.find((b) => b.id === imlec) : undefined;
  const aktifTip: ScriptBlockType = imlectekiBlok?.type || tip.varsayilanBlok;

  const taban = AMERIKAN_BLOKLAR[aktifTip] ?? AMERIKAN_BLOKLAR.action!;
  const stil = presetUygula(taban, presetler[aktifTip] ?? {}).stil;

  /* K/I/AB preset dugmeleri KALDIRILDI (kullanici karari 2026-08-27):
     presetler sabit, kullanici dokunmuyor. Blok tipi secici ve yazi tipi
     duruyor - onlar preset DEGIL, belge davranisi. */
  return (
    <>
      {/* Blok preseti — imleçteki satırın tipi. Liste artık GÖSTERMEKLE
          kalmıyor, UYGULUYOR: kısayol (Ctrl+1..9) çalışırken listeden
          seçmenin çalışmaması tutarsızdı ve §17'de borç olarak duruyordu.

          Yazma yolu TEK: `presetKomutu`. Liste ProseMirror komutunu
          çağırıyor, Yjs'e ayrıca yazmıyor — ikinci bir yol aynı kuralı
          ikinci bir eve koyardı (Karar 2). */}
      <select
        data-testid="blok-preseti"
        aria-label={t('Satır preseti')}
        value={aktifTip}
        disabled={!duzenlenebilir}
        onChange={(e) => komutCalistir(presetKomutu(e.target.value as ScriptBlockType))}
        title={t('İmleçteki satırın preseti — Ctrl+1..9 ile de seçilir')}
        className="mzn-denetim min-w-[132px] px-2.5 py-1 text-xs disabled:opacity-30"
      >
        {tip.bloklar.map((b, i) => (
          <option key={b} value={b}>{t(BLOK_ETIKETLERI[b])}{i < 9 ? `  (Ctrl+${i + 1})` : ''}</option>
        ))}
      </select>

      {/* YAZI TİPİ — kilit TİPE BAĞLI (§16.3, kullanıcı kararı 2026-08-26).
          Senaryo ailesinde sayfa ≈ dakika sözleşmesi ızgaranın kendisidir ve
          yazı sektör standardıdır: kilitli. Roman ve düz metinde sayfa süreyi
          değil el yazması sayfasını ölçüyor ve orada standart Times'tır —
          orada kilit anlamsız olurdu. Kilit ayrı bir bayrak değil, doküman
          tipinden TÜRETİLİYOR (`yaziKilitli`). */}
      {profil.yaziKilitli ? (
        <span
          data-testid="yazi-tipi-kilitli"
          title={t(EZILEMEZ_GEREKCE.yaziTipi)}
          className="mzn-denetim mzn-sayi flex items-center gap-1.5 px-2.5 py-1 text-xs opacity-70"
        >
          {profil.yazi.ad}
          <Ikon ad="kilit" boyut={10} renk="var(--mzn-metin-cok-zayif)" />
        </span>
      ) : (
        <select
          data-testid="yazi-tipi-sec"
          aria-label={t('Yazı tipi')}
          value={profil.yazi.id}
          disabled={!duzenlenebilir}
          onChange={(e) => useUiStore.setState({ scriptYazi: e.target.value as YaziTipiAdi })}
          title={t('Belgenin yazı tipi — sayfa sayısı buna bağlı')}
          className="mzn-denetim mzn-sayi px-2.5 py-1 text-xs disabled:opacity-30"
        >
          {Object.values(YAZI_TIPLERI).map((y) => (
            <option key={y.id} value={y.id}>{t(y.ad)}</option>
          ))}
        </select>
      )}
      <span
        data-testid="punto-kilitli"
        title={t(EZILEMEZ_GEREKCE.punto)}
        className="mzn-denetim mzn-sayi flex items-center gap-1.5 px-2.5 py-1 text-xs opacity-70"
      >
        12
        <Ikon ad="kilit" boyut={10} renk="var(--mzn-metin-cok-zayif)" />
      </span>

    </>
  );
}

function IkonGrubu({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function IkonDugme({
  ad, baslik, onClick, pasif,
}: { ad: IkonAdi; baslik: string; onClick: () => void; pasif?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={baslik}
      aria-label={baslik}
      disabled={pasif}
      className="flex h-6 w-[26px] items-center justify-center text-metin-sonuk transition-colors hover:text-metin disabled:text-metin-cok-zayif"
    >
      <Ikon ad={ad} boyut={15} />
    </button>
  );
}

function Dugme({
  children, onClick, baslik, etkin, pasif,
}: {
  children: React.ReactNode;
  onClick: () => void;
  baslik?: string;
  etkin?: boolean;
  pasif?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={baslik}
      disabled={pasif}
      className={(etkin ? 'mzn-etkin' : 'mzn-denetim') + ' px-2.5 py-1 text-xs'}
    >
      {children}
    </button>
  );
}

function Ayirici() {
  return <span className="mx-1 h-5 w-px bg-ayirici" />;
}
