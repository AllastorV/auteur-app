import { useEffect } from 'react';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';
import { bloktanPaneleGec } from '../store/mod';
import * as M from '../doc/mutations';
import type { MenuEylemi } from '../dil/menu';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../model/dokuman-tipi';
import type { ScriptBlockType } from '../model/script';
import { revizyonIsaretleEylemi } from '../model/revizyon-eylem';

/**
 * Bağlam menüsünün RENDERER ucu — §16.4.
 *
 * Ana süreç menüyü çiziyor ama iki şeyi bilmiyor: menünün durumu (rol, kaç
 * satır seçili, bağlı panel var mı) ve belgeye dokunan eylemlerin nasıl
 * uygulanacağı. İkisi de burada, çünkü mutasyonlar, mod kabuğu ve geri alma
 * burada yaşıyor. Ana süreçte uygulamak onları ikinci bir eve taşırdı.
 *
 * Köprü `window` üzerinden: `context-menu` olayı ana süreçte doğuyor ve
 * senkron bir IPC yanıtı isteyecek kadar hızlı olmalı; `executeJavaScript`
 * bu iş için Electron'un kendi yolu.
 *
 * Menü KARARI burada da yok — `dil/menu`'deki saf `baglamMenusu` veriyor.
 * Burası yalnız ona girdi üretiyor.
 */
declare global {
  interface Window {
    __mizansenMenuDurumu?: () => unknown;
    __mizansenMenuEylem?: (eylem: MenuEylemi) => void;
  }
}

export function useBaglamMenusu(): void {
  useEffect(() => {
    window.__mizansenMenuDurumu = () => {
      const proje = useProjectStore.getState();
      const ui = useUiStore.getState();
      /* SEÇİM İKİ YERDEN GELEBİLİR ve ikisi de sayılmalı.
         Önce yalnız `scriptSelection` (gezgin listesindeki seçim) okunuyordu;
         kullanıcı EDİTÖRDE sağ tıkladığında orası boş oluyor, `seciliSatir`
         sıfır kalıyor ve menünün blok/panel grupları HİÇ ÇİZİLMİYORDU.
         Kullanıcı bunu gerçek pencerede gördü: "sağ tık menüsü çok yetersiz,
         dediğim birçok işlev yok."
         İmleç de bir seçimdir: bir satırın üstünde sağ tıklamak o satırı
         kastetmektir. */
      const secim = ui.viewMode !== 'senaryo' ? [] : ui.scriptSelection?.length
        ? ui.scriptSelection
        : (ui.scriptCursor ? [ui.scriptCursor] : []);
      const bloklar = proje.project.script?.blocks ?? [];
      const secili = bloklar.filter((b) => secim.includes(b.id));
      const revizyonSecim = ui.scriptSecili.length ? ui.scriptSecili : secim;
      const etkin = ui.viewMode === 'senaryo' ? M.etkinRevizyon(proje.doc) : null;
      const isaretler = M.revizyonIsaretleriniOku(proje.doc);

      /* Karışık seçimde blok tipi `undefined` — menü o zaman hiçbirini pasif
         yapmıyor, yani kullanıcı hepsini tek tipe çevirebiliyor. */
      const tipler = new Set(secili.map((b) => b.type));

      return {
        secimVar: secim.length > 0,
        panoDolu: false, // ana süreç `clipboard` ile dolduruyor
        duzenlenebilir: proje.allowed('edit'),
        blokTipi: tipler.size === 1 ? [...tipler][0] : undefined,
        seciliSatir: secim.length,
        bagliPanelVar: proje.project.panels.some((p) =>
          p.scriptRefs?.some((r) => secim.includes(r)),
        ),
        denetimVar: true,
        revizyonRengi: etkin?.renk,
        revizyonIsaretleme: etkin && revizyonSecim.length && proje.allowed('edit')
          ? revizyonSecim.every((id) => isaretler.get(id) === etkin.id) ? 'kaldir' : 'isaretle'
          : undefined,
        izinliBloklar: (dokumanTipi(proje.project.meta.dokumanTipi) ?? DOKUMAN_TIPLERI.senaryo).bloklar,
        imVar: secim.length === 1 && proje.yerImleri[secim[0]!] !== undefined,
      };
    };

    window.__mizansenMenuEylem = (eylem: MenuEylemi) => {
      const proje = useProjectStore.getState();
      const ui = useUiStore.getState();
      /* Eylem yolu da AYNI seçimi görmeli — okuma ve yazma farklı seçimlere
         bakarsa menü bir satır için çizilip başkasına uygulanırdı. */
      const secim = ui.viewMode !== 'senaryo' ? [] : ui.scriptSelection?.length
        ? ui.scriptSelection
        : (ui.scriptCursor ? [ui.scriptCursor] : []);
      if (ui.viewMode !== 'senaryo' && eylem.tur !== 'sozluge-ekle' && eylem.tur !== 'yoksay') return;
      if (!proje.allowed('edit') && eylem.tur !== 'panele-git' && eylem.tur !== 'yoksay') return;
      const doc = proje.doc;
      const revizyonSecim = ui.scriptSecili.length ? ui.scriptSecili : secim;

      switch (eylem.tur) {
        case 'revizyon-isaretle':
          if (!proje.allowed('edit') || ui.viewMode !== 'senaryo' || !M.etkinRevizyon(doc)) return;
          revizyonIsaretleEylemi(doc, revizyonSecim, ui.showToast);
          return;
        case 'revizyon-rengi':
          if (!proje.allowed('edit') || ui.viewMode !== 'senaryo') return;
          M.revizyonRenginiDegistir(doc, eylem.renk);
          return;
        case 'panel-olustur-bagla': {
          if (!proje.allowed('edit') || secim.length === 0) return;
          /* TEK ADIM: panel oluştur, sonra bağla. İkisi ayrı eylem olsaydı
             arada kullanıcı başka bir paneli aktif edebilir ve bağ yanlış
             yere düşerdi. */
          const panelId = M.addPanel(doc);
          M.linkPanelScript(doc, panelId, secim);
          proje.setActivePanel(panelId);
          return;
        }
        case 'yer-imi':
          if (!proje.allowed('edit') || secim.length !== 1) return;
          M.yerImiCevir(doc, secim[0]!);
          return;
        case 'sozluge-ekle':
          M.sozlugeEkle(doc, eylem.kelime);
          return;
        case 'yoksay':
          /* Yoksayma OTURUMLUK: belgeye yazılsaydı bir yazarın "bu kelime
             önemsiz" kararı bütün ekibin sözlüğüne girerdi. */
          useUiStore.setState({
            yoksayilanKelimeler: [...(ui.yoksayilanKelimeler ?? []), eylem.kelime],
          });
          return;
        case 'blok-tipi':
          M.setScript(doc, {
            name: proje.project.script?.name ?? '',
            blocks: (proje.project.script?.blocks ?? []).map((b) =>
              secim.includes(b.id) ? { ...b, type: eylem.tip as ScriptBlockType } : b,
            ),
          });
          return;
        case 'panele-bagla':
          M.linkPanelScript(doc, proje.activePanelId, secim);
          return;
        case 'bagi-kaldir':
          /* `unlinkPanelScript` KULLANILIYOR, kalanı hesaplayıp yeniden
             yazmak değil: `linkPanelScript` birleştirme yapıyor (küme), yani
             "kalanı yaz" hiçbir şeyi kaldırmazdı. Çıkarma kuralı zaten tek
             evde — ikincisini yazmak Karar 2 ihlali olurdu. */
          for (const p of proje.project.panels) {
            const silinecek = (p.scriptRefs ?? []).filter((r) => secim.includes(r));
            if (silinecek.length) M.unlinkPanelScript(doc, p.id, silinecek);
          }
          return;
        case 'panele-git':
          if (secim[0]) bloktanPaneleGec(secim[0]);
          return;
        default:
          /* Pano ve öneri eylemleri ana süreçte uygulanıyor; buraya
             ulaşmaları bir köprü hatası olurdu. */
          return;
      }
    };

    return () => {
      delete window.__mizansenMenuDurumu;
      delete window.__mizansenMenuEylem;
    };
  }, []);
}
