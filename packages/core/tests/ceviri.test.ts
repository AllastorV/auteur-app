import { describe, expect, it } from 'vitest';
import {
  parcalaraBol,
  senaryoyuCevir,
  type CeviriSaglayici,
} from '@storyboard/core/dil/ceviri';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene: '', sceneId: 'sc1',
});

/** Metni büyük harfe çeviren sahte sağlayıcı — deterministik ve ölçülebilir. */
function sahteSaglayici(over: Partial<CeviriSaglayici> = {}): CeviriSaglayici & {
  cagrilar: string[][];
  diller: { hedef: string; kaynak?: string }[];
} {
  const cagrilar: string[][] = [];
  // Diller de KAYDEDİLİYOR: testlerin tamamı kayıp ve sıra eksenini ölçüyordu,
  // "doğru dile gitti mi" ekseni hiç yoktu — argümanlar takaslansa kimse
  // fark etmezdi ve kullanıcı Fransızca isteyip Türkçe alırdı.
  const diller: { hedef: string; kaynak?: string }[] = [];
  return {
    ad: 'sahte',
    azamiKarakter: 1000,
    azamiParca: 50,
    async cevir(parcalar, hedef, kaynak) {
      cagrilar.push([...parcalar]);
      diller.push({ hedef, kaynak });
      return parcalar.map((p) => `[${p}]`);
    },
    cagrilar,
    diller,
    ...over,
  } as CeviriSaglayici & {
    cagrilar: string[][];
    diller: { hedef: string; kaynak?: string }[];
  };
}

const SENARYO: ScriptBlock[] = [
  b('scene', 'İÇ. ESKİ APARTMAN - GECE'),
  b('action', 'Ayşe kapıyı iter.'),
  b('character', 'AYŞE'),
  b('dialogue', 'Kimse yok.'),
];

describe('parçalama İKİ sınırı birden uygular', () => {
  /* Yalnız karakteri saymak, bin tane tek harfli bloğu tek istekte gönderip
     parça limitine çarpardı; yalnız parçayı saymak, üç uzun bloğu gönderip
     karakter limitine çarpardı. */
  it('karakter sınırı grubu bölüyor', () => {
    const g = parcalaraBol(['aaaa', 'bbbb', 'cccc'], 8, 50);
    expect(g).toEqual([['aaaa', 'bbbb'], ['cccc']]);
  });

  it('parça sınırı grubu bölüyor', () => {
    const g = parcalaraBol(['a', 'b', 'c', 'd', 'e'], 1000, 2);
    expect(g).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  /* Bölmek cümleyi ortadan keser ve çeviriyi bozar; tek başına aşan parça
     KENDİ isteğinde gider. */
  it('tek başına sınırı aşan parça KENDİ grubunda, bölünmeden', () => {
    const dev = 'x'.repeat(50);
    const g = parcalaraBol(['a', dev, 'b'], 10, 50);
    expect(g).toEqual([['a'], [dev], ['b']]);
    expect(g.flat().join('')).toBe('a' + dev + 'b'); // hiçbir şey kesilmedi
  });

  it('hiçbir parça KAYBOLMUYOR', () => {
    const girdi = Array.from({ length: 37 }, (_, i) => 'x'.repeat(i + 1));
    expect(parcalaraBol(girdi, 40, 5).flat()).toEqual(girdi);
  });

  it('boş listede boş sonuç', () => {
    expect(parcalaraBol([], 100, 10)).toEqual([]);
  });

  it('geçersiz sınır sessizce kabul edilmiyor', () => {
    expect(() => parcalaraBol(['a'], 0, 10)).toThrow(/pozitif/);
    expect(() => parcalaraBol(['a'], 10, 0)).toThrow(/pozitif/);
  });
});

describe('çeviri uygulanıyor', () => {
  it('bloklar çevriliyor, tip ve kimlik korunuyor', async () => {
    const s = sahteSaglayici();
    const sonuc = await senaryoyuCevir(SENARYO, s, { hedefDil: 'en' });
    expect(sonuc.map((x) => x.type)).toEqual(SENARYO.map((x) => x.type));
    expect(sonuc.map((x) => x.id)).toEqual(SENARYO.map((x) => x.id));
    expect(sonuc[1].text).toBe('[Ayşe kapıyı iter.]');
  });

  /* Sağlayıcı `İÇ.` için "IN." der ve senaryo formatını bozar. Terimler
     Karar 23'ün TABLOSUNDAN gelir, yer adı makineden. */
  it('sahne başlığında YALNIZ yer adı sağlayıcıya gidiyor', async () => {
    const s = sahteSaglayici();
    await senaryoyuCevir(SENARYO, s, { hedefDil: 'en' });
    expect(s.cagrilar.flat()).toContain('ESKİ APARTMAN');
    expect(s.cagrilar.flat().join(' ')).not.toContain('İÇ.');
  });

  it('sahne başlığı hedef dilin TERİMLERİYLE yeniden kuruluyor', async () => {
    const s = sahteSaglayici();
    const sonuc = await senaryoyuCevir(SENARYO, s, {
      hedefDil: 'en',
      kaynakProfilDili: 'tr',
      hedefProfilDili: 'en',
    });
    expect(sonuc[0].text).toBe('INT. [ESKİ APARTMAN] - NIGHT');
  });

  /* Kotayı boşa harcar ve kimi sağlayıcı boş girdiye boş olmayan yanıt
     döner. */
  it('boş bloklar sağlayıcıya GÖNDERİLMİYOR', async () => {
    const s = sahteSaglayici();
    const sonuc = await senaryoyuCevir([b('action', ''), b('action', 'dolu')], s, {
      hedefDil: 'en',
    });
    expect(s.cagrilar.flat()).toEqual(['dolu']);
    expect(sonuc[0].text).toBe(''); // boş blok olduğu gibi kaldı
    expect(sonuc[1].text).toBe('[dolu]');
  });

  it('ilerleme bildiriliyor', async () => {
    const s = sahteSaglayici({ azamiParca: 2 });
    const adimlar: number[] = [];
    await senaryoyuCevir(SENARYO, s, {
      hedefDil: 'en',
      onIlerleme: (biten) => adimlar.push(biten),
    });
    expect(adimlar).toEqual([2, 4]);
  });
});

describe('HEPSİ ya da HİÇBİRİ — veri kaybı yolu (§16.4)', () => {
  /* Bu dosyadaki en kritik denetim: sağlayıcı 10 parçaya 9 yanıt dönerse
     naif bir eşleme bütün blokları BİR KAYDIRIR ve senaryo makul görünen
     bir çöpe dönüşür. Hata değil, SESSİZ BOZULMA olurdu. */
  it('eksik yanıt FIRLATIYOR, kaydırarak uygulamıyor', async () => {
    const s = sahteSaglayici({
      async cevir(parcalar) {
        return parcalar.slice(1).map((p) => `[${p}]`);
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en' })).rejects.toThrow(
      /parça gönderildi.*yanıt geldi/s,
    );
  });

  it('fazla yanıt da fırlatıyor', async () => {
    const s = sahteSaglayici({
      async cevir(parcalar) {
        return [...parcalar.map((p) => `[${p}]`), 'fazladan'];
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en' })).rejects.toThrow(/yanıt geldi/);
  });

  it('metin olmayan yanıt fırlatıyor', async () => {
    const s = sahteSaglayici({
      async cevir(parcalar) {
        return parcalar.map(() => null as unknown as string);
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en' })).rejects.toThrow(
      /metin olmayan/,
    );
  });

  it('dizi olmayan yanıt fırlatıyor', async () => {
    const s = sahteSaglayici({
      async cevir() {
        return 'tek dizge' as unknown as string[];
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en' })).rejects.toThrow(/yanıt geldi/);
  });

  it('sağlayıcı hatası yukarı çıkıyor — yarım sonuç dönmüyor', async () => {
    const s = sahteSaglayici({
      async cevir() {
        throw new Error('kota bitti');
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en' })).rejects.toThrow('kota bitti');
  });

  /* Yarım bir dizi döndürmek, çağıranın onu belgeye yazmasına ve senaryonun
     KARIŞIK DİLDE kalmasına yol açardı. */
  it('ORTADA hata: ilk grup başarılı olsa bile hiçbir şey dönmüyor', async () => {
    let cagri = 0;
    const s = sahteSaglayici({
      azamiParca: 2,
      async cevir(parcalar) {
        if (++cagri === 2) throw new Error('ikinci istek düştü');
        return parcalar.map((p) => `[${p}]`);
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en' })).rejects.toThrow(
      'ikinci istek düştü',
    );
    expect(cagri).toBe(2);
  });

  it('iptal FIRLATIYOR, yarım sonuç döndürmüyor', async () => {
    const iptal = { cancelled: false };
    const s = sahteSaglayici({
      azamiParca: 1,
      async cevir(parcalar) {
        iptal.cancelled = true;
        return parcalar.map((p) => `[${p}]`);
      },
    });
    await expect(senaryoyuCevir(SENARYO, s, { hedefDil: 'en', iptal })).rejects.toThrow(
      /iptal edildi.*dokunulmadı/s,
    );
  });

  it('başarılı çeviri KAYNAK diziyi değiştirmiyor', async () => {
    const kaynak = [...SENARYO];
    const oncekiMetin = kaynak.map((x) => x.text);
    await senaryoyuCevir(kaynak, sahteSaglayici(), { hedefDil: 'en' });
    expect(kaynak.map((x) => x.text)).toEqual(oncekiMetin);
  });
});

describe('çeviri DOĞRU DİLE gidiyor', () => {
  it('hedef dil sağlayıcıya olduğu gibi geçiyor', async () => {
    const s = sahteSaglayici();
    await senaryoyuCevir(SENARYO, s, { hedefDil: 'fr', kaynakDil: 'tr' });
    /* `> 0` yetmiyordu: "yalnız ilk grubu gönder" mutasyonu ondan sağ
       çıkardı. Dört bloğun hepsi doluysa TEK grup, yani TEK çağrı olmalı. */
    expect(s.diller).toHaveLength(1);
    expect(s.cagrilar[0]).toHaveLength(SENARYO.length);
    for (const d of s.diller) {
      expect(d.hedef).toBe('fr');
      expect(d.kaynak).toBe('tr');
    }
  });

  it('kaynak dil verilmezse geçilmiyor — sağlayıcı kendi tespit etsin', async () => {
    const s = sahteSaglayici();
    await senaryoyuCevir(SENARYO, s, { hedefDil: 'en' });
    for (const d of s.diller) {
      expect(d.hedef).toBe('en');
      expect(d.kaynak).toBeUndefined();
    }
  });
});
