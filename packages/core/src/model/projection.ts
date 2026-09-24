import * as Y from 'yjs';
import {
  panelsArray, orderedPanelMaps, metaMap, settingsMap, readPanel, scriptDocu, sozlukMap,
  assetsMap,
  ciftlerArray,
  revizyonlarArray,
  revizyonIsaretleriMap,
  yerImleriMap,
  karakterlerMap,
  lokasyonlarMap,
  dunyalarMap,
  worldMapsMap,
  copArray,
  baslikSayfasiMap,
  breakdownMap,
} from '../doc/schema';
import type { Layer, Panel, SBObject } from './types';

/**
 * Rol zorlaması için "korumalı izdüşüm".
 *
 * Yorumcu rolü YALNIZCA `annotation` türü katmanlardaki objelere dokunabilir.
 * Bu fonksiyon dokümanın geri kalan her şeyini kararlı (deterministik) bir
 * dizeye indirger; sunucu, gelen güncellemeden önce ve sonra bu dizeyi
 * karşılaştırarak izinsiz değişiklikleri reddeder.
 *
 * Aynı kod hem sunucuda hem istemcide çalışır — böylece iki taraf aynı kuralı
 * uygular ve istemci kendi yazımının reddedileceğini önceden bilebilir.
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function annotationLayerIds(layers: Layer[]): Set<string> {
  return new Set(layers.filter((l) => l.kind === 'annotation').map((l) => l.id));
}

/** Bir panelin korumalı (yorumcunun dokunamayacağı) kısmı. */
export function panelProtectedPart(panel: Panel) {
  const annotation = annotationLayerIds(panel.layers);
  return {
    id: panel.id,
    meta: panel.meta,
    layers: panel.layers,
    guides: panel.guides,
    transition: panel.transition,
    transitionDuration: panel.transitionDuration,
    background: panel.background,
    scriptRefs: panel.scriptRefs,
    objects: panel.objects.filter((o: SBObject) => !annotation.has(o.layerId)),
  };
}

export function protectedProjection(doc: Y.Doc): string {
  const panels = orderedPanelMaps(doc).map((pm) => ({
    ...panelProtectedPart(readPanel(pm)),
    order: pm.get('order') ?? null,
  }));
  // `updatedAt` her düzenlemede tazelenen bir zaman damgasıdır; işaretleme
  // katmanına yazmak da onu değiştirir. İçerik taşımadığı için korumalı
  // izdüşümün dışında bırakılır.
  const { updatedAt: _updatedAt, ...meta } = metaMap(doc).toJSON() as Record<string, unknown>;
  return stableStringify({
    meta,
    settings: settingsMap(doc).toJSON(),
    // Onarım raporu türetilmiş veridir; korumalı izdüşüme girmemeli.
    script: scriptDocu(doc),
    /* Proje sözlüğü KORUMALI: metin değiştirmiyor ama belgenin kalıcı bir
       parçası. Dışarıda bıraksaydık yorumcu ve İZLEYİCİ rolü sözlüğe
       sınırsız yazabilirdi ve sunucunun izin denetimi bunu hiç görmezdi. */
    sozluk: sozlukMap(doc).toJSON(),
    /* Gömülü görseller KORUMALI: işaretleme katmanına ait değiller, panellerin
       kalıcı içeriğidir. Dışarıda bıraksaydık yorumcu ve İZLEYİCİ rolü her
       görseli değiştirebilir ya da sınırsız dataURL yazıp bütün katılımcıların
       diskini şişirebilirdi — sunucunun izin denetimi bunu hiç görmezdi. */
    assets: assetsMap(doc).toJSON(),
    /* İKİ SÜTUNLU BELGENİN ÇİFTLERİ KORUMALI: belgenin metninin ta
       kendisi. Dışarıda bıraksaydık yorumcu ve İZLEYİCİ rolü Fransız
       yerleşimli bir belgenin bütün metnini değiştirebilirdi ve sunucunun
       izin denetimi bunu hiç görmezdi — tek sütunlu `script` için verilen
       kararın aynısı. `izdusum-kapsami` testi zaten zorunlu kılıyor: her
       ROOT anahtarı izdüşümde görünmek zorunda. */
    ciftler: ciftlerArray(doc).toJSON(),
    /* Yer imleri KORUMALI: işaretleme katmanına ait değiller, belgenin kalıcı
       bir parçasılar. Dışarıda kalsalardı İzleyici ve Yorumcu rolü sınırsız im
       yazabilir, başkasının imlerini silebilirdi — `sozluk` ve `assets` aynı
       boşluktan geçmişti, bu üçüncüsü olmasın. */
    yerImleri: yerImleriMap(doc).toJSON(),
    /* Revizyonlar ve değişiklik işaretleri KORUMALI: dağıtım kaydıdır,
       işaretleme katmanına ait değil. Dışarıda kalsalardı İzleyici ve
       Yorumcu rolü revizyon yayınlayabilir, başkasının işaretini
       silebilirdi — `yerImleri` için verilen kararın aynısı. İşaret ayrıca
       hangi sayfanın basılacağını belirliyor: bozan biri, ekibin yanlış
       sayfaları dağıtmasına yol açardı. */
    revizyonlar: revizyonlarArray(doc).toJSON(),
    revizyonIsaretleri: revizyonIsaretleriMap(doc).toJSON(),
    /* Karakterler ve lokasyonlar KORUMALI: işaretleme katmanına ait değiller,
       belgenin kalıcı kadro/mekân kaydı. Dışarıda kalsalardı İzleyici ve
       Yorumcu rolü sınırsız karakter/lokasyon ekleyebilir, silebilirdi —
       `yerImleri` için verilen kararın aynısı. */
    karakterler: karakterlerMap(doc).toJSON(),
    lokasyonlar: lokasyonlarMap(doc).toJSON(),
    /* Dünyalar KORUMALI: `karakterler`/`lokasyonlar` için verilen kararın
       aynısı — kurgu evreni notu belgenin kalıcı bir parçası, işaretleme
       katmanına ait değil. */
    dunyalar: dunyalarMap(doc).toJSON(),
    /* Harita coğrafyası, işaretleri ve görsel yerleşimleri editör içeriğidir.
       Yorumcu/İzleyici yazımı sunucuda reddedilmelidir. */
    worldMaps: worldMapsMap(doc).toJSON(),
    /* Geri dönüşüm kutusu KORUMALI: içinde SİLİNMİŞ panel/blok verisinin TAM
       kopyası duruyor (§15) — dışarıda kalsaydı Yorumcu ve İzleyici rolü
       kalıcı silme çağırıp bu kopyayı kullanıcıdan habersiz yok edebilir ya
       da sahte "silinmiş" kayıt uydurabilirdi; sunucunun izin denetimi bunu
       hiç görmezdi. `sozluk`/`assets` için verilen kararın aynısı. */
    cop: copArray(doc).toJSON(),
    /* Başlık sayfası ve çekim dökümü de KORUMALI — aynı gerekçe: dışarıda
       kalsalardı İzleyici ve Yorumcu rolü bu kökleri sınırsız yazabilirdi ve
       sunucunun izin denetimi bunu HİÇ GÖRMEZDİ. `izdusum-kapsami` testi
       zaten zorunlu kılıyor: şemadaki HER `ROOT` anahtarı izdüşümde olmalı. */
    baslikSayfasi: baslikSayfasiMap(doc).toJSON(),
    breakdown: breakdownMap(doc).toJSON(),
    panels,
  });
}

/** Yorumcunun yazabildiği kısım — yalnızca işaretleme katmanı objeleri. */
export function annotationProjection(doc: Y.Doc): string {
  const panels = panelsArray(doc).map((pm) => {
    const panel = readPanel(pm);
    const annotation = annotationLayerIds(panel.layers);
    return {
      id: panel.id,
      objects: panel.objects.filter((o) => annotation.has(o.layerId)),
    };
  });
  return stableStringify(panels);
}

/** Tüm dokümanın kararlı izdüşümü — "hiç değişmedi" kontrolü (İzleyici rolü). */
export function fullProjection(doc: Y.Doc): string {
  return protectedProjection(doc) + '|' + annotationProjection(doc);
}

/**
 * Bir panel Y.Map'inin annotation LayerId kümesi.
 *
 * Yalnız O PANELİN `layers` alanı okunur (O(panelin katman sayısı)) —
 * `annotationLayerIds` tam `readPanel` çıktısı üzerinde çalışır ve onu
 * çağırmak bütün paneli (objeleriyle) JSON'a çevirirdi; burada yalnız
 * katman listesi lazım.
 */
function panelAnnotationLayerIds(panelMap: Y.Map<any>): Set<string> {
  const layers = panelMap.get('layers') as Y.Array<Y.Map<any>> | undefined;
  const ids = new Set<string>();
  layers?.forEach((l) => {
    if (l.get('kind') === 'annotation') ids.add(l.get('id') as string);
  });
  return ids;
}

/**
 * Bir `transaction.changed` girdisinin (değişen TÜR + değişen ANAHTARLAR)
 * işaretleme KAPSAMINDA kaldığını POZİTİF olarak kanıtlar.
 *
 * KANITLAYAMADIĞI her durumda `false` döner: bu yalnız GÜVENLİ olduğu KESİN
 * bilinen durumu onaylıyor, güvensiz olduğunu kanıtlamaya çalışmıyor. Yanlış
 * "evet" hiçbir dalda çıkmaz — olsa olsa gereksiz yavaşlık (tam izdüşüme
 * düşmek) çıkar, asla izinsiz bir yazımı SERBEST bırakmaz.
 */
function turIsaretlemeKapsaminda(
  doc: Y.Doc,
  tur: Y.AbstractType<any>,
  anahtarlar: Set<string | null>,
): boolean {
  /* `meta`: yalnız `updatedAt` değiştiyse zararsız — `touch()` HER yazımda
     bunu değiştirir ve `protectedProjection` bu alanı zaten DIŞLIYOR
     (bkz. yukarısı, `_updatedAt` ayıklaması). */
  if (tur === metaMap(doc)) {
    for (const a of anahtarlar) if (a !== 'updatedAt') return false;
    return true;
  }

  /* Bir OBJENİN kendi Y.Map'i mi? Yapı sabit: panelsArray -> panelMap ->
     'objects' Y.Array -> objenin Y.Map'i. Şekil eşleşmesi TEK BAŞINA
     yetmiyor — `layers` dizisi de aynı şekle sahip (Y.Array<Y.Map>) — bu
     yüzden `panelMap.get('objects') === dizi` KİMLİK denetimi ile ayrılıyor,
     yalnız yapı benzerliğiyle değil. */
  if (tur instanceof Y.Map) {
    const dizi = tur.parent;
    const panelMap = dizi instanceof Y.Array ? dizi.parent : null;
    if (
      dizi instanceof Y.Array &&
      panelMap instanceof Y.Map &&
      panelMap.get('objects') === dizi &&
      panelMap.parent === panelsArray(doc)
    ) {
      /* `layerId`/`id` değiştiyse obje kapsam DIŞINA taşınmış OLABİLİR —
         kanıtlanamaz, çağıran tam denetime düşsün. */
      if (anahtarlar.has('layerId') || anahtarlar.has('id')) return false;
      const layerId = tur.get('layerId');
      return typeof layerId === 'string' && panelAnnotationLayerIds(panelMap).has(layerId);
    }
  }

  return false;
}

/**
 * Bir transaction'ın değiştirdiği HER ŞEYİN işaretleme kapsamında kaldığını
 * doğrular — O(değişen tür sayısı), BELGE BÜYÜKLÜĞÜNE değil (§17 borcu).
 *
 * `true` dönerse korumalı izdüşüm DEĞİŞEMEMİŞTİR (`protectedProjection`
 * işaretleme objelerini zaten `panelProtectedPart`'ta FİLTRELİYOR) — çağıran
 * ikinci bir tam `protectedProjection` hesabı yapmadan kabul edebilir.
 *
 * Yapısal dizi değişiklikleri (obje EKLEME/SİLME) kapsam DIŞI bırakılıyor:
 * `transaction.changed` silinen bir objenin `layerId`'sini vermiyor, yalnız
 * "bu dizi değişti" diyor — onun işaretleme objesi OLDUĞUNU ucuza kanıtlamanın
 * yolu yok. Sürüklenen/yeniden boyanan bir işaretleme objesi ise (en sık, en
 * gürültülü yol — her fare hareketinde bir mesaj) YALNIZ kendi alanlarını
 * değiştiriyor: hızlı yol tam onu hedefliyor.
 */
export function sadeceIsaretlemeDegisti(doc: Y.Doc, transaction: Y.Transaction): boolean {
  for (const [tur, anahtarlar] of transaction.changed) {
    if (!turIsaretlemeKapsaminda(doc, tur, anahtarlar)) return false;
  }
  return true;
}

export { stableStringify };
