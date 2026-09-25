import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore, type ScriptFilter } from '../../store/ui';
import {
  createPanelFromBlocks,
  importScriptFile,
  linkBlocksToPanel,
  openPanelForBlock,
  unlinkBlocks,
} from '../../store/script';
import { scriptLinkIndex, type ScriptBlock } from '../../model/script';
import { setDragPayload } from '../dnd';
import { Section } from '../inspector/Fields';
import type { Panel } from '../../model/types';
import { moduDegistir } from '../../store/mod';

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const FILTERS = (): { id: ScriptFilter; label: string }[] => [
  { id: 'all', label: t('Tümü') },
  { id: 'linked', label: t('Bağlı') },
  { id: 'unlinked', label: t('Bağsız') },
];

const ACCEPT = '.fountain,.txt,.fdx,.md,.starc,text/plain';

/**
 * Satır tipinin YALNIZCA rengi.
 *
 * Girinti, hizalama ve büyük harf burada yoktur: sayfa düzeni ölçülen
 * geometriden (`format/ekran`, §6.4) üretilir ve tek yerde — düzenlenebilir
 * sayfada — yaşar. Kaldırılan `BLOCK_STYLE`'ın `pl-16`/`pl-14`/`text-right`
 * değerleri hiçbir ölçüye bağlı değildi; profil değişince sessizce yanlış
 * kalıyorlardı. Gezgin bir sayfa taklidi değil, bir dizindir.
 */
/**
 * Yapı listesinin renk tablosu — kullanıcı kararı "P4".
 *
 * Renk burada YAPIYI söylüyor: bölüm/sahne başlıkları bir renk, kişiler
 * başka bir renk, geri kalan nötr. Amber bu listede YOK — o "eylem ve
 * odak" demek ve seçili satırın kenarında zaten kullanılıyor; başlıkları
 * da amber yapmak vurgu enflasyonu olurdu.
 *
 * Önceki hâl `text-amber-300`/`text-amber-200` kullanıyordu: bunlar
 * Tailwind'in KENDİ amber tonları, projenin paletinden bile değil.
 */
const BLOK_RENGI: Record<ScriptBlock['type'], string> = {
  scene: 'font-semibold text-yapi-baslik',
  action: 'text-metin-govde',
  character: 'font-medium text-yapi-kisi',
  parenthetical: 'italic text-metin-zayif',
  dialogue: 'text-metin-guclu',
  transition: 'text-metin-zayif',
  bolum: 'font-semibold text-yapi-baslik',
  paragraf: 'text-metin-govde',
  sayfa: 'font-semibold text-yapi-baslik',
  kare: 'font-medium text-yapi-kisi',
  altyazi: 'italic text-metin-zayif',
  balon: 'text-metin-guclu',
  'sahne-yonergesi': 'italic text-metin-zayif',
  ses: 'text-amber',
  muzik: 'text-violet-300',
};

function panelLabel(panel: Panel): string {
  return `S${panel.meta.scene}·C${panel.meta.shot}`;
}

/**
 * Senaryo gezgini — denetçinin senaryo bölümü (F1b-3).
 *
 * Metnin görünümü değil, senaryo ↔ panel BAĞI buranın işidir: arama, filtre,
 * satır seçimi, klavye gezinmesi, panel rozetleri ve sürükle-bırak.
 */
export function ScriptNavigator() {
  const project = useProjectStore((s) => s.project);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const editable = useProjectStore((s) => s.allowed('edit'));
  const showToast = useUiStore((s) => s.showToast);
  const selection = useUiStore((s) => s.scriptSelection);
  const cursor = useUiStore((s) => s.scriptCursor);
  const search = useUiStore((s) => s.scriptSearch);
  const filter = useUiStore((s) => s.scriptFilter);
  const set = useUiStore((s) => s.set);

  const fileRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const blocks = project.script.blocks;
  const linkIndex = useMemo(() => scriptLinkIndex(project.panels), [project.panels]);
  const panelById = useMemo(
    () => new Map(project.panels.map((p) => [p.id, p] as const)),
    [project.panels],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return blocks.filter((b) => {
      if (q && !b.text.toLocaleLowerCase('tr').includes(q)) return false;
      const linked = (linkIndex.get(b.id)?.length ?? 0) > 0;
      if (filter === 'linked') return linked;
      if (filter === 'unlinked') return !linked;
      return true;
    });
  }, [blocks, search, filter, linkIndex]);

  const selectedSet = useMemo(() => new Set(selection), [selection]);

  /* Aktif panel değişince ona bağlı ilk satır görünüre kaydırılır —
     şarkı-söz senkronunda olduğu gibi metin panelle birlikte akar. */
  useEffect(() => {
    const panel = panelById.get(activePanelId);
    const first = panel?.scriptRefs?.[0];
    if (!first) return;
    rowRefs.current.get(first)?.scrollIntoView({ block: 'nearest' });
  }, [activePanelId, panelById]);

  useEffect(() => {
    if (cursor) rowRefs.current.get(cursor)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  /* ------------------------------ seçim ----------------------------- */

  const selectRange = useCallback(
    (fromId: string, toId: string) => {
      const a = visible.findIndex((b) => b.id === fromId);
      const z = visible.findIndex((b) => b.id === toId);
      if (a < 0 || z < 0) return [toId];
      const [lo, hi] = a <= z ? [a, z] : [z, a];
      return visible.slice(lo, hi + 1).map((b) => b.id);
    },
    [visible],
  );

  const onRowClick = useCallback(
    (block: ScriptBlock, e: React.MouseEvent) => {
      const ui = useUiStore.getState();
      if (e.shiftKey && ui.scriptAnchor) {
        set('scriptSelection', selectRange(ui.scriptAnchor, block.id));
        set('scriptCursor', block.id);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const next = selectedSet.has(block.id)
          ? selection.filter((id) => id !== block.id)
          : [...selection, block.id];
        useUiStore.setState({ scriptSelection: next, scriptCursor: block.id, scriptAnchor: block.id });
        return;
      }
      useUiStore.setState({
        scriptSelection: [block.id],
        scriptCursor: block.id,
        scriptAnchor: block.id,
      });
      // Tek tıkla bağlı çizim açılır — bağlantının asıl amacı budur.
      openPanelForBlock(block.id, activePanelId);
    },
    [selection, selectedSet, selectRange, set, activePanelId],
  );

  /* ----------------------------- klavye ----------------------------- */

  const move = useCallback(
    (delta: number, extend: boolean) => {
      if (!visible.length) return;
      const ui = useUiStore.getState();
      const at = ui.scriptCursor ? visible.findIndex((b) => b.id === ui.scriptCursor) : -1;
      const nextIndex = Math.max(0, Math.min(visible.length - 1, (at < 0 ? 0 : at + delta)));
      const next = visible[nextIndex];
      if (!next) return;
      if (extend && ui.scriptAnchor) {
        useUiStore.setState({ scriptSelection: selectRange(ui.scriptAnchor, next.id), scriptCursor: next.id });
      } else {
        useUiStore.setState({
          scriptSelection: [next.id],
          scriptCursor: next.id,
          scriptAnchor: next.id,
        });
      }
    },
    [visible, selectRange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const ui = useUiStore.getState();
      const ids = ui.scriptSelection;
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); move(1, e.shiftKey); return;
        case 'ArrowUp': e.preventDefault(); move(-1, e.shiftKey); return;
        case 'PageDown': e.preventDefault(); move(10, e.shiftKey); return;
        case 'PageUp': e.preventDefault(); move(-10, e.shiftKey); return;
        case 'Enter': {
          e.preventDefault();
          if (!ids.length || !editable) return;
          if (e.shiftKey) {
            // Shift+Enter: yeni panel açmadan aktif panele bağla.
            linkBlocksToPanel(ids);
            showToast(tf('%d satır bu panele bağlandı.', ids.length), 'success');
            return;
          }
          const created = createPanelFromBlocks(ids);
          if (created) showToast(t('Senaryodan panel oluşturuldu.'), 'success');
          return;
        }
        case ' ': {
          e.preventDefault();
          if (ui.scriptCursor) openPanelForBlock(ui.scriptCursor, activePanelId);
          return;
        }
        case 'Backspace':
        case 'Delete': {
          e.preventDefault();
          if (!ids.length || !editable) return;
          unlinkBlocks(ids);
          showToast(t('Bağlantı kaldırıldı.'), 'info');
          return;
        }
        case 'Escape':
          useUiStore.setState({ scriptSelection: [], scriptAnchor: null });
          return;
        default:
          return;
      }
    },
    [move, editable, showToast, activePanelId],
  );

  /* ---------------------------- yükleme ----------------------------- */

  const loadFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!editable) return showToast(t('Bu oturumda düzenleme izniniz yok.'), 'error');
      try {
        const sonuc = await importScriptFile(file);
        showToast(tf('Senaryo yüklendi — %d satır.', sonuc.satir), 'success');
        /* Kayıpsız olmayan dönüşüm SESSİZ kalamaz: kullanıcı neyin
           taşınmadığını ya da hangi tipe kaydığını bilmeli. */
        if (sonuc.uyarilar.length > 0) {
          const ozet = sonuc.uyarilar
            .map((u) => `${u.starcTipi}×${u.sayi} ${u.sonuc === 'gevsek' ? t('yaklaşık') : t('atlandı')}`)
            .join(', ');
          showToast(tf('İçe aktarım tam eşleşmedi: %s', ozet), 'info');
        }
      } catch (err) {
        showToast(tf('Senaryo okunamadı: %s', (err as Error).message), 'error');
      }
    },
    [editable, showToast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      e.preventDefault();
      void loadFile(file);
    },
    [loadFile],
  );

  /* ----------------------------- render ----------------------------- */

  return (
    <div
      data-testid="senaryo-gezgini"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <Section title={t('Senaryo')}>
        <div className="flex items-center gap-2 pb-1">
          <span className="min-w-0 flex-1 truncate text-xs text-metin-zayif" title={project.script.name}>
            {/* "YÜKLENMEDİ" YALNIZ GERÇEKTEN BOŞKEN. Etiket yalnız `name`e
                bakıyordu ve senaryo bu programda YAZILARAK da doğuyor:
                dört satır yazılmış bir belgede, adı henüz konmadığı için
                panel "Senaryo yüklenmedi" diyordu — altında satırları
                listelerken (görsel turda görüldü, 2026-08-30).
                Ad yoksa ama metin varsa belge ADSIZDIR, yüklenmemiş
                değil. */}
            {project.script.name
              || (project.script.blocks.length ? t('Adsız senaryo') : t('Senaryo yüklenmedi'))}
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!editable}
            className="mzn-denetim px-2.5 py-1 text-xs disabled:opacity-40"
          >
            {blocks.length ? t('Değiştir') : t('Yükle')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              void loadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {/* BOŞ = yazılmış hiçbir şey yok. `blocks.length === 0` diye
            sorulamaz: editör artık boş belgeye yazılabilir TEK bir blok
            koyuyor (`ilkBlokEklentisi`) ve o blok bu şeridi gizleyince
            senaryo İÇE AKTARMANIN tek görünür yolu kayboluyordu — ölçüldü,
            e2e yakaladı. Kullanıcı için tek boş satır "boş belge"dir. */}
        {blocks.every((b) => b.text.trim() === '') ? (
          <div className="border border-dashed border-kenar-denetim p-5 text-center text-[11px] text-metin-cok-zayif">
            <p className="mb-1 text-metin-zayif">{t('Senaryonu buraya sürükle')}</p>
            <p>.fountain · .fdx · .txt</p>
            <p className="mt-3 text-metin-cok-zayif">
              {t('Yükledikten sonra bir satır seç ve')} <kbd className="mzn-denetim mzn-sayi px-1.5">Enter</kbd>{' '}
              {t('ile o satıra bağlı panel oluştur.')}
            </p>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={(e) => set('scriptSearch', e.target.value)}
              placeholder={t('Senaryoda ara…')}
              className="mzn-denetim w-full px-2 py-1.5 text-xs outline-none placeholder:text-metin-cok-zayif"
            />
            <div className="flex gap-1 pt-1">
              {FILTERS().map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set('scriptFilter', f.id)}
                  className={
                    'px-2 py-0.5 text-[11px] transition-colors ' +
                    (filter === f.id ? 'mzn-etkin' : 'mzn-denetim')
                  }
                >
                  {f.label}
                </button>
              ))}
              <span className="mzn-sayi ml-auto self-center text-[11px] text-metin-cok-zayif">
                {tf('%d/%d bağlı', linkIndex.size, blocks.length)}
              </span>
            </div>

            <div
              tabIndex={0}
              data-script-list=""
              role="listbox"
              aria-label={t('Senaryo satırları')}
              onKeyDown={onKeyDown}
              className="mt-1 max-h-[45vh] overflow-y-auto border border-kenar-ic py-1 font-mono text-[11px] leading-relaxed outline-none focus:border-amber-kenar"
            >
              {visible.map((block) => {
                const linkedPanels = linkIndex.get(block.id) ?? [];
                const isActive = linkedPanels.includes(activePanelId);
                const isSelected = selectedSet.has(block.id);
                return (
                  <div
                    key={block.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(block.id, el);
                      else rowRefs.current.delete(block.id);
                    }}
                    role="option"
                    aria-selected={isSelected}
                    draggable={editable}
                    onDragStart={(e) => {
                      const ids = selectedSet.has(block.id) ? selection : [block.id];
                      setDragPayload(e, { type: 'script', blockIds: ids });
                    }}
                    onClick={(e) => onRowClick(block, e)}
                    className={
                      /* Bağlı satırın işareti 2px'lik SOL ŞERİT — sahne
                         gezginindeki renk şeridiyle aynı dil. Seçim zeminle,
                         imleç ince amber çerçeveyle gösteriliyor: üçü ayrı
                         eksen, üst üste binmiyorlar. */
                      'relative cursor-pointer border-l-2 px-2 py-0.5 transition-colors ' +
                      (isActive
                        ? 'border-amber bg-amber-zemin '
                        : linkedPanels.length
                          ? 'border-yapi-bag '
                          : 'border-transparent ') +
                      (isSelected ? 'bg-etkin ' : 'hover:bg-etkin/60 ') +
                      (cursor === block.id ? 'outline outline-1 -outline-offset-1 outline-amber ' : '')
                    }
                  >
                    <span className={BLOK_RENGI[block.type]}>{block.text}</span>
                    {linkedPanels.length > 0 && (
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {linkedPanels.map((panelId) => {
                          const panel = panelById.get(panelId);
                          if (!panel) return null;
                          return (
                            <button
                              key={panelId}
                              type="button"
                              title={tf('%s — aç (sağ tık: bağlantıyı kaldır)', panelLabel(panel))}
                              onClick={(e) => {
                                e.stopPropagation();
                                /* Panel rozetine tıklamak da mod kabuğundan
                                   geçer — gezgin `viewMode`'u kendi yazsaydı
                                   senaryo modu storyboard modunun adını
                                   bilirdi (§7). */
                                useProjectStore.getState().setActivePanel(panelId);
                                moduDegistir('board');
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (editable) unlinkBlocks([block.id]);
                              }}
                              className="mzn-sayi bg-yapi-bag-zemin px-1.5 text-[9px] text-yapi-bag-metin transition-colors hover:bg-yapi-bag-hover"
                            >
                              {panelLabel(panel)}
                            </button>
                          );
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
              {!visible.length && (
                <p className="p-4 text-center text-metin-cok-zayif">{t('Bu filtreye uyan satır yok.')}</p>
              )}
            </div>

            {/* PANEL DÜĞMELERİ KALDIRILDI (kullanıcı kararı 2026-08-26:
                "panel oluştur ve bağla kısmı ayrı yandaki sahne kısmında
                olmasın, imleçle seçip sağ tık panelinden yapalım").

                Gerekçe kullanıcının: eylem SEÇİMİN yanında olmalı. Yan
                panelin dibindeki iki düğme, kullanıcının gözünü yazdığı
                satırdan koparıp ekranın öbür ucuna götürüyordu. Aynı eylemler
                sağ tık menüsünde ve KISAYOLLARDA duruyor — yani yetenek
                kaybolmadı, yeri değişti.

                Enter ve Shift+Enter kısayolları LİSTEDE ÇALIŞMAYA DEVAM
                EDİYOR; düğmeler onların görünür kopyasıydı. */}
            <p className="text-center text-[10px] text-metin-etiket">
              {t('↑↓ gez · ⏎ panel oluştur · ⇧⏎ panele bağla · Space çizimi aç · Del bağlantıyı kaldır · sağ tık menüsü')}
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
