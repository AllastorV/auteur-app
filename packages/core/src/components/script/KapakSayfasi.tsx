import React from 'react';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import * as M from '../../doc/mutations';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { ORAN, type BaslikSayfasi } from '../../disa/baslik-sayfasi';
import { ILETISIM_SATIR_EN_COK, YAZAR_SATIR_EN_COK } from '../../model/baslik-sayfasi';
import { t } from '../../dil/arayuz';

/**
 * KAPAK SAYFASI — senaryonun ilk sayfası, yerinde düzenlenir.
 *
 * Kullanıcı kararı (2026-08-27): kapak dialogda değil, senaryo kağıdının
 * ÜSTÜNDE gerçek bir sayfa olarak durur; alanlara tıklanıp yazılır ve ne
 * görünüyorsa PDF'te o çıkar. Varsayılan AÇIK — sektörde senaryo kapaksız
 * teslim edilmez ve kapalı gelseydi unutulurdu.
 *
 * ## Yerleşim TEK EVDEN
 *
 * Dikey konumlar `disa/baslik-sayfasi.ts`teki `ORAN` tablosundan okunuyor,
 * burada YENİDEN YAZILMIYOR (Karar 2). İkinci bir kopya olsaydı biri
 * düzeltilip öteki unutulduğunda ekran PDF'ten sessizce ıraksardı — bu
 * dosyanın bütün değeri "gördüğün şey basılan şey" olmasında.
 *
 * ## Sayfa sayısına GİRMEZ
 *
 * Kapak numaralanmaz ve "1 sayfa ≈ 1 dakika" sözleşmesine dahil değildir
 * (bkz. `baslikSayfasiCiz`). Bu bileşen senaryo metninin DIŞINDA duruyor;
 * paginator onu hiç görmüyor, sayaçlar saymıyor.
 *
 * ## Neden `input`/`textarea`, `contentEditable` değil
 *
 * Kapak alanları düz metin; zengin metne ihtiyaç yok. `contentEditable`
 * yapıştırılan biçimli metni içeri alır ve temizlemek ayrı bir iş olurdu.
 * Yerel giriş öğeleri ayrıca ekran okuyucuya kendini tanıtıyor ve Tab ile
 * gezilebiliyor — kapak sayfası tek tek alanlardan oluşan bir FORM.
 */

/** Alanın dikey konumu — `ORAN` (0 = üst, 1 = alt) yüzdeye çevrilir. */
const ust = (oran: number) => `${oran * 100}%`;
const alt = (oran: number) => `${oran * 100}%`;

interface AlanProps {
  deger: string;
  yerTutucu: string;
  onDegis: (v: string) => void;
  duzenlenebilir: boolean;
  testid: string;
  sinif?: string;
  stil?: React.CSSProperties;
  cokSatirli?: boolean;
  satir?: number;
}

function Alan({
  deger, yerTutucu, onDegis, duzenlenebilir, testid, sinif = '', stil, cokSatirli, satir,
}: AlanProps) {
  const ortak = {
    'data-testid': testid,
    value: deger,
    placeholder: yerTutucu,
    readOnly: !duzenlenebilir,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onDegis(e.target.value),
    className: `kapak-alan ${sinif}`,
    style: stil,
  };
  return cokSatirli
    ? <textarea {...ortak} rows={satir ?? 2} />
    : <input {...ortak} type="text" />;
}

export function KapakSayfasi() {
  const doc = useProjectStore((s) => s.doc);
  const kayit = useProjectStore((s) => s.baslikSayfasi);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const { profil } = useSenaryoProfili();
  const kapali = useUiStore((s) => s.kapakKapali);

  if (kapali) return null;

  /* Yjs'e DOĞRUDAN yazılıyor, yerel taslak yok: kapak alanları seyrek
     düzenlenir ve ortak çalışmada karşı tarafın yazdığını anında görmek
     doğru davranış. Dialog'daki `onBlur` taslağı oradaki canlı önizleme
     yüzündendi; burada önizleme ile alan AYNI şey. */
  const yaz = (yama: Partial<BaslikSayfasi>) => M.baslikSayfasiGuncelle(doc, yama);

  /* "yazan" / "written by" — `baslikSayfasiCiz`in AYNI kuralı, tek satırlık
     bir koşul olduğu için ayrı bir tabloya taşınmıyor. */
  const yazanEtiketi = profil.dil === 'tr' ? 'yazan' : 'written by';
  const yazarVar = Boolean(kayit.yazar?.trim());

  return (
    <div className="kapak-kagit" data-testid="kapak-sayfasi">
      <Alan
        testid="kapak-baslik"
        deger={kayit.baslik}
        yerTutucu={t('SENARYONUN ADI')}
        onDegis={(v) => yaz({ baslik: v })}
        duzenlenebilir={duzenlenebilir}
        /* ÇOK SATIRLI: tek satırlık bir `input`ta Enter hiçbir şey
           yapmıyordu ve uzun bir film adı yatayda kayıyordu (kullanıcı
           bildirimi 2026-08-30). PDF de satır sonlarını çiziyor. */
        cokSatirli
        satir={2}
        sinif="kapak-orta kapak-baslik"
        stil={{ top: ust(ORAN.baslikUst) }}
      />
      <Alan
        testid="kapak-alt-baslik"
        deger={kayit.altBaslik ?? ''}
        yerTutucu={t('alt başlık (isteğe bağlı)')}
        onDegis={(v) => yaz({ altBaslik: v })}
        duzenlenebilir={duzenlenebilir}
        cokSatirli
        satir={2}
        sinif="kapak-orta"
        stil={{ top: ust(ORAN.altBaslikUst) }}
      />
      {/* "yazan" satırı yazar alanı BOŞKEN çizilmez — PDF'in kuralının
          aynısı; boş bir kapakta tek başına duran "yazan" hatalı görünür. */}
      <div
        className="kapak-orta kapak-yazan"
        style={{ top: ust(ORAN.yazanUst) }}
        aria-hidden={!yazarVar}
        data-testid="kapak-yazan"
      >
        {yazarVar ? yazanEtiketi : ''}
      </div>
      <Alan
        testid="kapak-yazar"
        deger={kayit.yazar ?? ''}
        yerTutucu={t('Yazar adı — birden fazlaysa alt alta')}
        onDegis={(v) => yaz({ yazar: v })}
        duzenlenebilir={duzenlenebilir}
        cokSatirli
        satir={YAZAR_SATIR_EN_COK}
        sinif="kapak-orta kapak-yazar"
        stil={{ top: ust(ORAN.yazarUst) }}
      />
      {/* İletişim SOL ALT, taslak+tarih SAĞ ALT — sektör yerleşimi. */}
      <Alan
        testid="kapak-iletisim"
        deger={(kayit.iletisim ?? []).join('\n')}
        yerTutucu={t('Ajans / telefon / e-posta')}
        onDegis={(v) => yaz({ iletisim: v.split('\n').slice(0, ILETISIM_SATIR_EN_COK) })}
        duzenlenebilir={duzenlenebilir}
        cokSatirli
        satir={3}
        sinif="kapak-sol"
        stil={{ bottom: alt(ORAN.iletisimAlt) }}
      />
      <Alan
        testid="kapak-surum"
        deger={kayit.surum ?? ''}
        yerTutucu={t('1. taslak')}
        onDegis={(v) => yaz({ surum: v })}
        duzenlenebilir={duzenlenebilir}
        sinif="kapak-sag"
        stil={{ bottom: alt(ORAN.surumAlt) }}
      />
      <Alan
        testid="kapak-tarih"
        deger={kayit.tarih ?? ''}
        yerTutucu={t('tarih')}
        onDegis={(v) => yaz({ tarih: v })}
        duzenlenebilir={duzenlenebilir}
        sinif="kapak-sag"
        stil={{ bottom: alt(ORAN.tarihAlt) }}
      />
    </div>
  );
}
