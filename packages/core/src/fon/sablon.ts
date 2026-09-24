/**
 * FON / DESTEK BAŞVURU ŞABLONLARI — veri modeli.
 *
 * ## Neden ayrı bir belge tipi, senaryonun içinde bir bölüm değil
 *
 * Kullanıcı kararı (2026-09-01): *"bu fon dosyalarını ayrı preset olarak
 * yapalım, şu anki senaryo yazım kısmına dokunmasın, ayrı belge bunlar."*
 * Doğru karar: başvuru dosyası senaryonun bir parçası değil, senaryodan
 * TÜRETİLEN ikinci bir belgedir ve kuruma o gider. Senaryo belgesinin
 * şeması, editörü ve sayfalayıcısı bu özellikten hiç etkilenmiyor.
 *
 * ## Neden TS veri dosyası, JSON değil
 *
 * JSON okumak masaüstünde `fs`, web'de `fetch` demek — aynı kural iki kod
 * yolunda yaşardı. TS'te tip denetimi bedava geliyor ve şekil
 * JSON-serileştirilebilir kalıyor: bir gün kullanıcı şablonu yüklenecekse
 * biçim hazır.
 *
 * ## Neden `surum` ve `kaynak` ZORUNLU
 *
 * ÖLÇÜLDÜ (2026-09-01): kurumların istediği ek listesi yıllık değişiyor —
 * indirilen resmî paketlerin adları `…-01102025.doc` ve `…-v3.doc`. Yanlış
 * listeyle yapılan başvuru elenir (Eurimages'ta bu kural yazılı: eksik ek
 * = otomatik elenme). Program bu yüzden hangi sürüme baktığını ve nereden
 * aldığını EKRANDA söylemek zorunda; "ölçmeden iddia etme" kuralının bu
 * ekrandaki karşılığı budur.
 *
 * ## Sınır neden `null` olabiliyor
 *
 * SGM'nin dört başvuru paketi, yönetmelik (RG 2019-10-15) ve SSS sayfası
 * tarandı: sinopsis/tretman için SAYFA SINIRI RESMÎ KAYNAKTA YOK. İkincil
 * rehber sitelerinde geçen "sinopsis 2 sayfa" gibi sayılar kaynaksız.
 * Uydurulmuş bir sınır, olmayan bir kuralı kullanıcıya dayatırdı — sınır
 * `null` kalıyor ve arayüz "kurum sınır belirtmemiş" diyor. Eurimages ise
 * sinopsis için 3 sayfayı yazılı olarak söylüyor; o sayı burada duruyor.
 */

/** Bölümün içeriği senaryodan TÜRETİLEBİLİR mi, türetilebiliyorsa neyden. */
export type FonKaynak =
  /** Türetilemez. Üretici YAZILMAZ, "Taslak üret" düğmesi GÖRÜNMEZ. */
  | 'elle'
  /** Künye: başlık sayfası + proje meta + toplam sayfa (+ süre, geçerliyse). */
  | 'kunye'
  /** Sahne listesi: tretmanın iskeleti — özet değil, doldurulacak çatı. */
  | 'sahne-listesi'
  /** Karakter dosyası: replik/kelime/ilk-son sahne. */
  | 'karakterler'
  /** Mekân listesi: iç-dış, sahne sayısı, pay. */
  | 'mekanlar'
  /** Bütçeyi ETKİLEYEN ölçülmüş sinyaller. Bütçenin kendisi DEĞİL. */
  | 'butce-sinyalleri';

export type FonSinirBirimi = 'sayfa' | 'kelime' | 'karakter';

export interface FonBolum {
  id: string;
  /**
   * Kurumun kendi listesindeki ad — ŞABLON DİLİNDE.
   * Tanım yeri burasıdır, `t()` ile SARILMAZ (`SEKME_ADLARI` kalıbı).
   */
  ad: string;
  /** Ne yazılacağı, kurumun notu varsa onunla birlikte. */
  aciklama: string;
  zorunlu: boolean;
  kaynak: FonKaynak;
  /** Kurum sınır belirtmemişse `null`. Uydurulmaz. */
  sinir: { birim: FonSinirBirimi; azami: number } | null;
  /** Ekin istendiği diller (ISO 639-1). Boşsa şablonun kendi dili. */
  diller: readonly string[];
  /**
   * Auteur bu eki ÜRETİYOR mu.
   *
   * `false` olanlar (noter onaylı imza sirküleri, ticaret odası belgesi,
   * muvafakatname…) kurumdan/üçüncü taraftan alınıyor. Yine de listede
   * duruyorlar: eksik ek başvuruyu düşürüyor ve kontrol listesinin işi
   * tam olarak bunu hatırlatmak. Üretilmeyeni üretiyormuş gibi göstermek
   * ise olmayan bir yeteneği vaat etmek olurdu.
   */
  uretilir: boolean;
  /** Kurumun bu ek için yazdığı biçim şartı (varsa) — ölçülmüş, tahmin değil. */
  bicim?: 'pdf' | 'docx' | 'xlsx';
}

export interface FonTeslim {
  /** Kabul edilen dosya biçimleri. */
  bicim: readonly ('pdf' | 'docx' | 'xlsx')[];
  /** Dosya başına bayt tavanı; kurum söylemediyse `null`. */
  azamiBayt: number | null;
  /** Filmin özgün adı HER belgenin içinde geçmeli mi. */
  baslikHerBelgede: boolean;
  /** Dosya adları içeriğine atıfta bulunmalı mı. */
  dosyaAdiIcerikAtifli: boolean;
  /** Eksik ek başvuruyu doğrudan eliyor mu. */
  eksikEkElenmeSebebi: boolean;
}

export interface FonSablonu {
  id: string;
  ad: string;
  kurum: string;
  /** BELGE dili — arayüz dilinden bağımsız. Çıktı kuruma gidiyor. */
  dil: 'tr' | 'en';
  /** Kaynak paketin tarihi/sürümü. */
  surum: string;
  kaynak: { url: string; erisim: string };
  /** Başvurunun yapıldığı kanal. Otomatik gönderim YOK, bilgi amaçlı. */
  basvuruKanali: string;
  teslim: FonTeslim;
  bolumler: readonly FonBolum[];
}

/**
 * FONKSİYON, SABİT DEĞİL.
 *
 * Şablon metinleri `t()` ile sarılmıyor (tanım yeri kuralı) ama bu liste
 * ileride arayüz dizgesi taşırsa modül kapsamında donardı. Kalıp
 * `ExportDialog.tsx:40` ile aynı.
 */
export function fonSablonlari(): readonly FonSablonu[] {
  return [SGM_SENARYO, SGM_UZUN_METRAJ, SGM_ORTAK_YAPIM, EURIMAGES_COPROD];
}

/**
 * "Çekim dili" — kurumların "ve Türkçe tercümesi" / "original version"
 * dediği sürüm. Gerçek bir dil kodu değil çünkü filmin dili şablonda
 * bilinmiyor; belgeyi yazan kişi biliyor.
 */
export const ORIJINAL = 'orijinal';

const DIL_ADLARI: Readonly<Record<string, Record<'tr' | 'en', string>>> = {
  [ORIJINAL]: { tr: 'özgün dil', en: 'original version' },
  tr: { tr: 'Türkçe', en: 'Turkish' },
  en: { tr: 'İngilizce', en: 'English' },
  fr: { tr: 'Fransızca', en: 'French' },
};

/** Dilin ŞABLON dilindeki adı — belgeye giren başlıkta kullanılıyor. */
export function dilAdi(dil: string, sablonDili: 'tr' | 'en'): string {
  return Object.prototype.hasOwnProperty.call(DIL_ADLARI, dil)
    ? DIL_ADLARI[dil][sablonDili]
    : dil;
}

/**
 * Belgedeki BİR bölüm — çok dilli ek her dil için ayrı bir örnek üretir.
 *
 * ## Neden dil başına ayrı bölüm
 *
 * Eurimages sinopsisi İngilizce VE Fransızca istiyor; SGM ortak yapım
 * yaratıcı eklerin her birini "ve Türkçe tercümesi" ile birlikte istiyor.
 * Tek bir bölüm bırakılsaydı kontrol listesi "dolu" der, kullanıcı tek
 * dille başvurur ve **eksik ek başvuruyu eler** (Eurimages'ta bu kural
 * yazılı). Ayrı bölüm, eksikliği GÖRÜNÜR kılıyor.
 *
 * ## Taslak neden yalnız ilk dilde
 *
 * Auteur ÇEVİRMİYOR. Türetilen taslak yalnız ilk (çoğunlukla özgün) dilde
 * yazılıyor; öteki dilin bölümü BOŞ açılıyor. Makine çevirisiyle doldurmak
 * kuruma giden bir belgeye denetlenmemiş metin koymak olurdu — §16.4'ün
 * çeviri penceresi ayrı ve kullanıcının denetiminde bir yol.
 */
export interface FonBolumOrnegi {
  /** `<bolumId>` ya da çok dilliyse `<bolumId>:<dil>`. */
  id: string;
  bolum: FonBolum;
  /** Boş dizge = tek dilli ek (şablonun kendi dili). */
  dil: string;
  /** Belgedeki başlık; çok dilliyse dil ekini taşır. */
  ad: string;
  /** Türetilen taslak BU örnekte yazılıyor mu. */
  taslakli: boolean;
}

/** Şablonun ÜRETİLEN eklerini belgedeki bölümlere açar. */
export function fonBolumleri(sablon: FonSablonu): FonBolumOrnegi[] {
  const cikti: FonBolumOrnegi[] = [];
  for (const bolum of sablon.bolumler) {
    if (!bolum.uretilir) continue;
    if (bolum.diller.length < 2) {
      cikti.push({ id: bolum.id, bolum, dil: bolum.diller[0] ?? '', ad: bolum.ad, taslakli: true });
      continue;
    }
    bolum.diller.forEach((dil, i) => {
      cikti.push({
        id: `${bolum.id}:${dil}`,
        bolum,
        dil,
        ad: `${bolum.ad} — ${dilAdi(dil, sablon.dil)}`,
        taslakli: i === 0,
      });
    });
  }
  return cikti;
}

export function fonSablonu(id: unknown): FonSablonu | null {
  if (typeof id !== 'string') return null;
  return fonSablonlari().find((s) => s.id === id) ?? null;
}

/* ─────────────────────────── ortak parçalar ─────────────────────────── */

/** SGM'nin üç paketinde de aynı olan teslim kuralları. */
const SGM_TESLIM: FonTeslim = {
  /* Paketlerde tek yazılı biçim şartı "MS Word formatında hazırlanmalıdır"
     (uzun metraj ek 6 ve 7). Genel bir biçim dayatması yazılı DEĞİL, o
     yüzden ikisi de kabul ediliyor. */
  bicim: ['pdf', 'docx'],
  azamiBayt: null,
  baslikHerBelgede: false,
  dosyaAdiIcerikAtifli: false,
  eksikEkElenmeSebebi: false,
};

const SGM_KANAL = 'e-Devlet (turkiye.gov.tr)';

/** Üç SGM paketinde de aynı sözlerle geçen, Auteur'ün üretmediği ekler. */
const harici = (id: string, ad: string, aciklama: string, zorunlu = true): FonBolum => ({
  id, ad, aciklama, zorunlu, kaynak: 'elle', sinir: null, diller: [], uretilir: false,
});

/* ───────────────────────────── SGM şablonları ───────────────────────── */

/**
 * Senaryo ve Diyalog Yazımı Desteği — 8 ek.
 * Kaynak: `senaryovediyalog-01102025doc.doc` (indirildi ve dönüştürüldü).
 * Başvuruyu YAZARIN kendisi yapıyor; bu yüzden yapımcı belgesi istenmiyor.
 */
const SGM_SENARYO: FonSablonu = {
  id: 'sgm-senaryo',
  ad: 'Senaryo ve Diyalog Yazımı Desteği',
  kurum: 'T.C. Kültür ve Turizm Bakanlığı — Sinema Genel Müdürlüğü',
  dil: 'tr',
  surum: '2025-10-01',
  kaynak: {
    url: 'https://sinema.ktb.gov.tr/TR-246696/senaryo-ve-diyalog-yazimi-destegi.html',
    erisim: '2026-09-01',
  },
  basvuruKanali: SGM_KANAL,
  teslim: SGM_TESLIM,
  bolumler: [
    {
      id: 'sinopsis', ad: 'Sinopsis',
      aciklama: 'Hikâyenin bütününü, sonunu da söyleyerek anlatan özet. Kurum sayfa sınırı belirtmemiş.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'tretman', ad: 'Tretman',
      aciklama: 'Sahne sahne akış. Taslak, senaryodaki sahne başlıklarından iskelet olarak kurulur; sahnede ne olduğunu sen yazarsın.',
      zorunlu: true, kaynak: 'sahne-listesi', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yazar-gorusu', ad: 'Senaryo ve diyalog yazarı görüşü',
      aciklama: 'Projeyi neden yazdığın, neyi anlatmak istediğin. Türetilemez.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yazar-biyo', ad: 'Senaryo ve diyalog yazarının biyografisi ve filmografisi',
      aciklama: 'Özgeçmiş ve daha önceki işler.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    harici('uyarlama-beyani', 'Uyarlama izni veya uyarlama olmadığına dair beyan',
      'Senaryo uyarlamaysa eser sahibinden ya da mirasçılarından alınmış izin belgesi; değilse olmadığına dair beyan.'),
    harici('biyografik-beyan', 'Biyografik çalışma izni veya olmadığına dair beyan',
      'Biyografik çalışmaysa kişiden ya da mirasçılarından alınmış izin belgesi; değilse olmadığına dair beyan.'),
    harici('danisman-beyani', 'Danışman(lar)ın imzalı beyanı',
      'Projede danışman yer alacaksa imzalı beyanı.', false),
    harici('imza-beyannamesi', 'Noter onaylı imza beyannamesi örneği',
      'Başvuran yazarın imzasını gösteren, noterden alınmış beyanname.'),
  ],
};

/**
 * Uzun Metrajlı Sinema Film Yapım Desteği — 24 ek.
 * Kaynak: `uzun-metraj-v3doc.doc`.
 * Ek 6 ve 7'de kurumun kendi yazdığı şart: "(MS Word formatında
 * hazırlanmalıdır)" — bu yüzden o iki bölümde `bicim: 'docx'`.
 */
const SGM_UZUN_METRAJ: FonSablonu = {
  id: 'sgm-uzun-metraj',
  ad: 'Uzun Metrajlı Sinema Film Yapım Desteği',
  kurum: 'T.C. Kültür ve Turizm Bakanlığı — Sinema Genel Müdürlüğü',
  dil: 'tr',
  surum: '2025-10-01',
  kaynak: {
    url: 'https://sinema.ktb.gov.tr/TR-246697/uzun-metrajli-sinema-film-yapim-destegi.html',
    erisim: '2026-09-01',
  },
  basvuruKanali: SGM_KANAL,
  teslim: SGM_TESLIM,
  bolumler: [
    {
      id: 'sinopsis', ad: 'Sinopsis',
      aciklama: 'Hikâyenin bütünü. Kurum sayfa sınırı belirtmemiş.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'tretman', ad: 'Tretman',
      aciklama: 'Sahne sahne akış; iskelet senaryodan kurulur.',
      zorunlu: true, kaynak: 'sahne-listesi', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'senaryo', ad: 'Senaryo',
      aciklama: 'Senaryonun kendisi — kaynak belgeden doğrudan aktarılır.',
      zorunlu: true, kaynak: 'kunye', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yonetmen-gorusu', ad: 'Yönetmen görüşü',
      aciklama: 'Filmin biçimi, üslubu, görsel yaklaşımı.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yapimci-gorusu', ad: 'Yapımcı görüşü',
      aciklama: 'Kurumun notu: hedef kitle, dağıtım ve pazarlama stratejisini içerecek şekilde hazırlanmalıdır.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yonetmen-biyo', ad: 'Yönetmenin biyografisi ve filmografisi',
      aciklama: 'Kurumun notu: en az bir uzun metrajlı filmin izleme bağlantı adresini içermeli ve MS Word formatında hazırlanmalıdır.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true, bicim: 'docx',
    },
    {
      id: 'yapimci-biyo', ad: 'Yapımcının biyografisi ve filmografisi',
      aciklama: 'Kurumun notu: ilk tespitini yapmış olduğu en az bir uzun metrajlı filmin izleme bağlantısını içermeli ve MS Word formatında hazırlanmalıdır.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true, bicim: 'docx',
    },
    {
      id: 'yazar-biyo', ad: 'Senaryo ve diyalog yazarının biyografi ve filmografisi',
      aciklama: 'Özgeçmiş ve daha önceki işler.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'takvim', ad: 'Proje yapım ve sinema salonu gösterim takvimi',
      aciklama: 'Ön yapım, çekim, kurgu ve gösterim tarihleri.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'butce-sinyalleri', ad: 'Ayrıntılı bütçe — ölçülmüş sinyaller',
      aciklama: 'Bütçenin KENDİSİ değil: senaryodan ölçülen mekân sayısı, iç/dış dağılımı, gece kümeleri, özel eşya/kostüm/efekt dökümü. Rakamları sen koyarsın.',
      zorunlu: true, kaynak: 'butce-sinyalleri', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'finans-plani', ad: 'Finans planı',
      aciklama: 'Kurumun notu: Bakanlıktan talep edilen destek dışındaki mali kaynaklar açıklanmalıdır.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    harici('finans-belgeleri', 'Finans planını destekleyici belgeler',
      'Kurumun notu: sponsorluk, ön satış, niyet mektupları ve sözleşmeler eklenmelidir.', false),
    harici('mali-hak-sozlesmeleri', 'Mali hakların kullanım yetkisini içeren sözleşmeler',
      'Başvuru sahibi ile yönetmen, senaryo yazarı ve (animasyonda) animatör arasında; ya da imzalı muvafakatnameler.'),
    harici('uyarlama-beyani', 'Uyarlama izni veya uyarlama olmadığına dair beyan',
      'Eser sahibinden ya da mirasçılarından alınmış izin belgesi; değilse beyan.'),
    harici('biyografik-beyan', 'Biyografik çalışma izni veya olmadığına dair beyan',
      'Kişiden ya da mirasçılarından alınmış izin belgesi; değilse beyan.'),
    harici('animasyon-gorsel', 'Animasyon başvuruları için görsel hazırlık tasarımları',
      'Storyboard ve karakter tasarımları. Auteur\'ün storyboard modundan ayrıca aktarılır.', false),
    harici('animasyon-biyo', 'Animasyon başvuruları için animatör/karakter tasarımcısı biyografi ve filmografisi',
      'Yalnız animasyon başvurularında isteniyor; canlandırma ekibinin özgeçmişi ve önceki işleri.', false),
    harici('animasyon-beyan', 'Karakter tasarımlarının aidiyetine ilişkin imzalı beyan',
      'Tasarımların animatöre ve/veya karakter tasarımcısına ait olduğuna dair imzalı beyan ya da taahhütname.', false),
    harici('danisman-beyani', 'Danışman(lar)ın imzalı beyanı',
      'Projede danışman yer alacaksa imzalı beyanı; yer almayacaksa bu ek istenmiyor.', false),
    harici('ticari-faaliyet', 'Ticaret Odası ticari faaliyet belgesi örneği',
      'Kurumun notu: son altı ay içerisinde Ticaret Odasından alınmış olmalı.'),
    harici('yapimci-belgesi', 'Yapımcı belgesi örneği',
      'Bakanlıktan alınan, başvuru sahibinin yapımcı olduğunu gösteren belge.'),
    harici('imza-sirkuleri', 'Noter onaylı imza sirküleri örneği',
      'Başvuru sahibi tüzel kişiliğin imza yetkilerini gösteren, noterden alınmış sirküler.'),
    harici('yonetmen-tescil', 'Yönetmenin önceki filminin kayıt ve tescil belgesi örneği',
      'Daha önce çektiği bir uzun metrajlı film için.'),
    harici('yapimci-tescil', 'Yapımcının önceki filminin kayıt ve tescil belgesi',
      'Kurumun notu: mali hakları devralınan eserlere ilişkin kayıt tescil belgeleri kabul edilmeyecektir.'),
  ],
};

/**
 * Ortak Yapım Desteği — 20 ek.
 * Kaynak: `ortakyapim-01102025doc.doc`.
 * Ayırt edici şart: yaratıcı eklerin her biri "ve Türkçe tercümesi" ile
 * birlikte isteniyor — `diller` alanı bunu taşıyor.
 */
const SGM_ORTAK_YAPIM: FonSablonu = {
  id: 'sgm-ortak-yapim',
  ad: 'Ortak Yapım Desteği',
  kurum: 'T.C. Kültür ve Turizm Bakanlığı — Sinema Genel Müdürlüğü',
  dil: 'tr',
  surum: '2025-10-01',
  kaynak: {
    url: 'https://sinema.ktb.gov.tr/TR-246693/ortak-yapim-destegi.html',
    erisim: '2026-09-01',
  },
  basvuruKanali: SGM_KANAL,
  teslim: SGM_TESLIM,
  bolumler: [
    {
      id: 'sinopsis', ad: 'Sinopsis ve Türkçe tercümesi',
      aciklama: 'Özgün dilde ve Türkçe — kurum ikisini birden istiyor.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [ORIJINAL, 'tr'], uretilir: true,
    },
    {
      id: 'tretman', ad: 'Tretman ve Türkçe tercümesi',
      aciklama: 'Sahne sahne akış; iskelet senaryodan kurulur. Türkçe tercümesiyle birlikte.',
      zorunlu: true, kaynak: 'sahne-listesi', sinir: null, diller: [ORIJINAL, 'tr'], uretilir: true,
    },
    {
      id: 'senaryo', ad: 'Senaryo ve Türkçe tercümesi',
      aciklama: 'Senaryonun kendisi ve Türkçe tercümesi.',
      zorunlu: true, kaynak: 'kunye', sinir: null, diller: [ORIJINAL, 'tr'], uretilir: true,
    },
    {
      id: 'yonetmen-gorusu', ad: 'Yönetmen görüşü ve Türkçe tercümesi',
      aciklama: 'Filmin biçimi ve görsel yaklaşımı; Türkçe tercümesiyle.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [ORIJINAL, 'tr'], uretilir: true,
    },
    {
      id: 'yerli-yapimci-gorusu', ad: 'Yerli ortak yapımcı görüşü',
      aciklama: 'Türkiye ayağının yapım ve finansman yaklaşımı.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yabanci-yapimci-gorusu', ad: 'Yabancı ortak yapımcı görüşü ve Türkçe tercümesi',
      aciklama: 'Yabancı ortağın görüşü; Türkçe tercümesiyle.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [ORIJINAL, 'tr'], uretilir: true,
    },
    {
      id: 'yonetmen-biyo', ad: 'Yönetmenin biyografi ve filmografisi',
      aciklama: 'Özgeçmiş ve önceki işler.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yapimci-biyo', ad: 'Ortak yapımcıların biyografi ve filmografisi',
      aciklama: 'Her iki ortağın özgeçmişi.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'yazar-biyo', ad: 'Senaryo ve diyalog yazarının biyografi ve filmografisi',
      aciklama: 'Özgeçmiş ve önceki işler.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'oyuncu-listesi', ad: 'Oyuncu listesi',
      aciklama: 'Rol dağılımı. Taslak senaryodaki karakterlerden kurulur; oyuncuları sen yazarsın.',
      zorunlu: true, kaynak: 'karakterler', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'dagitim-plani', ad: 'Dağıtım planı',
      aciklama: 'Kurumun notu: gösterim platformu, öngörülen gösterim tarihi, ilk gösterim ülkesi, gösterim yapılacak ülkeler.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'takvim', ad: 'Proje yapım ve sinema salonu gösterim takvimi',
      aciklama: 'Ön yapım, çekim, kurgu ve gösterim tarihleri.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'butce-sinyalleri', ad: 'Ayrıntılı bütçe — ölçülmüş sinyaller',
      aciklama: 'Bütçenin kendisi değil: mekân sayısı, iç/dış dağılımı, gece kümeleri, özel eşya/kostüm/efekt dökümü.',
      zorunlu: true, kaynak: 'butce-sinyalleri', sinir: null, diller: [], uretilir: true,
    },
    {
      id: 'finans-plani', ad: 'Finans planı',
      aciklama: 'Kurumun notu: Bakanlıktan talep edilen destek dışındaki mali kaynaklar açıklanmalıdır.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: [], uretilir: true,
    },
    harici('yapim-sozlesmesi', 'Yabancı ortak yapımcıyla imzalanan yapım sözleşmesi ve Türkçe tercümesi',
      'Ortak yapım sözleşmesi; Türkçe tercümesiyle birlikte.'),
    harici('finans-belgeleri', 'Finans planını destekleyici belgeler',
      'Kurumun notu: sponsorluk, ön satış, niyet mektupları ve sözleşmeler eklenmelidir.', false),
    harici('yabanci-kurulus', 'Yabancı ortak yapımcıların kuruluş ve yetki belgeleri ve Türkçe tercümesi',
      'Yetkili makamlardan alınmış belge örneği.'),
    harici('ticari-faaliyet', 'Ticaret Odası ticari faaliyet belgesi örneği',
      'Kurumun notu: son altı ay içerisinde Ticaret Odasından alınmış olmalı.'),
    harici('yapimci-belgesi', 'Yapımcı belgesi örneği',
      'Başvuru sahibinin Bakanlıktan alınmış yapımcı belgesi.'),
    harici('imza-sirkuleri', 'Noter onaylı imza sirküleri örneği',
      'Başvuru sahibi tüzel kişiliğin imza yetkilerini gösteren, noterden alınmış sirküler.'),
  ],
};

/* ─────────────────────────── Eurimages ──────────────────────────────── */

/**
 * Eurimages — Support for co-production, Screen 6 compulsory items.
 * Kaynak: `en-itemstobeprovided-screen-6-rev-.pdf` (indirildi).
 *
 * SGM'den farkı: teslim kuralları YAZILI ve serttir. Belgeler PDF olmak
 * zorunda (yalnız bütçe tabloları EXCEL olabilir), dosya başına 6 MB tavanı
 * var, filmin özgün adı HER belgenin içinde geçmeli, dosya adları içeriğine
 * atıfta bulunmalı ve **eksik ek başvuruyu otomatik olarak eler.** Bunlar
 * kontrol listesinin uyarı metnine birebir giriyor.
 *
 * Şablonun dili İngilizce: ekler İngilizce (çoğu ayrıca Fransızca) isteniyor.
 */
const EURIMAGES_COPROD: FonSablonu = {
  id: 'eurimages-coprod',
  ad: 'Co-production Support',
  kurum: 'Council of Europe — Eurimages',
  dil: 'en',
  surum: '2026',
  kaynak: {
    url: 'https://www.coe.int/en/web/eurimages/co-production-how-to-submit-an-application-',
    erisim: '2026-09-01',
  },
  basvuruKanali: 'Eurimages online application platform',
  teslim: {
    bicim: ['pdf', 'xlsx'],
    azamiBayt: 6 * 1024 * 1024,
    baslikHerBelgede: true,
    dosyaAdiIcerikAtifli: true,
    eksikEkElenmeSebebi: true,
  },
  bolumler: [
    {
      id: 'synopsis', ad: 'Synopsis',
      aciklama: 'Maximum 3 pages. Required in English AND French.',
      zorunlu: true, kaynak: 'elle', sinir: { birim: 'sayfa', azami: 3 },
      diller: ['en', 'fr'], uretilir: true,
    },
    {
      id: 'director-note', ad: "Director's comments",
      aciklama: 'Comprehensive comments on the style, structure and visual presentation of the film. For documentaries: visual approach, access to characters/situation/archives, and why the project is intended primarily for theatrical release. English AND French.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: ['en', 'fr'], uretilir: true,
    },
    {
      id: 'producer-note', ad: "Producer's note",
      aciklama: 'Business and production aspects: theme, genre and market positioning, target audience, circulation potential, why a co-production, budget viability, the amount requested and its rationale, track record, and an opinion on the Bechdel-Wallace test. English AND French.',
      zorunlu: true, kaynak: 'elle', sinir: null, diller: ['en', 'fr'], uretilir: true,
    },
    {
      id: 'script', ad: 'Script',
      aciklama: 'Original version (shooting language) AND English, and French if possible. For documentaries the treatment may replace the script.',
      zorunlu: true, kaynak: 'kunye', sinir: null, diller: [ORIJINAL, 'en'], uretilir: true,
    },
    {
      id: 'scene-list', ad: 'Treatment / scene breakdown',
      aciklama: 'Scene-by-scene outline derived from the script. Replaces the script for documentary projects.',
      zorunlu: false, kaynak: 'sahne-listesi', sinir: null, diller: ['en'], uretilir: true,
    },
    {
      id: 'summary-budget', ad: 'Summary budget',
      aciklama: 'In euros, costs broken down per co-producer. May be submitted as EXCEL.',
      zorunlu: true, kaynak: 'butce-sinyalleri', sinir: null, diller: [], uretilir: true,
      bicim: 'xlsx',
    },
    harici('detailed-budget', 'Detailed budget',
      "In euros and in the delegate producer's national currency, broken down per co-producer."),
    harici('coproduction-agreement', 'Co-production agreement(s) or deal memo(s)',
      'Including appendices and addenda, plus letters of intent, deal memos or contracts with distributors and the international sales agent. Original version AND English or French.'),
  ],
};
