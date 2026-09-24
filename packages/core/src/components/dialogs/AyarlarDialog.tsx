import React, { useEffect, useState } from 'react';
import { Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useUiStore } from '../../store/ui';
import { useProjectStore } from '../../store/project';
import { sesAcikMi, sesiAyarla } from '../../ses/daktilo';
import { t } from '../../dil/arayuz';
import type { ArayuzDili } from '../../dil/arayuz';
import { OLCEK_EN_AZ, OLCEK_EN_COK } from '../../format/tercih';
import {
} from '../../format/sayfa-rengi';
import type { NumaraKenari, SureYontemi } from '../../format/senaryo-ayarlari';
import { AMERIKAN_BLOKLAR } from '../../format/profil';
import { presetUygula } from '../../format/preset';
import type { DilAdi } from '../../format/profil';
import type { KagitAdi } from '../../format/izgara';
import { Ikon } from '../Ikon';
import { KisayolTablosu } from './ShortcutsDialog';

/**
 * Ayarlar diyaloğu — uygulamanın BÜTÜN tercihleri, bölümlenmiş.
 *
 * Kullanıcı kararı (2026-08-27): "çoğu kafa karıştırıcı olabilecek ve anlık
 * ulaşmak gerekmeyen ayarları da genel ayarlara taşı." Yazım sekmesinde
 * yalnız YAZARKEN gereken şeyler kaldı (belgenin biçimi, proje sözlüğü);
 * geri kalan her şey buraya taşındı.
 *
 * ## Neden bölüm başlıkları
 *
 * Liste on beş satıra çıktı; başlıksız bir yığın kullanıcıyı aradığını
 * bulamaz hâle getirirdi. Bölümler İŞE göre: "ne yapmak istiyorum"
 * sorusuna göre gruplanmış, ayarın teknik kaynağına göre değil.
 *
 * ## Kapsam AYRIMI korunuyor
 *
 * Başlangıç ayarları yalnız masaüstünde anlamlı (`platform.baslangic`
 * web'de `null`), o yüzden kendi kapısının arkasında. Hepsini tek kapının
 * arkasına koymak tarayıcıda ses ve yazma ayarlarını da yok ederdi.
 */

/**
 * Bölüm — sol listedeki bağlantının kaydırma hedefi.
 *
 * `id` yalnız çapa değil, sol listeyle bağ: liste bu tablodan çiziliyor ve
 * bölüm başlıkları iki yerde ayrı ayrı yazılmıyor (Karar 2).
 */
function Bolum({ id, ad, children }: { id: string; ad: string; children: React.ReactNode }) {
  return (
    <section id={`ayar-${id}`} className="scroll-mt-4 border-t border-kenar-ic pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-metin-zayif">
        {ad}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Açıklamalı onay kutusu — "ne yaptığı" satırı ZORUNLU. */
function Kutu({
  testid, acik, onDegis, etiket, aciklama, uyari,
}: {
  testid: string; acik: boolean; onDegis: (v: boolean) => void;
  etiket: string; aciklama: string; uyari?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-[11px] text-metin-govde">
      <input
        type="checkbox"
        data-testid={testid}
        checked={acik}
        onChange={(e) => onDegis(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        {etiket}
        <span
          className={
            'mt-0.5 block text-[10px] leading-snug '
            + (uyari ? 'text-amber' : 'text-metin-etiket')
          }
        >
          {aciklama}
        </span>
      </span>
    </label>
  );
}

export function AyarlarDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const [otoBaslat, setOtoBaslat] = useState(false);
  const [kucukBasla, setKucukBasla] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ses, setSes] = useState(sesAcikMi);

  const arayuzDili = useUiStore((s) => s.arayuzDili);
  const dilDegistir = useUiStore((s) => s.arayuzDiliniDegistir);
  const akilliDuzeltme = useUiStore((s) => s.akilliDuzeltme);
  const daktiloModu = useUiStore((s) => s.daktiloModu);
  const arayuzOlcegi = useUiStore((s) => s.arayuzOlcegi);
  const kagit = useUiStore((s) => s.scriptPaper);
  const belgeDili = useUiStore((s) => s.scriptLang);
  const numara = useUiStore((s) => s.numaraAyari);
  const sureklilik = useUiStore((s) => s.sayfaSonuSurekliligi);
  const sure = useUiStore((s) => s.sureAyari);
  const kapakKapali = useUiStore((s) => s.kapakKapali);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));

  useEffect(() => {
    if (!platform.baslangic) {
      setYukleniyor(false);
      return;
    }
    platform.baslangic
      .oku()
      .then((ayarlar) => {
        setOtoBaslat(ayarlar.otoBaslat);
        setKucukBasla(ayarlar.kucukBasla);
      })
      .catch((err) => showToast(`${t('Ayarlar okunamadı')}: ${(err as Error).message}`, 'error'))
      .finally(() => setYukleniyor(false));
  }, [platform, showToast]);

  const guncelle = async (yeniOtoBaslat: boolean, yeniKucukBasla: boolean) => {
    setOtoBaslat(yeniOtoBaslat);
    setKucukBasla(yeniKucukBasla);
    try {
      await platform.baslangic?.yaz({ otoBaslat: yeniOtoBaslat, kucukBasla: yeniKucukBasla });
    } catch (err) {
      showToast(`${t('Ayar kaydedilemedi')}: ${(err as Error).message}`, 'error');
    }
  };

  /* Ezilemez alanların gerekçeleri MOTORDAN okunuyor, burada yeniden
     yazılmıyor — iki yerde durursa biri değişince diğeri sessizce eskir.
     Yazım sekmesinden buraya taşındı (kullanıcı kararı): bir kez okunup
     anlaşılan bir bilgi, her yazma oturumunda ekranda yer kaplamamalı. */
  const redSebepleri = presetUygula(AMERIKAN_BLOKLAR.action!, {
    yaziTipi: 'x', punto: 1, satirAraligi: 1,
  }).redler;

  /* Bölüm listesi burada kuruluyor: `t()` çağrısı ve platform kapıları
     bileşenin içinde anlamlı — modül düzeyinde sabit bir dizi, dil
     değişince eskirdi. */
  const BOLUMLER = [
    { id: 'gorunum', ad: t('Görünüm') },
    { id: 'yazma', ad: t('Yazma') },
    { id: 'senaryo', ad: t('Senaryo biçimi') },
    { id: 'olculer', ad: t('Değiştirilemeyen ölçüler') },
    { id: 'kisayollar', ad: t('Klavye kısayolları') },
    { id: 'dosya', ad: t('Dosya türü'), gorunur: Boolean(platform.iliskilendirme) },
    { id: 'baslangic', ad: t('Başlangıç'), gorunur: Boolean(platform.baslangic) },
  ];

  return (
    /* TAM EKRAN PANEL — popup DEĞİL (kullanıcı kararı 2026-08-27:
       "ayarlar ekranı popup değil normal bir panel olucak").

       Modal'dan çıkmanın sebebi ölçü: içerik altı bölüme çıktı ve dar bir
       kutuda her ayar için kaydırmak gerekiyordu. Sol liste, uzun sayfayı
       gezilebilir kılıyor — STARC'ın ayar ekranıyla aynı yapı, kullanıcının
       referans aldığı düzen.

       `fixed inset-0`: kabuğun üstünü tümüyle kaplıyor. Yarı saydam bir
       örtü YOK — bu bir kesinti değil, gidilen bir yer; arkasını göstermek
       "birazdan kapanacak" hissi verirdi. */
    <div
      data-testid="ayarlar-paneli"
      className="fixed inset-0 z-[80] flex flex-col bg-zemin text-metin-guclu"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      role="region"
      aria-label={t('Ayarlar')}
    >
      {/* Başlık çubuğu — geri oku solda, kabuğun kendi araç çubuğuyla
          aynı yükseklikte ki geçiş sıçramasın. */}
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-kenar bg-panel px-4">
        <button
          type="button"
          data-testid="ayarlar-kapat"
          onClick={onClose}
          title={t('Geri')}
          aria-label={t('Geri')}
          className="mzn-denetim flex h-8 w-8 items-center justify-center"
        >
          <Ikon ad="geri" boyut={16} />
        </button>
        <span className="text-[14px] font-medium tracking-wide">{t('Ayarlar')}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sol: bölüm listesi. Uzun sayfada nerede olduğunu bilmek ve
            aradığına tek tıkla gitmek için. */}
        <nav className="w-[220px] shrink-0 overflow-y-auto border-r border-kenar bg-panel px-3 py-4">
          {BOLUMLER.filter((b) => b.gorunur !== false).map((b) => (
            <a
              key={b.id}
              href={`#ayar-${b.id}`}
              data-testid={`ayar-git-${b.id}`}
              className="block px-2 py-1.5 text-[12px] text-metin-zayif transition-colors hover:bg-etkin hover:text-metin"
            >
              {b.ad}
            </a>
          ))}
        </nav>

        {/* Sağ: içerik. Genişlik sınırlı — bir ayar satırı ekranın ucundan
            ucuna uzarsa etiketle denetim arası okunmaz olur. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-[720px] space-y-5">
        <Bolum id="gorunum" ad={t('Görünüm')}>
          <label className="flex items-center gap-2 text-[11px] text-metin-govde">
            {t('Arayüz dili')}
            <select
              data-testid="arayuz-dili"
              value={arayuzDili}
              onChange={(e) => dilDegistir(e.target.value as ArayuzDili)}
              className="bg-denetim px-1 py-0.5"
            >
              <option value="en">English</option>
              <option value="tr">{t('Türkçe')}</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-[11px] text-metin-govde">
            {t('Arayüz ölçeği')}
            <input
              type="range"
              data-testid="arayuz-olcegi"
              min={OLCEK_EN_AZ}
              max={OLCEK_EN_COK}
              step={0.05}
              value={arayuzOlcegi}
              onChange={(e) => useUiStore.setState({ arayuzOlcegi: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="mzn-sayi w-10 text-right text-metin-zayif">
              %{Math.round(arayuzOlcegi * 100)}
            </span>
          </label>
          <p className="-mt-1 text-[10px] leading-snug text-metin-etiket">
            {t('Senaryo sayfası bundan etkilenmez — sayfa sayısı değişmez.')}
          </p>

        </Bolum>

        <Bolum id="yazma" ad={t('Yazma')}>
          <Kutu
            testid="daktilo-sesi"
            acik={ses}
            onDegis={(v) => { setSes(v); sesiAyarla(v); }}
            etiket={t('Daktilo sesi')}
            aciklama={t('Tuşlara basarken mekanik daktilo sesi çıkar.')}
          />
          <Kutu
            testid="daktilo-modu"
            acik={daktiloModu}
            onDegis={(v) => useUiStore.setState({ daktiloModu: v })}
            etiket={t('Daktilo modu')}
            aciklama={t('İmleç ekranın ortasında kalır, yazdığın satır vurgulanır, ötekiler hafifçe söner.')}
          />
          <Kutu
            testid="akilli-duzeltme"
            acik={akilliDuzeltme}
            onDegis={(v) => useUiStore.setState({ akilliDuzeltme: v })}
            etiket={t('Akıllı yazım düzeltmeleri')}
            aciklama={t('Yazarken düzeltir: MErhaba→Merhaba, üç nokta→…, iki tire→—, kıvırcık tırnak, çift boşluk. Hepsi Ctrl+Z ile geri alınır.')}
          />
        </Bolum>

        <Bolum id="senaryo" ad={t('Senaryo biçimi')}>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-metin-govde">
            <label className="flex items-center gap-1">
              {t('Kağıt')}
              <select
                data-testid="kagit-sec"
                value={kagit}
                disabled={!duzenlenebilir}
                onChange={(e) => useUiStore.setState({ scriptPaper: e.target.value as KagitAdi })}
                className="bg-denetim px-1 py-0.5"
              >
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              {t('Belge dili')}
              <select
                data-testid="dil-sec"
                value={belgeDili}
                disabled={!duzenlenebilir}
                onChange={(e) => useUiStore.setState({ scriptLang: e.target.value as DilAdi })}
                className="bg-denetim px-1 py-0.5"
              >
                <option value="tr">{t('Türkçe')}</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <p className="-mt-1 text-[10px] leading-snug text-metin-etiket">
            {t('Belge dili sahne başlığı terimlerini belirler (İÇ./INT.) — arayüz dilinden ayrıdır.')}
          </p>

          <Kutu
            testid="kapak-goster"
            acik={!kapakKapali}
            onDegis={(v) => useUiStore.setState({ kapakKapali: !v })}
            etiket={t('Kapak sayfasını göster')}
            aciklama={t('Senaryonun ilk sayfası olarak düzenlenebilir kapak. Sayfa sayısına girmez.')}
          />

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-metin-govde">
            <label className="flex items-center gap-1">
              {t('Sahne no')}
              <select
                data-testid="sahne-no"
                value={numara.sahne}
                onChange={(e) => useUiStore.setState({
                  numaraAyari: { ...numara, sahne: e.target.value as NumaraKenari },
                })}
                className="bg-denetim px-1 py-0.5"
              >
                <option value="kapali">{t('Kapalı')}</option>
                <option value="sol">{t('Solda')}</option>
                <option value="sag">{t('Sağda')}</option>
                <option value="ikisi">{t('İki yanda')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                data-testid="diyalog-no"
                checked={numara.diyalog}
                onChange={(e) => useUiStore.setState({
                  numaraAyari: { ...numara, diyalog: e.target.checked },
                })}
              />
              {t('Diyalog no')}
            </label>
          </div>
          <p className="-mt-1 text-[10px] leading-snug text-metin-etiket">
            {t('Kenar boşluğunda görünür — sayfa sayısını değiştirmez.')}
          </p>

          <Kutu
            testid="sayfa-sonu-surekliligi"
            acik={sureklilik}
            onDegis={(v) => useUiStore.setState({ sayfaSonuSurekliligi: v })}
            etiket={t('Bölünen diyaloğa (DEVAMI VAR) / (DEVAM) ekle')}
            aciklama={t('DİKKAT: satır eklediği için SAYFA SAYISINI değiştirir.')}
            uyari
          />

          <label className="flex items-center gap-2 text-[11px] text-metin-govde">
            {t('Süre hesabı')}
            <select
              data-testid="sure-yontemi"
              value={sure.yontem}
              onChange={(e) => useUiStore.setState({
                sureAyari: { ...sure, yontem: e.target.value as SureYontemi },
              })}
              className="bg-denetim px-1 py-0.5"
            >
              <option value="sayfa">{t('Sayfa sayısından')}</option>
              <option value="karakter">{t('Harf sayısından')}</option>
              <option value="ozel">{t('Blok başına özel')}</option>
            </select>
          </label>
          <p className="-mt-1 text-[10px] leading-snug text-metin-etiket">
            {sure.yontem === 'sayfa'
              ? t('1 sayfa ≈ 1 dakika — sektör sözleşmesi.')
              : t('Sayfa sayısıyla ilgisi yok — bu modda "1 sayfa ≈ 1 dakika" geçerli değil.')}
          </p>
        </Bolum>

        {/* SABİT ÖLÇÜLER — değiştirilemez ama NEDENİ görünür. Yazım
            sekmesinden buraya taşındı: bir kez okunup anlaşılan bir bilgi,
            her yazma oturumunda sağ panelde yer kaplamamalı. */}
        <Bolum id="olculer" ad={t('Değiştirilemeyen ölçüler')}>
          <ul className="space-y-1">
            {redSebepleri.map((red) => (
              <li key={red.alan} data-testid={`kilit-${red.alan}`} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-[11px] text-metin-zayif">
                  <Ikon ad="kilitli" boyut={12} />
                  {red.alan === 'yaziTipi' ? t('Yazı tipi') : red.alan === 'punto' ? t('Punto') : t('Satır aralığı')}
                </span>
                {/* `t()` ŞART: gerekçe bir VERİ TABLOSUNDAN geliyor
                    (`EZILEMEZ_GEREKCE`), bu satırda Türkçe dizge yok ve
                    kaynak tarayıcısı temiz rapor veriyordu. İngilizce
                    arayüzde üç açıklama da Türkçe basılıyordu — gerçek
                    Electron penceresinde görüldü (2026-08-30). Rol
                    adlarındaki hatanın birebir aynısı. */}
                <span className="pl-4 text-[10px] leading-snug text-metin-etiket">
                  {t(red.sebep)}
                </span>
              </li>
            ))}
          </ul>
        </Bolum>

        {/* KISAYOL TABLOSU — Ayarlar'da da (kullanıcı kararı 2026-08-27).
            Aynı tablo Yardım > Klavye Kısayolları penceresinde de duruyor;
            gövde ORTAK bir bileşen (Karar 2), iki kopya yazılsaydı biri
            eskiyip kullanıcıya iki farklı liste gösterilirdi. Kural şeridi
            burada gizli: pencere zaten uzun ve şerit orada, kendi
            penceresinde okunuyor. */}
        <Bolum id="kisayollar" ad={t('Klavye kısayolları')}>
          <KisayolTablosu kural={false} />
        </Bolum>

        {/* DOSYA İLİŞKİLENDİRMESİ — taşınabilir sürümde `.sbp` dosyalarına
            simge ve çift tıkla açma. Sistem ayarı olduğu için KULLANICI
            İSTEĞİYLE: açılışta sessizce yazmak izinsiz değişiklik olurdu. */}
        {platform.iliskilendirme && (
          <Bolum id="dosya" ad={t('Dosya türü')}>
            <p className="text-[10px] leading-snug text-metin-etiket">
              {t('.sbp dosyalarına Auteur simgesi verir ve çift tıklayınca bu programla açılmalarını sağlar. Yalnız bu kullanıcı için, yönetici yetkisi gerekmez.')}
            </p>
            <Button
              data-testid="dosya-iliskilendir"
              onClick={() => {
                void platform.iliskilendirme!.bagla().then((s) => {
                  showToast(
                    s.ok ? t('.sbp dosyaları artık Auteur ile açılıyor.') : `${t('Yapılamadı')}: ${s.hata ?? ''}`,
                    s.ok ? 'success' : 'error',
                  );
                });
              }}
            >
              {t('.sbp dosyalarını Auteur ile aç')}
            </Button>
          </Bolum>
        )}

        {platform.baslangic && (
          <Bolum id="baslangic" ad={t('Başlangıç')}>
            <Kutu
              testid="oto-baslat"
              acik={otoBaslat}
              onDegis={(v) => void guncelle(v, kucukBasla)}
              etiket={t('PC açılınca otomatik başlat')}
              aciklama={t('Bilgisayar açıldığında Auteur otomatik olarak başlar.')}
            />
            <Kutu
              testid="kucuk-basla"
              acik={kucukBasla}
              onDegis={(v) => void guncelle(otoBaslat, v)}
              etiket={t('Küçültülmüş başla')}
              aciklama={t('Otomatik başladığında pencere görev çubuğunda küçültülmüş açılır.')}
            />
            {yukleniyor && (
              <p className="text-[10px] text-metin-etiket">{t('Yükleniyor…')}</p>
            )}
          </Bolum>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
