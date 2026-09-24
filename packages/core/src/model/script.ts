/**
 * Senaryo içe aktarma — Fountain alt kümesi, Final Draft (.fdx) ve düz metin.
 *
 * Senaryo, storyboard panellerine bağlanabilmek için **adreslenebilir bloklara**
 * ayrılır. Blok kimlikleri kalıcıdır ve rastgele üretilir; içerikten türeyen
 * parmak izi (`fp`), yeniden içe aktarımda eski kimliği yeni bloğa devretmeye yarar.
 */

import { uid } from '../util/id';

export type ScriptBlockType =
  /* Senaryo / dizi / sahne oyunu / radyo oyunu ortak çekirdeği. */
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  /* §13.2 diğer doküman tipleri (F7). Ortak birlikte duruyorlar çünkü
     `ScriptBlock` tek bir tip ve belge tipi değişince blokların yeniden
     yazılması gerekmiyor — kullanıcı bir romanı senaryoya çevirdiğinde
     metni kaybetmemeli. Hangi tipin hangi bloklara izin verdiği
     `model/dokuman-tipi`'nde, format profilinde ise yalnız o tipin
     blokları tanımlı: tanımsız bir blok `sayfala`'da AÇIKÇA fırlıyor. */
  | 'bolum'
  | 'paragraf'
  | 'sayfa'
  | 'kare'
  | 'altyazi'
  | 'balon'
  | 'sahne-yonergesi'
  | 'ses'
  | 'muzik';

/** Dışarıdan gelen blok tipinin doğrulandığı küme. Kaynağı `ScriptBlockType`'a
 *  DERLEYİCİ ile bağlıdır: birliğe yeni bir tip eklenip buraya eklenmezse
 *  `satisfies` derlemeyi kırar — tip sessizce `'action'`a düşmez.
 *
 *  Burada durur çünkü kural TEK yerde olmalı: proje dosyasını okuyan
 *  (`migrateProject`) ve ProseMirror belgesini okuyan (`docToBloklar`)
 *  iki ayrı güven sınırı aynı kümeye bakar. */
export const BLOK_TIPLERI = new Set<string>(
  Object.keys({
    scene: true,
    action: true,
    character: true,
    parenthetical: true,
    dialogue: true,
    transition: true,
    bolum: true,
    paragraf: true,
    sayfa: true,
    kare: true,
    altyazi: true,
    balon: true,
    'sahne-yonergesi': true,
    ses: true,
    muzik: true,
  } satisfies Record<ScriptBlockType, true>),
);

export interface ScriptBlock {
  /** Kalıcı kimlik. Rastgeledir, içerikten türemez — metin değişse de yaşar. */
  id: string;
  /**
   * İçerik parmak izi. Yeniden içe aktarımda eski kimliği yeni bloğa
   * devretmek için eşleştirme anahtarıdır (bkz. `reconcileScript`).
   * Kimlik DEĞİLDİR: metin değişince değişir.
   */
  fp: string;
  type: ScriptBlockType;
  text: string;
  /** Sahne numarası — kullanıcıya görünen, değişebilir. */
  scene: string;
  /** Kalıcı sahne kimliği — panel bağının tutunduğu yer. */
  sceneId: string;
  /**
   * ELLE KONMUŞ SAYFA BAŞI (Ctrl+Enter) — "bu blok yeni sayfanın ilk satırı".
   *
   * `BlokStili.yeniSayfada` ile AYNI kuralın blok başına konan hâli; ikisi
   * `sayfala`'da tek koşulda birleşiyor, yani sayfalama kuralı yine tek
   * yerde (Karar 2). Profil alanı "bu TİP her zaman sayfa başlar" der
   * (roman bölümü), bu alan "bu SATIR bu projede sayfa başlasın" der.
   *
   * İSTEĞE BAĞLI ve bu bilinçli: dosyaya yalnız işaretli bloklar için
   * yazılır, zorunlu olsaydı her blok bir alan daha taşırdı.
   *
   * Yeniden içe aktarımda YAŞAMAZ: `.fdx`/`.fountain` böyle bir kavram
   * taşımıyor ve `reconcileScript` blokları dosyadan kuruyor.
   */
  yeniSayfada?: boolean;
}

export interface ScriptDoc {
  name: string;
  blocks: ScriptBlock[];
}

export function emptyScript(): ScriptDoc {
  return { name: '', blocks: [] };
}

/* ------------------------------------------------------------------ */
/* Kimlik                                                              */
/* ------------------------------------------------------------------ */

/** FNV-1a 32 bit — kısa, kararlı, kriptografik olmayan özet. */
function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Parmak izi içerikten türer. Aynı metin birden çok geçerse tekrar sayacı
 * eklenir — parmak izi yine kararlı ama benzersiz kalır.
 *
 * Özet **64 bittir**: `hash32` iki kez çalıştırılır — bir kez anahtarın
 * kendisiyle, bir kez de ters çevrilmiş varyantıyla — ve iki yarım
 * birleştirilir. 32 bit tek başına yetmiyordu: 5000 bloklu bir projede
 * doğum günü çakışma olasılığı ≈ %0,29 ve bir çakışma `reconcileScript`'te
 * yanlış kimlik devri, yani yanlış panel bağı demektir. Parmak izi bu
 * fazdan itibaren proje dosyalarına yazıldığı için genişletme şimdi yapıldı;
 * sonraya bırakılsa migrasyon borcu doğardı.
 *
 * İkinci yarım ters çevrilmiş metinden alınır. 1M girdilik ölçüm ~**62 efektif
 * bit** veriyor; kayıp alt 3 bittedir: `b0` tam korele (FNV-1a'nın 0. biti
 * karakter çoklu-kümesine bağlıdır, ters çevirme onu değiştirmez), b1≈0,75,
 * b2≈0,63. Tohum varyantı da ~62 bit verir — ikisi eşdeğerdir, bu seçim
 * keyfîdir. 62 bit hedefi fazlasıyla karşılıyor: 5000 blokta çakışma
 * olasılığı ≈ 2,5×10⁻¹².
 *
 * Dışa aktarılmıştır: şema 3 yükseltmesi (`migrateProject`) eski projelerin
 * bloklarına parmak izi üretirken BU fonksiyonu çağırmak zorundadır. İkinci bir
 * uygulama yazılırsa biçimler ayrışır, yükseltilen proje yeniden içe
 * aktarıldığında hiçbir çapa eşleşmez ve `reconcileScript` kimlikleri kaybeder.
 */
export function blockFingerprint(
  type: ScriptBlockType,
  text: string,
  seen: Map<string, number>,
): string {
  const key = type + '|' + text;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  const ters = [...key].reverse().join('');
  return hash32(key) + '-' + hash32(ters) + (n > 1 ? '_' + n : '');
}

/* ------------------------------------------------------------------ */
/* Fountain                                                            */
/* ------------------------------------------------------------------ */

/**
 * Türkçe senaryolarda İÇ./DIŞ. yaygındır; İngilizce INT./EXT. de desteklenir.
 *
 * Bu kalıplar **Türkçe küçük harfe çevrilmiş** satıra uygulanır: JavaScript'in
 * `/i` bayrağı `İ`→`i` ve `I`→`ı` dönüşümünü bilmez, `\b` de `ş`/`ç` gibi
 * harfleri sözcük karakteri saymaz — ikisi de Türkçe başlıkları kaçırırdı.
 */
export const SCENE_PREFIX = /^(int|ext|est|i\/e|int\/ext|iç\/dış|ic\/dis|iç|ic|dış|dis)[.\s/]/;
export const TRANSITION_TAIL = /(to:|kes:|kes\.|kararma\.?|açılma\.?|acilma\.?)$/;
export const CHARACTER_EXTENSION = /\s*\((v\.?o\.?|o\.?s\.?|o\.?c\.?|cont.?d|devam|ses)\)\s*$/i;
/**
 * Karakter adı azami uzunluğu — TEK ev.
 *
 * `editor/algila.ts` bunu 40 olarak ayrı tanımlıyordu; aynı belge iki farklı
 * eşikle tiplenince `KOMİSER YARDIMCISI MEHMET` içe aktarımda `character`,
 * algılamada `action` oluyordu. Tip değişimi girinti ve `oncekiBosSatir`
 * değiştirir, o da SAYFA SAYISINI değiştirir.
 */
export const KARAKTER_EN_UZUN = 60;

/**
 * Blok tipi → Türkçe etiket. TEK ev.
 *
 * İki elle yazılmış tablo vardı ve ŞİMDİDEN ayrışmıştı: `parenthetical`
 * sağ tık menüsünde "Parantez", Yazım sekmesinde "Parantezik" görünüyordu.
 * `Record<ScriptBlockType, string>` tam olmayı zorunlu kılıyor ama DEĞER
 * tutarlılığını hiçbir şey denetlemiyordu.
 */
export const BLOK_ETIKETLERI: Record<ScriptBlockType, string> = {
  scene: 'Sahne başlığı',
  action: 'Aksiyon',
  character: 'Karakter',
  parenthetical: 'Parantez',
  dialogue: 'Diyalog',
  transition: 'Geçiş',
  bolum: 'Bölüm',
  paragraf: 'Paragraf',
  sayfa: 'Sayfa',
  kare: 'Kare',
  altyazi: 'Altyazı',
  balon: 'Balon',
  'sahne-yonergesi': 'Sahne yönergesi',
  ses: 'Ses',
  muzik: 'Müzik',
};

const SCENE_NUMBER_TAIL = /#([\w.-]+)#$/;
const LEADING_SCENE_NUMBER = /^(\d+[a-z]?)[.)\s]/i;

/** Küçük harf içermiyorsa "büyük harfli" sayılır (Türkçe karakterler dahil). */
function isUpper(s: string): boolean {
  return !/\p{Ll}/u.test(s);
}

/**
 * Kalıbı hem Türkçe hem ASCII küçük harf katlamasıyla dener.
 * Tek katlama yetmez: `tr` yerelinde `INT.` → `ınt.` olur (I → ı), ASCII
 * katlamasında ise `İÇ.` → `i̇ç.` bozulur. İkisini de denemek her iki yazımı
 * da yakalar.
 */
export function matchesFolded(pattern: RegExp, line: string): boolean {
  return pattern.test(line.toLowerCase()) || pattern.test(line.toLocaleLowerCase('tr'));
}

function stripNotes(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '') // boneyard
    .replace(/\[\[[\s\S]*?\]\]/g, ''); // notlar
}

/**
 * Fountain / düz metin senaryosunu bloklara ayırır.
 *
 * Desteklenen: sahne başlığı (INT./EXT./İÇ./DIŞ. veya `.` ile zorlanmış),
 * geçiş (`>` veya `... TO:`), karakter (`@` veya büyük harfli satır + ardından
 * dolu satır), parantez içi, diyalog, aksiyon.
 * Yok sayılan: başlık sayfası, bölüm (`#`), özet (`=`).
 */
export function parseFountain(source: string): ScriptBlock[] {
  const lines = stripNotes(source.replace(/\r\n?/g, '\n')).split('\n');
  const blocks: ScriptBlock[] = [];
  const seen = new Map<string, number>();
  let sceneCounter = 0;
  let currentScene = '';
  // İlk sahne başlığından önceki bloklar da bir sahneye ait olsun.
  let currentSceneId = uid('sc');
  let inDialogue = false;

  // Başlık sayfası: dosyanın en başındaki "Anahtar: değer" bloğu atlanır.
  let i = 0;
  if (/^[A-Za-zÇĞİÖŞÜçğıöşü ]+:/.test(lines[0] ?? '')) {
    while (i < lines.length && lines[i].trim() !== '') i++;
  }

  const push = (type: ScriptBlockType, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    blocks.push({
      id: uid('sb'),
      fp: blockFingerprint(type, clean, seen),
      type,
      text: clean,
      scene: currentScene,
      sceneId: currentSceneId,
    });
  };

  for (; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      inDialogue = false;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('=')) {
      inDialogue = false;
      continue;
    }

    const next = (lines[i + 1] ?? '').trim();

    /* Sahne başlığı — büyük harf şartı, "İç sesler duyulur" gibi aksiyon
       satırlarının sahne başlığı sanılmasını engeller. Gerekirse `.` ile zorla. */
    const forcedScene = line.startsWith('.') && !line.startsWith('..');
    if (forcedScene || (isUpper(line) && matchesFolded(SCENE_PREFIX, line))) {
      let text = forcedScene ? line.slice(1).trim() : line;
      const numbered = text.match(SCENE_NUMBER_TAIL);
      sceneCounter++;
      if (numbered) {
        currentScene = numbered[1];
        text = text.replace(SCENE_NUMBER_TAIL, '').trim();
      } else {
        const lead = text.match(LEADING_SCENE_NUMBER);
        currentScene = lead ? lead[1] : String(sceneCounter);
      }
      currentSceneId = uid('sc');
      push('scene', text);
      inDialogue = false;
      continue;
    }

    /* Ortalanmış metin (`>...<`) — Fountain'da bir AKSİYON biçimlendirmesidir,
       geçiş değil. İşaretler ayıklanmazsa yazarın metnine `>` ve `<` karışır. */
    if (line.startsWith('>') && line.endsWith('<') && line.length > 1) {
      push('action', line.slice(1, -1).trim());
      inDialogue = false;
      continue;
    }

    /* Şarkı sözü (`~`) — ayrı bir blok tipimiz yok, metni koru, işareti at. */
    if (line.startsWith('~')) {
      push(inDialogue ? 'dialogue' : 'action', line.slice(1).trim());
      continue;
    }

    /* Zorlanmış aksiyon (`!`) diyalog akışını KESER. Akış içinde de
       ayıklanmalı: yoksa `!` yazarın replik metnine yapışır. */
    if (line.startsWith('!')) {
      push('action', line.slice(1).trim());
      inDialogue = false;
      continue;
    }

    /* Geçiş */
    if (line.startsWith('>') && !line.endsWith('<')) {
      push('transition', line.slice(1).trim());
      inDialogue = false;
      continue;
    }
    if (isUpper(line) && matchesFolded(TRANSITION_TAIL, line) && !next) {
      push('transition', line);
      inDialogue = false;
      continue;
    }

    /* Parantez içi — yalnızca diyalog akışının içinde */
    if (inDialogue && line.startsWith('(') && line.endsWith(')')) {
      push('parenthetical', line);
      continue;
    }

    /* Karakter */
    const forcedChar = line.startsWith('@');
    const looksLikeCharacter =
      !forcedChar &&
      !!next &&
      isUpper(line) &&
      line.length <= KARAKTER_EN_UZUN &&
      /\p{Lu}/u.test(line.replace(CHARACTER_EXTENSION, ''));
    if (forcedChar || looksLikeCharacter) {
      /* İkili diyalog işareti (`^`) karakterin ADI DEĞİLDİR — ayıklanmazsa
         "MERT ^" diye bir karakter uydurulur ve analizde ayrı kişi sayılır. */
      const ad = (forcedChar ? line.slice(1) : line).replace(/\s*\^$/, '').trim();
      push('character', ad);
      inDialogue = true;
      continue;
    }

    /* Diyalog / aksiyon */
    if (inDialogue) push('dialogue', line);
    else push('action', line);
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/* Final Draft (.fdx)                                                  */
/* ------------------------------------------------------------------ */

const FDX_TYPES: Record<string, ScriptBlockType> = {
  'Scene Heading': 'scene',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
};

/**
 * Paragraf başlık sayfasının içinde mi?
 *
 * Final Draft başlık sayfasını `<TitlePage>` altında yine `<Paragraph>`
 * olarak yazar. Ayıklanmazsa senaryonun ilk sahnesinden ÖNCE künye satırları
 * aksiyon bloğu olarak akar ve yazar bunu ancak sayfa sayısı tutmadığında
 * fark eder.
 *
 * CSS seçici (`closest`) DEĞİL, ata zinciri yürünüyor: seçici motorunun XML
 * belgesinde etiket adını büyük/küçük harf duyarlı eşleştirmesi tarayıcıya
 * göre değişir, ata zinciri değişmez.
 */
function baslikSayfasinda(p: Element): boolean {
  for (let a = p.parentElement; a; a = a.parentElement) {
    if (a.tagName === 'TitlePage') return true;
  }
  return false;
}

/** Final Draft XML'ini bloklara ayırır. Tarayıcı ortamı gerektirir (DOMParser). */
export function parseFdx(source: string): ScriptBlock[] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('.fdx okumak için tarayıcı ortamı gerekir.');
  }
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Geçersiz .fdx dosyası.');
  const blocks: ScriptBlock[] = [];
  const seen = new Map<string, number>();
  let sceneCounter = 0;
  let currentScene = '';
  // İlk sahne başlığından önceki bloklar da bir sahneye ait olsun.
  let currentSceneId = uid('sc');

  for (const p of Array.from(doc.getElementsByTagName('Paragraph'))) {
    if (baslikSayfasinda(p)) continue;
    /* Tanınmayan paragraf tipi ATILMIYOR, aksiyona düşürülüyor. Final Draft
       `General`, `Shot`, `Cast List`, `New Act` gibi bir düzine tip daha
       yazar; hepsinin karşılığını tutmak yerine metni koruyup tipi kaybetmek
       tercih ediliyor. Tersi — sessizce atmak — yazarın metnini kaybettirir
       ve kayıp GÖRÜNMEZ olur (§15.4). */
    const type = FDX_TYPES[p.getAttribute('Type') ?? ''] ?? 'action';
    const text = Array.from(p.getElementsByTagName('Text'))
      .map((t) => t.textContent ?? '')
      .join('')
      .trim();
    if (!text) continue;
    if (type === 'scene') {
      sceneCounter++;
      currentScene = p.getAttribute('Number')?.trim() || String(sceneCounter);
      currentSceneId = uid('sc');
    }
    blocks.push({
      id: uid('sb'),
      fp: blockFingerprint(type, text, seen),
      type,
      text,
      scene: currentScene,
      sceneId: currentSceneId,
    });
  }
  return blocks;
}

/** Uzantıya göre doğru ayrıştırıcıyı seçer. */
/** Auteur Markdown çıktısının blok işaretlerini Fountain bölümleriyle karıştırmaz. */
export function parseMarkdown(source: string): ScriptBlock[] {
  const seen = new Map<string, number>();
  let scene = '';
  let sceneId = uid('sc');
  let sceneCounter = 0;
  return source.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((part) => {
    let text = part.trim();
    let type: ScriptBlockType = 'action';
    if (/^##\s+/.test(text)) { type = 'scene'; text = text.replace(/^##\s+/, ''); }
    else if (/^#\s+/.test(text)) { type = 'bolum'; text = text.replace(/^#\s+/, ''); }
    else if (/^\*\*[\s\S]*\*\*$/.test(text)) { type = 'character'; text = text.slice(2, -2); }
    else if (/^\*[\s\S]*\*$/.test(text)) {
      text = text.slice(1, -1);
      type = text.startsWith('(') && text.endsWith(')') ? 'parenthetical' : 'transition';
    } else if (/^>\s?/.test(text)) { type = 'dialogue'; text = text.replace(/^>\s?/gm, ''); }
    text = text.replace(/\\([\\\x60*_[\]#>+.-])/g, '$1');
    if (type === 'scene') { scene = String(++sceneCounter); sceneId = uid('sc'); }
    return { id: uid('sb'), fp: blockFingerprint(type, text, seen), type, text, scene, sceneId };
  }).filter((b) => b.text.length > 0);
}

export function parseScript(fileName: string, source: string): ScriptDoc {
  const blocks = /\.fdx$/i.test(fileName) ? parseFdx(source)
    : /\.(md|markdown)$/i.test(fileName) ? parseMarkdown(source) : parseFountain(source);
  return { name: fileName, blocks };
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/** Panellerin bağlandığı blokları tersten indeksler: blockId → panelId[]. */
export function scriptLinkIndex(
  panels: { id: string; scriptRefs?: string[] }[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const panel of panels) {
    for (const ref of panel.scriptRefs ?? []) {
      const list = index.get(ref);
      if (list) list.push(panel.id);
      else index.set(ref, [panel.id]);
    }
  }
  return index;
}

/** Seçili bloklardan panel meta'sı türetir — yeni panel senaryodan dolu doğar. */
export function metaFromBlocks(blocks: ScriptBlock[]): {
  scene: string;
  action: string;
  dialogue: string;
} {
  const scene = blocks.find((b) => b.scene)?.scene ?? '';
  const action = blocks
    .filter((b) => b.type === 'action' || b.type === 'scene')
    .map((b) => b.text)
    .join(' ')
    .slice(0, 400);
  const dialogue = blocks
    .filter((b) => b.type === 'dialogue' || b.type === 'parenthetical')
    .map((b) => b.text)
    .join(' ')
    .slice(0, 400);
  return { scene, action, dialogue };
}
