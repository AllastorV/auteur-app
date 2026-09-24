/**
 * YAZAR RENKLERİ — ortak çalışmada kimin yazdığını ayırt eden tek kaynak.
 *
 * Palet İKİ yüzeyde birden okunmak zorunda ve bu, renkleri seçen kısıttır:
 *
 * 1. **Kremimsi kağıt** (`--mzn-kagit` #f7f5f0) — senaryo imleci, seçim zemini
 *    ve düzenleme şeridi orada çiziliyor.
 * 2. **Karanlık kabuk** (`--mzn-sayfa-alani` #0a0c0e) — pano/tuval imleçleri
 *    (`CursorLayer`) orada çiziliyor.
 *
 * Paletin eski hâli YALNIZ karanlık zemine göre seçilmişti (#f97316, #facc15,
 * #4ade80 …); o parlak tonlar kremimsi kağıtta 1,5:1 dolayında kalıyor, yani
 * 2 px'lik bir imleç çizgisi kağıtta görünmüyordu. Yeni tonlar ikisinin
 * ORTASINDA duruyor: hem kağıttan hem koyu kabuktan en az 3:1 ayrılıyorlar.
 *
 * Ölçülen değerler (WCAG 2.1 göreli parlaklık, `tests/imlec.test.ts` iddia
 * ediyor — burada yazan sayı testte KIRMIZI verir, yorumla korunmaz):
 *
 * | renk | kağıt | koyu kabuk | üstündeki etiket yazısı |
 * |---|---|---|---|
 * | #de5747 | 3,47 | 5,19 | 4,95 |
 * | #b07f1c | 3,27 | 5,50 | 5,25 |
 * | #3f9e5f | 3,08 | 5,85 | 5,58 |
 * | #2a9aa4 | 3,08 | 5,84 | 5,57 |
 * | #4a86d8 | 3,39 | 5,31 | 5,07 |
 * | #9b62d6 | 3,77 | 4,77 | 4,55 |
 * | #d95a90 | 3,31 | 5,43 | 5,18 |
 * | #6f8c2c | 3,53 | 5,10 | 4,86 |
 *
 * Eşikler: grafik nesne (imleç çizgisi, şerit) için 3:1 — WCAG 1.4.11; ad
 * etiketinin YAZISI metin sayılır ve 4,5:1 — WCAG 1.4.3.
 */
export const USER_COLORS = [
  '#4a86d8', '#de5747', '#3f9e5f', '#b07f1c',
  '#9b62d6', '#2a9aa4', '#d95a90', '#6f8c2c',
];

/**
 * TEK YAZICIDA düşülen renk (kullanıcı kararı: "tek yazıcıda varsayılan bir
 * renge düşer").
 *
 * Sodyum amberin (§14 vurgu rengi) kağıtta okunur karşılığı — tek başına
 * yazan kişi kendini uygulamanın kendi renginde görüyor.
 *
 * Dizinin İLK üyesi DEĞİL ve bu kasıtlı: ilk üye olsaydı `colorForUser`'ın
 * boş kimlik kapısı sökülse bile karma sıfır verip aynı rengi döndürür,
 * yani kuralın kaldırıldığı hiçbir testte görünmezdi.
 */
export const VARSAYILAN_RENK = '#b07f1c';

/**
 * Ad etiketinin ÜZERİNDEKİ yazı rengi — kağıdın mürekkebi (`--mzn-kagit-metin`).
 *
 * Renk başına açık/koyu yazı seçen bir kural YOK: paletteki sekiz tonun
 * hepsi bu mürekkeple 4,5:1'i geçiyor (yukarıdaki tablo). Tek kural, tek
 * CSS satırı; palet değişip bir ton bu eşiğin altına düşerse test kırılır.
 */
export const ETIKET_YAZISI = '#141210';

/**
 * Kullanıcı kimliğinden TÜRETİLEN renk — aynı kişi her oturumda aynı rengi
 * alsın diye rastgele değil, deterministik.
 *
 * Kimlik BOŞSA varsayılana düşülür. Boş dizgeyi de karma fonksiyonundan
 * geçirmek bugün aynı sonucu verirdi (h = 0 → ilk üye), ama o eşitlik
 * TESADÜF: karma değişirse tek yazıcının rengi sessizce kayar. Kural açık
 * yazılırsa sökülmesi de görünür olur.
 */
export function colorForUser(userId: string): string {
  if (!userId) return VARSAYILAN_RENK;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length];
}

export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
