import { create } from 'zustand';
import type { DilAdi, KagitAdi, PresetTablosu } from '../format';
import { tercihOku, tercihKaydet } from '../format/tercih';
import type { SayfaRengi } from '../format/sayfa-rengi';
import type { NumaraAyari, SureAyari } from '../format/senaryo-ayarlari';
import { arayuzDili, arayuzDiliniAyarla, type ArayuzDili } from '../dil/arayuz';
import type { YaziTipiAdi } from '../format/yazi';
import type { SekmeId } from '../model/denetci-sekme';
import type { MapDraft } from '../model/world-map';

export type Tool =
  | 'select'
  | 'pen'
  | 'brush'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'text'
  | 'fill'
  | 'lasso'
  | 'eyedropper';

export const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: 'select',
  b: 'pen',
  e: 'eraser',
  t: 'text',
  r: 'rect',
  l: 'line',
  a: 'arrow',
};

/**
 * Galeri filtreleri Kartlar içinde; `sunum` ayrı panel ekseninde kalır.
 */
export type ViewMode = 'board' | 'grid' | 'senaryo' | 'sunum' | 'harita';
export type ScriptFilter = 'all' | 'linked' | 'unlinked';
export type LibraryTab =
  | 'karakterler'
  | 'pozlar'
  | 'kameralar'
  | 'objeler'
  | 'objeler3d'
  | 'sablonlar';

export interface UiState {
  tool: Tool;
  previousTool: Tool | null;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  brushSmoothing: number;
  fontSize: number;
  opacity: number;
  recentColors: string[];

  zoom: number;
  panX: number;
  panY: number;

  viewMode: ViewMode;
  /** Harita çalışma alanı oturumluğu; proje köküne yazılmaz. */
  activeWorldId: string | null;
  mapTab: 'settings' | 'countries' | 'places' | 'layers';
  mapSelection:
    | { type: 'marker' | 'label' | 'overlay' | 'country'; id: string }
    | { type: 'terrain'; x: number; y: number }
    | null;
  mapPlacement: { type: 'marker'; locationId: string | null } | { type: 'label' } | null;
  mapDraft: MapDraft | null;
  focusedLocationId: string | null;
  libraryTab: LibraryTab;
  librarySearch: string;
  libraryCategory: string;

  /** Senaryo panelinde seçili blok kimlikleri */
  scriptSelection: string[];
  /** Shift+ok ile aralık seçiminin çıpası */
  scriptAnchor: string | null;
  /** Klavye imlecinin bulunduğu blok */
  scriptCursor: string | null;
  /**
   * Seçimin DOKUNDUĞU blok kimlikleri — imleç tek bloktaysa tek elemanlı.
   *
   * `scriptCursor`tan AYRI: o "imleç hangi satırda" sorusunu cevaplıyor ve
   * araç çubuğu blok tipini ondan okuyor. Bu ise "kullanıcı neyi seçti"
   * sorusu; revizyon işaretlemesi bir SEÇİME uygulanıyor. İkisini tek alana
   * sıkıştırmak, birini güncelleyip ötekini bozmak demekti (Karar 2).
   */
  scriptSecili: string[];
  scriptSearch: string;
  scriptFilter: ScriptFilter;
  /**
   * Senaryo sayfasının ölçeği. Tuvalin `zoom`'undan AYRI: aynı anahtarı
   * paylaşmak, sayfayı yakınlaştırınca tuvali de kaydırırdı.
   */
  scriptZoom: number;
  /**
   * Odak modu: imlecin bulunduğu blok dışında her şey söner ve kabuk gizlenir.
   * `chromeHidden`'dan AYRI: o tuvali büyütmek için, bu yazmak için — ikisi
   * aynı anahtar olsaydı odaktan çıkmak panelleri de geri getirirdi.
   */
  odakModu: boolean;
  /**
   * Yazım presetleri (§16.3). Format PROFİLİNE ait, projeye değil — bu yüzden
   * belgeye yazılmıyor. Kullanıcı düzeyinde kalıcılık henüz yok (§17'de borç).
   */
  scriptPresetler: PresetTablosu;
  /** Senaryo DIŞI tiplerde kullanılacak yazı tipi (§16.3). */
  scriptYazi: YaziTipiAdi;
  /** İki sütunlu belgede sol sütunun genişliği (§6.6). */
  scriptSolSutun: number;
  /** Seslendirme hızı; `null` ise süre gösterilmez (§6.6). */
  scriptKelimeHizi: number | null;
  /**
   * Alt çubuktan açılan planlar şeridi (B · Kesme Masası).
   *
   * `chromeHidden`/`odakModu`'ndan AYRI eksen: onlar arayüzü GİZLER, bu
   * şeridi AÇAR. Aynı anahtara bağlansaydı odaktan çıkmak kapalı bıraktığın
   * şeridi de geri getirirdi.
   */
  planSeridi: boolean;
  /**
   * Kütüphane çekmecesi.
   *
   * Kütüphane KALICI SÜTUN DEĞİL: kırk manken küçük resmi ekranın üçte
   * birini sürekli işgal ediyordu ve kullanıcı onları yalnız bir figür
   * yerleştirirken açıyor. Yer imlerinde konan kuralın aynısı — "sürekli
   * açık kalmasın, bir simgeden açılıp kapansın".
   */
  kutuphaneAcik: boolean;
  /**
   * Storyboard sağ panel sekmesi: Katman | Boya | Özellik | Rehber.
   *
   * Senaryodaki `inspectorTab`'dan AYRI: iki bağlamın sekmeleri farklı ve
   * tek anahtara bindirmek, moddan moda geçince olmayan bir sekmeye
   * düşürürdü.
   */
  panoSekmesi: 'katman' | 'boya' | 'ozellik' | 'rehber';
  /** Sağ paneldeki sekme: Sahne | Yazım (§16.3). */
  /**
   * Sağ denetçinin sekmesi.
   *
   * B tasarımında sağ panel TEK: yer imleri ve analiz ayrı sütun değil bu
   * panelin sekmeleri. Üç ayrı sütun 1440px'te sayfayı ezerdi ve tasarımın
   * "sayfa odaktadır" kararını bozardı.
   */
  inspectorTab: SekmeId;
  /** Format eksenleri (§14) — kağıt ve dil. Yerleşim bugün yalnız Amerikan. */
  /**
   * Yer imleri çekmecesi açık mı (§13.4).
   *
   * OTURUMLUK ve BELGE DIŞI: Yjs'e konsaydı bir yazar çekmeceyi açtığında
   * ortak yazarın ekranında da açılırdı. Varsayılan kapalı — kalıcı panel
   * ekranı yer imlerine kiralamak olurdu.
   */
  yerImiCekmecesi: boolean;
  /** Analiz panosu açık mı (F4). Oturumluk, yer imi çekmecesiyle aynı gerekçe. */
  analizPanosu: boolean;
  /**
   * TAM EKRAN analiz panosu açık mı.
   *
   * Denetçi sekmesinden ayrı bir bayrak: sekme dar bir özet, panel bütün
   * ölçüler. Bayrak mağazada çünkü panel İKİ yerden açılıyor — menüden
   * (Ctrl+Shift+A) ve sekmedeki düğmeden; Studio'nun yerel durumunda
   * dursaydı sekme ona ulaşamazdı.
   */
  analizTamEkran: boolean;
  analizTamEkranAyarla(acik: boolean): void;
  /**
   * Sahne↔panel canlı bağı açık mı (F5).
   *
   * Varsayılan AÇIK — bitiş ölçütü "sahneyi taşı, kartı taşınsın" diyor.
   * Kapatılabiliyor çünkü otomatik sıralama panodaki elle düzeni ezebilir ve
   * bu "neden kartlarım kaydı" diye sorulacak bir sürprizdir.
   */
  sahnePanelBagi: boolean;
  /**
   * Bu oturumda yoksayılan kelimeler (§16.4 bağlam menüsü).
   *
   * OTURUMLUK: belgeye yazılsaydı bir yazarın "bu kelime önemsiz" kararı
   * bütün ekibin sözlüğüne girerdi. Kalıcı kabul için sözlük var.
   */
  yoksayilanKelimeler: string[];
  /** ARAYUZ dili — belge dilinden ayri; varsayilan Ingilizce (2026-08-27). */
  arayuzDili: ArayuzDili;
  arayuzDiliniDegistir: (dil: ArayuzDili) => void;
  /**
   * Kapak sayfası GİZLİ mi. Varsayılan `false` = AÇIK (kullanıcı kararı
   * 2026-08-27): sektörde senaryo kapaksız teslim edilmez, kapalı gelseydi
   * unutulurdu. Bayrak "kapalı" olarak tutuluyor ki varsayılan `false`
   * olsun ve kayıtsız bir oturum kapağı gösterebilsin.
   */
  kapakKapali: boolean;
  /**
   * YAZMA AYARLARI — STARC'ın dağınık kutuları burada PAKET olarak
   * (kullanıcı kararı 2026-08-27: "birleştirilebilen varsa tek ayar").
   */
  /** Akıllı düzeltmeler: iki büyük harf, …, kıvırcık tırnak, —, çoklu boşluk. */
  akilliDuzeltme: boolean;
  /**
   * Daktilo modu: imleç ekranın ortasında kalır + yazılan satır vurgulanır
   * + diğer paragraflar hafifçe söner. STARC'ta üç ayrı ayar; üçü de aynı
   * amaca hizmet ediyor (imlecin bulunduğu satıra odaklanmak) ve pratikte
   * birlikte açılıyor.
   */
  daktiloModu: boolean;
  /** Arayüz ölçeği (0.8–1.5). Kabuk kökünde `font-size` olarak uygulanır. */
  arayuzOlcegi: number;
  /** Sahne/diyalog numarası gösterimi (STARC'ta iki ayrı kutu). */
  numaraAyari: NumaraAyari;
  /**
   * Sayfa sonu sürekliliği: bölünen diyaloğa (DEVAMI VAR)/(DEVAM).
   * VARSAYILAN KAPALI — açık gelseydi mevcut projelerin SAYFA SAYISI bir
   * sürüm sonra kendiliğinden kayardı (her bölünme iki satır ekler).
   */
  sayfaSonuSurekliligi: boolean;
  /** Süre hesabı yöntemi ve katsayıları (STARC'ta üç seçenek). */
  sureAyari: SureAyari;
  /** Zaman damgası otoritesinin adresi; boşsa `VARSAYILAN_TSA`. */
  tsaUrl: string;
  scriptPaper: KagitAdi;
  /** Senaryo sayfasinin ekran rengi — 4 sabit secenek, yalniz gorunum. */
  scriptSayfaRengi: SayfaRengi;
  scriptLang: DilAdi;

  selection: string[];
  activeLayerId: string | null;

  leftPanelWidth: number;
  rightPanelWidth: number;
  timelineHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  timelineCollapsed: boolean;
  /** Tab: tüm panelleri gizle (sadece canvas) */
  chromeHidden: boolean;
  /** Seçili silüetin iskeletini düzenleme modu */
  rigEditing: boolean;
  /** Seçili mankenin kemik pozlama modu */
  boneEditing: boolean;
  selectedBone: string | null;

  playing: boolean;
  playhead: number;

  /** Aktif modal/dialog kimliği */
  dialog: string | null;
  toast: { id: number; message: string; kind: 'info' | 'error' | 'success' } | null;

  setTool: (tool: Tool) => void;
  setZoom: (zoom: number, focus?: { x: number; y: number }) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string, additive: boolean) => void;
  clearSelection: () => void;
  set: <K extends keyof UiState>(key: K, value: UiState[K]) => void;
  showToast: (message: string, kind?: 'info' | 'error' | 'success') => void;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** Senaryo sayfası ölçek sınırları — %100 fiziksel boyuttur (1 birim = 1 mm). */
export const MIN_SCRIPT_ZOOM = 0.5;
export const MAX_SCRIPT_ZOOM = 2.5;

export const kisitliOlcek = (o: number): number =>
  Math.max(MIN_SCRIPT_ZOOM, Math.min(MAX_SCRIPT_ZOOM, Math.round(o * 100) / 100));

/* Tercih MODÜL YÜKLENİRKEN bir kez okunuyor: mağazanın başlangıç durumu
   ona bağlı ve sonradan okumak, ilk çizimde yanlış kağıtla bir kare
   göstermek olurdu. */
const TERCIH = tercihOku();

export const useUiStore = create<UiState>((set, get) => ({
  tool: 'select',
  previousTool: null,
  strokeColor: '#111827',
  fillColor: '#00000000',
  strokeWidth: 4,
  brushSmoothing: 0.5,
  fontSize: 32,
  opacity: 1,
  recentColors: [],

  zoom: 1,
  panX: 0,
  panY: 0,

  /* AÇILIŞ SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26: "proje açılınca
     storyboardda açılıyor, senaryoda olmalı").

     Bu bir yazım programı: bir proje açan kişinin ilk isteyeceği şey metnini
     görmek. Panoda açmak, kullanıcıyı her açılışta bir tuşa daha bastırıyordu
     ve boş bir tuval yazılmış metinden daha az bilgi taşıyor. */
  viewMode: 'senaryo',
  activeWorldId: null,
  mapTab: 'settings',
  mapSelection: null,
  mapPlacement: null,
  mapDraft: null,
  focusedLocationId: null,
  libraryTab: 'karakterler',
  librarySearch: '',
  libraryCategory: 'all',

  scriptSelection: [],
  scriptAnchor: null,
  scriptCursor: null,
  scriptSecili: [],
  scriptSearch: '',
  scriptFilter: 'all',
  /* Kağıt varsayılanı US Letter: §6.3'te "standart" olan teslim kağıdı odur.
     A4 seçenek olarak durur ve ızgara sabit olduğu için sayfa sayısı kaymaz. */
  scriptZoom: 1,
  odakModu: false,
  /* PRESETLER SABIT (kullanici karari 2026-08-27): kayitli tercih
     OKUNMUYOR - onceden degistirmis bir kullanici gorunmez bir durumla
     bas basa kalmasin. Tablo tipi ve boru hatti duruyor; deger hep bos. */
  scriptPresetler: {},
  scriptYazi: TERCIH.yazi,
  scriptSolSutun: TERCIH.solSutun,
  scriptKelimeHizi: TERCIH.kelimeHizi,
  planSeridi: false,
  kutuphaneAcik: false,
  panoSekmesi: 'katman',
  inspectorTab: 'sahne',
  yerImiCekmecesi: false,
  analizPanosu: false,
  analizTamEkran: false,
  analizTamEkranAyarla: (acik) => set({ analizTamEkran: acik }),
  sahnePanelBagi: true,
  yoksayilanKelimeler: [],
  /* Kağıt, dil ve presetler KULLANICI PROFİLİNDEN (§16.3) — oturumla
     sınırlı değil. Öncesinde her açılışta Letter/tr'ye dönüyordu ve A4
     seçen bir yazar seçimini her seferinde yeniden yapıyordu (§17 borcu). */
  arayuzDili: arayuzDili(),
  arayuzDiliniDegistir: (dil) => {
    /* Modul degiskeni (t bunu okur) + magaza (kabuk koku key olarak
       kullanir, degisince agac yeniden kurulur) birlikte guncellenir. */
    arayuzDiliniAyarla(dil);
    /* <html lang> DE değişiyor: CSS `text-transform: uppercase` dili
       buradan okuyor ve Türkçe kuralında `i` → `İ` olur. İngilizce
       arayüzde "LIBRARY" yerine "LİBRARY", "PDF OPTIONS" yerine
       "PDF OPTİONS" yazıyordu (kullanıcı bulgusu 2026-08-28). Ekran
       okuyucunun telaffuzu da aynı özniteliğe bakar. */
    try { globalThis.document?.documentElement?.setAttribute('lang', dil); } catch { /* DOM yok */ }
    set({ arayuzDili: dil });
  },
  kapakKapali: false,
  akilliDuzeltme: TERCIH.akilliDuzeltme,
  daktiloModu: TERCIH.daktiloModu,
  arayuzOlcegi: TERCIH.arayuzOlcegi,
  numaraAyari: TERCIH.numaraAyari,
  sayfaSonuSurekliligi: TERCIH.sayfaSonuSurekliligi,
  sureAyari: TERCIH.sureAyari,
  tsaUrl: TERCIH.tsaUrl,
  scriptPaper: TERCIH.kagit,
  scriptSayfaRengi: TERCIH.sayfaRengi,
  scriptLang: TERCIH.dil,

  selection: [],
  activeLayerId: null,

  leftPanelWidth: 300,
  rightPanelWidth: 300,
  timelineHeight: 148,
  leftCollapsed: false,
  rightCollapsed: false,
  timelineCollapsed: false,
  chromeHidden: false,

  rigEditing: false,
  boneEditing: false,
  selectedBone: null,

  playing: false,
  playhead: 0,

  dialog: null,
  toast: null,

  setTool: (tool) => set({ tool, previousTool: get().tool, rigEditing: false }),
  setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setSelection: (selection) => set({ selection }),
  toggleSelection: (id, additive) => {
    const cur = get().selection;
    if (!additive) return set({ selection: [id] });
    set({ selection: cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id] });
  },
  clearSelection: () => set({ selection: [], rigEditing: false, boneEditing: false, selectedBone: null }),
  set: (key, value) => set({ [key]: value } as any),
  showToast: (message, kind = 'info') => set({ toast: { id: Date.now(), message, kind } }),
}));

/**
 * Format tercihi DEĞİŞİNCE kaydedilir — tek ev.
 *
 * Kaydı `setState` çağıranlara bırakmak (araç çubuğu, Yazım sekmesi, menü)
 * aynı kuralı üç eve koymak olurdu ve biri unutulduğunda hata sessiz kalırdı:
 * tercih ekranda değişir, yeniden açılışta yoktur (Karar 2).
 *
 * Karşılaştırma ÜÇ ALANA bakıyor, `setState`'in her çağrısına değil: seçim,
 * yakınlaştırma ve imleç saniyede onlarca kez yazılıyor ve hepsinde diske
 * gitmenin karşılığı yok.
 */
useUiStore.subscribe((s, onceki) => {
  if (
    s.scriptPaper === onceki.scriptPaper
    && s.scriptLang === onceki.scriptLang
    && s.scriptPresetler === onceki.scriptPresetler
    && s.scriptYazi === onceki.scriptYazi
    && s.scriptSolSutun === onceki.scriptSolSutun
    && s.scriptKelimeHizi === onceki.scriptKelimeHizi
    && s.scriptSayfaRengi === onceki.scriptSayfaRengi
    && s.akilliDuzeltme === onceki.akilliDuzeltme
    && s.daktiloModu === onceki.daktiloModu
    && s.arayuzOlcegi === onceki.arayuzOlcegi
    && s.numaraAyari === onceki.numaraAyari
    && s.sayfaSonuSurekliligi === onceki.sayfaSonuSurekliligi
    && s.sureAyari === onceki.sureAyari
    && s.tsaUrl === onceki.tsaUrl
  ) return;
  tercihKaydet({
    kagit: s.scriptPaper, dil: s.scriptLang, presetler: {}, yazi: s.scriptYazi,
    solSutun: s.scriptSolSutun, kelimeHizi: s.scriptKelimeHizi,
    sayfaRengi: s.scriptSayfaRengi,
    akilliDuzeltme: s.akilliDuzeltme,
    daktiloModu: s.daktiloModu,
    arayuzOlcegi: s.arayuzOlcegi,
    numaraAyari: s.numaraAyari,
    sayfaSonuSurekliligi: s.sayfaSonuSurekliligi,
    sureAyari: s.sureAyari,
    tsaUrl: s.tsaUrl,
  });
});
