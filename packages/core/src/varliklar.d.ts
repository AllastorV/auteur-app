/**
 * Vite varlık içe aktarımları (URL olarak gelirler).
 *
 * `@expo-google-fonts/courier-prime` tip tanımı taşımıyor; TTF'i URL olarak
 * almak Vite'ın yerleşik davranışı (yeni bağımlılık gerekmiyor).
 */
declare module '*.ttf' {
  const url: string;
  export default url;
}

/** `?url` sonekiyle içe aktarılan varlıklar (Vite). */
declare module '*?url' {
  const url: string;
  export default url;
}

/**
 * `?raw` — dosyanın METNİ gömülüyor.
 *
 * Kanıt paketindeki bağımsız doğrulayıcı (`kanit/dogrula.mjs`) böyle
 * giriyor: gerçek bir dosya olarak yaşıyor ki testi onu `node` ile
 * KOŞTURABİLSİN; gömülü bir dizge olsaydı test yalnız dizgeyi doğrular,
 * ölü koda kefil olurdu.
 */
declare module '*?raw' {
  const icerik: string;
  export default icerik;
}
