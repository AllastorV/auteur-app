import React, { useState } from 'react';
import { Modal, Button } from '../dialogs/Modal';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import {
  dunyalariSirala,
  gecerliKarakterBaglari,
  gecerliLokasyonBaglari,
  DUNYA_TURLERI,
  type Dunya,
  type DunyaTuru,
} from '../../model/dunya';
import { Row, Section, SelectField, TextField } from './Fields';
import { haritaAc } from '../../store/mod';

/**
 * Dünyalar sekmesi — §13.2 (`worldinformation`/`worldstructure`/`worldsmap`, F8).
 *
 * `KadroSekmesi` ile AYNI aile ama farklı doğa: karakter/lokasyon senaryodan
 * OTOMATİK toplanabiliyordu (Fountain'ın kendi söz dizimi işaretliyor), bir
 * dünya notu metinde ayırt edici bir kalıpla durmuyor — bu yüzden liste
 * TAMAMEN elle tutulan `dunyalarMap`ten geliyor, otomatik toplama yok.
 *
 * Bağ süzme SUNUM katmanında: `gecerliKarakterBaglari`/`gecerliLokasyonlar`
 * bayat (silinmiş kayda işaret eden) bağı burada, OKURKEN filtreliyor —
 * `dunyaGuncelle` çağrılıp depodan silinmiyor. Silinen karakter geri
 * alınırsa (Ctrl+Z) bağ bu yüzden anında geri gelir.
 */
export function DunyalarSekmesi() {
  const doc = useProjectStore((s) => s.doc);
  /* ROL KAPISI — izleyici/yorumcu değiştiremez. Sunucu zaten reddediyor
     ama kapı olmadan değişiklik ekranda OLUYOR, sonra geri sarılıyor:
     kullanıcı sildiğini sanıp geri gelmesini hata sanıyor. */
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const dunyalar = useProjectStore((s) => s.dunyalar);
  const karakterler = useProjectStore((s) => s.karakterler);
  const lokasyonlar = useProjectStore((s) => s.lokasyonlar);

  const siraliDunyalar = dunyalariSirala(dunyalar);
  const karakterIdleri = new Set(Object.keys(karakterler));
  const lokasyonIdleri = new Set(Object.keys(lokasyonlar));

  const [yeniAcik, setYeniAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState('');
  const [hata, setHata] = useState('');
  const yeniDunya = () => {
    if (!duzenlenebilir || !yeniAd.trim()) return;
    const ad = yeniAd.trim();
    try {
      projectActions.dunyaEkle(doc, { ad });
      setYeniAcik(false);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section data-testid="dunyalar-sekmesi" className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="mzn-etiket">{t('Dünyalar')}</h3>
        <button
          type="button"
          data-testid="dunya-ekle"
          onClick={() => { setYeniAd(''); setHata(''); setYeniAcik(true); }}
          disabled={!duzenlenebilir}
          className="bg-denetim px-2 py-1 text-[11px] text-metin-guclu hover:bg-denetim"
        >
          {t('+ Yeni')}
        </button>
      </div>

      {yeniAcik && (
        <Modal title={t('Dünya adı')} onClose={() => setYeniAcik(false)} width={360}>
          <form onSubmit={(e) => { e.preventDefault(); yeniDunya(); }} className="flex flex-col gap-3">
            <input autoFocus aria-label={t('Dünya adı')} value={yeniAd} maxLength={80}
              onChange={(e) => setYeniAd(e.target.value)} className="mzn-girdi p-2" />
            {hata && <p role="alert" className="text-red-400">{hata}</p>}
            <Button type="submit" variant="primary" disabled={!duzenlenebilir || !yeniAd.trim()}>{t('Ekle')}</Button>
          </form>
        </Modal>
      )}
      {siraliDunyalar.length === 0 ? (
        <p className="pb-4 text-[11px] text-metin-cok-zayif">{t('Henüz hiç dünya notu yok.')}</p>
      ) : (
        <div className="space-y-3">
          {siraliDunyalar.map((d) => (
            <DunyaKarti
              key={d.id}
              dunya={d}
              karakterler={karakterler}
              lokasyonlar={lokasyonlar}
              karakterIdleri={karakterIdleri}
              lokasyonIdleri={lokasyonIdleri}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DunyaKarti({
  dunya,
  karakterler,
  lokasyonlar,
  karakterIdleri,
  lokasyonIdleri,
}: {
  dunya: Dunya;
  karakterler: Record<string, { id: string; ad: string }>;
  lokasyonlar: Record<string, { id: string; ad: string }>;
  karakterIdleri: ReadonlySet<string>;
  lokasyonIdleri: ReadonlySet<string>;
}) {
  const doc = useProjectStore((s) => s.doc);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const guncelle = (patch: Partial<Omit<Dunya, 'id'>>) => {
    try {
      projectActions.dunyaGuncelle(doc, dunya.id, patch);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const bagliKarakter = gecerliKarakterBaglari(dunya, karakterIdleri);
  const bagliLokasyon = gecerliLokasyonBaglari(dunya, lokasyonIdleri);
  const digerKarakter = Object.values(karakterler).filter((k) => !bagliKarakter.includes(k.id));
  const digerLokasyon = Object.values(lokasyonlar).filter((l) => !bagliLokasyon.includes(l.id));

  return (
    <Section title={dunya.ad}>
      <Row label={t('Ad')}>
        <TextField value={dunya.ad} onChange={(v) => guncelle({ ad: v })} />
      </Row>
      <Row label={t('Tür')}>
        <SelectField
          value={dunya.tur}
          options={DUNYA_TURLERI.map((t) => ({ value: t, label: TUR_ETIKETI()[t] }))}
          onChange={(v: DunyaTuru) => guncelle({ tur: v })}
        />
      </Row>
      <Row label={t('Açıklama')}>
        <TextField value={dunya.aciklama} multiline onChange={(v) => guncelle({ aciklama: v })} />
      </Row>
      <Row label={t('Notlar')}>
        <TextField value={dunya.notlar} multiline onChange={(v) => guncelle({ notlar: v })} />
      </Row>

      {bagliKarakter.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {bagliKarakter.map((id) => (
            <button
              key={id}
              type="button"
              title={t('Bağı kaldır')}
              onClick={() => projectActions.dunyaKarakterBaginiKaldir(doc, dunya.id, [id])}
              disabled={!duzenlenebilir}
              className="bg-etkin px-1.5 py-0.5 text-[10px] text-metin-guclu"
            >
              {karakterler[id]?.ad ?? id} ×
            </button>
          ))}
        </div>
      )}
      {digerKarakter.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && projectActions.dunyaKarakterBagla(doc, dunya.id, [e.target.value])}
          className="mt-1 w-full bg-denetim px-1.5 py-1 text-[11px] text-metin-etiket outline-none"
        >
          <option value="">{t('+ Karakter bağla…')}</option>
          {digerKarakter.map((k) => (
            <option key={k.id} value={k.id}>{k.ad}</option>
          ))}
        </select>
      )}

      {bagliLokasyon.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {bagliLokasyon.map((id) => (
            <button
              key={id}
              type="button"
              title={t('Bağı kaldır')}
              onClick={() => projectActions.dunyaLokasyonBaginiKaldir(doc, dunya.id, [id])}
              disabled={!duzenlenebilir}
              className="bg-etkin px-1.5 py-0.5 text-[10px] text-metin-guclu"
            >
              {lokasyonlar[id]?.ad ?? id} ×
            </button>
          ))}
        </div>
      )}
      {digerLokasyon.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && projectActions.dunyaLokasyonBagla(doc, dunya.id, [e.target.value])}
          className="mt-1 w-full bg-denetim px-1.5 py-1 text-[11px] text-metin-etiket outline-none"
        >
          <option value="">{t('+ Lokasyon bağla…')}</option>
          {digerLokasyon.map((l) => (
            <option key={l.id} value={l.id}>{l.ad}</option>
          ))}
        </select>
      )}

      <button type="button" data-testid={`dunya-harita-${dunya.id}`}
        onClick={() => haritaAc(dunya.id)}
        className="mzn-denetim mt-2 w-full px-2 py-1.5 text-left text-[11px]">
        {t('Haritayı aç')} →
      </button>
      <button
        type="button"
        data-testid={`dunya-sil-${dunya.ad}`}
        disabled={!duzenlenebilir}
        onClick={() => {
          if (window.confirm(tf('"%s" silinsin mi?', dunya.ad))) projectActions.dunyaSil(doc, dunya.id);
        }}
        className="mt-2 px-2 py-1 text-[10px] text-red-400 hover:text-red-300"
      >
        {t('Sil')}
      </button>
    </Section>
  );
}

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye; gerekçenin
   tamamı `i18n-kapsam.test.ts`teki `donmusCeviriler` başlığında. */
const TUR_ETIKETI = (): Record<DunyaTuru, string> => ({
  mekan: t('Mekân'),
  kurum: t('Kurum'),
  kavram: t('Kavram'),
  olay: t('Olay'),
  nesne: t('Nesne'),
});
