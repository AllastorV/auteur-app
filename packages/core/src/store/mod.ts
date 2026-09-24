import { senaryoBlogunaGit } from '../editor/gorunum';
import { useProjectStore } from './project';
import { useUiStore, type ViewMode } from './ui';
import { odakCoz, type Odak } from './odak';
import { dunyalarMap } from '../doc/schema';

/**
 * §7 — mod kabuğu. Mod değiştirmenin TEK yolu.
 *
 * Önce altı ayrı yerde `useUiStore.setState({ viewMode })` çağrılıyordu ve
 * hiçbiri bağlam taşımıyordu: panel seçiliyken senaryoya geçince imleç o
 * panelin bloğuna gitmiyordu. Bağlam taşıyan tek yol (`openPanelForBlock`)
 * ise bunu modları birbirine TANITARAK yapıyordu — §7'nin yasakladığı şey.
 *
 * ## Odak SAKLANMAZ, TÜRETİLİR
 *
 * `odak`'ı mağazada tutmak, her seçim değişiminde güncellenmediği sürece
 * bayat bir yalan olurdu: modun seçimi ilerler, `odak` geride kalır ve onu
 * okuyan üçüncü bir mod yanlış yere bakar. Her seçim yazımını yakalamak ise
 * ScriptNavigator, kısayollar, panel ızgarası ve sürükle-bırak dahil bir
 * düzine çağrı yerini kirletirdi.
 *
 * Bunun yerine odak, o anki modun KENDİ seçiminden okunur ve eksik eksenler
 * belgeden türetilir (`odakCoz`). Tek kaynak, bayatlama yok, yazan yer yok.
 * Modun seçimi zaten "yazma"nın kendisidir.
 */

/**
 * Bir modun sahibi olduğu odak ekseni.
 *
 * Eşleme TABLO, ikili bölme değil. `mod === 'senaryo' ? 'blockId' : 'boardId'`
 * yazıldığında §7'nin saydığı altı moddan yeni eklenen her biri (Kartlar,
 * Zaman çizelgesi, Analiz, Breakdown) SESSİZCE `boardId`'ye düşerdi: analiz
 * modundan çıkarken `odakOku` panel seçimini okur, `eksenUygula` girilen
 * modun seçimini ezer, hata da çıkmazdı.
 *
 * `Record<ViewMode, …>` ile derleyici zorluyor: `ViewMode`'a yeni bir mod
 * eklendiğinde bu tablo eksik kalırsa DERLEME kırılır — sessiz düşüş yerine
 * derleme hatası.
 */
const MOD_EKSENI: Record<ViewMode, 'blockId' | 'boardId' | 'entityId'> = {
  senaryo: 'blockId',
  board: 'boardId',
  grid: 'boardId',
  sunum: 'boardId',
  harita: 'entityId',
};

function modunEkseni(mod: ViewMode): 'blockId' | 'boardId' | 'entityId' {
  return MOD_EKSENI[mod];
}

/**
 * O anki bağlam — açık modun seçiminden okunur, eksikler belgeden türetilir.
 *
 * Belge boşsa ya da hiçbir şey seçili değilse yalnız `documentId` döner;
 * uydurma yapılmaz.
 */
export function odakOku(): Odak {
  const proje = useProjectStore.getState();
  const ui = useUiStore.getState();
  const taban: Odak = { documentId: proje.project.meta.id };

  if (modunEkseni(ui.viewMode) === 'entityId') {
    return ui.activeWorldId && dunyalarMap(proje.doc).has(ui.activeWorldId)
      ? { ...taban, entityId: ui.activeWorldId } : taban;
  }

  if (modunEkseni(ui.viewMode) === 'blockId') {
    return odakCoz(
      ui.scriptCursor ? { ...taban, blockId: ui.scriptCursor } : taban,
      proje.project,
    );
  }
  return odakCoz(
    proje.activePanelId ? { ...taban, boardId: proje.activePanelId } : taban,
    proje.project,
  );
}

/**
 * Girilen modun seçimini odaktan kurar.
 *
 * Eksen türetilememişse mod KENDİ son seçimini korur — rastgele bir yere
 * atlamak, kullanıcıyı bağlamı korunmuş sanarak yanlış yere götürürdü
 * (`odakCoz` uydurmaz, burası da uydurmaz).
 */
function eksenUygula(mod: ViewMode, odak: Odak): void {
  if (modunEkseni(mod) === 'entityId') {
    if (odak.entityId && dunyalarMap(useProjectStore.getState().doc).has(odak.entityId)) {
      useUiStore.setState({ activeWorldId: odak.entityId });
    }
    return;
  }
  if (modunEkseni(mod) === 'blockId') {
    if (!odak.blockId) return;
    useUiStore.setState({
      scriptSelection: [odak.blockId],
      scriptCursor: odak.blockId,
      scriptAnchor: odak.blockId,
    });
    return;
  }
  if (!odak.boardId) return;
  useProjectStore.getState().setActivePanel(odak.boardId);
}

/**
 * Modu değiştirir ve bağlamı taşır (F2 bitiş kriteri).
 *
 * Sıra önemli: odak ÇIKILAN modun seçiminden okunur, sonra mod değişir,
 * sonra girilen moda uygulanır. Mod önce değiştirilseydi `odakOku` yeni
 * modun (henüz taşınmamış) seçimini okur ve bağlam kaybolurdu.
 */
export function moduDegistir(mod: ViewMode): void {
  const suanki = useUiStore.getState().viewMode;
  if (mod === suanki) return;

  // §13.2 `sunum`: nereden girildiği hatırlanıyor ki Esc GERİYE dönsün.
  // Modül değişkeni — Yjs'e yazılmıyor, oturumluk (bkz. `sunumdanCik`).
  if (mod === 'sunum') sunumOncekiMod = suanki;

  const odak = odakOku();
  useUiStore.setState({ viewMode: mod });
  if (mod === 'board' && useProjectStore.getState().allowed('edit')) {
    useUiStore.getState().setTool('pen');
  }
  eksenUygula(mod, odak);
}

/**
 * Sunum ekseni yalnız `moduDegistir('sunum')` çağıran YERİ değil, oraya
 * GİRİLEN modu da bilmek zorunda: Esc'in "geriye" dönmesi için. Bunu
 * `useUiStore`'a yeni bir alan olarak koymak §13.4'ün yer imi çekmecesinde
 * verilen kararı ihlal ederdi (oturumluk durum Yjs alanı DEĞİL, modül
 * kapsamı yeter) — burada zaten mod geçişinin TEK kapısı, ikinci bir ev
 * açmaya gerek yok.
 */
let sunumOncekiMod: ViewMode | null = null;
let haritaOncekiMod: ViewMode | null = null;

/** Open the project map with an optional World-note focus, keeping the previous workspace. */
export function haritaAc(worldId: string): boolean {
  if (!dunyalarMap(useProjectStore.getState().doc).has(worldId)) return false;
  const ui = useUiStore.getState();
  if (ui.viewMode !== 'harita') haritaOncekiMod = ui.viewMode;
  useUiStore.setState({ activeWorldId: worldId, mapSelection: null, mapPlacement: null, mapDraft: null, mapTab: 'settings' });
  moduDegistir('harita');
  return true;
}

/** Return to the workspace from which the map was opened. */
export function haritadanCik(): void {
  moduDegistir(haritaOncekiMod && haritaOncekiMod !== 'harita' ? haritaOncekiMod : 'senaryo');
  haritaOncekiMod = null;
  useUiStore.setState({ mapSelection: null, mapPlacement: null, mapDraft: null, activeWorldId: null });
}

/** Sunumdan çıkar — girildiği moda döner, bilinmiyorsa panoya (§13.2). */
export function sunumdanCik(): void {
  moduDegistir(sunumOncekiMod ?? 'board');
  sunumOncekiMod = null;
}

/**
 * Bir senaryo satırına gider (§13.4 yer imleri, gezgin, arama).
 *
 * `bloktanPaneleGec`'in aynası: mod kabuğunun kendi kelimesi. Çağıran
 * `viewMode`'a dokunmaz, yalnız "şu bloğa git" der.
 *
 * `moduDegistir` ÖNCE çağrılıyor ve seçim SONRA yazılıyor: mod değişimi
 * `eksenUygula` ile ÇIKILAN modun odağını taşır ve o odak buraya gelen
 * hedefi ezerdi. Zaten senaryo modundaysak `moduDegistir` erken dönüyor,
 * yani ekstra maliyet yok.
 *
 * Blok gerçekten var mı diye BAKILIYOR: olmayan bir bloğa imleç koymak,
 * `odakCoz`'un düşürdüğü bayat kimliği arka kapıdan geri sokmak olurdu.
 */
export function blogaGit(blockId: string): boolean {
  const proje = useProjectStore.getState();
  const varMi = proje.project.script?.blocks.some((b) => b.id === blockId) ?? false;
  if (!varMi) return false;

  moduDegistir('senaryo');
  useUiStore.setState({
    scriptSelection: [blockId],
    scriptCursor: blockId,
    scriptAnchor: blockId,
  });
  senaryoBlogunaGit(blockId);
  return true;
}

/**
 * Bir senaryo satırına bağlı çizimi açar.
 *
 * `store/script.ts`'ten buraya taşındı: orada senaryo modu storyboard
 * modunun ADINI biliyordu (`viewMode: 'board'`), yani §7'nin yasakladığı
 * bağı kuruyordu. Artık panel seçilir ve mod kabuğu gerisini yapar.
 *
 * `after` verilirse aynı satıra bağlı BİR SONRAKİ panele geçer; aynı satırın
 * birden çok planı varsa tekrar tekrar basarak aralarında dolaşılır.
 */
export function bloktanPaneleGec(blockId: string, after?: string): boolean {
  const proje = useProjectStore.getState();
  const bagli = proje.project.panels.filter((p) => p.scriptRefs?.includes(blockId));
  if (!bagli.length) return false;

  const at = after ? bagli.findIndex((p) => p.id === after) : -1;
  const hedef = bagli[(at + 1) % bagli.length].id;

  /* Mod değişimi TEK kapıdan (`moduDegistir`). Doğrudan `setState` yazmak
     `eksenUygula`'yı atlıyordu: bugün zararsız görünüyordu (panel zaten
     seçili) ama `moduDegistir`'e eklenecek her adım — telemetri, kalıcılık,
     odak yayını — bu yolda SESSİZCE atlanırdı. §12 F2'nin "tek bilinçli
     istisna" iddiası bu satır yüzünden yanlıştı.

     `setActivePanel` ÖNCE gelmiyor artık, SONRA geliyor — ÖLÇÜLDÜ: `moduDegistir`
     mevcut (senaryo) moddaki `scriptCursor`'dan `odakOku`/`odakCoz` ile KENDİ
     boardId'sini türetip `eksenUygula`'da yeniden yazıyor. Blok BİRDEN ÇOK
     panele bağlıysa `odakCoz` her zaman belge sırasındaki İLK bağlı paneli
     verir — `after` ile TALEP EDİLEN belirli hedef değil. `setActivePanel`
     önce çağrılsa bile `eksenUygula` onu türetilmiş (yanlış) panelle EZERDİ.
     Bu yüzden açık hedef, mod kabuğunun kendi türetimi bittikten SONRA
     yazılıyor — kazanan her zaman `bloktanPaneleGec`'in bildiği spesifik
     hedef. */
  moduDegistir('board');
  proje.setActivePanel(hedef);
  return true;
}
