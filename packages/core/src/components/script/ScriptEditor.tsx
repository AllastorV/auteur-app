import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sureHesapla } from '../../format/senaryo-ayarlari';
import { KapakSayfasi } from './KapakSayfasi';
import { t } from '../../dil/arayuz';
import { sayfaRenkStili } from '../../format/sayfa-rengi';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useProjectStore } from '../../store/project';
import { useCollabStore } from '../../store/collab';
import { kisitliOlcek, useUiStore } from '../../store/ui';
import { revizyonIsaretleriMap, revizyonlarArray } from '../../doc/schema';
import { REVIZYON_TAZELE } from '../../editor/revizyon-eklenti';
import { senaryoSemasi } from '../../editor/sema';
import { senaryoEklentileri } from '../../editor/bag';
import { NUMARA_TAZELE } from '../../editor/numara-eklenti';
import { gorunumuBagla, senaryoBlogunaGit } from '../../editor/gorunum';
import { sayfaDurumu, secimSayaclari, type SayfaDurumu } from '../../editor/sayfa';
import * as M from '../../doc/mutations';
import { imiDuzelt } from '../../model/yerimi';
import { Ikon } from '../Ikon';
import { OneriListesi } from './OneriListesi';

import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import {
  SABIT_SAYFA_CSS,
  blokSatirOfsetleri,
  sureklilikSatirlari,
  blokKurallari,
  sayfaDegiskenleri,
} from '../../format';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { isaretliSayfaNumaralari, RENK_ZEMINI } from '../../model/revizyon';

/**
 * Düzenlenebilir senaryo sayfası (F1b-3).
 *
 * Sayfa geometrisi `format/ekran` tarafından üretilir; bu bileşen yalnızca
 * yerleştirir. Sayfa sayısı ve sınır konumları MOTORDAN gelir — burada
 * `offsetTop` okunmaz, yükseklik ölçülmez (Karar 34).
 */
/* Şerit AYRI YÜKLENİYOR. `PanelThumbnail` üzerinden Konva'ya bağlı ve Konva
   node ortamında `canvas` paketini şart koşuyor: doğrudan içe aktarmak,
   şeridi hiç açmayan senaryo sayfasını çizim motoruna bağımlı kılardı.
   Kapalıyken hiç istenmiyor, açıldığında bir kez geliyor. */
const PlanSeridi = React.lazy(() =>
  import('./PlanSeridi').then((m) => ({ default: m.PlanSeridi })),
);

export function ScriptEditor() {
  const doc = useProjectStore((s) => s.doc);
  const editable = useProjectStore((s) => s.allowed('edit'));
  const yerImleri = useProjectStore((s) => s.yerImleri);
  const proje = useProjectStore((s) => s.project);
  const projeAdi = proje.meta.name;
  const aktifTip =
    dokumanTipi(useProjectStore((s) => s.project.meta.dokumanTipi)) ?? DOKUMAN_TIPLERI.senaryo;
  const olcek = useUiStore((s) => s.scriptZoom);
  const kagit = useUiStore((s) => s.scriptPaper);
  const dil = useUiStore((s) => s.scriptLang);
  const odak = useUiStore((s) => s.odakModu);
  const sayfaRengi = useUiStore((s) => s.scriptSayfaRengi);
  const daktilo = useUiStore((s) => s.daktiloModu);
  const sureAyari = useUiStore((s) => s.sureAyari);
  const numaraAyari = useUiStore((s) => s.numaraAyari);
  const seritAcik = useUiStore((s) => s.planSeridi);
  const planSayisi = useProjectStore((s) => s.project.panels.length);
  const presetler = useUiStore((s) => s.scriptPresetler);
  /* Ortak çalışma görsel katmanının kaynağı. Oturum yokken `null` ve editör
     hiçbir imleç eklentisi kurmuyor — tek yazıcı hiçbir bedel ödemiyor. */
  const awareness = useCollabStore((s) => s.awareness);

  const yer = useRef<HTMLDivElement>(null);
  const gorunum = useRef<EditorView | null>(null);
  /* Rol referanstan okunur: `editable` prop'u kapanışa yakalanırsa rol
     değiştiğinde görünüm yeniden kurulmadan eski değeri taşır. */
  const editableRef = useRef(editable);
  editableRef.current = editable;
  /* Görünüme EN SON uygulanan rol. Rol effect'inin mount'ta boşuna koşmasını
     engeller — koşarsa kurucudaki kapıyı maskeler ve kapının kaldırılması
     hiçbir testi kırmaz (ölçüldü: mutant hayatta kalıyordu). Kapı tek
     yerden gelmeli ki sökülmesi görünür olsun. */
  const uygulanan = useRef<boolean | null>(null);

  const [durum, setDurum] = useState<SayfaDurumu | null>(null);
  const [aktifGorunum, setAktifGorunum] = useState<EditorView | null>(null);
  const [secim, setSecim] = useState<{ kelime: number; karakter: number } | null>(null);

  /* Profil `useSenaryoProfili`'den: presetler oraya giriyor ve sayfalama,
     girintiler, sayaçlar hepsi AYNI profil nesnesinden besleniyor. Burada
     ayrıca kurulsaydı dışa aktarımla ıraksardı — bir kez ıraksadı. */
  const { profil } = useSenaryoProfili();
  const profilRef = useRef(profil);
  profilRef.current = profil;

  /* Doküman tipi de referanstan: kurucu effect yalnız `doc`'a bağlı ve
     buradaki değeri kapanışa yakalarsa tip değişiminden sonra eskisini
     taşırdı. Tazelemeyi profil effect'i yapıyor. */
  const tipRef = useRef(aktifTip);
  tipRef.current = aktifTip;

  /* Awareness da referanstan: kurucu effect yalnız `doc`'a bağlı. Oturuma
     sonradan katılma durumunu aşağıdaki tazeleme effect'i kapsıyor. */
  const awarenessRef = useRef(awareness);
  awarenessRef.current = awareness;

  const arayuzOlcegi = useUiStore((s) => s.arayuzOlcegi);
  /** Sağ tıklanan yer imi ve menünün ekran konumu. */
  const [imMenu, setImMenu] = React.useState<
    { blockId: string; x: number; y: number } | null
  >(null);
  const degiskenler = useMemo(() => ({
    ...sayfaDegiskenleri(profil, olcek),
    /* Kesikli sayfa başı çizgisinin etiketi CSS `content`inden geliyor ve
       `SABIT_SAYFA_CSS` sabit bir dizgi — `t()` oraya giremez. Değişken
       olarak buradan besleniyor; tırnaklar CSS'in istediği için elle. */
    '--elle-sayfa-etiket': `"${t('SAYFA BAŞI')}"`,
  }), [profil, olcek]);
  const css = useMemo(() => SABIT_SAYFA_CSS + '\n' + blokKurallari(profil), [profil]);

  useEffect(() => {
    if (!yer.current) return;
    const baslangicBlogu = useUiStore.getState().scriptCursor;
    const { undo, redo } = useProjectStore.getState();
    const view = new EditorView(yer.current, {
      state: EditorState.create({
        schema: senaryoSemasi,
        plugins: senaryoEklentileri(doc, profilRef.current, { undo, redo }, tipRef.current, awarenessRef.current),
      }),
      editable: () => editableRef.current,
      /* `lang` MOTORDAN geliyor, belgeden değil. `text-transform: uppercase`
         çevrimi belgenin `lang`'ine göre yapar ve o `<html lang="tr">` ile
         sabitti; motor ise `profil.dil`'i kullanıyor. `scriptLang` seçilebilir
         olduğu an ikisi ayrışırdı: editör `İNT. KITCHEN`, PDF `INT. KITCHEN`.
         Aynı kural, tek dil kaynağı (Karar 2). */
      attributes: {
        class: 'senaryo-metin',
        'data-testid': 'senaryo-metin',
        lang: profilRef.current.dil,
      },
      /* `this` KULLANILIR, kapanıştaki `view` DEĞİL: `ySyncPlugin` daha
         kurucu dönmeden ilk işlemi gönderiyor ve o anda `view` henüz
         atanmamış oluyor (ölçüldü: "Cannot access 'view' before
         initialization"). ProseMirror bu prop'u görünüme bağlı çağırır. */
      dispatchTransaction(this: EditorView, tr) {
        /* YOK EDİLMİŞ GÖRÜNÜME İŞLEM GELEBİLİR ve gelirse çöker.
           `y-prosemirror` 1.3.7 awareness değişimini bir `setTimeout(0)`
           içinde gönderiyor (`lib.js` · `updateMetas`) ve oradaki koruma
           `binding.isDestroyed` alanına bakıyor — o alan bu sürümde HİÇ
           TANIMLANMAMIŞ, yani koruma her zaman geçiyor. Sonuç: bir ortak
           çalışan yazarken editör kapanırsa (mod değişimi, proje kapatma,
           odadan çıkma) sıradaki tur `docView` null iken çiziyor ve
           "Cannot read properties of null" atıyor. Paketi düzeltemeyiz;
           kapıyı kendi gönderme yolumuza koyuyoruz. */
        if (this.isDestroyed) return;
        const sonraki = this.state.apply(tr);
        this.updateState(sonraki);
        setDurum(sayfaDurumu(sonraki) ?? null);
        setSecim(secimSayaclari(sonraki));
        /* Öneri listesi ProseMirror'ın durumundan besleniyor; kendi
           döngüsünü kurmak iki ayrı doğruluk kaynağı üretirdi. */
        this.dom.dispatchEvent(new CustomEvent('mizansen-guncelle'));

        /* İMLEÇ KONUMU MAĞAZAYA YAZILIYOR.
           `scriptCursor` yalnız GEZGİNDEN ve mod geçişinden yazılıyordu;
           editörde imleç hareket edince güncellenmiyordu. Ölçüldü: araç
           çubuğundaki preset listesi imleçteki satırın tipini göstermiyor,
           ve sağ tık menüsü imleçteki satırı bulamıyordu. İki ayrı arayüz
           aynı eksik bilgiden besleniyordu. */
        const imlec = sonraki.selection.from;
        let blokId: string | null = null;
        /* Seçimin DOKUNDUĞU bütün bloklar: revizyon işareti bir SEÇİME
           uygulanıyor, tek satıra değil. İmleç tek bloktaysa liste tek
           elemanlı kalıyor, yani ayrı bir "tek satır" yolu gerekmiyor. */
        const secililer: string[] = [];
        const { from, to } = sonraki.selection;
        sonraki.doc.forEach((dugum, ofset) => {
          if (ofset <= imlec && imlec <= ofset + dugum.nodeSize) {
            blokId = typeof dugum.attrs.id === 'string' ? dugum.attrs.id : null;
          }
          const id = dugum.attrs.id;
          if (typeof id === 'string' && ofset < to && from < ofset + dugum.nodeSize) {
            secililer.push(id);
          }
        });
        const oncekiSecim = useUiStore.getState().scriptSecili;
        /* Dizi kimliği HER işlemde değişirdi; içerik aynıysa yazmıyoruz —
           yoksa her ok tuşu bütün aboneleri yeniden çizerdi. */
        if (
          oncekiSecim.length !== secililer.length ||
          secililer.some((id, i) => oncekiSecim[i] !== id)
        ) {
          useUiStore.setState({ scriptSecili: secililer });
        }
        if (blokId && useUiStore.getState().scriptCursor !== blokId) {
          /* Seçim TEMİZLENMİYOR: kullanıcı gezginde birkaç satır seçip
             editöre dönebilir ve o seçim onun kararıdır. */
          useUiStore.setState({ scriptCursor: blokId });
        }
      },
    });
    gorunum.current = view;
    /* Kabuk (araç çubuğu) blok presetini buradan uyguluyor. Çözme kurucunun
       kendi temizliğinde: iki editör asla aynı anda bağlı kalmasın. */
    gorunumuBagla(view);
    setAktifGorunum(view);

    /* İMLEÇ HEMEN GELİYOR (kullanıcı bildirimi 2026-08-26: "ilk başta
       yazılıp yazılmadığını bile anlamadım, imleç çok geç geldi ekrana").

       Yazma programının açılışta yapması gereken tek şey yazmaya hazır
       olmak. Odak verilmezse kullanıcı önce kağıda tıklamak zorunda ve
       tıklayana kadar yazdığı her tuş kısayol olarak yorumlanıyor — dün
       kapattığımız "tuşlar pencereye düşüyor" hatasının kalan yarısı bu.

       `editable` kapalıyken (izleyici rolü) odak VERİLMİYOR: salt okur bir
       kullanıcıya yanıp sönen imleç göstermek yazabileceğini söylemek olur. */
    if (editableRef.current) {
      /* `requestAnimationFrame`: ProseMirror daha ilk boyamayı yapmadan
         `focus()` çağrılırsa Chromium odağı sessizce düşürüyor (ölçüldü). */
      requestAnimationFrame(() => {
        if (gorunum.current !== view) return;
        if (baslangicBlogu && senaryoBlogunaGit(baslangicBlogu)) return;
        if (view.hasFocus()) return;
        view.focus();
        /* İmleç ilk bloğun İÇİNE konuyor. Yalnız `focus()` çağrılırsa yeni
           bir belgede imleç 0 konumunda kalıyor (ölçüldü) — orası hiçbir
           bloğun içi değil ve blok tipi komutları hedef bulamıyor. */
        const bas = TextSelection.atStart(view.state.doc);
        if (!view.state.selection.eq(bas)) view.dispatch(view.state.tr.setSelection(bas));
      });
    }
    uygulanan.current = editableRef.current;
    setDurum(sayfaDurumu(view.state) ?? null);
    setSecim(secimSayaclari(view.state));
    return () => {
      gorunumuBagla(null);
      setAktifGorunum(null);
      view.destroy();
      gorunum.current = null;
      uygulanan.current = null;
    };
    /* Belge değişince (dosya açma, odaya katılma) bağ baştan kurulur.
       PROFİL BU LİSTEDE DEĞİL: kağıt değiştirmek görünümü yeniden kurarsa
       imleç ve kaydırma konumu düşer. Profil değişimi ayrı effect'te
       eklentiyi tazeler. */
  }, [doc]);

  /* REVİZYON İŞARETİ TAZELEMESİ.

     İşaretler belgede değil, `revizyonIsaretleri` kökünde yaşıyor: bir satır
     işaretlendiğinde ProseMirror belgesi DEĞİŞMİYOR ve dekorasyon eklentisi
     hiç yeniden hesaplamıyor. Kökü gözleyip boş bir işlem göndermek şart.

     Y haritası gözleniyor, store değil: ORTAK ÇALIŞANIN koyduğu işaret de
     böylece anında görünüyor. Store'a bağlansaydı yalnız kendi
     işaretlerimiz tazelenirdi. */
  useEffect(() => {
    const harita = revizyonIsaretleriMap(doc);
    const dizi = revizyonlarArray(doc);
    const tazele = () => {
      const view = gorunum.current;
      if (view) view.dispatch(view.state.tr.setMeta(REVIZYON_TAZELE, true));
    };
    harita.observe(tazele);
    /* Revizyon listesi de gözleniyor: yeni revizyon yayınlamak ETKİN
       revizyonu değiştiriyor, yani eski işaretlerin rengi ve görünürlüğü
       değişiyor. */
    dizi.observe(tazele);
    return () => {
      harita.unobserve(tazele);
      dizi.unobserve(tazele);
    };
  }, [doc]);

  useEffect(() => {
    const view = gorunum.current;
    if (view) view.dispatch(view.state.tr.setMeta(NUMARA_TAZELE, true));
  }, [doc, numaraAyari]);

  /* Rol değişimi görünümü yeniden kurmaz — yalnız düzenlenebilirliği tazeler. */
  useEffect(() => {
    if (uygulanan.current === editable) return;
    uygulanan.current = editable;
    gorunum.current?.setProps({ editable: () => editableRef.current });
  }, [editable]);

  /* Format ekseni değişince (kağıt/dil) sayfalama YENİDEN kurulmalı: sayfa
     sayısı kağıda bağlıdır ve eklenti profili kapanışta tutar. Belge ve imleç
     korunur — yalnız eklentiler değişir. */
  useEffect(() => {
    const view = gorunum.current;
    if (!view) return;
    const { undo, redo } = useProjectStore.getState();
    const sonraki = view.state.reconfigure({
      plugins: senaryoEklentileri(doc, profil, { undo, redo }, aktifTip, awareness),
    });
    view.updateState(sonraki);
    setDurum(sayfaDurumu(sonraki) ?? null);
    /* `aktifTip` DEPS'TE: doküman tipi değişince kısayol numaraları yeni blok
       sırasına göre yeniden bağlanmalı. `dokumanTipi` modül sabitini döndürüyor,
       yani kimliği kararlı — effect boşuna koşmuyor.

       `awareness` DE DEPS'TE: odaya katılmak görünümü yeniden kurmadan
       imleç katmanını açmalı. Kurucuya bırakılsaydı katılma anında editör
       yeniden yaratılır, imleç ve kaydırma konumu düşerdi. */
  }, [profil, doc, aktifTip, awareness]);

  const yakinlastir = useCallback((fark: number) => {
    useUiStore.setState((s) => ({ scriptZoom: kisitliOlcek(s.scriptZoom + fark) }));
  }, []);

  const tekerlek = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    yakinlastir(e.deltaY < 0 ? 0.1 : -0.1);
  }, [yakinlastir]);

  const tus = useCallback((e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '0') { e.preventDefault(); useUiStore.setState({ scriptZoom: 1 }); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); yakinlastir(0.1); }
    else if (e.key === '-') { e.preventDefault(); yakinlastir(-0.1); }
  }, [yakinlastir]);

  const sayac = durum?.sayaclar;

  /* SÜRE — üç yöntem, tek seçim (STARC paketi). `sayfa` yönteminde sayfa
     sayısı `sayfala`dan geliyor (Karar 34, ikinci formül yok); öteki iki
     yöntem sayfadan bağımsız ve orada "1 sayfa ≈ 1 dakika" sözleşmesi
     GEÇERLİ DEĞİL — başlıkta kullanıcıya bu söyleniyor, yoksa aynı
     senaryonun iki farklı süresini görüp hangisine güveneceğini bilemezdi. */
  const bloklar = useProjectStore((st) => st.project.script?.blocks);
  const sureDakika = useMemo(() => {
    const saniye = sureHesapla(bloklar ?? [], sayac?.sayfa ?? 0, sureAyari);
    return Math.max(0, Math.round(saniye / 60));
  }, [bloklar, sayac?.sayfa, sureAyari]);
  const sureBaslik = sureAyari.yontem === 'sayfa'
    ? t('Sayfa sayısından hesaplandı')
    : sureAyari.yontem === 'karakter'
      ? t('Harf sayısından hesaplandı — sayfa sayısıyla ilgisi yok')
      : t('Blok başına özel kurallarla hesaplandı — sayfa sayısıyla ilgisi yok');

  /* İşaretler `sayfalar`dan türetiliyor, DOM'dan ölçülmüyor. Bayat im
     (silinmiş bloğa ait) ofset bulamadığı için doğal olarak süzülüyor —
     `siraliImler`'in okuma anındaki süzmesiyle aynı kural, ikinci bir
     silme mantığı yok. */
  const imIsaretleri = useMemo(() => {
    if (!durum) return [];
    const ofsetler = blokSatirOfsetleri(durum.sayfalar, profil.satirSayisi);
    return Object.entries(yerImleri)
      .map(([blockId, ham]) => ({ blockId, ...imiDuzelt(ham), ofset: ofsetler.get(blockId) }))
      .filter((i): i is typeof i & { ofset: number } => i.ofset !== undefined);
  }, [durum, yerImleri]);
  const etkinRevizyon = M.etkinRevizyon(doc);
  const isaretliSayfaNo = useMemo(() => etkinRevizyon && durum
    ? isaretliSayfaNumaralari(
        durum.sayfalar, M.revizyonIsaretleriniOku(doc), etkinRevizyon.id,
      )
    : new Set<number>(), [doc, durum, proje]);

  return (
    <div
      className={'flex h-full min-h-0 flex-col ' + (odak ? 'bg-transparent' : 'bg-sayfa-alani')}
      /* Sayfa rengi YALNIZ EKRAN: --mzn-kagit* degiskenleri bu kokte
         ezilir; disa aktarim ve diger pencereler etkilenmez (bkz.
         format/sayfa-rengi.ts). */
      /* Revizyon kâğıdı açık renktir. Koyu ekran paletindeki beyaz yazı
         işaretli sayfada kaybolmasın; prova görünümünde normal kâğıda dön. */
      style={sayfaRenkStili(isaretliSayfaNo.size ? 'beyaz' : sayfaRengi)}
      onKeyDown={tus}
    >
      <style>{css}</style>
      <div
        className="senaryo-yuzey min-h-0 flex-1"
        data-odak={odak ? 'acik' : 'kapali'}
        data-daktilo={daktilo ? 'acik' : 'kapali'}
        /* KARŞI-ZOOM: kabuk kökü `zoom: arayuzOlcegi` uyguluyor
           (`Studio`). Kâğıt ondan MUAF olmak zorunda — geometrisi
           milimetre ve "arayüz ölçeği sayfa sayısını değiştirmez" sözü
           ayarın altında yazılı. Kâğıdın kendi yakınlaştırması ayrı
           (`olcek`) ve kullanıcıya ait. */
        style={arayuzOlcegi === 1
          ? (degiskenler as React.CSSProperties)
          : { ...(degiskenler as React.CSSProperties), zoom: 1 / arayuzOlcegi }}
        onWheel={tekerlek}
      >
        <KapakSayfasi />
        {/* KÂĞIT HER ZAMAN TAM SAYFA KATI.
            Yükseklik içeriğe göre büyüyordu: yarım dolu ikinci sayfa
            ekranda "çeyrek köşe" gibi duruyor, yazdıkça uzuyordu
            (kullanıcı bildirimi 2026-08-30). Sayfa SAYISI sayfalayıcıdan
            geliyor (Karar 34) — burada ayrıca hesaplanmıyor. */}
        <div
          className="senaryo-kagit"
          style={{
            minHeight: `calc(var(--sayfa-yukseklik) * ${Math.max(1, durum?.sayfalar.length ?? 1)})`,
          }}
        >
          {etkinRevizyon && [...isaretliSayfaNo].map((no) => (
            <div
              key={no}
              aria-hidden
              data-revizyon-sayfa={no}
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: `calc(${no - 1} * var(--sayfa-yukseklik))`,
                height: 'var(--sayfa-yukseklik)',
                backgroundColor: `rgb(${RENK_ZEMINI[etkinRevizyon.renk]
                  .map((kanal) => Math.round(kanal * 255)).join(',')})`,
              }}
            />
          ))}
          {/* Sayfa üstbilgisi — kağıdın kendi dilinde; kabuğa ait değil.

              SAYFA NUMARASI BURADA YAZMIYOR ve bu iki sebeple doğru:

              1. Kağıt TEK bir sürekli yüzey (sayfalar sınır çizgileriyle
                 ayrılıyor), yani üstbilgi yalnız BİRİNCİ sayfanın tepesinde
                 duruyor. Oraya yazılan sayı imlecin bulunduğu sayfaydı ve
                 kullanıcı bunu gerçek pencerede yakaladı: birinci sayfa da
                 ikinci sayfa da "2" gösteriyordu.
              2. Sektörde BİRİNCİ SAYFAYA numara yazılmaz. Yani doğru sayı
                 hiç yazmamaktır.

              Sayfa numaraları sınır işaretlerinde duruyor (aşağıda) ve
              basılan PDF'te her sayfanın kendi numarası var. */}
          <div className="senaryo-ustbilgi" aria-hidden>
            <span>{projeAdi}</span>
          </div>
          {/* SÜREKLİLİK SATIRLARI — sayfalayıcının ürettiği, belgede
              OLMAYAN metin. Ayar kapalıyken hiç üretilmiyorlar, yani bu
              katman boş kalıyor ve bedeli yok. Açıkken PDF'te yazan şey
              ekranda da yazıyor; öncesinde orada yalnız boşluk vardı. */}
          <div className="senaryo-sinirlar" aria-hidden>
            {durum && sureklilikSatirlari(durum.sayfalar, profil.satirSayisi).map((s) => (
              <div
                key={s.anahtar}
                className="senaryo-sureklilik"
                data-tur={s.tur}
                style={{ top: `calc(var(--sayfa-ust) + ${s.satirOfseti} * var(--satir))` }}
              >
                {s.metin}
              </div>
            ))}
          </div>
          <div className="senaryo-sinirlar" aria-hidden>
            {durum?.sinirlar.map((s) => (
              <div
                key={s.sayfaNo}
                className="senaryo-sinir"
                data-sayfa={s.sayfaNo}
                style={{ top: `calc(var(--sayfa-ust) + ${s.satirOfseti} * var(--satir))` }}
              >
                <span>{s.sayfaNo}</span>
              </div>
            ))}
          </div>
          {/* Yer imi kenar işaretleri — §13.4. Sayfa sınırlarıyla AYNI
              ofset kaynağını kullanıyorlar; ayrı hesaplansaydı ikisi ekranda
              birbirinden kayardı.

              SOL TIK RENGİ İLERLETİR, KALDIRMAZ. Eskiden tıklamak imi
              siliyordu: tek yanlış tık, etiketiyle birlikte imi götürüyor
              ve geri alınamıyordu (kullanıcı bildirimi 2026-08-30).
              Yıkıcı eylem sağ tık menüsünde; tıklamanın kendisi artık
              geri alınabilir ve keşfedilebilir. */}
          <div className="senaryo-sinirlar">
            {imIsaretleri.map((i) => (
              <button
                key={i.blockId}
                type="button"
                className="senaryo-im"
                data-testid={`yer-imi-${i.blockId}`}
                data-renk={i.renk}
                title={`${i.etiket || t('Yer imi')} — ${t('tıkla: renk, sağ tık: kaldır')}`}
                aria-label={`${t('Yer imi rengini değiştir')}: ${i.etiket || t('etiketsiz')}`}
                style={{ top: `calc(var(--sayfa-ust) + ${i.ofset} * var(--satir))` }}
                onClick={() => M.yerImiRenginiIlerlet(useProjectStore.getState().doc, i.blockId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setImMenu({ blockId: i.blockId, x: e.clientX, y: e.clientY });
                }}
              />
            ))}
          </div>
          {imMenu && (
            /* KAPATICI KATMAN kendi tıklamasını yutuyor: menü dışına
               basmak yalnız menüyü kapatmalı, altındaki kâğıda imleç
               koymamalı. */
            <div
              className="fixed inset-0 z-[80]"
              onClick={() => setImMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setImMenu(null); }}
            >
              <div
                role="menu"
                data-testid="yer-imi-menu"
                className="absolute min-w-[150px] border border-kenar bg-panel py-1
                  shadow-[0_12px_28px_rgba(0,0,0,.55)]"
                style={{ left: imMenu.x, top: imMenu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="yer-imi-kaldir"
                  className="w-full px-3 py-2 text-left text-[12.5px] text-metin-govde hover:bg-etkin"
                  onClick={() => {
                    M.yerImiKaldir(useProjectStore.getState().doc, imMenu.blockId);
                    setImMenu(null);
                  }}
                >
                  {t('Yer imini kaldır')}
                </button>
              </div>
            </div>
          )}
          <div ref={yer} data-testid="senaryo-editor" />
          <OneriListesi view={aktifGorunum} />
        </div>
      </div>

      {/* Planlar şeridi alt çubuktan AÇILIR (DESIGN.md · Yerleşim); kapalıyken
          hiç çizilmez, yani sayfaya ayrılan yükseklik geri gelir. */}
      {!odak && seritAcik && (
        <React.Suspense fallback={null}>
          <PlanSeridi />
        </React.Suspense>
      )}

      {/* Alt çubuk — solda sayaçlar, ortada planlar, sağda yakınlaştırma.
          Ölçüm gösteren her sayı Courier: kostüm değil, ölçü.

          Odak modunda ÇİZİLMİYOR: sayaçları `OdakKenari` zaten kenarda
          gösteriyor ve iki ayrı sayaç aynı anda görünmemeli — hangisinin
          doğru olduğu sorusu kullanıcının aklına gelmemeli. */}
      {!odak && (
      <div className="flex h-[34px] shrink-0 items-center border-t border-kenar bg-panel text-[11px] text-metin-zayif">
        <div className="mzn-sayi flex items-center gap-3 px-3.5">
          <span data-testid="sayac-kelime">
            <b className="font-normal text-metin-guclu">{sayac?.kelime ?? 0}</b> {t('kelime')}
          </span>
          <span data-testid="sayac-karakter">
            <b className="font-normal text-metin-guclu">{sayac?.karakter ?? 0}</b> {t('karakter')}
          </span>
          <span data-testid="sayac-sayfa">
            <b className="font-normal text-metin-guclu">{sayac?.sayfa ?? 0}</b> {t('sayfa')}
          </span>
        {/* Süre YALNIZ sayfa=dakika sözleşmesi geçerli olan tiplerde (§6.2).
            Romanda ve düz metinde sayfa süreyi ölçmez; göstermek yazara
            olmayan bir bilgi vermek olurdu — §6.6'da Fransız yerleşimi için
            verilen kararın aynısı. */}
        {aktifTip.sayfaDakika && (
          <span data-testid="sayac-sure" title={sureBaslik}>~{sureDakika} {t('dk')}</span>
        )}
          {secim && (
            <span data-testid="sayac-secim" className="text-metin-cok-zayif">
              {t('seçili')} {secim.kelime}
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid="plan-serit-anahtari"
          aria-pressed={seritAcik}
          onClick={() => useUiStore.setState({ planSeridi: !seritAcik })}
          className={'mzn-denetim ml-3 flex items-center gap-1.5 px-2 py-0.5 ' + (seritAcik ? 'mzn-etkin' : '')}
        >
          <Ikon ad="sayfa" boyut={11} />
          {t('planlar')}
          <span className="mzn-sayi text-metin-cok-zayif">{planSayisi}</span>
        </button>

        <span className="ml-auto flex items-center gap-0.5 border-l border-kenar-ic px-3">
          <button
            type="button" aria-label={t('Uzaklaştır')}
            onClick={() => yakinlastir(-0.1)}
            className="mzn-denetim flex h-5 w-5 items-center justify-center"
          >
            <Ikon ad="eksi" boyut={10} />
          </button>
          <button
            type="button" data-testid="olcek"
            onClick={() => useUiStore.setState({ scriptZoom: 1 })}
            title={t('%100\'e dön')}
            className="mzn-sayi min-w-[38px] px-1 text-center text-metin-guclu"
          >%{Math.round(olcek * 100)}</button>
          <button
            type="button" aria-label={t('Yakınlaştır')}
            onClick={() => yakinlastir(0.1)}
            className="mzn-denetim flex h-5 w-5 items-center justify-center"
          >
            <Ikon ad="arti" boyut={10} />
          </button>
        </span>
      </div>
      )}
    </div>
  );
}
