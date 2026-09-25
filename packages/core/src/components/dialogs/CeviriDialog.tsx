import React, { useCallback, useEffect, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import * as M from '../../doc/mutations';
import { senaryoyuCevir } from '../../dil/ceviri';
import { saglayiciKur, type SaglayiciAdi } from '../../dil/saglayicilar';
import type { DilAdi } from '../../format/profil';

/**
 * Makine çevirisi — §16.4.
 *
 * ## Neden bu ekran bu kadar çok şey SÖYLÜYOR
 *
 * Çeviri, belgenin bütün metnini değiştiren tek işlem. Yarım uygulanması
 * veri kaybıdır ve `ceviri.ts` bunu "HEPSİ ya da HİÇBİRİ" ile çözüyor: tek
 * bir parça bile eksik dönerse hiçbir şey yazılmıyor. Ekran da aynı sözü
 * tutuyor — ilerleme gösteriyor, iptal ediliyor, hata metniyle dönüyor.
 *
 * ## Anahtar
 *
 * Masaüstünde `safeStorage` ile şifreli saklanıyor. Tarayıcıda saklanmıyor:
 * `localStorage` bir anahtar için yeterince güvenli değil ve orada
 * saklandığını söylemek, kullanıcıya olmayan bir koruma vaat etmek olurdu.
 * Web'de anahtar YALNIZ bu oturumda, bellekte duruyor.
 */
/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const SAGLAYICILAR = (): { id: SaglayiciAdi; ad: string }[] => [
  { id: 'deepl', ad: 'DeepL' },
  { id: 'google', ad: 'Google Translate' },
];

/** Sağlayıcıların ortak kabul ettiği hedefler. Liste kısa ve DOĞRULANMIŞ. */
const HEDEF_DILLER = (): { kod: string; ad: string; profil?: DilAdi }[] => [
  { kod: 'en', ad: t('İngilizce'), profil: 'en' },
  { kod: 'tr', ad: t('Türkçe'), profil: 'tr' },
  { kod: 'de', ad: t('Almanca') },
  { kod: 'fr', ad: t('Fransızca') },
  { kod: 'es', ad: t('İspanyolca') },
  { kod: 'it', ad: t('İtalyanca') },
];

export function CeviriDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const bloklar = useProjectStore((s) => s.project.script?.blocks ?? []);
  const kaynakProfilDili = useUiStore((s) => s.scriptLang);

  const [saglayici, setSaglayici] = useState<SaglayiciAdi>('deepl');
  const [anahtar, setAnahtar] = useState('');
  const [hedef, setHedef] = useState('en');
  const [ilerleme, setIlerleme] = useState<{ biten: number; toplam: number } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const iptalRef = React.useRef({ cancelled: false });

  /* Kayıtlı anahtar sağlayıcı DEĞİŞİNCE yeniden okunuyor: iki sağlayıcının
     anahtarı ayrı saklanıyor ve birininkini ötekine göndermek 403 verir,
     kullanıcı da bunu "anahtarım geçersiz" diye okur. */
  useEffect(() => {
    let iptal = false;
    setAnahtar('');
    void platform.dil?.anahtarOku(saglayici).then((k) => {
      if (!iptal && k) setAnahtar(k);
    });
    return () => { iptal = true; };
  }, [platform, saglayici]);

  const cevir = useCallback(async () => {
    if (!anahtar.trim()) { setHata(t('API anahtarı gerekli.')); return; }
    if (!bloklar.length) { setHata(t('Çevrilecek senaryo yok.')); return; }

    setHata(null);
    iptalRef.current = { cancelled: false };
    setIlerleme({ biten: 0, toplam: bloklar.length });
    try {
      const sonuc = await senaryoyuCevir(
        bloklar,
        saglayiciKur(saglayici, { apiAnahtari: anahtar.trim() }),
        {
          hedefDil: hedef,
          kaynakDil: kaynakProfilDili,
          kaynakProfilDili,
          hedefProfilDili: HEDEF_DILLER().find((d) => d.kod === hedef)?.profil,
          onIlerleme: (biten, toplam) => setIlerleme({ biten, toplam }),
          iptal: iptalRef.current,
        },
      );
      /* Tek yazım: `senaryoyuCevir` ya tam listeyi döner ya fırlatır, yani
         belgeye yarım çeviri girmesi imkânsız. Geri alma da tek adım. */
      M.setScript(useProjectStore.getState().doc, {
        name: useProjectStore.getState().project.script?.name ?? '',
        blocks: sonuc,
      });
      /* Anahtar ancak BAŞARILI çeviriden sonra saklanıyor: yanlış bir anahtarı
         kaydedip her açılışta geri getirmek, kullanıcıyı aynı hataya
         tekrar tekrar sokardı. */
      void platform.dil?.anahtarYaz(saglayici, anahtar.trim()).catch(() => {});
      showToast(tf('%d satır çevrildi.', sonuc.length), 'success');
      onClose();
    } catch (err) {
      setHata(err instanceof Error ? err.message : String(err));
    } finally {
      setIlerleme(null);
    }
  }, [anahtar, bloklar, hedef, kaynakProfilDili, onClose, platform, saglayici, showToast]);

  const calisiyor = ilerleme !== null;

  return (
    <Modal
      title={t('Senaryoyu çevir')}
      onClose={calisiyor ? () => { iptalRef.current.cancelled = true; } : onClose}
      footer={
        <>
          {calisiyor ? (
            <Button
              data-testid="ceviri-iptal"
              onClick={() => { iptalRef.current.cancelled = true; }}
            >
              {t('İptal')}
            </Button>
          ) : (
            <Button onClick={onClose}>{t('Vazgeç')}</Button>
          )}
          <Button variant="primary" disabled={calisiyor} onClick={() => void cevir()}>
            {calisiyor ? t('Çevriliyor…') : t('Çevir')}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-[11px] leading-snug text-metin-zayif">
        {t('Çeviri')} <strong>{t('hepsi ya da hiçbiri')}</strong> {t('uygulanır: bir parça bile eksik dönerse belgeye hiçbir şey yazılmaz. Sahne başlıklarının terimleri (İÇ/DIŞ) makineye gönderilmez, hedef dilde yeniden kurulur.')}
      </p>

      {!platform.dil && (
        <p
          data-testid="anahtar-saklanmaz"
          className="mb-2 bg-amber-900/40 px-1.5 py-1 text-[10px] leading-snug text-amber-200"
        >
          {t('Bu sürümde anahtar saklanmıyor — yalnız bu oturumda geçerli.')}
        </p>
      )}

      <label className="mb-2 flex items-center gap-2 text-[11px] text-metin-zayif">
        {t('Sağlayıcı')}
        <select
          data-testid="ceviri-saglayici"
          value={saglayici}
          disabled={calisiyor}
          className="bg-denetim px-1 py-0.5 text-metin-guclu"
          onChange={(e) => setSaglayici(e.target.value as SaglayiciAdi)}
        >
          {SAGLAYICILAR().map((s) => (
            <option key={s.id} value={s.id}>{s.ad}</option>
          ))}
        </select>
      </label>

      <label className="mb-2 flex items-center gap-2 text-[11px] text-metin-zayif">
        {t('Hedef dil')}
        <select
          data-testid="ceviri-hedef"
          value={hedef}
          disabled={calisiyor}
          className="bg-denetim px-1 py-0.5 text-metin-guclu"
          onChange={(e) => setHedef(e.target.value)}
        >
          {HEDEF_DILLER().map((d) => (
            <option key={d.kod} value={d.kod}>{d.ad}</option>
          ))}
        </select>
      </label>

      <label className="mb-2 block text-[11px] text-metin-zayif">
        {t('API anahtarı')}
        <input
          data-testid="ceviri-anahtar"
          type="password"
          value={anahtar}
          disabled={calisiyor}
          placeholder={saglayici === 'deepl' ? t('DeepL anahtarı (:fx ücretsiz)') : t('Google API anahtarı')}
          className="mt-0.5 w-full bg-denetim px-1 py-0.5 text-metin-guclu"
          onChange={(e) => { setAnahtar(e.target.value); setHata(null); }}
        />
      </label>

      {ilerleme && (
        <p data-testid="ceviri-ilerleme" className="text-[11px] text-metin-govde">
          {ilerleme.biten} / {ilerleme.toplam} {t('satır')}
        </p>
      )}

      {/* Hata METNİYLE gösteriliyor: "çeviri başarısız" demek, kotanın mı
          bittiğini yoksa anahtarın mı yanlış olduğunu gizlerdi. */}
      {hata && (
        <p data-testid="ceviri-hata" className="mt-1 text-[11px] leading-snug text-amber-400">
          {hata}
        </p>
      )}
    </Modal>
  );
}
