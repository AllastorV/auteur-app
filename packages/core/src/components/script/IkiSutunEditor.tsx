import React, { useCallback, useMemo } from 'react';
import { t } from '../../dil/arayuz';
import { sayfaRenkStili } from '../../format/sayfa-rengi';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import * as M from '../../doc/mutations';
import {
  EN_AZ_KELIME_HIZI,
  EN_AZ_OLUK,
  EN_AZ_SUTUN,
  EN_COK_KELIME_HIZI,
  IKI_SUTUN_BLOKLARI,
  girdiSatirlari,
  sayfalaIkiSutun,
  sesKelimeSayisi,
  sureTahmini,
  yerlesim,
  type CiftGirdi,
} from '../../format/iki-sutun';
import { BLOK_ETIKETLERI } from '../../model/script';
import { IZGARA } from '../../format/izgara';
import type { FormatProfili } from '../../format/profil';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { IKI_SUTUN_CSS, SABIT_SAYFA_CSS, sayfaDegiskenleri } from '../../format/ekran';
import { Ikon } from '../Ikon';

/**
 * İKİ SÜTUNLU (FRANSIZ) BELGE EDİTÖRÜ — §6.6.
 *
 * Solda ne GÖRÜYORUZ (aksiyon, geçiş), sağda ne DUYUYORUZ (karakter,
 * parantez, diyalog). Belgesel, reklam, kurumsal film ve TV işlerinin
 * fiilî formatı.
 *
 * ## Presetler AMERİKAN FORMATIN AYNISI
 *
 * Blok tipleri aynı (`ScriptBlockType`); değişen yalnız YERLEŞİM. Preset
 * seçmek girdiyi doğru sütuna taşır — sütun ayrı bir ayar değil, presetin
 * SONUCU. Karakter, parantez ve diyalog Amerikan formattaki gibi AYRI
 * satırlardır:
 *
 *     ALİ
 *       (şaşkın)
 *     Nasıl yani
 *
 * "Ali: nasıl yani" gibi tek satıra sıkıştırmak, üç ayrı bilgiyi
 * (kim / nasıl / ne) tek bir metne gömmek olurdu; ne analiz ayırabilir ne
 * de dışa aktarım.
 *
 * ## Girdiler YAN YANA DEĞİL, KASKAT
 *
 * Her girdi TEK sütunda durur ve bir sonraki girdi, öncekinin bittiği
 * satırdan başlar — hangi sütunda olduğuna bakılmaksızın. Solda dört
 * satırlık bir olay varsa, ardından gelen diyalog sağ sütunda beşinci
 * satırdan başlar; solu boş kalır.
 *
 * Önce yan yana eşleşen "satır çiftleri" olarak kurulmuştu ve YANLIŞTI.
 * Referans örnek (senaryonline.com) satır çifti kurmuyor; bu önceki
 * oturumda ölçülmüş ama sapma "spec lehine" çözülmüştü. Biçimi tanımlayan
 * şey spec metni değil, sektörde basılan belgedir.
 *
 * ## Neden ProseMirror değil
 *
 * Tek sütunlu editör ProseMirror kullanıyor çünkü orada belge AKIŞKAN bir
 * metin: satırlar birbirine dönüşüyor, blok tipi satır başında değişiyor.
 * Burada belge sıralı, bölünmez girdilerden oluşuyor ve her girdinin tek
 * bir metin alanı var.
 *
 * ## Sayfa sınırları GERÇEK
 *
 * `sayfalaIkiSutun`'dan geliyor — ekranda ölçülen bir şeyden değil
 * (Karar 34). PDF de aynı listeyi kullanıyor.
 *
 * ## Süre GÖSTERİLMİYOR
 *
 * §6.6: "Katsayı kalibre edilmeden süre gösterilmez." Kelime sayısı
 * gösteriliyor (o ölçülmüş bir olgu), süre gösterilmiyor.
 */
export function IkiSutunEditor() {
  const doc = useProjectStore((s) => s.doc);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const olcek = useUiStore((s) => s.scriptZoom);
  const { profil } = useSenaryoProfili();

  /* Girdiler DEPODAN okunuyor; depo onları belgeden aynalıyor (yer imleri
     ve sözlükle aynı yol). Bileşen kendi kopyasını tutsaydı ortak
     çalışmada başkasının yazdığı satır ekranda hiç görünmezdi. */
  const girdiler = useProjectStore((s) => s.ciftler);

  const sayfalar = useMemo(() => sayfalaIkiSutun(girdiler, profil), [girdiler, profil]);
  const kelime = useMemo(() => sesKelimeSayisi(girdiler), [girdiler]);
  const kelimeHizi = useUiStore((s) => s.scriptKelimeHizi);
  const sayfaRengi = useUiStore((s) => s.scriptSayfaRengi);
  const degiskenler = useMemo(() => sayfaDegiskenleri(profil, olcek), [profil, olcek]);

  /** Her girdinin kaçıncı sayfada başladığı — sınır çizgisini koymak için. */
  const sayfaBasi = useMemo(() => {
    const harita = new Map<string, number>();
    for (const s of sayfalar) {
      const ilk = s.satirlar[0];
      if (ilk && !harita.has(ilk.ciftId)) harita.set(ilk.ciftId, s.no);
    }
    return harita;
  }, [sayfalar]);

  const ekle = useCallback(
    (tip: CiftGirdi['tip'], at?: number) => {
      const id = `cf_${Math.random().toString(36).slice(2, 10)}`;
      M.ciftEkle(doc, { id, tip, metin: '' } as CiftGirdi, at);
      /* Yeni satırın metin alanına odaklan: eklemek ile yazmaya başlamak
         arasında fare gezintisi olmamalı. */
      queueMicrotask(() => {
        document
          .querySelector<HTMLTextAreaElement>(`[data-cift="${id}"] textarea`)
          ?.focus();
      });
    },
    [doc],
  );

  /* Süre SES sütunundan; sayfa sayısından DEĞİL (§6.6: bu yerleşimde
     sayfa=dakika sözleşmesi geçersiz — görüntü betimi ekranda zaman almaz). */
  const sure = sureTahmini(girdiler, { kelimeHizi });
  const sureMetni = sure === null ? '' : sureBicimle(sure);

  return (
    <div className="flex h-full min-h-0 flex-col bg-sayfa-alani"
      /* Sayfa rengi YALNIZ EKRAN: --mzn-kagit* degiskenleri bu kokte
         ezilir; disa aktarim ve diger pencereler etkilenmez (bkz.
         format/sayfa-rengi.ts). */
      style={sayfaRenkStili(sayfaRengi)}
    >
      {/* Kağıt kuralları TEK SÜTUNLUYLA ORTAK — §6.6'nın "ortak olan"
          listesi: kağıt geometrisi, Courier, ızgara. Üstüne yalnız iki
          sütuna özgü kurallar biniyor. */}
      <style>{[SABIT_SAYFA_CSS, IKI_SUTUN_CSS].join(String.fromCharCode(10))}</style>

      <div
        className="senaryo-yuzey min-h-0 flex-1"
        style={degiskenler as React.CSSProperties}
        data-testid="iki-sutun-yuzey"
      >
        <div className="senaryo-kagit iki-sutun">
          {girdiler.length === 0 ? (
            <Bos duzenlenebilir={duzenlenebilir} onEkle={ekle} />
          ) : (
            girdiler.map((g, i) => (
              <React.Fragment key={g.id}>
                {(sayfaBasi.get(g.id) ?? 1) > 1 && (
                  <div className="iki-sutun-sinir" data-sayfa={sayfaBasi.get(g.id)}>
                    <span>{sayfaBasi.get(g.id)}</span>
                  </div>
                )}
                <Satir
                  girdi={g}
                  sira={i}
                  duzenlenebilir={duzenlenebilir}
                  onEkle={ekle}
                  doc={doc}
                  profil={profil}
                />
              </React.Fragment>
            ))
          )}

          {girdiler.length > 0 && duzenlenebilir && (
            <div className="iki-sutun-kuyruk">
              <EkleDugmeleri onEkle={(t) => ekle(t)} />
            </div>
          )}
        </div>
      </div>

      {/* Alt çubuk — senaryo sayfasınınkiyle aynı dil.

          SÜRE ARTIK VAR: §6.6'nın "katsayı kalibre edilmeden gösterilmez"
          kuralı duruyor ama katsayı 2026-08-26'da kalibre edildi (Türkçe
          profesyonel seslendirme ortalaması 150 kelime/dakika). Kullanıcı
          hızı kapatırsa süre yine GÖSTERİLMİYOR — yanlış süre göstermek hiç
          göstermemekten kötü. */}
      <div className="flex h-[34px] shrink-0 items-center border-t border-kenar bg-panel text-[11px] text-metin-zayif">
        <div className="mzn-sayi flex items-center gap-3 px-3.5">
          <span data-testid="iki-sutun-sayfa">
            <b className="font-normal text-metin-guclu">{sayfalar.length}</b> {t('sayfa')}
          </span>
          <span data-testid="iki-sutun-girdi">
            <b className="font-normal text-metin-guclu">{girdiler.length}</b> girdi
          </span>
          <span data-testid="iki-sutun-kelime">
            <b className="font-normal text-metin-guclu">{kelime}</b> diyalog kelimesi
          </span>
          {sure !== null && (
            <span data-testid="iki-sutun-sure" title={t('Ses sütunundan hesaplandı — sayfa sayısından DEĞİL')}>
              ~<b className="font-normal text-metin-guclu">{sureMetni}</b>
            </span>
          )}
        </div>

        {/* SÜTUN ORANI — ayar, çünkü ölçülecek tek bir doğru yok: iki sütunlu
            AV senaryosunun sütun oranı için yayımlanmış bir standart
            bulunmuyor (§17 kalibrasyon borcu bu bulguyla kapandı). */}
        <label className="ml-4 flex items-center gap-1.5 text-[10px] text-metin-etiket">
          {t('Sütun oranı')}
          <input
            type="range"
            min={EN_AZ_SUTUN}
            max={IZGARA.sutun - EN_AZ_OLUK - EN_AZ_SUTUN}
            step={1}
            data-testid="sutun-orani"
            value={profil.ikiSutun.sol}
            disabled={!duzenlenebilir}
            onChange={(e) => useUiStore.setState({ scriptSolSutun: Number(e.target.value) })}
            className="w-24"
          />
          <span className="mzn-sayi">{profil.ikiSutun.sol}/{profil.ikiSutun.sag}</span>
        </label>

        <label className="ml-3 flex items-center gap-1.5 text-[10px] text-metin-etiket">
          {t('Hız')}
          <input
            type="number"
            min={EN_AZ_KELIME_HIZI}
            max={EN_COK_KELIME_HIZI}
            data-testid="kelime-hizi"
            value={kelimeHizi ?? ''}
            placeholder={t('kapalı')}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value);
              useUiStore.setState({ scriptKelimeHizi: v });
            }}
            className="mzn-sayi w-14 bg-denetim px-1 py-0.5 text-[10px] outline-none"
          />
          kel/dk
        </label>

        <span className="ml-auto px-3.5 text-metin-cok-zayif">
          {t('Fransız (iki sütun) — sayfa süreyi ölçmez')}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- satır ------------------------------- */

/** Saniyeyi "3 dk 20 sn" biçiminde yazar; bir dakikanın altı yalnız saniye. */
function sureBicimle(saniye: number): string {
  const tam = Math.round(saniye);
  if (tam < 60) return `${tam} sn`;
  const dk = Math.floor(tam / 60);
  const sn = tam % 60;
  return sn === 0 ? `${dk} dk` : `${dk} dk ${sn} sn`;
}

function Satir({
  girdi, sira, duzenlenebilir, onEkle, doc, profil,
}: {
  girdi: CiftGirdi;
  sira: number;
  duzenlenebilir: boolean;
  onEkle: (tip: CiftGirdi['tip'], at?: number) => void;
  doc: Parameters<typeof M.ciftGuncelle>[0];
  profil: FormatProfili;
}) {
  const yaz = (v: string) => M.ciftGuncelle(doc, girdi.id, v);
  /* Yükseklik SAYFALAYICIDAN geliyor, ayrı bir tahminden değil.
     ÖLÇÜLDÜ: kendi sarmalama tahminimi kullanınca ekranda girdiler arası
     boşluk bir satır yerine üç satır görünüyordu. Tek kaynak (Karar 2). */
  const satirSayisi = girdiSatirlari(girdi, profil).length;

  /* Sütun, girinti ve biçim TABLODAN. Sahne başlığı için ayrı bir dal
     VARDI ve hatalıydı: dal eski `'sahne'` adını arıyordu, tip ise artık
     `'scene'` — başlık sessizce sağ sütuna düşüyordu. Blok adına göre
     dallanmak yerine tabloya sormak bu hata sınıfını tümden kapatıyor. */
  const y = yerlesim(girdi.tip);
  const tam = y.sutun === 'tam';
  const solda = y.sutun === 'sol';
  /* Bölünme PROFİLDEN, modül sabitinden değil (§6.6 kalibrasyon borcu):
     kullanıcı oranı değiştirdiğinde editör, sayfalayıcı ve PDF aynı sayıyı
     görmeli. */
  const b = profil.ikiSutun;
  const sutunGenislik = tam ? IZGARA.sutun : (solda ? b.sol : b.sag);
  const sutunBasi = tam || solda ? 0 : b.sol + b.oluk;

  return (
    <div className="iki-sutun-satir" data-cift={girdi.id} data-tip={girdi.tip}>
      <Hucre
        deger={girdi.metin}
        yerTutucu={YER_TUTUCU()[girdi.tip] ?? ''}
        sutun={sutunGenislik - y.girinti}
        kaydir={sutunBasi + y.girinti}
        buyukHarf={y.buyukHarf}
        sagaYasli={y.hiza === 'sag'}
        duzenlenebilir={duzenlenebilir}
        onDegis={yaz}
        sinif={`iki-sutun-hucre iki-sutun-${girdi.tip}`}
        satirSayisi={satirSayisi}
      />
      <Eylemler sira={sira} duzenlenebilir={duzenlenebilir} onEkle={onEkle} doc={doc} girdi={girdi} />
    </div>
  );
}

/**
 * Tek metin alanı.
 *
 * Yüksekliği İÇERİĞE göre büyüyor ama satır yüksekliği kağıdın ızgarasına
 * bağlı (`--satir`): girdi kaç satır sürüyorsa sayfalayıcı da o kadar
 * sayıyor. Serbest bir `line-height` kullansaydık ekran ile PDF ıraksardı.
 */
function Hucre({
  deger, yerTutucu, sutun, duzenlenebilir, onDegis, sinif, buyukHarf,
  kaydir = 0, satirSayisi, sagaYasli,
}: {
  deger: string;
  yerTutucu: string;
  sutun: number;
  duzenlenebilir: boolean;
  onDegis: (v: string) => void;
  sinif: string;
  buyukHarf?: boolean;
  /** Sol kenardan kaç karakter içeride başlasın (sağ sütun için). */
  kaydir?: number;
  /** Sayfalayıcının bu girdi için saydığı satır sayısı. */
  satirSayisi: number;
  /** Geçiş bloğu sütunun içinde sağa yaslanır. */
  sagaYasli?: boolean;
}) {
  return (
    <textarea
      value={deger}
      readOnly={!duzenlenebilir}
      placeholder={yerTutucu}
      spellCheck={false}
      onChange={(e) => onDegis(buyukHarf ? e.target.value.toLocaleUpperCase('tr') : e.target.value)}
      className={sinif}
      style={{
        /* Genişlik IZGARADAN türetiliyor, `ch` biriminden değil.
           ÖLÇÜLDÜ: `28ch` ile sayfalayıcının saydığı 28 sütun aynı şey
           değil — yazı tipinin ilerlemesi ızgara hücresinden dar olduğu
           için tarayıcı satıra daha çok karakter sığdırıyor ve metin
           sayfalayıcıdan bir satır AZ görünüyordu; fark her girdide
           birikip aralardaki boşluğu üç satıra çıkarıyordu.
           Metin kutusunun tamamı 60 sütun; bu hücre onun `sutun/60`'ı. */
        width: `calc(${sutun} / ${IZGARA.sutun} * 100%)`,
        marginLeft: `calc(${kaydir} / ${IZGARA.sutun} * 100%)`,
        /* En AZ sayfalayıcının saydığı kadar; içerik daha uzunsa
           `field-sizing:content` büyütüyor ve hiçbir satır kırpılmıyor. */
        minHeight: `calc(${satirSayisi} * var(--satir))`,
        textAlign: sagaYasli ? 'right' : undefined,
      }}
    />
  );
}

function Eylemler({
  sira, duzenlenebilir, onEkle, doc, girdi,
}: {
  sira: number;
  duzenlenebilir: boolean;
  onEkle: (tip: CiftGirdi['tip'], at?: number) => void;
  doc: Parameters<typeof M.ciftSil>[0];
  girdi: CiftGirdi;
}) {
  if (!duzenlenebilir) return null;
  return (
    /* Eylemler ÜZERİNE GELİNCE — kartlarda olduğu gibi. Yüz girdilik bir
       belgede her satırda dört düğme, bakılacak yeri metin olmaktan
       çıkarırdı. Klavyeyle gezene `focus-within` ile görünüyor. */
    <span className="iki-sutun-eylem">
      <button type="button" title={t('Alta olay ekle')} onClick={() => onEkle('olay', sira + 1)}>
        <Ikon ad="arti" boyut={11} />
      </button>
      <button type="button" title={t('Alta diyalog ekle')} onClick={() => onEkle('diyalog', sira + 1)}>
        <Ikon ad="metin" boyut={11} />
      </button>
      {/* PRESET — sütunu bu belirliyor. Ayrı bir "sağa taşı" düğmesi
          olsaydı sütun ile preset ayrışabilir, "sağ sütunda duran bir
          aksiyon" gibi tutarsız bir durum çıkardı. */}
      <select
        aria-label={t('Blok preseti')}
        data-testid={`preset-${girdi.id}`}
        value={girdi.tip}
        onChange={(e) => M.ciftTipiDegistir(doc, girdi.id, e.target.value)}
        className="iki-sutun-preset"
      >
        {IKI_SUTUN_BLOKLARI.map((b) => (
          <option key={b} value={b} style={{ background: 'white', color: '#111827' }}>{t(BLOK_ETIKETLERI[b])}</option>
        ))}
      </select>
      <button type="button" title={t('Bu satırı sil')} data-yikici onClick={() => M.ciftSil(doc, girdi.id)}>
        <Ikon ad="kapat" boyut={11} />
      </button>
    </span>
  );
}

function EkleDugmeleri({ onEkle }: { onEkle: (t: CiftGirdi['tip']) => void }) {
  /* Ekleme düğmeleri EN SIK üç preset. Altısını birden koymak, boş bir
     belgeye bakan kullanıcıya altı seçenekli bir sınav vermek olurdu;
     eklendikten sonra her satırın kendi preset seçicisi var. */
  const HIZLI = ['action', 'dialogue', 'scene'] as const;
  return (
    <>
      {HIZLI.map((b) => (
        <button
          key={b}
          type="button"
          data-testid={`ekle-${b}`}
          onClick={() => onEkle(b)}
          className="mzn-denetim px-2.5 py-1 text-[11px]"
        >
          {BLOK_ETIKETLERI[b]}
        </button>
      ))}
    </>
  );
}

/** Her presetin yer tutucusu — boş satır ne beklediğini söylesin. */
/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye; gerekçenin
   tamamı `i18n-kapsam.test.ts`teki `donmusCeviriler` başlığında. */
const YER_TUTUCU = (): Record<string, string> => ({
  scene: t('İÇ - MEKÂN - GÜN'),
  action: t('Ne görüyoruz?'),
  character: t('KİM KONUŞUYOR'),
  parenthetical: t('(nasıl)'),
  dialogue: t('Ne söylüyor?'),
  transition: 'KESME',
});

/**
 * Boş belge.
 *
 * Akışın nasıl işlediği burada bir kez ANLATILIYOR: format bu programda yeni
 * ve "bir sonraki satır öncekinin bittiği yerden başlar" kuralını bilmeyen
 * biri boş bir sayfaya bakıp ne yazacağını bilemezdi.
 */
function Bos({
  duzenlenebilir, onEkle,
}: { duzenlenebilir: boolean; onEkle: (t: CiftGirdi['tip']) => void }) {
  return (
    <div data-testid="iki-sutun-bos" className="iki-sutun-bos">
      <p>
        <b>{t('Solda ne görüyoruz, sağda ne duyuyoruz.')}</b>{' '}
        {t('Presetler Amerikan formatın aynısı; hangi sütuna düşeceğini preset belirler — aksiyon ve geçiş sola, karakter/parantez/diyalog sağa.')}
      </p>
      <p>
        {t('Girdiler tek bir akışta iner: bir sonraki satır, öncekinin bittiği yerden başlar. Solda dört satırlık bir olay varsa ardından gelen diyalog sağda beşinci satırdan başlar.')}
      </p>
      {duzenlenebilir && (
        <div className="iki-sutun-bos-eylem">
          <EkleDugmeleri onEkle={onEkle} />
        </div>
      )}
    </div>
  );
}
