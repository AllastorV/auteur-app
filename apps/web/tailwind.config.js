/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/core/src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      /* B · Kesme Masası — bkz. DESIGN.md. Değerler CSS değişkenlerinden
         geliyor ki palet TEK yerde yaşasın. */
      colors: {
        zemin: 'var(--mzn-zemin)',
        cubuk: 'var(--mzn-cubuk)',
        panel: 'var(--mzn-panel)',
        'sayfa-alani': 'var(--mzn-sayfa-alani)',
        denetim: 'var(--mzn-denetim)',
        etkin: 'var(--mzn-etkin)',
        kutu: 'var(--mzn-kutu)',
        kenar: 'var(--mzn-kenar)',
        'kenar-ic': 'var(--mzn-kenar-ic)',
        'kenar-denetim': 'var(--mzn-kenar-denetim)',
        ayirici: 'var(--mzn-ayirici)',
        metin: 'var(--mzn-metin)',
        'metin-guclu': 'var(--mzn-metin-guclu)',
        'metin-govde': 'var(--mzn-metin-govde)',
        'metin-ikincil': 'var(--mzn-metin-ikincil)',
        'metin-sonuk': 'var(--mzn-metin-sonuk)',
        'metin-etiket': 'var(--mzn-metin-etiket)',
        'metin-zayif': 'var(--mzn-metin-zayif)',
        'metin-cok-zayif': 'var(--mzn-metin-cok-zayif)',
        amber: 'var(--mzn-amber)',
        'amber-zemin': 'var(--mzn-amber-zemin)',
        'amber-kenar': 'var(--mzn-amber-kenar)',
        'amber-uzeri': 'var(--mzn-amber-uzeri)',
        kayitli: 'var(--mzn-kayitli)',
        'yapi-baslik': 'var(--mzn-yapi-baslik)',
        'yapi-kisi': 'var(--mzn-yapi-kisi)',
        'yapi-bag': 'var(--mzn-yapi-bag)',
        'yapi-bag-zemin': 'var(--mzn-yapi-bag-zemin)',
        'yapi-bag-metin': 'var(--mzn-yapi-bag-metin)',
        'yapi-bag-hover': 'var(--mzn-yapi-bag-hover)',
        kagit: 'var(--mzn-kagit)',
        'kagit-metin': 'var(--mzn-kagit-metin)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans Condensed', 'system-ui', 'sans-serif'],
        mono: ['Courier Prime', 'Courier New', 'Courier', 'monospace'],
      },
      /* Köşe yuvarlaması YOK — kesme masası bir alettir. Tek istisna
         durum noktaları, onlar `rounded-full` ile geliyor. */
      borderRadius: { DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0' },
    },
  },
  plugins: [],
};
