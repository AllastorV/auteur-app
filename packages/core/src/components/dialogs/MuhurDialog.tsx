import React, { useCallback, useEffect, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { useCollabStore } from '../../store/collab';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { downloadBlob } from '../../util/indir';
import { safeFileName } from '../../model/project-io';
import { kanonikMetin, muhurle, damgala } from '../../kanit/muhur';
import { kanitPaketiKur } from '../../kanit/paket';
import { VARSAYILAN_TSA } from '../../kanit/rfc3161';
import { halka, ozetHex, zinciriDogrula, type ZincirDurumu, type ZincirKaydi } from '../../veri/zincir';

/**
 * MÜHÜR — "bu metin şu tarihte bendeydi".
 *
 * ## Ekranın taşımak zorunda olduğu ayrım
 *
 * Yerel zincir metnin bu SIRAYLA var olduğunu kanıtlar; TARİHİ kanıtlamaz —
 * saat bu makinenin. Tarihi ancak bağımsız bir otoritenin zaman damgası
 * kanıtlar. Bu cümle ekranda AÇIKÇA yazıyor: kullanıcı elindekinin ne
 * olduğunu bilmeden mahkemeye gitmemeli.
 *
 * ## Neden Modal, tam ekran panel değil
 *
 * Veri az: mühür listesi, bütünlük rozeti, üç eylem. Ayarlar ve Yardım tam
 * ekran çünkü çok bölümlü ve uzun; burası "yap ve dön" işi.
 */

function tarihYaz(ms: number): string {
  const d = new Date(ms);
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

export function MuhurDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const tsaUrl = useUiStore((s) => s.tsaUrl);
  const proje = useProjectStore((s) => s.project);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const { profil } = useSenaryoProfili();

  const [kayitlar, setKayitlar] = useState<ZincirKaydi[]>([]);
  const [durum, setDurum] = useState<ZincirDurumu>('tam');
  const [saglam, setSaglam] = useState<boolean | null>(null);
  const [damgali, setDamgali] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const kabuk = platform.kanit;

  const tazele = useCallback(async () => {
    if (!kabuk) return;
    const okuma = await kabuk.oku(proje.meta.id);
    /* Bütünlük ve rozetler ÖNCE hesaplanıp durum TEK seferde yazılıyor:
       aralara serpiştirilmiş `set*` çağrıları ekranı üç ayrı ara durumdan
       geçirirdi — bir an "sağlam ama damgasız", sonra "damgalı". Kısa
       süren yanlış bir ekran da yanlış ekrandır. */
    const [dogrulama, damgaliOlanlar] = await Promise.all([
      zinciriDogrula(okuma.kayitlar),
      damgaliMuhurler(okuma.kayitlar),
    ]);
    setKayitlar(okuma.kayitlar);
    setDurum(okuma.durum);
    setSaglam(dogrulama.saglam);
    setDamgali(damgaliOlanlar);
  }, [kabuk, proje.meta.id]);

  useEffect(() => { void tazele(); }, [tazele]);

  /* WEB KABUĞUNDA YOK ve bu SÖYLENİYOR (§15.4). Sessizce boş bir liste
     göstermek, kullanıcıya "hiç mühür almamışsın" dedirtirdi. */
  if (!kabuk) {
    return (
      <Modal title={t('Mühür')} onClose={onClose} width={520}>
        <p data-testid="muhur-yok" className="text-[13px] leading-snug text-metin-govde">
          {t('Mühür zinciri bu kabukta yok: tarayıcıda kalıcı bir kanıt dosyası tutulamıyor ve zaman damgası sunucularına doğrudan bağlanılamıyor. Masaüstü sürümünde kullanılabilir.')}
        </p>
      </Modal>
    );
  }

  async function muhurleSimdi() {
    setBusy(true);
    try {
      await muhurle(kabuk!, {
        projeId: proje.meta.id,
        metin: kanonikMetin(bloklar ?? [], profil),
        yazar: useCollabStore.getState().userName,
        etiket: t('elle mühürlendi'),
        tetikleyici: 'elle',
      });
      await tazele();
      showToast(t('Mühür alındı.'), 'success');
    } catch (err) {
      showToast(`${t('Mühür alınamadı')}: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function damgalaSimdi(muhur: ZincirKaydi) {
    setBusy(true);
    try {
      await damgala(kabuk!, proje.meta.id, muhur, { url: tsaUrl || VARSAYILAN_TSA });
      await tazele();
      showToast(t('Zaman damgası alındı.'), 'success');
    } catch (err) {
      showToast(`${t('Zaman damgası alınamadı')}: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function paketiVer() {
    setBusy(true);
    try {
      const paket = await kanitPaketiKur({
        kabuk: kabuk!, projeId: proje.meta.id, projeAdi: proje.meta.name, kayitlar,
      });
      const ad = `kanit-${safeFileName(proje.meta.name)}.zip`;
      if (platform.dosyaKaydet) {
        const res = await platform.dosyaKaydet({
          bytes: paket.zip, dosyaAdi: ad, turAdi: t('Kanıt paketi'), uzantilar: ['zip'],
        });
        if (res.cancelled) showToast(t('Dışa aktarma iptal edildi.'), 'info');
        else if (res.path) showToast(tf('Kaydedildi: %s', res.path), 'success');
      } else {
        downloadBlob(new Blob([paket.zip as BlobPart], { type: 'application/zip' }), ad);
        showToast(tf('%s indirildi.', ad), 'success');
      }
    } catch (err) {
      showToast(`${t('Kanıt paketi üretilemedi')}: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  const muhurler = kayitlar
    .map((k, i) => ({ k, i }))
    .filter((x) => x.k.tur === 'muhur')
    .reverse();

  return (
    <Modal
      title={t('Mühür')}
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>{t('Kapat')}</Button>
          <Button data-testid="muhur-paket" disabled={busy || !kayitlar.length} onClick={() => void paketiVer()}>
            {t('Kanıt paketi kaydet')}
          </Button>
          <Button variant="primary" data-testid="muhur-al" disabled={busy} onClick={() => void muhurleSimdi()}>
            {t('Mühürle')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* NE KANITLAR / NE KANITLAMAZ — ekranın en önemli iki cümlesi. */}
        <p data-testid="muhur-vaat" className="border-l border-amber-kenar pl-2.5 text-[11px] leading-snug text-metin-ikincil">
          {t('Yerel zincir bu metnin bu sırayla var olduğunu kanıtlar; tarihi kanıtlamaz — saat bu makinenindir.')}
          <br />
          {t('Zaman damgası, bağımsız bir otoritenin bu özetin belirtilen tarihten önce var olduğunu imzalamasıdır.')}
        </p>

        <div className="flex items-center gap-2">
          <span className="mzn-etiket">{t('Zincir')}</span>
          <span
            data-testid="muhur-butunluk"
            className={
              'border px-1.5 py-0.5 text-[10px] '
              + (saglam === false || durum !== 'tam'
                ? 'border-[#5c2b28] bg-[#2a1817] text-[#d98078]'
                : 'border-kenar-denetim bg-denetim text-kayitli')
            }
          >
            {durum !== 'tam'
              ? t('dosya bozuk')
              : saglam === false ? t('bağ kopuk') : t('sağlam')}
          </span>
          <span className="mzn-sayi text-[11px] text-metin-etiket">
            {kayitlar.length} {t('kayıt')}
          </span>
        </div>

        <ul data-testid="muhur-listesi" className="flex max-h-[320px] flex-col overflow-y-auto">
          {muhurler.length === 0 && (
            <li data-testid="muhur-bos" className="py-2 text-[12px] text-metin-etiket">
              {t('Henüz mühür yok. "Mühürle" bu andaki metni zincire işler.')}
            </li>
          )}
          {muhurler.map(({ k, i }) => (
            <li
              key={`${k.zaman}-${i}`}
              data-testid={`muhur-${k.zaman}`}
              className="flex items-center gap-2 border-b border-kenar-ic py-1.5 text-[12px] text-metin-govde last:border-b-0"
            >
              <span className="mzn-sayi shrink-0 text-[11px] text-metin-ikincil">{tarihYaz(k.zaman)}</span>
              <span className="flex-1 truncate leading-snug">{k.etiket || t('etiketsiz')}</span>
              {k.yazar && <span className="shrink-0 text-[10px] text-metin-etiket">{k.yazar}</span>}
              {damgali.has(i) ? (
                <span
                  data-testid={`muhur-damgali-${k.zaman}`}
                  className="shrink-0 border border-kenar-denetim bg-denetim px-1.5 py-0.5 text-[10px] text-kayitli"
                >
                  {t('damgalı')}
                </span>
              ) : (
                <button
                  type="button"
                  data-testid={`muhur-damgala-${k.zaman}`}
                  disabled={busy}
                  onClick={() => void damgalaSimdi(k)}
                  className="mzn-denetim shrink-0 px-2 py-0.5 text-[10px] disabled:opacity-40"
                >
                  {t('damga al')}
                </button>
              )}
            </li>
          ))}
        </ul>

        <label className="flex flex-col gap-1.5">
          <span className="mzn-etiket">{t('Zaman damgası sunucusu')}</span>
          <input
            data-testid="muhur-tsa"
            value={tsaUrl}
            placeholder={VARSAYILAN_TSA}
            onChange={(e) => useUiStore.setState({ tsaUrl: e.target.value })}
            className="border border-kenar-denetim bg-denetim px-2.5 py-2 text-[13px] text-metin-guclu outline-none placeholder:text-metin-cok-zayif focus:border-amber"
          />
          {/* Damga DIŞARI çıkan tek şey ve bu söyleniyor: kullanıcı hangi
              anda ağa bağlandığını bilmeli. */}
          <span className="text-[10px] leading-snug text-metin-etiket">
            {t('Yalnız "damga al" dediğinde bu adrese bağlanılır ve gönderilen şey metnin özetidir, metnin kendisi değil.')}
          </span>
        </label>
      </div>
    </Modal>
  );
}

/**
 * Hangi mühürlerin damgası var — HALKA HESABIYLA, yaklaşımla değil.
 *
 * `damgala()` damga kaydının `icerikOzeti` alanına dayandığı mührün
 * HALKASINI yazıyor. Rozet de tam o bağı okuyor: her mührün halkası bir kez
 * hesaplanıp onaltılık anahtarla eşleniyor, damga kaydı kendi özetiyle o
 * tabloda aranıyor.
 *
 * Önceki sürüm "damga, kendinden önceki en yakın mühre aittir" diye
 * varsayıyordu. Kullanıcı eski bir mührü sonradan damgaladığında (ekran
 * bunu açıkça sunuyor: her satırda kendi "damga al" düğmesi var) rozet
 * yanlış satıra düşüyordu — yani ekran, kullanıcının az önce yaptığı işi
 * başka bir mühre yazıyordu.
 */
async function damgaliMuhurler(kayitlar: readonly ZincirKaydi[]): Promise<ReadonlySet<number>> {
  const halkalar = new Map<string, number>();
  for (let i = 0; i < kayitlar.length; i++) {
    if (kayitlar[i].tur === 'muhur') halkalar.set(ozetHex(await halka(kayitlar[i])), i);
  }
  const damgali = new Set<number>();
  for (const k of kayitlar) {
    if (k.tur !== 'damga') continue;
    const i = halkalar.get(ozetHex(k.icerikOzeti));
    if (i !== undefined) damgali.add(i);
  }
  return damgali;
}
