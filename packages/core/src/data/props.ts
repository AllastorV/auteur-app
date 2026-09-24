/** Sahne objeleri kütüphanesi — basit vektör şekiller (SVG path). */

export type PropCategory = 'mobilya' | 'arac' | 'mekan' | 'nesne' | 'doga' | 'efekt';

export const PROP_CATEGORIES: { id: PropCategory; label: string }[] = [
  { id: 'mobilya', label: 'Mobilya' },
  { id: 'arac', label: 'Araç' },
  { id: 'mekan', label: 'Mekân' },
  { id: 'nesne', label: 'Nesne' },
  { id: 'doga', label: 'Doğa' },
  { id: 'efekt', label: 'Efekt' },
];

export interface PropDef {
  id: string;
  name: string;
  category: PropCategory;
  tags: string[];
  /** 100x100 viewBox içinde tanımlı path */
  path: string;
  width: number;
  height: number;
  filled: boolean;
}

const P = (
  id: string, name: string, category: PropCategory, tags: string[],
  path: string, width = 160, height = 160, filled = false,
): PropDef => ({ id, name, category, tags, path, width, height, filled });

export const PROPS: PropDef[] = [
  P('masa', 'Masa', 'mobilya', ['table', 'desk'],
    'M8 40 H92 V48 H8 Z M14 48 V88 H20 V48 Z M80 48 V88 H86 V48 Z', 200, 120),
  P('sandalye', 'Sandalye', 'mobilya', ['chair'],
    'M25 20 H70 V52 H25 Z M25 52 V90 H31 V52 Z M64 52 V90 H70 V52 Z M25 52 H70 V58 H25 Z', 110, 150),
  P('koltuk', 'Koltuk', 'mobilya', ['sofa', 'kanepe'],
    'M10 40 H90 V78 H10 Z M10 40 V30 H90 V40 M4 46 H14 V78 H4 Z M86 46 H96 V78 H86 Z', 220, 130),
  P('yatak', 'Yatak', 'mobilya', ['bed'],
    'M6 46 H94 V78 H6 Z M6 46 V26 H20 V46 M14 52 H40 V64 H14 Z', 240, 130),
  P('dolap', 'Dolap', 'mobilya', ['cabinet', 'wardrobe'],
    'M22 10 H78 V92 H22 Z M50 10 V92 M44 48 H46 V56 H44 Z M54 48 H56 V56 H54 Z', 140, 220),
  P('kutu', 'Kutu', 'nesne', ['box', 'kargo'],
    'M20 34 H80 V86 H20 Z M20 34 L34 20 H94 L80 34 M80 86 L94 72 V20', 130, 130),
  P('lamba', 'Ayaklı Lamba', 'mobilya', ['lamp'],
    'M36 12 H64 L72 40 H28 Z M48 40 V86 M32 90 H68', 100, 220),
  P('kapi', 'Kapı', 'mekan', ['door'],
    'M26 6 H74 V94 H26 Z M64 50 a3 3 0 1 0 0.1 0', 110, 230),
  P('pencere', 'Pencere', 'mekan', ['window'],
    'M12 18 H88 V78 H12 Z M50 18 V78 M12 48 H88', 200, 160),
  P('merdiven', 'Merdiven', 'mekan', ['stairs'],
    'M6 92 H26 V74 H46 V56 H66 V38 H86 V20 M6 92 V74 H26 V56 H46 V38 H66 V20 H86', 220, 200),
  P('duvar', 'Duvar', 'mekan', ['wall'],
    'M4 30 H96 V78 H4 Z M4 46 H96 M4 62 H96 M28 30 V46 M56 46 V62 M76 62 V78 M40 62 V78', 260, 130),
  P('araba-yan', 'Araba (Yan)', 'arac', ['car'],
    'M8 66 L16 46 H40 L52 32 H72 L84 46 H92 V66 Z M28 66 a8 8 0 1 0 0.1 0 M76 66 a8 8 0 1 0 0.1 0', 260, 130),
  P('araba-on', 'Araba (Ön)', 'arac', ['car front'],
    'M14 68 V44 L26 26 H74 L86 44 V68 Z M22 40 H78 M22 56 a5 5 0 1 0 0.1 0 M78 56 a5 5 0 1 0 0.1 0', 180, 150),
  P('bisiklet', 'Bisiklet', 'arac', ['bike'],
    'M24 68 a16 16 0 1 0 0.1 0 M76 68 a16 16 0 1 0 0.1 0 M24 68 L44 36 H62 L76 68 M44 36 L56 68 M62 36 H72', 200, 140),
  P('otobus', 'Otobüs', 'arac', ['bus'],
    'M8 24 H92 V72 H8 Z M8 40 H92 M22 72 a7 7 0 1 0 0.1 0 M78 72 a7 7 0 1 0 0.1 0 M28 28 H40 V38 H28 Z M52 28 H64 V38 H52 Z', 280, 140),
  P('agac', 'Ağaç', 'doga', ['tree'],
    'M50 6 C28 20 24 44 34 56 H66 C76 44 72 20 50 6 Z M46 56 V92 H54 V56 Z', 160, 220),
  P('dag', 'Dağ', 'doga', ['mountain'],
    'M4 88 L34 34 L52 60 L68 40 L96 88 Z M34 34 L44 48 L28 50 Z', 300, 160),
  P('bulut', 'Bulut', 'doga', ['cloud'],
    'M22 66 a14 14 0 0 1 2 -28 a18 18 0 0 1 34 -6 a14 14 0 0 1 20 12 a12 12 0 0 1 -4 22 Z', 200, 110),
  P('gunes', 'Güneş', 'doga', ['sun'],
    'M50 30 a20 20 0 1 0 0.1 0 M50 6 V16 M50 84 V94 M6 50 H16 M84 50 H94 M20 20 L27 27 M73 73 L80 80 M80 20 L73 27 M27 73 L20 80', 140, 140),
  P('telefon', 'Telefon', 'nesne', ['phone'],
    'M36 8 H64 V92 H36 Z M44 14 H56 V18 H44 Z M50 84 a3 3 0 1 0 0.1 0', 60, 130),
  P('laptop', 'Dizüstü', 'nesne', ['laptop', 'bilgisayar'],
    'M22 22 H78 V64 H22 Z M12 64 H88 L94 78 H6 Z', 200, 140),
  P('kamera', 'Kamera', 'nesne', ['camera'],
    'M14 34 H62 V74 H14 Z M62 44 L88 32 V76 L62 64 Z M24 26 H44 V34 H24 Z', 200, 130),
  P('kitap', 'Kitap', 'nesne', ['book'],
    'M18 20 H50 V84 H18 Z M50 20 H82 V84 H50 Z M50 20 V84', 150, 150),
  P('bardak', 'Bardak', 'nesne', ['cup', 'fincan'],
    'M30 26 H70 L64 82 H36 Z M70 36 a12 12 0 0 1 0 22', 90, 120),
  P('silah', 'Tabanca', 'nesne', ['gun', 'pistol'],
    'M14 34 H78 V48 H60 L54 60 H40 L34 48 H14 Z M40 60 L34 84 H48 L52 60 Z', 180, 110),
  P('canta', 'Çanta', 'nesne', ['bag'],
    'M22 38 H78 V88 H22 Z M38 38 V26 a12 12 0 0 1 24 0 V38', 140, 140),
  P('sandik', 'Sandık', 'nesne', ['chest', 'crate'],
    'M16 40 H84 V86 H16 Z M16 40 a34 18 0 0 1 68 0 M46 56 H54 V70 H46 Z', 180, 140),
  P('patlama', 'Patlama', 'efekt', ['explosion', 'boom'],
    'M50 4 L60 30 L86 20 L72 44 L96 54 L70 62 L82 88 L56 74 L50 96 L42 74 L18 88 L28 62 L4 54 L28 44 L14 20 L40 30 Z', 200, 200),
  P('hiz-cizgileri', 'Hız Çizgileri', 'efekt', ['speed lines', 'hareket'],
    'M6 26 H60 M6 42 H80 M6 58 H70 M6 74 H50', 220, 120),
  P('konusma-balonu', 'Konuşma Balonu', 'efekt', ['speech bubble'],
    'M10 14 H90 V66 H44 L26 86 V66 H10 Z', 200, 150),
  P('dusunce-balonu', 'Düşünce Balonu', 'efekt', ['thought bubble'],
    'M14 20 a24 16 0 0 1 72 0 a24 16 0 0 1 -72 0 M30 60 a7 7 0 1 0 0.1 0 M20 80 a5 5 0 1 0 0.1 0', 200, 160),
  P('isik-huzmesi', 'Işık Huzmesi', 'efekt', ['light beam'],
    'M40 6 H60 L88 92 H12 Z', 200, 200),
];

export function searchProps(query: string, category?: PropCategory | 'all'): PropDef[] {
  const q = query.trim().toLocaleLowerCase('tr');
  return PROPS.filter((p) => {
    if (category && category !== 'all' && p.category !== category) return false;
    if (!q) return true;
    return p.name.toLocaleLowerCase('tr').includes(q) || p.tags.some((t) => t.includes(q));
  });
}

export function getProp(id: string): PropDef | undefined {
  return PROPS.find((p) => p.id === id);
}
