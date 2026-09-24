import JSZip from 'jszip';
import type { ScriptBlock } from '../model/script';
import type { FormatProfili } from '../format/profil';
import type { PdfYaziTipleri } from '../disa/pdf';
import { pdfPaketiKur } from '../disa/paket';
import { docxYaz } from '../disa/docx';
import { safeFileName } from '../model/project-io';
import { t } from '../dil/arayuz';
import type { FonSablonu } from './sablon';
import type { FonBolumDurumu, FonDenetimi } from './denetle';

/**
 * FON BAŞVURU PAKETİ — her ek ayrı dosya, hepsi tek ZIP'te.
 *
 * ## Neden tek ZIP, klasör değil
 *
 * Kullanıcının istediği "her ek ayrı dosya" ZIP açıldığında tam olarak
 * odur. Klasör seçici yolu yeni bir IPC, N ayrı dosya yazımı, üzerine
 * yazma çakışması ve kısmi başarısızlıkta YARIM bir klasör demekti —
 * üstelik web kabuğunda hiç çalışmazdı. ZIP atomik: ya hep ya hiç.
 *
 * ## Neden yeni bir PDF/DOCX yazıcısı YOK
 *
 * Fon dosyası ayrı bir DOKÜMAN TİPİ olduğu için mevcut yazıcılar onu
 * zaten çizebiliyor: `pdfPaketiKur` bölümün bloklarını alıp sayfa sayısıyla
 * birlikte PDF döndürüyor, `docxYaz` aynı blokları Word'e çeviriyor. Ayrı
 * bir "fon çizici" yazmak, aynı ölçüleri ikinci kez tanımlamak ve sayfa
 * sayısının ıraksadığı bir katman daha eklemek olurdu (Karar 34).
 *
 * ## RAPOR.txt neden ARAYÜZ dilinde
 *
 * Ekler kuruma gidiyor ve belge dilini konuşuyor; rapor KULLANICIYA
 * yazılmış bir kontrol notudur ve pakete "ne eksik, neye dikkat" demek
 * için giriyor. Onu okuyan kişi Auteur'ü hangi dilde kurduysa o dili
 * konuşur. Döküm başlıkları için verilen kararın simetriği.
 */

export interface FonPaketSecenekleri {
  sablon: FonSablonu;
  denetim: FonDenetimi;
  profil: FormatProfili;
  yaziTipleri: PdfYaziTipleri;
  /** Filmin ÖZGÜN adı — Eurimages her belgenin içinde geçmesini istiyor. */
  baslik: string;
  yazar?: string;
}

export interface FonPaketi {
  zip: Uint8Array;
  /** Pakete giren dosya adları, sırayla. */
  dosyalar: string[];
  /** `RAPOR.txt`in metni — arayüz aynısını gösterebilsin diye dışa açık. */
  rapor: string;
}

/** `01`, `02`… — şablon sırası dosya sisteminde de korunsun. */
const onek = (i: number) => String(i + 1).padStart(2, '0');

/**
 * Bölümün bloklarını dosyaya hazırlar.
 *
 * `baslikHerBelgede` istendiğinde filmin özgün adı bölümün EN BAŞINA bir
 * paragraf olarak konuyor. Kurumun kuralı bu ("The original title of the
 * film must be indicated in each document") ve eksikliği başvuruyu
 * düşürebiliyor; üstbilgi olarak basmak DOCX ile PDF arasında iki ayrı
 * mekanizma gerektirirdi.
 */
function belgeBloklari(
  durum: FonBolumDurumu,
  sablon: FonSablonu,
  baslik: string,
): ScriptBlock[] {
  if (!sablon.teslim.baslikHerBelgede || !baslik.trim()) return durum.bloklar;
  const ilk = durum.bloklar[0];
  return [
    {
      id: `${ilk?.id ?? durum.bolum.id}-baslik`,
      fp: 'fon-baslik',
      type: 'paragraf',
      text: baslik.trim(),
      scene: '',
      sceneId: '',
    },
    ...durum.bloklar,
  ];
}

function raporYaz(
  sablon: FonSablonu,
  denetim: FonDenetimi,
  dosyalar: string[],
  boyutAsanlar: string[],
): string {
  const s: string[] = [];
  s.push(`${sablon.ad} — ${sablon.kurum}`);
  s.push(`${t('sürüm')}: ${sablon.surum} · ${t('kaynak')}: ${sablon.kaynak.url} (${sablon.kaynak.erisim})`);
  s.push(`${t('Başvuru kanalı')}: ${sablon.basvuruKanali}`);
  s.push('');
  s.push(t('Kurumun ek listesi yıllık değişiyor. Başvurudan önce güncel listeyi kurumdan doğrula.'));
  s.push('');

  s.push(`— ${t('Teslim kuralları')} —`);
  s.push(`${t('Kabul edilen biçimler')}: ${sablon.teslim.bicim.join(', ')}`);
  if (sablon.teslim.azamiBayt !== null) {
    s.push(`${t('Dosya başına azami boyut')}: ${Math.round(sablon.teslim.azamiBayt / (1024 * 1024))} MB`);
  }
  if (sablon.teslim.baslikHerBelgede) s.push(t('Filmin özgün adı her belgenin içinde geçmeli.'));
  if (sablon.teslim.dosyaAdiIcerikAtifli) s.push(t('Dosya adları içeriğine atıfta bulunmalı.'));
  if (sablon.teslim.eksikEkElenmeSebebi) s.push(t('Eksik ek başvuruyu doğrudan eler.'));
  s.push('');

  s.push(`— ${t('Pakete giren dosyalar')} —`);
  for (const d of dosyalar) s.push(d);
  s.push('');

  if (denetim.eksikler.length) {
    s.push(`— ${t('EKSİK — zorunlu ama boş')} —`);
    for (const d of denetim.eksikler) {
      s.push(d.belgede
        ? `${d.ornek.ad}: ${t('gövdesi boş')}`
        : `${d.ornek.ad}: ${t('belgede bulunamadı (başlığı değiştirilmiş olabilir)')}`);
    }
    s.push('');
  }

  if (denetim.asanlar.length) {
    s.push(`— ${t('SINIR AŞIMI')} —`);
    for (const d of denetim.asanlar) {
      const sinir = d.bolum.sinir!;
      const olculen = sinir.birim === 'sayfa' ? d.sayfa : d.kelime;
      s.push(`${d.ornek.ad}: ${olculen} / ${sinir.azami} ${sinir.birim}`);
    }
    /* Sayfa ÖLÇÜMÜNÜN KAYNAĞI yazılıyor: DOCX'i Word sayfalıyor, biz değil.
       Hangi sayıya bakıldığı belirsiz kalırsa kullanıcı iki farklı sayı
       görüp hangisinin geçerli olduğunu bilemez. */
    s.push(t('Sayfa ölçümü PDF üzerinden yapılmıştır; DOCX sayfalamayı Word yapar.'));
    s.push('');
  }

  if (boyutAsanlar.length) {
    s.push(`— ${t('BOYUT AŞIMI')} —`);
    for (const d of boyutAsanlar) s.push(d);
    s.push('');
  }

  if (denetim.harici.length) {
    s.push(`— ${t('Dışarıdan alınacak ekler (Auteur üretmez)')} —`);
    for (const b of denetim.harici) s.push(`${b.ad}${b.zorunlu ? '' : ` (${t('varsa')})`}`);
    s.push('');
  }
  return s.join('\n');
}

/**
 * Paketi kurar.
 *
 * Sınırı aşan bölüm YİNE ÜRETİLİYOR: kullanıcının yazdığını reddetmek
 * kayıptır (kural 3). Aşım rapora ve arayüze yazılıyor — sessiz kalmıyor
 * ama karar kullanıcının.
 */
export async function fonPaketiKur(secenekler: FonPaketSecenekleri): Promise<FonPaketi> {
  const { sablon, denetim, profil, yaziTipleri, baslik, yazar } = secenekler;
  const zip = new JSZip();
  const dosyalar: string[] = [];
  const boyutAsanlar: string[] = [];

  let sira = 0;
  for (const durum of denetim.durumlar) {
    if (!durum.belgede || !durum.dolu) continue;
    const bloklar = belgeBloklari(durum, sablon, baslik);
    /* Bölümün kendi biçim şartı varsa O geçerli (SGM: "MS Word formatında
       hazırlanmalıdır"); yoksa kurumun ilk kabul ettiği biçim. */
    const bicim = durum.bolum.bicim ?? sablon.teslim.bicim[0];
    /* Dosya adı BÖLÜM ÖRNEĞİNİN adından: çok dilli ekte iki dosya aynı
       adı taşısaydı ikincisi birincisini ezerdi ve kuruma tek dil giderdi. */
    const ad = `${onek(sira)}-${safeFileName(durum.ornek.ad)}.${bicim === 'docx' ? 'docx' : 'pdf'}`;
    sira += 1;

    const bayt = bicim === 'docx'
      ? await docxYaz(bloklar, profil, { baslik, yazar })
      : (await pdfPaketiKur({
          kapsam: 'senaryo',
          profil,
          yaziTipleri,
          bloklar,
          kareler: [],
          baslik,
          yazar,
          dokumanTipi: 'fon-dosyasi',
        })).pdf;

    if (sablon.teslim.azamiBayt !== null && bayt.byteLength > sablon.teslim.azamiBayt) {
      boyutAsanlar.push(`${ad}: ${Math.round(bayt.byteLength / 1024)} KB`);
    }
    zip.file(ad, bayt);
    dosyalar.push(ad);
  }

  const rapor = raporYaz(sablon, denetim, dosyalar, boyutAsanlar);
  /* RAPOR EN SONA YAZILIYOR ama dosya listesinde EN ÜSTTE görünmesi
     gerekmiyor: ZIP'te sıra alfabetik okunuyor ve "RAPOR" zaten büyük
     harfle başlıyor. */
  zip.file('RAPOR.txt', rapor);

  const cikti = await zip.generateAsync({ type: 'uint8array' });
  return { zip: cikti, dosyalar, rapor };
}
