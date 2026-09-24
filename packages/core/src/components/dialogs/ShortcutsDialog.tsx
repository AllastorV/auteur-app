import React from 'react';
import { t } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { useProjectStore } from '../../store/project';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import { BLOK_ETIKETLERI } from '../../model/script';
import { EN_COK_PRESET_KISAYOLU } from '../../editor/preset';

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye; gerekçenin
   tamamı `i18n-kapsam.test.ts`teki `donmusCeviriler` başlığında. */
const GROUPS = (): { title: string; items: [string, string][] }[] => [
  {
    /* Araç harfleri PANO görünümünün dili (Figma, Photoshop). Senaryo
       sayfasında aynı harfler yazılan metnin kendisidir, o yüzden orada
       yalnız Alt'lı biçim çalışır. Liste bunu satır satır tekrar etmiyor;
       kuralı üstteki şerit bir kez söylüyor. */
    title: t('Araçlar (pano)'),
    items: [
      ['V', t('Seç')],
      ['B', t('Kalem')],
      ['E', t('Silgi')],
      ['T', t('Metin')],
      ['R', t('Dikdörtgen')],
      ['L', t('Çizgi')],
      ['A', t('Ok')],
      [t('Orta tuş + sürükle'), t('Canvas’ı kaydır')],
      ['[ / ]', t('Fırça boyutunu küçült / büyüt')],
    ],
  },
  {
    title: t('Düzenleme'),
    items: [
      ['Ctrl+Z', t('Geri al')],
      ['Ctrl+Y / Ctrl+Shift+Z', t('İleri al')],
      ['Ctrl+D', t('Çoğalt (seçim varsa obje, yoksa panel)')],
      ['Ctrl+A', t('Paneldeki tüm objeleri seç')],
      ['Delete', t('Seçili objeleri sil')],
      ['Esc', t('Seçimi ve çizim taslağını temizle')],
      ['Enter', t('Çokgeni kapat')],
    ],
  },
  {
    title: t('Proje ve görünüm'),
    items: [
      ['Ctrl+S', t('Kaydet')],
      ['Ctrl+E', t('Dışa aktar')],
      ['N / Alt+N', t('Yeni panel')],
      [', / . (Alt+)', t('Önceki / sonraki panel')],
      ['G / Alt+G', t('Grid ↔ pano görünümü')],
      ['S / Alt+S', t('Senaryo sayfası ↔ pano görünümü')],
      ['Y / Alt+Y', t('Kim ne yazdı')],
      ['Tab', t('Panelleri gizle / göster')],
      [t('Fare tekerleği'), t('Yakınlaştır / uzaklaştır')],
      [t('Shift + tekerlek'), t('Yatay kaydır')],
    ],
  },
  {
    title: t('Senaryo gezgini'),
    items: [
      ['↑ / ↓', t('Satırlar arasında gez')],
      ['Shift + ↑ / ↓', t('Satır aralığı seç')],
      ['Enter', t('Seçili satırlardan panel oluştur ve bağla')],
      ['Shift+Enter', t('Seçili satırları açık panele bağla')],
      ['Space', t('Satıra bağlı çizimi aç')],
      ['Delete', t('Bağlantıyı kaldır (satır kalır)')],
      [t('Sürükle'), t('Satırı bir panele bırakarak bağla')],
    ],
  },
  {
    /* Bu bölüm eksikti: F, B, < > ve ? gerçekten bağlıydı ama hiçbir yerde
       YAZMIYORDU — var olan bir yeteneği saklamak, olmayanı vaat etmek
       kadar kötü. Listedeki her satır `useShortcuts`'taki gerçek bir dala
       karşılık geliyor; olmayan kısayol yazılmadı. */
    title: t('Yazarken'),
    items: [
      ['Alt+F', t('Odak modu (yan panelleri gizle)')],
      ['Alt+B', t('İmleçteki satıra yer imi koy / kaldır')],
      ['Alt+< / Alt+>', t('Önceki / sonraki yer imi')],
      ['Esc', t('Odak modundan çık — sonra gizli paneller, sonra seçim')],
      ['Ctrl+1..9', t('İmleçteki satırın yazım preseti — aşağıdaki listeye bak')],
      ['Ctrl+Enter', t('Sayfa başı koy / kaldır — bu satır yeni sayfada başlar')],
      ['Alt+M', t('Seçili satırları revizyonda işaretle')],
      ['Alt+Shift+M', t('Yeni revizyon turu yayınla')],
    ],
  },
  {
    title: t('Yardım'),
    items: [
      ['F1', t('Bu listeyi aç')],
      ['?', t('Bu listeyi aç (yalnız pano — soru işareti bir karakterdir)')],
    ],
  },
];

/**
 * Kısayol tablosunun GÖVDESİ — Modal'sız.
 *
 * Hem bu diyalog hem Ayarlar penceresi aynı tabloyu çiziyor (kullanıcı
 * kararı 2026-08-27: "genel ayarlara bir kısayol tablosu da ekle"). İki
 * kopya yazılsaydı biri güncellenip öteki unutulduğunda kullanıcıya iki
 * farklı kısayol listesi gösterilirdi (Karar 2).
 */
export function KisayolTablosu({ kural = true }: { kural?: boolean }) {
  const tip =
    dokumanTipi(useProjectStore((s) => s.project.meta.dokumanTipi)) ?? DOKUMAN_TIPLERI.senaryo;
  const presetGrubu = {
    title: `${t('Yazım presetleri')} — ${t(tip.ad)}`,
    items: tip.bloklar
      .slice(0, EN_COK_PRESET_KISAYOLU)
      .map((b, i): [string, string] => [`Ctrl+${i + 1}`, t(BLOK_ETIKETLERI[b])]),
  };

  return (
    <>
      {/* Kural bir kez, en üstte. Her satıra "senaryoda Alt gerekir" yazmak
          listeyi okunmaz kılardı ve kural yine tek yerde durmalı. */}
      {kural && (
        <p
          data-testid="kisayol-kurali"
          className="mb-4 border-l-2 border-kenar-denetim bg-denetim/40 px-3 py-2 text-xs text-metin-zayif"
        >
          <b className="font-normal text-metin-guclu">
            {t('Senaryo sayfasında çıplak harf kısayolu yoktur')}
          </b>
          {' — '}
          {t('yazarken kaza olmasın diye')}{' '}
          <kbd className="border border-kenar-denetim px-1 font-mono text-[10px]">Alt</kbd>{' '}
          {t('gerekir. Panoda harfler doğrudan çalışır.')}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {[...GROUPS(), presetGrubu].map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-metin-etiket">
              {group.title}
            </h3>
            <ul className="space-y-1">
              {group.items.map(([key, label]) => (
                <li key={key} className="flex items-baseline gap-2 text-xs">
                  <kbd className="shrink-0 border border-kenar-denetim bg-denetim px-1.5 py-0.5 font-mono text-[10px] text-metin-guclu">
                    {key}
                  </kbd>
                  <span className="text-metin-zayif">{label}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title={t('Klavye Kısayolları')}
      onClose={onClose}
      width={620}
      footer={<Button onClick={onClose}>{t('Kapat')}</Button>}
    >
      <KisayolTablosu />
    </Modal>
  );
}
