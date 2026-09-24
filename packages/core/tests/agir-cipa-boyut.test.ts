import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { setAssets, setScript } from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { profilOlustur } from '@storyboard/core/format/profil';
import { GUN_MS, seyrelt, type KontrolNoktasi } from '@storyboard/core/veri/kontrol-noktalari';
// ponytail: apps/desktop kod, çekirdek paketten çağrılıyor — Electron'a bağlı
// DEĞİL (dosyanın kendi başlığı bunu söylüyor), ama sınır olağan dışı.
// Kullanıcı GERÇEK diski `gunlukDeposu` üzerinden istedi; sahte bir disk
// katmanı yazmak "ölç" talebini "tahmin et"e çevirirdi.
import { gunlukDeposu } from '../../../apps/desktop/electron/gunluk-deposu';
import { sayfayaGoreBloklar } from './yardim/agir-senaryo';

/**
 * AĞIR TEST — çıpa halkasının GERÇEK disk maliyeti (§15.2.2 için ÖLÇÜM).
 *
 * İlk hâlinde bir DÜZELTME testi değildi, yalnız sayıydı: varlıklar
 * (`setAsset` → `assetsMap`) doğrudan `Y.Doc`un İÇİNDE duruyor, çıpa da
 * belgenin TAM anlık görüntüsü (`Y.encodeStateAsUpdate`), yani halkadaki HER
 * nokta bütün görsellerin bir kopyasını taşıyordu. ÖLÇÜLDÜ: 50 sayfa + 20
 * varlık için tek çıpa 5,37 MB, varlık payı %97, 30 günlük halka 354,6 MB;
 * aynı senaryo varlıksız 10,8 MB — ~33 kat israf.
 *
 * Çözüm geldikten sonra (varlıklar çıpadan çıkarılıp içerik adresli depoya
 * bir kez yazılıyor, bkz. `apps/desktop/electron/varlik-deposu.ts`) bu dosya
 * KAZANCI da tartıyor: halka artık varlıkların 66 kopyasını değil ~1
 * kopyasını taşıyor. `varlikPayiYuzde` hâlâ BELLEKTEKİ çıpanın payını
 * ölçüyor — veri modeli değişmedi, değişen yalnız diske yazılan hâl.
 *
 * ## Yöntem
 *
 * - Senaryo: `agir-senaryo.ts`nin tohumlu üretecinden (`Math.random()` YOK).
 * - Halka uzunluğu TAHMİN edilmedi, `kontrol-noktalari.ts`teki `seyrelt`ten
 *   TÜRETİLDİ — `kontrol-noktalari.test.ts`teki §15.5 yöntemiyle AYNI: 5
 *   dakikada bir, 31 günlük sentetik seri → politika kaç nokta tutuyor.
 * - Halka toplamı EKRANDA HESAPLANMADI: `gunlukDeposu` ile GERÇEK dosyalar
 *   geçici bir dizine yazıldı, `fs.statSync` ile diskten okundu. Bu aynı
 *   zamanda "sıkışma" sorusunu da yanıtlıyor: aynı baytların N kopyası
 *   GERÇEKTEN N kat yer kaplıyor mu, yoksa bir yerde sessiz bir dedup mu var.
 *
 * ## Regresyon kapanı — ORAN, sabit bayt DEĞİL
 *
 * `agir-cokme-siniri.test.ts`teki dersle aynı: mutlak bayt sayısı veriye ve
 * zamana göre kayar, kimse güncelleyemez. Bunun yerine birim maliyet (bayt/
 * blok, bayt/varlık) matrisin İKİ UCUNDA karşılaştırılıyor; biri diğerinin
 * 3 katını aşarsa büyüme karesele dönmüş demektir.
 */

const TOHUM = 20260827;
const profil = profilOlustur('amerikan', 'a4', 'tr');

/** ~`kb` KB'lık gerçekçi boyutlu dataURL — deterministik, `Math.random` YOK. */
function varlikDataUrl(kb: number, tohum: number): string {
  const n = kb * 1024;
  const bayt = Uint8Array.from({ length: n }, (_, i) => (i * 7 + tohum) % 256);
  return `data:image/png;base64,${Buffer.from(bayt).toString('base64')}`;
}

function belgeOlustur(sayfa: number, varlikSayisi: number): { doc: Y.Doc; blokSayisi: number } {
  const doc = new Y.Doc();
  /* `clientID` VARINT olarak kodlanıyor — rastgele (Yjs varsayılanı) değerin
     bayt uzunluğu değişebilir ve `cipaBoyutu` koşudan koşuya birkaç bayt
     kayar (bkz. `kurtarma.test.ts`'teki AYNI düzeltme). Ölçüm deterministik
     olmalı, o yüzden SABİTLENDİ. */
  doc.clientID = 42;
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  const bloklar = sayfayaGoreBloklar(sayfa, profil, TOHUM);
  setScript(doc, { name: 'ölçüm', blocks: bloklar });
  if (varlikSayisi > 0) {
    const varliklar: Record<string, string> = {};
    for (let i = 0; i < varlikSayisi; i++) varliklar[`varlik_${i}`] = varlikDataUrl(200, i + 1);
    setAssets(doc, varliklar);
  }
  return { doc, blokSayisi: bloklar.length };
}

/** §15.5 yöntemi — `kontrol-noktalari.test.ts`teki `otuzGunlukSeri` ile AYNI. */
function halkaNoktalariniTuret(): KontrolNoktasi[] {
  const SIMDI = 1_800_000_000_000;
  const adim = 5 * 60_000;
  const noktalar: KontrolNoktasi[] = [];
  for (let yas = 0; yas < 31 * GUN_MS; yas += adim) noktalar.push({ id: `k${yas}`, zaman: SIMDI - yas });
  return seyrelt(noktalar, SIMDI).tutulan;
}

/** Sabit sayı YAZILMADI: politikadan türedi (bugün ~66, bkz. aşağıdaki sanity testi). */
const HALKA_NOKTALARI = halkaNoktalariniTuret();
const HALKA_SAYISI = HALKA_NOKTALARI.length;

const SAYFA_MATRISI = [10, 50, 200] as const;
const VARLIK_MATRISI = [0, 10, 50] as const;

interface HucreSonucu {
  sayfa: number;
  varlik: number;
  blokSayisi: number;
  /** Tek çıpanın boyutu, bayt. */
  cipaBoyutu: number;
  /** Aynı sayfa sayısında varlıksız çıpa — karşılaştırma tabanı. */
  varliksizCipaBoyutu: number;
  varlikPayiYuzde: number;
  /** Halkanın çıpa DOSYALARININ toplamı, bayt. */
  halkaDosyaToplami: number;
  /** İçerik adresli varlık deposunun boyutu — halkanın TAMAMI için BİR kez. */
  varlikDepoBoyutu: number;
  /** Halkanın GERÇEK disk maliyeti: çıpa dosyaları + varlık deposu. */
  halkaToplamDisk: number;
  /** Ayrıştırmadan ÖNCEKİ maliyet: her nokta tam çıpayı taşısaydı. */
  eskiHalkaToplamDisk: number;
}

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-cipa-olcum-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));
let projeSayaci = 0;

/**
 * Bir (sayfa, varlık) hücresini hem bellekte hem GERÇEK diskte ölçer.
 *
 * Halkanın TÜMÜ (`HALKA_SAYISI` nokta) `gunlukDeposu` ile geçici bir
 * projeye AYNI çıpa baytlarıyla yazılıyor — §4'ün sorduğu "aynı dataUrl'ün
 * N kopyası N kat mı kaplıyor" sorusu tam olarak bu. `seyreltme: false`:
 * sayıyı biz `HALKA_NOKTALARI`dan kontrol ediyoruz, deponun kendi seyrelmesi
 * araya girip hücreyi hücre yazarken sessizce budamasın.
 */
function hucreyiOlc(sayfa: number, varlik: number, varliksizBoyut: number): HucreSonucu {
  const { doc, blokSayisi } = belgeOlustur(sayfa, varlik);
  const cipa = Y.encodeStateAsUpdate(doc);

  /* Her hücre KENDİ kökünde: varlık deposu içerik adresli, yani komşu hücrenin
     yazdığı aynı görsel bu hücrenin maliyetini SIFIR gösterirdi. Dedup gerçek
     ve istenen bir kazanç ama ÖLÇÜMÜ kirletmemeli. */
  const hucreKoku = path.join(kok, `hucre-${projeSayaci++}`);
  const depo = gunlukDeposu(hucreKoku, 'proje');
  for (const nokta of HALKA_NOKTALARI) depo.cipaYazVeKes(cipa, nokta.zaman, false);
  const halka = depo.halka();
  expect(halka, 'yazılan nokta sayısı halkaya birebir yansımadı').toHaveLength(HALKA_SAYISI);
  const halkaDosyaToplami = halka.reduce((t, k) => t + fs.statSync(path.join(depo.dizin, k.id)).size, 0);
  const varlikDepoBoyutu = depo.varliklar.toplamBoyut();
  fs.rmSync(hucreKoku, { recursive: true, force: true }); // hücre bitti — peak disk kullanımı sınırlı kalsın.

  const payi = cipa.length === 0 ? 0 : ((cipa.length - varliksizBoyut) / cipa.length) * 100;
  return {
    sayfa,
    varlik,
    blokSayisi,
    cipaBoyutu: cipa.length,
    varliksizCipaBoyutu: varliksizBoyut,
    varlikPayiYuzde: payi,
    halkaDosyaToplami,
    varlikDepoBoyutu,
    halkaToplamDisk: halkaDosyaToplami + varlikDepoBoyutu,
    eskiHalkaToplamDisk: cipa.length * HALKA_SAYISI,
  };
}

describe('çıpa halkası — gerçek disk maliyeti (§15.2.2 ölçümü)', () => {
  const SONUCLAR: HucreSonucu[] = [];

  it(
    '3×3 matris: 10/50/200 sayfa × 0/10/50 varlık — tek çıpa + gerçek halka diski',
    () => {
      for (const sayfa of SAYFA_MATRISI) {
        // Varlıksız hücre önce: diğer ikisinin karşılaştırma tabanı.
        const { doc: bazDoc } = belgeOlustur(sayfa, 0);
        const bazBoyut = Y.encodeStateAsUpdate(bazDoc).length;
        for (const varlik of VARLIK_MATRISI) {
          SONUCLAR.push(hucreyiOlc(sayfa, varlik, bazBoyut));
        }
      }

      // ---- Sıkışma, ÇÖZÜM SONRASI: halka artık varlıkla ölçeklenmiyor ----
      for (const s of SONUCLAR) {
        if (s.varlik === 0) {
          /* Varlıksız çıpa DOKUNULMADAN yazılıyor — eski davranışın aynısı,
             bayt bayt. */
          expect(s.halkaToplamDisk, `sayfa=${s.sayfa}: varlıksız halka değişmemeli`)
            .toBe(s.cipaBoyutu * HALKA_SAYISI);
          expect(s.varlikDepoBoyutu).toBe(0);
          continue;
        }
        /* MUTANT KAPANI 1 — varlık süzgeci: kaldırılırsa çıpa dosyaları yine
           tam çıpa kadar olur ve bu ORAN patlar. Sabit bayt DEĞİL: halkanın
           dosya toplamı varlıksız halkanın en fazla 1,2 katı olmalı. */
        expect(
          s.halkaDosyaToplami,
          `sayfa=${s.sayfa} varlik=${s.varlik}: çıpa dosyaları hâlâ varlık taşıyor`,
        ).toBeLessThan(s.varliksizCipaBoyutu * HALKA_SAYISI * 1.2);
        /* MUTANT KAPANI 2 — depo yazımı ve dedup: depo, varlıkların 66
           kopyasını değil ~1 kopyasını tutmalı (üst sınır 1,5 kat: `dataUrl`
           diskte UTF-8 metin, belgede Yjs kodlaması). Alt sınır da var:
           depo yazımı atlanırsa boş kalır ve bu satır kırmızıya döner. */
        const varlikPayiBayt = s.cipaBoyutu - s.varliksizCipaBoyutu;
        expect(s.varlikDepoBoyutu, `sayfa=${s.sayfa} varlik=${s.varlik}: depo çoğaltıyor`)
          .toBeLessThan(varlikPayiBayt * 1.5);
        expect(s.varlikDepoBoyutu, `sayfa=${s.sayfa} varlik=${s.varlik}: depo hiç yazmamış`)
          .toBeGreaterThan(varlikPayiBayt * 0.5);
        /* KAZANÇ — sabit bir kat SAYISI değil, TÜRETİLMİŞ sınır.
           "10 kat" yazmak yanlış olurdu: kazanç varlık payıyla sınırlı ve
           200 sayfa + 10 varlık hücresinde iskelet baskın (halka 46 MB'ı
           zaten iskelet). Doğru iddia şu: halkadan varlıkların (N-2)
           kopyası DÜŞTÜ. Bu, matrisin her hücresinde aynı anlamı taşır. */
        expect(
          s.halkaToplamDisk,
          `sayfa=${s.sayfa} varlik=${s.varlik}: varlık kopyaları halkadan düşmemiş`,
        ).toBeLessThan(s.eskiHalkaToplamDisk - varlikPayiBayt * (HALKA_SAYISI - 2));
      }

      // ---- Varlık payı (§1): varlık arttıkça pay artmalı, varlıksızda pay sıfır ----
      for (const sayfa of SAYFA_MATRISI) {
        const satir = (v: number) => SONUCLAR.find((s) => s.sayfa === sayfa && s.varlik === v)!;
        expect(satir(0).varlikPayiYuzde).toBe(0);
        expect(satir(10).varlikPayiYuzde).toBeGreaterThan(0);
        expect(satir(50).varlikPayiYuzde).toBeGreaterThan(satir(10).varlikPayiYuzde);
      }

      // ---- Regresyon kapanı 1 — İSKELET: bayt/blok karesele dönmüyor ----
      // 200 sayfalık iskeletin blok başı maliyeti 10 sayfalığın 3 katını AŞMAMALI.
      // (Normalde SABİT ek yük büyük belgede blok başına daha UCUZ amortize
      // olur; ORAN büyük değilse tersi bir patlama yaşanmıyor demektir.)
      const iskelet10 = SONUCLAR.find((s) => s.sayfa === 10 && s.varlik === 0)!;
      const iskelet200 = SONUCLAR.find((s) => s.sayfa === 200 && s.varlik === 0)!;
      const baytBlok10 = iskelet10.cipaBoyutu / iskelet10.blokSayisi;
      const baytBlok200 = iskelet200.cipaBoyutu / iskelet200.blokSayisi;
      expect(baytBlok200, 'iskelet bayt/blok maliyeti kareselleşmiş görünüyor').toBeLessThanOrEqual(baytBlok10 * 3);

      // ---- Regresyon kapanı 2 — VARLIK: marjinal bayt/varlık karesele dönmüyor ----
      // 50 varlıklı hücrenin varlık başına EK maliyeti, 10 varlıklının 3 katını AŞMAMALI.
      for (const sayfa of SAYFA_MATRISI) {
        const satir = (v: number) => SONUCLAR.find((s) => s.sayfa === sayfa && s.varlik === v)!;
        const marj10 = (satir(10).cipaBoyutu - satir(10).varliksizCipaBoyutu) / 10;
        const marj50 = (satir(50).cipaBoyutu - satir(50).varliksizCipaBoyutu) / 50;
        expect(marj50, `sayfa=${sayfa}: varlık başına marjinal maliyet kareselleşmiş görünüyor`)
          .toBeLessThanOrEqual(marj10 * 3);
      }

      // ---- Raporu yaz — TABLO + JSON ----
      const CIKTI = path.resolve(__dirname, '../../../test-results/agir');
      fs.mkdirSync(CIKTI, { recursive: true });
      fs.writeFileSync(
        path.join(CIKTI, 'cipa-boyutu.json'),
        JSON.stringify({ halkaSayisi: HALKA_SAYISI, hucreler: SONUCLAR }, null, 2),
      );

      // eslint-disable-next-line no-console -- ölçüm testinin ÇIKTISI bu.
      console.log(`\nhalka noktası sayısı (30 günlük politika, türetildi) = ${HALKA_SAYISI}\n`);
      // eslint-disable-next-line no-console -- ölçüm testinin ÇIKTISI bu.
      console.table(
        SONUCLAR.map((s) => ({
          sayfa: s.sayfa,
          varlık: s.varlik,
          blok: s.blokSayisi,
          'çıpa (KB)': +(s.cipaBoyutu / 1024).toFixed(1),
          'varlık payı (%)': +s.varlikPayiYuzde.toFixed(1),
          'ESKİ halka (MB)': +(s.eskiHalkaToplamDisk / 1024 / 1024).toFixed(1),
          'çıpa dosyaları (MB)': +(s.halkaDosyaToplami / 1024 / 1024).toFixed(1),
          'varlık deposu (MB)': +(s.varlikDepoBoyutu / 1024 / 1024).toFixed(1),
          'YENİ halka (MB)': +(s.halkaToplamDisk / 1024 / 1024).toFixed(1),
          kazanç: `${(s.eskiHalkaToplamDisk / s.halkaToplamDisk).toFixed(1)}x`,
        })),
      );
    },
    300_000,
  );

  /**
   * TEMSİLİ PROJE (kullanıcının rapor sorusu): 50 sayfa + 20 varlık.
   * Matristeki (10/50) noktaları arasında kalan tek özel ölçüm — ayrıca
   * GERÇEK diske yazılıyor, ekstrapolasyon DEĞİL.
   */
  it(
    'temsili proje — 50 sayfa + 20 varlık, gerçek halka diski',
    () => {
      const { doc: bazDoc } = belgeOlustur(50, 0);
      const bazBoyut = Y.encodeStateAsUpdate(bazDoc).length;
      const temsili = hucreyiOlc(50, 20, bazBoyut);

      // eslint-disable-next-line no-console -- ölçüm testinin ÇIKTISI bu.
      console.log(
        `\ntemsili proje (50 sayfa + 20 varlık): çıpa ${(temsili.cipaBoyutu / 1024 / 1024).toFixed(2)}MB, ` +
        `varlık payı %${temsili.varlikPayiYuzde.toFixed(1)}\n` +
        `  ESKİ halka (varlıklar gömülü): ${(temsili.eskiHalkaToplamDisk / 1024 / 1024).toFixed(1)}MB\n` +
        `  YENİ halka: ${(temsili.halkaToplamDisk / 1024 / 1024).toFixed(1)}MB ` +
        `(çıpa dosyaları ${(temsili.halkaDosyaToplami / 1024 / 1024).toFixed(1)}MB + ` +
        `varlık deposu ${(temsili.varlikDepoBoyutu / 1024 / 1024).toFixed(1)}MB) ` +
        `-> ${(temsili.eskiHalkaToplamDisk / temsili.halkaToplamDisk).toFixed(1)}x kazanç\n` +
        `  varlıksız halka (alt sınır): ${(bazBoyut * HALKA_SAYISI / 1024 / 1024).toFixed(1)}MB\n`,
      );

      const CIKTI = path.resolve(__dirname, '../../../test-results/agir');
      fs.mkdirSync(CIKTI, { recursive: true });
      fs.writeFileSync(
        path.join(CIKTI, 'cipa-boyutu-temsili.json'),
        JSON.stringify(
          {
            halkaSayisi: HALKA_SAYISI,
            temsili,
            varliksizHalkaToplam: bazBoyut * HALKA_SAYISI,
            kazancKat: temsili.eskiHalkaToplamDisk / temsili.halkaToplamDisk,
          },
          null,
          2,
        ),
      );

      expect(temsili.varlikPayiYuzde).toBeGreaterThan(50); // hipotez: varlıklar İSKELETİN katbekat üstünde.
      /* Çıpa dosyaları artık varlıksız halkanın (alt sınır) yanında: fark
         yalnız indeks + silme kaydı. */
      expect(temsili.halkaDosyaToplami).toBeLessThan(bazBoyut * HALKA_SAYISI * 1.2);
      /* KAZANÇ ORANI — sabit MB değil: 20 varlık, 66 nokta, en az 10 kat. */
      expect(temsili.eskiHalkaToplamDisk / temsili.halkaToplamDisk).toBeGreaterThan(10);
    },
    120_000,
  );
});
