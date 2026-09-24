import * as Y from 'yjs';
import type { ScriptBlock } from '../model/script';
import type { Project, ProjectMeta } from '../model/types';
import type { DokumanTipi } from '../model/dokuman-tipi';
import type { FormatProfili, DilAdi } from '../format/profil';
import type { BaslikSayfasi } from '../disa/baslik-sayfasi';
import type { BreakdownEki } from '../model/breakdown';
import type { Karakter } from '../model/karakter';
import type { Lokasyon } from '../model/lokasyon';
import type { ZamanKatmani } from '../model/zaman-katmani';
import { senaryoyuCozumle } from '../model/analiz';
import { yapiIstatistigiCikar } from '../model/yapi';
import { karakterSatirlari } from '../model/karakter';
import { lokasyonSatirlari } from '../model/lokasyon';
import {
  loadProjectIntoDoc,
  readScript,
  readBaslikSayfasi,
  breakdownMap,
  karakterlerMap,
  lokasyonlarMap,
} from '../doc/schema';
import type { TuretmeGirdisi } from './turet';

/**
 * TÜRETME GİRDİSİNİN TEK KURULUM YERİ.
 *
 * Girdi iki ayrı yerden besleniyor: fon dosyası KURULURKEN açık senaryonun
 * store'undan, TAZELENİRKEN diskteki `.sbp` dosyasından. İkisi ayrı ayrı
 * yazılsaydı bir gün biri `breakdown`u geçirmeyi unuturdu ve tazeleme
 * belgeyi sessizce fakirleştirirdi — kullanıcı "güncelledim" deyip
 * bütçe sinyallerini kaybederdi.
 *
 * Bu yüzden çözümleme, istatistik ve satır çıkarma burada BİR KEZ yapılıyor;
 * iki çağıran yalnız ham parçaları veriyor.
 */

export interface GirdiParcalari {
  bloklar: readonly ScriptBlock[];
  meta: ProjectMeta;
  tip: DokumanTipi;
  profil: FormatProfili;
  /** BELGE dili — fon şablonunun dili, kullanıcı tercihi değil. */
  dil: DilAdi;
  baslikSayfasi: BaslikSayfasi;
  breakdown: Readonly<Record<string, BreakdownEki>>;
  karakterKayitlari: Readonly<Record<string, Karakter>>;
  lokasyonKayitlari: Readonly<Record<string, Lokasyon>>;
}

export function turetmeGirdisiKur(p: GirdiParcalari): TuretmeGirdisi {
  const katmanlar: Record<string, ZamanKatmani> = {};
  const hikayeSiralari: Record<string, number> = {};
  for (const [sceneId, ek] of Object.entries(p.breakdown)) {
    katmanlar[sceneId] = ek.zamanKatmani;
    if (ek.hikayeSirasi !== null) hikayeSiralari[sceneId] = ek.hikayeSirasi;
  }
  const bloklar = p.bloklar;
  return {
    bloklar,
    analiz: senaryoyuCozumle(bloklar, { dil: p.dil, katmanlar, hikayeSiralari }),
    yapi: yapiIstatistigiCikar(bloklar, p.tip, p.profil),
    tip: p.tip,
    baslikSayfasi: p.baslikSayfasi,
    meta: p.meta,
    breakdown: p.breakdown,
    karakterler: karakterSatirlari(p.karakterKayitlari, bloklar),
    lokasyonlar: lokasyonSatirlari(p.lokasyonKayitlari, bloklar, p.dil),
    dil: p.dil,
  };
}

/**
 * Diskten okunmuş bir senaryo projesinden girdi kurar.
 *
 * Sahne dökümü, karakter ve mekân kayıtları ile başlık sayfası `Project`
 * nesnesinin düz alanlarında DEĞİL, `project.belge` altındaki CRDT
 * köklerinde yaşıyor. Onları okumanın tek doğru yolu belgeyi bir `Y.Doc`a
 * yüklemek — store'un açılışta yaptığı işin aynısı. Elle "belge.breakdown'ı
 * oku" demek, şemanın ikinci bir okuyucusunu kurmak olurdu.
 *
 * Doc geçici: okunduktan sonra atılıyor, hiçbir yere bağlanmıyor.
 */
export function turetmeGirdisiDosyadan(
  proje: Project,
  tip: DokumanTipi,
  profil: FormatProfili,
  dil: DilAdi,
): TuretmeGirdisi {
  const doc = new Y.Doc();
  try {
    loadProjectIntoDoc(doc, proje, 'load');
    return turetmeGirdisiKur({
      bloklar: readScript(doc).blocks,
      meta: proje.meta,
      tip,
      profil,
      dil,
      baslikSayfasi: readBaslikSayfasi(doc),
      breakdown: breakdownMap(doc).toJSON() as Record<string, BreakdownEki>,
      karakterKayitlari: karakterlerMap(doc).toJSON() as Record<string, Karakter>,
      lokasyonKayitlari: lokasyonlarMap(doc).toJSON() as Record<string, Lokasyon>,
    });
  } finally {
    doc.destroy();
  }
}
