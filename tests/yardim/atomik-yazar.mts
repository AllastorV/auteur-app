/**
 * §15.5 çökme testinin KURBANI.
 *
 * Hedef dosyaya sonsuz döngüde iki farklı yükü sırayla atomik yazar. Ebeveyn
 * süreç rastgele bir anda öldürür; hedef dosya her koşulda ya bütünüyle eski
 * ya bütünüyle yeni olmak zorundadır.
 *
 * `.mts` ve düz TypeScript: Node kendi tip-soyma desteğiyle doğrudan koşar,
 * derleme adımı yok. Electron içeri girmez — `atomik.ts` bu yüzden ayrı bir
 * modül (bkz. o dosyanın başlığı).
 */
import { writeFileAtomic } from '../../apps/desktop/electron/atomik.ts';

const [, , hedef, boyutStr] = process.argv;
const boyut = Number(boyutStr);

const A = Buffer.alloc(boyut, 0x41); // 'A'
const B = Buffer.alloc(boyut, 0x42); // 'B'

// Ebeveyne "yazmaya başladım" der; öldürme anı buna göre ayarlanır.
process.stdout.write('hazir\n');

/* Her turda bir satır: ebeveyn öldürmeden önce KAÇ kez yazıldığını sayar.
   Ön koşul bu sayıya bakar — "artık geçici dosya kaldı mı" diye bakmak
   titrekti, çünkü öldürmenin tam `writeFileSync` içine denk gelmesine
   bağlıydı ve tam süit yükü altında düşüyordu (ölçüldü). */
for (let i = 0; ; i++) {
  writeFileAtomic(hedef, i % 2 === 0 ? A : B);
  process.stdout.write('t\n');
}
