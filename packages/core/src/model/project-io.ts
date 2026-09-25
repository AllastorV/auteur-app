import JSZip from 'jszip';
import { PROJECT_SCHEMA_VERSION, type Project } from './types';
import { createProject } from './factory';
import { BLOK_TIPLERI, blockFingerprint, type ScriptBlockType } from './script';
import { uid } from '../util/id';
import { isDedicatedMapTextureAsset, referencedMapTextureAssetIds } from './world-map-textures';
import { parseMapOverlay } from './world-map';
import { t } from '../dil/arayuz';

/**
 * `.sbp` proje dosyası — içinde `project.json` ve `assets/` barındıran bir ZIP.
 *
 *   project.json          proje verisi (şema sürümü ile)
 *   assets/<id>.<ext>     gömülü görseller, bake edilmiş manken PNG'leri
 *   thumbnail.png         (opsiyonel) proje kapağı
 */

export const SBP_EXTENSION = '.sbp';
export const SBP_MIME = 'application/x-storyboard-project';

/** Asset kimliği → ham veri. Tarayıcıda ve Node'da aynı arayüz. */
export type AssetMap = Record<string, Uint8Array>;

export interface ProjectBundle {
  project: Project;
  assets: AssetMap;
  thumbnail?: Uint8Array;
}

function stripRuntimeFields(project: Project): Project {
  return {
    ...project,
    panels: project.panels.map(({ thumbnail: _thumb, ...panel }) => panel),
  };
}

export async function packProject(bundle: ProjectBundle): Promise<Uint8Array> {
  const zip = new JSZip();
  const project = stripRuntimeFields({
    ...bundle.project,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    meta: { ...bundle.project.meta, updatedAt: Date.now() },
  });
  const referenced = referencedMapTextureAssetIds(project.belge?.worldMaps);
  // Imported maps may also use a dedicated texture ID as a normal overlay.
  // Preserve those bytes whenever the overlay record itself is valid.
  for (const [key, value] of Object.entries(project.belge?.worldMaps ?? {})) {
    const match = /^(@project|[A-Za-z0-9_-]{1,100})\/overlay\/([A-Za-z0-9_-]{1,100})$/.exec(key);
    if (!match) continue;
    const overlay = parseMapOverlay(value, match[1], match[2]);
    if (overlay && isDedicatedMapTextureAsset(overlay.assetId)) referenced.add(overlay.assetId);
  }
  const archiveAssets = Object.entries(bundle.assets).filter(([id]) =>
    !isDedicatedMapTextureAsset(id) || referenced.has(id));
  zip.file('project.json', JSON.stringify(project, null, 2));
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        format: 'storyboard-studio',
        schemaVersion: PROJECT_SCHEMA_VERSION,
        assetCount: archiveAssets.length,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  const assets = zip.folder('assets')!;
  for (const [id, data] of archiveAssets) {
    assets.file(id, data);
  }
  if (bundle.thumbnail) zip.file('thumbnail.png', bundle.thumbnail);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function unpackProject(data: Uint8Array | ArrayBuffer): Promise<ProjectBundle> {
  const zip = await JSZip.loadAsync(data);
  const projectFile = zip.file('project.json');
  if (!projectFile) throw new Error(t('Geçersiz .sbp dosyası: project.json bulunamadı.'));
  const raw = JSON.parse(await projectFile.async('string'));
  const project = migrateProject(raw);

  const assets: AssetMap = {};
  const folder = zip.folder('assets');
  if (folder) {
    const entries: Promise<void>[] = [];
    folder.forEach((relativePath, file) => {
      if (file.dir) return;
      entries.push(
        file.async('uint8array').then((bytes) => {
          assets[relativePath] = bytes;
        }),
      );
    });
    await Promise.all(entries);
  }

  const thumbFile = zip.file('thumbnail.png');
  const thumbnail = thumbFile ? await thumbFile.async('uint8array') : undefined;

  return { project, assets, thumbnail };
}

/** Eski şema sürümlerini güncel modele taşır. */
export function migrateProject(raw: any): Project {
  if (!raw || typeof raw !== 'object') throw new Error(t('Proje verisi okunamadı.'));
  const version = Number(raw.schemaVersion ?? 0);
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Bu proje daha yeni bir sürümle kaydedilmiş (şema ${version}). Lütfen uygulamayı güncelleyin.`,
    );
  }
  // Eksik alanları varsayılanlarla tamamla.
  const base = createProject({ panels: [] });
  const rawScript = raw.script ?? {};
  const rawBlocks: any[] = Array.isArray(rawScript.blocks) ? rawScript.blocks : [];

  /* Şema ≤2 yükseltmesi: `fp` ve `sceneId` alanları yoktu.
     Blok kimlikleri AYNEN korunur — yeniden üretilirse mevcut panel bağları
     kopar ve bu geri dönüşü olmayan veri kaybıdır.
     Parmak izi `blockFingerprint` ile üretilir; ayrıştırıcının kullandığı
     fonksiyonun ta kendisidir, böylece yükseltilen proje yeniden içe
     aktarıldığında çapalar birebir tutar.
     Sahne kimliği, sahne BAŞLIĞINA göre gruplanarak üretilir. */
  const gorulen = new Map<string, number>();
  /** Blok index → sahne grubu. Her `scene` bloğu yeni grup başlatır. */
  const grup: number[] = [];
  let acikGrup = 0;
  const blocks = rawBlocks.map((b: any, i: number) => {
    /* Tip GÜVEN SINIRIDIR: dosya dışarıdan gelir, bozuk ya da elle kurcalanmış
       olabilir. Doğrulanmadan `ScriptBlockType`'a sokulursa "SAÇMA" gibi bir
       değer süzülmeden modele girer. */
    const type: ScriptBlockType = BLOK_TIPLERI.has(b?.type) ? b.type : 'action';
    const text = typeof b?.text === 'string' ? b.text : '';
    const scene = typeof b?.scene === 'string' ? b.scene : '';

    if (type === 'scene' && i > 0) acikGrup++;
    grup[i] = acikGrup;

    /* Sayaç HER blokta ilerler — `parseFountain` de öyle yapar (`script.ts`).
       Yalnız `fp` boş olanlarda ilerletmek, aynı `type+text`'e sahip iki bloktan
       birinin `fp`'si doluyken diğerine `_2` soneki vermez: iki blok aynı `fp`'yi
       alır ve `reconcileScript` tek anahtar altında iki indeksli kuyruk kurup
       çapayı yanlış bloğa bağlayabilir. */
    const uretilen = blockFingerprint(type, text, gorulen);
    const fp = typeof b?.fp === 'string' && b.fp ? b.fp : uretilen;

    const sceneId = typeof b?.sceneId === 'string' && b.sceneId ? b.sceneId : '';
    const id = typeof b?.id === 'string' && b.id ? b.id : uid('sb');
    /* Yalnız GERÇEK `true` sayfa çevirir; `'1'`, `1`, `'evet'` gibi
       değerler dosyadan gelen gürültüdür ve sessizce sayfa açmamalı.
       Alan yokken (eski proje) `undefined` kalır — dosya şişmez. */
    const yeniSayfada = b?.yeniSayfada === true ? true : undefined;
    return { id, fp, type, text, scene, sceneId, yeniSayfada };
  });

  /* Grubun kimliği: gruptaki İLK dolu `sceneId` — sahne başlığı grubun ilk
     bloğu olduğu için başlığınki doğal olarak kazanır, `reconcileScript`'in
     sahne yürüyüşüyle aynı kural. Dolu alanların haritayı BESLEMESİ şart:
     beslemezse kısmi `sceneId` taşıyan projede aynı sahne ikiye bölünür
     (Ö-1 — `fp` sayacındaki tuzağın birebir aynısı).
     Gruplama ölçütü sahne BAŞLIĞIDIR, görünen numara değil: numara kullanıcı
     verisidir, `#1#` iki kez geçebilir ve numaraya göre gruplamak iki ayrı
     sahneyi tek kimlik altında birleştirirdi (Ö-2). */
  const grupKimlik = new Map<number, string>();
  blocks.forEach((b, i) => {
    if (b.sceneId && !grupKimlik.has(grup[i])) grupKimlik.set(grup[i], b.sceneId);
  });
  blocks.forEach((b, i) => {
    let sid = grupKimlik.get(grup[i]);
    if (!sid) {
      sid = uid('sc');
      grupKimlik.set(grup[i], sid);
    }
    b.sceneId = sid;
  });

  /* `meta.id` bir YOL SINIRIDIR: §15'in disk katmanı onu doğrudan dizin adı
     yapıyor. Dosya ortak çalışandan gelebilir, yani ham geçirilemez. Blok
     tipleri on satır yukarıda "Tip GÜVEN SINIRIDIR" diye denetleniyordu ama
     `meta` aynı fonksiyonda ham yayılıyordu. Bozuk kimlik DÜŞÜRÜLMEZ,
     tabandaki taze kimlik kullanılır — proje açılmayı sürdürsün. */
  const TERS_AYRAC = String.fromCharCode(92);
  const hamMeta = (raw.meta ?? {}) as Record<string, unknown>;
  const kimlikGecerli =
    typeof hamMeta.id === 'string' &&
    hamMeta.id.length > 0 &&
    !hamMeta.id.includes('/') &&
    !hamMeta.id.includes(TERS_AYRAC) &&
    !hamMeta.id.includes('..') &&
    hamMeta.id !== '.';

  const project: Project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    meta: { ...base.meta, ...hamMeta, ...(kimlikGecerli ? {} : { id: base.meta.id }) },
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    // Şema 1'de senaryo yoktu; eski projelerde `scriptRefs` alanı da bulunmaz.
    /* Panel dizisi elenmiyor ama NESNE OLMAYAN girdiler düşürülüyor: bir
       dizge ya da `null` panel, çizim katmanında "Cannot read properties of
       null" verir ve kullanıcı hangi panelin bozuk olduğunu göremez. */
    panels: (Array.isArray(raw.panels) ? raw.panels : [])
      .filter((p: unknown) => !!p && typeof p === 'object')
      .map((p: any) => ({
        ...p,
        scriptRefs: Array.isArray(p?.scriptRefs) ? p.scriptRefs : [],
      })),
    script: {
      name: typeof rawScript.name === 'string' ? rawScript.name : '',
      blocks,
    },
    /* Belgenin öteki kökleri (sözlük, karakterler, çekim dökümü, başlık
       sayfası, iki sütunlu belgenin çiftleri, revizyonlar...). Düz nesne
       değilse ATLANIR ve alan TANIMSIZ kalır; `belgeKokleriniYaz` tanımsız
       alanda köke DOKUNMAZ, yani bozuk bir alan belgede duran veriyi
       süpürmez. Alanların tek tek doğrulanması okuma yolundaki çözücülerin
       işi (`revizyonCoz`, `breakdownEkiDuzelt`, ...) — kural TEK yerde
       (Karar 2). */
    ...(raw.belge && typeof raw.belge === 'object' && !Array.isArray(raw.belge)
      ? { belge: raw.belge as Project['belge'] }
      : {}),
  };
  if (!project.panels.length) project.panels = createProject().panels;
  return project;
}

/** Windows'ta cihaz adı olarak ayrılmış, dosya adı olarak kullanılamayan adlar. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Dosya adı için güvenli proje adı. */
export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    // Windows sondaki nokta ve boşlukları sessizce kırpar.
    .replace(/[. ]+$/, '');
  if (!cleaned) return 'storyboard';
  // "CON.sbp" gibi adlar Windows'ta hiç açılamaz.
  if (RESERVED_NAMES.test(cleaned.replace(/\.[^.]*$/, ''))) return cleaned + '_';
  return cleaned;
}

/**
 * Dışa aktarma dosya adı şablonu.
 * `S{sahne}_C{cekim}.png` → `S1_C3.png`
 */
export function renderFileNameTemplate(
  template: string,
  vars: { sahne: string; cekim: string; panel: number; ad: string },
): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    switch (key) {
      case 'sahne': case 'scene': return vars.sahne;
      case 'cekim': case 'shot': return vars.cekim;
      case 'panel': case 'index': return String(vars.panel).padStart(3, '0');
      case 'ad': case 'name': return vars.ad;
      default: return _m;
    }
  });
}

export const DEFAULT_FILENAME_TEMPLATE = 'S{sahne}_C{cekim}.png';

/**
 * Şablon DEĞİŞKEN ADLARI arayüz dilinde gösterilir. İki takım da her zaman
 * çalışır (`renderFileNameTemplate` ikisini de tanıyor); değişen yalnız
 * kullanıcıya önerilen ad — İngilizce arayüzde `{sahne}` görmek anlamsızdı.
 */
export function dosyaAdiDegiskenleri(dil: 'en' | 'tr'): { varsayilan: string; adlar: string[] } {
  return dil === 'tr'
    ? { varsayilan: DEFAULT_FILENAME_TEMPLATE, adlar: ['sahne', 'cekim', 'panel', 'ad'] }
    : { varsayilan: 'S{scene}_C{shot}.png', adlar: ['scene', 'shot', 'panel', 'name'] };
}
