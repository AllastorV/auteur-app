/**
 * Test dili TÜRKÇE'ye sabitlenir.
 *
 * Ürün varsayılanı İngilizce (kullanıcı kararı 2026-08-27) ama testler
 * Türkçe metin iddia ediyor ve Türkçe dizgiler t()'nin ANAHTARI — testleri
 * Türkçe koşturmak hem mevcut iddiaları korur hem de "anahtar hep var"
 * gerçeğine yaslanır. İngilizce sözlüğün eksiksizliği ayrı bir testte
 * (arayuz-dili.test.ts) ölçülür.
 */
import { arayuzDiliniAyarla } from '../packages/core/src/dil/arayuz';
import { anaDiliniAyarla } from '../apps/desktop/electron/metin';

arayuzDiliniAyarla('tr');
/* Ana süreç (Electron) metinleri de aynı sözleşmeyle: Türkçe koşar,
   İngilizcesi `apps/desktop/electron/metin.test.ts`te ölçülür. */
anaDiliniAyarla('tr');
