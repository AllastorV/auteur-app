import { useEffect } from 'react';
import { useProjectStore, projectActions } from '../store/project';
import { useUiStore, TOOL_SHORTCUTS } from '../store/ui';
import { blogaGit, moduDegistir } from '../store/mod';
import * as M from '../doc/mutations';
import { revizyonIsaretleEylemi, revizyonYayinlaEylemi } from '../model/revizyon-eylem';
import { imdeGez, siraliImler } from '../model/yerimi';

export interface ShortcutHandlers {
  onSave: () => void;
  onSaveAs?: () => void;
  /** Kısayol listesini açar — `?`. */
  onKisayollar?: () => void;
  onExport?: () => void;
  /** "Kim ne yazdı" penceresini açar — `Y` (panoda çıplak, senaryoda Alt+Y). */
  onYazarlik?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Odak bir arayüz denetiminin üzerinde mi?
 *
 * Tab'ı her durumda yakalamak klavyeyle gezinmeyi tümden kırar: kullanıcı
 * araç çubuğuna geçtiğinde Tab yine odak taşımalıdır.
 */
function isFocusableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('button, a[href], select, textarea, input, [tabindex]:not([tabindex="-1"])'));
}

/**
 * Klavye kısayolları.
 *
 * **SENARYO GÖRÜNÜMÜNDE ÇIPLAK HARF KISAYOLU YOKTUR — Alt şarttır.**
 *
 * Kullanıcı kararı (2026-08-26): "yazarken sıkıntı istemiyorum; storyboard
 * sayfasına geçince sektör standartları çalışabilir." Panoda `V`/`B`/`E`
 * çıplak harfler Figma ve Photoshop'un yerleşik dilidir; senaryo sayfasında
 * ise aynı harfler yazılan metnin kendisidir.
 *
 * Alt'lı biçim HER İKİ görünümde çalışır — kas hafızası tek: `Alt+S` panoda
 * da senaryoda da aynı şeyi yapar, kullanıcı hangi moddaysa farklı tuşa
 * basmak zorunda değildir. Kısıtlanan yalnız ÇIPLAK biçimdir.
 *
 * Karakter ÜRETMEYEN tuşlar (Tab, Esc, Delete) her yerde çıplak kalır: bir
 * belgeye "Escape" yazılamaz.
 *
 * Pano: V seç · B kalem · E silgi · T metin · R dikdörtgen · L çizgi · A ok ·
 * [ ] fırça boyutu · N yeni panel · G ızgara · S senaryo ·
 * Y kim ne yazdı · , . önceki/sonraki panel
 * Her yerde: Ctrl+S kaydet · Ctrl+E dışa aktar · Ctrl+Z/Y geri-ileri ·
 * Ctrl+D çoğalt · Ctrl+1..9 yazım preseti · Tab arayüzü gizle · F1 bu liste
 * Senaryoda: Alt+F odak · Alt+B yer imi · Alt+< > imden ime · Alt+S panoya ·
 * Alt+Y kim ne yazdı
 */
export function useShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      /* Yazı alanındayken YALNIZ çıplak tuşlar yutuluyor.
         ÖLÇÜLDÜ: editöre otomatik odak verildikten sonra hedef her zaman
         contenteditable oluyordu ve bu erken dönüş `Alt+S`'i de yutuyordu —
         yani kullanıcı senaryo sayfasındayken panoya HİÇ geçemiyordu.
         Kullanıcının kararı "senaryoda Alt şart" idi; Alt'a basmak zaten
         "bu bir kısayol" demektir ve Windows/Linux'ta Alt+harf metin
         üretmez. Ctrl/Cmd'li olanlar da geçiyor (Ctrl+S, Ctrl+Z…). */
      if (isTypingTarget(e.target) && e.key !== 'F1' && !e.altKey && !e.ctrlKey && !e.metaKey) return;
      /* Senaryo listesi ok tuşlarını, Space'i ve Enter'ı KENDİ anlamıyla
         kullanır; genel kısayollar onlara karışmamalı.

         Muhafız yalnız O TUŞLARI yutuyor, hepsini değil. Tümünü yutarken şu
         oluyordu: kullanıcı gezginde bir satıra tıklıyor (imleç oraya
         gidiyor), sonra `B`'ye basıyor ve HİÇBİR ŞEY olmuyor — çünkü odak
         hâlâ listede. Yani yer imi koymanın en doğal yolu ölü tuştu. */
      const LISTENIN_TUSLARI = new Set([
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter', 'Escape', 'Delete', 'Backspace',
      ]);
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('[data-script-list]') && LISTENIN_TUSLARI.has(e.key)) return;
      const ui = useUiStore.getState();
      const project = useProjectStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      /* Sunum modu KENDİ klavye katmanını yönetir (`Presentation.tsx`):
         ←/→/Space/Esc. Pano/senaryo kısayolları (N yeni panel, G ızgara,
         Delete) burada sızsaydı bir sunum sırasında
         yanlışlıkla panel silinebilir ya da oluşturulabilirdi. */
      if (ui.viewMode === 'sunum') return;

      /* Senaryo görünümünde çıplak harf kısayolu yok — Alt şart. Kapı
         BURADA, tek yerde: her tuşun kendi dalına `altKey` koymak aynı kuralı
         on beş kez kopyalamak olurdu ve bir dalın unutulması sessiz kalırdı
         (Karar 2). */
      const yazimGorunumu = ui.viewMode === 'senaryo';
      const cıplakYasak = yazimGorunumu && !e.altKey;

      /* `?` — kısayol listesi. `e.key` doğrudan '?' olarak okunuyor,
         `shiftKey + '/'` diye KURULMUYOR: Türkçe klavyede '?' Shift+, ile
         yazılır ve o yol Türkçe düzende hiç çalışmazdı.

         `F1` takma ad olarak eklendi çünkü '?' bir KARAKTERDİR: senaryo
         yazarken soru işareti yazmak listeyi açamamalı. F1 hiçbir düzende
         karakter üretmez, yani her iki görünümde de güvenle çıplak kalır. */
      if (e.key === 'F1' && handlers.onKisayollar) {
        e.preventDefault();
        handlers.onKisayollar();
        return;
      }
      if (e.key === '?' && !cıplakYasak && handlers.onKisayollar) {
        e.preventDefault();
        handlers.onKisayollar();
        return;
      }

      if (mod && key === 's') {
        e.preventDefault();
        if (e.shiftKey) handlers.onSaveAs?.();
        else handlers.onSave();
        return;
      }
      if (mod && key === 'e' && handlers.onExport) {
        e.preventDefault();
        handlers.onExport();
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        project.redo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        if (!project.allowed('edit')) return;
        if (ui.selection.length) {
          const ids = projectActions.duplicateObjects(project.doc, project.activePanelId, ui.selection);
          useUiStore.setState({ selection: ids });
        } else {
          projectActions.duplicatePanel(project.activePanelId);
        }
        return;
      }
      if (mod && e.shiftKey && key === 'a') {
        /* ANALİZ PANOSU — kısayol arayüzde YAZILIYDI ama hiçbir yerde
           bağlı değildi: aşağıdaki `mod && key === 'a'` dalı Shift'e
           bakmadığı için Ctrl+Shift+A "paneldeki tüm objeleri seç"e
           düşüyor ve pano hiç açılmıyordu. Denetçi sekmesindeki düğme
           kısayolu kullanıcıya VAAT EDİYORDU — vaat edilen bir tuşun
           çalışmaması, olmayan bir tuştan kötüdür.
           Bu dal ÖNCE gelmek zorunda; sonra gelseydi yine yutulurdu. */
        e.preventDefault();
        useUiStore.getState().analizTamEkranAyarla(true);
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        const panel = project.activePanel();
        if (panel) useUiStore.setState({ selection: panel.objects.map((o) => o.id) });
        return;
      }
      if (mod) return;

      if (e.key === 'Tab') {
        // Arayüz gizliyken Tab tek çıkış yoludur: odak bir düğmede olsa bile
        // yakalanmalı, yoksa kullanıcı tam ekranda kilitli kalır.
        if (!ui.chromeHidden && isFocusableTarget(e.target)) return;
        e.preventDefault();
        useUiStore.setState({ chromeHidden: !ui.chromeHidden });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!project.allowed('edit') || !ui.selection.length) return;
        e.preventDefault();
        projectActions.removeObjects(project.doc, project.activePanelId, ui.selection);
        useUiStore.getState().clearSelection();
        return;
      }
      if (e.key === 'Escape') {
        /* Escape her zaman bir kaçış yoludur ve önce EN KAPSAYICI şeyden
           çıkar: odak modu, sonra gizlenmiş arayüz, sonra seçim. Ters sırada
           odak modundan çıkmak iki Esc isterdi ve kullanıcı ilkinde hiçbir şey
           olmadığını görüp tuşun çalışmadığını sanardı. */
        if (ui.odakModu) {
          useUiStore.setState({ odakModu: false, chromeHidden: false });
          return;
        }
        if (ui.chromeHidden) {
          useUiStore.setState({ chromeHidden: false });
          return;
        }
        useUiStore.getState().clearSelection();
        return;
      }

      /* BURADAN AŞAĞISI KARAKTER ÜRETEN TUŞLAR. Yukarıdakiler (Tab, Delete,
         Escape) bir belgeye yazılamaz, bu yüzden yazarken de güvenliler. */
      if (cıplakYasak) return;

      if (e.key === '[') {
        useUiStore.setState({ strokeWidth: Math.max(1, ui.strokeWidth - 1) });
        return;
      }
      if (e.key === ']') {
        useUiStore.setState({ strokeWidth: Math.min(80, ui.strokeWidth + 1) });
        return;
      }
      if (key === 'n') {
        if (!project.allowed('edit')) return;
        e.preventDefault();
        projectActions.addPanel();
        return;
      }
      if (key === 'g') {
        moduDegistir(ui.viewMode === 'board' ? 'grid' : 'board');
        return;
      }
      if (key === 's') {
        // Senaryo sayfası ↔ pano. Gizli arayüzü de geri getirir; yoksa tuş
        // sayfayı açar ama gezgin ve araç çubuğu görünmez kalırdı.
        e.preventDefault();
        useUiStore.setState({ chromeHidden: false });
        moduDegistir(ui.viewMode === 'senaryo' ? 'board' : 'senaryo');
        return;
      }
      if (key === 'y' && handlers.onYazarlik) {
        // "Kim ne yazdı" penceresi — `g`/`s` ile aynı kalıp: panoda çıplak,
        // senaryoda Alt şart (üstteki `cıplakYasak` kapısı zaten sağladı).
        e.preventDefault();
        handlers.onYazarlik();
        return;
      }
      if (key === 'b') {
        /* Yer imi koy/kaldır (§13.4). Yalnız senaryo görünümünde: im bir
           SATIRA ait ve panoda imlenecek satır yok. */
        if (ui.viewMode !== 'senaryo' || !ui.scriptCursor) return;
        if (!project.allowed('edit')) return;
        e.preventDefault();
        M.yerImiCevir(project.doc, ui.scriptCursor);
        return;
      }
      if (e.key === '<' || e.key === '>') {
        /* İmden ime gezinme — panel gezinmenin (`,` `.`) SHIFT'li hâli, aynı
           tuşlarda aynı yön. Salt-okur kullanıcı da gezebilir: gezinmek
           belgeyi değiştirmez. */
        if (ui.viewMode !== 'senaryo') return;
        const bloklar = project.project.script?.blocks ?? [];
        const sirali = siraliImler(project.yerImleri, bloklar.map((b) => b.id));
        const suanki = ui.scriptCursor
          ? bloklar.findIndex((b) => b.id === ui.scriptCursor)
          : -1;
        const hedef = imdeGez(sirali, suanki < 0 ? null : suanki, e.key === '>' ? 1 : -1);
        if (!hedef) return;
        e.preventDefault();
        blogaGit(hedef);
        return;
      }
      if (key === 'm') {
        /* REVİZYON — Alt+M işaretler, Alt+Shift+M yeni tur açar.
           Yayınlamak Shift istiyor ÇÜNKÜ yıkıcıya yakın: kullanıcı
           yanlışlıkla revizyon açtığını bildirdi (2026-08-30). Artık hem
           daha zor basılıyor hem de Ctrl+Z ile geri alınıyor (kök geri-al
           kapsamına eklendi).
           Eylemler ŞERİTLE ORTAK modülden; ikinci bir kopya iki yolu
           ayrıştırırdı. */
        if (ui.viewMode !== 'senaryo') return;
        if (!project.allowed('edit')) return;
        e.preventDefault();
        if (e.shiftKey) revizyonYayinlaEylemi(project.doc, ui.showToast);
        else revizyonIsaretleEylemi(project.doc, ui.scriptSecili, ui.showToast);
        return;
      }
      if (key === 'f') {
        /* Odak modu. Yalnız senaryo görünümünde anlamlı — panoda çizim
           yaparken blokları söndürmenin karşılığı yok. Kısayol orada sessiz
           kalır, `chromeHidden` gibi genel bir anahtarı kirletmez. */
        if (ui.viewMode !== 'senaryo') return;
        e.preventDefault();
        useUiStore.setState({ odakModu: !ui.odakModu, chromeHidden: !ui.odakModu });
        return;
      }
      if (e.key === ',' || e.key === '.') {
        // Panelden panele geçiş — en sık yapılan hareket, faresiz de olmalı.
        const panels = project.project.panels;
        const at = panels.findIndex((p) => p.id === project.activePanelId);
        if (at < 0) return;
        e.preventDefault();
        const next = panels[Math.max(0, Math.min(panels.length - 1, at + (e.key === '.' ? 1 : -1)))];
        if (next) project.setActivePanel(next.id);
        return;
      }

      const tool = TOOL_SHORTCUTS[key];
      if (tool) {
        e.preventDefault();
        useUiStore.getState().setTool(tool);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handlers]);
}
