import { describe, expect, it } from 'vitest';
import { parseFountain, type ScriptBlock } from '@storyboard/core/model/script';
import { reconcileScript } from '@storyboard/core/model/reconcile';

const ONCE = `İÇ. MUTFAK - GECE

Buzdolabı uğulduyor.

SELİM
Gitmiyorum.

NURAY
Bavul koridorda.`;

describe('reconcileScript', () => {
  it('değişmeyen blokların kimliğini korur', () => {
    const prev = parseFountain(ONCE);
    const next = parseFountain(ONCE);
    const sonuc = reconcileScript(prev, next);
    expect(sonuc.map((b) => b.id)).toEqual(prev.map((b) => b.id));
  });

  it('metni değişen bloğun kimliğini korur — asıl düzeltilen hata', () => {
    const prev = parseFountain(ONCE);
    const next = parseFountain(ONCE.replace('Gitmiyorum.', 'Bu gece gitmiyorum.'));
    const sonuc = reconcileScript(prev, next);

    const eskiReplik = prev.find((b) => b.text === 'Gitmiyorum.')!;
    const yeniReplik = sonuc.find((b) => b.text === 'Bu gece gitmiyorum.')!;
    expect(yeniReplik.id).toBe(eskiReplik.id);
    expect(yeniReplik.fp).not.toBe(eskiReplik.fp);
  });

  it('araya eklenen blok yeni kimlik alır, komşuları kaymaz', () => {
    const prev = parseFountain(ONCE);
    const next = parseFountain(
      ONCE.replace('Buzdolabı uğulduyor.', 'Buzdolabı uğulduyor.\n\nSelim kapıyı tutuyor.'),
    );
    const sonuc = reconcileScript(prev, next);

    const eskiKimlikler = new Set(prev.map((b) => b.id));
    const yeni = sonuc.find((b) => b.text === 'Selim kapıyı tutuyor.')!;
    expect(eskiKimlikler.has(yeni.id)).toBe(false);

    const uguldayan = sonuc.find((b) => b.text === 'Buzdolabı uğulduyor.')!;
    expect(uguldayan.id).toBe(prev.find((b) => b.text === 'Buzdolabı uğulduyor.')!.id);
  });

  it('silinen blok düşer, kalanların kimliği korunur', () => {
    const prev = parseFountain(ONCE);
    const next = parseFountain(ONCE.replace('\n\nNURAY\nBavul koridorda.', ''));
    const sonuc = reconcileScript(prev, next);

    expect(sonuc.some((b) => b.text === 'Bavul koridorda.')).toBe(false);
    expect(sonuc.find((b) => b.text === 'Gitmiyorum.')!.id).toBe(
      prev.find((b) => b.text === 'Gitmiyorum.')!.id,
    );
  });

  it('tip değişirse kimlik devredilmez', () => {
    const prev = parseFountain(ONCE);
    const next = parseFountain(ONCE.replace('Buzdolabı uğulduyor.', 'KES:'));
    const sonuc = reconcileScript(prev, next);

    const gecis = sonuc.find((b) => b.type === 'transition');
    expect(gecis).toBeDefined();
    expect(gecis!.id).not.toBe(prev.find((b) => b.text === 'Buzdolabı uğulduyor.')!.id);
  });

  it('sahne başlığı değişse de sahne kimliği korunur', () => {
    const prev = parseFountain(ONCE);
    const next = parseFountain(ONCE.replace('İÇ. MUTFAK - GECE', 'İÇ. MUTFAK - ŞAFAK'));
    const sonuc = reconcileScript(prev, next);
    expect(sonuc[0].sceneId).toBe(prev[0].sceneId);
  });

  /* K-1: `fp`'nin tekrar sayacı KONUMSALDIR (`fp`, `fp_2`, `fp_3`). Başa bir
     AYŞE eklenince aşağıdaki her tekrarın sayacı bir kayar; 1. geçiş `fp`
     eşleşmesini konumdan bağımsız yaptığı için kimlikler bir blok kayarak
     yanlış satırlara oturuyordu — "Merhaba."nın karakter bloğunun kimliği hiç
     var olmamış yeni repliğin karakter bloğuna gidiyordu ve kayma o karakterin
     bütün blokları boyunca kümülatifti. Görünür yetim kalmanın aksine bu
     SESSİZ bir yanlış bağlanmadır: panel, yazarın hiç yazmadığı bir repliğe
     oturur ve kimse fark etmez (spec §15).
     Tekil çapa bunu keser: `AYŞE` iki tarafta da tekil değil → çapa olamaz;
     "Merhaba." ve "Nasılsın." tekil → çapa olur; karakter blokları boşluğa
     düşüp tip + sıra ile doğru hizalanır. */
  it('tekrarlı karakter bloğu, başa ekleme yapılınca kimlik kaydırmaz — K-1', () => {
    const ONCEKI = `İÇ. MUTFAK - GECE

AYŞE
Merhaba.

AYŞE
Nasılsın.`;
    const prev = parseFountain(ONCEKI);
    expect(prev.map((b) => b.type)).toEqual([
      'scene',
      'character',
      'dialogue',
      'character',
      'dialogue',
    ]);
    // Başa yepyeni bir AYŞE repliği eklenir; aşağıdaki AYŞE'lerin `fp` sayacı kayar.
    const next = parseFountain('AYŞE\nYeni replik.\n\n' + ONCEKI);

    const sonuc = reconcileScript(prev, next);

    /** Verilen repliğin hemen üstündeki karakter bloğu. */
    const karakteri = (metin: string, liste: ScriptBlock[]) =>
      liste[liste.findIndex((b) => b.text === metin) - 1];

    // Kimlik KENDİ repliğinin karakter bloğunda kalmalı.
    expect(karakteri('Merhaba.', sonuc).id).toBe(karakteri('Merhaba.', prev).id);
    expect(karakteri('Nasılsın.', sonuc).id).toBe(karakteri('Nasılsın.', prev).id);

    // Hiç var olmamış repliğin karakter bloğu kimseden kimlik çalmaz.
    const eskiKimlikler = new Set(prev.map((b) => b.id));
    expect(eskiKimlikler.has(karakteri('Yeni replik.', sonuc).id)).toBe(false);
    expect(eskiKimlikler.has(sonuc.find((b) => b.text === 'Yeni replik.')!.id)).toBe(false);
  });

  /* K-1'in simetrik yönü. Tekrarlı anahtarı "ilk geçtiği yer" yerine "son
     geçtiği yer" ile çapalamak başa eklemede tesadüfen doğru sonuç verir ama
     SONA eklemede aynı kaymayı üretir: yeni AYŞE, "Nasılsın."ın karakter
     bloğunun kimliğini kapar. Tekrarlı anahtar hangi uçtan seçilirse seçilsin
     çapa olamaz — bu test o kestirmeyi kapatır. */
  it('tekrarlı karakter bloğu, sona ekleme yapılınca da kimlik kaydırmaz — K-1', () => {
    const ONCEKI = `İÇ. MUTFAK - GECE

AYŞE
Merhaba.

AYŞE
Nasılsın.`;
    const prev = parseFountain(ONCEKI);
    const next = parseFountain(ONCEKI + '\n\nAYŞE\nYeni replik.');

    const sonuc = reconcileScript(prev, next);

    const karakteri = (metin: string, liste: ScriptBlock[]) =>
      liste[liste.findIndex((b) => b.text === metin) - 1];

    expect(karakteri('Merhaba.', sonuc).id).toBe(karakteri('Merhaba.', prev).id);
    expect(karakteri('Nasılsın.', sonuc).id).toBe(karakteri('Nasılsın.', prev).id);
    expect(sonuc.find((b) => b.text === 'Nasılsın.')!.id).toBe(
      prev.find((b) => b.text === 'Nasılsın.')!.id,
    );

    const eskiKimlikler = new Set(prev.map((b) => b.id));
    expect(eskiKimlikler.has(karakteri('Yeni replik.', sonuc).id)).toBe(false);
  });

  it('boş önceki listede her blok yeni kimlik alır — ve çıktı daima kopyadır', () => {
    const next = parseFountain(ONCE);
    const sonuc = reconcileScript([], next);
    expect(sonuc.map((b) => b.id)).toEqual(next.map((b) => b.id));

    // Sözleşme her yolda aynı: dönen liste de blokları da çağıranınkinden
    // ayrı nesnelerdir, yerinde değiştirmek `next`'i bozmaz (Ö-1).
    expect(sonuc).not.toBe(next);
    expect(sonuc[0]).not.toBe(next[0]);
    sonuc[0].id = 'sb_kirletildi';
    expect(next[0].id).not.toBe('sb_kirletildi');
  });
  /* --------------------------------------------------------------------
     Elle kurulan bloklar: parseFountain'in üretemeyeceği kenar durumları
     (yapay parmak izi çakışması, yer değiştirme) sınamak için.
     -------------------------------------------------------------------- */
  const blok = (
    id: string,
    fp: string,
    type: ScriptBlock['type'],
    text: string,
    sceneId = 'sc_test',
  ): ScriptBlock => ({ id, fp, type, text, scene: '1', sceneId });

  it('parmak izi çakışsa bile farklı tipteki eski bloğun kimliği devredilmez', () => {
    // fp'ler kasten AYNI. K-1'den sonra 1. geçiş `fp`'ye hiç bakmaz — çapa
    // anahtarı `tip + metin`tir — dolayısıyla özet çakışması artık tek başına
    // kimlik devrettiremez. Bu test o bağışıklığı sabitler: fp eşitliği geri
    // getirilirse `KES:` bloğu eski aksiyonun kimliğini alır ve kırmızıya döner.
    const prev = [blok('sb_eski_aksiyon', 'CAKISMA', 'action', 'Eski aksiyon.')];
    const next = [
      blok('sb_yeni_gecis', 'CAKISMA', 'transition', 'KES:'),
      blok('sb_yeni_aksiyon', 'zzz', 'action', 'Yeni aksiyon.'),
    ];
    const sonuc = reconcileScript(prev, next);

    expect(sonuc[0].id).toBe('sb_yeni_gecis');
    // Çakışan eski blok kuyruktan DÜŞÜRÜLMEZ; 2. geçişte doğru tipe hizalanır.
    expect(sonuc[1].id).toBe('sb_eski_aksiyon');
  });

  it('parmak izi 32 bitin ötesini ayırt eder', () => {
    // Bu iki metnin hash32 yarımı AYNIDIR — aranarak bulunmuş gerçek bir 32 bit
    // FNV-1a çakışması (ikisi de '1qtw8fk'). fp 32 bite geri döndürülürse iki
    // blok aynı parmak izini paylaşır ve reconcileScript yanlış kimlik devreder;
    // bu test o geri alışı kırmızıya çevirir.
    // Testi burada tutuyoruz: fp genişliği reconcileScript'in doğruluk önkoşulu.
    const bloklar = parseFountain(`Kapı 80678 kez gıcırdıyor.

Kapı 220102 kez gıcırdıyor.`);
    expect(bloklar.map((b) => b.type)).toEqual(['action', 'action']);

    // ÖN KOŞUL: bu çift yalnızca mevcut hash32 altında çakışır. fp'nin ilk
    // yarımı hash32(key)'dir (uint32'nin base36'sı '-' içermez), yani çakışmayı
    // hash32'yi dışa aktarmadan doğrulayabiliyoruz. hash32'nin tohumu veya
    // çarpanı değişirse bu iddia kırmızıya döner ve testin anlamını yitirdiğini
    // söyler — sessizce yeşil kalıp hiçbir şeyi korumamasındansa gürültülü
    // kırılması iyidir. Kırılırsa: yeni hash32 ile çakışan bir çift arayıp
    // aşağıdaki iki metni değiştirin.
    expect(bloklar[0].fp.split('-')[0]).toBe(bloklar[1].fp.split('-')[0]);

    // ASIL İDDİA: ilk yarımlar aynı olmasına rağmen tam parmak izleri farklı.
    expect(bloklar[0].fp).not.toBe(bloklar[1].fp);
    // Ayrımı tekrar sayacı değil, ikinci hash yarımı sağlamalı.
    expect(bloklar[0].fp).not.toMatch(/_\d+$/);
    expect(bloklar[1].fp).not.toMatch(/_\d+$/);
  });

  it('yer değiştiren bloklarda aynı kimlik iki kez devredilmez', () => {
    // 'a' ve 'b' yer değiştirmiştir: çapa adayları (sonuc 1 → prev 2) ve
    // (sonuc 3 → prev 0), yani prev tarafında AZALAN. LIS bunlardan yalnız
    // birini boşluk SINIRI yapar; ama ikisi de iki tarafta TEKİLDİR, dolayısıyla
    // ikisi de kimliğini taşır — taşınan blokla birlikte paneli de taşınır
    // (Karar 34). LIS'in görevi kimlik silmek değil, iskeleti ayrık tutmaktır.
    // Değişmeyen sözleşme: hiçbir eski kimlik İKİ bloğa birden devredilmez.
    // 'YENİ 4' o sözleşmeyi ISIRIR: 'b'nin prev index'i (2) son boşluğun prev
    // aralığının (1..3) içindedir; `prevKullanildi` filtresi kalkarsa 'YENİ 4'
    // 'sb_b'yi ikinci kez devralır.
    const prev = [
      blok('sb_a', 'fa', 'action', 'a'),
      blok('sb_x', 'fx', 'action', 'x'),
      blok('sb_b', 'fb', 'action', 'b'),
    ];
    const next = [
      blok('sb_n1', 'f1', 'action', 'YENİ 1'),
      blok('sb_n2', 'fb', 'action', 'b'),
      blok('sb_n3', 'f2', 'action', 'YENİ 2'),
      blok('sb_n4', 'fa', 'action', 'a'),
      blok('sb_n5', 'f3', 'action', 'YENİ 3'),
      blok('sb_n6', 'f4', 'action', 'YENİ 4'),
    ];
    const sonuc = reconcileScript(prev, next);

    const idler = sonuc.map((b) => b.id);
    expect(new Set(idler).size).toBe(idler.length);
    expect(idler.filter((id) => id === 'sb_x')).toHaveLength(1);
    expect(idler.filter((id) => id === 'sb_b')).toHaveLength(1);
    // LIS'in tuttuğu çapa kimliğini korur.
    expect(idler[3]).toBe('sb_a');
    // LIS DIŞINDA kalan tekil eşleşme de kimliğini korur — yetim kalmaz.
    expect(idler[1]).toBe('sb_b');
    // Eski kimlik kalmadığı için son blok taze kimliğiyle kalır.
    expect(idler[5]).toBe('sb_n6');
  });

  /* K-2: tekrarlı anahtarın çapa olamaması KODDA vardı ama hiçbir test onu
     ısırmıyordu. "Baştan silme" yönü: `fp` sayacı KONUMSAL olduğu için ilk
     AYŞE silinince hayatta kalan ikinci AYŞE'nin parmak izi `fa_2` → `fa`
     kayar; yani silinmiş bloğun parmak izini üstlenir. Tekrarlı anahtar çapa
     sayılıp "ilk geçiş kazanır" denirse hayatta kalan AYŞE silinmiş
     `sb_a1`'in kimliğini alır, ardından boşluk hizalaması `n2` bloğunu
     silinmiş `n1`'in kimliğine oturtur: iki blok birden yazarın sildiği
     satırların paneline bağlanır — görünür değil, SESSİZ yanlış bağlanma.
     Sağlam kodda AYŞE iki tarafta tekil olmadığı için çapa olmaz; `n2` ve
     `n3` çapalanır, AYŞE aradaki boşlukta doğru sıraya (`sb_a2`) hizalanır. */
  it('tekrarlı anahtar baştan silmede de çapa olmaz — K-2', () => {
    const prev = [
      blok('sb_n1', 'f1', 'action', 'n1'),
      blok('sb_a1', 'fa', 'character', 'AYŞE'),
      blok('sb_n2', 'f2', 'action', 'n2'),
      blok('sb_a2', 'fa_2', 'character', 'AYŞE'),
      blok('sb_n3', 'f3', 'action', 'n3'),
    ];
    // `n1` ve İLK `AYŞE` silinmiş; kalan AYŞE'nin sayacı `fa_2` → `fa` kaymış.
    const next = [
      blok('sb_y1', 'f2', 'action', 'n2'),
      blok('sb_y2', 'fa', 'character', 'AYŞE'),
      blok('sb_y3', 'f3', 'action', 'n3'),
    ];

    const sonuc = reconcileScript(prev, next);

    expect(sonuc.map((b) => b.id)).toEqual(['sb_n2', 'sb_a2', 'sb_n3']);
  });

  it('baştaki eşleşmemiş blok, devralınan sahne kimliğini ezmez', () => {
    // Sahne başlığı olmayan senaryo. sonuc[0] eşleşmemiştir ve sceneId'si taze
    // bir uid'dir; kalıcı olan devralınmış kimliği ezmemeli (k-1).
    const prev = [blok('sb_a', 'fa', 'action', 'a', 'ps0')];
    const next = [
      blok('sb_n1', 'fyeni', 'action', 'YENİ', 'sc_taze1'),
      blok('sb_n2', 'fa', 'action', 'a', 'sc_taze2'),
    ];
    const sonuc = reconcileScript(prev, next);

    expect(sonuc[1].id).toBe('sb_a');
    expect(sonuc.map((b) => b.sceneId)).toEqual(['ps0', 'ps0']);
  });
});
