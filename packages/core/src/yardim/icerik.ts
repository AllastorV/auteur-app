import { t } from '../dil/arayuz';

/**
 * YARDIM İÇERİĞİ — kod bilmeyen bir kullanıcı için.
 *
 * Kullanıcı kararı (2026-08-27): "net, kolay anlaşılır ve gerçekten
 * problemi çözmeye yönelik... kod bilmeyen kişiler için işe yarar yardım."
 *
 * ## Yazım kuralları — bu dosyanın bütün değeri burada
 *
 * 1. **Başlık kullanıcının sorusudur, konunun adı değil.** "Veri güvenliği"
 *    değil, "Yazdıklarım kayboldu mu?". İnsan yardıma bir SORUYLA gelir;
 *    konu başlıkları onu kendi sorusunu tercüme etmeye zorlar.
 *
 * 2. **İlk cümle cevaptır.** Açıklama sonra gelir. Panikleyen biri ilk
 *    satırdan sonrasını okumaz.
 *
 * 3. **Teknik terim yok.** "CRDT", "çıpa", "günlük", "commit" geçmez.
 *    Karşılığı yoksa cümle yeniden yazılır.
 *
 * 4. **Adım varsa numaralı.** "Şuraya bak" değil, "1. Menü → 2. Sürüm
 *    geçmişi → 3. ...".
 *
 * 5. **Yapabildiğimizde DÜĞME veriyoruz.** Yardım metninin sonunda
 *    kullanıcıyı ilgili pencereye götüren bir eylem varsa, okumak yerine
 *    yapmasını sağlar. Bir yardım sayfasının en iyi hâli, kendisini
 *    okutmadan sorunu çözmesidir.
 */

/** Yardım metnindeki tek bir parça. */
export type Parca =
  | { tip: 'p'; metin: string }
  /** Kalın açılış cümlesi — sorunun doğrudan cevabı. */
  | { tip: 'cevap'; metin: string }
  | { tip: 'liste'; maddeler: string[] }
  | { tip: 'adimlar'; maddeler: string[] }
  /** Kullanıcıyı ilgili yere götüren düğme. */
  | { tip: 'eylem'; etiket: string; komut: YardimKomutu }
  /** Dikkat çeken kutu — veri kaybı riski gibi. */
  | { tip: 'uyari'; metin: string };

/**
 * Yardımın tetikleyebileceği eylemler.
 *
 * Dizge birliği KASITLI: yardım modülü React ya da mağaza bilmiyor, saf
 * kalıyor; hangi pencerenin açılacağına kabuk karar veriyor.
 */
export type YardimKomutu =
  | 'ayarlar'
  | 'surum-gecmisi'
  | 'geri-donus'
  | 'kisayollar'
  | 'oturum'
  | 'disa-aktar'
  | 'yazarlik';

export interface YardimKonusu {
  id: string;
  /** Sol listede görünen kısa ad. */
  ad: string;
  /** Sayfanın başlığı — genellikle kullanıcının sorusu. */
  baslik: string;
  parcalar: Parca[];
}

/**
 * Konular — sıra ÖNEMLİ: en sık ve en korkutucu sorun üstte.
 *
 * "Yazdıklarım kayboldu mu?" ikinci sırada çünkü yardıma en panikli
 * gelinen soru odur; ilk sıradaki "Başlarken" ise ilk açılışta gelen
 * kullanıcıyı karşılıyor.
 */
export function konular(): YardimKonusu[] {
  return [
    {
      id: 'baslarken',
      ad: t('Başlarken'),
      baslik: t('Auteur nasıl çalışır?'),
      parcalar: [
        { tip: 'cevap', metin: t('Senaryonu yazarsın, programda sayfa sayısı ve süre kendiliğinden hesaplanır.') },
        { tip: 'p', metin: t('Auteur iki şeyi bir arada yapar: senaryo yazmak ve o senaryoyu görsel olarak planlamak (storyboard).') },
        {
          tip: 'adimlar',
          maddeler: [
            t('Kitaplık ekranında "Yeni proje" ile başla.'),
            t('Belgenin türünü seç (senaryo, roman, oyun…). Bu seçim sayfa düzenini belirler ve sonradan değişmez.'),
            t('Yazmaya başla. Satırın türünü (sahne başlığı, diyalog…) Ctrl+1…9 ile değiştirirsin.'),
            t('Üstteki sekmelerden Kartlar ve Storyboard görünümlerine geçebilirsin.'),
          ],
        },
        { tip: 'p', metin: t('Sayfa düzeni sektör standardıdır: yazı tipi, punto ve satır aralığı değiştirilemez. Bunun sebebi "1 sayfa ≈ 1 dakika" sözleşmesidir — ölçüler değişirse süre tahmini yalan söyler.') },
        { tip: 'eylem', etiket: t('Klavye kısayollarını gör'), komut: 'kisayollar' },
      ],
    },
    {
      id: 'kayip',
      ad: t('Yazdıklarım kayboldu mu?'),
      baslik: t('Yazdıklarım kayboldu mu?'),
      parcalar: [
        { tip: 'cevap', metin: t('Büyük ihtimalle hayır. Auteur yazdığın her şeyi saniyede bir diske kaydeder — kaydet düğmesine basmasan bile.') },
        { tip: 'p', metin: t('Program çökse, elektrik kesilse ya da bilgisayar kapansa bile en fazla son bir saniyen kaybolur. Programı tekrar açtığında kurtarma penceresi çıkar ve ne bulduğunu sorar.') },
        { tip: 'p', metin: t('Yazdığın bir şeyi geri getirmek istiyorsan üç yolun var:') },
        {
          tip: 'liste',
          maddeler: [
            t('Geri alma (Ctrl+Z) — az önce yaptığın değişiklik için.'),
            t('Geri dönüş noktaları — program her beş dakikada bir durumu kaydeder; bugünün herhangi bir anına dönebilirsin.'),
            t('Sürüm geçmişi — her kaydettiğinde bir sürüm saklanır; günler öncesine dönebilirsin.'),
          ],
        },
        { tip: 'uyari', metin: t('Geri dönmek yazdıklarını SİLMEZ: dönmeden önce şu anki hâlin de kaydedilir, istersen geri gelebilirsin.') },
        { tip: 'eylem', etiket: t('Geri dönüş noktalarını aç'), komut: 'geri-donus' },
        { tip: 'eylem', etiket: t('Sürüm geçmişini aç'), komut: 'surum-gecmisi' },
      ],
    },
    {
      id: 'dosyalar',
      ad: t('Dosyalarım nerede?'),
      baslik: t('Projelerim nerede saklanıyor?'),
      parcalar: [
        { tip: 'cevap', metin: t('Kaydettiğin yerde. Auteur projeni .sbp uzantılı tek bir dosyaya yazar; içinde senaryo, storyboard ve görseller birlikte durur.') },
        { tip: 'p', metin: t('Bu dosyayı istediğin klasöre koyabilir, e-postayla gönderebilir, yedekleyebilirsin. Tek dosya taşındığında her şey taşınır.') },
        { tip: 'p', metin: t('Bunun dışında program kendi güvenlik kopyalarını da tutar — kurtarma kayıtları ve sürüm geçmişi. Onlar bilgisayarındaki uygulama klasöründedir ve programı kaldırsan bile silinmez.') },
        {
          tip: 'liste',
          maddeler: [
            t('Kitaplıkta bir proje görünüyor ama açılmıyorsa, dosya taşınmış ya da silinmiş demektir.'),
            t('Silinen projeler kitaplıktan kendiliğinden kalkar.'),
          ],
        },
      ],
    },
    {
      id: 'sayfa',
      ad: t('Sayfa sayısı değişti'),
      baslik: t('Sayfa sayım neden değişti?'),
      parcalar: [
        { tip: 'cevap', metin: t('Metni değiştirmediysen, sayfa sayısını etkileyen bir ayarı açmışsındır.') },
        { tip: 'p', metin: t('Sayfa sayısını değiştiren ayarlar:') },
        {
          tip: 'liste',
          maddeler: [
            t('Sayfa sonu sürekliliği — bölünen diyaloğa (DEVAMI VAR)/(DEVAM) satırları ekler; her bölünme iki satır demektir.'),
            t('Kağıt boyutu — A4 ve US Letter farklı yükseklikte.'),
          ],
        },
        { tip: 'p', metin: t('Sayfa sayısını DEĞİŞTİRMEYEN ayarlar: sayfa rengi, arayüz ölçeği, sahne numarası gösterimi, daktilo modu. Bunlar yalnız ekranı etkiler.') },
        { tip: 'uyari', metin: t('Süre hesabını "harf sayısından" ya da "blok başına özel" yaparsan, gösterilen süre artık sayfa sayısına bağlı değildir — "1 sayfa ≈ 1 dakika" sözleşmesi o modlarda geçerli olmaz.') },
        { tip: 'eylem', etiket: t('Bu ayarları aç'), komut: 'ayarlar' },
      ],
    },
    {
      id: 'aktarim',
      ad: t('Dışa aktarma'),
      baslik: t('Senaryomu nasıl teslim ederim?'),
      parcalar: [
        { tip: 'cevap', metin: t('Dışa aktar düğmesinden PDF alırsın — sektörde teslim biçimi budur.') },
        {
          tip: 'liste',
          maddeler: [
            t('PDF — teslim için. Sayfa düzeni editörde gördüğünle aynıdır.'),
            t('Final Draft (.fdx) ve Fountain — başka senaryo programlarına aktarmak için.'),
            t('Word (.docx) — ölçüler korunur ama sayfalamayı Word kendi yapar.'),
            t('Storyboard PDF, PNG dizisi ve animatik video — görsel plan için.'),
          ],
        },
        { tip: 'p', metin: t('Teslim etmeden önce başlık sayfasını doldur: senaryonun ilk sayfası olarak düzenlenir, adın ve iletişim bilgin oraya yazılır.') },
        { tip: 'uyari', metin: t('Ekrandaki sayfa rengi çıktıya YANSIMAZ. Koyu bir sayfada yazsan bile PDF her zaman beyaz zemine siyah yazı olarak çıkar.') },
        { tip: 'eylem', etiket: t('Dışa aktarma penceresini aç'), komut: 'disa-aktar' },
      ],
    },
    {
      id: 'ortak',
      ad: t('Birlikte çalışma'),
      baslik: t('Aynı senaryoyu başkasıyla yazabilir miyim?'),
      parcalar: [
        { tip: 'cevap', metin: t('Evet. Bir oturum açıp davet bağlantısı paylaşırsın; ikiniz aynı anda yazabilirsiniz.') },
        {
          tip: 'adimlar',
          maddeler: [
            t('Menü → Ortak çalışma oturumu.'),
            t('Oturumu başlat; sana bir oda kodu ve davet bağlantısı verilir.'),
            t('Bağlantıyı paylaş. Karşı taraf tarayıcıdan da katılabilir, program kurması gerekmez.'),
          ],
        },
        { tip: 'p', metin: t('Herkesin imleci kendi renginde görünür. Kimin ne yazdığı ayrıca kaydedilir — bir replik için "bunu kim yazdı" sorusunu sorabilirsin.') },
        { tip: 'p', metin: t('Roller: sahip her şeyi yapar, editör yazar, yorumcu yalnız okur ve işaretleme katmanına çizer.') },
        { tip: 'eylem', etiket: t('Oturum penceresini aç'), komut: 'oturum' },
        { tip: 'eylem', etiket: t('Kim ne yazdı penceresini aç'), komut: 'yazarlik' },
      ],
    },
    {
      id: 'sorun',
      ad: t('Sorun giderme'),
      baslik: t('Bir şeyler ters gidiyor'),
      parcalar: [
        { tip: 'cevap', metin: t('En sık karşılaşılan üç durum ve çözümleri aşağıda.') },
        { tip: 'p', metin: t('Program ilk açılışta çok yavaş açıldı.') },
        {
          tip: 'liste',
          maddeler: [
            t('Bu normaldir ve bir kereliktir: Windows Defender programı ilk kez baştan sona tarar. Sonraki açılışlar bir saniye sürer.'),
          ],
        },
        { tip: 'p', metin: t('Proje dosyasına çift tıklıyorum, açılmıyor.') },
        {
          tip: 'liste',
          maddeler: [
            t('Ayarlar → Dosya türü bölümündeki düğmeye bas: .sbp dosyaları Auteur ile ilişkilendirilir.'),
            t('Bu arada dosyalar Auteur simgesini de alır.'),
          ],
        },
        { tip: 'p', metin: t('Ekranın altında "çökme koruması yok" yazıyor.') },
        {
          tip: 'liste',
          maddeler: [
            t('Tarayıcıdan bağlandığın oturumlarda bu koruma yoktur; yazdıkların yalnız sunucuya gider.'),
            t('Masaüstü programında bu yazı çıkıyorsa diske yazma engellenmiş demektir — diskin dolu olup olmadığına bak.'),
          ],
        },
        { tip: 'uyari', metin: t('Bu uyarıyı gördüğünde önemli bir metni uzun süre yazmaya devam etme; önce projeyi kaydet.') },
      ],
    },
  ];
}
