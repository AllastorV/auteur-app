import { describe, expect, it } from 'vitest';
import { damgala, kanonikMetin, kayitSonrasiMuhurle, muhurle } from '@storyboard/core/kanit/muhur';
import {
  halka,
  ozetEsit,
  sifirHalka,
  zinciriDogrula,
  type ZincirDurumu,
  type ZincirKaydi,
} from '@storyboard/core/veri/zincir';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { KanitKabugu } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * MÜHÜRLEME — zincire kayıt düşmenin tek yolu.
 *
 * Kabuk SAHTE ama davranışı gerçeğin sözleşmesini taşıyor: ekleme,
 * metin saklama ve hata FIRLATMA. Yutulan bir hata bu testlerin en
 * önemlisini anlamsızlaştırırdı.
 */

function sahteKabuk(bozuk = false): KanitKabugu & { kayitlar: ZincirKaydi[]; metinler: Uint8Array[] } {
  const kayitlar: ZincirKaydi[] = [];
  const metinler: Uint8Array[] = [];
  return {
    kayitlar,
    metinler,
    async muhurYaz(_p, kayit, metin) {
      if (bozuk) throw new Error('disk dolu');
      kayitlar.push(kayit);
      metinler.push(metin);
    },
    async damgaYaz(_p, kayit) { kayitlar.push(kayit); },
    async oku() { return { kayitlar: [...kayitlar], durum: 'tam' as ZincirDurumu }; },
    async muhurMetni(_p, zaman) {
      const i = kayitlar.findIndex((k) => k.zaman === zaman);
      return i < 0 ? null : metinler[i];
    },
    async damgaJetonu() { return null; },
  };
}

const b = (tip: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b-${text}`, fp: text, type: tip, text, scene: '', sceneId: 'sc1' });

const BLOKLAR: ScriptBlock[] = [
  b('scene', 'iç. mutfak - gece'),
  b('action', 'Ayşe masaya oturur.'),
];

describe('kanonik metin', () => {
  /* Mühürlenen şey belgenin GÖRÜNEN metni: büyük harf kuralı profilden
     geliyor, tipten değil. İkinci bir "hash için serileştirme" yazılsaydı
     ekranla mühür ıraksardı. */
  it('profilin büyük harf kuralını uyguluyor', () => {
    const profil = tipProfili(DOKUMAN_TIPLERI.senaryo.id, 'a4', 'tr');
    expect(kanonikMetin(BLOKLAR, profil)).toContain('İÇ. MUTFAK - GECE');
  });
});

describe('mühürleme', () => {
  const girdi = {
    projeId: 'p1', metin: 'metin', yazar: 'Alp Cavas', etiket: 'ilk',
    tetikleyici: 'elle' as const, simdi: () => 1_700_000_000_000,
  };

  it('ilk mührün bağı sıfır halka', async () => {
    const kabuk = sahteKabuk();
    const k = await muhurle(kabuk, girdi);
    expect(ozetEsit(k.oncekiHalka, sifirHalka())).toBe(true);
    expect(k.icerikBayt).toBe(new TextEncoder().encode('metin').length);
    expect(kabuk.kayitlar).toHaveLength(1);
  });

  /* Son halka DOSYADAN okunuyor, bellekte tutulan bir sayaçtan değil:
     iki pencere aynı projeyi açtıysa bellekteki sayaç yalan söylerdi. */
  it('ikinci mühür birincinin halkasına bağlanıyor', async () => {
    const kabuk = sahteKabuk();
    const bir = await muhurle(kabuk, girdi);
    const iki = await muhurle(kabuk, { ...girdi, simdi: () => 1_700_000_060_000, etiket: 'ikinci' });
    expect(ozetEsit(iki.oncekiHalka, await halka(bir))).toBe(true);
    expect((await zinciriDogrula(kabuk.kayitlar)).saglam).toBe(true);
  });

  it('mühürlenen metin kabuğa aynen veriliyor', async () => {
    const kabuk = sahteKabuk();
    await muhurle(kabuk, { ...girdi, metin: 'İÇ. MUTFAK\nAyşe.' });
    expect(new TextDecoder().decode(kabuk.metinler[0])).toBe('İÇ. MUTFAK\nAyşe.');
  });

  /* HİÇBİR HATA YUTULMUYOR. Yazarlık yolu yutuyor ve o doğru (kaybolan bir
     attribution kaydı); kanıt yolu onun tersi — "mühürlendi" dedikten sonra
     sessizce kaybolan bir kayıt hiç mühür olmamasından kötüdür. */
  it('kabuk fırlatırsa mühür de fırlatıyor', async () => {
    await expect(muhurle(sahteKabuk(true), girdi)).rejects.toThrow('disk dolu');
  });
});

describe('kayıttan sonra otomatik mühür', () => {
  it('tetikleyici sürüm olarak yazılıyor', async () => {
    const kabuk = sahteKabuk();
    const k = await kayitSonrasiMuhurle(kabuk, {
      projeId: 'p1', metin: 'm', yazar: 'A', etiket: '/yol/proje.sbp',
      simdi: () => 1_700_000_000_000,
    });
    expect(k!.tetikleyici).toBe('surum');
    expect(k!.etiket).toBe('/yol/proje.sbp');
  });

  /* Web kabuğunda `kanit` `null`: bu bir HATA DEĞİL, olmayan bir yetenek.
     Fırlatsaydı her kayıt kullanıcıya kırmızı bir bildirim gösterirdi. */
  it('kabuk yoksa sessizce atlanıyor', async () => {
    await expect(kayitSonrasiMuhurle(null, {
      projeId: 'p1', metin: 'm', yazar: 'A', etiket: '',
    })).resolves.toBeNull();
  });

  /* Otomatik mühürde TSA ÇAĞRILMIYOR: kullanıcının haberi olmadan dış bir
     sunucuya belge özeti göndermek kabul edilemez. Kabukta damga yazımı
     hiç tetiklenmemeli. */
  it('otomatik mühür damga kaydı düşürmüyor', async () => {
    const kabuk = sahteKabuk();
    await kayitSonrasiMuhurle(kabuk, { projeId: 'p1', metin: 'm', yazar: 'A', etiket: '' });
    expect(kabuk.kayitlar.every((k) => k.tur === 'muhur')).toBe(true);
  });
});

describe('damgalama', () => {
  const girdi = {
    projeId: 'p1', metin: 'metin', yazar: 'Alp Cavas', etiket: 'ilk',
    tetikleyici: 'elle' as const, simdi: () => 1_700_000_000_000,
  };
  const bayt = (h: string) => new Uint8Array(h.match(/../gu)!.map((x) => parseInt(x, 16)));
  const granted = (async () =>
    new Response(bayt('30053003020100') as BodyInit, { status: 200 })) as unknown as typeof fetch;
  const reddedildi = (async () =>
    new Response(bayt('30053003020102') as BodyInit, { status: 200 })) as unknown as typeof fetch;

  /* Damgalanan şey metnin özeti DEĞİL mührün HALKASI: halka kaydın bütün
     alanlarını kapsıyor. Metnin özeti damgalansaydı, aynı metni ikinci kez
     mühürleyen biri o damgayı kendi kaydına iliştirebilirdi. */
  it('damga mührün halkasına dayanıyor ve zincir doğrulanıyor', async () => {
    const kabuk = sahteKabuk();
    const m = await muhurle(kabuk, girdi);
    const d = await damgala(kabuk, 'p1', m, {
      getirici: granted, nonce: new Uint8Array([1]), simdi: () => 1_700_000_001_000,
    });
    expect(d.tur).toBe('damga');
    expect(ozetEsit(d.icerikOzeti, await halka(m))).toBe(true);
    expect(d.etiket).toContain('freetsa');
    expect((await zinciriDogrula(kabuk.kayitlar)).saglam).toBe(true);
  });

  /* Damga alınamadıysa zincire kayıt DÜŞMÜYOR: "alındı" diye kaydetmek
     olmayan bir tanıklığı varmış gibi göstermek olurdu. */
  it('TSA reddederse zincire damga kaydı düşmüyor', async () => {
    const kabuk = sahteKabuk();
    const m = await muhurle(kabuk, girdi);
    await expect(damgala(kabuk, 'p1', m, { getirici: reddedildi, nonce: new Uint8Array([1]) }))
      .rejects.toThrow('PKIStatus 2');
    expect(kabuk.kayitlar).toHaveLength(1);
    expect(kabuk.kayitlar[0].tur).toBe('muhur');
  });
});
